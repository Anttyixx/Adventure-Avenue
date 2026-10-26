/**
 * Character picker: a grid of every character, opened from a player's portrait before the game
 * starts. Characters other players already have are greyed out with who has them, so no two
 * players pick the same one. Once the game starts characters are fixed.
 */
import type { CharId } from '@aa/engine';
import { CHARACTERS, characterURL, portraitURL } from '../sprites';
import { h } from './dom';

export interface PickOptions {
  /** The character the player has now. */
  current: CharId;
  /** Characters other players have, with their names. */
  taken: Map<CharId, string>;
  /** The player's color, for the highlight. */
  color: string;
  title?: string;
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
    const wrap = h(
      'div',
      { class: 'modal-wrap', onclick: (e: Event) => e.target === wrap && done(null) },
      h(
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
          h('h2', null, opts.title ?? 'Choose a character'),
          h('button', { class: 'btn small ghost', onclick: () => done(null) }, 'Close'),
        ),
        grid,
      ),
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
  const img = h('img', { src: small ? portraitURL(ch, 4) : characterURL(ch, 2), alt: '' });
  if (!onPick) return h('span', { class: `char-btn ${cls} fixed` }, img);
  return h(
    'button',
    { class: `char-btn ${cls}`, title: label, 'aria-label': label, onclick: onPick },
    img,
    h('span', { class: 'char-btn-tag' }, 'Change'),
  );
}
