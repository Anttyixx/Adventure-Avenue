/** Arcade outcomes are seeded engine decisions; every player sees the same reveals. */
import { K } from './constants';
import type { MemoryPrize, ReelSymbol, DecisionRequest } from './decisions';
import type { Game } from './engine';
import { randInt, shuffle } from './rng';
import { ownedShops } from './rules';
import type { Player } from './types';

export const REEL_SYMBOLS: ReelSymbol[] = ['seven', 'coin', 'wild', 'stock', 'bell'];
export const MEMORY_SHOW_MS = 1900;
export const REEL_PRIZES = [
  'No set',
  'One pair',
  'Two pairs',
  'Three matching',
  'Full house',
  'Four matching',
  'Five different',
  'Five matching',
];

/** Highest set only, with cash prizes scaled to the player's level. */
export function reelPrize(symbols: ReelSymbol[], level = 1) {
  const counts = REEL_SYMBOLS.map((s) => symbols.filter((x) => x === s).length).sort((a, b) => b - a);
  const rank =
    counts[0] === 5
      ? 7
      : counts[0] === 1
        ? 6
        : counts[0] === 4
          ? 5
          : counts[0] === 3 && counts[1] === 2
            ? 4
            : counts[0] === 3
              ? 3
              : counts[0] === 2 && counts[1] === 2
                ? 2
                : counts[0] === 2
                  ? 1
                  : 0;
  return { name: REEL_PRIZES[rank], amount: K.reels.prizes[rank] * level };
}

export async function playArcade(g: Game, p: Player) {
  const games = [luckyReels, memoryBlocks, coinDerby, luckyWheel, treasureSplit];
  const play = games[randInt(g.G, games.length)];
  await g.log(`${p.name} visits the arcade.`, p.id, 'arcade');
  return play(g, p);
}

export async function luckyReels(g: Game, p: Player) {
  let symbols = Array.from({ length: 5 }, () => REEL_SYMBOLS[randInt(g.G, REEL_SYMBOLS.length)]);
  let locked = new Array<boolean>(5).fill(false);
  for (let left = K.reels.rerolls; left > 0; left--) {
    const answer = await g.ask({
      kind: 'reels',
      pid: p.id,
      symbols: symbols.slice(),
      locked: locked.slice(),
      left,
    });
    if (!answer || answer.collect) break;
    locked = symbols.map((_, i) => answer.locked?.[i] === true);
    if (locked.every(Boolean)) break;
    symbols = symbols.map((s, i) => (locked[i] ? s : REEL_SYMBOLS[randInt(g.G, REEL_SYMBOLS.length)]));
  }
  const prize = reelPrize(symbols, p.level);
  await g.emit({ type: 'reels', pid: p.id, result: symbols, prize: `${prize.name} · ${prize.amount}G` });
  if (prize.amount) await g.pay(null, p, prize.amount, 'Lucky Reels');
  await g.log(`Lucky Reels: ${p.name} won ${prize.amount}G (${prize.name}).`, p.id, 'arcade');
}

export async function memoryBlocks(g: Game, p: Player) {
  const prizes = shuffle<MemoryPrize>(g.G, [
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
  let picked = await g.ask({ kind: 'memory', pid: p.id, prizes });
  if (!(picked >= 0 && picked < 9)) picked = 0;
  const L = p.level;
  let text = '';
  switch (prizes[picked]) {
    case 'shopsUp':
      text = 'Your shops +10%';
      await g.scaleShops(ownedShops(g.G, p.id), 1 + K.memory.shopsUp);
      break;
    case 'gold':
      text = `${K.memory.gold * L}G`;
      await g.pay(null, p, K.memory.gold * L, 'Memory Blocks');
      break;
    case 'wild':
      text = 'A Suit Yourself card';
      p.wild++;
      break;
    case 'shopsDown':
      text = 'Your shops -5%';
      await g.scaleShops(ownedShops(g.G, p.id), 1 - K.memory.shopsDown);
      break;
    case 'small':
      text = `${K.memory.small}G`;
      await g.pay(null, p, K.memory.small, 'Memory Blocks');
      break;
  }
  await g.emit({ type: 'memory', pid: p.id, prizes, picked, prize: text });
  await g.log(`Memory Blocks: ${p.name} won ${text}.`, p.id, 'arcade');
}

/** Collect choices privately in seat order, then reveal together. Never reveal earlier answers. */
async function choices(g: Game, payload: Omit<DecisionRequest<'arcadeChoice'>, 'kind' | 'pid'>) {
  const answers: { player: Player; choice: number; stake: number }[] = [];
  for (const player of g.G.players.filter((p) => !p.bankrupt)) {
    const maxBet = payload.maxBet == null ? undefined : Math.min(payload.maxBet, Math.max(0, player.cash));
    const answer = await g.ask({ kind: 'arcadeChoice', pid: player.id, ...payload, maxBet });
    const choice =
      Number.isInteger(answer?.choice) && answer.choice >= 0 && answer.choice < payload.options.length
        ? answer.choice
        : 0;
    const stake =
      maxBet != null && Number.isFinite(answer?.stake)
        ? Math.floor(Math.max(0, Math.min(maxBet, answer.stake!)) / K.wheel.step) * K.wheel.step
        : 0;
    answers.push({ player, choice, stake });
  }
  return answers;
}

export async function coinDerby(g: Game, _p: Player) {
  const players = g.G.players.filter((p) => !p.bankrupt);
  const scores = g.G.players.map(() => 0),
    coins = scores.slice();
  for (let round = 1; round <= K.derby.rounds; round++) {
    const picks = await choices(g, {
      game: 'Coin Derby',
      round,
      options: ['Sprint', 'Collect coins'],
      hint: 'Sprint for the finish or take 30G in coins. Three legs; first place earns a bonus.',
    });
    const previous = scores.slice();
    for (const { player: p, choice } of picks) {
      scores[p.id] += (choice === 0 ? K.derby.sprint : K.derby.collect) + randInt(g.G, K.derby.variation);
      coins[p.id] += choice === 0 ? K.derby.sprintCoins : K.derby.collectCoins;
    }
    const final = round === K.derby.rounds;
    const best = Math.max(...players.map((p) => scores[p.id]));
    const rows = picks.map(({ player: p, choice }) => ({
      pid: p.id,
      score: scores[p.id],
      previous: previous[p.id],
      text: final
        ? scores[p.id] === best
          ? 'First place!'
          : 'Finished'
        : choice === 0
          ? 'Sprint'
          : 'Collected coins',
      amount: coins[p.id] + (final && scores[p.id] === best ? K.derby.winner * p.level : 0),
    }));
    await g.emit({
      type: 'arcadeRound',
      game: 'Coin Derby',
      title: final ? 'Coin Derby · Finish!' : `Coin Derby · Leg ${round}`,
      detail: final
        ? 'Everyone keeps their coins. Tied leaders each earn the first-place bonus.'
        : 'Pick your strategy again for the next leg.',
      rows,
      final,
    });
    if (final)
      for (const row of rows) {
        await g.pay(null, g.G.players[row.pid], row.amount, 'Coin Derby');
        await g.log(`${g.G.players[row.pid].name} won ${row.amount}G in Coin Derby.`, row.pid, 'arcade');
      }
  }
}

export function wheelWins(choice: number, number: number) {
  return choice < 2 ? (number - 1) % 2 === choice : Math.floor((number - 1) / 4) === choice - 2;
}

export async function luckyWheel(g: Game, _p: Player) {
  const picks = await choices(g, {
    game: 'Lucky Wheel',
    round: 1,
    options: [
      'Red · 2× return',
      'Blue · 2× return',
      '1–4 · 3× return',
      '5–8 · 3× return',
      '9–12 · 3× return',
    ],
    hint: 'Bet up to 100G, or skip. Returns include your wager. Odd numbers are red; even numbers blue.',
    maxBet: K.wheel.maxBet,
  });
  const wheel = randInt(g.G, K.wheel.spaces) + 1;
  const rows = picks.map(({ player: p, choice, stake }) => {
    const won = wheelWins(choice, wheel);
    return {
      pid: p.id,
      text: stake ? `${won ? 'Won' : 'Lost'} · ${stake}G bet` : 'Skipped',
      amount: stake ? (won ? stake * (choice < 2 ? 1 : 2) : -stake) : 0,
    };
  });
  await g.emit({
    type: 'arcadeRound',
    game: 'Lucky Wheel',
    title: 'Lucky Wheel',
    detail: `${wheel} · ${wheel % 2 ? 'Red' : 'Blue'} — net winnings shown below`,
    wheel,
    rows,
    final: true,
  });
  for (const row of rows) {
    const p = g.G.players[row.pid];
    if (row.amount > 0) await g.pay(null, p, row.amount, 'Lucky Wheel');
    if (row.amount < 0) await g.pay(p, null, -row.amount, 'Lucky Wheel');
    await g.log(`${p.name}: ${row.amount >= 0 ? '+' : ''}${row.amount}G in Lucky Wheel.`, p.id, 'arcade');
  }
}

export async function treasureSplit(g: Game, _p: Player) {
  for (let round = 1; round <= K.treasure.rounds; round++) {
    const picks = await choices(g, {
      game: 'Treasure Split',
      round,
      options: K.treasure.chests.map((n, i) => `Chest ${i + 1} · ${n}G`),
      hint: 'Pick a chest. Everyone choosing it splits its coins. Two rounds.',
    });
    const rows = picks.map(({ player: p, choice }) => ({
      pid: p.id,
      text: `Chest ${choice + 1} · shared by ${picks.filter((a) => a.choice === choice).length}`,
      amount: Math.floor(K.treasure.chests[choice] / picks.filter((a) => a.choice === choice).length),
    }));
    await g.emit({
      type: 'arcadeRound',
      game: 'Treasure Split',
      title: `Treasure Split · Round ${round}`,
      detail: 'Choices revealed! Each chest is divided equally; leftover coins stay in the chest.',
      rows,
      final: round === K.treasure.rounds,
    });
    for (const row of rows) {
      await g.pay(null, g.G.players[row.pid], row.amount, 'Treasure Split');
      await g.log(`${g.G.players[row.pid].name} found ${row.amount}G in Treasure Split.`, row.pid, 'arcade');
    }
  }
}
