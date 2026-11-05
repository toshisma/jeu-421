/** Coups Fourrés : interface (contrôleur local contre l'ordinateur, fonctions d'affichage). */
import { describe, expect, it } from 'vitest';
import { LocalCfController, deckList } from '../client/src/cards/local';
import type { CfSnapshot } from '../client/src/cards/controller';
import { replayBotMatch } from '../shared/cards/botmatch';
import { cfDecide, type CfLevel } from '../shared/cards/ai';
import { STARTER_DECKS } from '../shared/cards/catalog';
import { newGame, apply, viewFor, legalActions, type CfState, type CfAction } from '../shared/cards/engine';
import { mulberry32 } from '../shared/rng';
import {
  comboOf, costNow, decisionLine, describeNow, filterOptions, isBigShot, nextParam, phaseLine, playOptions,
  rerollLabel, resolveOption, valuesFor, whyNot, eventTone,
} from '../client/src/cards/describe';

/** Joue une partie complète IA contre IA à travers l'interface CfController. */
async function playThrough(level: CfLevel, seed: number, myLevel: CfLevel) {
  const c = await LocalCfController.create({ level, me: { name: 'Testeur' }, deck: deckList(STARTER_DECKS[0].cards), pace: 0, timed: false, seed });
  const rng = mulberry32(seed + 7);
  const sent: CfAction[] = [];
  let snaps = 0;
  let events = 0;
  await new Promise<void>((done, fail) => {
    let busy = false;
    const step = async (snap: CfSnapshot) => {
      if (snap.finished) { done(); return; }
      if (busy || !snap.legal.length) return;
      busy = true;
      try {
        const a = cfDecide(snap.view, snap.legal, myLevel, rng);
        sent.push(a);
        const err = await c.act(a);
        if (err) fail(new Error(err));
      } finally { busy = false; }
      const now = c.current();
      if (now && now.legal.length && !now.finished) void step(now);
    };
    c.subscribe((snap, ev) => { snaps++; events += ev.length; void step(snap); });
    setTimeout(() => fail(new Error('partie trop longue')), 20000);
  });
  return { c, sent, snaps, events };
}

describe('contrôleur local contre l’ordinateur', () => {
  for (const [level, seed] of [['debutant', 3], ['habitue', 11], ['fine-fouine', 29]] as [CfLevel, number][]) {
    it(`partie complète contre « ${level} », rejouable à l’identique par le serveur`, async () => {
      const { c, sent, snaps, events } = await playThrough(level, seed, 'habitue');
      const snap = c.current()!;
      expect(snap.finished?.standings.length).toBe(2);
      expect(snap.view.phase).toBe('over');
      expect(snaps).toBeGreaterThan(10);
      expect(events).toBeGreaterThan(10);
      // Les actions envoyées au serveur sont exactement celles du joueur, et la partie se rejoue.
      expect(c.actions).toEqual(sent);
      const r = replayBotMatch(c.setup, c.actions);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.state.winner).toBe(snap.view.winner);
      expect(c.rewarded).toBe(false);
      expect(c.notice).toMatch(/compte/);
    }, 30000);
  }

  it('refuse une action illégale avec un message en français', async () => {
    const c = await LocalCfController.create({ level: 'debutant', me: { name: 'X' }, deck: deckList(STARTER_DECKS[1].cards), pace: 0, timed: false, seed: 5 });
    await new Promise<void>((ok) => c.subscribe((s) => { if (s.legal.length) ok(); }));
    expect(await c.act({ type: 'stop' })).toMatch(/impossible|pas à vous/i);
    c.leave();
    expect(await c.act({ type: 'mulligan', cards: [] })).toMatch(/terminée/);
  });

  it('ne montre jamais la main de l’ordinateur', async () => {
    const c = await LocalCfController.create({ level: 'habitue', me: { name: 'X' }, deck: deckList(STARTER_DECKS[0].cards), pace: 0, timed: false, seed: 9 });
    const snap = await new Promise<CfSnapshot>((ok) => c.subscribe((s) => { if (s.legal.length) ok(s); }));
    const bot = snap.view.players.find((p) => p.id !== c.me)!;
    expect(bot.hand).toBeUndefined();
    expect(snap.view.players.find((p) => p.id === c.me)!.hand!.length).toBe(4);
    expect(snap.seats[1].bot).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Fonctions d'affichage

/** Partie de test à deux joueurs où l'on avance jusqu'à une situation donnée. */
function game(seed = 1): CfState {
  let s = newGame({}, [{ id: 'a', name: 'Alice', deck: deckList(STARTER_DECKS[0].cards) }, { id: 'b', name: 'Bob', deck: deckList(STARTER_DECKS[1].cards) }], seed);
  s = apply(s, 'a', { type: 'mulligan', cards: [] }).state;
  s = apply(s, 'b', { type: 'mulligan', cards: [] }).state;
  return s;
}
function withHand(s: CfState, pid: string, ids: string[], patch: (p: CfState['players'][number]) => void = () => {}): CfState {
  const t = structuredClone(s);
  const p = t.players.find((x) => x.id === pid)!;
  p.hand = ids.map((id, i) => ({ uid: `t${i}`, id }));
  patch(p);
  return t;
}

describe('ce que fait une carte ici et maintenant', () => {
  it('Tête qui tourne : dé choisi, combinaison obtenue, et conseil', () => {
    const s0 = game();
    const leader = s0.order[0];
    const s = withHand(s0, leader, ['tete-tourne'], (p) => { p.tournees = 4; p.r.dice = [6, 2, 1]; p.r.throwsUsed = 1; });
    const v = viewFor(s, leader);
    const legal = legalActions(s, leader);
    const opts = playOptions(legal, 't0');
    expect(opts.length).toBe(3);
    expect(nextParam(opts, {})).toBe('die');
    expect(describeNow(v, 'tete-tourne', { die: 0 }, opts)).toMatch(/^Le 6 devient un as/);
    expect(describeNow(v, 'tete-tourne', {}, opts)).toMatch(/Le mieux/);
    expect(resolveOption(opts, { die: 2 })).toEqual({ die: 2 });
  });

  it('Coup de pouce : on choisit le dé puis +1 / −1, le 3 devient un 4', () => {
    const s0 = game(2);
    const leader = s0.order[0];
    const s = withHand(s0, leader, ['coup-pouce'], (p) => { p.tournees = 4; p.r.dice = [3, 2, 1]; p.r.throwsUsed = 1; });
    const v = viewFor(s, leader);
    const opts = playOptions(legalActions(s, leader), 't0');
    expect(nextParam(opts, {})).toBe('die');
    expect(valuesFor(opts, { die: 2 }, 'delta')).toEqual([1]); // un 1 ne descend pas
    expect(nextParam(opts, { die: 0 })).toBe('delta');
    expect(filterOptions(opts, { die: 0, delta: 1 })).toEqual([{ die: 0, delta: 1 }]);
    expect(describeNow(v, 'coup-pouce', { die: 0, delta: 1 }, opts)).toBe('Le 3 devient un 4 : vous passez à 421 (vaut 8).');
  });

  it('explique pourquoi une carte n’est pas jouable', () => {
    const s0 = game(3);
    const leader = s0.order[0];
    const other = s0.order[1];
    let s = withHand(s0, leader, ['bon-numero', 'ticket-caisse', 'note-salee', 'de-sous-table'], (p) => { p.tournees = 1; });
    let v = viewFor(s, leader);
    let legal = legalActions(s, leader);
    expect(whyNot(v, 'bon-numero', legal, 't0')).toMatch(/manque 3 Tournées/);
    expect(whyNot(v, 'ticket-caisse', legal, 't1')).toMatch(/Riposte/);
    expect(whyNot(v, 'note-salee', legal, 't2')).toMatch(/Dernier mot/);
    s = withHand(s0, leader, ['de-sous-table', 'coup-pouce'], (p) => { p.tournees = 6; });
    v = viewFor(s, leader); legal = legalActions(s, leader);
    expect(whyNot(v, 'de-sous-table', legal, 't0')).toMatch(/en second/);
    expect(whyNot(v, 'coup-pouce', legal, 't1')).toMatch(/Lancez d’abord/);
    // Ce n'est pas le tour de l'autre joueur.
    s = withHand(s0, other, ['tournee-patron'], (p) => { p.tournees = 2; });
    v = viewFor(s, other); legal = legalActions(s, other);
    expect(whyNot(v, 'tournee-patron', legal, 't0')).toBe('Se joue pendant votre tour.');
  });

  it('pièges, Habitués et coûts', () => {
    const s0 = game(4);
    const leader = s0.order[0];
    const s = withHand(s0, leader, ['faux-421', 'josiane', 'mise-bouche', 'tournee-patron'], (p) => { p.tournees = 6; });
    const v = viewFor(s, leader);
    expect(describeNow(v, 'faux-421')).toMatch(/face cachée devant .*1\/3 pièges.*4-2-1/);
    expect(describeNow(v, 'josiane')).toMatch(/^S’installe devant vous/);
    expect(describeNow(v, 'tournee-patron')).toBe('Vous gagnez 2 Tournées : vous en aurez 6 sur 6.');
    expect(costNow(v, 'josiane')).toBe(3);
    const s2 = structuredClone(s);
    s2.players.find((p) => p.id === leader)!.r.discount = 2;
    expect(costNow(viewFor(s2, leader), 'josiane')).toBe(1);
  });

  it('libellés : phase, consigne, relance, combinaison, mise en scène', () => {
    const s0 = game(5);
    const leader = s0.order[0];
    const v = viewFor(s0, leader);
    expect(phaseLine(v, 'contre l’ordinateur')).toBe('Manche 1 · contre l’ordinateur · vous menez');
    expect(decisionLine(v)).toMatch(/lancez les dés/);
    expect(rerollLabel([6, 4, 2], [false, true, true])).toBe('Relancer le 6');
    expect(rerollLabel([1, 4, 2], [false, true, false])).toBe('Relancer l’as et le 2');
    expect(rerollLabel([6, 4, 2], [false, false, false])).toBe('Relancer les 3');
    const s = structuredClone(s0);
    s.players.find((p) => p.id === leader)!.r.dice = [4, 2, 1];
    expect(comboOf(viewFor(s, leader), viewFor(s, leader).players.find((p) => p.id === leader)!)?.value).toBe(8);
    expect(isBigShot([1, 2, 4])).toBe('421');
    expect(isBigShot([1, 1, 1])).toBe('111');
    expect(isBigShot([5, 5, 5])).toBeNull();
    expect(eventTone({ kind: 'piege-revele', text: '' })).toBe('piege');
    expect(eventTone({ kind: 'comptes', text: '' })).toBe('comptes');
  });
});
