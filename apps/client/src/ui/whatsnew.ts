/** "What's new": the release notes from changelog.ts, opened from the main menu. */
import { BUILD, IS_DEV_BUILD } from '../build';
import { CHANGELOG, markUpdateSeen } from '../changelog';
import { h } from './dom';

export function openWhatsNew(root: HTMLElement, onClose: () => void = () => {}) {
  markUpdateSeen();
  const close = () => {
    document.removeEventListener('keydown', onKey);
    el.remove();
    onClose();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  const card = h(
    'div',
    { class: 'whats-new glass', role: 'dialog', 'aria-label': "What's new" },
    h(
      'div',
      { class: 'wn-head' },
      h('h2', null, "What's new"),
      h('button', { class: 'btn small ghost', onclick: close }, 'Close'),
    ),
    h(
      'div',
      { class: 'wn-list' },
      ...CHANGELOG.map((e, i) =>
        h(
          'section',
          { class: `wn-entry ${i === 0 ? 'latest' : ''}` },
          h(
            'div',
            { class: 'wn-title' },
            i === 0 ? h('span', { class: 'wn-badge' }, 'Latest') : null,
            h('b', null, e.title),
            h('small', null, e.date),
          ),
          h('ul', null, ...e.items.map((t) => h('li', null, t))),
        ),
      ),
    ),
    IS_DEV_BUILD ? h('p', { class: 'hint wn-build' }, `Build ${BUILD.sha} (${BUILD.branch})`) : null,
  );
  const el = h('div', { class: 'wn-backdrop' }, card);
  el.addEventListener('click', (e) => e.target === el && close());
  root.append(el);
  return close;
}
