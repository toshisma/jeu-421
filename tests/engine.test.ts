import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, sanitizeConfig, type GameConfig } from '../shared/config';
import { evaluate, compareTurn } from '../shared/combos';
import { createGame, currentPlayerId, rollAction, stopAction, type GameState } from '../shared/engine';
import { decide, type Difficulty } from '../shared/ai';
import { mulberry32 } from '../shared/rng';

const V = DEFAULT_CONFIG.values;
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));
/** Source de dés scriptée. */
const scripted = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('combinaisons', () => {
  it('respecte l’ordre de priorité', () => {
    const order = [[4, 2, 1], [1, 1, 1], [6, 1, 1], [6, 6, 6], [5, 1, 1], [5, 5, 5], [4, 1, 1], [4, 4, 4], [3, 1, 1], [3, 3, 3], [2, 1, 1], [2, 2, 2], [6, 5, 4], [3, 2, 1], [6, 6, 5], [6, 5, 2], [3, 2, 2], [2, 2, 1]];
    const ranks = order.map((d) => evaluate(d, V).rank);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i - 1]).toBeGreaterThan(ranks[i]);
  });
  it('valeurs et étiquettes', () => {
    expect(evaluate([1, 2, 4], V)).toMatchObject({ kind: '421', value: 8 });
    expect(evaluate([1, 5, 1], V)).toMatchObject({ kind: '11x', value: 5 });
    expect(evaluate([3, 3, 3], V)).toMatchObject({ kind: 'brelan', value: 3 });
    expect(evaluate([6, 6, 6], V)).toMatchObject({ kind: 'brelan', value: 6 });
    expect(evaluate([2, 2, 2], V)).toMatchObject({ kind: 'brelan', value: 2 });
    expect(evaluate([5, 3, 4], V)).toMatchObject({ kind: 'suite', value: 2 });
    expect(evaluate([1, 2, 2], V)).toMatchObject({ kind: 'nenette' });
  });
  it('option : le moins de lancers départage', () => {
    const cfg = { ...DEFAULT_CONFIG, fewerThrowsWins: true };
    const a = { combo: evaluate([6, 5, 2], V), throws: 1 };
    const b = { combo: evaluate([6, 5, 2], V), throws: 3 };
    expect(compareTurn(a, b, cfg)).toBeGreaterThan(0);
    expect(compareTurn(a, b, DEFAULT_CONFIG)).toBe(0);
  });
  it('sanitizeConfig borne les valeurs', () => {
    const c = sanitizeConfig({ maxThrows: 99, chargeThrows: 50, variant: 'pirate', values: { v421: -3 } });
    expect(c.maxThrows).toBe(5);
    expect(c.chargeThrows).toBe(5);
    expect(c.variant).toBe('classique');
    expect(c.values.v421).toBe(1);
  });
});

describe('déroulement', () => {
  it('refuse les actions hors tour et les relances interdites', () => {
    const s = createGame(DEFAULT_CONFIG, players(3));
    expect(rollAction(s, 'p1', [false, false, false], scripted([1])).ok).toBe(false);
    expect(stopAction(s, 'p0').ok).toBe(false);
    expect(rollAction(s, 'p0', [false, false, false], scripted([6, 5, 3])).ok).toBe(true);
    // Charge : 1 seul lancer -> le tour est passé automatiquement.
    expect(currentPlayerId(s)).toBe('p1');
    expect(rollAction(s, 'p0', [false, false, false], scripted([1])).ok).toBe(false);
  });

  it('charge : le perdant prend au pot la valeur de la meilleure combinaison', () => {
    const s = createGame(DEFAULT_CONFIG, players(3));
    rollAction(s, 'p0', [false, false, false], scripted([4, 2, 1])); // 421 = 8
    rollAction(s, 'p1', [false, false, false], scripted([6, 5, 3]));
    rollAction(s, 'p2', [false, false, false], scripted([6, 4, 2]));
    expect(s.players[2].tokens).toBe(8);
    expect(s.pot).toBe(13);
    expect(currentPlayerId(s)).toBe('p2'); // le perdant commence
  });

  it('égalité en dernière place : barrage puis paiement', () => {
    const s = createGame(DEFAULT_CONFIG, players(3));
    rollAction(s, 'p0', [false, false, false], scripted([6, 1, 1])); // 6
    rollAction(s, 'p1', [false, false, false], scripted([6, 5, 3]));
    rollAction(s, 'p2', [false, false, false], scripted([6, 5, 3]));
    expect(s.isRolloff).toBe(true);
    expect(s.roundOrder).toEqual(['p1', 'p2']);
    rollAction(s, 'p1', [false, false, false], scripted([5, 5, 5]));
    rollAction(s, 'p2', [false, false, false], scripted([6, 4, 2]));
    expect(s.players[2].tokens).toBe(6);
    expect(s.isRolloff).toBe(false);
  });

  it('le premier joueur limite le nombre de lancers des suivants', () => {
    const cfg: GameConfig = { ...DEFAULT_CONFIG, variant: 'decharge' };
    const s = createGame(cfg, players(3));
    rollAction(s, 'p0', [false, false, false], scripted([6, 5, 3]));
    rollAction(s, 'p0', [true, false, false], scripted([4, 4]));
    stopAction(s, 'p0');
    expect(s.throwLimit).toBe(2);
    rollAction(s, 'p1', [false, false, false], scripted([6, 5, 3]));
    expect(rollAction(s, 'p1', [true, true, true], scripted([1])).ok).toBe(false); // tout garder = refusé
    rollAction(s, 'p1', [false, false, false], scripted([6, 5, 3]));
    expect(currentPlayerId(s)).toBe('p2');
  });

  it('nénette : le perdant prend au moins nenetteMin', () => {
    const cfg: GameConfig = { ...DEFAULT_CONFIG, variant: 'decharge', maxThrows: 1 };
    const s = createGame(cfg, players(2));
    rollAction(s, 'p0', [false, false, false], scripted([6, 5, 3])); // vaut 1
    rollAction(s, 'p1', [false, false, false], scripted([2, 2, 1]));
    expect(s.players[1].tokens).toBe(7 + 2);
    expect(s.players[0].tokens).toBe(7 - 2);
  });

  it('version incrémentée à chaque action réussie (anti double-clic)', () => {
    const s = createGame(DEFAULT_CONFIG, players(2));
    const v0 = s.version;
    rollAction(s, 'p0', [false, false, false], scripted([3, 3, 1]));
    expect(s.version).toBe(v0 + 1);
  });
});

/** Fait jouer une partie entière par des IA, en vérifiant les invariants. */
function playOut(cfg: GameConfig, n: number, diffs: Difficulty[], seed: number): GameState {
  const rng = mulberry32(seed);
  const die = () => 1 + Math.floor(rng() * 6);
  const s = createGame(cfg, players(n), seed % n);
  let guard = 0;
  while (s.phase !== 'fini' && guard++ < 20000) {
    const id = currentPlayerId(s)!;
    const d = decide(s, id, diffs[Number(id.slice(1))], rng);
    const r = d.kind === 'roll' ? rollAction(s, id, d.keep, die) : stopAction(s, id);
    expect(r.ok).toBe(true);
    if (cfg.variant === 'classique' || cfg.variant === 'decharge') {
      const total = s.players.reduce((a, p) => a + p.tokens, 0) + s.pot;
      expect(total).toBe(cfg.variant === 'classique' ? cfg.totalTokens : cfg.startTokens * n);
    }
  }
  expect(s.phase).toBe('fini');
  expect(new Set(s.ranking).size).toBe(n);
  return s;
}

describe('parties complètes jouées par l’IA', () => {
  it('toutes variantes, 2 à 6 joueurs, se terminent avec un classement complet', () => {
    for (const variant of ['classique', 'decharge', 'manches'] as const)
      for (let n = 2; n <= 6; n++)
        for (const tieRule of ['barrage', 'premierPerd', 'dernierPerd'] as const)
          playOut({ ...DEFAULT_CONFIG, variant, tieRule }, n, ['facile', 'normal', 'difficile', 'normal', 'facile', 'difficile'], n * 31 + variant.length);
  });

  it('l’IA difficile perd moins souvent que l’IA facile', () => {
    let easyLosses = 0, hardLosses = 0;
    for (let g = 0; g < 160; g++) {
      const s = playOut(DEFAULT_CONFIG, 2, g % 2 ? ['facile', 'difficile'] : ['difficile', 'facile'], 1000 + g);
      const loserIsEasy = (s.loserId === 'p0') === (g % 2 === 1);
      if (loserIsEasy) easyLosses++; else hardLosses++;
    }
    console.log(`défaites : facile ${easyLosses}, difficile ${hardLosses}`);
    expect(hardLosses).toBeLessThan(easyLosses);
  });
});

import { roundStatus, getPlayer } from '../shared/engine';
const getPlayerResult = (s: GameState, id: string) => getPlayer(s, id).lastResult!;
describe('suivi de manche', () => {
  it('« 521 pour 1 jeton », puis « 521 pour 6 jetons » après un 611', () => {
    const cfg: GameConfig = { ...DEFAULT_CONFIG, variant: 'decharge', maxThrows: 1 };
    const s = createGame(cfg, players(3));
    rollAction(s, 'p0', [false, false, false], scripted([5, 2, 1]));
    let st = roundStatus(s);
    expect(st.worst!.combo.label).toBe('5-2-1');
    expect(st.amount).toBe(1);
    rollAction(s, 'p1', [false, false, false], scripted([6, 1, 1]));
    st = roundStatus(s);
    expect(st.worst!.ids).toEqual(['p0']);
    expect(st.best!.id).toBe('p1');
    expect(st.amount).toBe(6);
    expect(st.remaining).toBe(1);
    // Simulation : si p2 garde une nénette, c'est lui le dernier, pour au moins 6.
    const hyp = roundStatus(s, { id: 'p2', dice: [2, 2, 1], throws: 1 });
    expect(hyp.worst!.ids).toEqual(['p2']);
    expect(hyp.amount).toBe(6);
    // Et l'affichage correspond au résultat réel de la manche.
    rollAction(s, 'p2', [false, false, false], scripted([6, 5, 3]));
    expect(s.players[0].tokens).toBe(7 + 6);
  });
  it('correspond toujours au résultat réel de la manche (parties IA, toutes règles d’égalité)', () => {
    let checked = 0;
    for (let g = 0; g < 30; g++) {
      const rng = mulberry32(500 + g);
      const variant = (['classique', 'decharge'] as const)[g % 2];
      const tieRule = (['barrage', 'premierPerd', 'dernierPerd'] as const)[g % 3];
      const s = createGame({ ...DEFAULT_CONFIG, variant, tieRule, fewerThrowsWins: g % 4 === 0 }, players(2 + (g % 4)));
      while (s.phase !== 'fini') {
        const id = currentPlayerId(s)!;
        const d = decide(s, id, 'normal', rng);
        const before = structuredClone(s);
        const r = d.kind === 'roll' ? rollAction(s, id, d.keep, () => 1 + Math.floor(rng() * 6)) : stopAction(s, id);
        expect(r.ok).toBe(true);
        const sum = s.lastSummary;
        if (sum && sum.seq !== before.lastSummary?.seq && !sum.barrage) {
          const res = getPlayerResult(s, id);
          const pred = roundStatus(before, { id, dice: res.dice, throws: res.throws });
          expect(pred.amount).toBe(sum.amount);
          expect(pred.worst!.ids).toContain(sum.loserId);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe('barrage à la figure ou à l’addition', () => {
  const play = (mode: 'figure' | 'addition') => {
    const s = createGame({ ...DEFAULT_CONFIG, rolloffMode: mode }, players(3));
    rollAction(s, 'p0', [false, false, false], scripted([6, 1, 1])); // 6 jetons
    rollAction(s, 'p1', [false, false, false], scripted([6, 5, 3]));
    rollAction(s, 'p2', [false, false, false], scripted([6, 5, 3])); // égalité → barrage p1/p2
    expect(s.isRolloff).toBe(true);
    rollAction(s, 'p1', [false, false, false], scripted([3, 2, 1])); // suite, total 6
    rollAction(s, 'p2', [false, false, false], scripted([6, 5, 2])); // ordinaire, total 13
    return s;
  };
  it('à la figure : la suite bat 6-5-2, p2 perd', () => {
    const s = play('figure');
    expect(s.players[2].tokens).toBe(6);
    expect(s.players[1].tokens).toBe(0);
  });
  it('à l’addition : 6 < 13, p1 perd', () => {
    const s = play('addition');
    expect(s.players[1].tokens).toBe(6);
    expect(s.players[2].tokens).toBe(0);
  });
});
