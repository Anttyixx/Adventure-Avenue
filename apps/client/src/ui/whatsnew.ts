/**
 * "What's new": the release notes from changelog.ts, opened from the main menu. Each update
 * shows its biggest changes as cards (the first one largest) and small ones as chips; older
 * updates start folded.
 */
import { BUILD, IS_DEV_BUILD } from '../build';
import { CHANGELOG, markUpdateSeen, type ChangeTag, type ChangelogEntry } from '../changelog';
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
    h('div', { class: 'wn-list' }, ...CHANGELOG.map((e, i) => entry(e, i === 0))),
    IS_DEV_BUILD ? h('p', { class: 'hint wn-build' }, `Build ${BUILD.sha} (${BUILD.branch})`) : null,
  );
  const el = h('div', { class: 'wn-backdrop' }, card);
  el.addEventListener('click', (e) => e.target === el && close());
  root.append(el);
  return close;
}

const TAG_LABEL: Record<ChangeTag, string> = {
  new: 'New',
  better: 'Improved',
  rules: 'Rules',
  online: 'Online',
  fix: 'Fix',
};

function entry(e: ChangelogEntry, latest: boolean): HTMLElement {
  const head = h(
    'summary',
    { class: 'wn-title' },
    latest ? h('span', { class: 'wn-badge' }, 'Latest') : null,
    h('b', null, e.title),
    h('small', null, e.date),
  );
  const el = h(
    'details',
    { class: `wn-entry ${latest ? 'latest' : ''}` },
    head,
    h(
      'div',
      { class: 'wn-features' },
      ...e.features.map((f, i) =>
        h(
          'div',
          { class: `wn-feature ${i === 0 ? 'top' : ''}`, 'data-tag': f.tag },
          h('span', { class: 'wn-tag' }, TAG_LABEL[f.tag]),
          h('b', null, f.title),
          h('p', null, f.text),
        ),
      ),
    ),
    e.extras?.length
      ? h(
          'div',
          { class: 'wn-extras' },
          h('small', null, 'Also'),
          ...e.extras.map((x) => h('span', { class: 'wn-chip' }, x)),
        )
      : null,
  ) as HTMLDetailsElement;
  el.open = latest;
  return el;
}
