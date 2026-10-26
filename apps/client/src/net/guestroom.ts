/**
 * The joining side of an online game: connects to a host's room code, shows its lobby, then
 * plays a copy of the game in step with the host. If the connection drops it keeps trying to
 * get back in, and the host sends the current turn to replay from.
 */
import type { CharLook, DecisionRequest, GameState } from '@aa/engine';
import type { GameLink } from './link';
import { connectTo, openPeer, peerErrorText, type DataConnection, type Peer } from './peer';
import {
  NET_VERSION,
  deviceToken,
  roomPeerId,
  stateHash,
  turnKey,
  type Answer,
  type LobbyInfo,
  type StartInfo,
  type ToGuest,
  type ToHost,
} from './protocol';

export interface GuestEvents {
  lobby(l: LobbyInfo): void;
  start(s: StartInfo): void;
  /** The room is gone or turned us away; `reason` is shown to the player. */
  closed(reason: string): void;
  /** Connection trouble: a message while reconnecting, null once back. */
  status(text: string | null): void;
  seat(pid: number, online: boolean): void;
}

export class GuestRoom implements GameLink {
  role = 'guest' as const;
  lobby: LobbyInfo | null = null;
  seat = -1;
  you: number[] = [];
  /** The latest game start from the host (kept so a screen that attaches late still sees it). */
  started: StartInfo | null = null;
  private token = deviceToken();
  private answers = new Map<number, Answer>();
  private waiters = new Map<number, (a: Answer) => void>();
  private latest = -1;
  private hostHashes = new Map<string, string>();
  private myHashes = new Map<string, string>();
  private leaving = false;
  private resyncs = 0;

  private constructor(
    public code: string,
    private peer: Peer,
    private conn: DataConnection,
    private name: string,
    private look: CharLook,
    public on: GuestEvents,
  ) {}

  /** Join a room. Resolves once the host has given us a seat. */
  static async join(code: string, name: string, look: CharLook, on: GuestEvents): Promise<GuestRoom> {
    let peer: Peer | null = null;
    try {
      peer = await openPeer();
      const conn = await connectTo(peer, roomPeerId(code));
      const room = new GuestRoom(code, peer, conn, name, look, on);
      await room.greet();
      return room;
    } catch (err) {
      peer?.destroy();
      throw new Error(err instanceof Error ? err.message : peerErrorText(err as { type?: string }));
    }
  }

  /** Say hello on the current connection and wait for a seat (or a refusal). */
  private greet(): Promise<void> {
    const conn = this.conn;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The host did not answer.')), 12000);
      let welcomed = false;
      conn.on('data', (raw) => {
        const msg = raw as ToGuest;
        if (!welcomed) {
          if (msg.t === 'welcome') {
            welcomed = true;
            clearTimeout(timer);
            this.seat = msg.seat;
            resolve();
          } else if (msg.t === 'reject') {
            clearTimeout(timer);
            this.leaving = true;
            reject(new Error(msg.reason));
            return;
          }
        }
        this.receive(msg);
      });
      conn.on('close', () => this.lost(conn));
      conn.on('error', () => this.lost(conn));
      this.send({ t: 'hello', v: NET_VERSION, token: this.token, name: this.name, look: this.look });
    });
  }

  private send(msg: ToHost) {
    if (this.conn.open) this.conn.send(msg);
  }

  private receive(msg: ToGuest) {
    switch (msg.t) {
      case 'lobby':
        this.lobby = msg.lobby;
        this.on.lobby(msg.lobby);
        break;
      case 'start':
        this.answers.clear();
        this.latest = msg.start.seq - 1;
        for (const a of msg.start.answers) this.take(a);
        this.you = msg.start.you;
        this.hostHashes.clear();
        this.myHashes.clear();
        this.started = msg.start;
        this.on.start(msg.start);
        break;
      case 'ans':
        this.take(msg.a);
        break;
      case 'hash':
        this.hostHashes.set(msg.key, msg.h);
        this.check(msg.key);
        break;
      case 'seat':
        this.on.seat(msg.pid, msg.online);
        break;
      case 'reject':
      case 'bye':
        this.leaving = true;
        this.on.closed(msg.reason);
        this.peer.destroy();
        break;
    }
  }

  private take(a: Answer) {
    this.answers.set(a.seq, a);
    this.latest = Math.max(this.latest, a.seq);
    const w = this.waiters.get(a.seq);
    if (w) {
      this.waiters.delete(a.seq);
      w(a);
    }
  }

  private async lost(conn: DataConnection) {
    if (this.leaving || conn !== this.conn) return;
    this.on.status('Connection lost. Reconnecting...');
    for (let i = 0; i < 40 && !this.leaving; i++) {
      await new Promise((r) => setTimeout(r, i ? 3000 : 800));
      if (this.leaving) return;
      try {
        if (this.peer.destroyed) this.peer = await openPeer();
        else if (this.peer.disconnected) this.peer.reconnect();
        this.conn = await connectTo(this.peer, roomPeerId(this.code), 8000);
        await this.greet();
        this.on.status(null);
        return;
      } catch {
        /* keep trying */
      }
    }
    if (!this.leaving) {
      this.leaving = true;
      this.on.closed('Lost the connection to the host.');
    }
  }

  // ------------------------------------------------------------ GameLink

  who(pid: number) {
    return this.you.includes(pid) ? ('local' as const) : ('remote' as const);
  }

  request(_seq: number, _req: DecisionRequest): Promise<unknown> {
    return new Promise(() => {});
  }

  publish() {}

  submit(seq: number, ans: unknown) {
    this.send({ t: 'answer', seq, ans });
  }

  answer(seq: number): Promise<Answer> {
    const a = this.answers.get(seq);
    if (a) {
      this.answers.delete(seq);
      return Promise.resolve(a);
    }
    return new Promise((resolve) =>
      this.waiters.set(seq, (got) => {
        this.answers.delete(seq);
        resolve(got);
      }),
    );
  }

  behind(seq: number) {
    return this.latest - seq > 2;
  }

  turnStart(seq: number, G: GameState) {
    const key = turnKey(seq, G);
    this.myHashes.set(key, stateHash(G));
    if (this.myHashes.size > 20) this.myHashes.delete(this.myHashes.keys().next().value!);
    this.check(key);
  }

  /** Compare this copy with the host's at a turn start; ask to replay the turn if they differ. */
  private check(key: string) {
    const mine = this.myHashes.get(key);
    const theirs = this.hostHashes.get(key);
    if (!mine || !theirs) return;
    this.myHashes.delete(key);
    this.hostHashes.delete(key);
    if (mine !== theirs && this.resyncs < 20) {
      this.resyncs++;
      console.warn('Out of step with the host; asking for the current turn.');
      this.send({ t: 'resync' });
    }
  }

  leave() {
    this.leaving = true;
    this.send({ t: 'bye' });
    setTimeout(() => this.peer.destroy(), 300);
  }
}
