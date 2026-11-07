import { describe, expect, it } from 'vitest';
import { act, bestScore, hasScoring, kindValue, newGame, pickPoints, scoreSelection, validSelections, type DmState } from '../shared/dixmille/engine';
import { continueValue, decide, MISS_CHANCE } from '../shared/dixmille/ai';

const ok = (r: ReturnType<typeof act>): DmState => { if ('error' in r) throw new Error(r.error); return r.state; };
/** État de test : le joueur en cours vient de lancer `dice` (les dés `out` sont déjà de côté). */
function rolledState(dice: number[], out: boolean[] = Array(6).fill(false), turnPoints = 0): DmState {
  const s = newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 2000, 1);
  return { ...s, phase: 'choisir', dice, out, rolled: out.map((o) => !o), turnPoints };
}

describe('Dix mille : valeurs', () => {
  it('dés seuls', () => {
    expect(scoreSelection([1])).toBe(100);
    expect(scoreSelection([5])).toBe(50);
    expect(scoreSelection([1, 5])).toBe(150);
    expect(scoreSelection([1, 1])).toBe(200);
    expect(scoreSelection([5, 5])).toBe(100);
  });
  it('trois identiques et plus (doublé à chaque dé en plus)', () => {
    expect(scoreSelection([1, 1, 1])).toBe(1000);
    for (const f of [2, 3, 4, 5, 6]) expect(scoreSelection([f, f, f])).toBe(f * 100);
    expect(scoreSelection([2, 2, 2, 2])).toBe(400);
    expect(scoreSelection([2, 2, 2, 2, 2])).toBe(800);
    expect(scoreSelection([2, 2, 2, 2, 2, 2])).toBe(1600);
    expect(scoreSelection([1, 1, 1, 1])).toBe(2000);
    expect(scoreSelection([1, 1, 1, 1, 1, 1])).toBe(8000);
    expect(scoreSelection([5, 5, 5, 5])).toBe(1000);
    expect(kindValue(6, 6)).toBe(4800);
  });
  it('suites', () => {
    expect(scoreSelection([1, 2, 3, 4, 5])).toBe(500);
    expect(scoreSelection([2, 3, 4, 5, 6])).toBe(750);
    expect(scoreSelection([6, 5, 4, 3, 2, 1])).toBe(1500);
    expect(scoreSelection([1, 2, 3, 4, 5, 5])).toBe(550);
    expect(scoreSelection([1, 1, 2, 3, 4, 5])).toBe(600);
    expect(scoreSelection([2, 3, 4, 5, 6, 5])).toBe(800);
  });
  it('combinaisons mêlées', () => {
    expect(scoreSelection([3, 3, 3, 1, 5])).toBe(450);
    expect(scoreSelection([4, 4, 4, 4, 1, 1])).toBe(1000);
    expect(scoreSelection([2, 2, 2, 3, 3, 3])).toBe(500);
  });
  it('un dé qui ne rapporte rien rend la sélection invalide', () => {
    expect(scoreSelection([2])).toBeNull();
    expect(scoreSelection([1, 2])).toBeNull();
    expect(scoreSelection([3, 3])).toBeNull();
    expect(scoreSelection([2, 3, 4, 5])).toBeNull();
    expect(scoreSelection([])).toBeNull();
  });
  it('raté : aucun dé qui rapporte', () => {
    expect(hasScoring([2, 3, 4, 6, 6, 2])).toBe(false);
    expect(hasScoring([2, 2, 2])).toBe(true);
    expect(hasScoring([2, 3, 5])).toBe(true);
    expect(bestScore([2, 3, 4, 6])).toBe(0);
    expect(bestScore([1, 1, 1, 5, 2, 3])).toBe(1050);
  });
  it('liste des sélections possibles', () => {
    const sels = validSelections([1, 5, 2, 2, 2, 6]);
    expect(sels[0].points).toBe(350);
    expect(sels.map((x) => x.points).sort((a, b) => a - b)).toEqual([50, 100, 150, 200, 250, 300, 350]);
  });
});

describe('Dix mille : déroulé', () => {
  it('lancer, mettre de côté, relancer, encaisser', () => {
    let s = newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 2000, 42);
    expect('error' in act(s, { type: 'encaisser', pick: [0] })).toBe(true);
    // On cherche une graine où le premier lancer rapporte.
    let seed = 1;
    while (!hasScoring((s = ok(act(newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 2000, seed), { type: 'lancer' }))).dice) || s.current !== 0) seed++;
    const sel = validSelections(s.dice)[0];
    const s2 = ok(act(s, { type: 'encaisser', pick: sel.idx }));
    expect(s2.players[0].score).toBe(sel.points);
    expect(s2.current).toBe(1);
    expect(s2.phase).toBe('debut');
  });
  it('sélection invalide refusée (dé qui ne rapporte pas, dé déjà de côté, doublon)', () => {
    const s = rolledState([1, 2, 3, 4, 6, 6]);
    expect('error' in act(s, { type: 'relancer', pick: [1] })).toBe(true);
    expect('error' in act(s, { type: 'relancer', pick: [0, 0] })).toBe(true);
    expect('error' in act(s, { type: 'relancer', pick: [] })).toBe(true);
    const out = rolledState([1, 5, 3, 4, 6, 2], [true, false, false, false, false, false], 100);
    expect(pickPoints(out, [0])).toBeNull();
    expect(pickPoints(out, [1])).toBe(50);
  });
  it('raté : les points du tour sont perdus, le tour passe', () => {
    let found = false;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const s = { ...rolledState([1, 5, 1, 5, 2, 3], [false, false, false, false, false, false]), seed };
      const n = ok(act(s, { type: 'relancer', pick: [0, 1, 2, 3] }));
      if (n.events.some((e) => e.kind === 'rate')) {
        found = true;
        expect(n.current).toBe(1);
        expect(n.players[0].score).toBe(0);
        expect(n.turnPoints).toBe(0);
        expect(n.players[0].misses).toBe(1);
        expect(n.events.find((e) => e.kind === 'rate')).toMatchObject({ lost: 300 });
      }
    }
    expect(found).toBe(true);
  });
  it('main pleine : les 6 dés de côté, on relance les 6', () => {
    const s = rolledState([1, 1, 1, 5, 5, 3], [false, false, false, false, false, true], 0);
    const n = ok(act({ ...s, rolled: [true, true, true, true, true, false], out: [false, false, false, false, false, true] }, { type: 'relancer', pick: [0, 1, 2, 3, 4] }));
    expect(n.events[0]).toMatchObject({ kind: 'main-pleine', turn: 1100 });
    expect(n.events[1]).toMatchObject({ kind: 'lancer' });
    expect((n.events[1] as { rolled: boolean[] }).rolled).toEqual([true, true, true, true, true, true]);
  });
  it('fin de partie : le premier qui atteint la cible gagne', () => {
    const s = rolledState([1, 1, 1, 2, 3, 4]);
    s.players[0].score = 1500;
    const n = ok(act(s, { type: 'encaisser', pick: [0, 1, 2] }));
    expect(n.phase).toBe('fini');
    expect(n.winner).toBe('a');
    expect(n.players[0].score).toBe(2500);
    expect('error' in act(n, { type: 'lancer' })).toBe(true);
  });
  it('déterministe avec la graine', () => {
    const a = ok(act(newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 2000, 99), { type: 'lancer' }));
    const b = ok(act(newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 2000, 99), { type: 'lancer' }));
    expect(a.dice).toEqual(b.dice);
  });
});

describe('Dix mille : ordinateurs', () => {
  it('probabilités de rater cohérentes', () => {
    expect(MISS_CHANCE[1]).toBeCloseTo(2 / 3);
    expect(MISS_CHANCE[6]).toBeLessThan(0.03);
    // Avec 6 dés et peu de points, relancer vaut toujours mieux.
    expect(continueValue(300, 6)).toBeGreaterThan(300);
    expect(continueValue(1000, 1)).toBeLessThan(1000);
  });
  it('encaisse quand cela fait gagner', () => {
    const s = rolledState([1, 2, 3, 4, 6, 6], undefined, 0);
    s.players[0].score = 1950;
    for (const lvl of ['debutant', 'habitue', 'fouine'] as const) expect(decide(s, lvl).type).toBe('encaisser');
  });
  it('la fine fouine garde un seul 1 plutôt que 1 et 5 avec 6 dés', () => {
    const s = rolledState([1, 5, 2, 3, 4, 6].map((v, i) => (i === 3 ? 6 : v)));
    const a = decide(s, 'fouine');
    expect(a).toEqual({ type: 'relancer', pick: [0] });
  });
  it('aucune partie bloquée, à 2, 3 et 4 joueurs, tous niveaux', () => {
    const lv = ['debutant', 'habitue', 'fouine'] as const;
    for (let g = 0; g < 120; g++) {
      const n = 2 + (g % 3);
      let s = newGame(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}`, bot: lv[(g + i) % 3] })), [2000, 4000, 10000][g % 3], 1000 + g);
      let k = 0;
      while (s.phase !== 'fini' && k++ < 20000) s = ok(act(s, decide(s, s.players[s.current].bot!)));
      expect(s.phase).toBe('fini');
      expect(s.players.find((p) => p.id === s.winner)!.score).toBeGreaterThanOrEqual(s.target);
    }
  });
});
