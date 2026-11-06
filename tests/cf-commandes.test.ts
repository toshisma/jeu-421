/** Coups Fourrés : commande du comptoir (0.39) — une règle bonus par manche, la même pour tous. */
import { describe, expect, it } from 'vitest';
import { COMMANDES, evalPlayer, newGame, apply, legalActions, viewFor, waitingFor, throwLimit, type CfState } from '../shared/cards/engine';
import { cfDecide } from '../shared/cards/ai';
import { STARTER_DECKS } from '../shared/cards/catalog';
import { mulberry32 } from '../shared/rng';

const deck = (i: number) => Object.entries(STARTER_DECKS[i].cards).flatMap(([id, n]) => Array<string>(n).fill(id));

describe('commande du comptoir', () => {
  it('tirée à chaque manche, jamais deux fois de suite la même, visible de tous ; absente sans l’option', () => {
    let s: CfState = newGame({ commandes: true }, [{ id: 'a', deck: deck(0) }, { id: 'b', deck: deck(1) }], 5);
    expect(newGame({}, [{ id: 'a', deck: deck(0) }, { id: 'b', deck: deck(1) }], 5).commande).toBeUndefined();
    const rng = mulberry32(3);
    const seen: string[] = [];
    let round = 0;
    for (let k = 0; k < 20000 && s.phase !== 'over'; k++) {
      if (s.round !== round && s.phase === 'turn') { round = s.round; seen.push(s.commande!); expect(viewFor(s, 'b').commande).toBe(s.commande); }
      const id = waitingFor(s)[0];
      s = apply(s, id, cfDecide(viewFor(s, id), legalActions(s, id), 'habitue', rng)).state;
    }
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    for (const c of seen) expect(COMMANDES.map((x) => x.id)).toContain(c);
  });
  it('effets : brelans +2, 4-2-1 à 10, suites à 4, un lancer de plus', () => {
    const r = (dice: number[]) => ({ habitues: [], r: { dice, forcedNenette: false, faux421: false } }) as never;
    expect(evalPlayer({ values: newGame({}, [{ id: 'a', deck: deck(0) }, { id: 'b', deck: deck(1) }], 1).values, commande: 'brelans' }, r([5, 5, 5])).value).toBe(7);
    const v = newGame({}, [{ id: 'a', deck: deck(0) }, { id: 'b', deck: deck(1) }], 1).values;
    expect(evalPlayer({ values: v, commande: '421' }, r([4, 2, 1])).value).toBe(10);
    expect(evalPlayer({ values: v, commande: 'suites' }, r([5, 4, 3])).value).toBe(4);
    let s = newGame({ commandes: true }, [{ id: 'a', deck: deck(0) }, { id: 'b', deck: deck(1) }], 2);
    for (const id of ['a', 'b']) s = apply(s, id, { type: 'mulligan', cards: [] }).state;
    s.commande = 'lancers';
    expect(throwLimit(s, s.order[0])).toBe(s.rules.maxThrows + 1);
  });
});
