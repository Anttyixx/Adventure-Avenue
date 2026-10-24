/**
 * Arcade minigames. The engine owns every random outcome (reel strips, block layout, the race);
 * the player's only input is when to stop, which block to pick, or which racer to back.
 */
import { K } from './constants';
import type { MemoryPrize, ReelSymbol } from './decisions';
import type { Game } from './engine';
import { rand, randInt, shuffle } from './rng';
import { ownedShops } from './rules';
import type { Player } from './types';

export const REEL_SYMBOLS: ReelSymbol[] = ['seven', 'coin', 'wild', 'stock'];
export const REEL_LENGTH = 8;
export const REEL_TICK_MS = 120;
export const MEMORY_SHOW_MS = 1900;
export const DERBY_RACERS = 5;
export const DERBY_LENGTH = 100;

export async function playArcade(g: Game, p: Player) {
  const which = randInt(g.G, 3);
  await g.log(`${p.name} visits the arcade.`, p.id, 'arcade');
  if (which === 0) return luckyReels(g, p);
  if (which === 1) return memoryBlocks(g, p);
  return coinDerby(g, p);
}

export async function luckyReels(g: Game, p: Player) {
  const G = g.G;
  const strips = [0, 1, 2].map(() =>
    shuffle(
      G,
      REEL_SYMBOLS.flatMap((s) => [s, s]),
    ),
  );
  const stops = await g.ask({ kind: 'reels', pid: p.id, strips });
  const result = strips.map((strip, i) => {
    const n =
      Array.isArray(stops) && Number.isFinite(stops[i]) ? Math.floor(stops[i]) : randInt(G, REEL_LENGTH);
    return strip[((n % REEL_LENGTH) + REEL_LENGTH) % REEL_LENGTH];
  });
  const L = p.level;
  let prize = 'No match';
  if (result.every((s) => s === result[0])) {
    switch (result[0]) {
      case 'seven':
        prize = `${K.reels.sevens * L}G`;
        await g.pay(null, p, K.reels.sevens * L, 'Lucky Reels');
        break;
      case 'coin':
        prize = `${K.reels.coins * L}G`;
        await g.pay(null, p, K.reels.coins * L, 'Lucky Reels');
        break;
      case 'wild':
        prize = 'A Suit Yourself card';
        p.wild++;
        break;
      case 'stock':
        if (G.rules === 'standard') {
          const d = randInt(G, G.districts.length);
          p.shares[d] += K.reels.stockShares;
          prize = `${K.reels.stockShares} ${G.districts[d].name} shares`;
        } else {
          prize = `${K.reels.stockEasyCash}G`;
          await g.pay(null, p, K.reels.stockEasyCash, 'Lucky Reels');
        }
        break;
    }
  } else if (new Set(result).size === 2) {
    prize = `${K.reels.pair * L}G`;
    await g.pay(null, p, K.reels.pair * L, 'Lucky Reels');
  }
  await g.emit({ type: 'reels', pid: p.id, result, prize });
  await g.log(`Lucky Reels: ${p.name} won ${prize}.`, p.id, 'arcade');
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

export async function coinDerby(g: Game, p: Player) {
  const G = g.G;
  let pick = await g.ask({ kind: 'pickRacer', pid: p.id, count: DERBY_RACERS });
  if (!(pick >= 0 && pick < DERBY_RACERS)) pick = 0;
  const backers = new Array(DERBY_RACERS).fill(-1);
  backers[pick] = p.id;
  const free = shuffle(
    G,
    [...Array(DERBY_RACERS).keys()].filter((i) => i !== pick),
  );
  for (const q of G.players) {
    if (q === p || q.bankrupt) continue;
    const r = free.shift();
    if (r != null) backers[r] = q.id;
  }
  // Simulate the race: random speeds with occasional bursts; coins are picked up on the way.
  const pos = new Array(DERBY_RACERS).fill(0);
  const coins = new Array(DERBY_RACERS).fill(0);
  const frames: number[][] = [pos.slice()];
  let winner = -1;
  while (winner < 0 && frames.length < 400) {
    for (let i = 0; i < DERBY_RACERS; i++) {
      let v = 0.6 + rand(G) * 1.2;
      if (rand(G) < 0.06) v += 3;
      pos[i] = Math.min(DERBY_LENGTH, pos[i] + v);
      if (rand(G) < 0.1) coins[i]++;
    }
    frames.push(pos.map((x) => Math.round(x * 10) / 10));
    const done = pos.map((x, i) => [x, i]).filter(([x]) => x >= DERBY_LENGTH);
    if (done.length) winner = done[randInt(G, done.length)][1];
  }
  if (winner < 0) winner = pos.indexOf(Math.max(...pos));
  await g.emit({ type: 'derby', backers, frames, coins, winner });
  for (let i = 0; i < DERBY_RACERS; i++) {
    const q = backers[i] >= 0 ? G.players[backers[i]] : null;
    if (!q) continue;
    let amount = coins[i] * K.derby.perCoin;
    if (i === winner) amount += K.derby.winner * q.level;
    if (amount > 0) {
      await g.pay(null, q, amount, 'Coin Derby');
      await g.log(`${q.name} won ${amount}G in the Coin Derby.`, q.id, 'arcade');
    }
  }
  const wq = backers[winner] >= 0 ? G.players[backers[winner]] : null;
  await g.log(`Coin Derby: racer ${winner + 1} won${wq ? ` for ${wq.name}` : ''}!`, wq?.id, 'arcade');
}
