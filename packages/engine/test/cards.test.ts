import { describe, expect, it } from 'vitest';
import { CARDS, CARD_LIST, buildDeck } from '../src/cards';

describe('venture card reference numbers', () => {
  it('keeps every existing card number stable', () => {
    expect(Object.fromEntries(CARD_LIST.map((card) => [card.id, card.number]))).toEqual({
      rollAgain: 1,
      move2: 2,
      zoomBank: 3,
      zoomAny: 4,
      bank50: 5,
      leader40: 6,
      lose10: 7,
      giveAll30: 8,
      halfSalary: 9,
      giveLast: 10,
      perProperty: 11,
      shops10: 12,
      shop40: 13,
      district15: 14,
      allClose: 15,
      oddEven: 16,
      fees30: 17,
      commission50: 18,
      freeHeart: 19,
      wild: 20,
      promo: 21,
      investNow: 22,
      forcedBuyout: 23,
      free20: 24,
      up20: 25,
      down20: 26,
      dividend10: 27,
      tax2: 28,
      buy10off: 29,
      sell20above: 30,
    });
    expect(new Set(CARD_LIST.map((card) => card.number)).size).toBe(CARD_LIST.length);
  });

  it('uses the same numbers in both decks and leaves stock cards out of Easy', () => {
    expect(buildDeck('standard')).toHaveLength(30);
    expect(buildDeck('easy')).toHaveLength(23);
    for (const id of buildDeck('easy')) {
      expect(CARDS[id].std).not.toBe(true);
      expect(buildDeck('standard')).toContain(id);
      expect(CARDS[id].number).toBeGreaterThan(0);
    }
  });
});
