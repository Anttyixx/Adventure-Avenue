/**
 * Credits: a card for everyone whose work the game uses (from credits.ts), with what was used,
 * the license and links to their pages. Opened from the main menu.
 */
import { CREDITS, type Credit, type CreditLink } from '../credits';
import { CHARACTERS, characterURL } from '../sprites';
import { h } from './dom';

export function openCredits(root: HTMLElement) {
  const close = () => {
    document.removeEventListener('keydown', onKey);
    el.remove();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  const card = h(
    'div',
    { class: 'whats-new credits glass', role: 'dialog', 'aria-label': 'Credits' },
    h(
      'div',
      { class: 'wn-head' },
      h('h2', null, 'Credits'),
      h('button', { class: 'btn small ghost', onclick: close }, 'Close'),
    ),
    h(
      'p',
      { class: 'hint' },
      'Adventure Avenue uses work that these people shared online. Thank you! Tap a link to visit them.',
    ),
    h('div', { class: 'wn-list cr-list' }, ...CREDITS.map(creditCard)),
  );
  const el = h('div', { class: 'wn-backdrop' }, card);
  el.addEventListener('click', (e) => e.target === el && close());
  root.append(el);
  return close;
}

const link = (l: CreditLink, cls = 'cr-link') =>
  h('a', { class: cls, href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label);

function creditCard(c: Credit): HTMLElement {
  return h(
    'section',
    { class: 'cr-card' },
    h(
      'div',
      { class: 'cr-head' },
      h('b', { class: 'cr-who' }, c.who),
      h('span', { class: 'cr-role' }, c.role),
    ),
    c.showCharacters
      ? h(
          'div',
          { class: 'cr-art' },
          ...CHARACTERS.map((ch) => h('img', { src: characterURL(ch.id, 2), alt: ch.name, title: ch.name })),
        )
      : null,
    h('div', { class: 'cr-label' }, 'Used in the game'),
    h('ul', { class: 'cr-used' }, ...c.used.map((u) => h('li', null, u))),
    c.note ? h('p', { class: 'cr-note' }, c.note) : null,
    h(
      'div',
      { class: 'cr-links' },
      ...c.links.map((l) => link(l)),
      h('span', { class: 'cr-license' }, 'License: ', link(c.license, 'cr-lic-link')),
    ),
  );
}
