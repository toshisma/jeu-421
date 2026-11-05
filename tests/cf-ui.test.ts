/** Coups Fourrés : interface (contrôleur local contre l'ordinateur, fonctions d'affichage). */
import { describe, expect, it } from 'vitest';
import { LocalCfController, deckList } from '../client/src/cards/local';
import type { CfSnapshot } from '../client/src/cards/controller';
import { replayBotMatch } from '../shared/cards/botmatch';
import { cfDecide, type CfLevel } from '../shared/cards/ai';
import { STARTER_DECKS, cardDef } from '../shared/cards/catalog';
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
    expect(snap.view.players.find((p) => p.id === c.me)!.hand!.length).toBe(5);
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
    expect(describeNow(v, 'coup-pouce', { die: 0, delta: 1 }, opts)).toBe('Le 3 devient un 4 : vous passez à 4-2-1 (vaut 8).');
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
    expect(whyNot(v, 'de-sous-table', legal, 't0')).toMatch(/Lancez d’abord/);
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
    expect(describeNow(v, 'tournee-patron')).toBe('Vous gagnez 2 Tournées (vous en aurez 6 sur 6) et piochez 1 carte.');
    expect(costNow(v, 'josiane')).toBe(cardDef('josiane')!.cost);
    const s2 = structuredClone(s);
    s2.players.find((p) => p.id === leader)!.r.discount = 2;
    expect(costNow(viewFor(s2, leader), 'josiane')).toBe(0);
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

// ---------------------------------------------------------------------------------------------
// Rendu serveur des écrans principaux (aucune erreur, textes attendus)
import { createElement as h } from 'react';
import { renderToString as rts } from 'react-dom/server';
const renderToString = (el: Parameters<typeof rts>[0]) => rts(el).replace(/<!-- -->/g, '');
import { CollectionScreen, BoosterOpening, extrasOf } from '../client/src/cards/CfCollection';
import { DecksScreen, DeckEditor } from '../client/src/cards/CfDecks';
import { LeagueScreen, RulesScreen, MissionsList } from '../client/src/cards/CfInfo';
import { CfMode } from '../client/src/cards/CfMode';
import { EndScreen, Mulligan, RespondPanel, ChoiceWindow } from '../client/src/cards/CfGame';
import { CARDS } from '../shared/cards/catalog';
import { cfDailyMissions, type CfState as CfPlayerState } from '../shared/cards/progress';
import { deckAlerts, deckStats } from '../client/src/cards/describe';

const noop = () => {};
function fakeState(): CfPlayerState {
  const collection = Object.fromEntries(CARDS.map((c, i) => [c.id, { count: i % 5 === 0 ? 0 : 1 + (i % 3), shiny: i === 4 ? 1 : 0 }]));
  return {
    discovered: true, capsules: 140, shards: 85, boosters: 2, legendPicks: 0, collection,
    decks: [{ id: 'd1', name: 'Le Zinc', cards: STARTER_DECKS[0].cards, valid: true, problems: [], createdAt: 1, updatedAt: 1 }],
    activeDeck: 'd1', cosmetics: [], titles: [],
    missions: cfDailyMissions('2026-11-05').map((m, i) => ({ ...m, progress: i, done: i >= m.target })),
    botCapsulesToday: 3, firstWinToday: false,
    league: { season: '2026-11', endsOn: '2026-12-01', points: 512, best: 512, floor: 300, division: 'bistrot', games: 9, wins: 6, rank: 12 },
    history: [{ opponent: 'Dédé', vsBot: false, ranked: true, result: 'victoire', points: 24, capsules: 15, at: 1 }],
  };
}
const guestPa = { isAccount: false, token: null, session: null, photo: null, profile: { equipped: {} }, isBlocked: () => false } as never;

describe('rendu des écrans du mode', () => {
  it('menu du mode (invité) : boutons, tuiles, invitation à créer un compte', () => {
    const html = renderToString(h(CfMode, { pa: guestPa, settings: { name: '', avatar: '🎩' } as never, onSettings: noop, avatar: '🎩', displayName: '',
      onHome: noop, onMessages: noop, onFriends: noop, onAccount: noop, onLogin: noop, onDuelPlay: noop, onDuels: noop }));
    for (const t of ['Coups Fourrés', 'Partie classée', 'Contre l’ordinateur', 'Entre amis', 'Mes decks', 'Boosters', 'Collection', 'Missions', 'Classement', '421 classique', 'Règles', 'Connexion', 'sans rien gagner']) expect(html).toContain(t);
  });

  it('collection, decks, éditeur, classement, règles, missions, booster', () => {
    const st = fakeState();
    const coll = renderToString(h(CollectionScreen, { token: 't', state: st, onState: noop, onBack: noop, onAccount: noop }));
    expect(coll).toContain('Recycler tous les doublons en trop');
    expect(coll).toContain(`${CARDS.filter((c) => st.collection[c.id].count > 0).length}/34 cartes`);
    expect(extrasOf(st.collection).copies).toBeGreaterThan(0);
    expect(renderToString(h(CollectionScreen, { token: null, state: null, onState: noop, onBack: noop, onAccount: noop }))).toContain('Créer un compte');
    expect(renderToString(h(DecksScreen, { token: 't', state: st, onState: noop, onBack: noop, onAccount: noop, onEdit: noop }))).toContain('Construire automatiquement');
    const ed = renderToString(h(DeckEditor, { token: 't', state: st, onState: noop, deckId: null, initial: { 'bon-numero': 2, 'tournee-generale': 1, 'coup-pouce': 2, patron: 1, 'retournement-veste': 1, 'grand-enchainement': 1 }, onBack: noop }));
    expect(ed).toContain('Trop cher');
    expect(ed).toContain('Encore 12 cartes');
    expect(renderToString(h(LeagueScreen, { token: null, state: null, onState: noop, onBack: noop, onAccount: noop }))).toContain('Grand Café');
    const rules = renderToString(h(RulesScreen, { onBack: noop }));
    expect(rules).toContain('11 jetons');
    expect(rules).toContain('Dernier mot');
    expect(renderToString(h(MissionsList, { st, onAccount: noop }))).toContain('capsules');
    expect(renderToString(h(BoosterOpening, { token: 't', state: st, onState: noop, onDone: noop, onCollection: noop }))).toContain('Touchez le booster');
  });

  it('fenêtres de partie : main de départ, riposte, choix, fin', () => {
    let s = newGame({}, [{ id: 'a', name: 'Alice', deck: deckList(STARTER_DECKS[0].cards) }, { id: 'b', name: 'Bob', deck: deckList(STARTER_DECKS[1].cards) }], 8);
    const mull = renderToString(h(Mulligan, { v: viewFor(s, 'a'), legal: legalActions(s, 'a'), pending: false, onAct: noop }));
    expect(mull).toContain('Garder ma main');
    s = apply(s, 'a', { type: 'mulligan', cards: [] }).state;
    s = apply(s, 'b', { type: 'mulligan', cards: [] }).state;
    // Bob retourne un dé avec « Tête qui tourne », Alice peut répondre avec « Les yeux qui piquent ».
    const t = structuredClone(s);
    const bob = t.players.find((p) => p.id === 'b')!;
    t.stack = [{ kind: 'card', owner: 'b', card: { uid: 'tt', id: 'tete-tourne' }, type: 'coup', params: { die: 2 }, cost: 2, cancelled: false, playedBefore: 0, returnsToHand: false, targetIdx: null }];
    t.respond = ['a'];
    bob.r.dice = [4, 2, 6]; bob.r.throwsUsed = 1;
    const alice = t.players.find((p) => p.id === 'a')!;
    alice.hand = [{ uid: 'y1', id: 'yeux-piquent' }]; alice.tournees = 3;
    const resp = renderToString(h(RespondPanel, { v: viewFor(t, 'a'), legal: legalActions(t, 'a'), pending: false, onAct: noop }));
    expect(resp).toContain('Tête qui tourne');
    expect(resp).toContain('Vous pouvez riposter');
    expect(resp).toContain('Laisser faire');
    const c = structuredClone(s);
    c.choice = { kind: 'calcul', player: 'a', cards: [{ uid: 'c1', id: 'cul-sec' }, { uid: 'c2', id: 'fouine' }, { uid: 'c3', id: 'leurre' }] };
    expect(renderToString(h(ChoiceWindow, { v: viewFor(c, 'a'), legal: legalActions(c, 'a'), pending: false, onAct: noop }))).toContain('Calcul mental');
    const snap = { view: viewFor(s, 'a'), legal: [], waitingFor: [], seats: [], finished: { standings: ['a', 'b'], reward: { capsules: 3, booster: true, points: 0, missions: ['jouer-2'] } } };
    const end = renderToString(h(EndScreen, { snap, v: snap.view, me: 'a', onExit: noop, onAccount: noop, bot: true, guest: false, rewarded: true, ranked: false, spectator: false }));
    expect(end).toContain('Victoire !');
    expect(end).toContain('première victoire du jour');
    expect(end).toContain('mission');
  });

  it('statistiques et conseils de deck', () => {
    const st = deckStats(STARTER_DECKS[1].cards);
    expect(st.total).toBe(20);
    expect(st.curve.reduce((a, b) => a + b, 0)).toBe(20);
    expect(deckAlerts(STARTER_DECKS[1].cards).filter((a) => a.level === 'bloque')).toEqual([]);
    expect(deckAlerts({ 'cul-sec': 2, 'tete-tourne': 2, 'pari-comptoir': 2, 'double-tournee': 2, 'de-sous-table': 2, 'gueule-bois': 2 }).map((a) => a.text).join(' ')).toMatch(/Sans parade/);
  });
});
