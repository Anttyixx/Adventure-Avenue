/**
 * The game guide: a pop-up in the middle of the screen (Menu → Guide) with a tab per topic.
 *
 * - How to play: numbered steps, each with a small looping animation built from the game's own
 *   art (`scene*`), plus the special squares and a few things good to know. Chips at the top jump
 *   to each step.
 * - Stocks, Vacant plots and Arcade games: broken into small containers (a how-it-works flow,
 *   worked examples, labeled facts) rather than long lists.
 * - Venture cards: every numbered card, grouped by what it does, with filter chips.
 *
 * The animations are plain CSS (`.gx` in style.css). They only run while on screen, start over
 * each time a step scrolls into view, and stand still on a telling frame with reduced motion.
 */
import {
  BUILDABLE,
  buildingsLeft,
  CARD_LIST,
  K,
  REEL_PRIZES,
  type CardKind,
  type GameState,
} from '@aa/engine';
import { propertyIconURL } from '../art';
import { coinIconURL, starIconURL, suitIconURL } from '../icons';
import { BUILDING_INFO } from '../names';
import { propIconURL, type PropKey } from '../props';
import { CHARACTERS, bodyURL } from '../sprites';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';

type Tab = 'play' | 'stocks' | 'plots' | 'arcade' | 'venture';

/** The tab last read, so the guide reopens where the player left it. */
let lastTab: Tab = 'play';

/** The colors the examples use: you (red), a rival (blue), a district (orange) and unowned grey. */
const YOU = '#e5484d';
const RIVAL = '#3e7bfa';
const DISTRICT = '#f5a524';
const GREY = '#9aa3b8';

export function guideModal(hud: Hud, G: GameState | null, initialTab?: Tab | 'basics') {
  const easy = G?.rules === 'easy';
  // Easy rules have no stocks or vacant plots.
  const tabs: [Tab, string][] = easy
    ? [
        ['play', 'How to play'],
        ['arcade', 'Arcade games'],
        ['venture', 'Venture cards'],
      ]
    : [
        ['play', 'How to play'],
        ['stocks', 'Stocks'],
        ['plots', 'Vacant plots'],
        ['arcade', 'Arcade games'],
        ['venture', 'Venture cards'],
      ];
  const preferred = initialTab === 'basics' ? 'play' : (initialTab ?? lastTab);
  let tab: Tab = tabs.some(([t]) => t === preferred) ? preferred : 'play';
  const bar = h('div', { class: 'seg guide-tabs', role: 'tablist' });
  const page = h('div', { class: 'rules guide-page', role: 'tabpanel' });
  let stopScenes = () => {};
  const show = () => {
    lastTab = tab;
    for (const b of bar.children) {
      const on = (b as HTMLElement).dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    stopScenes();
    clear(page);
    page.append(
      ...(tab === 'play'
        ? howToPlay(G, page)
        : tab === 'stocks'
          ? stocks(G)
          : tab === 'venture'
            ? ventureCards(easy)
            : tab === 'arcade'
              ? arcade()
              : plots(G)),
    );
    page.scrollTop = 0;
    stopScenes = playScenes(page);
  };
  for (const [t, label] of tabs)
    bar.append(
      h(
        'button',
        {
          class: 'seg-btn',
          role: 'tab',
          'data-tab': t,
          onclick: () => {
            tab = t;
            show();
          },
        },
        label,
      ),
    );
  show();
  const m = hud.modal('Guide', h('div', { class: 'guide' }, tabs.length > 1 ? bar : null, page), {
    wide: true,
    onClose: () => {
      stopScenes();
      m.close();
    },
  });
  m.el.classList.add('guide-modal');
  return m;
}

// ------------------------------------------------------------------ animated examples

/**
 * Run the examples on screen and pause the rest. Each starts from the beginning when it scrolls
 * into view, so the player sees it from the start; with reduced motion each holds one frame.
 * Returns a function that stops watching.
 */
function playScenes(page: HTMLElement): () => void {
  const scenes = [...page.querySelectorAll<HTMLElement>('.gx')];
  if (!scenes.length) return () => {};
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anims = (el: HTMLElement) => el.getAnimations({ subtree: true });
  if (still || !('IntersectionObserver' in window)) {
    for (const el of scenes)
      for (const a of anims(el)) {
        a.pause();
        // A frame late in the loop shows what the example is about.
        a.currentTime = SCENE_MS * 0.78;
      }
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        for (const a of anims(el)) {
          if (e.isIntersecting) {
            a.currentTime = 0;
            a.play();
          } else a.pause();
        }
      }
    },
    { root: page, threshold: 0.4 },
  );
  for (const el of scenes) {
    for (const a of anims(el)) a.pause();
    io.observe(el);
  }
  return () => io.disconnect();
}

/** Every example loops over this long (the CSS animations use the same length). */
const SCENE_MS = 6000;

const img = (src: string, cls: string) => h('img', { class: cls, src, alt: '' });
/** A board square holding a picture (none: a plain path square); `border` is its district color. */
const tile = (src: string | null, cls = '', border?: string) =>
  h(
    'div',
    { class: `gx-tile ${cls}`, style: border ? `--bd:${border}` : undefined },
    src ? h('img', { src, alt: '' }) : null,
  );
const shopIcon = (color: string, tier = 0) => propertyIconURL('shop', tier, color);
const token = (i: number, cls: string) => img(bodyURL(CHARACTERS[i % CHARACTERS.length].id), `gx-tok ${cls}`);
const coin = (cls: string) => img(coinIconURL(), `gx-coin ${cls}`);
const pop = (text: string, cls: string) => h('span', { class: `gx-pop ${cls}` }, text);
const stage = (cls: string, ...kids: (Node | null)[]) =>
  h('div', { class: `gx ${cls}`, 'aria-hidden': 'true' }, h('div', { class: 'gx-in' }, ...kids));

/** A die showing four pips. */
function die(cls: string) {
  return h('div', { class: `gx-die ${cls}` }, ...['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: p })));
}

/** Your goal: net worth fills the bar, then you walk to the bank and win. */
function sceneGoal(target: number) {
  return stage(
    'gx-goal',
    h(
      'div',
      { class: 'gx-bar' },
      h('i', { class: 'gx-fill' }),
      h('span', { class: 'gx-bar-label' }, `Net worth → ${fmt(target)}`),
    ),
    pop('Goal reached!', 'gx-reached'),
    h(
      'div',
      { class: 'gx-row' },
      tile(null, 'gx-road'),
      tile(shopIcon(YOU, 1), '', YOU),
      tile(propIconURL('bank', '#808080'), 'gx-bank'),
    ),
    token(0, 'gx-walk'),
    pop('You win!', 'gx-win'),
  );
}

/** Roll and move: the die tumbles, then the character hops four squares. */
function sceneMove() {
  return stage(
    'gx-move',
    die('gx-roll'),
    h(
      'div',
      { class: 'gx-row gx-five' },
      ...[0, 1, 2, 3, 4].map((i) =>
        i === 4 ? tile(shopIcon(GREY), 'gx-land', DISTRICT) : tile(null, 'gx-road'),
      ),
    ),
    token(0, 'gx-hop'),
  );
}

/** Buy a shop: a coin goes in and the shop turns your color. */
function sceneBuy() {
  return stage(
    'gx-buy',
    h(
      'div',
      { class: 'gx-tile gx-big', style: `--bd:${DISTRICT}` },
      img(shopIcon(GREY), 'gx-was'),
      img(shopIcon(YOU), 'gx-now'),
    ),
    token(0, 'gx-buyer'),
    coin('gx-pay'),
    pop('Yours!', 'gx-yours'),
    pop(`−${fmt(100)}`, 'gx-cost'),
  );
}

/** Fees: a rival stops on your shop and pays you. */
function sceneFees() {
  const fee = fmt(60);
  return stage(
    'gx-fees',
    h('div', { class: 'gx-row' }, tile(null, 'gx-road'), tile(shopIcon(YOU), 'gx-mine', YOU)),
    token(1, 'gx-rival'),
    pop(`−${fee}`, 'gx-paid'),
    coin('gx-fly a'),
    coin('gx-fly b'),
    h('div', { class: 'gx-you', style: `--pc:${YOU}` }, img(bodyURL(CHARACTERS[0].id), '')),
    pop(`+${fee}`, 'gx-got'),
  );
}

/** A district: each shop you own in it raises every fee there; all of them dominate it. */
function sceneDistrict(easy: boolean) {
  const steps = [1, 2, 3, 4].map((k) => K.mult[k] * (k === 4 ? K.domFee : 1));
  const word = easy ? 'row' : 'district';
  return stage(
    'gx-district',
    h(
      'div',
      { class: 'gx-mults' },
      ...steps.map((m, i) =>
        h(
          'span',
          { class: `gx-mult m${i + 1}` },
          i === 3
            ? `Fees ×${m.toFixed(2).replace(/0$/, '')} · whole ${word}!`
            : `Fees ×${String(Math.round(m * 100) / 100)}`,
        ),
      ),
    ),
    h(
      'div',
      { class: 'gx-row' },
      ...[1, 2, 3, 4].map((i) =>
        h(
          'div',
          { class: `gx-tile own${i}`, style: `--bd:${DISTRICT}` },
          img(shopIcon(GREY), 'gx-was'),
          img(shopIcon(YOU), 'gx-now'),
        ),
      ),
    ),
  );
}

/** Invest: coins go into your shop, its value rises and it grows a size. */
function sceneInvest() {
  return stage(
    'gx-invest',
    coin('gx-drop a'),
    coin('gx-drop b'),
    coin('gx-drop c'),
    h(
      'div',
      { class: 'gx-tile gx-big', style: `--bd:${YOU}` },
      img(shopIcon(YOU, 0), 'gx-was'),
      img(shopIcon(YOU, 2), 'gx-now'),
    ),
    h(
      'div',
      { class: 'gx-vals' },
      h('span', { class: 'gx-v1' }, `Value ${fmt(200)}`),
      h('span', { class: 'gx-v2' }, `Value ${fmt(550)}`),
    ),
    pop('Fees up!', 'gx-up'),
  );
}

/** Suits: the four fill in, then the bank promotes you and pays a salary. */
function sceneSuits() {
  return stage(
    'gx-suits',
    h(
      'div',
      { class: 'gx-slots' },
      ...[0, 1, 2, 3].map((i) =>
        h(
          'span',
          { class: `gx-slot s${i + 1}` },
          img(suitIconURL(i, false), 'gx-was'),
          img(suitIconURL(i, true), 'gx-now'),
        ),
      ),
    ),
    h('div', { class: 'gx-row' }, tile(null, 'gx-road'), tile(propIconURL('bank', '#808080'), 'gx-bank')),
    token(0, 'gx-walk'),
    pop('Level up! +Salary', 'gx-promo'),
  );
}

/** Stocks: the price line climbs, and a fee in the district pays you a dividend. */
function sceneStocks() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 60');
  svg.setAttribute('class', 'gx-chart');
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', '4,52 22,46 40,48 58,34 76,30 94,18 116,8');
  line.setAttribute('pathLength', '100');
  svg.append(line);
  return stage(
    'gx-stocks',
    svg,
    h('span', { class: 'gx-price' }, `${fmt(10)} → ${fmt(14)}`),
    tile(shopIcon(RIVAL), 'gx-dshop', DISTRICT),
    coin('gx-div'),
    pop(`Dividend +${fmt(40)}`, 'gx-dpop'),
  );
}

// ------------------------------------------------------------------ building blocks

/** A numbered step: its animated example beside a title and a few short points. */
function step(n: number, id: string, title: string, scene: HTMLElement | null, ...lines: (string | Node)[]) {
  return h(
    'section',
    { class: 'gd-step', id: `gd-${id}` },
    scene,
    h(
      'div',
      { class: 'gd-step-text' },
      h('div', { class: 'gd-step-head' }, h('span', { class: 'gd-num' }, String(n)), h('h4', null, title)),
      h('ul', { class: 'gd-lines' }, ...lines.map((l) => h('li', null, l))),
    ),
  );
}

/** A small titled container: an optional icon, a title, then its contents. */
function box(title: string, icon: string | null, ...body: (string | Node | null)[]) {
  return h(
    'section',
    { class: 'gd-box' },
    h('div', { class: 'gd-box-head' }, icon ? h('img', { src: icon, alt: '' }) : null, h('h4', null, title)),
    ...body.map((b) => (typeof b === 'string' ? h('p', null, b) : b)),
  );
}

/** A heading over a group of containers. */
const heading = (text: string, sub?: string) =>
  h('div', { class: 'gd-heading' }, h('h3', null, text), sub ? h('p', null, sub) : null);

/** A row of key facts: a big value over a short label each. */
const facts = (...items: [string, string][]) =>
  h(
    'div',
    { class: 'gd-facts' },
    ...items.map(([value, label]) =>
      h('div', { class: 'gd-fact' }, h('b', null, value), h('span', null, label)),
    ),
  );

/** A worked example in a gold-edged box. */
const example = (title: string, ...body: (string | Node)[]) =>
  h(
    'div',
    { class: 'gd-example' },
    h('b', { class: 'gd-example-title' }, title),
    ...body.map((b) => (typeof b === 'string' ? h('p', null, b) : b)),
  );

/** Numbered how-to steps inside a container. */
const steps = (...items: (string | Node)[]) =>
  h('ol', { class: 'gd-steps' }, ...items.map((i) => h('li', null, i)));

const grid = (...kids: (HTMLElement | null)[]) => h('div', { class: 'gd-grid' }, ...kids);

// ------------------------------------------------------------------ How to play

function howToPlay(G: GameState | null, page: HTMLElement): Node[] {
  const easy = G?.rules === 'easy';
  const target = G?.target ?? K.defaultTarget;
  const word = easy ? 'row' : 'district';
  const list: [string, string][] = [
    ['goal', 'Goal'],
    ['move', 'Move'],
    ['buy', 'Buy'],
    ['fees', 'Fees'],
    ['district', easy ? 'Rows' : 'Districts'],
    ['invest', 'Invest'],
    ['suits', 'Suits'],
    ...(easy ? [] : ([['stocks', 'Stocks']] as [string, string][])),
    ['squares', 'Squares'],
    ['more', 'Good to know'],
  ];
  // Chips that jump to each step.
  const jump = h(
    'nav',
    { class: 'gd-jump', 'aria-label': 'Steps' },
    ...list.map(([id, label], i) =>
      h(
        'button',
        {
          class: 'gd-chip',
          onclick: () =>
            page.querySelector(`#gd-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        },
        i < list.length - 2 ? `${i + 1} ${label}` : label,
      ),
    ),
  );
  let n = 0;
  return [
    jump,
    step(
      ++n,
      'goal',
      'Your goal',
      sceneGoal(target),
      h('span', null, 'Grow your ', h('b', null, 'net worth'), ` to ${fmt(target)}.`),
      h('span', null, 'Then get back to the ', h('b', null, 'bank'), ' to win.'),
      `Net worth = cash + property${easy ? '' : ' + stock'}.`,
    ),
    step(
      ++n,
      'move',
      'Roll and move',
      sceneMove(),
      `Roll the die (1 to ${K.dieSides}) and move that many squares.`,
      'At a fork, pick your way. You can’t turn back.',
      'Where you stop is what happens.',
    ),
    step(
      ++n,
      'buy',
      'Buy shops',
      sceneBuy(),
      'Stop on an empty shop to buy it.',
      'You pay its value, and it adds that much to your net worth.',
    ),
    step(
      ++n,
      'fees',
      'Collect fees',
      sceneFees(),
      'Rivals who stop on your shop pay you a fee.',
      `After paying, they may buy it from you for ${K.buyoutX}× its value (you get ${K.buyoutOwnerX}×).`,
    ),
    step(
      ++n,
      'district',
      easy ? 'Own a whole row' : 'Own a whole district',
      sceneDistrict(easy),
      `Each shop you own in a ${word} raises every fee there.`,
      h(
        'span',
        null,
        `Own them all (`,
        h('b', null, 'domination'),
        `) for the biggest fees, and your shops there grow.`,
      ),
    ),
    step(
      ++n,
      'invest',
      'Invest',
      sceneInvest(),
      'Stop on your own shop to put money into any of your shops.',
      'A higher value means higher fees (and lifts that district’s stock).',
    ),
    step(
      ++n,
      'suits',
      'Suits and promotion',
      sceneSuits(),
      h(
        'span',
        null,
        'Collect the four suits ♠ ♥ ♦ ♣ on suit squares. A ',
        h('b', null, 'wild card'),
        ' counts as any.',
      ),
      `Reach the bank with all four to level up and earn a salary: ${fmt(K.salaryBase)} + ${fmt(K.salaryLevel)} per level + ${Math.round(K.salaryShop * 100)}% of your shops’ value.`,
    ),
    easy
      ? null
      : step(
          ++n,
          'stocks',
          'Stocks',
          sceneStocks(),
          'Buy shares at the bank (or a stock broker) to earn a dividend from every fee paid in that district.',
          'More on the Stocks tab.',
        ),
    specialSquares(easy),
    goodToKnow(easy),
  ].filter((x): x is HTMLElement => !!x);
}

/** The special squares, a small tile each with its picture and one line. */
function specialSquares(easy: boolean): HTMLElement {
  const sq = (key: PropKey | null, name: string, text: string, icon?: string) =>
    h(
      'div',
      { class: 'gd-sq' },
      h('img', { src: icon ?? (key ? propIconURL(key, '#808080') : ''), alt: '' }),
      h('div', null, h('b', null, name), h('span', null, text)),
    );
  const groups: [string, HTMLElement[]][] = [
    [
      'Good luck',
      [
        sq('venture', 'Venture', 'Flip a venture card (suit squares too).'),
        sq('jackpot', 'Jackpot', `Passers add ${fmt(K.jackpotPass)}. Stop here to take it all.`),
        sq('gain', `Gain ${fmt(K.cashTile)}`, 'The bank pays you when you stop.'),
        sq('roll', 'Roll on', 'Roll again.'),
        sq('boon', 'Boon / Boom', 'Earn a share of every fee others pay.'),
        sq('arcade', 'Arcade', 'Play a quick game (Arcade games tab).'),
      ],
    ],
    [
      'Getting around',
      [
        sq('warp', 'Warp', 'Jump to its partner (gold ones: the bank).'),
        sq('portal', 'Portal', 'Step through to the matching portal.'),
        sq('taxi', 'Taxi', 'Ride to any special square.'),
        sq('cannon', 'Cannon', 'Fire yourself to another player.'),
        sq('swap', 'Swap', 'Trade places with any player.'),
      ],
    ],
    [
      'Watch out',
      [
        sq('loss', `Lose ${fmt(K.cashTile)}`, 'Pay the bank when you stop.'),
        sq('break', 'Take a break', 'Your shops close until your next turn.'),
        sq('hike', 'Price Up', 'Your fees are 10% higher until your next turn.'),
      ],
    ],
    [
      'Suits',
      [
        sq('random-suit', 'Random suit', 'Gives one suit you are missing.'),
        sq('change-ring', 'Change suit', 'Gives the suit it shows (it changes each time).'),
        ...(easy ? [] : [sq('broker', 'Stock broker', 'Buy shares here.')]),
      ],
    ],
  ];
  return h(
    'section',
    { class: 'gd-block', id: 'gd-squares' },
    heading('Special squares', 'Hover or tap any square on the board for details.'),
    h(
      'div',
      { class: 'gd-sq-groups' },
      ...groups.map(([title, items]) => h('div', { class: 'gd-sq-group' }, h('h5', null, title), ...items)),
    ),
  );
}

function goodToKnow(easy: boolean): HTMLElement {
  return h(
    'section',
    { class: 'gd-block', id: 'gd-more' },
    heading('Good to know'),
    grid(
      box(
        'Before you roll',
        null,
        `You can ${easy ? '' : 'sell stock, '}offer a trade, auction a property or renovate a building.`,
      ),
      box(
        'Running out of money',
        coinIconURL(),
        steps(
          'Buying can take you below 0G.',
          'Still below 0 at the end of your turn? Sell stock or property.',
          'Nothing left to sell: you’re bankrupt, and the richest player wins.',
        ),
      ),
      box(
        'Controls',
        null,
        h(
          'div',
          { class: 'gd-keys' },
          h(
            'div',
            null,
            h('kbd', null, 'Enter'),
            ' or ',
            h('kbd', null, 'Space'),
            h('span', null, 'Main button'),
          ),
          h('div', null, h('kbd', null, '−'), ' ', h('kbd', null, '+'), ' or pinch', h('span', null, 'Zoom')),
          h('div', null, h('kbd', null, 'Tap'), ' a square', h('span', null, 'Its details')),
          h('div', null, h('kbd', null, 'Tap'), ' a player card', h('span', null, 'Their page')),
        ),
      ),
    ),
  );
}

// ------------------------------------------------------------------ Stocks

function stocks(G: GameState | null): Node[] {
  const dynamic = !G || G.stocks === 'dynamic';
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const flow = h(
    'div',
    { class: 'gd-flow' },
    ...(
      [
        ['1', 'Buy', `At the bank, a stock broker or when promoted. Up to ${K.maxBuy} shares at a time.`],
        ['2', 'Earn', "Every fee paid in that district pays you a dividend, your own shops' fees too."],
        ['3', 'Sell', 'Any time before you roll. Shares also count toward your net worth.'],
      ] as const
    ).flatMap(([n, title, text], i) => [
      i ? h('span', { class: 'gd-arrow', 'aria-hidden': 'true' }, '→') : null,
      h(
        'div',
        { class: 'gd-flow-step' },
        h('span', { class: 'gd-num' }, n),
        h('b', null, title),
        h('p', null, text),
      ),
    ]),
  );
  const shares = 50;
  const fee = 200;
  const up: string[] = dynamic
    ? [
        'Shops in the district grow (investing, buying more of the district)',
        'More shares held by everyone',
        'Buying back after a sell-off repairs the price',
      ]
    : ['Shops in the district grow', `Buying ${K.bigTrade}+ shares at once (+${pct(K.tradeUp - 1)})`];
  const down: string[] = dynamic
    ? [
        `A sell-off: ${K.sellOff}+ shares of one district sold in a turn (${pct(K.dent)} or more, down to −${pct(1 - K.confMin)})`,
        'Shares being sold (fewer held)',
      ]
    : [`Selling ${K.bigTrade}+ shares at once (−${pct(1 - K.tradeDown)})`];
  return [
    heading('How stocks work', 'Each district has its own stock.'),
    flow,
    example(
      'Example: a dividend',
      `You own ${shares} shares of a district. A rival pays a ${fmt(fee)} fee there.`,
      h(
        'p',
        { class: 'gd-math' },
        `${fmt(fee)} × ${shares} shares ÷ ${K.divDivisor} = `,
        h('b', null, fmt(Math.floor((fee * shares) / K.divDivisor))),
        ' for you',
      ),
    ),
    heading('What moves the price'),
    h(
      'div',
      { class: 'gd-updown' },
      h(
        'div',
        { class: 'gd-up' },
        h('h5', null, '▲ Goes up'),
        h('ul', null, ...up.map((t) => h('li', null, t))),
      ),
      h(
        'div',
        { class: 'gd-down' },
        h('h5', null, '▼ Goes down'),
        h('ul', null, ...down.map((t) => h('li', null, t))),
      ),
    ),
    heading('Good to know'),
    grid(
      dynamic
        ? box(
            'The base price',
            null,
            'Set by the shops in the district: their starting value, then their growth (more gently).',
          )
        : box('The base price', null, 'Follows the average shop value in the district.'),
      dynamic
        ? box(
            'Price per share',
            null,
            'You pay whole gold per share: the listed price, a coin or so more on very big buys.',
          )
        : null,
      dynamic
        ? box(
            'Sell-offs',
            null,
            'The seller is paid before the drop. Buying back (10 shares per 1%) and investing in its shops (100G per 1%) repair it.',
          )
        : null,
      box(
        'Debt',
        null,
        'Short of money at the end of your turn? Sell shares first: they go at the market price.',
      ),
    ),
  ];
}

// ------------------------------------------------------------------ Vacant plots

function plots(G: GameState | null): Node[] {
  const pick = (b: string) => (b === 'star3' ? 'star0' : b === 'circus' ? 'circus0' : b) as PropKey;
  return [
    heading('Vacant plots', 'Empty properties you can build on.'),
    facts(
      ['First to stop', 'builds there'],
      [`${K.buildingLimit} of each`, 'building per board'],
      [`${fmt(K.renovate)} +`, 'new price to renovate'],
    ),
    h(
      'p',
      { class: 'gd-note' },
      'Game setup decides how many plots each district has (None, A few, Some, A lot or All). Renovate before you roll.',
    ),
    heading('Buildings'),
    h(
      'div',
      { class: 'gd-buildings' },
      ...BUILDABLE.map((b) =>
        h(
          'div',
          { class: 'gd-building' },
          h(
            'div',
            { class: 'gd-building-head' },
            h('img', { src: propIconURL(pick(b.b), '#4c8dff'), alt: '' }),
            h('b', null, b.name),
            h('span', { class: 'gd-price' }, fmt(b.cost)),
          ),
          h(
            'div',
            { class: 'gd-when rival' },
            h('em', null, 'Rivals stop'),
            h('span', null, BUILDING_INFO[b.b].rival),
          ),
          h(
            'div',
            { class: 'gd-when you' },
            h('em', null, 'You stop'),
            h('span', null, BUILDING_INFO[b.b].owner),
          ),
          b.b === 'circus'
            ? h(
                'p',
                { class: 'gd-note' },
                `Upgrades: ${K.circusUp.map(fmt).join(' / ')}, one each time you stop.`,
              )
            : null,
          // In a game: how many more of it this board allows.
          G && buildingsLeft(G, b.b) != null
            ? h('p', { class: 'gd-left' }, `${buildingsLeft(G, b.b)} left to build`)
            : null,
        ),
      ),
    ),
  ];
}

// ------------------------------------------------------------------ Arcade games

/** Every arcade game: how it plays and what it pays. */
function arcade(): Node[] {
  const D = K.derby;
  const game = (title: string, icon: string, everyone: boolean, how: HTMLElement, prize: (string | Node)[]) =>
    h(
      'section',
      { class: 'gd-box gd-game' },
      h(
        'div',
        { class: 'gd-box-head' },
        h('img', { src: icon, alt: '' }),
        h('h4', null, title),
        h('span', { class: `gd-tag ${everyone ? 'all' : ''}` }, everyone ? 'Everyone plays' : 'Solo'),
      ),
      how,
      h('div', { class: 'gd-prize' }, h('em', null, 'Prize'), ...prize),
    );
  const reelPrizes = h(
    'div',
    { class: 'gd-table' },
    ...REEL_PRIZES.slice(1)
      .map((name, i) => [name, K.reels.prizes[i + 1]] as const)
      .reverse()
      .map(([name, n]) => h('div', null, h('span', null, name), h('b', null, `${fmt(n)} × level`))),
  );
  return [
    heading('Arcade games', 'Stop on the arcade to play one of these, picked at random.'),
    grid(
      game(
        'Lucky Reels',
        starIconURL(),
        false,
        steps(
          'Five slots roll.',
          'Tap the ones to keep, reroll the rest.',
          `Up to ${K.reels.rerolls} rerolls, then collect.`,
        ),
        [h('span', null, 'Your best set pays:'), reelPrizes],
      ),
      game(
        'Memory Blocks',
        coinIconURL(),
        false,
        steps(
          'Nine cards show their prizes for a moment.',
          'They flip face down.',
          'Pick the one you think is best.',
        ),
        [
          h(
            'span',
            null,
            `Shops +${Math.round(K.memory.shopsUp * 100)}%, ${fmt(K.memory.gold)} × level, a wild card, ${fmt(K.memory.small)}, or shops −${Math.round(K.memory.shopsDown * 100)}%.`,
          ),
        ],
      ),
      game(
        'Coin Derby',
        coinIconURL(),
        true,
        steps(
          `A ${D.track}-space race over ${D.legs} legs.`,
          `Each leg pick Sprint (${D.sprint[0]}-${D.sprint[1]} spaces) or Grab coins (${D.grab[0]}-${D.grab[1]} spaces, +${fmt(D.grabCoins)}).`,
          'Furthest after the last leg wins.',
        ),
        [h('span', null, `Winner: ${fmt(D.winner)} × level. Everyone keeps their coins.`)],
      ),
      game(
        'Lucky Wheel',
        suitIconURL(2, true),
        true,
        steps(
          `Bet up to ${fmt(K.wheel.maxBet)}, or skip.`,
          'Pick a color (odd red, even blue) or a group of four numbers.',
          `The wheel spins: ${K.wheel.spaces} numbers.`,
        ),
        [h('span', null, 'Color: wins 1× your bet. Group: wins 2×. A miss loses your bet.')],
      ),
      game(
        'Treasure Split',
        coinIconURL(),
        true,
        steps(
          `Pick the ${K.treasure.chests.map(fmt).join(', ')} chest.`,
          'Everyone who picks the same chest shares it.',
          `${K.treasure.rounds} rounds.`,
        ),
        [h('span', null, 'Big chests are tempting, but a busy one splits thin!')],
      ),
    ),
    example(
      'Everyone plays',
      'In these games everyone picks at the same time and locks in. Picks stay secret until all are in.',
    ),
  ];
}

// ------------------------------------------------------------------ Venture cards

const KINDS: [CardKind, string][] = [
  ['move', 'Movement'],
  ['cash', 'Cash'],
  ['value', 'Shop value'],
  ['fees', 'Fees'],
  ['suits', 'Suits'],
  ['deals', 'Property deals'],
  ['stocks', 'Stocks'],
];

/** The same card data drives the game and this reference, so descriptions stay in sync. */
function ventureCards(easy: boolean): Node[] {
  let filter: CardKind | 'all' = 'all';
  const list = h('div', { class: 'gd-cards' });
  const chips = h('div', { class: 'gd-jump', role: 'group', 'aria-label': 'Show cards' });
  const kinds = KINDS.filter(([k]) => !easy || k !== 'stocks');
  const draw = () => {
    for (const c of chips.children) c.classList.toggle('on', (c as HTMLElement).dataset.kind === filter);
    clear(list);
    for (const [k, label] of kinds) {
      if (filter !== 'all' && filter !== k) continue;
      const cards = CARD_LIST.filter((c) => c.kind === k).sort((a, b) => a.number - b.number);
      if (!cards.length) continue;
      list.append(
        h('h5', { class: 'gd-cards-head' }, label, h('span', null, String(cards.length))),
        h(
          'div',
          { class: 'gd-card-grid' },
          ...cards.map((card) =>
            h(
              'div',
              { class: 'gd-card' },
              h('span', { class: 'gd-card-num' }, String(card.number)),
              h(
                'div',
                null,
                h('b', null, card.title),
                card.std
                  ? h('span', { class: 'gd-tag' }, easy ? 'Not in Easy rules' : 'Standard rules')
                  : null,
                h('p', null, card.text),
              ),
            ),
          ),
        ),
      );
    }
  };
  for (const [k, label] of [['all', 'All'], ...kinds] as [CardKind | 'all', string][])
    chips.append(
      h(
        'button',
        {
          class: 'gd-chip',
          'data-kind': k,
          onclick: () => {
            filter = k;
            draw();
          },
        },
        label,
      ),
    );
  draw();
  return [heading('Venture cards', 'The number on a flipped tile matches its card here.'), chips, list];
}
