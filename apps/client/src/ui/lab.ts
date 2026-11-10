/**
 * UI Lab: a sandbox page (#ui-lab) for viewing and testing UI elements without playing a game.
 * It builds a sample match (a few rounds played by CPUs), shows the real board and HUD, and a
 * control panel that triggers each element: player card states, prompts, banners, board
 * effects, dialogs, the venture grid, arcade minigames, the log, the market and the results.
 */
import {
  netWorth,
  BUILDABLE,
  BUILT_IN_BOARDS,
  CARD_LIST,
  Game,
  K,
  PLAYER_COLORS,
  cloneState,
  cpuIO,
  isShopLike,
  lineBonus,
  linesThrough,
  newGame,
  ownedShops,
  ranking,
  investRoom,
  market,
  neighborCells,
  type BoardDef,
  type BuildingKey,
  type GameState,
  type Player,
  type TradeOffer,
} from '@aa/engine';
import { SHOP_TIERS, SHOP_TIER_NAMES, STAR3_TIERS, STAR3_TIER_NAMES, propertyIconURL } from '../art';
import { propIconURL, ART_SOURCES, type PropKey } from '../props';

/** The grey unowned property art is drawn in (as on the board). */
const UNOWNED_ART = '#8a94a8';
import { BoardView, ZOOM_STEP, portalGates } from '../board';
import { ZOOM_MAX_OUT } from '../zoom';
import { CHARACTERS, shuffledCharacters } from '../sprites';
import { clear, fmt, h } from './dom';
import { shortName } from '../names';
import { VentureView } from './games';
import { HotSeat } from '../host';
import { luckyReels, memoryBlocks, coinDerby, luckyWheel, treasureSplit } from '@aa/engine';
import { Hud } from './hud';
import { paymentActivity, paymentLogMatches } from './activity';
import { clearGuest, loadGuest, saveGuest } from '../save';
import { mainMenu, openPlayerCard } from './menu';
import { openEditor } from './editor';
import { openCollection } from './collection';
import { openWhatsNew } from './whatsnew';
import { openCredits } from './credits';
import { pickCharacter } from './charpick';
import { resumeLobby } from './online';
import { soundControls } from './soundpanel';
import { SFX_NAMES, TRACK_NAMES, sound, type Track } from '../audio';
import { guestSetup, setupScreen, type SetupRoom } from './start';
import type { LobbyInfo, LobbySeat } from '../net/protocol';
import type { LocalSeat } from '../net/hostroom';
import { buildPrompt, districtStockModal, stockModal } from './modals';
import { guideModal } from './guide';
import { showResults } from './results';
import { investOnBoard } from './invest';
import { AuctionView, LiveAuction } from './auction';
import { confettiRain } from './confetti';
import { TIMING as T } from '../timing';
import { BUILD, VERSION_LABEL } from '../build';
import { inviteURL } from '../net/protocol';
import {
  answerTradeOnBoard,
  auctionOnBoard,
  buyoutPrompt,
  buyOnBoard,
  feeIfOwned,
  question,
  cannonOnBoard,
  debtOnBoard,
  motelPrompt,
  renovateOnBoard,
  tradeOnBoard,
} from './pick';

export const LAB_SECTIONS = [
  { id: 'cards', title: 'Player cards' },
  { id: 'prompts', title: 'Action bar & banners' },
  { id: 'board', title: 'Board effects' },
  { id: 'dialogs', title: 'Dialogs' },
  { id: 'games', title: 'Venture' },
  { id: 'arcade', title: 'Arcade Lab' },
  { id: 'art', title: 'Property designs' },
  { id: 'panels', title: 'Log, market & results' },
] as const;

/**
 * The control panel's tabs, each holding some sections. "New" shows only the controls in
 * `RECENT`, wherever they are.
 */
const LAB_TABS: { id: string; title: string; sections: string[] }[] = [
  { id: 'new', title: 'New', sections: [] },
  { id: 'players', title: 'Players', sections: ['cards'] },
  { id: 'bar', title: 'Action bar', sections: ['prompts'] },
  { id: 'board', title: 'Board', sections: ['board'] },
  { id: 'dialogs', title: 'Dialogs', sections: ['dialogs'] },
  { id: 'games', title: 'Games', sections: ['games', 'arcade'] },
  { id: 'panels', title: 'Panels', sections: ['panels'] },
  { id: 'art', title: 'Art & sound', sections: ['art', 'sound'] },
  { id: 'screens', title: 'Menus', sections: ['screens'] },
];
const LAB_TAB_KEY = 'aa-lab-tab';
/** Whether the controls pop-up was open (opened and closed with the version chip). */
const LAB_OPEN_KEY = 'aa-lab-open';

const rnd = (n: number) => Math.floor(Math.random() * n);

/**
 * Controls for UI elements that were just added or changed: they shake once and glow so they
 * are easy to find. Update this list with each change.
 */
const RECENT = new Set([
  'Cards: list',
  'Cards: stack',
  'Cards: smart',
  'Cards: open the stack',
  'Smart stack: pay someone else',
]);

/**
 * Which board the lab plays on: Town with portal links (square, the default) or Twin Lakes (hex),
 * remembered per browser.
 */
const LAB_BOARD_KEY = 'aa-lab-board';
function labBoard(): 'twin-lakes' | 'portals' {
  try {
    return localStorage.getItem(LAB_BOARD_KEY) === 'hex' ? 'twin-lakes' : 'portals';
  } catch {
    return 'portals';
  }
}

/**
 * Town with every kind of portal link across its park: a two-way pair, and two entrances on the
 * top road leading to one exit on the bottom road.
 */
function portalTown(): BoardDef {
  const b = structuredClone(BUILT_IN_BOARDS.find((x) => x.id === 'town') ?? BUILT_IN_BOARDS[0]);
  const at = (x: number, y: number) => b.squares.findIndex((s) => s.x === x && s.y === y);
  // Tiles on the top and bottom roads whose park side (down, side 2; up, side 3) is empty.
  const open = (y: number, side: number) =>
    b.squares.flatMap((s, i) => {
      const [nx, ny] = neighborCells(b.layout, s.x, s.y)[side];
      return s.y === y && at(nx, ny) < 0 ? [i] : [];
    });
  const ys = b.squares.map((s) => s.y);
  const top = open(Math.min(...ys), 2);
  const bottom = open(Math.max(...ys), 3);
  b.id = 'lab-portals';
  b.name = 'Town with portals';
  b.portalLinks = [
    { a: top[1], sa: 2, b: bottom[1], sb: 3 },
    { a: top[4], sa: 2, b: bottom[5], sb: 3, oneWay: true },
    { a: top[6], sa: 2, b: bottom[5], sb: 3, oneWay: true },
  ];
  return b;
}

/**
 * The board builder opened over the Lab on `start`, with the control `press` (a CSS selector)
 * pressed once it's open, and a Back to UI Lab button.
 */
function openLabBuilder(root: HTMLElement, start: BoardDef | null, press: string | null, onPlay: () => void) {
  const holder = h('div', { class: 'lab-screen' });
  root.append(holder);
  const close = openEditor(holder, start, {
    onExit: () => holder.remove(),
    onPlay: () => {
      holder.remove();
      onPlay();
    },
  });
  if (press) holder.querySelector<HTMLButtonElement>(press)?.click();
  holder.append(
    h(
      'button',
      {
        class: 'btn small lab-back',
        onclick: () => {
          close();
          holder.remove();
        },
      },
      'Back to UI Lab',
    ),
  );
}

/** A sample match; `playSample` then plays a few rounds so cards, the board and the log have content. */
function sampleState(): GameState {
  const names = ['Rosa', 'Milo', 'Juno', 'Kai'];
  const chars = shuffledCharacters(names.length);
  return newGame({
    rules: 'standard',
    target: 5000,
    roundCap: 0,
    ...(labBoard() === 'portals' ? { board: portalTown() } : { boardId: labBoard() }),
    seats: names.map((name, i) => ({ name, cpu: true, ch: chars[i] })),
  });
}

/**
 * Put one of every building on the board (spread out, owners taking turns) so their art can be
 * seen in place. Uses shops nobody owns where it can.
 */
function showcaseBuildings(G: GameState) {
  const missing = BUILDABLE.filter((b) => !G.nodes.some((s) => s.b === b.b));
  const shops = G.nodes.filter((s) => s.t === 'shop');
  const free = shops.filter((s) => s.owner < 0);
  const pool = free.length >= missing.length ? free : shops;
  missing.forEach((b, i) => {
    const sq = pool[Math.floor(((i + 0.5) * pool.length) / missing.length)];
    sq.t = 'plot';
    sq.b = b.b;
    sq.value = b.cost;
    sq.lv = b.b === 'circus' ? 1 : 0;
    sq.toll = K.toll0;
    sq.owner = G.players[i % G.players.length].id;
  });
}

async function playSample(G: GameState, turns: number) {
  const game = new Game(
    G,
    cpuIO(() => G),
  );
  for (let i = 0; i < turns && !G.over; i++) await game.playTurn();
  // Show the first two seats as humans so the P1/P2 tags appear.
  G.players[0].cpu = false;
  G.players[1].cpu = false;
}

/**
 * Give every player some shares in a few districts (CPU sample games rarely buy any), so the
 * stock tables, net worth breakdowns and player pages show stock.
 */
function sampleStocks(G: GameState) {
  G.players.forEach((p, i) => {
    p.shares = G.districts.map(() => 0);
    for (let k = 0; k < 3; k++) {
      const d = (i * 2 + k * 3) % G.districts.length;
      p.shares[d] += 10 + ((i * 7 + k * 13) % 5) * 10;
    }
  });
}

/** Bonus lines and payout for a venture panel, as the engine would compute them. */
function labLines(owner: number[], panel: number, pid: number): [number[][], number] {
  const lines = linesThrough(owner, panel, pid);
  return [lines, lines.reduce((s, l) => s + lineBonus(l.length), 0)];
}

export async function openLab(app: HTMLElement, section?: string) {
  const G = sampleState();
  await playSample(G, 24);
  showcaseBuildings(G);
  sampleStocks(G);
  const game = new Game(G, { decide: () => new Promise(() => {}), emit: () => {} });

  const root = h('div', { class: 'game lab' });
  app.append(root);
  const boardHost = h('div', { class: 'board-host' });
  root.append(boardHost);
  const board = new BoardView(boardHost);
  board.onGate = (opening) => sound.play(opening ? 'shutterUp' : 'shutterDown');
  const hud = new Hud(root, board, {
    onToggleFast: () => hud.tick('Fast CPU only affects real games.'),
    onQuit: () => {
      location.hash = '';
      location.reload();
    },
    onGuide: () => guideModal(hud, G),
    quitQuestion: () => 'Leave the UI Lab and go back to the main menu?',
  });
  board.zoomOut = 1;
  hud.setFastLabel(false);
  // The build being tested, in its own chip right of the info chip. It opens and closes the
  // controls pop-up.
  const verChip = h(
    'button',
    {
      class: 'lab-ver glass',
      title: `Build ${BUILD.sha} from ${BUILD.branch}. Tap to open or close the UI Lab.`,
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
    },
    h('span', { class: 'lab-ver-tag' }, 'UI Lab'),
    `${VERSION_LABEL} ${BUILD.branch} ${BUILD.sha}`,
  ) as HTMLButtonElement;
  hud.infoChip.after(verChip);

  let target = 0;
  const cur = (): Player => G.players[target];
  const refresh = () => {
    board.dirty = true;
    board.snapTokens();
    hud.render(G);
  };
  const setActive = (pid: number) => {
    board.activePid = pid;
    board.followPid = pid;
    hud.activePid = pid;
    refresh();
  };
  board.setState(G);
  setActive(G.order[G.turn]);
  hud.tick('UI Lab: tap the version chip (top left) to open or close the controls.');

  const pick = { hud, board, G };
  const result = (label: string, v: unknown) => {
    const text = v === undefined ? 'closed' : JSON.stringify(v);
    hud.tick(`${label} returned: ${text.length > 120 ? text.slice(0, 117) + '...' : text}`);
  };

  // ------------------------------------------------------------ control panel

  const panel = h('div', { class: 'lab-panel glass', role: 'dialog', 'aria-label': 'UI Lab' });
  const body = h('div', { class: 'lab-body' });
  /** Open or close the controls pop-up (remembered on this device). */
  const setOpen = (on: boolean) => {
    panel.hidden = !on;
    verChip.classList.toggle('on', on);
    verChip.setAttribute('aria-expanded', String(on));
    try {
      localStorage.setItem(LAB_OPEN_KEY, on ? '1' : '0');
    } catch {
      /* not remembered */
    }
  };
  verChip.onclick = () => setOpen(panel.hidden);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden && !document.querySelector('.modal-wrap')) setOpen(false);
  });
  // Search: shows only the controls (or sections) whose names match, across every category.
  const search = h('input', {
    class: 'lab-search',
    type: 'search',
    placeholder: 'Search controls...',
    'aria-label': 'Search controls',
  }) as HTMLInputElement;
  // Categories, down the left side: each shows a few sections; "New" shows only the glowing
  // (recently changed) controls.
  let tab = 'new';
  try {
    const saved = localStorage.getItem(LAB_TAB_KEY);
    if (saved && LAB_TABS.some((t) => t.id === saved)) tab = saved;
  } catch {
    /* private mode: start on New */
  }
  const rail = h('nav', { class: 'lab-rail', role: 'tablist', 'aria-orientation': 'vertical' });
  const filter = () => {
    const q = search.value.trim().toLowerCase();
    const shown = LAB_TABS.find((t) => t.id === tab)!;
    for (const b of rail.querySelectorAll<HTMLElement>('.lab-cat')) {
      const on = b.dataset.tab === tab && !q;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    let hits = 0;
    for (const sec of body.querySelectorAll<HTMLElement>('.lab-sec')) {
      const title = sec.querySelector('h4')?.textContent?.toLowerCase() ?? '';
      const inTab = tab === 'new' || shown.sections.includes(sec.dataset.sec ?? '');
      const whole = q ? title.includes(q) : tab !== 'new';
      let any = false;
      for (const b of sec.querySelectorAll<HTMLElement>('.lab-row > button')) {
        const hit = q
          ? whole || (b.textContent ?? '').toLowerCase().includes(q)
          : inTab && (whole || b.classList.contains('lab-new'));
        b.hidden = !hit;
        any ||= hit;
        if (hit) hits++;
      }
      // Sections without buttons (e.g. the sound sliders) show with their category.
      sec.hidden = q ? !any && !whole : !inTab || (tab === 'new' ? !any : false);
      // Rows left empty by the filter take no space.
      for (const r of sec.querySelectorAll<HTMLElement>('.lab-row')) {
        const btns = [...r.children].filter((c) => c.tagName === 'BUTTON') as HTMLElement[];
        r.hidden = btns.length > 0 && btns.every((b) => b.hidden);
      }
    }
    empty.hidden = hits > 0 || [...body.querySelectorAll('.lab-sec')].some((x) => !(x as HTMLElement).hidden);
  };
  const empty = h('p', { class: 'lab-empty hint', hidden: true }, 'No controls match.');
  for (const t of LAB_TABS)
    rail.append(
      h(
        'button',
        {
          class: 'lab-cat',
          role: 'tab',
          'data-tab': t.id,
          onclick: () => {
            tab = t.id;
            search.value = '';
            try {
              localStorage.setItem(LAB_TAB_KEY, tab);
            } catch {
              /* not remembered */
            }
            filter();
            body.scrollTop = 0;
          },
        },
        h('span', { class: 'lab-cat-name' }, t.title),
        h('span', { class: 'lab-cat-n' }),
      ),
    );
  search.oninput = filter;
  // The target player: the one player-related controls act on.
  const pickerRow = h('div', { class: 'lab-players', role: 'group', 'aria-label': 'Target player' });
  panel.append(
    h(
      'div',
      { class: 'lab-head' },
      h('h3', null, 'UI Lab'),
      search,
      h(
        'button',
        { class: 'lab-close', 'aria-label': 'Close the UI Lab', onclick: () => setOpen(false) },
        '×',
      ),
    ),
    h('div', { class: 'lab-target' }, h('span', { class: 'lab-target-label' }, 'Player'), pickerRow),
    h('div', { class: 'lab-main' }, rail, h('div', { class: 'lab-body-wrap' }, body, empty)),
  );
  root.append(panel);
  let startOpen = true;
  try {
    startOpen = localStorage.getItem(LAB_OPEN_KEY) !== '0';
  } catch {
    /* open */
  }
  setOpen(startOpen || !!section);

  const sections = new Map<string, HTMLElement>();
  const addSection = (id: string, title: string, note?: string) => {
    const el = h(
      'section',
      { class: 'lab-sec', id: `lab-${id}`, 'data-sec': id },
      h('h4', null, title),
      note ? h('p', { class: 'hint' }, note) : null,
    );
    body.append(el);
    sections.set(id, el);
    return el;
  };
  const row = (sec: HTMLElement, ...buttons: HTMLElement[]) =>
    sec.append(h('div', { class: 'lab-row' }, ...buttons));
  const btn = (label: string, fn: () => unknown) =>
    h(
      'button',
      {
        // Controls for things changed recently shake once and keep a soft glow.
        class: `btn small ${RECENT.has(label) ? 'lab-new' : ''}`,
        title: RECENT.has(label) ? 'Recently updated' : null,
        onclick: async () => {
          try {
            await fn();
          } catch (err) {
            console.error(err);
            hud.tick(`Error: ${(err as Error).message}`);
          }
        },
      },
      label,
    );

  // Player picker shared by the sections (in the pop-up's header).
  const drawPicker = () => {
    clear(pickerRow);
    G.players.forEach((p, i) =>
      pickerRow.append(
        h(
          'button',
          {
            class: `lab-player ${i === target ? 'on' : ''}`,
            style: `--pc:${PLAYER_COLORS[p.color]}`,
            'aria-pressed': String(i === target),
            onclick: () => {
              target = i;
              drawPicker();
            },
          },
          p.name,
        ),
      ),
    );
  };
  drawPicker();

  // Player cards
  {
    const s = addSection('cards', 'Player cards', 'Changes apply to the target player.');
    row(
      s,
      ...['♠', '♥', '♦', '♣'].map((c, i) =>
        btn(`Toggle ${c}`, () => {
          cur().suits[i] = !cur().suits[i];
          refresh();
        }),
      ),
    );
    row(
      s,
      btn('+ Wild card', () => {
        cur().wild++;
        refresh();
      }),
      btn('- Wild card', () => {
        cur().wild = Math.max(0, cur().wild - 1);
        refresh();
      }),
      btn('Level up', () => {
        cur().level++;
        refresh();
      }),
      btn('Info: player page', () => hud.toggleInfo(cur().id)),
      btn('Stocks: random for everyone', () => {
        for (const p of G.players)
          p.shares = G.districts.map(() => (Math.random() < 0.4 ? 10 * (1 + rnd(8)) : 0));
        refresh();
        hud.tick('Every player now holds some random shares.');
      }),
      btn('Stocks: +10 shares (target)', () => {
        const d = rnd(G.districts.length);
        cur().shares[d] += 10;
        refresh();
        hud.tick(`${cur().name} got 10 ${G.districts[d].name} shares.`);
      }),
      btn('Stocks: clear (target)', () => {
        cur().shares = G.districts.map(() => 0);
        refresh();
      }),
      btn('Swap characters', () => {
        // Every player moves on to the next character, to see each one on the player cards.
        for (const p of G.players) {
          const i = CHARACTERS.findIndex((c) => c.id === p.ch);
          p.ch = CHARACTERS[(i + G.players.length) % CHARACTERS.length].id;
        }
        refresh();
      }),
    );
    row(
      s,
      btn('Reach the target (can win)', () => {
        cur().cash += Math.max(0, G.target - netWorth(G, cur()));
        refresh();
      }),
      btn('+500G cash', () => {
        cur().cash += 500;
        refresh();
      }),
      btn('-500G cash', () => {
        cur().cash -= 500;
        refresh();
      }),
    );
    row(
      s,
      btn('Toggle Closed', () => {
        cur().onBreak = !cur().onBreak;
        refresh();
      }),
      btn('Toggle Boon', () => {
        cur().boon = cur().boon === K.boon ? 0 : K.boon;
        refresh();
      }),
      btn('Toggle Boom', () => {
        cur().boon = cur().boon === K.boom ? 0 : K.boom;
        refresh();
      }),
      btn('Toggle Fees +30%', () => {
        cur().boost = cur().boost > 1 ? 1 : K.boostRate;
        refresh();
      }),
    );
    row(
      s,
      btn('Make active', () => setActive(cur().id)),
      btn('Longest name (10 letters)', () => {
        cur().name = 'Maximilian';
        refresh();
      }),
      btn('Cards: list', () => hud.setCardsMode('list')),
      btn('Cards: stack', () => hud.setCardsMode('stack')),
      btn('Cards: smart', () => hud.setCardsMode('smart')),
      // A folded stack opens into a list for a moment, as when tapped (the layout buttons glide up).
      btn('Cards: open the stack', () => {
        if (hud.cardsMode === 'list') hud.setCardsMode('stack');
        window.setTimeout(() => hud.openStack('tap'), 600);
      }),
      // A player who isn't up gets paid: in a smart stack their card rises out for a moment.
      btn('Smart stack: pay someone else', () => {
        if (hud.cardsMode !== 'smart') hud.setCardsMode('smart');
        const others = G.players.filter((p) => p.id !== hud.activePid && !p.bankrupt);
        const p = others[rnd(others.length)];
        if (!p) return;
        p.cash += 100 + rnd(4) * 50;
        refresh();
      }),
      btn('Next player (card stack)', () => {
        const i = G.order.indexOf(hud.activePid);
        setActive(G.order[(i + 1) % G.order.length]);
      }),
      btn('Toggle bankrupt', () => {
        cur().bankrupt = !cur().bankrupt;
        refresh();
      }),
      btn('Toggle CPU / human', () => {
        cur().cpu = !cur().cpu;
        refresh();
      }),
    );
  }

  // Prompts and banners
  {
    const s = addSection('prompts', 'Action bar & banners');
    row(
      s,
      btn('Action lifecycle', async () => {
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        hud.cancelPrompt();
        hud.action('handoff-demo', `Passing the turn to ${cur().name}...`, 'move');
        await wait(900);
        hud.action('rolling-demo', `${cur().name} is rolling...`, 'move');
        await wait(T.dieRoll);
        hud.action('rolled-demo', `${cur().name} rolled a 4.`, 'move');
        await wait(T.dieHold);
        hud.action('moving-demo', `${cur().name} is moving...`, 'move');
        await wait(300);
        hud.tick(`${cur().name} collected the spade.`, 'suit', T.actionResult, true);
        for (let i = 0; i < 4; i++) {
          await wait(300);
          hud.action('moving-demo', `${cur().name} is moving...`, 'move');
        }
        hud.action('landing-demo', `${cur().name} landed on a shop.`, 'move');
        await wait(T.land);
        hud.action('payment-demo', `${cur().name} bought the property.`, 'property');
      }),
      btn('Event burst → quiet fallback', async () => {
        hud.cancelPrompt();
        hud.action('burst-moving', `${cur().name} is moving...`, 'move');
        hud.tick(`${cur().name} collected the spade.`, 'suit', T.actionResult, true);
        await new Promise((r) => setTimeout(r, 250));
        hud.tick(`${cur().name} paid a shop fee.`, 'money', T.actionResult, true);
        await new Promise((r) => setTimeout(r, 2200));
        hud.action('burst-bank', `${cur().name} reached the bank.`, 'move');
        hud.status(`${cur().name} is deciding what to do...`, 'wait', true);
      }),
      btn('Turn handoff', async () => {
        const next = G.players[(board.followPid + 1) % G.players.length];
        hud.cancelPrompt();
        hud.action('end-turn-demo', 'The previous turn is complete.', 'move');
        await new Promise((r) => setTimeout(r, T.turnEnd));
        board.handoffTo(next.id, T.turnCamera);
        hud.action('handoff-demo', `Passing the turn to ${next.name}...`, 'move');
      }),
      btn('Buy result timing', async () => {
        const copy = cloneState(G);
        const p = copy.players[cur().id];
        const sq = copy.nodes.find((n) => n.t === 'shop')!;
        sq.owner = -1;
        hud.status(`${p.name} is deciding whether to buy the shop...`, 'property', true);
        const yes = await hud.prompt(
          'Buy this property?',
          [
            { label: 'Buy', value: true, main: true },
            { label: 'Pass', value: false },
          ],
          p.color,
        );
        if (!yes) {
          hud.tick(`${p.name} passed on the property.`, 'property');
          return;
        }
        let payment: Extract<import('@aa/engine').GameEvent, { type: 'money' }> | null = null;
        const game = new Game(copy, {
          ...cpuIO(() => copy),
          emit: async (event) => {
            if (event.type === 'money') {
              payment = event;
              const completed = paymentActivity(copy, event);
              if (completed) hud.tick(completed.text, completed.kind);
              await new Promise((resolve) => setTimeout(resolve, T.beforePay + T.money));
            } else if (event.type === 'log' && (!payment || !paymentLogMatches(copy, payment, event.text)))
              hud.tick(event.text, event.kind);
          },
        });
        await game.buySquare(p, sq, sq.value, null, 'bought');
      }),
      btn('Observer result → waiting', () => {
        hud.cancelPrompt();
        hud.tick(`${cur().name} landed on Bay Market.`, 'move', 2500);
        hud.status(`${cur().name} is deciding whether to buy the shop...`, 'property');
      }),
      btn('Text reveal', async () => {
        hud.cancelPrompt();
        hud.tick('Your turn is coming up…', 'wait');
        await new Promise((resolve) => setTimeout(resolve, 650));
        await hud.prompt(
          'Choose a venture tile, then press OK to reveal your reward.',
          [{ label: 'OK', value: true, main: true }],
          cur().color,
        );
      }),
      btn('Repeated status text', async () => {
        hud.cancelPrompt();
        for (let i = 0; i < 8; i++) {
          hud.tick('Waiting for the next player…', 'wait');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }),
      // More choices than fit beside the player cards: the bar spreads over them, blurred behind.
      btn('Action bar: too many choices', async () =>
        result(
          'Too many choices',
          await hud.prompt(
            'A long question that needs a lot of room in the action bar to show every one of its choices',
            Array.from({ length: 12 }, (_, i) => ({ label: `Choice number ${i + 1}`, value: i + 1 })),
            cur().color,
          ),
        ),
      ),
      btn('Action bar resize test', async () => {
        // Includes updates faster than a morph, as happens during chained game events.
        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        const short = () => {
          void hud.prompt('Ready?', [{ label: 'OK', value: true, main: true }]);
        };
        const long = () => {
          void hud.prompt(
            question('Property dividend', [
              [
                'Reward',
                'Receive 30G for every property you own. Buy shares, improve your shops, and return to the bank to collect your promotion.',
              ],
            ]),
            [
              { label: 'OK', value: true, main: true },
              { label: 'Details', value: false },
            ],
            cur().color,
          );
        };
        short();
        await wait(350);
        long();
        await wait(350);
        short();
        await wait(80);
        long();
        await wait(80);
        hud.cancelPrompt();
        hud.status('Waiting for the next player…', 'wait');
        await wait(80);
        long();
        await wait(350);
        short();
      }),
      btn('Turn prompt', async () =>
        result(
          'Turn prompt',
          await hud.prompt(
            `${cur().name}, it's your turn.`,
            [
              { label: 'Roll', value: 'roll', main: true },
              { label: 'Sell stock', value: 'sell' },
              { label: 'Trade', value: 'trade' },
              { label: 'Auction', value: 'auction' },
              { label: 'Renovate', value: 'renovate' },
            ],
            cur().color,
          ),
        ),
      ),
      btn('Buy prompt', async () => {
        const sq = G.nodes.find((s) => s.t === 'shop')!;
        result(
          'Buy prompt',
          await hud.prompt(
            question(`Buy this ${shortName(G, sq)}?`, [
              ['Price', fmt(sq.value), 'big'],
              ['Fee when rivals land here', fmt(feeIfOwned(G, sq.id, cur().id))],
            ]),
            [
              { label: 'Buy', value: true, main: true },
              { label: 'Pass', value: false, secondary: true },
            ],
            cur().color,
          ),
        );
      }),
      btn('Circus upgrade', async () => {
        const sq = G.nodes.find((s) => s.t === 'plot' && s.b === 'circus');
        if (!sq) return hud.tick('This board has no circus.');
        const tier = Math.min(K.circus.length - 1, sq.lv + 1);
        result(
          'Circus upgrade',
          await hud.prompt(
            question('Upgrade your circus?', [
              ['Cost', fmt(500), 'big'],
              [
                'Fee when rivals land here',
                `${fmt(feeIfOwned(G, sq.id, cur().id))} → ${fmt(feeIfOwned(G, sq.id, cur().id, tier))}`,
              ],
            ]),
            [
              { label: 'Upgrade', value: true, main: true },
              { label: 'Not now', value: false, secondary: true },
            ],
            cur().color,
          ),
        );
      }),
      btn('Bid prompt', async () =>
        result(
          'Bid prompt',
          await hud.prompt(
            question('Bid on the Plaza shop?', [
              ['Value', fmt(340)],
              ['High bid (Milo)', fmt(374)],
              ['Your bid', fmt(408), 'big'],
            ]),
            [
              { label: 'Bid 408G', value: true, main: true },
              { label: 'Pass', value: false, secondary: true },
            ],
            cur().color,
          ),
        ),
      ),
    );
    row(
      s,
      btn('Path choice (roll 4)', async () => {
        const p = cur();
        setActive(p.id);
        const dests = game.destinations(p, 4);
        board.setChoices(
          dests.map((d) => d.node),
          PLAYER_COLORS[p.color],
          (id) => hud.resolvePrompt(id),
          new Map(dests.map((d) => [d.node, d.path])),
        );
        const node = await hud.prompt<number>(
          `${p.name} rolled 4. Tap a glowing square to move there.`,
          [],
          p.color,
        );
        board.clearChoices();
        result('Path choice', node);
      }),
      btn('Path choice (watching)', async () => {
        // Another player is choosing: their options glow here (no zoom), then they walk.
        const p = cur();
        setActive(p.id);
        const dests = game.destinations(p, 4);
        board.setChoices(
          dests.map((d) => d.node),
          PLAYER_COLORS[p.color],
          () => {},
          new Map(dests.map((d) => [d.node, d.path])),
          { fit: false },
        );
        hud.status(`${p.name} is choosing where to go...`, 'move', true);
        await new Promise((r) => setTimeout(r, 2500));
        const pick = dests[rnd(dests.length)].node;
        board.previewRoute(pick);
        await new Promise((r) => setTimeout(r, 700));
        board.clearChoices();
        result('They picked', pick);
      }),
      btn('Pick any square', async () => {
        const p = cur();
        board.setChoices(
          G.nodes.map((n) => n.id),
          PLAYER_COLORS[p.color],
          (id) => hud.resolvePrompt(id),
        );
        const id = await hud.prompt<number | null>(
          'Fly to any square. Tap a glowing square.',
          [{ label: 'Skip', value: null, secondary: true }],
          p.color,
        );
        board.clearChoices();
        result('Pick square', id);
      }),
      btn('Gift shares (venture card)', async () =>
        result('Gift shares', await districtStockModal(hud, G, cur(), 'free20')),
      ),
      btn('Bull market (venture card)', async () =>
        result('Bull market', await districtStockModal(hud, G, cur(), 'up20')),
      ),
      btn('Bear market (venture card)', async () =>
        result('Bear market', await districtStockModal(hud, G, cur(), 'down20')),
      ),
    );
    row(
      s,
      btn('Status: last action', () => hud.tick(`${cur().name} bought a shop for 240G.`, 'property')),
      btn('Status: waiting on', () => hud.status(`${cur().name} is buying stocks...`, 'stock')),
      btn('Pass the device', async () => {
        await hud.passDevice(cur());
        result('Pass the device', 'ok');
      }),
    );
    row(
      s,
      btn('Turn banner', () => hud.banner(`${cur().name}'s turn`, PLAYER_COLORS[cur().color], 1300)),
      btn('Round banner', () => hud.banner(`Round ${G.round}`, '#ffd166', 1400)),
      // The round chip leaves first: the turn chip under it glides up into its place.
      btn('Round then turn banners', () => {
        hud.banner(`Round ${G.round}`, '#ffd166', 900);
        hud.banner(`${cur().name}'s turn`, PLAYER_COLORS[cur().color], 2600);
      }),
      btn('Promotion banner', () => {
        board.confetti(cur().id);
        hud.banner(
          `${cur().name} reached level ${cur().level + 1}! +1,250G`,
          PLAYER_COLORS[cur().color],
          2200,
        );
      }),
      btn('Bankrupt banner', () => hud.banner(`${cur().name} went bankrupt!`, '#e5484d', 2400)),
    );
  }

  // Board effects
  {
    const s = addSection('board', 'Board effects', 'Effects play on the target player.');
    const pos = () => board.tokenPos(cur().id);
    // Portal links: the Lab's board (Town) has every kind (a two-way pair, and two entrances
    // leading to one exit). Show one, as a tap does, or open the board in the builder.
    row(
      s,
      ...(['out', 'both'] as const).map((way) =>
        btn(way === 'out' ? 'Portal: entrance to exit' : 'Portal: two-way flow', () => {
          const gate = portalGates(G).find((g) => g.way === way);
          if (!gate) return hud.tick('Switch to the square board to try its portals.');
          board.showPortal(gate);
        }),
      ),
      btn('Travel through a portal', async () => {
        const gate = portalGates(G).find((g) => g.way !== 'out');
        if (!gate) return hud.tick('Switch to the square board to try its portals.');
        const p = cur(),
          was = p.node;
        p.node = gate.node;
        board.snapTokens();
        board.activePid = p.id;
        board.peekWhole = true;
        p.node = gate.to[0];
        try {
          await board.portalStep(p.id, gate.node, p.node, 0);
        } finally {
          p.node = was;
          board.peekWhole = false;
          board.snapTokens();
        }
      }),
      btn('Portal links in the builder', () =>
        openLabBuilder(root, portalTown(), '.ed-tool-button[aria-label="Links"]', () =>
          hud.tick('Board builder test play pressed.'),
        ),
      ),
    );
    row(
      s,
      btn('Roll die', async () => {
        setActive(cur().id);
        await board.rollDie(1 + rnd(K.dieSides));
        // No walk follows here: put the shrunk die away.
        setTimeout(() => (board.die = null), 1200);
      }),
      btn('Roll and walk', async () => {
        // The die shrinks beside the player and counts the steps down as they walk.
        const p = cur();
        setActive(p.id);
        const n = 1 + rnd(K.dieSides);
        // The camera zooms out to frame everywhere the roll could land (zoom it while it waits),
        // and goes back to the player's own zoom with the first step.
        const routes = game.destinations(p, n);
        board.frameIds = [p.node, ...routes.flatMap((r) => r.path)];
        await board.rollDie(n);
        await new Promise((r) => setTimeout(r, 2000));
        board.frameIds = null;
        const route = routes[0].path;
        board.walkTarget = route[route.length - 1];
        for (let i = 0; i < route.length; i++) {
          p.prev = p.node;
          p.node = route[i];
          await board.step(p.id, route[i], route.length - 1 - i);
        }
        board.walkTarget = -1;
        p.prev = -1;
        refresh();
      }),
      btn('Walk 3 squares', async () => {
        const p = cur();
        setActive(p.id);
        const route = game.destinations(p, 3)[0].path;
        board.walkTarget = route[route.length - 1];
        for (let i = 0; i < route.length; i++) {
          p.prev = p.node;
          p.node = route[i];
          await board.step(p.id, route[i], route.length - 1 - i);
        }
        board.walkTarget = -1;
        board.ring(p.node, '#ffffff');
        p.prev = -1;
        refresh();
      }),
      btn('Walk with a stop', async () => {
        // A stop on the way (like a pop-up while passing): the walk cycle stops until it carries on.
        const p = cur();
        setActive(p.id);
        const route = game.destinations(p, 3)[0].path;
        for (let i = 0; i < route.length; i++) {
          p.prev = p.node;
          p.node = route[i];
          await board.step(p.id, route[i], route.length - 1 - i);
          if (i === 0) await new Promise((r) => setTimeout(r, 1500));
        }
        p.prev = -1;
        refresh();
      }),
      btn('Direction arrows', () => {
        setActive(cur().id);
        board.directionsPid = board.directionsPid === cur().id ? -1 : cur().id;
      }),
      btn('Warp', async () => {
        const p = cur();
        const to = rnd(G.nodes.length);
        p.node = to;
        p.prev = -1;
        await board.warp(p.id, to);
        refresh();
      }),
    );
    row(
      s,
      btn('Coins: bank to player', () => {
        board.coins(board.bankPos(), pos(), 6);
        board.floatText(pos().x, pos().y, '+300G', '#7cf29a');
      }),
      btn('Coins: invest in a shop', () => {
        // Investing: the coins fly from the player into one of their shops.
        const sq =
          G.nodes.find((n) => n.owner === cur().id && n.t === 'shop') ?? G.nodes.find((n) => n.t === 'shop')!;
        const to = board.center(sq);
        board.coins(pos(), to, 4);
        board.floatText(pos().x, pos().y + 22, '-200G', '#ff8a8a');
        board.ring(sq.id, '#ffd166', true);
      }),
      btn('Coins: player to rival', () => {
        const q = G.players[(target + 1) % G.players.length];
        const to = board.tokenPos(q.id);
        board.coins(pos(), to, 3);
        board.floatText(pos().x, pos().y + 22, '-120G', '#ff8a8a');
        board.floatText(to.x, to.y, '+120G', '#7cf29a');
      }),
    );
    row(
      s,
      btn('Gold ring + sparkles', () => board.ring(cur().node, '#ffd166', true)),
      btn('White ring', () => board.ring(cur().node, '#ffffff')),
      btn('Confetti', () => board.confetti(cur().id)),
      btn('Tooltip: special square', () => {
        // Hover text for a square that is not a property, in the middle of the screen.
        const sq = G.nodes.find((n) => n.t === 'cannon' || n.t === 'arcade' || n.t === 'boon') ?? G.nodes[0];
        hud.showTooltip(sq.id, window.innerWidth / 2, window.innerHeight / 2);
      }),
      ...([true, false] as const).map((up) =>
        btn(up ? 'Stock rise' : 'Stock fall', async () => {
          // The camera frames the district of the target player's square (or the first).
          const d = Math.max(0, G.nodes[cur().node].d);
          const ids = G.nodes.filter((n) => n.d === d).map((n) => n.id);
          const dist = G.districts[d];
          board.lookAt = board.frameSquares(ids);
          await new Promise((r) => setTimeout(r, T.stockZoom));
          const [a, b] = up ? [12, 14] : [14, 11];
          hud.banner(
            `${dist.name} stock ${up ? 'up' : 'down'}! ${fmt(a)} → ${fmt(b)}`,
            dist.color,
            T.stockRise,
          );
          board.stockFx(ids, T.stockRise, up);
          await new Promise((r) => setTimeout(r, T.stockRise));
          board.lookAt = null;
        }),
      ),
      btn('Victory', async () => {
        const p = cur();
        setActive(p.id);
        const at = board.tokenPos(p.id);
        board.lookAt = { x: at.x, y: at.y - 20, z: board.followZoom() };
        await new Promise((r) => setTimeout(r, T.stockZoom));
        board.dance(p.id, T.victory);
        confettiRain(hud.root, T.victory + 600);
        hud.banner(`${p.name} wins!`, PLAYER_COLORS[p.color], T.victory);
        await new Promise((r) => setTimeout(r, T.victory));
        board.lookAt = null;
      }),
      btn('Promotion dance', () => {
        board.confetti(cur().id);
        board.dance(cur().id);
      }),
      btn('Zoom modes', async () => {
        // The zoom chip's border: blue for auto zoom, red for locked zoom, grey for free zoom.
        const p = cur();
        setActive(p.id);
        hud.tick('Auto zoom (blue): the game frames squares; you can still zoom.');
        board.frameIds = game.destinations(p, 6).flatMap((r) => r.path);
        await new Promise((r) => setTimeout(r, 3000));
        board.frameIds = null;
        hud.tick('Locked zoom (red): only the game moves the zoom.');
        board.showHold = true;
        await new Promise((r) => setTimeout(r, 3000));
        board.showHold = false;
        hud.tick('Free zoom (grey): your own zoom again.');
      }),
      btn('Shops closing', async () => {
        // Close the target player's shops (gates come down and stay down).
        const p = cur();
        p.closed = true;
        refresh();
        await board.closeShops(G.nodes.filter((n) => n.owner === p.id).map((n) => n.id));
      }),
      btn('Shops reopening', async () => {
        // The gates roll back up, then the shops are open again.
        const p = cur();
        p.closed = true;
        refresh();
        board.openShops(G.nodes.filter((n) => n.owner === p.id).map((n) => n.id));
        await new Promise((r) => setTimeout(r, 1500));
        p.closed = false;
        p.onBreak = false;
        refresh();
      }),
      btn('Suit pickup text', () => board.floatText(pos().x, pos().y, '♥', '#ff6b6b')),
      btn('Suit collected in passing', () => board.collectFx(cur().id, '♠', '#ffffff')),
      btn('Shop value rises', () => {
        const sq = ownedShops(G, cur().id)[0] ?? G.nodes.find((n) => n.t === 'shop')!;
        board.valueFx(sq.id, 40);
      }),
      btn('Shop value falls', () => {
        const sq = ownedShops(G, cur().id)[0] ?? G.nodes.find((n) => n.t === 'shop')!;
        board.valueFx(sq.id, -25);
      }),
    );
    row(
      s,
      btn('Toggle shops closed (gates)', () => {
        cur().onBreak = !cur().onBreak;
        refresh();
      }),
      btn('New squares and Motel', () => {
        // Price Up, Taxi and Swap squares, and a Motel, near the start of the board.
        const specials = G.nodes.filter((n) => ['venture', 'roll', 'break', 'boon'].includes(n.t));
        (['hike', 'taxi', 'swap'] as const).forEach((t, i) => {
          if (specials[i]) specials[i].t = t;
        });
        const plot = G.nodes.find((n) => n.t === 'plot');
        if (plot) {
          plot.b = 'motel';
          plot.owner = cur().id;
          plot.value = K.plotCost;
        }
        refresh();
      }),
      btn('Zoom in', () => board.zoomBy(-ZOOM_STEP)),
      btn('Zoom out', () => board.zoomBy(ZOOM_STEP)),
    );
  }

  // Dialogs
  {
    const s = addSection('dialogs', 'Dialogs', 'Each dialog returns its answer to the status line.');
    row(
      s,
      btn('Buy stock', async () => result('Buy stock', await stockModal(hud, G, cur(), 'buy'))),
      btn('Buy stock (shaken district)', async () => {
        // A sell-off cut the second district's price: its name gets the shaken icon.
        market(G).cut[1] = 0.06;
        result('Buy stock', await stockModal(hud, G, cur(), 'buy', 0, 1));
      }),
      btn('Buy stock (10% off)', async () =>
        result('Buy stock', await stockModal(hud, G, cur(), 'buy', 0.1)),
      ),
      btn('Sell stock', async () => {
        if (!cur().shares.some((n) => n > 0)) cur().shares[rnd(G.districts.length)] += 30;
        result('Sell stock', await stockModal(hud, G, cur(), 'sell'));
      }),
      btn('Sell stock (20% above)', async () => {
        if (!cur().shares.some((n) => n > 0)) cur().shares[rnd(G.districts.length)] += 30;
        result('Sell stock', await stockModal(hud, G, cur(), 'sell', 0.2));
      }),
    );
    row(
      s,
      btn('No shops to invest in', () => hud.tick(`${cur().name} has no shops to invest in.`, 'property')),
      btn('Invest', async () => {
        let shops = ownedShops(G, cur().id);
        if (!shops.length) {
          const free = G.nodes.find((n) => isShopLike(n) && n.owner < 0);
          if (free) free.owner = cur().id;
          shops = ownedShops(G, cur().id);
          refresh();
        }
        const opts = shops.map((sq) => ({ sq: sq.id, room: Math.max(1, investRoom(G, sq)) }));
        result(
          'Invest',
          await investOnBoard(hud, board, G, cur(), opts, Math.min(K.investCap, Math.max(1, cur().cash))),
        );
      }),
      btn('Build', async () =>
        result(
          'Build',
          await buildPrompt(
            hud,
            cur(),
            BUILDABLE.filter((b) => b.cost <= Math.max(cur().cash, 1000)).map(({ b, cost }) => ({ b, cost })),
            'What will you build on this plot?',
          ),
        ),
      ),
      btn('Renovate', async () => {
        if (!G.nodes.some((n) => n.t === 'plot' && n.owner === cur().id && n.b)) {
          const plot = G.nodes.find((n) => n.t === 'plot' && !n.b) ?? G.nodes.find((n) => n.t === 'plot')!;
          plot.owner = cur().id;
          plot.b = 'circus' as BuildingKey;
          plot.value = K.plotCost;
          refresh();
        }
        result('Renovate', await renovateOnBoard(pick, cur()));
      }),
    );
    row(
      s,
      btn('Propose trade', async () => result('Trade', await tradeOnBoard(pick, cur()))),
      btn('Trade offer received', async () => {
        const q = G.players[(target + 1) % G.players.length];
        const give = ownedShops(G, q.id)
          .slice(0, 1)
          .map((sq) => sq.id);
        const get = ownedShops(G, cur().id)
          .slice(0, 1)
          .map((sq) => sq.id);
        const offer: TradeOffer = { from: q.id, to: cur().id, give, get, cashGive: 150, cashGet: 0 };
        result('Answer trade', await answerTradeOnBoard(pick, offer, true));
      }),
    );
    row(
      s,
      btn('Auction a property', async () => {
        if (!G.nodes.some((n) => n.owner === cur().id)) {
          const free = G.nodes.find((n) => n.t === 'shop' && n.owner < 0);
          if (free) free.owner = cur().id;
          refresh();
        }
        result('Auction', await auctionOnBoard(pick, cur()));
      }),
      btn('Debt', async () => {
        const p = cur();
        const cash = p.cash;
        p.cash = -350;
        if (!p.shares.some((n) => n > 0)) p.shares[rnd(G.districts.length)] += 20;
        const assets = game.debtAssets(p);
        const i = await debtOnBoard(pick, p, assets);
        p.cash = cash;
        result('Debt', typeof i === 'number' ? assets[i] : i);
      }),
      btn('Buyout (5x)', async () => {
        const q = G.players[(target + 1) % G.players.length];
        const sq = ownedShops(G, q.id)[0] ?? G.nodes.find((n) => n.t === 'shop')!;
        if (sq.owner < 0) sq.owner = q.id;
        refresh();
        result('Buyout', await buyoutPrompt(pick, cur(), sq.id, sq.value * K.buyoutX));
      }),
      // The Hostile takeover venture card: tap a rival's shop, then Buy.
      btn('Hostile takeover (venture card)', async () => {
        const p = cur();
        const options = G.nodes
          .filter((n) => isShopLike(n) && n.owner >= 0 && n.owner !== p.id)
          .map((n) => n.id);
        result(
          'Hostile takeover',
          await buyOnBoard(
            pick,
            p,
            options,
            "Pick a rival's shop to buy for 5x its value.",
            (id) => G.nodes[id].value * K.buyoutX,
            true,
          ),
        );
      }),
      btn('Swap target', async () =>
        result(
          'Swap',
          await cannonOnBoard(
            pick,
            cur(),
            G.players.filter((q) => q.id !== cur().id).map((q) => q.id),
            'swap',
          ),
        ),
      ),
      btn('Motel stop', async () => {
        const q = G.players[(target + 1) % G.players.length];
        const plot = G.nodes.find((n) => n.t === 'plot') ?? G.nodes.find((n) => n.t === 'shop')!;
        plot.t = 'plot';
        plot.b = 'motel';
        plot.owner = q.id;
        plot.value = K.plotCost;
        refresh();
        result('Motel', await motelPrompt(pick, cur(), plot.id, Math.ceil(cur().cash * K.motelRate), 3));
      }),
      btn('Taxi / fly anywhere (no highlights)', async () => {
        const ids = G.nodes.filter((n) => !['shop', 'plot', 'bank'].includes(n.t)).map((n) => n.id);
        const all = G.nodes.map((n) => n.id);
        const list = ids.length > G.nodes.length * 0.6 ? ids : all;
        board.setChoices(list, PLAYER_COLORS[cur().color], (id) => hud.resolvePrompt(id), undefined, {
          plain: true,
        });
        const id = await hud.prompt<number | null>(
          'Taxi! Ride to any special square and use it. Tap a square.',
          [{ label: 'Skip', value: null, secondary: true }],
          cur().color,
        );
        board.clearChoices();
        result('Taxi', id ?? undefined);
      }),
      btn('Cannon target', async () =>
        result(
          'Cannon',
          await cannonOnBoard(
            pick,
            cur(),
            G.players.filter((q) => q.id !== cur().id).map((q) => q.id),
          ),
        ),
      ),
      btn('Guide', () => guideModal(hud, G)),
      btn('Venture card guide', () => guideModal(hud, G, 'venture')),
    );
  }

  // Venture and arcade
  {
    const s = addSection('games', 'Venture & arcade');
    row(
      s,
      btn('Venture grid (play)', async () => {
        const p = cur();
        const view = new VentureView(hud, G, p.id);
        const panel = await view.pick();
        G.vg.owner[panel] = p.id;
        const card = CARD_LIST[rnd(CARD_LIST.length)];
        G.vg.cards[panel] = card.id;
        await view.reveal(panel, card.title, card.text, ...labLines(G.vg.owner, panel, p.id), 1);
        await view.read();
        view.close();
        result('Venture panel', panel);
      }),
      btn('Venture (CPU view)', async () => {
        const p = cur();
        const view = new VentureView(hud, G, p.id);
        const free = G.vg.owner.map((o, i) => (o < 0 ? i : -1)).filter((i) => i >= 0);
        const panel = free[rnd(free.length)];
        G.vg.owner[panel] = p.id;
        const card = CARD_LIST[rnd(CARD_LIST.length)];
        G.vg.cards[panel] = card.id;
        await view.reveal(panel, card.title, card.text, ...labLines(G.vg.owner, panel, p.id), 1);
        // Watching: the board stays up until the player who drew the card closes it.
        await new Promise((r) => setTimeout(r, 4000));
        view.close();
      }),
      btn('Line of 5 bonus', async () => {
        const p = cur();
        const y = rnd(8);
        for (let x = 0; x < 4; x++) G.vg.owner[y * 8 + x] = p.id;
        const panel = y * 8 + 4;
        G.vg.owner[panel] = -1;
        const view = new VentureView(hud, G, p.id);
        G.vg.owner[panel] = p.id;
        G.vg.cards[panel] = 'bank50';
        await view.reveal(
          panel,
          'Bank bonus',
          'Roll the die: the bank pays you 50G times the roll.',
          ...labLines(G.vg.owner, panel, p.id),
          1,
        );
        await view.read();
        view.close();
      }),
      btn('Full row bonus', async () => {
        const p = cur();
        const y = rnd(8);
        for (let x = 0; x < 8; x++) G.vg.owner[y * 8 + x] = p.id;
        const panel = y * 8 + 3;
        G.vg.owner[panel] = -1;
        const view = new VentureView(hud, G, p.id);
        G.vg.owner[panel] = p.id;
        G.vg.cards[panel] = 'bank50';
        await view.reveal(
          panel,
          'Bank bonus',
          'Roll the die: the bank pays you 50G times the roll.',
          ...labLines(G.vg.owner, panel, p.id),
          1,
        );
        await view.read();
        view.close();
      }),
    );
  }

  // Use the real engine and host so the lab exercises the same decisions as a landed arcade.
  {
    const s = addSection(
      'arcade',
      'Arcade Lab',
      'Play the real games with sample players. Your saved match is untouched.',
    );
    for (const [label, play] of [
      ['Lucky Reels', luckyReels],
      ['Memory Blocks', memoryBlocks],
      ['Coin Derby', coinDerby],
      ['Lucky Wheel', luckyWheel],
      ['Treasure Split', treasureSplit],
    ] as const)
      row(
        s,
        btn(label, async () => {
          const sample = cloneState(G);
          sample.players.forEach((p) => {
            p.cpu = p.id !== cur().id;
            p.bankrupt = false;
          });
          const mount = h('div', { class: 'arcade-lab-game' });
          document.body.append(mount);
          const host = new HotSeat(mount, sample, () => mount.remove(), false);
          try {
            await play(host.game, sample.players[cur().id]);
          } finally {
            host.destroy();
            mount.remove();
          }
        }),
      );
  }

  // Landscape previews
  {
    const s = addSection(
      'art',
      'Landscape',
      'Varied cartoon grass, ponds and paving, with foliage and occasional benches near the board. Use the zoom chip to inspect both scales.',
    );
    row(
      s,
      ...(['square', 'hex'] as const).map((layout) =>
        btn(`Town terrain: ${layout}`, () => {
          const mount = h('div', { class: 'lab-screen' });
          root.append(mount);
          const sample = newGame({
            rules: 'standard',
            target: 10000,
            roundCap: 0,
            boardId: layout === 'hex' ? 'prism-junction' : 'town',
            seats: G.players.map((p) => ({ name: p.name, cpu: true, ch: p.ch })),
          });
          const preview = new HotSeat(mount, sample, () => mount.remove(), false);
          preview.board.followPid = 0;
          preview.board.zoomOut = ZOOM_MAX_OUT;
          mount.append(
            h(
              'button',
              {
                class: 'btn small lab-back',
                onclick: () => {
                  preview.destroy();
                  mount.remove();
                },
              },
              'Back to UI Lab',
            ),
          );
        }),
      ),
    );
  }

  // Property designs
  {
    const s = addSection(
      'art',
      'Property designs',
      'Every property design: shops and the 3-Star Shop change as their value grows; then the buildings and the bank.',
    );
    row(
      s,
      btn('Tile sprites and tint layers', () => {
        const rows = Object.entries(ART_SOURCES).map(([key, source]) =>
          h(
            'div',
            { class: 'art-row' },
            h(
              'div',
              { class: 'art-name' },
              h('b', null, key),
              h('small', null, source.tint ? 'Base · tint · red · blue' : 'Base only'),
            ),
            h('img', { src: source.base, alt: `${key} base` }),
            source.tint ? h('img', { src: source.tint, alt: `${key} tint` }) : null,
            h('img', { src: propIconURL(key as PropKey, '#e5484d'), alt: `${key} red` }),
            h('img', { src: propIconURL(key as PropKey, '#3e7bfa'), alt: `${key} blue` }),
          ),
        );
        const m = hud.modal('Tile sprites and tint layers', h('div', { class: 'art-grid' }, ...rows), {
          wide: true,
          onClose: () => m.close(),
        });
      }),
      btn('Design gallery', () => {
        // Every player color (not just this game's players), with the owner's initial where a
        // player has that color.
        const colors = PLAYER_COLORS.map((c, i) => ({
          c,
          initial: G.players.find((p) => p.color === i)?.name[0]?.toUpperCase(),
        }));
        const art = (src: string, title = '') => h('img', { src, alt: title, title });
        const artRow = (name: string, note: string, imgs: HTMLElement[]) =>
          h(
            'div',
            { class: 'art-row' },
            h('div', { class: 'art-name' }, h('b', null, name), note ? h('small', null, note) : null),
            ...imgs,
          );
        const grid = (kind: 'shop' | 'star3', tiers: number[], names: string[]) =>
          h(
            'div',
            { class: 'art-grid' },
            ...tiers.map((min, t) =>
              artRow(`${names[t]}`, `from ${fmt(min)}`, [
                art(propertyIconURL(kind, t, UNOWNED_ART), 'Unowned'),
                ...colors.map(({ c, initial }) => art(propertyIconURL(kind, t, c, initial))),
              ]),
            ),
          );
        const CIRCUS_NAMES = ['Circus', 'Circus (level 1)', 'Circus (level 2)', 'Circus (level 3)'];
        const buildings: [PropKey, string, string][] = [
          ['checkpoint', 'Checkpoint', 'base + tint'],
          ...[0, 1, 2, 3].map((l): [PropKey, string, string] => [
            `circus${l as 0 | 1 | 2 | 3}`,
            CIRCUS_NAMES[l],
            '',
          ]),
          ['balloon', 'Balloonport', ''],
          ['tax', 'Tax Office', ''],
          ['motel', 'Motel', ''],
          ['home', 'Home', 'retired'],
          ['agency', 'Estate Agency', ''],
        ];
        const buildingGrid = h(
          'div',
          { class: 'art-grid' },
          ...buildings.map(([key, name, note]) =>
            artRow(name, note, [
              art(propIconURL(key, UNOWNED_ART), 'Unowned'),
              ...colors.map(({ c }) => art(propIconURL(key, c))),
            ]),
          ),
        );
        const special = h(
          'div',
          { class: 'art-grid' },
          artRow('Bank', 'no owner', [art(propIconURL('bank', UNOWNED_ART), 'Bank')]),
        );
        const m = hud.modal(
          'Property designs',
          h(
            'div',
            null,
            h('p', { class: 'hint' }, 'Unowned (grey) first, then every player color.'),
            h('h4', null, 'Shops'),
            grid('shop', SHOP_TIERS, SHOP_TIER_NAMES),
            h('h4', null, '3-Star Shop'),
            grid('star3', STAR3_TIERS, STAR3_TIER_NAMES),
            h('h4', null, 'Buildings'),
            buildingGrid,
            h('h4', null, 'Special squares'),
            special,
          ),
          { wide: true, onClose: () => m.close() },
        );
      }),
    );
    row(
      s,
      btn("Grow target's shops +300G", () => {
        const shops = ownedShops(G, cur().id);
        if (!shops.length) {
          const free = G.nodes.find((n) => n.t === 'shop' && n.owner < 0);
          if (free) free.owner = cur().id;
        }
        for (const sq of ownedShops(G, cur().id)) sq.value += 300;
        for (const sq of ownedShops(G, cur().id)) board.ring(sq.id, '#ffd166', true);
        refresh();
      }),
      btn("Shrink target's shops -300G", () => {
        for (const sq of ownedShops(G, cur().id))
          sq.value = Math.max(sq.t === 'plot' ? K.star3Cost : sq.base, sq.value - 300);
        refresh();
      }),
      btn('Build a 3-Star Shop', () => {
        const plot =
          G.nodes.find((n) => n.t === 'plot' && (!n.b || n.owner === cur().id)) ??
          G.nodes.find((n) => n.t === 'plot');
        if (!plot) return hud.tick('This board has no plots (Easy rules).');
        if (plot.b !== 'star3') plot.value = K.star3Cost;
        plot.owner = cur().id;
        plot.b = 'star3';
        board.ring(plot.id, '#ffd166', true);
        refresh();
      }),
    );
  }

  // Sound effects, music and the volume settings.
  {
    const s = addSection('sound', 'Sound', 'Tap the page once first: browsers only play sound after a tap.');
    row(s, ...SFX_NAMES.map((n) => btn(n, () => sound.play(n))));
    row(
      s,
      ...(Object.keys(TRACK_NAMES) as Track[]).map((t) =>
        btn(`Music: ${TRACK_NAMES[t]}`, () => sound.music(t)),
      ),
      btn('Stop music', () => sound.music(null)),
    );
    row(
      s,
      btn('Music pop-up', () => hud.musicBtn.click()),
    );
    s.append(soundControls());
  }

  // Full screens: the main menu and game setup open over the lab with a way back.
  {
    const s = addSection(
      'screens',
      'Menus & online',
      'Opens over the lab. Buttons on the screen report here.',
    );
    const overlay = (open: (holder: HTMLElement, done: (msg: string) => void) => () => void) => {
      const holder = h('div', { class: 'lab-screen' });
      root.append(holder);
      let close = () => {};
      const done = (msg: string) => {
        close();
        holder.remove();
        hud.tick(msg);
      };
      close = open(holder, done);
      holder.append(
        h(
          'button',
          { class: 'btn small lab-back', onclick: () => done('Closed the screen.') },
          'Back to UI Lab',
        ),
      );
    };
    /**
     * Game setup with a stand-in room: `friends` joined players arrive after a moment (-1: no
     * connection, so no join code).
     */
    const setup = (friends: number) =>
      overlay((holder, done) => {
        const listeners = new Set<() => void>();
        let seats: LobbySeat[] = [];
        const remotes: LobbySeat[] = [];
        const room: SetupRoom = {
          code: 'KQZD',
          get joined() {
            return seats.filter((x) => x.kind === 'remote').length;
          },
          lobby: () => ({ boardName: '', rules: 'standard', target: 0, roundCap: 0, seats }),
          configure(locals: LocalSeat[], bots: LocalSeat[]) {
            seats = [
              ...locals.map((l, i) => ({
                kind: i ? ('local' as const) : ('host' as const),
                ...l,
                online: true,
              })),
              ...remotes,
              ...bots.map((b) => ({ kind: 'cpu' as const, ...b, online: true })),
            ].slice(0, 5);
            listeners.forEach((f) => f());
          },
          setSettings: () => {},
          setStarting: () => {},
          kick(i: number) {
            remotes.splice(remotes.indexOf(seats[i]), 1);
            seats = seats.filter((_, k) => k !== i);
            listeners.forEach((f) => f());
          },
          onChange(f: () => void) {
            listeners.add(f);
            return () => listeners.delete(f);
          },
          seatConfigs: () => [],
          leave: () => {},
        };
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        return setupScreen(
          holder,
          {
            onStart: (o, online) =>
              done(
                `Setup: start ${online ? 'online' : 'on this device'} on ${o.board?.name} with ${o.seats.length || seats.length} players.`,
              ),
            onBack: () => done('Setup: back to menu.'),
          },
          async () => {
            await wait(700);
            if (friends < 0) return null;
            for (let k = 0; k < friends; k++) {
              const p = G.players[k + 1];
              remotes.push({ kind: 'remote', name: p.name, look: p.ch, online: true });
            }
            // The friends tap Ready a little later, one after the other.
            remotes.forEach((r, k) =>
              setTimeout(
                () => {
                  r.ready = true;
                  listeners.forEach((f) => f());
                },
                2500 + k * 1500,
              ),
            );
            return room;
          },
        );
      });
    const menu = (withSave: boolean, guest = false) =>
      overlay((holder, done) => {
        // The rejoin button reads this device's last guest game; a sample one is shown here.
        const had = loadGuest();
        if (guest) saveGuest('KQZD', G.players[1].name);
        const close = mainMenu(
          holder,
          {
            onPlay: () => done('Main menu: Play pressed.'),
            onJoin: (code) => done(`Main menu: Join ${code} pressed.`),
            onContinue: () => done('Main menu: Continue pressed.'),
            onRejoin: (g) => done(`Main menu: Rejoin room ${g.code} as ${g.name} pressed.`),
            onCollection: () => done('Main menu: Board collection pressed.'),
          },
          withSave ? { state: cloneState(G), savedAt: Date.now() - 12 * 60000 } : null,
        );
        if (guest) {
          if (had) saveGuest(had.code, had.name);
          else clearGuest();
        }
        return close;
      });
    row(
      s,
      btn('Main menu (saved game)', () => menu(true)),
      btn('Main menu (no save)', () => menu(false)),
      btn('Board collection', () =>
        overlay((holder, done) =>
          openCollection(holder, {
            onBack: () => done('Board collection: Back pressed.'),
            onView: (b) => done(`Board collection: view ${b.name}.`),
            onNew: () => done('Board collection: New board pressed.'),
          }),
        ),
      ),
      btn('Main menu (rejoin offer)', () => menu(false, true)),
      btn('Main menu (save + rejoin)', () => menu(true, true)),
      btn("What's new", () => openWhatsNew(document.body)),
      btn('Credits', () => openCredits(document.body)),
      btn('Character picker', async () => {
        // Rosa and Milo have the first two characters, so those show as taken.
        const id = await pickCharacter({
          current: CHARACTERS[2].id,
          taken: new Map([
            [CHARACTERS[0].id, 'Rosa'],
            [CHARACTERS[1].id, 'Milo'],
          ]),
          color: PLAYER_COLORS[2],
        });
        result('Character picker', id ?? undefined);
      }),
      btn('Player card', () => openPlayerCard(document.body, () => {})),
      btn('Game setup', () => setup(0)),
      btn('Game setup (friend joined)', () => setup(1)),
      btn('Game setup (offline)', () => setup(-1)),
      btn('Joined game (locked setup)', () =>
        overlay((holder, done) => {
          const looks = G.players.map((p) => p.ch);
          const lobby: LobbyInfo = {
            boardName: 'Town',
            board: BUILT_IN_BOARDS[0],
            rules: 'standard',
            target: 7000,
            roundCap: 30,
            plots: 'some',
            seats: [
              { kind: 'host', name: 'Rosa', look: looks[0], online: true, ready: true },
              { kind: 'remote', name: 'Milo', look: looks[1], online: true, ready: false },
              { kind: 'open', name: '', look: null, online: false },
              { kind: 'open', name: '', look: null, online: false },
            ],
          };
          const view = guestSetup(
            holder,
            {
              code: 'KQZD',
              seat: 1,
              lobby,
              setLook: (id) => {
                lobby.seats[1].look = id;
                view.update();
              },
              setName: (name) => {
                lobby.seats[1].name = name.trim().slice(0, 12) || lobby.seats[1].name;
                view.update();
              },
              // Everyone else is ready here, so tapping Ready shows the "Starting..." state.
              setReady: (on) => {
                lobby.seats[1].ready = on;
                lobby.starting = on;
                view.update();
              },
              leave: () => {},
            },
            { onBack: () => done('Joined game: Leave pressed.') },
          );
          return view.close;
        }),
      ),
    );
    row(
      s,
      btn('Online: continue saved game', () =>
        overlay((holder, done) => {
          const lobby = () => ({
            boardName: G.boardName ?? 'Town',
            plots: G.plots,
            stocks: G.stocks,
            rules: G.rules,
            target: G.target,
            roundCap: G.roundCap,
            seats: G.players.map((p, i) => ({
              // The host, a friend who is back, a friend not back yet, then bots.
              kind: i === 0 ? ('host' as const) : i <= 2 ? ('remote' as const) : ('cpu' as const),
              name: p.name,
              look: p.ch,
              online: i !== 2,
            })),
          });
          return resumeLobby(
            holder,
            { code: 'KQZD', lobby, onChange: () => () => true },
            'KQZD',
            {
              onResume: () => done('Resume game pressed.'),
              onBack: () => done('Back pressed.'),
            },
            G.round,
          );
        }),
      ),
    );
  }

  // Log, market and results
  {
    const s = addSection('panels', 'Log, market & results');
    row(
      s,
      btn('Game log', () => hud.toggleLog()),
      btn('Game menu', () => hud.toggleMenu(true)),
      btn('Quit confirm', () => hud.confirmQuit()),
      btn('Room code button', () => hud.setRoom('KQZD', inviteURL('KQZD'))),
      btn('Live auction', async () => {
        // The real live auction: you bid in the action bar, the others are CPUs.
        const sq = G.nodes.find((n) => n.t === 'shop')!;
        const bidders = G.players.map((q) => q.id);
        const step = Math.max(K.auctionStepMin, Math.round(sq.value * K.auctionStep));
        const req = {
          kind: 'auction' as const,
          pid: cur().id,
          sq: sq.id,
          seller: -1,
          opening: sq.value,
          step,
          bidders,
        };
        const view = new AuctionView(hud, G, sq.id, -1, sq.value, step, bidders);
        const live = new LiveAuction(G, req, view, {
          cpu: (pid) => pid !== cur().id,
          anyPerson: true,
          speed: 1,
        });
        view.openBar([cur().id], (pid, act) => live.act(pid, act));
        const ans = await live.run();
        view.closeBar();
        await view.end(ans.winner, ans.price, 3000);
      }),
      btn('Live auction (two players here)', async () => {
        // Two people on this device bid side by side; the others are CPUs.
        const sq = G.nodes.find((n) => n.t === 'shop')!;
        const bidders = G.players.map((q) => q.id);
        const here = [cur().id, (cur().id + 1) % G.players.length];
        const step = Math.max(K.auctionStepMin, Math.round(sq.value * K.auctionStep));
        const req = {
          kind: 'auction' as const,
          pid: cur().id,
          sq: sq.id,
          seller: -1,
          opening: sq.value,
          step,
          bidders,
        };
        const view = new AuctionView(hud, G, sq.id, -1, sq.value, step, bidders);
        const live = new LiveAuction(G, req, view, {
          cpu: (pid) => !here.includes(pid),
          anyPerson: true,
          speed: 1,
        });
        view.openBar(here, (pid, act) => live.act(pid, act));
        const ans = await live.run();
        view.closeBar();
        await view.end(ans.winner, ans.price, 3000);
      }),
      btn('Info: game page', () => hud.toggleInfo('game')),
      btn('Info: stocks page', () => hud.toggleInfo('stocks')),
      btn('Info: properties page', () => hud.toggleInfo('props')),
      btn('Stocks: classic', () => {
        G.stocks = 'classic';
        hud.toggleInfo('stocks');
      }),
      btn('Stocks: dynamic', () => {
        G.stocks = 'dynamic';
        hud.toggleInfo('stocks');
      }),
      btn('Shaken district', () => {
        G.stocks = 'dynamic';
        const m = market(G);
        m.cut[0] = Math.min(1 - K.confMin, m.cut[0] + 0.18);
        hud.toggleInfo('stocks');
      }),
      btn('Stocks lab', () => {
        location.hash = '#stocks-lab';
        location.reload();
      }),
      btn('Results screen', () => {
        const R = cloneState(G);
        R.over = true;
        R.winner = ranking(R)[0].id;
        R.endReason = `Reached the ${R.target}G target`;
        showResults(hud, R, () => hud.modalLayer.lastElementChild?.remove());
      }),
    );
    row(
      s,
      btn('Play 4 more CPU turns', async () => {
        hud.tick('Playing 4 CPU turns...');
        const cpus = G.players.map((p) => p.cpu);
        await playSample(G, 4);
        G.players.forEach((p, i) => (p.cpu = cpus[i]));
        board.setState(G);
        setActive(G.order[G.turn]);
        hud.tick(`Now round ${G.round}.`);
      }),
      btn('New sample game', () => location.reload()),
      btn('Square / hex board', () => {
        try {
          localStorage.setItem(LAB_BOARD_KEY, labBoard() === 'portals' ? 'hex' : 'square');
        } catch {
          // Storage blocked: stay on this board.
        }
        location.reload();
      }),
      // The board builder opened over the Lab in a few useful states.
      ...(
        [
          ['Board builder', null],
          ['Board builder: Town', null],
          ['Board viewer: Town', null],
          ['Board builder: Crossgate Gardens', null],
          ['Board builder: Prism Junction', null],
          ['Board builder: Return Ridge', null],
          ['Board builder: Problems', '.ed-info > button'],
          ['Board builder: Board settings', '.ed-info > button'],
          ['Board builder: Tiles pane', '.ed-tool-button[aria-label="Place"]'],
          ['Board builder: Pan', '.ed-tool-button[aria-label="Pan"]'],
          ['Board builder: Links', '.ed-tool-button[aria-label="Links"]'],
          ['Board builder: Warps and portals', null],
        ] as const
      ).map(([label, press]) =>
        btn(label, () => {
          const holder = h('div', { class: 'lab-screen' });
          root.append(holder);
          const start =
            label === 'Board builder'
              ? null
              : label.endsWith('Warps and portals')
                ? (BUILT_IN_BOARDS.find((b) => b.squares.some((s) => s.t === 'warp')) ?? null)
                : (BUILT_IN_BOARDS.find((b) => label.endsWith(`: ${b.name}`)) ?? BUILT_IN_BOARDS[0]);
          const preview = label.endsWith('Problems') && start ? structuredClone(start) : start;
          if (label.endsWith('Problems') && preview) {
            const property = preview.squares.find((s) => s.t === 'shop');
            if (property) {
              property.t = 'venture';
              delete property.d;
            }
            const special = preview.squares.find((s) => s.t === 'venture' && s !== property);
            if (special) {
              special.t = 'warp';
              delete special.link;
            }
          }
          const close = openEditor(
            holder,
            preview,
            {
              onExit: () => holder.remove(),
              onPlay: () => {
                holder.remove();
                hud.tick('Board builder test play pressed.');
              },
            },
            { view: label.startsWith('Board viewer') },
          );
          if (press) holder.querySelector<HTMLButtonElement>(press)?.click();
          holder.append(
            h(
              'button',
              {
                class: 'btn small lab-back',
                onclick: () => {
                  close();
                  holder.remove();
                },
              },
              'Back to UI Lab',
            ),
          );
        }),
      ),
      btn('Open board editor', () => {
        location.hash = '#editor';
        location.reload();
      }),
    );
  }

  // A link to a section (from the dev menu) opens its tab.
  const linked = section ? LAB_TABS.find((t) => t.sections.includes(section)) : undefined;
  if (linked) tab = linked.id;
  // Each category shows how many controls it has; ones with recently changed controls get a dot.
  for (const b of rail.querySelectorAll<HTMLElement>('.lab-cat')) {
    const t = LAB_TABS.find((x) => x.id === b.dataset.tab)!;
    const secs = t.sections.map((id) => sections.get(id)).filter((x): x is HTMLElement => !!x);
    const n =
      t.id === 'new'
        ? body.querySelectorAll('.lab-row > .lab-new').length
        : secs.reduce((sum, x) => sum + x.querySelectorAll('.lab-row > button').length, 0);
    b.querySelector('.lab-cat-n')!.textContent = n ? String(n) : '';
    const fresh = secs.some((x) => x.querySelector('.lab-new'));
    b.classList.toggle('has-new', fresh || t.id === 'new');
  }
  filter();
  if (section) {
    const el = sections.get(section);
    if (el) {
      el.classList.add('flash');
      requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    }
  }
}
