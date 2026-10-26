/**
 * The host side of an online game: opens a room code, fills seats as friends join, then runs
 * the authoritative game. Remote players' decisions are waited on here; a CPU answers for a
 * player whose connection drops until they come back.
 */
import {
  cloneState,
  cpuDecide,
  type CharLook,
  type DecisionRequest,
  type GameState,
  type SeatConfig,
} from '@aa/engine';
import type { GameLink } from './link';
import { openPeer, peerErrorText, type DataConnection, type Peer } from './peer';
import {
  NET_VERSION,
  newRoomCode,
  roomPeerId,
  stateHash,
  turnKey,
  type Answer,
  type LobbyInfo,
  type LobbySeat,
  type StartInfo,
  type ToGuest,
  type ToHost,
} from './protocol';

interface Seat extends LobbySeat {
  token?: string;
  conn?: DataConnection;
  /** Player id once the game starts. */
  pid: number;
}

export interface LobbySettings {
  boardName: string;
  rules: LobbyInfo['rules'];
  target: number;
  roundCap: number;
  fill: boolean;
}

export class HostRoom implements GameLink {
  role = 'host' as const;
  seats: Seat[];
  started = false;
  private G: GameState | null = null;
  private settings: LobbySettings = { boardName: '', rules: 'standard', target: 0, roundCap: 0, fill: true };
  private snap: StartInfo | null = null;
  private pending = new Map<number, { pid: number; req: DecisionRequest; resolve: (a: unknown) => void }>();
  private early = new Map<number, { pid: number; ans: unknown }>();
  private listeners = new Set<() => void>();
  /** Called with a message for the host's screen (e.g. "Rosa disconnected"). */
  onNotice: (text: string) => void = () => {};

  private constructor(
    public code: string,
    private peer: Peer,
    hostName: string,
    hostLook: CharLook,
  ) {
    this.seats = [
      { kind: 'host', name: hostName, look: hostLook, online: true, pid: -1 },
      ...[1, 2, 3].map(() => ({ kind: 'open' as const, name: '', look: null, online: false, pid: -1 })),
    ];
    peer.on('connection', (conn) => this.accept(conn));
  }

  /** Open a room with a fresh code (retrying if the code is taken). */
  static async open(hostName: string, hostLook: CharLook): Promise<HostRoom> {
    let lastErr: unknown;
    for (let i = 0; i < 5; i++) {
      const code = newRoomCode();
      try {
        const peer = await openPeer(roomPeerId(code));
        return new HostRoom(code, peer, hostName, hostLook);
      } catch (err) {
        lastErr = err;
        if ((err as { type?: string }).type !== 'unavailable-id') break;
      }
    }
    throw new Error(peerErrorText(lastErr as { type?: string }));
  }

  onChange(f: () => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private changed() {
    this.broadcast({ t: 'lobby', lobby: this.lobby() });
    this.listeners.forEach((f) => f());
  }

  lobby(): LobbyInfo {
    return {
      ...this.settings,
      seats: this.seats.map(({ kind, name, look, online }) => ({ kind, name, look, online })),
    };
  }

  setSettings(s: LobbySettings) {
    this.settings = s;
    this.changed();
  }

  setHost(name: string, look: CharLook) {
    Object.assign(this.seats[0], { name, look });
    this.changed();
  }

  /** Remove a joined player from the lobby. */
  kick(i: number) {
    const s = this.seats[i];
    if (s.kind !== 'remote' || this.started) return;
    this.send(s, { t: 'reject', reason: 'The host removed you from the lobby.' });
    setTimeout(() => s.conn?.close(), 300);
    this.seats[i] = { kind: 'open', name: '', look: null, online: false, pid: -1 };
    this.changed();
  }

  get joined() {
    return this.seats.filter((s) => s.kind === 'remote').length;
  }

  // ------------------------------------------------------------ connections

  private accept(conn: DataConnection) {
    conn.on('data', (raw) => this.receive(conn, raw as ToHost));
    conn.on('close', () => this.dropped(conn));
    conn.on('error', () => this.dropped(conn));
  }

  private send(seat: Seat, msg: ToGuest) {
    if (seat.conn?.open) seat.conn.send(msg);
  }

  private broadcast(msg: ToGuest) {
    for (const s of this.seats) if (s.kind === 'remote' && s.online) this.send(s, msg);
  }

  private receive(conn: DataConnection, msg: ToHost) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') return this.hello(conn, msg);
    const seat = this.seats.find((s) => s.conn === conn);
    if (!seat) return;
    if (msg.t === 'answer' && typeof msg.seq === 'number') this.answered(seat, msg.seq, msg.ans);
    else if (msg.t === 'resync' && this.snap) this.send(seat, { t: 'start', start: this.startFor(seat) });
    else if (msg.t === 'bye') this.dropped(conn);
  }

  private hello(conn: DataConnection, msg: Extract<ToHost, { t: 'hello' }>) {
    const reply = (m: ToGuest) => conn.send(m);
    if (msg.v !== NET_VERSION) {
      reply({
        t: 'reject',
        reason: 'The host is on a different version of the game. Both of you should reload the page.',
      });
      return;
    }
    // A player coming back to their seat.
    const back = this.seats.find((s) => s.kind === 'remote' && s.token === msg.token);
    if (back) {
      if (back.conn && back.conn !== conn) back.conn.close();
      back.conn = conn;
      back.online = true;
      reply({ t: 'welcome', seat: this.seats.indexOf(back) });
      if (this.started) {
        reply({ t: 'start', start: this.startFor(back) });
        this.broadcast({ t: 'seat', pid: back.pid, online: true });
        this.onNotice(`${back.name} reconnected.`);
      }
      this.changed();
      return;
    }
    if (this.started) {
      reply({ t: 'reject', reason: 'This game has already started.' });
      return;
    }
    const i = this.seats.findIndex((s) => s.kind === 'open');
    if (i < 0) {
      reply({ t: 'reject', reason: 'This game is full.' });
      return;
    }
    const name = String(msg.name || 'Player')
      .replace(/[<>&"'`\\]/g, '')
      .trim()
      .slice(0, 12);
    this.seats[i] = {
      kind: 'remote',
      name: name || 'Player',
      look: msg.look,
      online: true,
      token: msg.token,
      conn,
      pid: -1,
    };
    reply({ t: 'welcome', seat: i });
    this.changed();
  }

  private dropped(conn: DataConnection) {
    const seat = this.seats.find((s) => s.conn === conn);
    if (!seat || !seat.online) return;
    seat.online = false;
    seat.conn = undefined;
    if (!this.started) {
      // Leaving the lobby frees the seat.
      this.seats[this.seats.indexOf(seat)] = { kind: 'open', name: '', look: null, online: false, pid: -1 };
    } else {
      this.onNotice(`${seat.name} disconnected. A CPU plays for them until they come back.`);
      this.broadcast({ t: 'seat', pid: seat.pid, online: false });
      // Anything they were deciding, a CPU decides now.
      for (const [seq, p] of this.pending)
        if (p.pid === seat.pid && this.G) {
          this.pending.delete(seq);
          p.resolve(cpuDecide(this.G, p.req));
        }
    }
    this.changed();
  }

  // ------------------------------------------------------------ starting

  /** The seats to start the game with (open seats become CPUs, or are dropped). */
  seatConfigs(cpuName: (i: number) => string, cpuLook: (i: number) => CharLook, fill: boolean): SeatConfig[] {
    const out: SeatConfig[] = [];
    this.seats.forEach((s, i) => {
      if (s.kind === 'open') {
        if (!fill) return;
        s.pid = out.length;
        out.push({ name: cpuName(i), cpu: true, ch: cpuLook(i) });
        return;
      }
      s.pid = out.length;
      out.push({ name: s.name, cpu: false, ch: s.look! });
    });
    return out;
  }

  /** Send the starting state to everyone. Call before the host's game starts running. */
  begin(G: GameState) {
    this.started = true;
    this.G = G;
    this.snap = { state: cloneState(G), seq: 0, answers: [], you: [] };
    for (const s of this.seats)
      if (s.kind === 'remote') this.send(s, { t: 'start', start: this.startFor(s) });
    this.listeners.forEach((f) => f());
  }

  private startFor(seat: Seat): StartInfo {
    return { ...this.snap!, you: [seat.pid] };
  }

  // ------------------------------------------------------------ GameLink

  who(pid: number) {
    const G = this.G!;
    if (G.players[pid].cpu) return 'cpu' as const;
    const seat = this.seats.find((s) => s.pid === pid);
    if (!seat || seat.kind === 'host' || seat.kind === 'local') return 'local' as const;
    return seat.online ? ('remote' as const) : ('cpu' as const);
  }

  request(seq: number, req: DecisionRequest): Promise<unknown> {
    return new Promise((resolve) => {
      const early = this.early.get(seq);
      if (early && early.pid === req.pid) {
        this.early.delete(seq);
        resolve(early.ans);
        return;
      }
      this.pending.set(seq, { pid: req.pid, req, resolve });
    });
  }

  private answered(seat: Seat, seq: number, ans: unknown) {
    const p = this.pending.get(seq);
    if (p) {
      if (p.pid !== seat.pid) return;
      this.pending.delete(seq);
      p.resolve(ans);
    } else if (this.snap && seq >= this.snap.seq) {
      // The guest got there before this device did.
      this.early.set(seq, { pid: seat.pid, ans });
    }
  }

  publish(a: Answer) {
    this.snap?.answers.push(a);
    this.broadcast({ t: 'ans', a });
  }

  submit() {}

  answer(): Promise<Answer> {
    return new Promise(() => {});
  }

  behind() {
    return false;
  }

  turnStart(seq: number, G: GameState) {
    this.snap = { state: cloneState(G), seq, answers: [], you: [] };
    this.broadcast({ t: 'hash', key: turnKey(seq, G), h: stateHash(G) });
  }

  leave() {
    this.broadcast({ t: 'bye', reason: 'The host ended the game.' });
    setTimeout(() => this.peer.destroy(), 300);
  }
}
