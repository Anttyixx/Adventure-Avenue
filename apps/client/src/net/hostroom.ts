/**
 * The host side of an online game: opens a room code, fills seats as friends join, then runs
 * the authoritative game. Remote players' decisions are waited on here; a CPU answers for a
 * player whose connection drops until they come back.
 */
import {
  PLAYER_COLORS,
  cloneState,
  cpuDecide,
  type CharId,
  type DecisionRequest,
  type GameState,
  type SeatConfig,
} from '@aa/engine';
import type { OnlineSave, SaveInfo } from '../save';
import { CHARACTERS, freeCharacter } from '../sprites';
import { cleanName } from '../profile';
import type { GameLink } from './link';
import { openPeer, peerErrorText, type DataConnection, type Peer } from './peer';
import {
  NET_VERSION,
  newRoomCode,
  roomPeerId,
  stateHash,
  turnKey,
  type Answer,
  type AuctionLive,
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

export type LobbySettings = Omit<LobbyInfo, 'seats'>;

/** A player on the host's device (or a bot), for `configure`. */
export interface LocalSeat {
  name: string;
  look: CharId;
  ready?: boolean;
}

const MAX_SEATS = PLAYER_COLORS.length;

const cleanSeatName = cleanName;

export class HostRoom implements GameLink {
  role = 'host' as const;
  seats: Seat[];
  started = false;
  /** Reopened seats are locked, but guests wait until the host presses Resume. */
  private resuming = false;
  private G: GameState | null = null;
  private settings: LobbySettings = { boardName: '', rules: 'standard', target: 0, roundCap: 0 };
  private snap: StartInfo | null = null;
  private pending = new Map<number, { pid: number; req: DecisionRequest; resolve: (a: unknown) => void }>();
  private early = new Map<number, { pid: number; ans: unknown }>();
  private listeners = new Set<() => void>();
  /** Called with a message for the host's screen (e.g. "Rosa disconnected"). */
  onNotice: (text: string) => void = () => {};
  onAuctionAct: ((seq: number, pid: number, act: 'bid' | 'pass') => void) | null = null;

  auctionShare(seq: number, live: AuctionLive) {
    this.broadcast({ t: 'auction', seq, live });
  }

  private constructor(
    public code: string,
    private peer: Peer,
    hostName: string,
    hostLook: CharId,
  ) {
    // Only the host to begin with; game setup adds players on this device and bots, and friends
    // who join take a free seat (or a bot's).
    this.seats = [{ kind: 'host', name: hostName, look: hostLook, online: true, pid: -1 }];
    peer.on('connection', (conn) => this.accept(conn));
  }

  /** Open a room with a fresh code (retrying if the code is taken). */
  static async open(hostName: string, hostLook: CharId, wanted?: string): Promise<HostRoom> {
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
    const G = cloneState(save.state);
    // A game that was played on one device: every human seat is on this device for now, and a
    // friend can take one over by joining with that player's name.
    const online: OnlineSave = save.online ?? {
      code: '',
      seats: G.players
        .filter((p) => !p.cpu)
        .map((p) => ({ pid: p.id, kind: 'local' as const, name: p.name })),
    };
    const host = online.seats.find((s) => s.kind === 'host') ?? online.seats[0];
    const hp = G.players[host?.pid ?? 0];
    const room = await HostRoom.open(hp.name, hp.ch, online.code || undefined);
    room.seats = G.players.map((p) => {
      const s = online.seats.find((x) => x.pid === p.id);
      const base = { name: p.name, look: p.ch, pid: p.id };
      if (p.cpu) return { ...base, kind: 'cpu' as const, online: false };
      if (p.id === hp.id) return { ...base, kind: 'host' as const, online: true };
      if (!s || s.kind !== 'remote') return { ...base, kind: s?.kind ?? ('host' as const), online: true };
      return { ...base, kind: 'remote' as const, online: false, token: s.token };
    });
    room.settings = {
      boardName: G.boardName ?? '',
      rules: G.rules,
      target: G.target,
      roundCap: G.roundCap,
      plots: G.plots,
      stocks: G.stocks ?? 'classic',
    };
    room.started = true;
    room.resuming = true;
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
      seats: this.seats.map(({ kind, name, look, online, ready }) => ({
        kind,
        name,
        look,
        online,
        ready: kind === 'cpu' || kind === 'open' || !!ready,
      })),
      starting: this.starting,
      resuming: this.resuming,
    };
  }

  /** Set by game setup while everyone is ready and the game is about to start. */
  private starting = false;
  setStarting(on: boolean) {
    if (on === this.starting) return;
    this.starting = on;
    this.changed();
  }

  /** New settings. Joined players must say Ready again, so nobody starts a game they didn't see. */
  setSettings(s: LobbySettings) {
    this.settings = s;
    for (const seat of this.seats) if (seat.kind === 'remote') seat.ready = false;
    this.changed();
  }

  /** A joined player says they are ready to start (or not any more). */
  private setReady(seat: Seat, ready: unknown) {
    if (this.started) return;
    seat.ready = ready === true;
    this.changed();
  }

  /**
   * Lay out the seats before the game starts: the host and the other players on this device
   * (`locals`, host first), then everyone who joined, then the bots. Joined players whose seat
   * moved are told their new one.
   */
  configure(locals: LocalSeat[], bots: LocalSeat[]) {
    if (this.started) return;
    const remotes = this.seats.filter((s) => s.kind === 'remote');
    const host = Object.assign(this.seats[0], locals[0]);
    const seats: Seat[] = [
      host,
      ...locals.slice(1).map((l) => ({ kind: 'local' as const, ...l, online: true, pid: -1 })),
      ...remotes,
      ...bots.map((b) => ({ kind: 'cpu' as const, ...b, online: true, pid: -1 })),
    ].slice(0, MAX_SEATS);
    this.reseat(seats);
  }

  /** Use `seats`, telling joined players whose seat number changed. */
  private reseat(seats: Seat[]) {
    const remotes = this.seats.filter((s) => s.kind === 'remote' && seats.includes(s));
    const before = remotes.map((s) => this.seats.indexOf(s));
    this.seats = seats;
    remotes.forEach((s, k) => {
      const i = this.seats.indexOf(s);
      if (i !== before[k]) this.send(s, { t: 'welcome', seat: i });
    });
    this.changed();
  }

  /** Characters held by players (not CPUs or open seats), except seat `but`. */
  private takenLooks(but: number): CharId[] {
    return this.seats.flatMap((s, i) =>
      i !== but && s.look && s.kind !== 'open' && s.kind !== 'cpu' ? [s.look] : [],
    );
  }

  private lookFree(look: unknown, but: number): look is CharId {
    return CHARACTERS.some((c) => c.id === look) && !this.takenLooks(but).includes(look as CharId);
  }

  /** A joined player picks another character; refused (the lobby re-sent) if it is taken. */
  private relook(seat: Seat, look: unknown) {
    if (this.started) return;
    if (this.lookFree(look, this.seats.indexOf(seat))) seat.look = look;
    this.changed();
  }

  /** A joined player renames themselves in the lobby. */
  private rename(seat: Seat, name: unknown) {
    if (this.started) return;
    seat.name = cleanSeatName(name) || seat.name;
    this.changed();
  }

  /** Remove a joined player from the lobby. */
  kick(i: number) {
    const s = this.seats[i];
    if (s.kind !== 'remote' || this.started) return;
    this.send(s, { t: 'reject', reason: 'The host removed you from the game.' });
    setTimeout(() => s.conn?.close(), 300);
    this.reseat(this.seats.filter((x) => x !== s));
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
    if (msg.t === 'look') this.relook(seat, msg.look);
    else if (msg.t === 'name') this.rename(seat, msg.name);
    else if (msg.t === 'ready') this.setReady(seat, msg.ready);
    else if (msg.t === 'answer' && typeof msg.seq === 'number') this.answered(seat, msg.seq, msg.ans);
    else if (
      msg.t === 'auctionAct' &&
      typeof msg.seq === 'number' &&
      (msg.act === 'bid' || msg.act === 'pass')
    )
      this.onAuctionAct?.(msg.seq, seat.pid, msg.act);
    else if (msg.t === 'resync' && this.snap && !this.resuming)
      this.send(seat, { t: 'start', start: this.startFor(seat) });
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
    const nameOf = (s: Seat) =>
      s.name.toLowerCase() ===
      String(msg.name ?? '')
        .trim()
        .toLowerCase();
    // In a reopened game, a friend can take over a seat played on the host's device by joining
    // with that player's name (this is how a local game goes online), before or after it resumes.
    const claim = this.G ? this.seats.find((s) => s.kind === 'local' && nameOf(s)) : undefined;
    if (claim) claim.kind = 'remote';
    const back =
      claim ??
      this.seats.find((s) => s.kind === 'remote' && s.token === msg.token) ??
      this.seats.find((s) => s.kind === 'remote' && sameName(s));
    if (back) {
      const previous = back.conn;
      back.conn = conn;
      if (previous && previous !== conn) previous.close();
      back.online = true;
      back.token = msg.token;
      reply({ t: 'welcome', seat: this.seats.indexOf(back) });
      this.changed();
      if (this.started) {
        if (!this.resuming) reply({ t: 'start', start: this.startFor(back) });
        this.broadcast({ t: 'seat', pid: back.pid, online: true });
        this.onNotice(`${back.name} reconnected.`);
      }
      return;
    }
    if (this.started) {
      reply({
        t: 'reject',
        reason: 'This game has already started. To join, use the exact name of your player in this game.',
      });
      return;
    }
    // A free seat if there is one (after the players already in, before the bots); otherwise
    // the newcomer takes the last bot's seat.
    const lastBot = this.seats.map((s) => s.kind).lastIndexOf('cpu');
    if (this.seats.length >= MAX_SEATS && lastBot < 0) {
      reply({ t: 'reject', reason: 'This game is full.' });
      return;
    }
    const firstBot = this.seats.findIndex((s) => s.kind === 'cpu' || s.kind === 'open');
    const others = this.seats.filter((_, k) => this.seats.length < MAX_SEATS || k !== lastBot);
    const at = firstBot < 0 ? others.length : Math.min(firstBot, others.length);
    const name = cleanSeatName(msg.name);
    const seat: Seat = {
      kind: 'remote',
      name: name || 'Player',
      // The character on their player card, or a random one nobody has if it is taken; they can
      // change it in the lobby.
      look: this.lookFree(msg.look, -1) ? msg.look : freeCharacter(this.takenLooks(-1)),
      online: true,
      token: msg.token,
      conn,
      pid: -1,
    };
    others.splice(at, 0, seat);
    this.reseat(others);
    reply({ t: 'welcome', seat: this.seats.indexOf(seat) });
  }

  private dropped(conn: DataConnection) {
    const seat = this.seats.find((s) => s.conn === conn);
    if (!seat || !seat.online) return;
    seat.online = false;
    seat.conn = undefined;
    if (!this.started) {
      // Leaving the lobby frees the seat.
      this.reseat(this.seats.filter((x) => x !== seat));
      return;
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

  /**
   * The seats to start the game with: open seats become CPUs (`cpu` suggests a name and
   * character; a character a player has is swapped for a free one).
   */
  seatConfigs(cpu: (i: number) => { name: string; ch: CharId }): SeatConfig[] {
    const out: SeatConfig[] = [];
    const used = this.takenLooks(-1);
    this.seats.forEach((s, i) => {
      if (s.kind === 'cpu' && s.look) {
        s.pid = out.length;
        const ch = used.includes(s.look) ? freeCharacter(used) : s.look;
        used.push(ch);
        out.push({ name: s.name, cpu: true, ch });
        return;
      }
      if (s.kind === 'open' || s.kind === 'cpu') {
        s.pid = out.length;
        const want = cpu(i);
        const ch = used.includes(want.ch) ? freeCharacter(used) : want.ch;
        used.push(ch);
        out.push({ name: want.name, cpu: true, ch });
        return;
      }
      s.pid = out.length;
      out.push({ name: s.name, cpu: false, ch: s.look! });
    });
    return out;
  }

  /** Send the starting state to everyone. Call before the host's game starts running. */
  begin(G: GameState, opening = false) {
    this.resuming = false;
    this.started = true;
    this.G = G;
    this.snap = { state: cloneState(G), seq: 0, answers: [], you: [], ...(opening ? { opening: true } : {}) };
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
    if (this.resuming) return;
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
