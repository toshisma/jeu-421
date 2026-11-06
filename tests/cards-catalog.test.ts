/** Coups Fourrés : catalogue du premier set et decks de départ. */
import { describe, expect, it } from 'vitest';
import { CARDS, CF_RULES, STARTER_DECKS, deckProblems, BOOSTER } from '../shared/cards/catalog';

describe('catalogue Coups Fourrés', () => {
  it('50 cartes, identifiants uniques, coûts de 0 à 6 (toujours payables avec la réserve de Tournées)', () => {
    expect(CARDS).toHaveLength(50);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) { expect(c.cost).toBeGreaterThanOrEqual(0); expect(c.cost).toBeLessThanOrEqual(CF_RULES.tourneesMax); }
    // Plus de 4 Tournées : trois cartes seulement (0.40).
    expect(CARDS.filter((c) => c.cost > 4).map((c) => c.id)).toEqual(['efface-tout', 'retournement-veste', 'bon-numero']);
  });
  it('règle de construction : 2 familles au plus, une seule légendaire, messages qui disent quoi retirer', () => {
    const three = { patron: 1, pilier: 2, 'cul-sec': 2, 'coup-coude': 2, leurre: 2, mouchard: 2, fouine: 2, 'croche-patte': 2, 'vide-poches': 2, 'faux-421': 2, 'gueule-bois': 1 };
    const pb = deckProblems(three);
    expect(pb.some((x) => /2 familles au plus/.test(x) && /retirez/.test(x))).toBe(true);
    const legends = { patron: 1, 'tournee-generale': 1, pilier: 2, videur: 2, josiane: 2, 'vieux-marcel': 2, 'tournee-patron': 2, 'ticket-caisse': 2, fermeture: 2, 'note-salee': 2, 'cul-sec': 2 };
    expect(deckProblems(legends).some((x) => /Une seule légendaire/.test(x) && /retirez/.test(x))).toBe(true);
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
