/**
 * UI Lab: a sandbox page (#ui-lab) for viewing and testing UI elements without playing a game.
 * It builds a sample match (a few rounds played by CPUs), shows the real board and HUD, and a
 * control panel that triggers each element: player card states, prompts, banners, board
 * effects, dialogs, the venture grid, arcade minigames, the log, the market and the results.
 */
import {
  netWorth,
  BUILDINGS,
  CARD_LIST,
  DERBY_LENGTH,
  DERBY_RACERS,
  Game,
  K,
  PLAYER_COLORS,
  REEL_SYMBOLS,
  cloneState,
  cpuIO,
  isShopLike,
  lineBonus,
  linesThrough,
  newGame,
  ownedShops,
  ranking,
  investRoom,
  type BuildingKey,
  type GameState,
  type MemoryPrize,
  type Player,
  type ReelSymbol,
  type TradeOffer,
} from '@aa/engine';
import { SHOP_TIERS, SHOP_TIER_NAMES, STAR3_TIERS, STAR3_TIER_NAMES, propertyIconURL } from '../art';
import { BoardView, ZOOM_STEP } from '../board';
import { CHARACTERS, shuffledCharacters } from '../sprites';
import { clear, fmt, h } from './dom';
import { DerbyView, MemoryView, ReelsView, VentureView } from './games';
import { Hud } from './hud';
import { clearGuest, loadGuest, saveGuest } from '../save';
import { mainMenu } from './menu';
import { openWhatsNew } from './whatsnew';
import { openCredits } from './credits';
import { pickCharacter } from './charpick';
import { joinScreen, lobbySeats, onlineHub, resumeLobby } from './online';
import { soundButton, soundControls } from './soundpanel';
import { SFX_NAMES, TRACK_NAMES, sound, type Track } from '../audio';
import { setupScreen } from './start';
import { buildPrompt, rulesModal, stockModal } from './modals';
import { showResults } from './results';
import { investOnBoard } from './invest';
import { AuctionView } from './auction';
import { inviteURL } from '../net/protocol';
import {
  answerTradeOnBoard,
  auctionOnBoard,
  buyoutPrompt,
  costChips,
  question,
  cannonOnBoard,
  debtOnBoard,
  renovateOnBoard,
  tradeOnBoard,
} from './pick';

export const LAB_SECTIONS = [
  { id: 'cards', title: 'Player cards' },
  { id: 'prompts', title: 'Action bar & banners' },
  { id: 'board', title: 'Board effects' },
  { id: 'dialogs', title: 'Dialogs' },
  { id: 'games', title: 'Venture & arcade' },
  { id: 'art', title: 'Property designs' },
  { id: 'panels', title: 'Log, market & results' },
] as const;

const shuffled = <T>(a: T[]) =>
  a
    .map((v) => [Math.random(), v] as const)
    .sort((x, y) => x[0] - y[0])
    .map((x) => x[1]);
const rnd = (n: number) => Math.floor(Math.random() * n);

/** A sample match; `playSample` then plays a few rounds so cards, the board and the log have content. */
function sampleState(): GameState {
  const names = ['Rosa', 'Milo', 'Juno', 'Kai'];
  const chars = shuffledCharacters(names.length);
  return newGame({
    rules: 'standard',
    target: 5000,
    roundCap: 0,
    seats: names.map((name, i) => ({ name, cpu: true, ch: chars[i] })),
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

/** Bonus lines and payout for a venture panel, as the engine would compute them. */
function labLines(owner: number[], panel: number, pid: number): [number[][], number] {
  const lines = linesThrough(owner, panel, pid);
  return [lines, lines.reduce((s, l) => s + lineBonus(l.length), 0)];
}

export async function openLab(app: HTMLElement, section?: string) {
  const G = sampleState();
  await playSample(G, 24);
  const game = new Game(G, { decide: () => new Promise(() => {}), emit: () => {} });

  const root = h('div', { class: 'game lab' });
  app.append(root);
  const boardHost = h('div', { class: 'board-host' });
  root.append(boardHost);
  const board = new BoardView(boardHost);
  const hud = new Hud(root, board, {
    onToggleFast: () => hud.tick('Fast CPU only affects real games.'),
    onQuit: () => {
      location.hash = '';
      location.reload();
    },
    onRules: () => rulesModal(hud, G),
    quitQuestion: () => 'Leave the UI Lab and go back to the main menu?',
  });
  board.zoomOut = 1;
  hud.setFastLabel(false);

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
  hud.tick('UI Lab: pick a control on the left to try an element.');

  const pick = { hud, board, G };
  const result = (label: string, v: unknown) => {
    const text = v === undefined ? 'closed' : JSON.stringify(v);
    hud.tick(`${label} returned: ${text.length > 120 ? text.slice(0, 117) + '...' : text}`);
  };

  // ------------------------------------------------------------ control panel

  const panel = h('div', { class: 'lab-panel glass' });
  const body = h('div', { class: 'lab-body' });
  const toggle = h('button', { class: 'btn small ghost' }, 'Hide');
  // Frame the board beside the panel; it gets the full width back when the panel is hidden.
  const fitBoard = () => {
    hud.leftInset = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right + 6;
    hud.updateInsets();
  };
  toggle.onclick = () => {
    panel.classList.toggle('collapsed');
    toggle.textContent = panel.classList.contains('collapsed') ? 'Show' : 'Hide';
    fitBoard();
  };
  panel.append(h('div', { class: 'lab-head' }, h('h3', null, 'UI Lab'), toggle), body);
  root.append(panel);
  window.addEventListener('resize', fitBoard);
  requestAnimationFrame(fitBoard);

  const sections = new Map<string, HTMLElement>();
  const addSection = (id: string, title: string, note?: string) => {
    const el = h(
      'section',
      { class: 'lab-sec', id: `lab-${id}` },
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
        class: 'btn small',
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

  // Player picker shared by the sections.
  const pickerRow = h('div', { class: 'lab-row lab-players' });
  const drawPicker = () => {
    clear(pickerRow);
    G.players.forEach((p, i) =>
      pickerRow.append(
        h(
          'button',
          {
            class: `btn small ${i === target ? 'on' : 'ghost'}`,
            style: `--pc:${PLAYER_COLORS[p.color]}`,
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
  body.append(h('div', { class: 'lab-sec' }, h('h4', null, 'Target player'), pickerRow));

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
      btn('Buy prompt', async () =>
        result(
          'Buy prompt',
          await hud.prompt(
            question('Buy this Bay Market shop?', costChips('Price', 220, cur().cash)),
            [
              { label: 'Buy', value: true, main: true },
              { label: 'Pass', value: false, secondary: true },
            ],
            cur().color,
          ),
        ),
      ),
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
      btn('Pick a district (venture card)', async () => {
        const p = cur();
        const tiles = (d: number) => G.nodes.filter((q) => q.d === d).map((q) => q.id);
        const labels = new Map(
          G.districts.map((dd, d) => [tiles(d)[0], dd.name] as [number, string]).filter(([id]) => id != null),
        );
        board.setChoices(
          G.districts.flatMap((_, d) => tiles(d)),
          PLAYER_COLORS[p.color],
          (id) => hud.resolvePrompt(G.nodes[id].d),
          undefined,
          { labels, pins: false },
        );
        const d = await hud.prompt<number>(
          'Pick a district whose stock rises 20%. Tap a district on the board or pick one below.',
          G.districts.map((dd, i) => ({
            label: dd.name,
            value: i,
            hover: (on: boolean) => (board.highlight = on ? tiles(i) : []),
          })),
          p.color,
        );
        board.clearChoices();
        result('Pick district', d);
      }),
    );
    row(
      s,
      btn('Status text', () => hud.status(`${cur().name} is thinking...`, cur().color)),
      btn('Ticker line', () => hud.tick(`${cur().name} bought a shop for 240G.`, cur().id)),
      btn('Pass the device', async () => {
        await hud.passDevice(cur());
        result('Pass the device', 'ok');
      }),
    );
    row(
      s,
      btn('Turn banner', () => hud.banner(`${cur().name}'s turn`, PLAYER_COLORS[cur().color], 1300)),
      btn('Round banner', () => hud.banner(`Round ${G.round}`, '#ffd166', 1400)),
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
    row(
      s,
      btn('Roll die', async () => {
        setActive(cur().id);
        await board.rollDie(1 + rnd(6));
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
        await board.openShops(G.nodes.filter((n) => n.owner === p.id).map((n) => n.id));
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
      btn('Zoom in', () => board.zoomBy(-ZOOM_STEP)),
      btn('Zoom out', () => board.zoomBy(ZOOM_STEP)),
    );
  }

  // Dialogs
  {
    const s = addSection('dialogs', 'Dialogs', 'Each dialog returns its answer to the ticker.');
    row(
      s,
      btn('Buy stock', async () => result('Buy stock', await stockModal(hud, G, cur(), 'buy'))),
      btn('Buy stock (10% off)', async () =>
        result('Buy stock', await stockModal(hud, G, cur(), 'buy', 0.1)),
      ),
      btn('Sell stock', async () => {
        if (!cur().shares.some((n) => n > 0)) cur().shares[rnd(G.districts.length)] += 30;
        result('Sell stock', await stockModal(hud, G, cur(), 'sell'));
      }),
    );
    row(
      s,
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
            BUILDINGS.filter((b) => b.cost <= Math.max(cur().cash, 1000)).map(({ b, cost }) => ({ b, cost })),
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
      btn('Rules', () => rulesModal(hud, G)),
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
        await view.reveal(panel, card.title, card.text, ...labLines(G.vg.owner, panel, p.id), true, 1);
        result('Venture panel', panel);
      }),
      btn('Venture (CPU view)', async () => {
        const p = cur();
        const view = new VentureView(hud, G, p.id);
        const free = G.vg.owner.map((o, i) => (o < 0 ? i : -1)).filter((i) => i >= 0);
        const panel = free[rnd(free.length)];
        G.vg.owner[panel] = p.id;
        const card = CARD_LIST[rnd(CARD_LIST.length)];
        await view.reveal(panel, card.title, card.text, ...labLines(G.vg.owner, panel, p.id), false, 1);
      }),
      btn('Line of 5 bonus', async () => {
        const p = cur();
        const y = rnd(8);
        for (let x = 0; x < 4; x++) G.vg.owner[y * 8 + x] = p.id;
        const panel = y * 8 + 4;
        G.vg.owner[panel] = -1;
        const view = new VentureView(hud, G, p.id);
        G.vg.owner[panel] = p.id;
        await view.reveal(
          panel,
          'Bank bonus',
          'Roll the die: the bank pays you 50G times the roll.',
          ...labLines(G.vg.owner, panel, p.id),
          true,
          1,
        );
      }),
    );
    row(
      s,
      btn('Lucky Reels', async () => {
        const strips = [0, 1, 2].map(() => shuffled(REEL_SYMBOLS.flatMap((x) => [x, x]) as ReelSymbol[]));
        const view = new ReelsView(hud, strips, cur().name);
        const stops = await view.play();
        const res = strips.map((st, i) => st[stops[i] % st.length]);
        const prize =
          new Set(res).size === 1 ? 'Three of a kind!' : new Set(res).size === 2 ? 'A pair: 20G' : 'No match';
        await view.show(res, prize, true, 1);
        result('Reels', res);
      }),
      btn('Memory Blocks', async () => {
        const prizes = shuffled<MemoryPrize>([
          'shopsUp',
          'shopsUp',
          'gold',
          'gold',
          'wild',
          'shopsDown',
          'shopsDown',
          'small',
          'small',
        ]);
        const view = new MemoryView(hud, prizes, cur().name);
        const i = await view.play();
        await view.show(i, prizes[i], true, 1);
        result('Memory', prizes[i]);
      }),
      btn('Coin Derby', async () => {
        const view = new DerbyView(hud, G, cur().name);
        const pick = await view.pick();
        const backers = new Array(DERBY_RACERS).fill(-1);
        backers[pick] = cur().id;
        const others = shuffled([...Array(DERBY_RACERS).keys()].filter((i) => i !== pick));
        G.players.filter((q) => q !== cur()).forEach((q, i) => (backers[others[i]] = q.id));
        const pos = new Array(DERBY_RACERS).fill(0);
        const coins = new Array(DERBY_RACERS).fill(0);
        const frames: number[][] = [pos.slice()];
        while (Math.max(...pos) < DERBY_LENGTH) {
          for (let i = 0; i < DERBY_RACERS; i++) {
            pos[i] = Math.min(
              DERBY_LENGTH,
              pos[i] + 0.6 + Math.random() * 1.2 + (Math.random() < 0.06 ? 3 : 0),
            );
            if (Math.random() < 0.1) coins[i]++;
          }
          frames.push(pos.slice());
        }
        await view.race(backers, frames, coins, pos.indexOf(Math.max(...pos)), true, 1);
        result('Derby pick', pick);
      }),
    );
  }

  // Property designs
  {
    const s = addSection(
      'art',
      'Property designs',
      'Shops change design as their value grows; so does the 3-Star Shop.',
    );
    row(
      s,
      btn('Design gallery', () => {
        const grid = (kind: 'shop' | 'star3', tiers: number[], names: string[]) =>
          h(
            'div',
            { class: 'art-grid' },
            ...tiers.map((min, t) =>
              h(
                'div',
                { class: 'art-row' },
                h('div', { class: 'art-name' }, h('b', null, names[t]), h('small', null, `from ${fmt(min)}`)),
                h('img', {
                  src: propertyIconURL(kind, t, kind === 'shop' ? G.districts[t % 7].color : '#9aa3b8'),
                  alt: '',
                }),
                ...G.players.map((p) =>
                  h('img', {
                    src: propertyIconURL(kind, t, PLAYER_COLORS[p.color], p.name[0]?.toUpperCase()),
                    alt: p.name,
                    title: p.name,
                  }),
                ),
              ),
            ),
          );
        const m = hud.modal(
          'Property designs',
          h(
            'div',
            null,
            h('p', { class: 'hint' }, 'Unowned first, then each player color.'),
            h('h4', null, 'Shops'),
            grid('shop', SHOP_TIERS, SHOP_TIER_NAMES),
            h('h4', null, '3-Star Shop'),
            grid('star3', STAR3_TIERS, STAR3_TIER_NAMES),
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
    row(s, soundButton('btn small', 'Sound popover'));
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
    const menu = (withSave: boolean, guest = false) =>
      overlay((holder, done) => {
        // The rejoin button reads this device's last guest game; a sample one is shown here.
        const had = loadGuest();
        if (guest) saveGuest('KQZD', G.players[1].name);
        const close = mainMenu(
          holder,
          {
            onStart: () => done('Main menu: Start pressed.'),
            onContinue: () => done('Main menu: Continue pressed.'),
            onOnline: () => done('Main menu: Play online pressed.'),
            onRejoin: (g) => done(`Main menu: Rejoin room ${g.code} as ${g.name} pressed.`),
            onEditor: () => done('Main menu: Board editor pressed.'),
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
      btn('Main menu (rejoin offer)', () => menu(false, true)),
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
      btn('Game setup', () =>
        overlay((holder, done) =>
          setupScreen(holder, {
            onStart: (o) => done(`Setup: start on ${o.board?.name} with ${o.seats.length} players.`),
            onBack: () => done('Setup: back to menu.'),
            onEditor: () => done('Setup: board editor pressed.'),
          }),
        ),
      ),
    );
    row(
      s,
      btn('Online: host or join', () =>
        overlay((holder, done) =>
          onlineHub(holder, {
            onHost: () => done('Online hub: Host pressed.'),
            onJoin: () => done('Online hub: Join pressed.'),
            onBack: () => done('Online hub: Back pressed.'),
          }),
        ),
      ),
      btn('Online: join form', () =>
        overlay((holder, done) =>
          joinScreen(
            holder,
            {
              onStart: () => done('Join: game started.'),
              onBack: () => done('Join: Back pressed.'),
            },
            'ABCD',
          ),
        ),
      ),
      btn('Online: continue saved game', () =>
        overlay((holder, done) => {
          const lobby = () => ({
            boardName: G.boardName ?? 'Town',
            rules: G.rules,
            target: G.target,
            roundCap: G.roundCap,
            fill: true,
            seats: G.players.map((p, i) => ({
              kind: i === 0 ? ('host' as const) : p.cpu ? ('cpu' as const) : ('remote' as const),
              name: p.name,
              look: p.ch,
              online: i === 0 || i === 1,
            })),
          });
          return resumeLobby(holder, { code: 'KQZD', lobby, onChange: () => () => true }, 'KQZD', {
            onResume: () => done('Resume game pressed.'),
            onBack: () => done('Back pressed.'),
          });
        }),
      ),
      btn('Online: lobby seats', () =>
        overlay((holder) => {
          const looks = G.players.map((p) => p.ch);
          const el = h(
            'div',
            { class: 'setup' },
            h(
              'div',
              { class: 'setup-wrap narrow' },
              h(
                'section',
                { class: 'setup-panel glass' },
                h('div', { class: 'room-code' }, h('small', null, 'Room code'), h('b', null, 'KQZD')),
                lobbySeats(
                  {
                    boardName: G.boardName ?? 'Town',
                    rules: 'standard',
                    target: 5000,
                    roundCap: 0,
                    fill: true,
                    seats: [
                      { kind: 'host', name: 'Rosa', look: looks[0], online: true },
                      { kind: 'remote', name: 'Milo', look: looks[1], online: true },
                      { kind: 'remote', name: 'Juno', look: looks[2], online: false },
                      { kind: 'open', name: '', look: null, online: false },
                    ],
                  },
                  0,
                  (i) => hud.tick(`Remove seat ${i + 1} pressed.`),
                ),
              ),
            ),
          );
          holder.append(el);
          return () => el.remove();
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
        const sq = G.nodes.find((n) => n.t === 'shop')!;
        const bidders = G.players.map((q) => q.id);
        const view = new AuctionView(hud, G, sq.id, -1, sq.value, bidders);
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        let high = sq.value;
        await wait(700);
        for (const pid of bidders.slice(1)) {
          view.waiting(pid);
          await wait(700);
          view.bid(pid, high, true);
          high += 20;
        }
        const yes = await view.ask({
          kind: 'bid',
          pid: bidders[0],
          sq: sq.id,
          bid: high,
          high: high - 20,
          highBidder: bidders.at(-1)!,
          seller: -1,
        });
        view.bid(bidders[0], high, yes);
        await view.end(yes ? bidders[0] : bidders.at(-1)!, yes ? high : high - 20, 3000);
      }),
      btn('Stock market', () => hud.toggleDrawer('market')),
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
      btn('Open board editor', () => {
        location.hash = '#editor';
        location.reload();
      }),
    );
  }

  if (section) {
    const el = sections.get(section);
    if (el) {
      el.classList.add('flash');
      requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    }
  }
}
