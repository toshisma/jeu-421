/** Décharge : égalité pour la meilleure combinaison → barrage pour savoir qui donne. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, sanitizeConfig } from '../shared/config';
import { createGame, currentPlayerId, rollAction, stopAction, type GameState } from '../shared/engine';

const seq = (v: number[]) => { let i = 0; return () => v[i++]; };
/** Joue le tour du joueur courant avec ces trois dés, puis valide. */
function play(s: GameState, dice: number[]) {
  const pid = currentPlayerId(s)!;
  const r = rollAction(s, pid, [false, false, false], seq(dice));
  expect(r.ok).toBe(true);
  if (s.throwsUsed < s.throwLimit && currentPlayerId(s) === pid) stopAction(s, pid);
}
function decharge(cfg = DEFAULT_CONFIG) {
  const s = createGame(sanitizeConfig({ ...cfg, maxThrows: 1, chargeThrows: 1, leaderSetsThrows: false }), [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], 0);
  // Mise en décharge directe : chacun a des jetons.
  s.phase = 'decharge'; s.pot = 0;
  for (const p of s.players) p.tokens = 10;
  return s;
}

describe('barrage entre les meilleurs (décharge)', () => {
  it('deux 4-2-1 : barrage entre eux, le gagnant du barrage donne au perdant', () => {
    const s = decharge();
    play(s, [4, 2, 1]); play(s, [4, 2, 1]); play(s, [3, 2, 2]);
    expect(s.isRolloff).toBe(true);
    expect(s.rolloffKind).toBe('donneur');
    expect([...s.roundOrder].sort()).toEqual(['a', 'b']);
    expect(s.lastSummary?.text).toMatch(/barrage .*pour savoir qui donne/);
    const first = currentPlayerId(s)!;
    play(s, [6, 6, 6]); play(s, [3, 2, 1]); // le premier du barrage gagne : il donne
    const loser = s.players.find((p) => p.id === 'c')!;
    expect(loser.tokens).toBe(10 + 8);
    expect(s.players.find((p) => p.id === first)!.tokens).toBe(10 - 8);
    expect(s.isRolloff).toBe(false);
  });
  it('règle « le premier donne » : pas de barrage', () => {
    const s = decharge({ ...DEFAULT_CONFIG, bestTieRule: 'premier' });
    play(s, [4, 2, 1]); play(s, [4, 2, 1]); play(s, [3, 2, 2]);
    expect(s.isRolloff).toBe(false);
    expect(s.players.find((p) => p.id === 'a')!.tokens).toBe(2); // le premier à avoir fait 4-2-1 donne
    expect(s.players.find((p) => p.id === 'c')!.tokens).toBe(18);
  });
  it('double égalité : d’abord le barrage pour la dernière place, puis celui pour savoir qui donne', () => {
    const s = decharge();
    // 4 joueurs pour avoir deux meilleurs et deux derniers.
    const g = createGame(sanitizeConfig({ ...DEFAULT_CONFIG, maxThrows: 1, chargeThrows: 1, leaderSetsThrows: false }), ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() })), 0);
    g.phase = 'decharge'; g.pot = 0; for (const p of g.players) p.tokens = 7;
    play(g, [6, 6, 6]); play(g, [6, 6, 6]); play(g, [5, 3, 2]); play(g, [5, 3, 2]);
    expect(g.rolloffKind).toBe('perdant');
    play(g, [6, 5, 1]); play(g, [3, 2, 2]); // le second perd le barrage
    expect(g.rolloffKind).toBe('donneur');
    play(g, [1, 1, 1]); play(g, [4, 3, 1]);
    const tokens = Object.fromEntries(g.players.map((p) => [p.id, p.tokens]));
    expect(Object.values(tokens).reduce((a, b) => a + b, 0)).toBe(28);
    expect(Math.max(...Object.values(tokens))).toBe(7 + 6); // brelan de 6 vaut 6
    void s;
  });
});
