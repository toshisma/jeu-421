/** Coups Fourrés : catalogue du premier set et decks de départ. */
import { describe, expect, it } from 'vitest';
import { CARDS, STARTER_DECKS, deckProblems, BOOSTER } from '../shared/cards/catalog';

describe('catalogue Coups Fourrés', () => {
  it('34 cartes, identifiants uniques, coûts de 0 à 4', () => {
    expect(CARDS).toHaveLength(34);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(34);
    for (const c of CARDS) { expect(c.cost).toBeGreaterThanOrEqual(0); expect(c.cost).toBeLessThanOrEqual(4); }
  });
  it('decks de départ valides, sans légendaire', () => {
    for (const d of STARTER_DECKS) {
      expect(deckProblems(d.cards)).toEqual([]);
      for (const id of Object.keys(d.cards)) expect(CARDS.find((c) => c.id === id)!.rarity).not.toBe('legendaire');
    }
  });
  it('chances des boosters : total 100 %', () => {
    expect(Object.values(BOOSTER.odds).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});
