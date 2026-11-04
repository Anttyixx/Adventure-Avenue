/** Shared arcade presentation: private choices, public reveals, no outcome randomness in the UI. */
import {
  K,
  PLAYER_COLORS,
  REEL_PRIZES,
  reelPrize,
  type DecisionRequest,
  type GameEvent,
  type GameState,
  type ReelSymbol,
} from '@aa/engine';
import { h, fmt } from './dom';
import type { Hud } from './hud';
import { portraitURL } from '../sprites';
import { TIMING as T } from '../timing';

const SYMBOL: Record<ReelSymbol, string> = { seven: '7', coin: '●', wild: '★', stock: '◆', bell: '♣' };
const NAME: Record<ReelSymbol, string> = {
  seven: 'Seven',
  coin: 'Coin',
  wild: 'Star',
  stock: 'Diamond',
  bell: 'Clover',
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class ArcadeView {
  m: ReturnType<Hud['modal']>;
  body = h('div', { class: 'arcade-body' });
  private abort = new AbortController();

  constructor(hud: Hud, title: string, subtitle: string) {
    this.m = hud.modal(
      title,
      h('div', { class: 'minigame arcade-party' }, h('p', { class: 'hint' }, subtitle), this.body),
      { wide: true },
    );
    this.m.el.classList.add('arcade-modal');
    this.m.el.setAttribute('role', 'dialog');
    this.m.el.setAttribute('aria-label', title);
  }

  close() {
    this.abort.abort();
    this.m.close();
  }

  private async animate(el: HTMLElement, frames: Keyframe[], duration: number) {
    if (this.abort.signal.aborted) return;
    if (reduced()) {
      Object.assign(el.style, frames[frames.length - 1]);
      return;
    }
    const animation = el.animate(frames, {
      duration,
      easing: 'cubic-bezier(.15,.65,.2,1)',
      fill: 'forwards',
    });
    const cancel = () => animation.cancel();
    this.abort.signal.addEventListener('abort', cancel, { once: true });
    await animation.finished.catch(() => {});
    this.abort.signal.removeEventListener('abort', cancel);
  }

  watch(name: string) {
    this.body.append(
      h(
        'div',
        { class: 'arcade-wait', role: 'status' },
        `${name} is choosing…`,
        h('p', { class: 'hint' }, 'Choices stay private until everyone is ready.'),
      ),
    );
  }

  reels(req: DecisionRequest<'reels'>, level: number) {
    const locked = req.locked.slice();
    const current = reelPrize(req.symbols, level);
    const slots = h('div', { class: 'arcade-slots' });
    const actions = h('div', { class: 'btn-row' });
    this.body.append(
      h('div', { class: 'arcade-score', role: 'status' }, `${current.name} · ${fmt(current.amount)}`),
      h(
        'p',
        { class: 'hint' },
        `${req.left} reroll${req.left === 1 ? '' : 's'} left. Tap a slot to lock or unlock it.`,
      ),
      slots,
    );
    const chart = h('details', { class: 'arcade-chart' }, h('summary', null, 'Prize chart'));
    REEL_PRIZES.slice(1).forEach((name, i) =>
      chart.append(h('div', null, name, h('strong', null, fmt(K.reels.prizes[i + 1] * level)))),
    );
    this.body.append(chart, actions);
    return new Promise<{ locked: boolean[]; collect: boolean }>((resolve) => {
      const finish = (collect: boolean) => {
        this.close();
        resolve({ locked, collect });
      };
      const roll = h('button', { class: 'btn main', onclick: () => finish(false) }, 'Reroll');
      req.symbols.forEach((symbol, i) => {
        const label = h('span', { class: 'arcade-lock' });
        const button = h(
          'button',
          {
            class: 'arcade-slot',
            onclick: () => {
              locked[i] = !locked[i];
              paint();
            },
          },
          h('span', { class: `arcade-symbol symbol-${symbol}`, 'aria-hidden': 'true' }, SYMBOL[symbol]),
          label,
        );
        const paint = () => {
          button.classList.toggle('locked', locked[i]);
          button.setAttribute('aria-pressed', String(locked[i]));
          button.setAttribute(
            'aria-label',
            `Slot ${i + 1}: ${NAME[symbol]}, ${locked[i] ? 'locked' : 'unlocked'}`,
          );
          label.textContent = locked[i] ? 'Locked' : 'Tap to lock';
          roll.disabled = locked.every(Boolean);
        };
        paint();
        slots.append(button);
        if (!req.locked[i])
          void this.animate(
            button,
            [
              { transform: 'translateY(-12px)', opacity: 0.25 },
              { transform: 'translateY(0)', opacity: 1 },
            ],
            T.arcadeRoll,
          );
      });
      actions.append(roll, h('button', { class: 'btn', onclick: () => finish(true) }, 'Collect prize'));
    });
  }

  choice(req: DecisionRequest<'arcadeChoice'>) {
    const grid = h('div', { class: 'arcade-options' });
    const actions = h('div', { class: 'btn-row' });
    let choice = 0;
    let stake = Math.min(20, Math.floor((req.maxBet ?? 0) / K.wheel.step) * K.wheel.step);
    const payout = h('div', { class: 'hint', role: 'status' });
    this.body.append(
      h(
        'div',
        { class: 'tag' },
        req.game === 'Lucky Wheel' ? 'Everyone may bet' : `Everyone plays · Round ${req.round}`,
      ),
      grid,
    );
    const buttons: HTMLButtonElement[] = [];
    const paint = () => {
      buttons.forEach((button, i) => {
        button.classList.toggle('main', choice === i);
        button.setAttribute('aria-pressed', String(choice === i));
      });
      payout.textContent = `Bet ${fmt(stake)} · Win returns ${fmt(stake * (choice < 2 ? 2 : 3))} · Lose ${fmt(stake)}`;
    };
    req.options.forEach((label, i) => {
      const button = h(
        'button',
        {
          class: 'btn arcade-option',
          onclick: () => {
            choice = i;
            paint();
          },
        },
        h(
          'span',
          { class: 'arcade-option-art', 'aria-hidden': 'true' },
          req.game === 'Treasure Split'
            ? '▣'
            : req.game === 'Coin Derby'
              ? i
                ? '●'
                : '➜'
              : i < 2
                ? '●'
                : '▦',
        ),
        label,
      );
      if (req.game === 'Lucky Wheel' && i < 2)
        button.style.setProperty('--option-color', i ? '#3e7bfa' : '#e5484d');
      buttons.push(button);
      grid.append(button);
    });
    if (req.maxBet != null) {
      const value = h('strong', null, fmt(stake));
      const minus = h(
        'button',
        { class: 'btn', 'aria-label': 'Decrease bet', onclick: () => change(-K.wheel.step) },
        '−',
      );
      const plus = h(
        'button',
        { class: 'btn', 'aria-label': 'Increase bet', onclick: () => change(K.wheel.step) },
        '+',
      );
      const change = (amount: number) => {
        stake = Math.max(0, Math.min(Math.floor(req.maxBet! / K.wheel.step) * K.wheel.step, stake + amount));
        value.textContent = fmt(stake);
        minus.disabled = stake === 0;
        plus.disabled = stake + K.wheel.step > req.maxBet!;
        paint();
      };
      change(0);
      this.body.append(
        h('div', { class: 'arcade-bet' }, h('span', null, 'Your bet'), minus, value, plus),
        payout,
      );
    }
    paint();
    this.body.append(actions);
    return new Promise<{ choice: number; stake: number }>((resolve) => {
      const finish = (skip: boolean) => {
        this.close();
        resolve({ choice, stake: skip ? 0 : stake });
      };
      actions.append(
        h(
          'button',
          { class: 'btn main', onclick: () => finish(false) },
          req.maxBet == null ? 'Lock choice' : 'Place bet',
        ),
      );
      if (req.maxBet != null)
        actions.append(h('button', { class: 'btn', onclick: () => finish(true) }, 'Skip'));
    });
  }

  async reelsResult(symbols: ReelSymbol[], prize: string) {
    this.body.append(
      h(
        'div',
        { class: 'arcade-slots' },
        ...symbols.map((s) =>
          h(
            'div',
            { class: 'arcade-slot locked' },
            h('span', { class: `arcade-symbol symbol-${s}` }, SYMBOL[s]),
          ),
        ),
      ),
      h('div', { class: 'arcade-score', role: 'status' }, prize),
    );
    await this.finish();
  }

  async result(e: Extract<GameEvent, { type: 'arcadeRound' }>, G: GameState) {
    const results = h('div', { class: 'arcade-results', 'aria-live': 'polite' });
    if (e.wheel != null) {
      this.body.classList.add('arcade-wheel-body');
      const disc = h('div', { class: 'arcade-wheel', 'aria-label': 'Wheel spinning' });
      for (let i = 1; i <= 12; i++) disc.append(h('span', { style: `--n:${i - 1}` }, String(i)));
      this.body.append(
        h(
          'div',
          { class: 'arcade-wheel-wrap' },
          h('span', { class: 'arcade-pointer', 'aria-hidden': 'true' }, '▼'),
          disc,
        ),
      );
      await this.animate(
        disc,
        [{ transform: 'rotate(0deg)' }, { transform: `rotate(${1440 - (e.wheel - 1) * 30}deg)` }],
        T.arcadeWheel,
      );
      disc.setAttribute('aria-label', `Winning number ${e.wheel}`);
    }
    this.body.append(results);
    const races: Promise<void>[] = [];
    const max = Math.max(1, ...e.rows.map((row) => row.score ?? 0));
    for (const row of e.rows) {
      const p = G.players[row.pid];
      const info = h(
        'div',
        { class: 'arcade-result-row', style: `--pc:${PLAYER_COLORS[p.color]}` },
        h('img', { src: portraitURL(p.ch), alt: '', class: 'portrait' }),
        h('div', null, h('strong', null, p.name), h('div', { class: 'hint' }, row.text)),
        h(
          'strong',
          { class: row.amount != null && row.amount < 0 ? 'arcade-loss' : 'arcade-gain' },
          row.amount == null ? '' : `${row.amount >= 0 ? '+' : ''}${fmt(row.amount)}`,
        ),
      );
      if (row.score != null) {
        const runner = h(
          'span',
          { class: 'arcade-runner' },
          h('img', { src: portraitURL(p.ch), alt: p.name }),
        );
        const track = h('div', { class: 'arcade-race-track' }, runner);
        const end = (row.score / max) * 90;
        runner.style.left = `${end}%`;
        info.classList.add('arcade-race-row');
        info.insertBefore(track, info.lastElementChild);
        info.classList.add('racing');
        races.push(
          this.animate(
            runner,
            [{ left: `${((row.previous ?? 0) / max) * 90}%` }, { left: `${end}%` }],
            T.arcadeRace,
          ),
        );
      }
      results.append(info);
    }
    await Promise.all(races);
    results.querySelectorAll('.racing').forEach((row) => row.classList.remove('racing'));
    this.body.append(h('p', { class: 'hint', role: 'status' }, e.detail));
    await this.finish();
  }

  private async finish() {
    if (this.abort.signal.aborted) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, T.arcadeResult);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      this.abort.signal.addEventListener('abort', done, { once: true });
      this.body.append(
        h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: done }, 'Continue')),
      );
    });
    this.close();
  }
}
