import { describe, expect, it } from 'vitest';
import { evaluate } from '../shared/combos';
import { DEFAULT_CONFIG } from '../shared/config';
import { fairDie } from '../shared/random';

/**
 * Vérification statistique du hasard des dés (test du khi-deux).
 * Seuils choisis pour qu'un dé équitable échoue moins d'une fois sur un million.
 */
describe('hasard des dés', () => {
  it('chaque face sort une fois sur six (600 000 lancers)', () => {
    const N = 600_000;
    const c = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) c[fairDie() - 1]++;
    const e = N / 6;
    const chi2 = c.reduce((s, x) => s + (x - e) ** 2 / e, 0);
    expect(chi2).toBeLessThan(35); // 5 degrés de liberté, p ≈ 1e-6
    for (const x of c) expect(Math.abs(x / N - 1 / 6)).toBeLessThan(0.003);
  });

  it('les combinaisons sortent à leur fréquence théorique (300 000 tirages de 3 dés)', () => {
    const N = 300_000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const k = evaluate([fairDie(), fairDie(), fairDie()], DEFAULT_CONFIG.values).kind;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    // Probabilités exactes sur les 216 tirages possibles.
    const theory: Record<string, number> = { '421': 6 / 216, '111': 1 / 216, '11x': 15 / 216, brelan: 5 / 216, suite: 24 / 216, nenette: 3 / 216 };
    theory.autre = 1 - Object.values(theory).reduce((a, b) => a + b, 0);
    let chi2 = 0;
    for (const [k, p] of Object.entries(theory)) chi2 += ((counts[k] ?? 0) - N * p) ** 2 / (N * p);
    expect(chi2).toBeLessThan(40); // 6 degrés de liberté, p ≈ 1e-6
  });

  it('pas de lien entre deux lancers successifs', () => {
    const N = 360_000;
    const pair = new Array(36).fill(0);
    let prev = fairDie();
    for (let i = 0; i < N; i++) { const d = fairDie(); pair[(prev - 1) * 6 + d - 1]++; prev = d; }
    const e = N / 36;
    const chi2 = pair.reduce((s, x) => s + (x - e) ** 2 / e, 0);
    expect(chi2).toBeLessThan(80); // 35 degrés de liberté, p ≈ 1e-5
  });
});

import { REWARDS, rewardFor } from '../shared/progress/profile';

describe('gains de pièces', () => {
  const base = { mode: 'solo' as const, difficulty: 'normal' as const, count421: 0, day: '2026-06-10' };
  it('dépendent de la place finale', () => {
    const at = (place: number) => rewardFor(place === 1, 10, { ...base, opponents: 3, place, minutes: 20 }).coins;
    expect(at(1)).toBeGreaterThan(at(2));
    expect(at(2)).toBeGreaterThan(at(3));
    expect(at(4)).toBe(0); // le dernier ne gagne pas de pièces
  });
  it('dépendent du nombre de joueurs', () => {
    const win = (opponents: number) => rewardFor(true, 10, { ...base, opponents, place: 1, minutes: 20 }).coins;
    expect(win(1)).toBe(REWARDS.coinsBase + REWARDS.coinsPerPlayer); // 2 joueurs : 6
    expect(win(5)).toBe(REWARDS.coinsBase + 5 * REWARDS.coinsPerPlayer); // 6 joueurs : 18
  });
  it('dépendent de la durée réelle', () => {
    const win = (minutes: number) => rewardFor(true, 10, { ...base, opponents: 1, place: 1, minutes }).coins;
    expect(win(2)).toBeLessThan(win(8));
    expect(win(8)).toBeLessThan(win(15));
    expect(win(15)).toBe(win(60)); // plafonné à 15 minutes
  });
});
