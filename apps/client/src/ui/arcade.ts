/**
 * The arcade games on screen. Like the venture board, each game is a board in the middle of the
 * screen (`ArcadeStage`) and the action bar carries its instructions, choices and results. The
 * engine decides every outcome; this file only shows them.
 *
 * One stage lasts a whole game: Lucky Reels keeps the same slots between rolls, the party games
 * keep their board between rounds, and the stage closes after the last result.
 */
import {
  K,
  MEMORY_SHOW_MS,
  PLAYER_COLORS,
  REEL_PRIZES,
  REEL_SYMBOLS,
  WHEEL_BETS,
  reelPrize,
  reelSetSlots,
  wheelWins,
  type DecisionRequest,
  type GameEvent,
  type GameState,
  type MemoryPrize,
  type Player,
  type ReelSymbol,
} from '@aa/engine';
import { coinIconURL, starIconURL, suitIconURL, wildIconURL } from '../icons';
import { propIconURL, ARCADE_ART_SET, type ArcadeSprite } from '../props';
import { propertyIconURL } from '../art';
import { FRAME_H, FRAME_W, Facing, drawCharacter, portraitURL } from '../sprites';
import { TIMING as T } from '../timing';
import { sound } from '../audio';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';
import { fitInLayer } from './modals';

export type ArcadeGame = 'Lucky Reels' | 'Memory Blocks' | 'Coin Derby' | 'Lucky Wheel' | 'Treasure Split';
type Round = Extract<GameEvent, { type: 'arcadeRound' }>;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** What each game is about, in one line, under its name. */
const ABOUT: Record<ArcadeGame, string> = {
  'Lucky Reels': 'Make the best set of five',
  'Memory Blocks': 'Remember the prizes, then pick a card',
  'Coin Derby': 'Everyone races',
  'Lucky Wheel': 'Everyone may bet',
  'Treasure Split': 'Everyone picks a chest',
};

// ------------------------------------------------------------------ symbol art

function arcadeURL(name: ArcadeSprite, color = '#3e7bfa'): string {
  return ARCADE_ART_SET === 'painted' ? propIconURL(`arcade-${name}`, color) : '';
}
function arcadeImage(name: ArcadeSprite, className = '') {
  return h('img', { src: arcadeURL(name), alt: '', class: `arcade-art ${className}`, draggable: false });
}

const SYMBOL_NAME: Record<ReelSymbol, string> = {
  seven: 'Seven',
  coin: 'Coin',
  wild: 'Star',
  stock: 'Diamond',
  bell: 'Clover',
};

function symbolArt(s: ReelSymbol): HTMLElement {
  const art: Record<ReelSymbol, ArcadeSprite> = {
    seven: 'seven',
    coin: 'coin',
    wild: 'star',
    stock: 'diamond',
    bell: 'clover',
  };
  if (arcadeURL(art[s])) return arcadeImage(art[s]);
  if (s === 'seven') return h('span', { class: 'sym-seven', 'aria-hidden': 'true' }, '7');
  const src =
    s === 'coin'
      ? coinIconURL()
      : s === 'wild'
        ? starIconURL()
        : s === 'stock'
          ? suitIconURL(2, true)
          : suitIconURL(3, true);
  return h('img', { src, alt: '', draggable: 'false' });
}

/** A memory card's face: a picture and a short label. */
function prizeFace(prize: MemoryPrize, level: number): HTMLElement[] {
  const shop = (color: string) => h('img', { src: propertyIconURL('shop', 1, color), alt: '' });
  const label = (name: string, value?: string, kind = '') =>
    h(
      'b',
      { class: `mem-label ${kind}` },
      h('span', { class: value ? 'mem-name' : 'mem-amount' }, name),
      value ? h('span', { class: 'mem-amount' }, value) : null,
    );

  switch (prize) {
    case 'shopsUp':
      return [shop('#35c46a'), label('Shops', '+10%', 'good')];
    case 'shopsDown':
      return [shop('#e5484d'), label('Shops', '−5%', 'bad')];
    case 'gold':
      return [
        h('img', { src: arcadeURL('coin-pile') || coinIconURL(), alt: '' }),
        label(fmt(K.memory.gold * level)),
      ];
    case 'small':
      return [
        h('img', { src: arcadeURL('coin') || coinIconURL(), alt: '', class: 'small' }),
        label(fmt(K.memory.small)),
      ];
    case 'wild':
      return [h('img', { src: arcadeURL('wild') || wildIconURL(), alt: '' }), label('Wild', 'card', 'wild')];
  }
}

const PRIZE_NAME: Record<MemoryPrize, string> = {
  shopsUp: 'Your shops +10%',
  shopsDown: 'Your shops -5%',
  gold: 'Gold',
  small: 'A little gold',
  wild: 'A wild card',
};

// ------------------------------------------------------------------ the stage

export class ArcadeStage {
  private layer: HTMLElement;
  private box: HTMLElement;
  private sub = h('span', { class: 'as-sub' });
  /** Party games: everyone's portrait, ticked once they have chosen. */
  private who = h('div', { class: 'as-who' });
  private body = h('div', { class: 'as-body' });
  private abort = new AbortController();
  private closed = false;

  constructor(
    private hud: Hud,
    readonly game: ArcadeGame,
    private G: GameState,
  ) {
    const slug = game.toLowerCase().replace(/ /g, '-');
    this.sub.textContent = ABOUT[game];
    this.box = h(
      'div',
      {
        class: `arcade-stage glass as-${slug} ${arcadeURL('coin') ? 'arcade-painted' : ''}`,
        role: 'region',
        'aria-label': game,
      },
      h(
        'div',
        { class: 'as-head' },
        h('div', { class: 'as-name' }, h('span', { class: 'as-title' }, game), this.sub),
        this.who,
      ),
      this.body,
    );
    for (const name of ['card-back', 'card-front', 'wheel-frame', 'pointer'] as const) {
      const url = arcadeURL(name);
      if (url) this.box.style.setProperty(`--arcade-${name}`, `url("${url}")`);
    }
    this.layer = h('div', { class: 'arcade-layer' }, this.box);
    hud.root.append(this.layer);
    // The toolbar's View board chip can hide the game to look at the board.
    this.releaseView = hud.offerViewBoard(this.layer);
    // Small screens: the whole game shrinks to fit rather than scrolling.
    this.unfit = fitInLayer(this.box);
  }

  private releaseView: () => void;
  private unfit: () => void;

  close() {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    this.releaseView();
    this.unfit();
    this.layer.remove();
  }

  /** Run an animation (skipped with reduced motion, cut short when the stage closes). */
  private async anim(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) {
    if (this.closed) return;
    if (reduced()) return;
    const a = el.animate(frames, { easing: 'cubic-bezier(.2,.8,.2,1)', ...opts });
    const stop = () => a.cancel();
    this.abort.signal.addEventListener('abort', stop, { once: true });
    await a.finished.catch(() => {});
    this.abort.signal.removeEventListener('abort', stop);
  }

  private wait(ms: number) {
    return this.closed || reduced() ? Promise.resolve() : sleep(ms);
  }

  // -------------------------------------------------------------- action bar

  /**
   * Put a question in the action bar: a title, an optional line under it, and the controls on
   * the right. Controls answer with `hud.resolvePrompt(value)`.
   */
  private bar<T>(pid: number, title: string, hint: string, controls: Node[], extra?: Node) {
    const node = h(
      'div',
      { class: 'aa' },
      h(
        'div',
        { class: 'aa-text' },
        h('div', { class: 'aa-title rise' }, title),
        hint ? h('div', { class: 'aa-hint rise' }, hint) : null,
        extra ?? null,
      ),
      h('div', { class: 'aa-actions' }, ...controls),
    );
    return this.hud.prompt<T>(node, [], this.G.players[pid].color);
  }

  /**
   * A result in the action bar with Continue. It also moves on by itself: after a short read for
   * CPU-only games (faster with Fast CPU), a longer one when people here are playing.
   */
  private async result(pid: number, title: string, hint: string, waitMs: number) {
    const next = h(
      'button',
      { class: 'btn main', onclick: () => this.hud.resolvePrompt(undefined) },
      'Continue',
    );
    const timer = window.setTimeout(() => this.hud.resolvePrompt(undefined), waitMs);
    try {
      await this.bar<void>(pid, title, hint, [next]);
    } finally {
      clearTimeout(timer);
    }
  }

  private btn(label: string, cls: string, onclick: () => void, disabled = false) {
    const b = h('button', { class: `btn ${cls}`, onclick }, label) as HTMLButtonElement;
    b.disabled = disabled;
    return b;
  }

  // -------------------------------------------------------------- who has chosen (party games)

  /** Everyone in the round, each choosing or locked in (everyone chooses at the same time). */
  private markChoosing() {
    clear(this.who);
    for (const id of this.order) {
      const p = this.G.players[id];
      const done = this.locked.has(id);
      this.who.append(
        h(
          'span',
          {
            class: `as-chip ${done ? 'done' : 'now'}`,
            style: `--pc:${PLAYER_COLORS[p.color]}`,
            title: `${p.name}: ${done ? 'locked in' : 'choosing'}`,
          },
          h('img', { src: portraitURL(p.ch), alt: '' }),
          done ? h('i', { 'aria-hidden': 'true' }, '✓') : null,
        ),
      );
    }
  }

  /** This player has locked in their choice for the round. */
  lockIn(pid: number) {
    if (this.locked.has(pid)) return;
    this.locked.add(pid);
    this.markChoosing();
  }

  /** The players this round is still waiting for. */
  notLockedIn(): number[] {
    return this.order.filter((id) => !this.locked.has(id));
  }

  private clearWho() {
    clear(this.who);
  }

  /** Who has locked in this round, and which round that is ("game:round"). */
  private locked = new Set<number>();
  private lockRound = '';

  /** Party games: everyone playing, in the order they choose (the player who landed first). */
  private order: number[] = [];

  // ================================================================== Lucky Reels

  private slots: HTMLButtonElement[] = [];
  private shown: (ReelSymbol | null)[] = [null, null, null, null, null];
  private chart: HTMLElement | null = null;

  private reelsBoard(level: number) {
    if (this.slots.length) return;
    const row = h('div', { class: 'reel-row' });
    for (let i = 0; i < 5; i++) {
      const b = h(
        'button',
        { class: 'reel-slot', disabled: true },
        h('span', { class: 'reel-face' }),
        h('span', { class: 'reel-tag' }, 'Keep'),
      ) as HTMLButtonElement;
      this.slots.push(b);
      row.append(b);
    }
    // Best set first, so the prize ladder reads top-down.
    this.chart = h('div', { class: 'reel-chart', 'aria-label': 'Prizes' });
    for (let r = REEL_PRIZES.length - 1; r >= 1; r--)
      this.chart.append(
        h(
          'div',
          { 'data-rank': String(r) },
          h('span', null, REEL_PRIZES[r]),
          h('b', null, fmt(K.reels.prizes[r] * level)),
        ),
      );
    this.body.append(row, this.chart);
  }

  /** Show a roll: new symbols spin into the slots that were not kept. */
  /**
   * Show a roll. Slots that were not kept spin: they flick through the symbols, then stop one
   * after another from left to right on their new symbol, with ticking and a clunk as each stops.
   */
  private async showRoll(symbols: ReelSymbol[], kept: boolean[]) {
    const faces = this.slots.map((b) => b.querySelector('.reel-face') as HTMLElement);
    const land = (i: number) => {
      clear(faces[i]);
      faces[i].classList.remove('spin');
      faces[i].append(symbolArt(symbols[i]));
      this.shown[i] = symbols[i];
      this.slots[i].setAttribute('aria-label', `Slot ${i + 1}: ${SYMBOL_NAME[symbols[i]]}`);
    };
    const spinning = symbols.map((_, i) => i).filter((i) => !kept[i] || !faces[i].childElementCount);
    if (!spinning.length) return;
    if (reduced() || this.closed) {
      spinning.forEach(land);
      return;
    }
    // When each slot stops: the first after a short spin, then one every 220 ms.
    const stopAt = new Map(spinning.map((i, n) => [i, T.arcadeRoll + 300 + n * 220]));
    const done = new Set<number>();
    const step = 70;
    let t = 0;
    let k = 0;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearInterval(timer);
        spinning.forEach((i) => done.has(i) || land(i));
        resolve();
      };
      const timer = window.setInterval(() => {
        t += step;
        k++;
        let ticking = false;
        for (const i of spinning) {
          if (done.has(i)) continue;
          if (t >= stopAt.get(i)!) {
            done.add(i);
            land(i);
            sound.play('reelStop');
            void this.anim(
              faces[i],
              [
                { transform: 'translateY(-22%)' },
                { transform: 'translateY(6%)' },
                { transform: 'translateY(0)' },
              ],
              { duration: 240 },
            );
          } else {
            // Flick to the next symbol in the strip (each slot starts at a different place).
            const face = faces[i];
            clear(face);
            face.append(symbolArt(REEL_SYMBOLS[(k + i * 2) % REEL_SYMBOLS.length]));
            face.classList.remove('spin');
            void face.offsetWidth;
            face.classList.add('spin');
            ticking = true;
          }
        }
        if (ticking) sound.play('reelTick');
        if (done.size === spinning.length) finish();
      }, step);
      this.abort.signal.addEventListener('abort', finish, { once: true });
    });
  }

  private markRank(rank: number) {
    this.chart?.querySelectorAll('[data-rank]').forEach((el) => {
      el.classList.toggle('on', Number((el as HTMLElement).dataset.rank) === rank);
    });
  }

  /**
   * One roll of Lucky Reels. With `play`, the player taps slots to keep them, then rerolls or
   * takes the prize from the action bar; otherwise the roll is just shown.
   */
  async reels(req: DecisionRequest<'reels'>, p: Player, play: boolean) {
    this.reelsBoard(p.level);
    const locked = req.locked.slice();
    this.slots.forEach((b, i) => {
      b.classList.toggle('kept', locked[i]);
      b.classList.remove('win', 'lose');
    });
    await this.showRoll(req.symbols, req.locked);
    const prize = reelPrize(req.symbols, p.level);
    this.markRank(prize.rank);
    if (!play) return { locked, collect: false };
    const reroll = this.btn('Reroll', 'main', () => this.hud.resolvePrompt({ locked, collect: false }));
    const take = this.btn(prize.amount ? `Take ${fmt(prize.amount)}` : 'Stop', 'ghost', () =>
      this.hud.resolvePrompt({ locked, collect: true }),
    );
    const paint = () => {
      this.slots.forEach((b, i) => {
        b.classList.toggle('kept', locked[i]);
        b.setAttribute('aria-pressed', String(locked[i]));
      });
      reroll.disabled = locked.every(Boolean);
      reroll.textContent = locked.some(Boolean) ? `Reroll ${locked.filter((x) => !x).length}` : 'Reroll all';
    };
    this.slots.forEach((b, i) => {
      b.disabled = false;
      b.onclick = () => {
        locked[i] = !locked[i];
        paint();
      };
    });
    paint();
    const answer = await this.bar<{ locked: boolean[]; collect: boolean }>(
      p.id,
      prize.amount ? `${prize.name} · ${fmt(prize.amount)}` : 'No set yet',
      `${req.left} reroll${req.left === 1 ? '' : 's'} left. Tap the slots you want to keep, then reroll.`,
      [reroll, take],
    );
    this.slots.forEach((b) => {
      b.disabled = true;
      b.onclick = null;
    });
    return answer;
  }

  /** The final set: the slots that score light up and the prize shows in the action bar. */
  async reelsResult(symbols: ReelSymbol[], rolled: boolean[], p: Player, waitMs: number) {
    this.reelsBoard(p.level);
    // Only the slots that were just rerolled spin; kept ones stay still.
    await this.showRoll(
      symbols,
      rolled.map((r) => !r),
    );
    const prize = reelPrize(symbols, p.level);
    const set = reelSetSlots(symbols);
    this.slots.forEach((b, i) => {
      b.classList.remove('kept');
      b.classList.toggle('win', set[i]);
      b.classList.toggle('lose', !set[i]);
    });
    this.markRank(prize.rank);
    await Promise.all(
      this.slots
        .filter((_, i) => set[i])
        .map((b, i) =>
          this.anim(b, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
            duration: 420,
            delay: i * 70,
          }),
        ),
    );
    await this.result(
      p.id,
      prize.amount ? `${p.name} got ${prize.name}! +${fmt(prize.amount)}` : `${p.name} got no set this time.`,
      prize.amount ? 'Prizes grow with your level.' : '',
      waitMs,
    );
  }

  // ================================================================== Memory Blocks

  private cards: HTMLButtonElement[] = [];
  private ready: Promise<void> = Promise.resolve();

  /** Deal the nine cards face up, let everyone look, then turn them face down. */
  memoryStart(prizes: MemoryPrize[], level: number, speed: number) {
    if (this.cards.length) return this.ready;
    const grid = h('div', { class: 'mem-grid' });
    prizes.forEach((prize, i) => {
      const card = h(
        'button',
        {
          class: `mem-card up ${prize}`,
          disabled: true,
          'aria-label': `Card ${i + 1}: ${PRIZE_NAME[prize]}`,
        },
        h(
          'span',
          { class: 'mem-inner' },
          h('span', { class: 'mem-back', 'aria-hidden': 'true' }, h('span', null, '?')),
          h('span', { class: 'mem-front', 'aria-hidden': 'true' }, ...prizeFace(prize, level)),
        ),
      ) as HTMLButtonElement;
      this.cards.push(card);
      grid.append(card);
    });
    this.body.append(grid);
    this.ready = (async () => {
      await Promise.all(
        this.cards.map((c, i) =>
          this.anim(
            c,
            [
              { transform: 'scale(.6)', opacity: 0 },
              { transform: 'none', opacity: 1 },
            ],
            {
              duration: 260,
              delay: i * 40,
            },
          ),
        ),
      );
      await sleep(MEMORY_SHOW_MS * Math.max(0.6, speed));
      for (const [i, c] of this.cards.entries()) {
        c.classList.remove('up');
        c.setAttribute('aria-label', `Card ${i + 1}`);
        if (!reduced()) await sleep(45);
      }
      await this.wait(450);
    })();
    return this.ready;
  }

  /** The player taps a face-down card. */
  async memoryPick(p: Player): Promise<number> {
    await this.ready;
    const grid = this.body.querySelector('.mem-grid')!;
    grid.classList.add('picking');
    this.cards.forEach((c, i) => {
      c.disabled = false;
      c.onclick = () => this.hud.resolvePrompt(i);
    });
    const i = await this.bar<number>(p.id, 'Pick a card', 'Which card hid the best prize?', []);
    grid.classList.remove('picking');
    this.cards.forEach((c) => {
      c.disabled = true;
      c.onclick = null;
    });
    return i;
  }

  /** Flip the chosen card, then the rest, and say what was won. */
  async memoryReveal(picked: number, kind: MemoryPrize, prize: string, p: Player, waitMs: number) {
    await this.ready;
    const card = this.cards[picked];
    card.classList.add('picked', 'up');
    await this.wait(650);
    await this.anim(
      card,
      [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }],
      {
        duration: 360,
      },
    );
    for (const c of this.cards)
      if (c !== card) {
        c.classList.add('up', 'other');
        if (!reduced()) await sleep(60);
      }
    const said: Record<MemoryPrize, [string, string]> = {
      shopsUp: [`${p.name}'s shops are worth 10% more!`, 'Their fees and stock prices go up too.'],
      shopsDown: [`${p.name}'s shops lost 5% of their value.`, 'Their fees and stock prices go down too.'],
      gold: [`${p.name} won ${prize}!`, ''],
      small: [`${p.name} won ${prize}.`, ''],
      wild: [`${p.name} got a wild card!`, 'It counts as any suit you are missing.'],
    };
    await this.result(p.id, said[kind][0], said[kind][1], waitMs);
  }

  // ================================================================== party games: shared

  /** A round of choices has opened: show the board and who is still choosing. */
  choosing(req: DecisionRequest<'arcadeChoice'>) {
    this.order = req.order;
    this.sub.textContent =
      req.game === 'Coin Derby'
        ? `Leg ${req.round} of ${K.derby.legs}`
        : req.game === 'Treasure Split'
          ? `Round ${req.round} of ${K.treasure.rounds}`
          : ABOUT[req.game];
    if (req.game === 'Coin Derby') this.derbyBoard();
    if (req.game === 'Lucky Wheel') this.wheelBoard();
    if (req.game === 'Treasure Split') this.chestBoard(req.round);
    const round = `${req.game}:${req.round}`;
    if (round !== this.lockRound) {
      this.lockRound = round;
      this.locked.clear();
    }
    this.markChoosing();
  }

  /** This player's private choice. */
  async choose(req: DecisionRequest<'arcadeChoice'>, p: Player): Promise<{ choice: number; stake?: number }> {
    if (req.game === 'Coin Derby') return this.derbyChoose(req, p);
    if (req.game === 'Lucky Wheel') return this.wheelChoose(req, p);
    return this.chestChoose(req, p);
  }

  /** Reveal a round of a party game on the board, then its result in the action bar. */
  async round(e: Round, waitMs: number) {
    this.clearWho();
    const lead = e.rows[0]?.pid ?? 0;
    if (e.game === 'Coin Derby') await this.derbyReveal(e);
    if (e.game === 'Lucky Wheel') await this.wheelReveal(e);
    if (e.game === 'Treasure Split') await this.chestReveal(e);
    const names = (ids: number[]) => ids.map((id) => this.G.players[id].name).join(' & ');
    let title = e.title;
    if (e.game === 'Coin Derby') {
      const best = Math.max(...e.rows.map((r) => r.score ?? 0));
      const top = e.rows.filter((r) => r.score === best).map((r) => r.pid);
      title = e.final
        ? `${names(top)} win${top.length > 1 ? '' : 's'} the derby!`
        : `${names(top)} lead${top.length > 1 ? '' : 's'} after leg ${e.title.match(/Leg (\d)/)?.[1] ?? ''}`;
    } else if (e.game === 'Lucky Wheel' && e.wheel) {
      title = `The wheel stopped on ${e.wheel} · ${e.wheel % 2 ? 'Red' : 'Blue'}`;
    } else if (e.game === 'Treasure Split') {
      // Rounds say who found the most this round; the last one says who found the most in all,
      // since that is when everyone is paid.
      const key = (r: Round['rows'][number]) => (e.final ? (r.total ?? 0) : (r.amount ?? 0));
      const most = Math.max(...e.rows.map(key));
      const top = e.rows.filter((r) => key(r) === most).map((r) => r.pid);
      title = e.final
        ? `${names(top)} found the most: ${fmt(most)}${top.length > 1 ? ' each' : ''} in all`
        : `${names(top)} found the most this round: ${fmt(most)}${top.length > 1 ? ' each' : ''}`;
    }
    await this.result(this.order[0] ?? lead, title, e.detail, waitMs);
  }

  // ================================================================== Coin Derby

  private lanes = new Map<
    number,
    {
      runner: HTMLElement;
      coins: HTMLElement;
      badge: HTMLElement;
      lane: HTMLElement;
      /** Draw the racer standing, or one frame of walking. */
      draw: (walking: boolean, frame: number) => void;
    }
  >();
  private coinsShown = new Map<number, number>();

  private derbyBoard() {
    if (this.lanes.size) return;
    const track = K.derby.track;
    const wrap = h('div', {
      class: 'derby',
      style: `--spaces:${track};--cells:repeat(${track + 1}, var(--cell))`,
    });
    // Space numbers along the top, the finish flag at the end.
    const ruler = h('div', { class: 'derby-ruler', 'aria-hidden': 'true' }, h('span'));
    for (let i = 0; i <= track; i++)
      ruler.append(
        h(
          'span',
          null,
          i === track
            ? arcadeURL('finish')
              ? arcadeImage('finish', 'derby-finish')
              : 'Finish'
            : i && i % 5 === 0
              ? String(i)
              : '',
        ),
      );
    wrap.append(ruler);
    for (const id of this.order) {
      const p = this.G.players[id];
      // The racer's own sprite, facing the finish; it walks while it moves.
      const cv = h('canvas', {
        width: FRAME_W * 2,
        height: FRAME_H * 2,
        'aria-label': p.name,
      }) as HTMLCanvasElement;
      const ctx = cv.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const draw = (walking: boolean, frame: number) => {
        ctx.clearRect(0, 0, cv.width, cv.height);
        drawCharacter(ctx, p.ch, walking, Facing.Right, frame, FRAME_W, FRAME_H * 2, 2);
      };
      draw(false, 0);
      const runner = h('span', { class: 'derby-runner' }, cv);
      const badge = h('span', { class: 'derby-badge' });
      const coins = h('span', { class: 'derby-coins', title: 'Coins grabbed' }, fmt(0));
      const cells = h('div', { class: 'derby-cells' });
      for (let i = 0; i <= track; i++) cells.append(h('span', { class: i === track ? 'finish' : '' }));
      const lane = h(
        'div',
        { class: 'derby-lane', style: `--pc:${PLAYER_COLORS[p.color]}` },
        h('span', { class: 'derby-name' }, p.name),
        h('div', { class: 'derby-track' }, cells, runner, badge),
        coins,
      );
      this.lanes.set(id, { runner, coins, badge, lane, draw });
      this.placeRunner(id, 0);
      wrap.append(lane);
    }
    this.body.append(wrap);
  }

  /** Put a runner on space `n` (0 = the start line). */
  private placeRunner(pid: number, n: number) {
    const l = this.lanes.get(pid);
    if (l) l.runner.style.setProperty('--at', String(n));
  }

  private async derbyChoose(req: DecisionRequest<'arcadeChoice'>, p: Player) {
    const D = K.derby;
    // Tapping an option locks it in (everyone chooses at the same time; the leg starts once all have).
    const choose = (choice: number) => this.hud.resolvePrompt({ choice });
    const sprint = this.btn(`Sprint · ${D.sprint[0]}-${D.sprint[1]} spaces`, 'aa-pick', () => choose(0));
    const grab = this.btn(`Grab ${fmt(D.grabCoins)} · ${D.grab[0]}-${D.grab[1]} spaces`, 'aa-pick', () =>
      choose(1),
    );
    return this.bar<{ choice: number }>(
      p.id,
      `${p.name}: sprint or grab coins?`,
      `Leg ${req.round} of ${D.legs}. Whoever is furthest after leg ${D.legs} wins ${fmt(D.winner * p.level)}.`,
      [sprint, grab],
    );
  }

  private async derbyReveal(e: Round) {
    this.derbyBoard();
    const hops: Promise<void>[] = [];
    for (const row of e.rows) {
      const l = this.lanes.get(row.pid);
      if (!l) continue;
      const from = row.previous ?? 0;
      const to = row.score ?? from;
      const grabbed = row.choice === 1;
      l.badge.textContent = grabbed ? `+${fmt(K.derby.grabCoins)}` : `+${to - from}`;
      // Near the finish the badge sits left of the runner so it never covers the coins.
      const left = to >= K.derby.track - 3 ? ' left' : '';
      l.badge.className = `derby-badge show ${grabbed ? 'coin' : 'run'}${left}`;
      l.badge.style.setProperty('--at', String(to));
      hops.push(
        (async () => {
          // Walk one space at a time down the lane.
          let frame = 0;
          const walk = window.setInterval(() => l.draw(true, frame++), 110);
          l.draw(true, frame++);
          for (let n = from + 1; n <= to; n++) {
            this.placeRunner(row.pid, n);
            await this.wait(260);
          }
          clearInterval(walk);
          l.draw(false, 0);
          this.placeRunner(row.pid, to);
          const coins = (this.coinsShown.get(row.pid) ?? 0) + (grabbed ? K.derby.grabCoins : 0);
          this.coinsShown.set(row.pid, coins);
          l.coins.textContent = fmt(coins);
          if (grabbed)
            await this.anim(l.coins, [{ scale: '1' }, { scale: '1.3' }, { scale: '1' }], { duration: 320 });
        })(),
      );
    }
    await Promise.all(hops);
    if (e.final) {
      const best = Math.max(...e.rows.map((r) => r.score ?? 0));
      for (const row of e.rows) {
        const l = this.lanes.get(row.pid);
        if (!l) continue;
        const won = row.score === best;
        l.lane.classList.toggle('won', won);
        l.coins.textContent = `+${fmt(row.amount ?? 0)}`;
        l.badge.className = 'derby-badge';
      }
    }
    await this.wait(400);
  }

  // ================================================================== Lucky Wheel

  private disc: HTMLElement | null = null;
  private zones: HTMLButtonElement[] = [];

  private wheelBoard() {
    if (this.disc) return;
    const disc = h('div', { class: 'wheel-disc' }, h('span', { class: 'wheel-glow', 'aria-hidden': 'true' }));
    for (let n = 1; n <= K.wheel.spaces; n++) {
      const angle = ((n - 0.5) * Math.PI * 2) / K.wheel.spaces;
      // The center of each sector, well inside the painted rim. Text stays upright separately.
      const x = (50 + 28 * Math.sin(angle)).toFixed(3);
      const y = (50 - 28 * Math.cos(angle)).toFixed(3);
      disc.append(h('span', { class: 'wheel-num', style: `--x:${x}%;--y:${y}%` }, String(n)));
    }
    this.disc = disc;
    const zones = h('div', { class: 'wheel-zones' });
    WHEEL_BETS.forEach((name, i) => {
      const nums = Array.from({ length: K.wheel.spaces }, (_, k) => k + 1).filter((n) => wheelWins(i, n));
      const z = h(
        'button',
        { class: `wheel-zone z${i}`, disabled: true },
        h('b', null, name),
        h('span', { class: 'wz-pays' }, i < 2 ? 'wins 1× your bet' : 'wins 2× your bet'),
        h('span', { class: 'wz-nums' }, ...nums.map((n) => h('i', { class: n % 2 ? 'r' : 'b' }, String(n)))),
        h('span', { class: 'wz-chips' }),
      ) as HTMLButtonElement;
      this.zones.push(z);
      zones.append(z);
    });
    this.body.append(
      h(
        'div',
        { class: 'wheel' },
        h(
          'div',
          { class: 'wheel-wrap' },
          h('span', { class: 'wheel-pointer', 'aria-hidden': 'true' }),
          h('div', { class: 'wheel-spin' }, disc),
        ),
        zones,
      ),
    );
  }

  private async wheelChoose(req: DecisionRequest<'arcadeChoice'>, p: Player) {
    const step = K.wheel.step;
    const max = Math.floor((req.maxBet ?? 0) / step) * step;
    let pick = -1;
    let stake = Math.min(20, max);
    const value = h('b', { class: 'aa-stake-value' });
    const minus = this.btn('−', 'small', () => change(-step));
    const plus = this.btn('+', 'small', () => change(step));
    minus.setAttribute('aria-label', 'Bet less');
    plus.setAttribute('aria-label', 'Bet more');
    const go = this.btn('Bet', 'main', () => this.hud.resolvePrompt({ choice: pick, stake }), true);
    const skip = this.btn('Skip', 'ghost', () => this.hud.resolvePrompt({ choice: 0, stake: 0 }));
    const paint = () => {
      value.textContent = fmt(stake);
      minus.disabled = stake <= step;
      plus.disabled = stake + step > max;
      go.disabled = pick < 0 || stake <= 0;
      go.textContent = pick < 0 ? 'Pick a bet' : `Lock in ${fmt(stake)} on ${WHEEL_BETS[pick]}`;
      this.zones.forEach((z, i) => z.setAttribute('aria-pressed', String(i === pick)));
    };
    const change = (d: number) => {
      stake = Math.max(step, Math.min(max, stake + d));
      paint();
    };
    this.zones.forEach((z, i) => {
      z.disabled = max <= 0;
      z.onclick = () => {
        pick = i;
        paint();
      };
    });
    paint();
    const stepper = h('div', { class: 'aa-stake' }, minus, value, plus);
    const answer = await this.bar<{ choice: number; stake: number }>(
      p.id,
      max > 0 ? `${p.name}: place a bet?` : `${p.name} has no cash to bet`,
      max > 0 ? `Tap a color or a group on the board. Up to ${fmt(max)}.` : 'You can watch this spin.',
      max > 0 ? [stepper, go, skip] : [skip],
    );
    this.zones.forEach((z) => {
      z.disabled = true;
      z.onclick = null;
      z.removeAttribute('aria-pressed');
    });
    return answer;
  }

  private async wheelReveal(e: Round) {
    this.wheelBoard();
    const betLabels = new Map<number, HTMLElement>();
    const skipped = e.rows.filter((row) => row.choice == null || row.choice < 0);
    const skipNote = skipped.length
      ? ` · Skipped: ${skipped.map((row) => this.G.players[row.pid].name).join(', ')}`
      : '';
    for (const row of e.rows) {
      if (row.choice == null || row.choice < 0) continue;
      const p = this.G.players[row.pid];
      // The round's public bet text ends with the stake; the container already names its bet.
      const label = h('span', null, row.text.split(' · bet ')[1] ?? row.text);
      betLabels.set(row.pid, label);
      this.zones[row.choice].querySelector('.wz-chips')!.append(
        h(
          'span',
          {
            class: 'wz-chip',
            style: `--pc:${PLAYER_COLORS[p.color]}`,
            title: `${p.name} · ${row.text}`,
            'aria-label': `${p.name} · ${row.text}`,
          },
          h('img', { src: portraitURL(p.ch), alt: '' }),
          label,
        ),
      );
    }
    this.sub.textContent = `All bets locked in${skipNote}`;
    await this.wait(T.arcadeBets);
    if (this.closed) return;
    this.sub.textContent = `Spinning…${skipNote}`;
    const n = e.wheel ?? 1;
    // Segment n is centered at (n - 1) * 30 + 15 degrees; turn it under the pointer at the top.
    const seg = 360 / K.wheel.spaces;
    const end = 360 * 4 - ((n - 1) * seg + seg / 2);
    this.disc!.style.setProperty('--turn', `${end}deg`);
    const spin = { duration: T.arcadeWheel, easing: 'cubic-bezier(.1,.7,.15,1)' };
    const disc = this.disc!;
    let frame = 0;
    const light = (index: number) => {
      disc.style.setProperty('--lit-start', `${index * seg}deg`);
    };
    // Follow the sector currently under the fixed pointer while the wheel turns beneath it.
    const follow = () => {
      if (this.closed) return;
      const angle = parseFloat(getComputedStyle(disc).rotate) || 0;
      const local = ((-angle % 360) + 360) % 360;
      light(Math.floor(local / seg) % K.wheel.spaces);
      frame = requestAnimationFrame(follow);
    };
    disc.classList.add('spinning');
    if (!reduced()) frame = requestAnimationFrame(follow);
    try {
      await Promise.all([
        this.anim(this.disc!, [{ rotate: '0deg' }, { rotate: `${end}deg` }], spin),
        ...Array.from(this.disc!.querySelectorAll('.wheel-num')).map((number) =>
          this.anim(number, [{ rotate: '0deg' }, { rotate: `${-end}deg` }], spin),
        ),
      ]);
    } finally {
      cancelAnimationFrame(frame);
      disc.classList.remove('spinning');
    }
    light(n - 1);
    disc.classList.add('settled');
    this.sub.textContent = `Number ${n}${skipNote}`;
    this.disc!.querySelectorAll('.wheel-num').forEach((el, i) => el.classList.toggle('hit', i + 1 === n));
    this.zones.forEach((z, i) => z.classList.toggle('hit', wheelWins(i, n)));
    // Update each wager in its own bet container when the result is revealed.
    for (const row of e.rows) {
      if (row.choice == null || row.choice < 0) continue;
      const p = this.G.players[row.pid];
      const amt = row.amount ?? 0;
      const label = betLabels.get(row.pid)!;
      clear(label);
      label.append(`${amt >= 0 ? '+' : ''}${fmt(amt)}`);
      label.parentElement!.classList.add(amt >= 0 ? 'up' : 'down');
      label.parentElement!.setAttribute(
        'aria-label',
        `${p.name} · ${row.text} · ${amt >= 0 ? '+' : ''}${fmt(amt)}`,
      );
    }
    await this.wait(500);
  }

  // ================================================================== Treasure Split

  private chests: HTMLButtonElement[] = [];

  private chestBoard(round: number) {
    if (this.chests.length && this.body.querySelector(`.chests[data-round="${round}"]`)) return;
    clear(this.body);
    this.chests = [];
    const row = h('div', { class: 'chests', 'data-round': String(round) });
    K.treasure.chests.forEach((amount, i) => {
      const c = h(
        'button',
        { class: `chest c${i}`, disabled: true, 'aria-label': `${fmt(amount)} chest` },
        h(
          'span',
          { class: 'chest-box', 'aria-hidden': 'true' },
          h('span', { class: 'chest-lid' }),
          h('span', { class: 'chest-lock' }),
          arcadeURL('chest-closed')
            ? h('img', {
                class: 'chest-sprite closed',
                src: arcadeURL('chest-closed', ['#3e7bfa', '#35b779', '#a05bea'][i]),
                alt: '',
              })
            : null,
          arcadeURL('chest-open')
            ? h('img', {
                class: 'chest-sprite opened',
                src: arcadeURL('chest-open', ['#3e7bfa', '#35b779', '#a05bea'][i]),
                alt: '',
              })
            : null,
        ),
        h('b', null, fmt(amount)),
        h('span', { class: 'chest-who' }),
        h('span', { class: 'chest-split' }),
      ) as HTMLButtonElement;
      this.chests.push(c);
      row.append(c);
    });
    this.body.append(row);
  }

  private async chestChoose(req: DecisionRequest<'arcadeChoice'>, p: Player) {
    let pick = -1;
    const go = this.btn('Pick a chest', 'main', () => this.hud.resolvePrompt({ choice: pick }), true);
    this.chests.forEach((c, i) => {
      c.disabled = false;
      c.onclick = () => {
        pick = i;
        this.chests.forEach((x, k) => x.setAttribute('aria-pressed', String(k === i)));
        go.disabled = false;
        go.textContent = `Lock in the ${fmt(K.treasure.chests[i])} chest`;
      };
    });
    const answer = await this.bar<{ choice: number }>(
      p.id,
      `${p.name}: pick a chest`,
      `Round ${req.round} of ${K.treasure.rounds}. Anyone who picks the same chest shares it equally.`,
      [go],
    );
    this.chests.forEach((c) => {
      c.disabled = true;
      c.onclick = null;
      c.removeAttribute('aria-pressed');
    });
    return answer;
  }

  private async chestReveal(e: Round) {
    const round = Number(e.title.match(/Round (\d)/)?.[1] ?? 1);
    this.chestBoard(round);
    for (const [i, c] of this.chests.entries()) {
      const takers = e.rows.filter((r) => r.choice === i);
      const who = c.querySelector('.chest-who')!;
      const split = c.querySelector('.chest-split')!;
      clear(who);
      for (const r of takers) {
        const p = this.G.players[r.pid];
        who.append(
          h('img', {
            src: portraitURL(p.ch),
            alt: p.name,
            title: p.name,
            style: `--pc:${PLAYER_COLORS[p.color]}`,
          }),
        );
      }
      split.textContent = takers.length
        ? takers.length === 1
          ? `All ${fmt(takers[0].amount ?? 0)}`
          : `${fmt(takers[0].amount ?? 0)} each`
        : 'Nobody';
      c.classList.add('open');
      c.classList.toggle('empty', !takers.length);
      await this.anim(c.querySelector('.chest-lid')!, [{ rotate: 'x 0deg' }, { rotate: 'x 70deg' }], {
        duration: 420,
      });
      await this.anim(
        who,
        [
          { opacity: 0, translate: '0 8px' },
          { opacity: 1, translate: '0 0' },
        ],
        { duration: 260 },
      );
    }
    // What everyone has found so far; it is all handed out after the last round.
    this.body.querySelector('.chest-totals')?.remove();
    this.body.append(
      h(
        'div',
        { class: 'chest-totals' },
        h('span', null, e.final ? 'Everyone collects:' : 'Found so far:'),
        ...e.rows.map((r) => {
          const p = this.G.players[r.pid];
          return h(
            'span',
            { class: 'ct-chip', style: `--pc:${PLAYER_COLORS[p.color]}` },
            h('img', { src: portraitURL(p.ch), alt: p.name, title: p.name }),
            fmt(r.total ?? r.amount ?? 0),
          );
        }),
      ),
    );
    await this.wait(400);
  }
}
