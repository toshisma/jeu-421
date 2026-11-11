import { describe, expect, it } from 'vitest';
import {
  Cat, CATS, HAND_COUNT, TOP_HAND, catsOf, claimOptions, compareDice, evaluate, handAt, handScore, handTable, lowestAbove, lowestOf, meets, nextHigher, rankOf,
} from '../shared/pokermenteur/hands';
import { act, canBelieve, newGame, placeOf, timeoutAction, viewFor, type PmAction, type PmState } from '../shared/pokermenteur/engine';
import { assumedKept, bestKeep, chanceAtLeast, decide, aiRng } from '../shared/pokermenteur/ai';

// Faces : 0 = 9, 1 = 10, 2 = Valet, 3 = Dame, 4 = Roi, 5 = As.
const [N9, T, V, D, R, A] = [0, 1, 2, 3, 4, 5];
const ok = (r: ReturnType<typeof act>): PmState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof act>) => ('error' in r ? r.error : null);

const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const at = (dice: number[], extra: Partial<PmState> = {}): PmState => ({ ...newGame(players, { lives: 3 }, 7), dice, ...extra });

/** Un exemple de chaque catégorie, de la plus faible à la plus forte. */
const EXAMPLES: Record<number, number[]> = {
  [Cat.Rien]: [A, R, D, V, N9],
  [Cat.Paire]: [N9, N9, T, V, D],
  [Cat.DoublePaire]: [T, T, N9, N9, V],
  [Cat.Brelan]: [N9, N9, N9, T, V],
  [Cat.PetiteSuite]: [N9, T, V, D, R],
  [Cat.GrandeSuite]: [T, V, D, R, A],
  [Cat.Full]: [N9, N9, N9, T, T],
  [Cat.Carre]: [N9, N9, N9, N9, T],
  [Cat.Poker]: [N9, N9, N9, N9, N9],
};

describe('Poker menteur : lecture des mains', () => {
  it('reconnaît chaque catégorie', () => {
    for (const c of CATS) expect(evaluate(EXAMPLES[c]).cat).toBe(c);
  });
  it('toute catégorie bat toutes les catégories plus faibles (y compris leur meilleure main)', () => {
    const t = handTable();
    const best = new Map<number, number[]>(), worst = new Map<number, number[]>();
    for (const h of t.hands) { if (!worst.has(h.cat)) worst.set(h.cat, h.dice); best.set(h.cat, h.dice); }
    for (const a of CATS) for (const b of CATS) {
      if (a >= b) continue;
      expect(compareDice(best.get(a)!, worst.get(b)!)).toBeLessThan(0);
      expect(compareDice(EXAMPLES[a], EXAMPLES[b])).toBeLessThan(0);
      expect(compareDice(EXAMPLES[b], EXAMPLES[a])).toBeGreaterThan(0);
    }
  });
  it('252 mains différentes, toutes de rang distinct, ordre cohérent avec la comparaison', () => {
    for (const ns of [false, true]) {
      const t = handTable(ns);
      expect(t.hands.length).toBe(HAND_COUNT);
      expect(new Set(t.hands.map(handScore)).size).toBe(HAND_COUNT);
      for (let i = 1; i < HAND_COUNT; i++) {
        expect(compareDice(t.hands[i - 1].dice, t.hands[i].dice, ns)).toBeLessThan(0);
        expect(t.hands[i].cat).toBeGreaterThanOrEqual(t.hands[i - 1].cat);
      }
      // L'ordre des dés ne compte pas.
      for (const h of t.hands) expect(rankOf([...h.dice].reverse(), ns)).toBe(rankOf(h.dice, ns));
    }
  });
  it('nombre de mains par catégorie', () => {
    const n = (ns: boolean, c: number) => handTable(ns).hands.filter((h) => h.cat === c).length;
    expect([Cat.Rien, Cat.Paire, Cat.DoublePaire, Cat.Brelan, Cat.PetiteSuite, Cat.GrandeSuite, Cat.Full, Cat.Carre, Cat.Poker].map((c) => n(false, c))).toEqual([4, 60, 60, 60, 1, 1, 30, 30, 6]);
    expect(n(true, Cat.Rien)).toBe(6);
    expect(n(true, Cat.PetiteSuite) + n(true, Cat.GrandeSuite)).toBe(0);
  });
  it('départages : Rien (dé le plus haut, puis le suivant)', () => {
    expect(compareDice([A, R, D, V, N9], [A, R, D, T, N9])).toBeGreaterThan(0);
    expect(compareDice([A, R, D, T, N9], [A, R, V, T, N9])).toBeGreaterThan(0);
    expect(compareDice([A, D, V, T, N9], [A, R, V, T, N9])).toBeLessThan(0);
    expect(compareDice([A, R, D, V, N9], [N9, V, D, R, A])).toBe(0);
  });
  it('départages : Paire (valeur, puis dés restants du plus haut au plus bas)', () => {
    expect(compareDice([D, D, N9, T, V], [V, V, A, R, D])).toBeGreaterThan(0);
    expect(compareDice([D, D, A, T, N9], [D, D, R, V, T])).toBeGreaterThan(0);
    expect(compareDice([D, D, A, V, N9], [D, D, A, V, T])).toBeLessThan(0);
    expect(compareDice([D, D, A, V, T], [D, D, A, T, N9])).toBeGreaterThan(0);
  });
  it('départages : Double paire (haute paire, seconde paire, dé restant)', () => {
    expect(compareDice([R, R, N9, N9, T], [D, D, V, V, A])).toBeGreaterThan(0);
    expect(compareDice([R, R, T, T, N9], [R, R, N9, N9, A])).toBeGreaterThan(0);
    expect(compareDice([R, R, T, T, A], [R, R, T, T, N9])).toBeGreaterThan(0);
  });
  it('départages : Brelan, Full, Carré, Poker', () => {
    expect(compareDice([V, V, V, N9, T], [T, T, T, A, R])).toBeGreaterThan(0);
    expect(compareDice([V, V, V, A, N9], [V, V, V, R, D])).toBeGreaterThan(0);
    expect(compareDice([V, V, V, A, T], [V, V, V, A, N9])).toBeGreaterThan(0);
    expect(compareDice([R, R, R, N9, N9], [D, D, D, A, A])).toBeGreaterThan(0);
    expect(compareDice([R, R, R, T, T], [R, R, R, N9, N9])).toBeGreaterThan(0);
    expect(compareDice([D, D, D, D, N9], [V, V, V, V, A])).toBeGreaterThan(0);
    expect(compareDice([D, D, D, D, T], [D, D, D, D, N9])).toBeGreaterThan(0);
    expect(compareDice([T, T, T, T, T], [N9, N9, N9, N9, N9])).toBeGreaterThan(0);
    expect(compareDice(TOP_HAND, [R, R, R, R, R])).toBeGreaterThan(0);
  });
  it('les suites : grande > petite, petite > tout brelan, full > grande suite', () => {
    expect(compareDice([T, V, D, R, A], [N9, T, V, D, R])).toBeGreaterThan(0);
    expect(compareDice([N9, T, V, D, R], [A, A, A, R, D])).toBeGreaterThan(0);
    expect(compareDice([N9, N9, N9, T, T], [T, V, D, R, A])).toBeGreaterThan(0);
  });
  it('variante sans suites : les suites sont des « Rien »', () => {
    expect(evaluate([N9, T, V, D, R], true).cat).toBe(Cat.Rien);
    expect(evaluate([T, V, D, R, A], true).cat).toBe(Cat.Rien);
    expect(compareDice([T, V, D, R, A], [N9, N9, T, V, D], true)).toBeLessThan(0);
    expect(compareDice([T, V, D, R, A], [A, R, D, V, N9], true)).toBeGreaterThan(0); // As, Roi, Dame, Valet, puis 10 > 9
    expect(compareDice([T, V, D, R, A], [A, R, D, V, N9], true)).not.toBe(0);
    expect(catsOf(true)).not.toContain(Cat.PetiteSuite);
  });
  it('rang le plus haut : Poker d’As, rien au-dessus', () => {
    expect(rankOf(TOP_HAND)).toBe(HAND_COUNT - 1);
    expect(nextHigher(TOP_HAND)).toBeNull();
    expect(nextHigher(null)).toEqual(handAt(0).dice);
    expect(nextHigher([N9, N9, N9, N9, N9])).toEqual([T, T, T, T, T]);
    // Juste au-dessus du meilleur Rien : la plus faible paire.
    expect(evaluate(nextHigher([A, R, D, V, N9])!).cat).toBe(Cat.Paire);
    expect(nextHigher([A, R, D, V, N9])).toEqual([V, D, T, N9, N9].sort((a, b) => b - a));
  });
  it('annonce partielle : plus faible main de sa catégorie', () => {
    expect(lowestOf(Cat.Brelan, [])).toEqual([V, T, N9, N9, N9]);
    expect(lowestOf(Cat.Brelan, [R])).toEqual([R, R, R, T, N9]);
    expect(lowestOf(Cat.Paire, [A])).toEqual([A, A, V, T, N9]);
    expect(lowestOf(Cat.Full, [R, T])).toEqual([R, R, R, T, T]);
    expect(lowestOf(Cat.Carre, [D])).toEqual([D, D, D, D, N9]);
    expect(lowestOf(Cat.DoublePaire, [R, N9])).toEqual([R, R, T, N9, N9]);
    expect(lowestOf(Cat.Full, [R, R])).toBeNull();
    expect(lowestOf(Cat.PetiteSuite, [], true)).toBeNull();
    // Au-dessus d'une annonce : « paire de Rois » après Paire de Rois, As, Dame, Valet → Rois, As, Dame, Valet + 1.
    expect(lowestAbove(Cat.Paire, [R], [R, R, A, D, T])).toEqual([A, R, R, D, V]);
    expect(lowestAbove(Cat.Paire, [R], [R, R, A, D, V])).toBeNull(); // la plus forte paire de Rois
    expect(lowestAbove(Cat.Paire, [R], [A, A, N9, T, V])).toBeNull();
  });
  it('options du sélecteur : seulement au-dessus de l’annonce', () => {
    const opts = claimOptions(Cat.Brelan, [D, D, D, A, V]);
    expect(opts.map((o) => o.values[0])).toEqual([D, R, A]);
    for (const o of opts) expect(compareDice(o.dice, [D, D, D, A, V])).toBeGreaterThan(0);
    expect(claimOptions(Cat.Paire, [N9, N9, N9, T, T])).toEqual([]);
    expect(claimOptions(Cat.Full, null).length).toBe(30);
  });
  it('meets : au moins égal', () => {
    expect(meets([R, R, R, A, D], [R, R, R, A, D])).toBe(true);
    expect(meets([R, R, R, A, V], [R, R, R, A, D])).toBe(false);
    expect(meets([N9, N9, N9, N9, T], [A, A, A, R, R])).toBe(true);
  });
});

describe('Poker menteur : déroulement', () => {

  it('début : gobelet secoué pour le premier, 5 dés, annonce libre', () => {
    const s = newGame(players, {}, 1);
    expect(s.phase).toBe('annonce');
    expect(s.dice).toHaveLength(5);
    expect(s.players.every((p) => p.lives === 3)).toBe(true);
    expect(s.events.map((e) => e.kind)).toEqual(['manche', 'secoue']);
    const s2 = ok(act(s, { type: 'annoncer', hand: [N9, T, V, D, A] }));
    expect(s2.phase).toBe('decision');
    expect(s2.current).toBe(1);
    expect(s2.holder).toBe(0);
  });
  it('même graine : même partie', () => {
    const a = newGame(players, {}, 42), b = newGame(players, {}, 42);
    expect(a.dice).toEqual(b.dice);
    const ra = ok(act(ok(act(ok(act(a, { type: 'annoncer', hand: [A, A, A, R, R] })), { type: 'croire' })), { type: 'relancer', pick: [0, 2] }));
    const rb = ok(act(ok(act(ok(act(b, { type: 'annoncer', hand: [A, A, A, R, R] })), { type: 'croire' })), { type: 'relancer', pick: [0, 2] }));
    expect(ra.dice).toEqual(rb.dice);
  });
  it('annonce invalide ou pas plus forte : refusée', () => {
    let s = ok(act(at([R, R, R, A, D]), { type: 'annoncer', hand: [R, R, R, A, D] }));
    s = ok(act(s, { type: 'croire' }));
    s = ok(act(s, { type: 'relancer', pick: [] }));
    expect(err(act(s, { type: 'annoncer', hand: [R, R, R, A, D] }))).toMatch(/plus forte/);
    expect(err(act(s, { type: 'annoncer', hand: [R, R, R, A, V] }))).toMatch(/plus forte/);
    expect(err(act(s, { type: 'annoncer', hand: [R, R, R, A] }))).toMatch(/invalide/);
    expect(err(act(s, { type: 'annoncer', hand: [R, R, R, A, 6] }))).toMatch(/invalide/);
    expect(err(act(s, { type: 'annoncer', hand: [R, R, R, A, 1.5] }))).toMatch(/invalide/);
    expect(err(act(s, { type: 'menteur' }))).toBeTruthy();
    expect(ok(act(s, { type: 'annoncer', hand: [A, A, A, N9, T] })).claims).toHaveLength(2);
  });
  it('relance : une seule fois, positions valides, les dés gardés ne bougent pas', () => {
    let s = ok(act(at([R, R, R, A, D]), { type: 'annoncer', hand: [R, R, R, A, D] }));
    expect(err(act(s, { type: 'relancer', pick: [0] }))).toBeTruthy(); // il faut d'abord croire
    s = ok(act(s, { type: 'croire' }));
    expect(s.holder).toBe(1);
    expect(err(act(s, { type: 'relancer', pick: [0, 0] }))).toBeTruthy();
    expect(err(act(s, { type: 'relancer', pick: [5] }))).toBeTruthy();
    expect(err(act(s, { type: 'relancer', pick: [0, 1, 2, 3, 4, 0] }))).toBeTruthy();
    const after = ok(act(s, { type: 'relancer', pick: [3, 4] }));
    expect(after.dice!.slice(0, 3)).toEqual([R, R, R]);
    expect(after.rerolled).toBe(2);
    expect(after.phase).toBe('annonce');
    expect(err(act(after, { type: 'relancer', pick: [0] }))).toBeTruthy();
    const ann = ok(act(after, { type: 'annoncer', hand: [A, A, A, A, A] }));
    expect(ann.claims[1].rerolled).toBe(2);
  });
  it('« Menteur ! » sur une annonce vraie : le crieur perd une vie et recommence', () => {
    let s = ok(act(at([R, R, R, A, D]), { type: 'annoncer', hand: [R, R, R, A, V] }));
    s = ok(act(s, { type: 'menteur' }));
    expect(s.lastReveal).toMatchObject({ truth: true, loser: 'b', caller: 'b', by: 'a', dice: [R, R, R, A, D] });
    expect(s.players[1].lives).toBe(2);
    expect(s.players[0].lives).toBe(3);
    expect(s.round).toBe(2);
    expect(s.current).toBe(1);
    expect(s.holder).toBe(1);
    expect(s.claims).toEqual([]);
    expect(s.phase).toBe('annonce');
  });
  it('égalité exacte : l’annonce est vraie', () => {
    let s = ok(act(at([R, R, R, A, D]), { type: 'annoncer', hand: [D, A, R, R, R] }));
    s = ok(act(s, { type: 'menteur' }));
    expect(s.lastReveal!.truth).toBe(true);
  });
  it('« Menteur ! » sur un mensonge : l’annonceur perd une vie', () => {
    let s = ok(act(at([R, R, R, A, D]), { type: 'annoncer', hand: [R, R, R, R, A] }));
    s = ok(act(s, { type: 'menteur' }));
    expect(s.lastReveal).toMatchObject({ truth: false, loser: 'a' });
    expect(s.players[0].lives).toBe(2);
    expect(s.current).toBe(0);
  });
  it('après « Je crois », la vérité porte sur les dés du nouveau détenteur', () => {
    let s = ok(act(at([R, R, R, A, D]), { type: 'annoncer', hand: [R, R, R, A, D] }));
    s = ok(act(s, { type: 'croire' }));
    s = ok(act(s, { type: 'relancer', pick: [] }));
    s = ok(act(s, { type: 'annoncer', hand: [A, A, A, A, A] }));
    expect(s.current).toBe(2);
    expect(canBelieve(s)).toBe(false);
    expect(err(act(s, { type: 'croire' }))).toMatch(/Poker/);
    expect(timeoutAction(s)).toEqual({ type: 'menteur' });
    s = ok(act(s, { type: 'menteur' }));
    expect(s.lastReveal).toMatchObject({ by: 'b', caller: 'c', loser: 'b', truth: false });
  });
  it('élimination, ordre de sortie, gagnant, le suivant commence si le perdant est éliminé', () => {
    let s: PmState = { ...at([N9, T, V, D, A]), players: [{ id: 'a', name: 'A', lives: 1, out: 0 }, { id: 'b', name: 'B', lives: 1, out: 0 }, { id: 'c', name: 'C', lives: 2, out: 0 }] };
    s = ok(act(s, { type: 'annoncer', hand: [A, A, A, A, A] }));
    s = ok(act(s, { type: 'menteur' }));
    expect(s.players[0]).toMatchObject({ lives: 0, out: 1 });
    expect(s.events.some((e) => e.kind === 'elimine' && e.playerId === 'a')).toBe(true);
    expect(s.current).toBe(1); // le suivant du perdant
    // B annonce, C crie : B ment toujours avec un Poker d'As (sauf hasard) — on force les dés.
    s = { ...s, dice: [N9, T, V, D, A] };
    s = ok(act(s, { type: 'annoncer', hand: [A, A, A, A, A] }));
    expect(s.current).toBe(2); // A est sauté
    s = ok(act(s, { type: 'menteur' }));
    expect(s.phase).toBe('fini');
    expect(s.winner).toBe('c');
    expect(placeOf(s, 'c')).toBe(1);
    expect(placeOf(s, 'b')).toBe(2);
    expect(placeOf(s, 'a')).toBe(3);
    expect(err(act(s, { type: 'menteur' }))).toMatch(/terminée/);
  });
  it('coup automatique (temps écoulé) : croit, ne relance rien, annonce juste au-dessus (la plus faible main au premier coup, jamais sa vraie main)', () => {
    const s0 = at([R, R, R, A, D]);
    expect(timeoutAction(s0)).toEqual({ type: 'annoncer', hand: nextHigher(null) });
    let s = ok(act(s0, { type: 'annoncer', hand: [R, R, R, A, D] }));
    expect(timeoutAction(s)).toEqual({ type: 'croire' });
    s = ok(act(s, timeoutAction(s)));
    expect(timeoutAction(s)).toEqual({ type: 'relancer', pick: [] });
    s = ok(act(s, timeoutAction(s)));
    const a = timeoutAction(s) as Extract<PmAction, { type: 'annoncer' }>;
    expect(rankOf(a.hand)).toBe(rankOf([R, R, R, A, D]) + 1);
    expect(ok(act(s, a)).phase).toBe('decision');
  });
  it('vue d’un joueur : dés au seul détenteur, jamais la graine', () => {
    let s = at([R, R, R, A, D]);
    expect(viewFor(s, 'a').dice).toEqual([R, R, R, A, D]);
    expect(viewFor(s, 'b').dice).toBeNull();
    expect(viewFor(s, null).dice).toBeNull();
    expect(viewFor(s, 'a').seed).toBe(0);
    s = ok(act(s, { type: 'annoncer', hand: [R, R, R, A, D] }));
    expect(viewFor(s, 'b').dice).toBeNull();
    expect(viewFor(s, 'a').dice).not.toBeNull(); // l'annonceur se souvient de ses dés
    s = ok(act(s, { type: 'croire' }));
    expect(viewFor(s, 'b').dice).toEqual([R, R, R, A, D]);
    expect(viewFor(s, 'a').dice).toBeNull();
    expect(viewFor(s, 'c').dice).toBeNull();
    // Les événements publics ne contiennent jamais les dés avant la révélation.
    s = ok(act(s, { type: 'relancer', pick: [4] }));
    expect(JSON.stringify(s.events)).not.toMatch(/dice/);
  });
  it('une partie entière se joue sans blocage (coups automatiques)', () => {
    for (let seed = 1; seed < 30; seed++) {
      let s = newGame(players, { lives: 3, noStraights: seed % 2 === 0 }, seed);
      let n = 0;
      while (s.phase !== 'fini' && n++ < 2000) s = ok(act(s, s.phase === 'decision' && (s.claims.length > 3 || n % 5 === 0) ? { type: 'menteur' } : timeoutAction(s)));
      expect(s.phase).toBe('fini');
    }
  });
});

describe('Poker menteur : ordinateurs', () => {
  it('probabilités exactes : garder un brelan et relancer 2 dés', () => {
    expect(chanceAtLeast([], 0)).toBe(1);
    expect(chanceAtLeast([A, A, A, A, A], rankOf(TOP_HAND))).toBe(1);
    expect(chanceAtLeast([A, A, A, A], rankOf(TOP_HAND))).toBeCloseTo(1 / 6, 10);
    expect(chanceAtLeast([], rankOf(TOP_HAND))).toBeCloseTo(1 / 7776, 10);
    // Brelan d'As gardé, 2 dés relancés : au moins un full aux As par les 9 = paire ou 4e As.
    expect(chanceAtLeast([A, A, A], rankOf([A, A, A, N9, N9]))).toBeCloseTo((6 + 10) / 36, 10);
  });
  it('relance au mieux : garde ce qui sert', () => {
    const b = bestKeep([A, A, A, N9, T], rankOf([A, A, A, A, N9]));
    expect(b.keep).toEqual([0, 1, 2]);
    expect(bestKeep([R, R, R, R, A], rankOf([R, R, R, R, A])).keep).toEqual([0, 1, 2, 3, 4]);
  });
  it('dés supposés gardés par l’annonceur', () => {
    expect(assumedKept([R, R, R, A, D], 2)).toEqual([R, R, R]);
    expect(assumedKept([R, R, R, A, D], 5)).toEqual([]);
    expect(assumedKept([R, R, R, A, D], -1)).toEqual([]);
    expect(assumedKept([D, D, T, T, A], 1)).toEqual([D, D, T, T]);
  });
  it('ne croit jamais après un Poker d’As, et joue toujours un coup valide', () => {
    for (const lvl of ['debutant', 'habitue', 'fouine'] as const) {
      const rng = aiRng(3);
      for (let seed = 1; seed < 40; seed++) {
        let s = newGame(players.map((p) => ({ ...p, bot: lvl })), { noStraights: seed % 3 === 0 }, seed);
        let n = 0;
        while (s.phase !== 'fini' && n++ < 3000) s = ok(act(s, decide(s, lvl, rng)));
        expect(s.phase).toBe('fini');
      }
    }
  });
  it('crie « Menteur ! » devant une annonce impossible à croire', () => {
    let s = ok(act(at([N9, T, V, D, A]), { type: 'annoncer', hand: [A, A, A, A, A] }));
    expect(decide(s, 'habitue', aiRng(1))).toEqual({ type: 'menteur' });
    s = ok(act(at([N9, T, V, D, A]), { type: 'annoncer', hand: [R, R, R, R, A] }));
    let calls = 0;
    for (let i = 0; i < 50; i++) if (decide(s, 'fouine', aiRng(i)).type === 'menteur') calls++;
    expect(calls).toBeGreaterThan(40);
    // Une petite paire au premier coup : il croit.
    s = ok(act(at([N9, T, V, D, A]), { type: 'annoncer', hand: [N9, N9, T, V, D] }));
    expect(decide(s, 'fouine', aiRng(2))).toEqual({ type: 'croire' });
  });
});

describe('Poker menteur : récompenses, statistiques, intégration', async () => {
  const { applyPokerGame, nextPmStats, pokerBagRoll, pokerReward } = await import('../shared/pokermenteur/reward');
  const { newProfile } = await import('../shared/progress/profile');
  const { applyFetesGame } = await import('../shared/progress/fetes');
  const { cleanPmStats } = await import('../shared/pokermenteur/stats');
  const { jouerParam } = await import('../client/src/quickPlay');
  const { pokerModeParam } = await import('../client/src/cfLink');
  const day = '2026-12-02', now = Date.parse('2026-12-02T10:00:00Z');

  it('résultat annoncé par le téléphone : parties et victoires seulement, jamais les faits vérifiés', () => {
    const v = { online: true, botLevels: ['fouine' as const], callsRight: 3, bluffsPassed: 2, pokerAs: 1, livesLost: 0 };
    const declared = nextPmStats(undefined, true, { won: true, players: 3, minutes: 5, mode: 'solo', declared: true, verified: v });
    expect(declared).toMatchObject({ games: 1, wins: 1, vGames: 0, callsRight: 0, onlineWins: 0, pokerAs: 0 });
    const real = nextPmStats(undefined, true, { won: true, players: 3, minutes: 5, mode: 'online', verified: v });
    expect(real).toMatchObject({ games: 1, wins: 1, vGames: 1, vWins: 1, onlineWins: 1, callsRight: 3, bluffsPassed: 2, pokerAs: 1, flawless: 1, beaten: 4, streak: 1 });
    // Garde-fous de lecture.
    expect(cleanPmStats({ games: 2, wins: 9, vGames: 5, onlineWins: 3, beaten: 99 })).toMatchObject({ games: 2, wins: 2, vGames: 2, vWins: 0, onlineWins: 0, beaten: 7 });
  });
  it('sac de dés : rien sous 1 min 30, compteur garanti commun', () => {
    const p = { ...newProfile(), pity: 9 };
    expect(pokerBagRoll(p, { won: true, players: 2, minutes: 1, mode: 'solo' }, () => 0).found).toBe(0);
    expect(pokerBagRoll(p, { won: false, players: 2, minutes: 5, mode: 'solo' }, () => 0.99)).toMatchObject({ found: 1 });
    expect(pokerBagRoll({ ...p, pity: 0 }, { won: true, players: 2, minutes: 5, mode: 'solo', declared: true }, () => 0.99).profile.pity).toBe(1);
  });
  it('fin de partie : pièces, défi du jour, succès « Premier menteur » (5 pièces), pas de partie de 421 comptée', () => {
    const p = newProfile();
    const r = pokerReward({ won: true, place: 1, opponents: 2, level: 'habitue', minutes: 6, day, now });
    const a = applyPokerGame(p, r, day, { won: true, players: 3, minutes: 6, mode: 'solo', level: 'habitue', declared: true, now }, () => 0.99);
    expect(a.profile.stats.played).toBe(p.stats.played);
    expect(a.profile.pm?.games).toBe(1);
    expect(a.achievementsDone.map((x) => x.id)).toContain('pm-premiere');
    expect(r.coins).toBeLessThanOrEqual(15);
  });
  it('défi de fête « trois jeux différents » : le Poker menteur compte, et reste atteignable', () => {
    let p = newProfile();
    const play = (g: Parameters<typeof applyFetesGame>[1]) => { const r = applyFetesGame(p, g, day); p = r.profile; return r.done.map((d) => d.id); };
    play({ game: 'pm', won: false });
    play({ game: 'dm', won: false });
    expect(play({ game: 'cf', won: true })).toContain('fet-sn-jeux');
  });
  it('liens directs : /?jouer=poker et /?mode=poker', () => {
    expect(jouerParam('?jouer=poker')).toBe('poker');
    expect(jouerParam('?jouer=poker-menteur')).toBe('poker');
    expect(pokerModeParam('?mode=poker')).toBe(true);
    expect(pokerModeParam('?mode=courtisan')).toBe(false);
  });
});
