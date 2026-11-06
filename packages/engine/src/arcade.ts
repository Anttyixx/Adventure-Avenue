/** Arcade outcomes are seeded engine decisions; every player sees the same reveals. */
import { K } from './constants';
import type { MemoryPrize, ReelSymbol, DecisionRequest } from './decisions';
import type { Game } from './engine';
import { randInt, shuffle } from './rng';
import { ownedShops } from './rules';
import type { Player } from './types';

export const REEL_SYMBOLS: ReelSymbol[] = ['seven', 'coin', 'wild', 'stock', 'bell'];
export const MEMORY_SHOW_MS = 1900;
/** Set names from smallest to biggest prize; `K.reels.prizes` holds the prize for each. */
export const REEL_PRIZES = [
  'No set',
  'One pair',
  'Two pairs',
  'Three matching',
  'Five different',
  'Full house',
  'Four matching',
  'Five matching',
];

/** Index into REEL_PRIZES for a set of five symbols. */
function reelRank(symbols: ReelSymbol[]) {
  const counts = REEL_SYMBOLS.map((s) => symbols.filter((x) => x === s).length).sort((a, b) => b - a);
  if (counts[0] === 5) return 7;
  if (counts[0] === 4) return 6;
  if (counts[0] === 3 && counts[1] === 2) return 5;
  if (counts[0] === 1) return 4;
  if (counts[0] === 3) return 3;
  if (counts[0] === 2 && counts[1] === 2) return 2;
  return counts[0] === 2 ? 1 : 0;
}

/** Highest set only, with cash prizes scaled to the player's level. */
export function reelPrize(symbols: ReelSymbol[], level = 1) {
  const rank = reelRank(symbols);
  return { name: REEL_PRIZES[rank], amount: K.reels.prizes[rank] * level, rank };
}

/** Which slots make up the scoring set (all five for "five different"; none for no set). */
export function reelSetSlots(symbols: ReelSymbol[]): boolean[] {
  if (reelRank(symbols) === 4) return symbols.map(() => true);
  return symbols.map((s) => symbols.filter((x) => x === s).length >= 2);
}

export async function playArcade(g: Game, p: Player) {
  const games = [luckyReels, memoryBlocks, coinDerby, luckyWheel, treasureSplit];
  // Every game is played once before any repeats: pick among the ones not played this cycle.
  const G = g.G;
  // A new cycle never starts with the game that ended the last one.
  let played = (G.arcadePlayed ?? []).filter((i) => i < games.length);
  let last = -1;
  if (played.length >= games.length) {
    last = played[played.length - 1];
    played = [];
  }
  const left = games.map((_, i) => i).filter((i) => !played.includes(i) && i !== last);
  const pick = left[randInt(G, left.length)];
  G.arcadePlayed = [...played, pick];
  const play = games[pick];
  await g.log(`${p.name} visits the arcade.`, p.id, 'arcade');
  return play(g, p);
}

export async function luckyReels(g: Game, p: Player) {
  let symbols = Array.from({ length: 5 }, () => REEL_SYMBOLS[randInt(g.G, REEL_SYMBOLS.length)]);
  let locked = new Array<boolean>(5).fill(false);
  // Slots rolled since the player last saw them (only the last reroll, if the reels ran out).
  let rolled = new Array<boolean>(5).fill(false);
  for (let left = K.reels.rerolls; left > 0; left--) {
    const answer = await g.ask({
      kind: 'reels',
      pid: p.id,
      symbols: symbols.slice(),
      locked: locked.slice(),
      left,
    });
    rolled = rolled.map(() => false);
    if (!answer || answer.collect) break;
    locked = symbols.map((_, i) => answer.locked?.[i] === true);
    if (locked.every(Boolean)) break;
    symbols = symbols.map((s, i) => (locked[i] ? s : REEL_SYMBOLS[randInt(g.G, REEL_SYMBOLS.length)]));
    rolled = locked.map((l) => !l);
  }
  const prize = reelPrize(symbols, p.level);
  await g.emit({
    type: 'reels',
    pid: p.id,
    result: symbols,
    rolled,
    prize: `${prize.name} · ${prize.amount}G`,
  });
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
  const prize = prizes[picked];
  const text = {
    shopsUp: 'Your shops +10%',
    gold: `${K.memory.gold * L}G`,
    wild: 'A Suit Yourself card',
    shopsDown: 'Your shops -5%',
    small: `${K.memory.small}G`,
  }[prize];
  // The reveal comes first; the prize takes effect once the game is closed, so its coins or
  // value changes play out on the board.
  await g.emit({ type: 'memory', pid: p.id, prizes, picked, prize: text });
  switch (prize) {
    case 'shopsUp':
      await g.scaleShops(ownedShops(g.G, p.id), 1 + K.memory.shopsUp);
      break;
    case 'gold':
      await g.pay(null, p, K.memory.gold * L, 'Memory Blocks');
      break;
    case 'wild':
      p.wild++;
      break;
    case 'shopsDown':
      await g.scaleShops(ownedShops(g.G, p.id), 1 - K.memory.shopsDown);
      break;
    case 'small':
      await g.pay(null, p, K.memory.small, 'Memory Blocks');
      break;
  }
  await g.log(`Memory Blocks: ${p.name} won ${text}.`, p.id, 'arcade');
}

/**
 * Everyone chooses at the same time, privately; the round starts once all have locked in, and
 * the choices are revealed together. Every request goes out before any answer is awaited, and
 * the answers are applied in seat order (the player who landed first) whatever order they
 * arrive in, so every copy of the game agrees.
 */
async function choices(
  g: Game,
  lander: Player,
  payload: Omit<DecisionRequest<'arcadeChoice'>, 'kind' | 'pid' | 'order'>,
) {
  const answers: { player: Player; choice: number; stake: number }[] = [];
  const n = g.G.players.length;
  const order = g.G.players.map((_, i) => g.G.players[(lander.id + i) % n]).filter((p) => !p.bankrupt);
  const bets = order.map((player) =>
    payload.maxBet == null ? undefined : Math.min(payload.maxBet, Math.max(0, player.cash)),
  );
  const asked = order.map((player, i) =>
    g.ask({
      kind: 'arcadeChoice',
      pid: player.id,
      ...payload,
      order: order.map((p) => p.id),
      maxBet: bets[i],
    }),
  );
  const got = await Promise.all(asked);
  for (const [i, player] of order.entries()) {
    const maxBet = bets[i];
    const answer = got[i];
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

/** A whole number of spaces from `range[0]` to `range[1]`. */
function spaces(g: Game, range: readonly number[]) {
  return range[0] + randInt(g.G, range[1] - range[0] + 1);
}

/**
 * Coin Derby: everyone races down a track. Each leg, every racer secretly chooses to Sprint
 * (move 3-5 spaces) or Grab coins (move 1-3 spaces, +30G). After the last leg the furthest racer
 * (ties too) wins a bonus; everyone keeps the coins they grabbed.
 */
export async function coinDerby(g: Game, lander: Player) {
  const D = K.derby;
  const pos = g.G.players.map(() => 0);
  const coins = pos.slice();
  for (let leg = 1; leg <= D.legs; leg++) {
    const picks = await choices(g, lander, {
      game: 'Coin Derby',
      round: leg,
      options: [
        `Sprint · move ${D.sprint[0]}-${D.sprint[1]} spaces`,
        `Grab coins · move ${D.grab[0]}-${D.grab[1]}, +${D.grabCoins}G`,
      ],
      hint: `Leg ${leg} of ${D.legs}. Furthest after leg ${D.legs} wins a bonus.`,
    });
    const previous = pos.slice();
    const moved = pos.map(() => 0);
    for (const { player: p, choice } of picks) {
      moved[p.id] = Math.min(D.track - pos[p.id], spaces(g, choice === 0 ? D.sprint : D.grab));
      pos[p.id] += moved[p.id];
      if (choice === 1) coins[p.id] += D.grabCoins;
    }
    const final = leg === D.legs;
    const best = Math.max(...picks.map(({ player: p }) => pos[p.id]));
    const rows = picks.map(({ player: p, choice }) => {
      const won = final && pos[p.id] === best;
      const did = choice === 0 ? `Sprinted ${moved[p.id]}` : `Grabbed ${D.grabCoins}G, moved ${moved[p.id]}`;
      return {
        pid: p.id,
        score: pos[p.id],
        previous: previous[p.id],
        text: won ? `${did} · Winner!` : did,
        choice,
        amount: coins[p.id] + (won ? D.winner * p.level : 0),
      };
    });
    await g.emit({
      type: 'arcadeRound',
      game: 'Coin Derby',
      title: final ? 'Coin Derby · Final results' : `Coin Derby · Leg ${leg} of ${D.legs}`,
      detail: final
        ? `Furthest racer wins ${D.winner}G × their level. Everyone keeps the coins they grabbed.`
        : `Next: leg ${leg + 1} of ${D.legs}.`,
      rows,
      final,
    });
    if (final)
      for (const row of rows) {
        if (row.amount) await g.pay(null, g.G.players[row.pid], row.amount, 'Coin Derby');
        await g.log(`${g.G.players[row.pid].name} won ${row.amount}G in Coin Derby.`, row.pid, 'arcade');
      }
  }
}

/** Short names for the wheel's bets, in option order. */
export const WHEEL_BETS = ['Red', 'Blue', '1-4', '5-8', '9-12'];

export function wheelWins(choice: number, number: number) {
  return choice < 2 ? (number - 1) % 2 === choice : Math.floor((number - 1) / 4) === choice - 2;
}

export async function luckyWheel(g: Game, lander: Player) {
  const picks = await choices(g, lander, {
    game: 'Lucky Wheel',
    round: 1,
    options: ['Red (odd)', 'Blue (even)', '1-4', '5-8', '9-12'],
    hint: 'Bet on a color (wins 1×) or a group of four numbers (wins 2×), or skip.',
    maxBet: K.wheel.maxBet,
  });
  const wheel = randInt(g.G, K.wheel.spaces) + 1;
  const rows = picks.map(({ player: p, choice, stake }) => {
    const won = wheelWins(choice, wheel);
    return {
      pid: p.id,
      text: stake ? `${WHEEL_BETS[choice]} · bet ${stake}G` : 'Skipped',
      choice: stake ? choice : -1,
      amount: stake ? (won ? stake * (choice < 2 ? 1 : 2) : -stake) : 0,
    };
  });
  await g.emit({
    type: 'arcadeRound',
    game: 'Lucky Wheel',
    title: 'Lucky Wheel',
    detail: `Winning bets: ${WHEEL_BETS.filter((_, i) => wheelWins(i, wheel)).join(' and ')}.`,
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

export async function treasureSplit(g: Game, lander: Player) {
  // Coins are tallied each round and handed out together once the last round is over.
  const totals = g.G.players.map(() => 0);
  for (let round = 1; round <= K.treasure.rounds; round++) {
    const picks = await choices(g, lander, {
      game: 'Treasure Split',
      round,
      options: K.treasure.chests.map((n) => `${n}G chest`),
      hint: `Round ${round} of ${K.treasure.rounds}. Anyone who picks the same chest splits it.`,
    });
    const final = round === K.treasure.rounds;
    const rows = picks.map(({ player: p, choice }) => {
      const n = picks.filter((a) => a.choice === choice).length;
      const share = Math.floor(K.treasure.chests[choice] / n);
      totals[p.id] += share;
      return {
        pid: p.id,
        text: `${K.treasure.chests[choice]}G chest${n > 1 ? ` · split ${n} ways` : ' · all yours'}`,
        choice,
        amount: share,
        total: totals[p.id],
      };
    });
    await g.emit({
      type: 'arcadeRound',
      game: 'Treasure Split',
      title: `Treasure Split · Round ${round} of ${K.treasure.rounds}`,
      detail: final
        ? 'Everyone now collects all the coins they found.'
        : 'Each chest is shared equally. Coins are handed out after the last round.',
      rows,
      final,
    });
  }
  for (const p of g.G.players) {
    if (!totals[p.id]) continue;
    await g.pay(null, p, totals[p.id], 'Treasure Split');
    await g.log(`${p.name} found ${totals[p.id]}G in Treasure Split.`, p.id, 'arcade');
  }
}
