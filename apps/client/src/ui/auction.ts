/**
 * The live auction window, shown to every player while a property is up for auction. It lists
 * the bidders, the high bid and who is deciding; a player on this device bids from inside it.
 */
import { PLAYER_COLORS, type DecisionRequest, type GameState } from '@aa/engine';
import { squareName } from '../names';
import { portraitURL } from '../sprites';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';

type BidReq = Extract<DecisionRequest, { kind: 'bid' }>;

export class AuctionView {
  private m: ReturnType<Hud['modal']>;
  private high = h('div', { class: 'au-high' });
  private list = h('div', { class: 'au-bidders' });
  private row = h('div', { class: 'btn-row au-row' });
  private status = new Map<number, string>();
  private highBid = 0;
  private highBidder = -1;
  private waitingFor = -1;

  constructor(
    hud: Hud,
    private G: GameState,
    sq: number,
    seller: number,
    private opening: number,
    private bidders: number[],
  ) {
    const node = G.nodes[sq];
    const from = seller >= 0 ? `${G.players[seller].name} is selling` : 'The bank is selling';
    this.m = hud.modal(
      'Auction',
      h(
        'div',
        { class: 'auction' },
        h(
          'div',
          { class: 'au-prop', style: `--dc:${G.districts[node.d]?.color ?? '#ccc'}` },
          h('b', null, squareName(G, node)),
          h('span', null, `${from} · value ${fmt(node.value)} · opening bid ${fmt(opening)}`),
        ),
        this.high,
        this.list,
        this.row,
      ),
    );
    for (const pid of bidders) this.status.set(pid, 'In');
    this.draw();
  }

  private draw() {
    clear(this.high);
    this.high.append(
      this.highBidder >= 0
        ? h(
            'span',
            null,
            'High bid ',
            h('b', null, fmt(this.highBid)),
            ` by ${this.G.players[this.highBidder].name}`,
          )
        : h('span', null, `No bids yet · opening bid ${fmt(this.opening)}`),
    );
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
          h('img', { src: portraitURL(p.ch, PLAYER_COLORS[p.color]), alt: '' }),
          h('span', { class: 'au-name' }, p.name),
          h(
            'span',
            { class: 'au-st' },
            pid === this.waitingFor
              ? 'Deciding...'
              : pid === this.highBidder
                ? `Leading ${fmt(this.highBid)}`
                : st,
          ),
        ),
      );
    }
  }

  /** Someone not on this device is deciding whether to raise. */
  waiting(pid: number) {
    this.waitingFor = pid;
    clear(this.row);
    this.draw();
  }

  /** A bid or a pass was made. */
  bid(pid: number, amount: number, raised: boolean) {
    this.waitingFor = -1;
    if (raised) {
      this.highBid = amount;
      this.highBidder = pid;
      this.status.set(pid, 'In');
    } else this.status.set(pid, 'Out');
    this.draw();
    this.high.classList.remove('pop');
    void this.high.offsetWidth;
    this.high.classList.add('pop');
  }

  /** A player on this device decides: raise to the asked amount, or pass. */
  ask(req: BidReq): Promise<boolean> {
    this.waitingFor = req.pid;
    this.draw();
    const p = this.G.players[req.pid];
    return new Promise((resolve) => {
      clear(this.row);
      const done = (v: boolean) => {
        clear(this.row);
        resolve(v);
      };
      this.row.append(
        h('span', { class: 'au-you' }, `${p.name}:`),
        h('button', { class: 'btn main', onclick: () => done(true) }, `Bid ${fmt(req.bid)}`),
        h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Pass'),
      );
    });
  }

  /** Show who won, then close (a Close button closes it sooner). */
  async end(winner: number, price: number, ms: number) {
    this.waitingFor = -1;
    this.draw();
    clear(this.high);
    this.high.append(
      winner >= 0
        ? h('span', null, h('b', null, this.G.players[winner].name), ` wins for ${fmt(price)}!`)
        : h('span', null, 'No bids. No sale.'),
    );
    this.high.classList.add('pop', 'won');
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      clear(this.row);
      this.row.append(
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              clearTimeout(t);
              resolve();
            },
          },
          'Close',
        ),
      );
    });
    this.m.close();
  }
}
