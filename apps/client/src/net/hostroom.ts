/**
 * The host side of an online game: opens a room code, fills seats as friends join, then runs
 * the authoritative game. Remote players' decisions are waited on here; a CPU answers for a
 * player whose connection drops until they come back.
 */
import {
  PLAYER_COLORS,
  cloneState,
  cpuDecide,
  type CharLook,
  type DecisionRequest,
  type GameState,
  type SeatConfig,
} from '@aa/engine';
import type { OnlineSave, SaveInfo } from '../save';
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
      ...PLAYER_COLORS.slice(1).map(() => ({
        kind: 'open' as const,
        name: '',
        look: null,
        online: false,
        pid: -1,
      })),
    ];
    peer.on('connection', (conn) => this.accept(conn));
  }

  /** Open a room with a fresh code (retrying if the code is taken). */
  static async open(hostName: string, hostLook: CharLook, wanted?: string): Promise<HostRoom> {
    let lastErr: unknown;
    for (let i = 0; i < 6; i++) {
      // Try the wanted code first (reopening a saved game), then fresh ones.
      const code = i === 0 && wanted ? wanted : newRoomCode();
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

  /**
   * Reopen a saved online game: same room code if it is free, every seat as it was. Players
   * who played from other devices rejoin with the code (and the same name, or from the same
   * device); until then a CPU plays for them.
   */
  static async reopen(save: SaveInfo): Promise<HostRoom> {
    const online = save.online!;
    const G = cloneState(save.state);
    const host = online.seats.find((s) => s.kind === 'host');
    const hp = G.players[host?.pid ?? 0];
    const room = await HostRoom.open(hp.name, hp.ch, online.code);
    room.seats = G.players.map((p) => {
      const s = online.seats.find((x) => x.pid === p.id);
      const base = { name: p.name, look: p.ch, pid: p.id };
      if (p.cpu) return { ...base, kind: 'cpu' as const, online: false };
      if (!s || s.kind !== 'remote') return { ...base, kind: s?.kind ?? ('host' as const), online: true };
      return { ...base, kind: 'remote' as const, online: false, token: s.token };
    });
    room.settings = {
      boardName: G.boardName ?? '',
      rules: G.rules,
      target: G.target,
      roundCap: G.roundCap,
      fill: true,
    };
    room.started = true;
    room.G = G;
    room.snap = { state: cloneState(G), seq: 0, answers: [], you: [] };
    return room;
  }

  /** The game a reopened room continues. */
  get game(): GameState | null {
    return this.G;
  }

  /** What to keep in the save so the game can be reopened online. */
  saveInfo(): OnlineSave {
    return {
      code: this.code,
      seats: this.seats
        .filter((s) => s.pid >= 0 && (s.kind === 'host' || s.kind === 'local' || s.kind === 'remote'))
        .map((s) => ({
          pid: s.pid,
          kind: s.kind as 'host' | 'local' | 'remote',
          name: s.name,
          token: s.token,
        })),
    };
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
    // Same device (token), or once the game is running, a disconnected seat with the same name
    // (for someone who comes back on another browser or device).
    const sameName = (s: Seat) =>
      this.started &&
      !s.online &&
      s.name.toLowerCase() ===
        String(msg.name ?? '')
          .trim()
          .toLowerCase();
    const back =
      this.seats.find((s) => s.kind === 'remote' && s.token === msg.token) ??
      this.seats.find((s) => s.kind === 'remote' && sameName(s));
    if (back) {
      if (back.conn && back.conn !== conn) back.conn.close();
      back.conn = conn;
      back.online = true;
      back.token = msg.token;
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
      reply({
        t: 'reject',
        reason:
          'This game has already started. To take your seat back, join with the same name you used before.',
      });
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
