/** Coups Fourrés : catalogue du premier set et decks de départ. */
import { describe, expect, it } from 'vitest';
import { CARDS, CF_RULES, STARTER_DECKS, deckProblems, BOOSTER } from '../shared/cards/catalog';

describe('catalogue Coups Fourrés', () => {
  it('42 cartes, identifiants uniques, coûts de 0 à 5 (toujours payables avec la réserve de Tournées)', () => {
    expect(CARDS).toHaveLength(42);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) { expect(c.cost).toBeGreaterThanOrEqual(0); expect(c.cost).toBeLessThanOrEqual(5); expect(c.cost).toBeLessThanOrEqual(CF_RULES.tourneesMax); }
    // 5 Tournées : seulement la légendaire Retournement de veste.
    expect(CARDS.filter((c) => c.cost > 4).map((c) => c.id)).toEqual(['retournement-veste']);
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
