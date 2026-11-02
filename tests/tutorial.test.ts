/** Partie guidée : les dés préparés donnent bien la leçon prévue, jusqu'à la victoire du joueur. */
import { describe, expect, it, vi } from 'vitest';
import { TutorialController, coachMessage } from '../client/src/game/tutorial';
import { currentPlayerId, type GameState } from '../shared/engine';

describe('partie guidée', () => {
  it('charge, 4-2-1, puis décharge gagnée en gardant les bons dés', async () => {
    vi.useFakeTimers();
    const c = new TutorialController({ name: 'Sam', avatar: '🦊' });
    let s!: GameState;
    let last: number[] = [];
    c.subscribeEvents((e) => { s = e.state; if (e.type === 'roll' && e.roll.playerId === 'moi') last = e.roll.dice; });
    const step = () => { c.notifyIdle(); vi.advanceTimersByTime(5000); };
    const me = c.meId;
    const myTurn = () => currentPlayerId(s) === me;
    expect(myTurn()).toBe(true);
    expect(coachMessage(s, me)).toContain('Bienvenue');

    // Manche 1 : 5-3-2 contre un brelan de 3 → je prends 3 jetons.
    await c.roll([false, false, false], s.version);
    expect([...last].sort()).toEqual([2, 3, 5]);
    while (!myTurn() && s.phase !== 'fini') step();
    expect(s.players.find((p) => p.id === me)!.tokens).toBe(3);

    // Manche 2 : 4-2-1 → Marcel prend le reste du pot, place à la décharge.
    await c.roll([false, false, false], s.version);
    expect([...last].sort()).toEqual([1, 2, 4]);
    for (let i = 0; i < 20 && !(s.phase === 'decharge' && myTurn()); i++) step();
    expect(s.phase).toBe('decharge');

    // Décharge : 4-6-3, on garde le 4, puis le 2, puis le 1 arrive.
    await c.roll([false, false, false], s.version);
    expect(s.dice).toEqual([4, 6, 3]);
    await c.roll([true, false, false], s.version);
    expect([...s.dice].sort()).toContain(2);
    const keep = s.dice.map((d, i) => d === 4 || (d === 2 && s.dice.indexOf(2) === i));
    await c.roll(keep, s.version);
    expect([...last].sort()).toEqual([1, 2, 4]);
    for (let i = 0; i < 20 && s.phase !== 'fini'; i++) { if (myTurn()) await c.stop(s.version); step(); }
    expect(s.phase).toBe('fini');
    expect(s.ranking[0]).toBe(me);
    expect(c.canRematch()).toBe(false);
    c.leave();
    vi.useRealTimers();
  });
});
