/**
 * The live auction, shown to every player while a property is up for auction: a pop-up in the
 * middle of the screen with the lot, the high bid and a countdown, and every bidder; the bidding
 * itself is in the action bar. Anyone may bid (the next step up) or pass at any moment. It ends
 * TIMING.auctionWindow after the last bid (the high bidder wins; with no bids, no sale), or as
 * soon as only one bidder is left (they win, at the opening bid if nobody bid).
 *
 * `AuctionView` draws it everywhere. `LiveAuction` runs the rules on the device that answers the
 * engine's `auction` decision (the only device in a hot-seat game, the host online); guests send
 * their bids to the host and draw the state it sends back.
 */
import { PLAYER_COLORS, cpuBidLimit, type DecisionRequest, type GameState } from '@aa/engine';
import { SHOP_TIERS, STAR3_TIERS, propertyIconURL, tierFor } from '../art';
import { squareName } from '../names';
import { sound } from '../audio';
import { portraitURL } from '../sprites';
import { TIMING as T } from '../timing';
import type { AuctionLive } from '../net/protocol';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';
import { stockPopup } from './modals';

export type AuctionReq = Extract<DecisionRequest, { kind: 'auction' }>;
export type AuctionAct = 'bid' | 'pass';

export class AuctionView {
  private pop: ReturnType<typeof stockPopup>;
  private high = h('div', { class: 'au-high' });
  private list = h('div', { class: 'au-bidders' });
  private clock = h('div', { class: 'au-clock' }, h('i'), h('span', { class: 'au-clock-secs' }));
  /** The action bar's parts while bidding. */
  private barTitle = h('div', { class: 'au-ask-title' });
  private barHint = h('div', { class: 'hint' });
  private barControls = h('div', { class: 'au-controls' });
  private local: number[] = [];
  private onAct: ((pid: number, act: AuctionAct) => void) | null = null;
  private barOpen = false;
  private live: AuctionLive;
  /** When the auction ends unless someone bids (performance.now() time). */
  private deadline = 0;
  private tick = 0;
  private closed = false;
  readonly sq: number;
  readonly step: number;

  constructor(
    private hud: Hud,
    private G: GameState,
    sq: number,
    seller: number,
    private opening: number,
    step: number,
    private bidders: number[],
  ) {
    this.sq = sq;
    this.step = step;
    this.live = { high: 0, highBidder: -1, passed: [], leftMs: T.auctionWindow };
    const node = G.nodes[sq];
    const dc = G.districts[node.d]?.color ?? '#9aa3b8';
    const from = seller >= 0 ? `${G.players[seller].name}'s lot` : "The bank's lot";
    const star3 = node.b === 'star3';
    const art =
      node.t === 'shop' || star3
        ? h('img', {
            class: 'au-art',
            src: propertyIconURL(
              star3 ? 'star3' : 'shop',
              tierFor(node.value, star3 ? STAR3_TIERS : SHOP_TIERS),
              dc,
            ),
            alt: '',
          })
        : h('div', { class: 'au-art plot' }, 'LOT');
    this.pop = stockPopup(
      hud,
      'Live auction',
      h(
        'div',
        { class: 'auction' },
        h(
          'div',
          { class: 'au-lot', style: `--dc:${dc}` },
          art,
          h(
            'div',
            { class: 'au-lot-text' },
            h('small', null, from),
            h('b', null, squareName(G, node)),
            h('span', null, `Value ${fmt(node.value)} · bids go up ${fmt(step)}`),
          ),
        ),
        this.high,
        this.clock,
        this.list,
      ),
      'auction-pop',
    );
    // The View board chip hides the pop-up to look at the board (the bidding stays in the bar).
    this.pop.offer(() => {});
    this.tick = window.setInterval(() => this.paintClock(), 200);
    this.show(this.live);
  }

  /** The bid the next raise makes. */
  next(live = this.live) {
    return live.highBidder < 0 ? this.opening : live.high + this.step;
  }

  /** Whether a bidder can still bid: not passed, not leading, and able to pay the next bid. */
  canBid(pid: number, live = this.live) {
    return (
      !live.passed.includes(pid) && live.highBidder !== pid && this.G.players[pid].cash >= this.next(live)
    );
  }

  /** Draw the auction as it stands now. */
  show(live: AuctionLive) {
    const raised =
      live.highBidder >= 0 && (live.high !== this.live.high || live.highBidder !== this.live.highBidder);
    this.live = live;
    this.deadline = performance.now() + live.leftMs;
    if (raised) {
      sound.play('coin');
      this.high.classList.remove('pop');
      void this.high.offsetWidth;
      this.high.classList.add('pop');
    }
    this.drawHigh();
    this.drawBidders();
    this.restartClock(live.leftMs);
    this.drawBar();
  }

  private drawHigh() {
    clear(this.high);
    const live = this.live;
    if (live.highBidder >= 0) {
      const p = this.G.players[live.highBidder];
      this.high.append(
        h('small', null, 'High bid'),
        h('b', null, fmt(live.high)),
        h(
          'span',
          { class: 'au-leader', style: `--pc:${PLAYER_COLORS[p.color]}` },
          h('img', { src: portraitURL(p.ch), alt: '' }),
          p.name,
        ),
      );
    } else this.high.append(h('small', null, 'Opening bid'), h('b', null, fmt(this.opening)));
  }

  private drawBidders() {
    clear(this.list);
    const live = this.live;
    for (const pid of this.bidders) {
      const p = this.G.players[pid];
      const passed = live.passed.includes(pid);
      const lead = pid === live.highBidder;
      const broke = !passed && !lead && p.cash < this.next();
      const st = lead ? 'Leading' : passed ? 'Passed' : broke ? 'Too pricey' : 'In';
      this.list.append(
        h(
          'div',
          {
            class: `au-bidder ${passed || broke ? 'out' : ''} ${lead ? 'lead' : ''}`,
            style: `--pc:${PLAYER_COLORS[p.color]}`,
          },
          h('img', { src: portraitURL(p.ch), alt: '' }),
          h('span', { class: 'au-name' }, p.name),
          h('span', { class: 'au-st' }, st),
        ),
      );
    }
  }

  /** The countdown bar empties over the time left; every bid fills it again. */
  private restartClock(ms: number) {
    const bar = this.clock.firstElementChild as HTMLElement;
    this.clock.classList.add('on');
    bar.style.transition = 'none';
    bar.style.width = `${Math.min(100, (ms / T.auctionWindow) * 100)}%`;
    void bar.offsetWidth;
    bar.style.transition = `width ${Math.max(0, ms)}ms linear`;
    bar.style.width = '0%';
    this.paintClock();
  }

  private paintClock() {
    const left = Math.max(0, Math.ceil((this.deadline - performance.now()) / 1000));
    const text = `${left}s`;
    const secs = this.clock.querySelector('.au-clock-secs')!;
    if (secs.textContent !== text) secs.textContent = text;
    this.clock.classList.toggle('low', left <= 2);
    const hint = this.hintText();
    if (this.barHint.textContent !== hint) this.barHint.textContent = hint;
  }

  private hintText() {
    const left = Math.max(0, Math.ceil((this.deadline - performance.now()) / 1000));
    return this.live.highBidder < 0
      ? `No bids yet · no sale in ${left}s unless someone bids`
      : `Sold in ${left}s unless someone bids`;
  }

  /**
   * Bidding in the action bar for the players on this device in `local` (none: everyone else just
   * watches the bar). `onAct` hears their bids and passes.
   */
  openBar(local: number[], onAct: (pid: number, act: AuctionAct) => void) {
    this.local = local;
    this.onAct = onAct;
    this.barOpen = true;
    const node = h(
      'div',
      { class: 'au-ask' },
      h('div', { class: 'au-ask-text' }, this.barTitle, this.barHint),
      this.barControls,
    );
    const lead = local.length === 1 ? this.G.players[local[0]].color : undefined;
    void this.hud.prompt<void>(node, [], lead);
    this.drawBar();
  }

  /** Close the bidding bar (the auction is over). */
  closeBar() {
    if (!this.barOpen) return;
    this.barOpen = false;
    this.hud.resolvePrompt(undefined);
  }

  private drawBar() {
    if (!this.barOpen) return;
    const live = this.live;
    const G = this.G;
    const leader = live.highBidder >= 0 ? G.players[live.highBidder] : null;
    this.barTitle.textContent = leader
      ? `${leader.name} leads with ${fmt(live.high)}`
      : `Opening bid ${fmt(this.opening)}`;
    this.barHint.textContent = this.hintText();
    clear(this.barControls);
    const many = this.local.length > 1;
    for (const pid of this.local) {
      const p = G.players[pid];
      const passed = live.passed.includes(pid);
      const lead = live.highBidder === pid;
      const bid = h(
        'button',
        { class: `btn ${many ? 'small' : ''} main au-bid`, onclick: () => this.onAct?.(pid, 'bid') },
        `Bid ${fmt(this.next())}`,
      ) as HTMLButtonElement;
      bid.disabled = !this.canBid(pid);
      const pass = h(
        'button',
        { class: `btn ${many ? 'small' : ''} ghost`, onclick: () => this.onAct?.(pid, 'pass') },
        'Pass',
      ) as HTMLButtonElement;
      // The leader can't pass (their bid stands); someone who passed is out.
      const row: Node[] = [];
      if (passed) row.push(h('span', { class: 'au-tag' }, 'Passed'));
      else if (lead) row.push(h('span', { class: 'au-tag lead' }, 'You lead'));
      else {
        if (p.cash < this.next()) bid.textContent = 'Too pricey';
        row.push(bid, pass);
      }
      this.barControls.append(
        h(
          'div',
          { class: 'au-me', style: `--pc:${PLAYER_COLORS[p.color]}` },
          many ? h('span', { class: 'au-me-name' }, p.name) : null,
          ...row,
        ),
      );
    }
  }

  /** Show who won in the pop-up and the action bar, then close (Continue closes it sooner). */
  async end(winner: number, price: number, ms: number) {
    this.closeBar();
    window.clearInterval(this.tick);
    this.clock.classList.remove('on');
    this.drawBidders();
    clear(this.high);
    let title: string;
    if (winner >= 0) {
      const p = this.G.players[winner];
      title = `${p.name} won the auction for ${fmt(price)}!`;
      this.high.append(
        h('small', null, 'Sold!'),
        h('b', null, fmt(price)),
        h(
          'span',
          { class: 'au-leader', style: `--pc:${PLAYER_COLORS[p.color]}` },
          h('img', { src: portraitURL(p.ch), alt: '' }),
          `${p.name} wins`,
        ),
      );
    } else {
      title = 'Nobody bid. No sale.';
      this.high.append(h('small', null, 'No bids'), h('b', null, 'No sale'));
    }
    this.high.classList.add('pop', 'won');
    const t = window.setTimeout(() => this.hud.resolvePrompt(undefined), ms);
    try {
      await this.hud.prompt<void>(title, [{ label: 'Continue', value: undefined, main: true }]);
    } finally {
      clearTimeout(t);
    }
    this.close();
  }

  /** Take the pop-up away. */
  close() {
    if (this.closed) return;
    this.closed = true;
    window.clearInterval(this.tick);
    this.closeBar();
    this.pop.close();
  }
}

/**
 * Runs a live auction's rules: takes bids and passes (from this device's players, CPUs and, online,
 * guests), keeps the clock, and resolves with the winner and price. `share` hears every change.
 */
export class LiveAuction {
  private live: AuctionLive;
  private deadline = 0;
  private timer = 0;
  private cpuTimers = new Map<number, number>();
  private done: (r: { winner: number; price: number }) => void = () => {};
  private over = false;
  private window: number;

  constructor(
    private G: GameState,
    private req: AuctionReq,
    private view: AuctionView,
    private opts: {
      /** Bidders this device's CPUs play for (CPUs, and online, players who dropped). */
      cpu: (pid: number) => boolean;
      /** Bidders without a person anywhere (shortens the wait when only CPUs bid). */
      anyPerson: boolean;
      /** Fast CPU speed (1 = normal). */
      speed: number;
      share?: (live: AuctionLive) => void;
    },
  ) {
    this.live = { high: 0, highBidder: -1, passed: [], leftMs: 0 };
    this.window = T.auctionWindow * (opts.anyPerson ? 1 : opts.speed);
  }

  /** Start the auction; resolves once it is over. */
  run(): Promise<{ winner: number; price: number }> {
    const result = new Promise<{ winner: number; price: number }>((r) => (this.done = r));
    this.restart();
    return result;
  }

  /** A bid or a pass from bidder `pid` (ignored if it isn't allowed now). */
  act(pid: number, act: AuctionAct) {
    if (this.over || !this.req.bidders.includes(pid) || this.live.passed.includes(pid)) return;
    if (act === 'pass') {
      if (this.live.highBidder === pid) return;
      this.live = { ...this.live, passed: [...this.live.passed, pid] };
    } else {
      if (!this.view.canBid(pid, this.live)) return;
      this.live = { ...this.live, high: this.view.next(this.live), highBidder: pid };
    }
    this.restart(act === 'bid');
  }

  /** The state changed: check for an end, reset the clock after a bid, share it, plan CPU moves. */
  private restart(bid = true) {
    if (bid || !this.deadline) this.deadline = performance.now() + this.window;
    // Bidders who passed, or can't afford the next bid, are out; one left wins.
    const left = this.req.bidders.filter(
      (pid) =>
        !this.live.passed.includes(pid) && (pid === this.live.highBidder || this.view.canBid(pid, this.live)),
    );
    if (left.length === 0) return this.finish(-1, 0);
    if (left.length === 1 && (this.live.highBidder === left[0] || this.live.highBidder < 0)) {
      const w = left[0];
      return this.finish(w, this.live.highBidder < 0 ? this.req.opening : this.live.high);
    }
    this.publish();
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.timeUp(), Math.max(0, this.deadline - performance.now()));
    this.planCpus();
  }

  private publish() {
    const live = { ...this.live, leftMs: Math.max(0, this.deadline - performance.now()) };
    this.view.show(live);
    this.opts.share?.(live);
  }

  private timeUp() {
    if (this.over) return;
    if (this.live.highBidder >= 0) this.finish(this.live.highBidder, this.live.high);
    else this.finish(-1, 0);
  }

  /** Each CPU still in decides again after every change: bid while it's worth it, else pass. */
  private planCpus() {
    for (const t of this.cpuTimers.values()) clearTimeout(t);
    this.cpuTimers.clear();
    for (const pid of this.req.bidders) {
      if (!this.opts.cpu(pid) || this.live.passed.includes(pid) || this.live.highBidder === pid) continue;
      const wants =
        this.view.canBid(pid, this.live) &&
        this.view.next(this.live) <= cpuBidLimit(this.G, pid, this.req.sq);
      const wait = (T.auctionCpuMin + Math.random() * (T.auctionCpuMax - T.auctionCpuMin)) * this.opts.speed;
      this.cpuTimers.set(
        pid,
        window.setTimeout(() => this.act(pid, wants ? 'bid' : 'pass'), wants ? wait : wait * 0.6),
      );
    }
  }

  private finish(winner: number, price: number) {
    if (this.over) return;
    this.over = true;
    clearTimeout(this.timer);
    for (const t of this.cpuTimers.values()) clearTimeout(t);
    this.live = { ...this.live, leftMs: 0 };
    this.view.show(this.live);
    this.opts.share?.(this.live);
    this.done({ winner, price });
  }

  /** Stop without a result (the game was left). */
  stop() {
    this.over = true;
    clearTimeout(this.timer);
    for (const t of this.cpuTimers.values()) clearTimeout(t);
  }
}
