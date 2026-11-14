/**
 * Character picker: a grid of every character, opened from a player's portrait before the game
 * starts. Characters other players already have are greyed out with who has them, so no two
 * players pick the same one. In game setup it also has a row of player colors above the grid
 * (colors other players have are greyed out the same way). Once the game starts both are fixed.
 */
import { PLAYER_COLORS, type CharId } from '@aa/engine';
import { CHARACTERS, characterURL, portraitURL, bodyURL } from '../sprites';
import { h } from './dom';

export interface PickOptions {
  /** The character the player has now. */
  current: CharId;
  /** Characters other players have, with their names. */
  taken: Map<CharId, string>;
  /** The player's color, for the highlight. */
  color: string;
  title?: string;
  /**
   * Game setup: a color row. `current` and `taken` are indexes into PLAYER_COLORS (taken: by
   * other players, with their names); `pick` is called the moment a free color is tapped.
   */
  colors?: { current: number; taken: Map<number, string>; pick: (color: number) => void };
}

/** The row of player colors at the top of the picker. */
function colorRow(opts: NonNullable<PickOptions['colors']>, onPick: (hex: string) => void): HTMLElement {
  let current = opts.current;
  const swatches = PLAYER_COLORS.map((hex, i) => {
    const who = opts.taken.get(i);
    return h('button', {
      class: `color-swatch ${i === current ? 'on' : ''}`,
      style: `--sw:${hex}`,
      disabled: !!who,
      title: who ? `Taken by ${who}` : i === current ? 'Your color' : 'Use this color',
      'aria-label': who ? `Color ${i + 1}, taken by ${who}` : `Color ${i + 1}`,
      'aria-pressed': String(i === current),
      onclick: () => {
        if (who || i === current) return;
        current = i;
        swatches.forEach((b, k) => {
          b.classList.toggle('on', k === i);
          b.setAttribute('aria-pressed', String(k === i));
          if (!opts.taken.has(k)) b.title = k === i ? 'Your color' : 'Use this color';
        });
        onPick(hex);
        opts.pick(i);
      },
    }) as HTMLButtonElement;
  });
  return h('div', { class: 'char-colors' }, h('span', { class: 'char-colors-label' }, 'Color'), ...swatches);
}

/** Show the picker; resolves with the chosen character, or null if closed without picking. */
export function pickCharacter(opts: PickOptions): Promise<CharId | null> {
  return new Promise((resolve) => {
    const layer = h('div', { class: 'char-pick-layer' });
    const done = (v: CharId | null) => {
      document.removeEventListener('keydown', onKey);
      layer.remove();
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done(null);
    document.addEventListener('keydown', onKey);
    const grid = h(
      'div',
      { class: 'char-grid' },
      ...CHARACTERS.map((c) => {
        const who = opts.taken.get(c.id);
        const mine = c.id === opts.current;
        return h(
          'button',
          {
            class: `char-card ${mine ? 'on' : ''} ${who ? 'taken' : ''}`,
            disabled: !!who,
            title: who ? `${c.name} (taken by ${who})` : c.name,
            onclick: () => done(c.id),
          },
          h('img', { src: characterURL(c.id, 3), alt: '' }),
          h('b', null, c.name),
          who ? h('small', null, who) : mine ? h('small', null, 'You') : null,
        );
      }),
    );
    const modal = h(
      'div',
      {
        class: 'modal glass char-pick',
        role: 'dialog',
        'aria-label': opts.title ?? 'Choose a character',
        style: `--pc:${opts.color}`,
      },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', null, opts.title ?? (opts.colors ? 'Character and color' : 'Choose a character')),
        h('button', { class: 'btn small ghost', onclick: () => done(null) }, opts.colors ? 'Done' : 'Close'),
      ),
      opts.colors ? colorRow(opts.colors, (hex) => modal.style.setProperty('--pc', hex)) : null,
      grid,
    );
    const wrap = h(
      'div',
      {
        class: 'modal-wrap',
        onclick: (e: Event) => {
          if (e.target === wrap) done(null);
        },
      },
      modal,
    );
    layer.append(wrap);
    document.body.append(layer);
    (grid.querySelector('.char-card.on') as HTMLElement | null)?.focus();
  });
}

/**
 * A player's character as a button that opens the picker (or a plain image when `onPick` is
 * null): the whole character, or just the portrait with the `small` class.
 */
export function charButton(
  ch: CharId,
  cls: string,
  onPick: (() => void) | null,
  label = 'Change character',
): HTMLElement {
  const small = cls.split(' ').includes('small');
  // 'body': the character trimmed to its drawn pixels, so it fills (and centers in) its spot.
  const body = cls.split(' ').includes('body');
  const img = h('img', {
    src: small ? portraitURL(ch, 4) : body ? bodyURL(ch, 4) : characterURL(ch, 2),
    alt: '',
  });
  if (!onPick) return h('span', { class: `char-btn ${cls} fixed` }, img);
  return h(
    'button',
    { class: `char-btn ${cls}`, title: label, 'aria-label': label, onclick: onPick },
    img,
    h('span', { class: 'char-btn-tag' }, 'Change'),
  );
}
