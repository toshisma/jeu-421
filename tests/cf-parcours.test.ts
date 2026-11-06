/** Coups Fourrés : parcours débutant (0.39) — decks d'entraînement valides, un type de plus à chaque étape. */
import { describe, expect, it } from 'vitest';
import { PARCOURS, parcoursProblems, parcoursStepOf } from '../shared/cards/parcours';
import { CARD_BY_ID } from '../shared/cards/catalog';

describe('parcours débutant', () => {
  it('4 étapes de 20 cartes, seulement les types annoncés, un type nouveau à chaque fois', () => {
    expect(parcoursProblems()).toEqual([]);
    expect(PARCOURS.map((p) => p.types.length)).toEqual([1, 2, 3, 5]);
    for (const p of PARCOURS) expect(Object.values(p.cards).reduce((a, b) => a + b, 0)).toBe(20);
    // Chaque type nouveau est vraiment présent dans le deck de l'étape.
    for (const p of PARCOURS) for (const t of p.types) expect(Object.keys(p.cards).some((id) => CARD_BY_ID[id].type === t)).toBe(true);
  });
  it('identifiants « parcours:N »', () => {
    expect(parcoursStepOf('parcours:2')?.title).toBe('Les Pièges');
    expect(parcoursStepOf('parcours:9')).toBeNull();
    expect(parcoursStepOf('mon-deck')).toBeNull();
  });
});
