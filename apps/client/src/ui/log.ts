/**
 * Game log grouped by turn: one card per turn (newest last, like a chat) with that turn's
 * actions in the order they happened. Lines that affect other players show those players as chips.
 */
import { PLAYER_COLORS, type GameState, type LogKind, type LogLine } from '@aa/engine';
import { portraitURL } from '../sprites';
import { h } from './dom';

/** Log kinds plus `wait`: three dots for a player making up their mind. */
export type IconKind = LogKind | 'wait';

const ICON_PATHS: Record<IconKind, string> = {
  wait: '<circle cx="6.5" cy="12" r="1.9" fill="#fff" stroke="none"/><circle cx="12" cy="12" r="1.9" fill="#fff" stroke="none"/><circle cx="17.5" cy="12" r="1.9" fill="#fff" stroke="none"/>',
  move: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.4" fill="#fff"/><circle cx="15" cy="15" r="1.4" fill="#fff"/><circle cx="12" cy="12" r="1.4" fill="#fff"/>',
  money: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.2a3.2 3.2 0 1 0 0 5.6V12h-2.2"/>',
  property: '<path d="M4 11.5 12 4.5l8 7"/><path d="M6.5 10v9.5h11V10"/><path d="M10.5 19.5v-5h3v5"/>',
  card: '<rect x="5.5" y="3.5" width="13" height="17" rx="2.5"/><path d="M10 9.5a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.7"/><circle cx="12" cy="16" r=".6" fill="#fff"/>',
  suit: '<path d="M12 4.2l2.5 5.2 5.7.8-4.1 4 1 5.6L12 17.1l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
  stock: '<path d="M4 16.5l5.5-5.5 3.5 3.5L20 7.5"/><path d="M15 7.5h5v5"/>',
  arcade:
    '<rect x="4" y="13" width="16" height="6" rx="2"/><path d="M12 13V7"/><circle cx="12" cy="6" r="2.2"/>',
  effect: '<path d="M18.5 14.5A7 7 0 0 1 9.5 5.5a7 7 0 1 0 9 9z"/>',
  alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".6" fill="#fff"/>',
};

const ICON_BG: Record<IconKind, string> = {
  wait: '#6b7590',
  move: '#4c6ef5',
  money: '#e0a100',
  property: '#2f9e44',
  card: '#7b4bd6',
  suit: '#e5484d',
  stock: '#0c8599',
  arcade: '#d6409f',
  effect: '#5b6478',
  alert: '#e8590c',
};

export function kindIcon(kind: IconKind | undefined) {
  const k = kind ?? 'effect';
  const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[k]}</svg>`;
  const el = h('span', { class: `log-icon k-${k}`, style: `background:${ICON_BG[k]}`, title: k });
  el.innerHTML = svg;
  return el;
}

/** Split text so each player's name is drawn in their color. */
export function namesInColor(G: GameState | undefined, text: string): (string | HTMLElement)[] {
  const players = (G?.players ?? []).filter((p) => p.name);
  if (!players.length) return [text];
  // Longest names first, so a name inside another name never wins.
  const names = [...players].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(
    `(${names.map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  );
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => {
      const p = players.find((q) => q.name === part);
      return p ? h('b', { class: 'pname', style: `color:${PLAYER_COLORS[p.color]}` }, part) : part;
    });
}

interface TurnGroup {
  key: string;
  round?: number;
  pid: number;
  lines: LogLine[];
}

/** Group lines (newest first) into turns; lines keep chronological order inside a turn. */
export function groupLog(G: GameState): TurnGroup[] {
  const groups: TurnGroup[] = [];
  for (const line of G.log) {
    const key = line.round != null && line.turn != null ? `${line.round}:${line.turn}` : 'earlier';
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const pid = line.turn != null ? (G.order[line.turn] ?? -1) : -1;
      g = { key, round: line.round, pid, lines: [] };
      groups.push(g);
    }
    g.lines.unshift(line);
  }
  return groups;
}

export interface LogNode {
  line: LogLine;
  children: LogNode[];
}

/** Nest only under earlier entries, so legacy or truncated history stays readable and acyclic. */
export function nestLog(lines: LogLine[]): LogNode[] {
  const roots: LogNode[] = [];
  const known = new Map<string, LogNode>();
  for (const line of lines) {
    const node: LogNode = { line, children: [] };
    const parent = line.parent ? known.get(line.parent) : undefined;
    (parent ? parent.children : roots).push(node);
    if (line.id) known.set(line.id, node);
  }
  return roots;
}

/**
 * The log, oldest turn at the top and the current turn at the bottom. `waiting` adds a line to
 * the current turn saying who the game is waiting on; the newest `fresh` lines fade in.
 */
export function logView(
  G: GameState,
  currentKey: string,
  opts: { waiting?: { text: string; kind?: IconKind }; fresh?: number; onTile?: (id: number) => void } = {},
): HTMLElement {
  const groups = groupLog(G);
  // The turn in progress always gets a card, even before anything has happened in it.
  if (!G.over && groups[0]?.key !== currentKey) {
    groups.unshift({ key: currentKey, round: G.round, pid: G.order[G.turn], lines: [] });
  }
  groups.reverse();
  const list = h('div', { class: 'log-list' });
  if (!groups.length) list.append(h('p', { class: 'hint' }, 'Nothing has happened yet.'));
  for (const g of groups) {
    const p = g.pid >= 0 ? G.players[g.pid] : null;
    const color = p ? PLAYER_COLORS[p.color] : '#8a94a8';
    const live = g.key === currentKey && !G.over;
    const waiting = live ? opts.waiting : undefined;
    const fresh = live ? (opts.fresh ?? 0) : 0;
    const head = h(
      'div',
      { class: 'turn-head' },
      p ? h('img', { class: 'portrait tiny', src: portraitURL(p.ch), alt: '' }) : null,
      h('b', { style: `color:${color}` }, p ? `${p.name}'s turn` : 'Earlier'),
      g.round != null ? h('span', { class: 'turn-round' }, `Round ${g.round}`) : null,
      live ? h('span', { class: 'turn-live' }, 'Now') : null,
    );
    const freshLines = new Set(fresh ? g.lines.slice(-fresh) : []);
    const renderLine = ({ line: l, children }: LogNode): HTMLElement => {
      const others = new Set(l.involves ?? []);
      if (l.color != null && l.color >= 0 && l.color !== g.pid) others.add(l.color);
      others.delete(g.pid);
      const sq = l.sq;
      const clickable = sq != null && !!G.nodes[sq] && !!opts.onTile;
      const entry = h(
        clickable ? 'button' : 'div',
        {
          class: `log-entry ${clickable ? 'log-link' : ''}`,
          ...(clickable
            ? { type: 'button', title: 'Show this tile on the board', onclick: () => opts.onTile?.(sq!) }
            : {}),
        },
        kindIcon(l.action === 'land' ? 'property' : l.kind),
        h('span', { class: 'log-text' }, ...namesInColor(G, l.text)),
        clickable ? h('span', { class: 'log-locate', 'aria-hidden': 'true' }, '›') : null,
        others.size
          ? h(
              'span',
              { class: 'log-others' },
              ...[...others]
                .filter((id) => !!G.players[id])
                .map((id) => {
                  const q = G.players[id];
                  return h(
                    'span',
                    { class: 'who', style: `--pc:${PLAYER_COLORS[q.color]}`, title: q.name },
                    h('img', { src: portraitURL(q.ch), alt: '' }),
                    q.name,
                  );
                }),
            )
          : null,
      );
      return h(
        'li',
        { class: `log-line ${freshLines.has(l) ? 'log-new' : ''}` },
        entry,
        children.length ? h('ul', { class: 'log-children' }, ...children.map(renderLine)) : null,
      );
    };
    const body = h(
      'ul',
      { class: 'turn-lines' },
      g.lines.length || waiting
        ? null
        : h(
            'li',
            { class: 'log-line hint' },
            h('div', { class: 'log-entry' }, h('span'), 'Getting ready...'),
          ),
      ...nestLog(g.lines).map(renderLine),
      waiting
        ? h(
            'li',
            { class: 'log-line waiting' },
            // The same icon and text columns as every other entry.
            h(
              'div',
              { class: 'log-entry' },
              kindIcon(waiting.kind),
              h('span', { class: 'log-text' }, waiting.text),
            ),
          )
        : null,
    );
    list.append(
      h('section', { class: `turn-card ${live ? 'live' : ''}`, style: `--pc:${color}` }, head, body),
    );
  }
  return list;
}
