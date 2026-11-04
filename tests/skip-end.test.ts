import { describe, expect, it } from 'vitest';
import { LocalController } from '../client/src/game/localController';
import { PERSONAS } from '../client/src/game/personas';
import { DEFAULT_CONFIG } from '../shared/config';
import { currentPlayerId, rollAction, stopAction, type GameState } from '../shared/engine';
import { decide } from '../shared/ai';

/** Accès au moteur interne pour jouer « à la main » le joueur humain. */
class TestController extends LocalController {
  get st(): GameState { return this.state; }
}

describe('contre l’ordinateur : passer à la fin une fois sorti', () => {
  it('refusé tant que vous jouez, puis joue la fin d’un coup et envoie un état final', () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const c = new TestController({ ...DEFAULT_CONFIG, turnSeconds: 0 },
        PERSONAS.slice(0, 3).map((persona) => ({ persona, difficulty: 'normal' as const })), { name: 'Sam', avatar: '🦊' });
      const events: GameState[] = [];
      c.subscribeEvents((e) => events.push(e.state));
      expect(c.canSkipToEnd()).toBe(false);
      // Tout le monde joue jusqu'à ce que « moi » soit sorti (ou fin de partie).
      for (let i = 0; i < 20000 && c.st.phase !== 'fini' && !c.st.players[0].out; i++) {
        const pid = currentPlayerId(c.st)!;
        const d = decide(c.st, pid, 'normal', Math.random);
        if (d.kind === 'roll' && rollAction(c.st, pid, d.keep, () => 1 + Math.floor(Math.random() * 6)).ok) continue;
        stopAction(c.st, pid);
      }
      if (c.st.phase === 'fini') { c.leave(); continue; }
      expect(c.canSkipToEnd()).toBe(true);
      const before = events.length;
      c.skipToEnd();
      expect(events.length).toBe(before + 1);
      expect(events.at(-1)!.phase).toBe('fini');
      expect(c.canSkipToEnd()).toBe(false);
      c.leave();
      return;
    }
    throw new Error('aucune partie où le joueur sort avant la fin');
  });
});
