/**
 * The game guide: a pop-up in the middle of the screen (the Guide button in the toolbar) with a
 * tab per topic: the basic rules, stocks, vacant plot buildings and numbered venture cards.
 */
import { BUILDINGS, CARD_LIST, K, type GameState } from '@aa/engine';
import { BUILDING_INFO } from '../names';
import { propIconURL, type PropKey } from '../props';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';

type Tab = 'basics' | 'stocks' | 'plots' | 'venture';

/** The tab last read, so the guide reopens where the player left it. */
let lastTab: Tab = 'basics';

export function guideModal(hud: Hud, G: GameState | null, initialTab?: Tab) {
  const easy = G?.rules === 'easy';
  // Easy rules have no stocks or vacant plots.
  const tabs: [Tab, string][] = easy
    ? [
        ['basics', 'Basics'],
        ['venture', 'Venture cards'],
      ]
    : [
        ['basics', 'Basics'],
        ['stocks', 'Stocks'],
        ['plots', 'Vacant plots'],
        ['venture', 'Venture cards'],
      ];
  const preferred = initialTab ?? lastTab;
  let tab: Tab = tabs.some(([t]) => t === preferred) ? preferred : 'basics';
  const bar = h('div', { class: 'seg guide-tabs', role: 'tablist' });
  const page = h('div', { class: 'rules guide-page', role: 'tabpanel' });
  const show = () => {
    lastTab = tab;
    for (const b of bar.children) {
      const on = (b as HTMLElement).dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    clear(page);
    page.append(
      ...(tab === 'basics'
        ? basics(G)
        : tab === 'stocks'
          ? stocks(G)
          : tab === 'venture'
            ? ventureCards(easy)
            : plots()),
    );
    page.scrollTop = 0;
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
    onClose: () => m.close(),
  });
  return m;
}

const sec = (title: string, ...text: (string | Node)[]) => [h('h4', null, title), h('p', null, ...text)];

function basics(G: GameState | null): Node[] {
  const easy = G?.rules === 'easy';
  const target = G?.target ?? K.defaultTarget;
  return [
    ...sec(
      'The goal',
      `Roll the die (1 to ${K.dieSides}) and move around the town. Buy shops, grow their value and reach the target net worth (${fmt(target)} in this game), then get back to the bank to win. Net worth is your cash plus your properties' value${easy ? '' : ' and your stock'}.`,
    ),
    ...sec(
      'Shops',
      'Stop on an empty shop to buy it. Rivals who stop on your shop pay you a fee. Owning more of a ',
      easy ? 'row' : 'district',
      ' raises both the fees and the shop values there; owning all of it dominates it. Stop on your own shop to invest in your shops and grow their value.',
    ),
    ...sec(
      'Buyouts',
      `After paying a rival's fee you may buy the shop from them for ${K.buyoutX}x its value (the owner gets ${K.buyoutOwnerX}x).`,
    ),
    ...sec(
      'Suits and promotion',
      `Collect the four suits ♠ ♥ ♦ ♣ (from suit squares and cards), then pass the bank to be promoted: a salary of ${fmt(K.salaryBase)} + ${fmt(K.salaryLevel)} per level + ${Math.round(K.salaryShop * 100)}% of your shops' value. Suit Yourself cards count as any missing suit.`,
    ),
    ...sec(
      'Special squares',
      'Venture squares (and suit squares) flip a venture card. Roll-on rolls again. Take-a-break closes your shops until your next turn. Boon and Boom pay you a share of the fees others pay. Warp squares send you to another part of the board. The cannon fires you to another player. The arcade plays a minigame.',
    ),
    ...sec(
      'Before rolling',
      `You can ${easy ? '' : 'sell stock, '}propose a trade, auction a property or renovate a building.`,
    ),
    ...sec(
      'Debt',
      'Purchases can take you below 0G. If your cash is still below 0 at the end of your turn you must sell stock or property. With nothing left to sell you go bankrupt, and the richest player wins.',
    ),
    ...sec(
      'Controls',
      'Enter or Space presses the main button. Scroll, pinch or - / + to zoom. Hover or tap a square for details, and tap a player card for everything about that player.',
    ),
  ];
}

function stocks(G: GameState | null): Node[] {
  const dynamic = !G || G.stocks === 'dynamic';
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return [
    ...sec(
      'Buying and selling',
      `Each district has its own stock. Buy shares (up to ${K.maxBuy} at a time) when you stop at the bank or a stock broker, or when you are promoted. Sell any time before you roll.`,
    ),
    ...sec(
      'Dividends',
      `Every fee paid at a shop pays a dividend to everyone holding that district's stock, so shares in a busy district earn money on every rival's visit.`,
    ),
    ...(dynamic
      ? [
          ...sec(
            'What sets the price',
            'The price follows the shops in the district: their starting value sets the base price, and shop growth raises it more gently. A 50% rise in average shop value adds 37.5% to the underlying share price before other boosts.',
          ),
          ...sec(
            'Demand and volatility',
            'Shares everyone holds push the price up too. How much depends on the district: Calm districts move least, Normal ones more, Wild ones the most. The stock market shows each mood. You trade at the average price across your trade.',
          ),
          ...sec(
            'Sell-offs',
            `Selling ${K.sellOff}+ shares of one district in a turn shakes it: ${pct(K.dent)} off its price, more the more you sell (150 shares: -18%), stacking down to -${pct(1 - K.confMin)}. The seller is paid the price before the drop. Shares bought back (10 per 1%) and investing in the district's shops (100G per 1%) repair it.`,
          ),
        ]
      : sec(
          'What sets the price',
          `The price follows the average shop value in the district. Buying or selling ${K.bigTrade}+ shares at once moves it ${pct(K.tradeUp - 1)}.`,
        )),
    ...sec(
      'Stock and net worth',
      'Your shares count toward your net worth at the current price, and you can sell them to cover debt.',
    ),
  ];
}

function plots(): Node[] {
  const pick = (b: string) => (b === 'star3' ? 'star0' : b === 'circus' ? 'circus0' : b) as PropKey;
  return [
    h(
      'p',
      null,
      `Some properties start as empty plots (set in game setup). The first player to stop on one may build on it. Each building can be built at most ${K.buildingLimit} times, unless every property is a plot. Before rolling you can renovate a building into another for ${fmt(K.renovate)} plus the new building's price.`,
    ),
    h(
      'div',
      { class: 'guide-plots' },
      ...BUILDINGS.map((b) =>
        h(
          'div',
          { class: 'guide-plot' },
          h('img', { src: propIconURL(pick(b.b), '#4c8dff'), alt: '' }),
          h(
            'div',
            null,
            h('div', { class: 'guide-plot-head' }, h('b', null, b.name), h('span', null, fmt(b.cost))),
            h('p', null, h('em', null, 'Rival stops: '), BUILDING_INFO[b.b].rival),
            h('p', null, h('em', null, 'You stop: '), BUILDING_INFO[b.b].owner),
            b.b === 'circus'
              ? h(
                  'p',
                  { class: 'guide-note' },
                  `Upgrades cost ${K.circusUp.map(fmt).join(' / ')}, one each time you stop there.`,
                )
              : null,
          ),
        ),
      ),
    ),
  ];
}

/** The same card data drives the game and this reference, so descriptions stay in sync. */
function ventureCards(easy: boolean): Node[] {
  return [
    ...sec(
      'Venture cards',
      'Match the number on a flipped tile to its card below. Stock cards are marked Standard only and are not drawn in Easy rules.',
    ),
    h(
      'ol',
      { class: 'guide-cards' },
      ...[...CARD_LIST]
        .sort((a, b) => a.number - b.number)
        .map((card) =>
          h(
            'li',
            { class: 'guide-card', value: card.number },
            h(
              'div',
              { class: 'guide-card-heading' },
              h('b', null, `#${card.number} · ${card.title}`),
              card.std
                ? h(
                    'span',
                    { class: 'guide-note' },
                    easy ? 'Standard only · not in this game' : 'Standard only',
                  )
                : null,
            ),
            h('p', null, card.text),
          ),
        ),
    ),
  ];
}
