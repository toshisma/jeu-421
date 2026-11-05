/** Coups Fourrés : nouveau plateau (raisons « jouable / pas jouable », bandeau, frise, file d'annonces, rendu). */
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString as rts } from 'react-dom/server';
import { STARTER_DECKS } from '../shared/cards/catalog';
import { apply, newGame, legalActions, viewFor, type CfEvent, type CfState } from '../shared/cards/engine';
import { TUTO_ME } from '../shared/cards/tutorial';
import { deckList } from '../client/src/cards/local';
import { TutorialCfController } from '../client/src/cards/tutorial';
import type { CfSnapshot } from '../client/src/cards/controller';
import { cardHint, decisionBanner, friseSteps, handHints, keepAfter, planEvents, shortCombo, threatLine, trapPossibilities } from '../client/src/cards/board';
import { AnnounceView, BigCard, Fiche, Hand, HelpSheet, Journal, OppPanel, RespondPanel, TrapSheet } from '../client/src/cards/BoardParts';
import { TYPE_META, TypeLegend } from '../client/src/cards/cardTypes';

const render = (el: Parameters<typeof rts>[0]) => rts(el).replace(/<!-- -->/g, '');
const noop = () => {};

/** Partie à deux après les mains de départ (Alice : Le Zinc, Bob : La Bringue). */
function started(seed = 8): CfState {
  let s = newGame({}, [{ id: 'a', name: 'Alice', deck: deckList(STARTER_DECKS[0].cards) }, { id: 'b', name: 'Bob', deck: deckList(STARTER_DECKS[1].cards) }], seed);
  s = apply(s, 'a', { type: 'mulligan', cards: [] }).state;
  s = apply(s, 'b', { type: 'mulligan', cards: [] }).state;
  return s;
}
/** Bob a joué 6-5-3 et s'est arrêté ; c'est à Alice (2 lancers), avec 6-4-2 après 2 lancers. */
function aliceSecond(): CfState {
  const s = structuredClone(started());
  s.leader = 'b'; s.order = ['b', 'a']; s.turn = 1; s.phase = 'turn';
  const a = s.players.find((p) => p.id === 'a')!, b = s.players.find((p) => p.id === 'b')!;
  b.r.dice = [6, 5, 3]; b.r.throwsUsed = 2; b.r.done = true;
  a.r.dice = [6, 4, 2]; a.r.throwsUsed = 2; a.r.done = false;
  a.tournees = 2;
  a.hand = [{ uid: 'h1', id: 'reaction-chaine' }, { uid: 'h2', id: 'tete-tourne' }, { uid: 'h3', id: 'fouine' }, { uid: 'h4', id: 'josiane' }, { uid: 'h5', id: 'note-salee' }];
  s.traps = [{ uid: 't1', id: 'faux-421', owner: 'b', target: 'a', posedRound: s.round, seenBy: ['b'] }];
  return s;
}

describe('cartes en main : jouable (raison) ou pas (moment / ce qui manque)', () => {
  it('votre tour : comme sur le prototype « Votre tour »', () => {
    const s = aliceSecond();
    const v = viewFor(s, 'a');
    const legal = legalActions(s, 'a');
    const { hints, playable } = handHints(v, legal);
    expect(hints.h2).toMatchObject({ playable: true, label: '6 → 1 : 4-2-1 !', tone: 'ok' });
    expect(hints.h3).toMatchObject({ playable: true, label: 'Voir son piège' });
    expect(hints.h1).toMatchObject({ playable: false, label: 'Tour adverse', tone: 'moment', type: 'riposte' });
    expect(hints.h4).toMatchObject({ playable: false, label: '3 Tournées', tone: 'cost' });
    expect(hints.h5).toMatchObject({ playable: false, label: 'Dernier mot', tone: 'moment' });
    expect(playable).toBe(2);
  });
  it('tour adverse, riposte, Dernier mot, défausse, main de départ', () => {
    const s = aliceSecond();
    s.turn = 0; s.order = ['a', 'b']; // c'est à Bob… vu par Alice, Bob mène : on simule en échangeant
    const wait = structuredClone(aliceSecond());
    wait.turn = 0; wait.order = ['b', 'a']; wait.players.find((p) => p.id === 'b')!.r.done = false;
    expect(cardHint(viewFor(wait, 'a'), [], { uid: 'h2', id: 'tete-tourne' }).label).toBe('Votre tour');
    // Fenêtre de riposte : Bob joue Tête qui tourne, Alice peut répondre avec Réaction en chaîne.
    const r = structuredClone(wait);
    r.stack = [{ kind: 'card', owner: 'b', card: { uid: 'x', id: 'tete-tourne' }, type: 'coup', params: { die: 2 }, cost: 2, cancelled: false, playedBefore: 0, returnsToHand: false, targetIdx: null }];
    r.respond = ['a'];
    const rl = legalActions(r, 'a');
    expect(cardHint(viewFor(r, 'a'), rl, { uid: 'h1', id: 'reaction-chaine' })).toMatchObject({ playable: true, label: 'Annuler sa carte' });
    expect(decisionBanner(viewFor(r, 'a'), rl)).toMatchObject({ mine: true, title: 'Riposte ?' });
    expect(threatLine(viewFor(r, 'a'))).toBe('Ici : son 3 devient un 4 → il passe à Suite 6-5-4.');
    // Dernier mot.
    const lw = structuredClone(aliceSecond());
    lw.phase = 'lastword'; lw.players.find((p) => p.id === 'a')!.r.done = true; lw.lastword = { order: ['a', 'b'], idx: 0, passes: 0 };
    const ll = legalActions(lw, 'a');
    expect(cardHint(viewFor(lw, 'a'), ll, { uid: 'h5', id: 'note-salee' })).toMatchObject({ playable: true, label: '+1 jeton donné' });
    expect(cardHint(viewFor(lw, 'a'), ll, { uid: 'h2', id: 'tete-tourne' }).label).toBe('Votre tour');
    expect(decisionBanner(viewFor(lw, 'a'), ll)).toMatchObject({ title: 'Dernier mot', text: 'vous perdez 6-4-2 contre 6-5-3 · jouez une carte ou passez' });
    // Défausse et main de départ.
    expect(cardHint(viewFor(lw, 'a'), [], { uid: 'h2', id: 'tete-tourne' }, true)).toMatchObject({ playable: true, label: 'Défausser' });
    const m = newGame({}, [{ id: 'a', deck: deckList(STARTER_DECKS[0].cards) }, { id: 'b', deck: deckList(STARTER_DECKS[1].cards) }], 3);
    const k = m.players[0].hand[0];
    expect(cardHint(viewFor(m, 'a'), [], k).label).toBe('Main de départ');
    expect(decisionBanner(viewFor(m, 'a'), legalActions(m, 'a')).text).toBe('Choisissez jusqu’à 2 cartes à changer');
  });
  it('bandeau « À vous ! Vous avez 6-4-2 · battez 6-5-3 · encore 1 lancer sur 2 » et attente (ce que montre le tapis)', () => {
    const s = aliceSecond();
    s.players.find((p) => p.id === 'a')!.r.throwsUsed = 1;
    expect(decisionBanner(viewFor(s, 'a'), legalActions(s, 'a'))).toMatchObject({ mine: true, title: 'À vous !', text: 'Vous avez 6-4-2 · battez 6-5-3 · encore 1 lancer sur 2' });
    expect(decisionBanner(viewFor(s, 'b'), [])).toMatchObject({ mine: false, text: 'Alice : 6-4-2 en 1 lancer' });
    s.players.find((p) => p.id === 'a')!.r.throwsUsed = 0;
    expect(decisionBanner(viewFor(s, 'b'), [])).toMatchObject({ mine: false, text: 'Alice joue…' });
    expect(shortCombo('421')).toBe('4-2-1');
  });
});

describe('frise de la manche', () => {
  it('ordre réel (meneur d’abord) et étape en cours', () => {
    const s = aliceSecond();
    expect(friseSteps(viewFor(s, 'a'), 'a').map((x) => `${x.label}:${x.state}`)).toEqual(['Service:done', 'Bob:done', 'Vous:on', 'Dernier mot:todo', 'Comptes:todo']);
    expect(friseSteps(viewFor(s, 'a'), 'a', 'comptes').at(-1)!.state).toBe('on');
    const four = newGame({}, ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), deck: deckList(STARTER_DECKS[0].cards) })), 2);
    expect(friseSteps(viewFor(four, 'a'), 'a')).toHaveLength(7);
  });
});

describe('file d’annonces', () => {
  const s = aliceSecond();
  const v = viewFor(s, 'a');
  it('piège posé par l’adversaire : grand, dos violet, possibilités selon ses familles', () => {
    const steps = planEvents([{ kind: 'pose', player: 'b', text: 'Bob pose un piège.' }], 'a', v, v);
    expect(steps).toHaveLength(1);
    const a = steps[0].kind === 'ann' ? steps[0].ann : null;
    expect(a).toMatchObject({ style: 'trap', title: 'Bob pose un piège face cachée', card: null });
    expect(a!.text).toMatch(/Avec un deck .*Pièges.*ça peut être/);
    expect(trapPossibilities(['pieges'])).toContain('Faux 4-2-1');
  });
  it('carte adverse en grand, lancer adverse animé avec bandeau, rien pour mes pioches', () => {
    const ev: CfEvent[] = [
      { kind: 'carte', player: 'b', card: 'tete-tourne', text: 'Bob joue Tête qui tourne.' },
      { kind: 'lancer', player: 'b', dice: [6, 5, 3], kept: [true, true, false], rolled: [2], text: 'Bob lance : 6-5-3.' },
      { kind: 'pioche-privee', player: 'a', card: 'fouine', to: ['a'], text: 'Vous piochez Fouine.' },
    ];
    const steps = planEvents(ev, 'a', v, v);
    expect(steps.map((x) => x.kind)).toEqual(['ann', 'dice']);
    expect(steps[0].kind === 'ann' && steps[0].ann).toMatchObject({ style: 'big', card: 'tete-tourne', kicker: 'Coup' });
    expect(steps[1].kind === 'dice' && steps[1].strip?.title).toBe('Bob garde 6-5 et relance 1 dé');
    // Le résultat n'est écrit qu'avec les vraies valeurs des dés, une fois posés.
    expect(steps[1].kind === 'dice' && steps[1].after?.title).toBe('Bob : 6-5-3 en 2 lancers');
  });
  it('piège qui me frappe : « Compris », conséquence en clair, astuce ; riposte qui annule ma carte', () => {
    const steps = planEvents([
      { kind: 'piege-revele', player: 'b', card: 'faux-421', text: 'Bob révèle un piège : Faux 4-2-1 !' },
      { kind: 'faux-421', player: 'a', who: 'a', text: 'Votre 4-2-1 ne vaut plus que 2 (Faux 4-2-1).' },
    ], 'a', v, v);
    expect(steps).toHaveLength(1);
    expect(steps[0].kind === 'ann' && steps[0].ann).toMatchObject({ style: 'reveal', block: true, card: 'faux-421', title: 'Le piège de Bob se déclenche !', conseq: 'Votre 4-2-1 ne vaut plus que 2 (Faux 4-2-1).' });
    expect(steps[0].kind === 'ann' && steps[0].ann.hint).toMatch(/Fouine/);
    const rip = planEvents([
      { kind: 'carte', player: 'b', card: 'ticket-caisse', text: 'Bob joue Ticket de caisse.' },
      { kind: 'annule', player: 'a', card: 'tete-tourne', text: 'Tête qui tourne est annulé.' },
    ], 'a', v, v);
    expect(rip).toHaveLength(1);
    expect(rip[0].kind === 'ann' && rip[0].ann).toMatchObject({ style: 'reveal', block: true, card: 'ticket-caisse', title: 'Bob riposte avec Ticket de caisse !' });
    // Pour un spectateur, rien ne bloque.
    const spec = planEvents([{ kind: 'piege-revele', player: 'b', card: 'faux-421', text: 'Bob révèle un piège : Faux 4-2-1 !' }], '', v, v);
    expect(spec[0].kind === 'ann' && spec[0].ann.block).toBeFalsy();
  });
  it('comptes : qui donne combien', () => {
    const c = structuredClone(s);
    c.lastRound = { round: 1, winner: 'a', loser: 'b', amount: 2, reversed: false, combos: { a: { dice: [4, 2, 1], label: '421', value: 2 }, b: { dice: [6, 5, 3], label: '6-5-3', value: 1 } }, text: '' };
    const st = planEvents([{ kind: 'comptes', player: 'a', text: 'Alice gagne la manche.' }], 'a', viewFor(c, 'a'), v);
    expect(st[0].kind === 'ann' && st[0].ann).toMatchObject({ style: 'comptes', title: 'Vous gagnez la manche', text: 'Vous donnez 2 jetons à Bob : c’est le but, vous vous déchargez !' });
  });
});

describe('rendu serveur du plateau (aucune erreur)', () => {
  it('grande carte, main, adversaire, fiche, riposte, annonces, journal, aide, pièges, légende', () => {
    const s = aliceSecond();
    const v = viewFor(s, 'a');
    const legal = legalActions(s, 'a');
    expect(render(h(BigCard, { id: 'tete-tourne' }))).toContain('Coup · Pendant votre tour');
    const hand = render(h(Hand, { cards: v.players[0].hand!, hints: handHints(v, legal).hints, onPick: noop }));
    expect(hand).toContain('6 → 1 : 4-2-1 !');
    expect(hand).toContain('Tour adverse');
    const opp = render(h(OppPanel, { p: v.players[1], v, active: true, compact: false, refEl: noop, onTrap: noop, onCard: noop, seat: { id: 'b', name: 'Bob', bot: true, label: 'Habitué' } }));
    expect(opp).toContain('1 piège caché');
    expect(opp).toContain('Ordinateur Habitué');
    const fiche = render(h(Fiche, { t: { uid: 'h2', id: 'tete-tourne' }, v, legal, snapLegal: legal, pending: false, discard: false, onAct: noop, onClose: noop }));
    expect(fiche).toContain('Maintenant :');
    expect(fiche).toContain('Jouer · 2 Tournées');
    expect(fiche).toContain('Les 5 types de cartes');
    const why = render(h(Fiche, { t: { uid: 'h4', id: 'josiane' }, v, legal, snapLegal: legal, pending: false, discard: false, onAct: noop, onClose: noop }));
    expect(why).toContain('Pas maintenant :');
    const r = structuredClone(s);
    r.turn = 0; r.order = ['b', 'a'];
    r.stack = [{ kind: 'card', owner: 'b', card: { uid: 'x', id: 'de-sous-table' }, type: 'coup', params: { target: 'a', die: 1 }, cost: 3, cancelled: false, playedBefore: 0, returnsToHand: false, targetIdx: null }];
    r.respond = ['a'];
    const resp = render(h(RespondPanel, { v: viewFor(r, 'a'), legal: legalActions(r, 'a'), pending: false, onAct: noop }));
    expect(resp).toContain('Bob joue une carte contre vous');
    expect(resp).toContain('Ici : il relance votre 4');
    expect(resp).toContain('Coût : 2 Tournées (il vous en reste 2)');
    for (const st of planEvents([{ kind: 'pose', player: 'b', text: 'Bob pose un piège.' }, { kind: 'carte', player: 'b', card: 'josiane', text: 'Bob installe Josiane, la serveuse.' }, { kind: 'piege-revele', player: 'b', card: 'faux-421', text: 'x' }], 'a', v, v)) {
      if (st.kind === 'ann') expect(render(h(AnnounceView, { a: st.ann, onDone: noop, spectator: false, me: 'a', v }))).toContain(st.ann.title.slice(0, 10));
    }
    expect(render(h(Journal, { log: [{ key: 1, round: 1, ev: { kind: 'carte', player: 'b', card: 'tete-tourne', text: 'Bob joue Tête qui tourne.' } }], v, me: 'a', onCard: noop, onClose: noop }))).toContain('Tête qui tourne');
    expect(render(h(HelpSheet, { v, onClose: noop, onRules: noop }))).toContain('Dernier mot');
    expect(render(h(TrapSheet, { owner: v.players[1], v, onClose: noop, onCard: noop }))).toContain('Croche-patte');
    const legend = render(h(TypeLegend, {}));
    for (const t of Object.values(TYPE_META)) { expect(legend).toContain(t.label); expect(legend).toContain(t.color); }
  });
});

describe('partie guidée sur le nouveau plateau', () => {
  it('déroulée de bout en bout par le contrôleur : chaque étape a une bulle, chaque mise à jour des annonces valides', async () => {
    const c = new TutorialCfController({ me: { name: 'Testeur' }, pace: 0 });
    const snaps: { snap: CfSnapshot; events: CfEvent[] }[] = [];
    let prev: CfSnapshot | null = null;
    let reveals = 0;
    c.subscribe((snap, events) => {
      for (const st of planEvents(events, TUTO_ME, snap.view, prev?.view ?? null)) if (st.kind === 'ann' && st.ann.block) reveals++;
      handHints(snap.view, snap.legal);
      decisionBanner(snap.view, snap.legal);
      friseSteps(snap.view, TUTO_ME);
      prev = snap;
      snaps.push({ snap, events });
    });
    for (let i = 0; i < 200 && !c.current()?.finished; i++) {
      await new Promise((r) => setTimeout(r, 0));
      const s = c.current()!;
      if (s.guide?.next) { c.guideNext(); continue; }
      if (s.legal.length) { expect(s.guide).toBeTruthy(); expect(await c.act(s.legal[0])).toBeNull(); }
    }
    expect(c.current()?.finished?.standings[0]).toBe(TUTO_ME);
    expect(reveals).toBeGreaterThan(0); // le piège de Dédé qui vous frappe demande « Compris »
  });
});

describe('dés gardés : la sélection reste d’un lancer à l’autre et suit le moteur', () => {
  /** Alice garde les dés `keep` et relance ; Bob laisse faire. Renvoie les événements (vus par Alice). */
  const relance = (s: CfState, keep: boolean[]) => {
    const r1 = apply(s, 'a', { type: 'roll', keep });
    expect(r1.ok).toBe(true);
    let st = r1.state;
    const events = [...r1.events];
    if (legalActions(st, 'b').some((x) => x.type === 'pass')) { const r2 = apply(st, 'b', { type: 'pass' }); events.push(...r2.events); st = r2.state; }
    return { st, events };
  };
  const after = (keep: boolean[], events: CfEvent[]) => events.reduce((k, e) => keepAfter(k, e, 'a'), keep);
  it('après ma relance, les dés que je gardais restent gardés', () => {
    const s = aliceSecond();
    s.players.find((p) => p.id === 'a')!.r.throwsUsed = 1;
    s.traps = [];
    const { events } = relance(s, [true, false, true]);
    expect(events.some((e) => e.kind === 'lancer')).toBe(true);
    expect(after([true, false, true], events)).toEqual([true, false, true]);
  });
  it('Croche-patte : le dé qu’il renvoie au lancer n’est plus gardé', () => {
    const s = aliceSecond();
    s.players.find((p) => p.id === 'a')!.r.throwsUsed = 1;
    s.traps = [{ uid: 't9', id: 'croche-patte', owner: 'b', target: 'a', posedRound: s.round, seenBy: ['b'] }];
    const { events } = relance(s, [true, true, false]);
    expect(events.some((e) => e.kind === 'croche-patte')).toBe(true);
    const k = after([true, true, false], events);
    expect(k.filter(Boolean)).toHaveLength(1);
    expect(k[2]).toBe(false);
  });
  it('Les yeux qui piquent relâchent tout ; un dé relancé par une carte n’est plus gardé ; un dé changé garde son état', () => {
    expect(keepAfter([true, true, false], { kind: 'lancer', player: 'a', dice: [1, 2, 3], kept: [false, false, false], rolled: [0, 1, 2], text: '' }, 'a')).toEqual([false, false, false]);
    expect(keepAfter([true, true, false], { kind: 'de-sous-table', player: 'a', dice: [1, 2, 3], rolled: [1], text: '' } as CfEvent, 'a')).toEqual([true, false, false]);
    expect(keepAfter([true, true, false], { kind: 'tete-tourne', player: 'a', dice: [6, 2, 3], text: '' } as CfEvent, 'a')).toEqual([true, true, false]);
    // Les dés de l'adversaire ne touchent pas à ma sélection.
    expect(keepAfter([true, false, false], { kind: 'lancer', player: 'b', dice: [1, 2, 3], kept: [false, false, false], text: '' }, 'a')).toEqual([true, false, false]);
  });
});
