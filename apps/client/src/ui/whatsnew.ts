/**
 * "What's new": the release notes from changelog.ts, opened from the main menu.
 *
 * Updates are shown a day at a time: every entry with the same date goes into one container, so a
 * day of many small pushes reads as one update. Each day shows, from the top:
 * - its date, with the day's update titles under it;
 * - the headline: the day's first brand-new feature (else its first big change) as a large card;
 * - the rest of the big changes in a container per kind (New, Improved, Rules, Online, Fixes),
 *   each a short titled row, four shown and the rest behind "Show more";
 * - the smaller changes as one list (repeats dropped), the first few shown and the rest behind
 *   "Show more". A day with no big changes at all lifts its two biggest small ones up to cards.
 * The newest day starts open; older days start folded.
 */
import { BUILD, IS_DEV_BUILD } from '../build';
import {
  CHANGELOG,
  markUpdateSeen,
  type ChangeTag,
  type ChangelogEntry,
  type ChangelogFeature,
} from '../changelog';
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
  const days = groupByDay(CHANGELOG);
  const card = h(
    'div',
    { class: 'whats-new glass', role: 'dialog', 'aria-label': "What's new" },
    h(
      'div',
      { class: 'wn-head' },
      h('h2', null, "What's new"),
      h('button', { class: 'btn small ghost', onclick: close }, 'Close'),
    ),
    h('div', { class: 'wn-list' }, ...days.map((d, i) => dayCard(d, i === 0))),
    IS_DEV_BUILD ? h('p', { class: 'hint wn-build' }, `Build ${BUILD.sha} (${BUILD.branch})`) : null,
  );
  const el = h('div', { class: 'wn-backdrop' }, card);
  el.addEventListener('click', (e) => e.target === el && close());
  root.append(el);
  return close;
}

/** The kinds of change, in the order their containers appear, with their headings. */
const TAGS: [ChangeTag, string][] = [
  ['new', 'New'],
  ['better', 'Improved'],
  ['rules', 'Rules'],
  ['online', 'Online'],
  ['fix', 'Fixes'],
];
const TAG_LABEL = Object.fromEntries(TAGS) as Record<ChangeTag, string>;

/** How many smaller changes, and rows in each kind's container, a day shows before "Show more". */
const SMALL_SHOWN = 6;
const ROWS_SHOWN = 4;
/** How many update titles a day's header names before "+N more". */
const TITLES_SHOWN = 3;

/** A small change: a phrase, or (from an entry with only small changes) its title and detail. */
interface Small {
  title?: string;
  text: string;
}

interface Day {
  date: string;
  /** For ordering: the first day of the date as a number. */
  when: number;
  entries: ChangelogEntry[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 19, 2026" (or "Oct 25-26, 2026") as a sortable number. */
function dateValue(date: string): number {
  const m = /^([A-Za-z]{3})\w*\s+(\d+)(?:-\d+)?,\s*(\d{4})/.exec(date);
  if (!m) return 0;
  return Number(m[3]) * 10000 + (MONTHS.indexOf(m[1]) + 1) * 100 + Number(m[2]);
}

/** Every entry with the same date in one day, newest day first (entries keep their file order). */
export function groupByDay(list: ChangelogEntry[]): Day[] {
  const days = new Map<string, Day>();
  for (const e of list) {
    let d = days.get(e.date);
    if (!d) {
      d = { date: e.date, when: dateValue(e.date), entries: [] };
      days.set(e.date, d);
    }
    d.entries.push(e);
  }
  return [...days.values()].sort((a, b) => b.when - a.when);
}

/**
 * A day's big and small changes. Small changes come from entries' extras and, for entries with
 * no big change, the entry itself (its title over its detail). Repeated phrases appear once. With
 * no big change all day, the two small changes with the most to say become cards.
 */
export function sortDay(d: Day): { big: ChangelogFeature[]; small: Small[] } {
  const big = d.entries.flatMap((e) => e.features);
  const small: Small[] = [];
  const seen = new Set<string>();
  const add = (s: Small) => {
    const key = `${s.title ?? ''}|${s.text}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    small.push(s);
  };
  for (const e of d.entries) {
    if (e.features.length) for (const x of e.extras ?? []) add({ text: x });
    else add({ title: e.title, text: (e.extras ?? []).join(' ') });
  }
  if (!big.length) {
    const lifted = small
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.title)
      .sort((a, b) => b.s.text.length - a.s.text.length)
      .slice(0, 2);
    for (const { s } of lifted) big.push({ tag: 'better', title: s.title!, text: s.text });
    const gone = new Set(lifted.map(({ i }) => i));
    return { big, small: small.filter((_, i) => !gone.has(i)) };
  }
  return { big, small };
}

function dayCard(d: Day, latest: boolean): HTMLElement {
  const { big, small } = sortDay(d);
  // The headline: the day's first brand-new feature if there is one (that is what players most
  // want to hear about), else its first big change.
  const topAt = Math.max(
    0,
    big.findIndex((f) => f.tag === 'new'),
  );
  const top = big[topAt];
  const rest = big.filter((_, i) => i !== topAt);
  // A busy day lists its first few update titles and how many more.
  const titles = d.entries.map((e) => e.title);
  const named =
    titles.length > TITLES_SHOWN + 1
      ? [...titles.slice(0, TITLES_SHOWN), `+${titles.length - TITLES_SHOWN} more`]
      : titles;
  const count = big.length + small.length;
  const head = h(
    'summary',
    { class: 'wn-title' },
    h(
      'div',
      { class: 'wn-title-row' },
      latest ? h('span', { class: 'wn-badge' }, 'Latest') : null,
      h('b', null, d.date),
      h('small', null, `${count} change${count === 1 ? '' : 's'}`),
    ),
    h(
      'span',
      { class: 'wn-updates', title: titles.length > named.length ? titles.join(' · ') : null },
      named.join(' · '),
    ),
  );
  const sections = TAGS.map(([tag, label]) => {
    const rows = rest.filter((f) => f.tag === tag);
    if (!rows.length) return null;
    const box = h(
      'section',
      { class: 'wn-section', 'data-tag': tag },
      h('h4', null, label, h('span', null, String(rows.length))),
      ...rows.map((f, i) =>
        h(
          'div',
          { class: `wn-row ${i >= ROWS_SHOWN ? 'wn-more' : ''}` },
          h('b', null, f.title),
          h('p', null, f.text),
        ),
      ),
    );
    showMore(box, rows.length - ROWS_SHOWN);
    return box;
  }).filter((s): s is HTMLElement => !!s);
  const el = h(
    'details',
    { class: `wn-entry ${latest ? 'latest' : ''}` },
    head,
    top
      ? h(
          'div',
          { class: 'wn-top', 'data-tag': top.tag },
          h('span', { class: 'wn-tag' }, TAG_LABEL[top.tag]),
          h('b', null, top.title),
          h('p', null, top.text),
        )
      : null,
    sections.length ? h('div', { class: 'wn-sections' }, ...sections) : null,
    small.length ? smallList(small) : null,
  ) as HTMLDetailsElement;
  el.open = latest;
  return el;
}

/** The smaller changes: a two-column list, the first few shown and the rest behind a button. */
function smallList(items: Small[]): HTMLElement {
  const li = (s: Small, hidden: boolean) =>
    h(
      'li',
      { class: hidden ? 'wn-more' : '' },
      s.title ? h('b', null, s.title) : null,
      s.title && s.text ? h('span', null, s.text) : s.text,
    );
  const list = h('ul', null, ...items.map((s, i) => li(s, i >= SMALL_SHOWN)));
  const box = h(
    'section',
    { class: 'wn-small' },
    h('h4', null, 'Smaller changes', h('span', null, String(items.length))),
    list,
  );
  showMore(box, items.length - SMALL_SHOWN);
  return box;
}

/** A "Show N more" button at the end of a container whose items past the first few are hidden. */
function showMore(box: HTMLElement, extra: number) {
  if (extra <= 0) return;
  const btn = h(
    'button',
    {
      class: 'wn-show',
      onclick: () => {
        const open = box.classList.toggle('all');
        btn.textContent = open ? 'Show fewer' : `Show ${extra} more`;
      },
    },
    `Show ${extra} more`,
  );
  box.append(btn);
}
