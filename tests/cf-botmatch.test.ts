/** Coups Fourrés : partie contre l'ordinateur rejouable (vérification serveur) et deck automatique. */
import { describe, expect, it } from 'vitest';
import { startBotMatch, playMine, advanceBots, replayBotMatch, type BotMatchSetup } from '../shared/cards/botmatch';
import { legalActions, waitingFor } from '../shared/cards/engine';
import { STARTER_DECKS, deckProblems, CARDS } from '../shared/cards/catalog';
import { buildAutoDeck } from '../shared/cards/autodeck';
import { cfDecide } from '../shared/cards/ai';
import { viewFor } from '../shared/cards/engine';
import { mulberry32 } from '../shared/rng';

const deckList = (d: Record<string, number>) => Object.entries(d).flatMap(([id, n]) => Array(n).fill(id));

describe('partie contre l\'ordinateur rejouable', () => {
  it('le serveur retrouve exactement le même résultat', () => {
    for (const seed of [1, 42, 777]) {
      const setup: BotMatchSetup = { seed, me: { id: 'moi', name: 'Moi', deck: deckList(STARTER_DECKS[0].cards) }, bots: [{ id: 'bot', name: 'Dédé', deck: deckList(STARTER_DECKS[1].cards), level: 'habitue' }] };
      const { match } = startBotMatch(setup);
      const rng = mulberry32(seed + 1);
      let guard = 0;
      while (match.state.phase !== 'over' && guard++ < 3000) {
        expect(waitingFor(match.state)).toContain('moi');
        const a = cfDecide(viewFor(match.state, 'moi'), legalActions(match.state, 'moi'), 'debutant', rng);
        expect(playMine(match, a).ok).toBe(true);
        advanceBots(match);
      }
      expect(match.state.phase).toBe('over');
      const r = replayBotMatch(setup, match.mine);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.state.winner).toBe(match.state.winner);
      // Une action trafiquée est refusée.
      expect(replayBotMatch(setup, [{ type: 'stop' }, ...match.mine]).ok).toBe(false);
    }
  });
});

describe('deck automatique', () => {
  it('construit un deck valide quand il y a assez de cartes, sinon null', () => {
    const all = Object.fromEntries(CARDS.map((c) => [c.id, 2]));
    const d = buildAutoDeck(all)!;
    expect(deckProblems(d, all)).toEqual([]);
    expect(buildAutoDeck({ leurre: 2, fouine: 2 })).toBeNull();
    const rng = mulberry32(5);
    for (let k = 0; k < 200; k++) {
      const owned: Record<string, number> = {};
      for (let i = 0; i < 30; i++) { const c = CARDS[Math.floor(rng() * CARDS.length)]; owned[c.id] = (owned[c.id] ?? 0) + 1; }
      const deck = buildAutoDeck(owned);
      if (deck) expect(deckProblems(deck, owned)).toEqual([]);
    }
  });
});
