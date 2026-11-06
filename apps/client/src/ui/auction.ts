/**
 * The live auction, shown to every player while a property is up for auction: a pop-up in the
 * middle of the screen with the lot, the high bid and every bidder, and the bidding itself in the
 * action bar (like the stock market). Each player has TIMING.auctionBid to raise: when the clock
 * runs out it counts as a pass, so the highest bidder wins once everyone else has passed or run
 * out of time.
 */
import { PLAYER_COLORS, type DecisionRequest, type GameState } from '@aa/engine';
import { SHOP_TIERS, STAR3_TIERS, propertyIconURL, tierFor } from '../art';
import { squareName } from '../names';
import { sound } from '../audio';
import { portraitURL } from '../sprites';
import { TIMING } from '../timing';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';
import { stockPopup } from './modals';

type BidReq = Extract<DecisionRequest, { kind: 'bid' }>;

export class AuctionView {
  private pop: ReturnType<typeof stockPopup>;
  private high = h('div', { class: 'au-high' });
  private list = h('div', { class: 'au-bidders' });
  private clock = h('div', { class: 'au-clock' }, h('i'));
  private status = new Map<number, string>();
  private highBid = 0;
  private highBidder = -1;
  private waitingFor = -1;
  private timer = 0;
  private closed = false;

  constructor(
    private hud: Hud,
    private G: GameState,
    sq: number,
    seller: number,
    private opening: number,
    private bidders: number[],
  ) {
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
      'Auction',
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
            h('span', null, `Value ${fmt(node.value)}`),
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
    for (const pid of bidders) this.status.set(pid, 'In');
    this.draw();
  }

  private draw() {
    clear(this.high);
    if (this.highBidder >= 0) {
      const p = this.G.players[this.highBidder];
      this.high.append(
        h('small', null, 'High bid'),
        h('b', null, fmt(this.highBid)),
        h(
          'span',
          { class: 'au-leader', style: `--pc:${PLAYER_COLORS[p.color]}` },
          h('img', { src: portraitURL(p.ch), alt: '' }),
          p.name,
        ),
      );
    } else this.high.append(h('small', null, 'Opening bid'), h('b', null, fmt(this.opening)));
    clear(this.list);
    for (const pid of this.bidders) {
      const p = this.G.players[pid];
      const st = this.status.get(pid) ?? 'In';
      this.list.append(
        h(
          'div',
          {
            class: `au-bidder ${st === 'Out' ? 'out' : ''} ${pid === this.highBidder ? 'lead' : ''} ${pid === this.waitingFor ? 'deciding' : ''}`,
            style: `--pc:${PLAYER_COLORS[p.color]}`,
          },
          h('img', { src: portraitURL(p.ch), alt: '' }),
          h('span', { class: 'au-name' }, p.name),
          h(
            'span',
            { class: 'au-st' },
            pid === this.waitingFor
              ? 'Deciding'
              : pid === this.highBidder
                ? 'Leading'
                : st === 'Out'
                  ? 'Passed'
                  : 'In',
          ),
        ),
      );
    }
  }

  /** Run the countdown bar for the player deciding (CPUs decide quickly and show no clock). */
  private startClock(pid: number) {
    this.stopClock();
    const p = this.G.players[pid];
    if (p.cpu) return;
    this.clock.classList.add('on');
    this.clock.style.setProperty('--pc', PLAYER_COLORS[p.color]);
    const bar = this.clock.firstElementChild as HTMLElement;
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = `width ${TIMING.auctionBid}ms linear`;
    bar.style.width = '0%';
  }

  private stopClock() {
    clearTimeout(this.timer);
    this.clock.classList.remove('on');
  }

  /** The bid someone deciding now would make. */
  private nextBid(req?: BidReq) {
    return req?.bid ?? (this.highBidder < 0 ? this.opening : this.highBid);
  }

  /** Someone not on this device is deciding whether to raise: the status line says so. */
  waiting(pid: number) {
    this.waitingFor = pid;
    this.draw();
    this.startClock(pid);
    const p = this.G.players[pid];
    this.hud.action(
      `auction-wait:${pid}:${this.highBid}`,
      this.highBidder < 0
        ? `${p.name} is deciding whether to bid ${fmt(this.nextBid())}...`
        : `${p.name} is deciding whether to raise...`,
      'money',
    );
  }

  /** A bid or a pass was made. */
  bid(pid: number, amount: number, raised: boolean) {
    this.waitingFor = -1;
    this.stopClock();
    if (raised) {
      this.highBid = amount;
      this.highBidder = pid;
      this.status.set(pid, 'In');
      sound.play('coin');
    } else this.status.set(pid, 'Out');
    this.draw();
    if (raised) {
      this.high.classList.remove('pop');
      void this.high.offsetWidth;
      this.high.classList.add('pop');
    }
  }

  /**
   * A player on this device decides in the action bar: raise to the asked amount, or pass (also
   * when time runs out).
   */
  ask(req: BidReq): Promise<boolean> {
    this.waitingFor = req.pid;
    this.draw();
    const p = this.G.players[req.pid];
    const secs = h('span', { class: 'au-secs' });
    const end = performance.now() + TIMING.auctionBid;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      secs.textContent = `${left}s`;
      if (left <= 0) return this.hud.resolvePrompt(false);
      this.timer = window.setTimeout(tick, 250);
    };
    const lead = req.highBidder >= 0 ? this.G.players[req.highBidder] : null;
    const text = h(
      'div',
      { class: 'au-ask' },
      h(
        'div',
        { class: 'au-ask-title' },
        lead ? `Raise your bid to ${fmt(req.bid)}` : `Bid ${fmt(req.bid)} to open`,
        // The seconds left to decide.
        secs,
      ),
      h(
        'div',
        { class: 'hint' },
        lead ? `${lead.name} leads with ${fmt(req.high)}.` : 'Nobody has bid yet.',
        ` Your cash: ${fmt(p.cash)}.`,
      ),
    );
    this.startClock(req.pid);
    tick();
    return this.hud
      .prompt<boolean>(
        text,
        [
          { label: `Bid ${fmt(req.bid)}`, value: true, main: true },
          { label: 'Pass', value: false, secondary: true },
        ],
        p.color,
      )
      .then((v) => {
        this.stopClock();
        return v;
      });
  }

  /** Show who won in the pop-up and the action bar, then close (Continue closes it sooner). */
  async end(winner: number, price: number, ms: number) {
    this.waitingFor = -1;
    this.stopClock();
    this.draw();
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
    this.stopClock();
    this.pop.close();
  }
}
