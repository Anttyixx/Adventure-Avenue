/**
 * The game guide: a pop-up in the middle of the screen (the Guide button in the toolbar) with a
 * tab per topic: the basic rules, stocks, vacant plot buildings, the arcade games and numbered
 * venture cards. Each topic is a card with an icon, a title and a few short points.
 */
import { BUILDABLE, buildingsLeft, CARD_LIST, K, REEL_PRIZES, type GameState } from '@aa/engine';
import { propertyIconURL } from '../art';
import { coinIconURL, starIconURL, suitIconURL, wildIconURL } from '../icons';
import { BUILDING_INFO } from '../names';
import { propIconURL, type PropKey } from '../props';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';

type Tab = 'basics' | 'stocks' | 'plots' | 'arcade' | 'venture';

/** The tab last read, so the guide reopens where the player left it. */
let lastTab: Tab = 'basics';

export function guideModal(hud: Hud, G: GameState | null, initialTab?: Tab) {
  const easy = G?.rules === 'easy';
  // Easy rules have no stocks or vacant plots.
  const tabs: [Tab, string][] = easy
    ? [
        ['basics', 'Basics'],
        ['arcade', 'Arcade games'],
        ['venture', 'Venture cards'],
      ]
    : [
        ['basics', 'Basics'],
        ['stocks', 'Stocks'],
        ['plots', 'Vacant plots'],
        ['arcade', 'Arcade games'],
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
            : tab === 'arcade'
              ? arcade()
              : plots(G)),
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

/** One topic: an icon, a title, then short paragraphs or a list of points. */
function card(title: string, icon: string | null, ...body: (string | Node | null)[]): HTMLElement {
  return h(
    'section',
    { class: 'guide-sec' },
    h('div', { class: 'gs-head' }, icon ? h('img', { src: icon, alt: '' }) : null, h('h4', null, title)),
    ...body.map((b) => (typeof b === 'string' ? h('p', null, b) : b)),
  );
}
const points = (...items: (string | Node)[]) =>
  h('ul', { class: 'gs-list' }, ...items.map((i) => h('li', null, i)));
const grid = (...cards: HTMLElement[]) => h('div', { class: 'guide-grid' }, ...cards);
const intro = (text: string) => h('p', { class: 'guide-intro' }, text);

function basics(G: GameState | null): Node[] {
  const easy = G?.rules === 'easy';
  const target = G?.target ?? K.defaultTarget;
  const shop = propertyIconURL('shop', 1, '#4c8dff');
  return [
    grid(
      card(
        'The goal',
        coinIconURL(),
        points(
          `Roll the die (1 to ${K.dieSides}) and move around the town.`,
          `Reach the target net worth (${fmt(target)} in this game), then get back to the bank to win.`,
          `Net worth = cash + property value${easy ? '' : ' + stock'}.`,
        ),
      ),
      card(
        'Shops',
        shop,
        points(
          'Stop on an empty shop to buy it.',
          'Rivals who stop on your shop pay you a fee.',
          `Owning more of a ${easy ? 'row' : 'district'} raises fees and values there.`,
          'Stop on your own shop to invest and grow its value.',
        ),
      ),
      card(
        'Buyouts',
        shop,
        `After paying a rival's fee you may buy their shop for ${K.buyoutX}× its value (the owner gets ${K.buyoutOwnerX}×).`,
      ),
      card(
        'Suits and promotion',
        suitIconURL(1, true),
        points(
          'Collect the four suits ♠ ♥ ♦ ♣ from suit squares and cards.',
          `Then pass the bank to be promoted: a salary of ${fmt(K.salaryBase)} + ${fmt(K.salaryLevel)} per level + ${Math.round(K.salaryShop * 100)}% of your shops' value.`,
          'A wild card counts as any missing suit.',
        ),
      ),
      card(
        'Special squares',
        wildIconURL(),
        points(
          'Venture (and suit squares): flip a venture card.',
          'Roll on: roll again. Take a break: your shops close until your next turn.',
          'Boon and Boom: earn a share of the fees others pay.',
          'Warp: stop on it to jump to its partner, or gold ones to the bank. Portals beside tiles: step through to the matching portal (arrows show one-way ones).',
          'Cannon: fire to another player. Arcade: play a game (see the Arcade games tab).',
          'Price Up: your fees are 10% higher until your next turn. Taxi: ride to any special square and use it. Swap: trade places with any player.',
        ),
      ),
      card(
        'Before rolling',
        null,
        `You can ${easy ? '' : 'sell stock, '}propose a trade, auction a property or renovate a building.`,
      ),
      card(
        'Debt',
        null,
        points(
          'Purchases can take you below 0G.',
          'Still below 0 at the end of your turn? Sell stock or property.',
          'With nothing left to sell you go bankrupt, and the richest player wins.',
        ),
      ),
      card(
        'Controls',
        null,
        points(
          'Enter or Space presses the main button.',
          'Scroll, pinch or - / + to zoom; tap the zoom % to reset.',
          'Hover or tap a square for details; tap a player card for everything about that player.',
        ),
      ),
    ),
  ];
}

function stocks(G: GameState | null): Node[] {
  const dynamic = !G || G.stocks === 'dynamic';
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return [
    grid(
      card(
        'Buying and selling',
        coinIconURL(),
        points(
          'Each district has its own stock.',
          `Buy up to ${K.maxBuy} shares at a time when you stop at the bank or a stock broker, or when you are promoted.`,
          'Sell any time before you roll.',
        ),
      ),
      card(
        'Dividends',
        null,
        "Every fee paid at a shop pays a dividend to everyone holding that district's stock, so shares in a busy district earn on every rival's visit.",
      ),
      ...(dynamic
        ? [
            card(
              'What sets the price',
              null,
              'The price follows the shops in the district: their starting value sets the base price, and shop growth raises it more gently. A 50% rise in average shop value adds 31.25% to the share price before other boosts.',
            ),
            card(
              'Demand and volatility',
              null,
              points(
                'Shares everyone holds push the price up too.',
                'Calm districts move least, Normal ones more, Wild ones the most (the stock market shows each mood).',
                'You trade at the average price across your trade.',
              ),
            ),
            card(
              'Sell-offs',
              null,
              points(
                `Selling ${K.sellOff}+ shares of one district in a turn drops its price ${pct(K.dent)} (more the more you sell; 150 shares: -21.6%), down to -${pct(1 - K.confMin)} at most.`,
                'The seller is paid the price before the drop.',
                "Buying back (10 shares per 1%) and investing in the district's shops (100G per 1%) repair it.",
              ),
            ),
          ]
        : [
            card(
              'What sets the price',
              null,
              `The price follows the average shop value in the district. Buying or selling ${K.bigTrade}+ shares at once moves it ${pct(K.tradeUp - 1)}.`,
            ),
          ]),
      card(
        'Stock and net worth',
        null,
        'Your shares count toward your net worth at the current price, and you can sell them to cover debt.',
      ),
    ),
  ];
}

/** Every arcade game: how it plays and what it pays. */
function arcade(): Node[] {
  const D = K.derby;
  const tag = (everyone: boolean) =>
    h('span', { class: `gs-tag ${everyone ? 'all' : ''}` }, everyone ? 'Everyone plays' : 'Solo');
  const reelPrizes = h(
    'div',
    { class: 'gs-prizes' },
    ...REEL_PRIZES.slice(1)
      .map((name, i) => [name, K.reels.prizes[i + 1]] as const)
      .reverse()
      .map(([name, n]) => h('div', null, h('span', null, name), h('b', null, `${fmt(n)} × level`))),
  );
  return [
    intro('Stop on the arcade to play one of these five games, picked at random.'),
    grid(
      card(
        'Lucky Reels',
        starIconURL(),
        tag(false),
        points(
          'Five slots roll. Tap the ones you want to keep, then reroll the rest.',
          `Up to ${K.reels.rerolls} rerolls; take the prize whenever you like.`,
          'Only your best set pays:',
        ),
        reelPrizes,
      ),
      card(
        'Memory Blocks',
        coinIconURL(),
        tag(false),
        points(
          'Nine cards flip face up for a moment, then face down.',
          'Pick the card you think hides the best prize.',
          `Prizes: shops +${Math.round(K.memory.shopsUp * 100)}% (two cards), ${fmt(K.memory.gold)} × level (two), a wild card (one), ${fmt(K.memory.small)} (two) and shops -${Math.round(K.memory.shopsDown * 100)}% (two).`,
        ),
      ),
      card(
        'Coin Derby',
        coinIconURL(),
        tag(true),
        points(
          `Everyone races down a ${D.track}-space track over ${D.legs} legs.`,
          `Each leg, secretly pick Sprint (move ${D.sprint[0]}-${D.sprint[1]} spaces) or Grab coins (move ${D.grab[0]}-${D.grab[1]} and take ${fmt(D.grabCoins)}).`,
          `Furthest after the last leg wins ${fmt(D.winner)} × level; everyone keeps their coins.`,
        ),
      ),
      card(
        'Lucky Wheel',
        suitIconURL(2, true),
        tag(true),
        points(
          `Everyone may bet up to ${fmt(K.wheel.maxBet)} (or skip).`,
          `The wheel has ${K.wheel.spaces} numbers: odd are red, even are blue.`,
          'Bet on a color (wins 1× your bet) or a group of four numbers (wins 2×).',
          'A losing bet loses what you bet.',
        ),
      ),
      card(
        'Treasure Split',
        coinIconURL(),
        tag(true),
        points(
          `${K.treasure.rounds} rounds. Everyone secretly picks the ${K.treasure.chests.map(fmt).join(', ')} chest.`,
          'Anyone who picks the same chest shares it equally.',
          'Big chests are tempting, but busy ones split thin!',
        ),
      ),
    ),
    intro(
      'In the "Everyone plays" games, everyone chooses at the same time and locks in. Choices stay secret until all have locked in.',
    ),
  ];
}

function plots(G: GameState | null): Node[] {
  const pick = (b: string) => (b === 'star3' ? 'star0' : b === 'circus' ? 'circus0' : b) as PropKey;
  return [
    h(
      'p',
      { class: 'guide-intro' },
      `Every district has four properties. Game setup randomly makes 0, 1, 2, 3 or 4 of them vacant for None, A few, Some, A lot or All. The first player to stop on one may build on it. Each building can be built at most ${K.buildingLimit} times, unless every property is a plot. Before rolling you can renovate a building into another for ${fmt(K.renovate)} plus the new building's price.`,
    ),
    h(
      'div',
      { class: 'guide-plots' },
      ...BUILDABLE.map((b) =>
        h(
          'div',
          { class: 'guide-plot' },
          h('img', { src: propIconURL(pick(b.b), '#4c8dff'), alt: '' }),
          h(
            'div',
            null,
            h(
              'div',
              { class: 'guide-plot-head' },
              h('b', null, b.name),
              // In a game: how many more of it this board allows.
              G && buildingsLeft(G, b.b) != null
                ? h('small', { class: 'guide-left' }, `${buildingsLeft(G, b.b)} left to build`)
                : null,
              h('span', null, fmt(b.cost)),
            ),
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
    intro(
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
