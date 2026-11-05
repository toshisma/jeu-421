/** Coups Fourrés : moteur de règles (chaque carte, timing, information partielle, fin de partie, IA). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  apply, defaultAction, eventsFor, legalActions, newGame, throwLimit, viewFor, waitingFor,
  type CfAction, type CfEvent, type CfState,
} from '../shared/cards/engine';
import { cfDecide, type CfLevel } from '../shared/cards/ai';
import { CARDS, STARTER_DECKS, cardDef } from '../shared/cards/catalog';
import { mulberry32 } from '../shared/rng';

// ---------------------------------------------------------------------------------------------
// Outils

const FILL = Array(20).fill('domino') as string[];
let lastEvents: CfEvent[] = [];
let uidN = 0;

function queue(vals: number[]) {
  const q = [...vals];
  return () => { const v = q.shift(); if (v === undefined) throw new Error('plus de dés prévus'); return v; };
}
function act(s: CfState, pid: string, a: CfAction, dice?: number[]): CfState {
  const res = apply(s, pid, a, dice ? { rollDie: queue(dice) } : {});
  if (!res.ok) throw new Error(`${pid} ${JSON.stringify(a)} : ${res.error}`);
  lastEvents = res.events;
  return res.state;
}
const P = (s: CfState, id: string) => s.players.find((p) => p.id === id)!;
function give(s: CfState, pid: string, id: string): string {
  const uid = `g${++uidN}`;
  P(s, pid).hand.push({ uid, id });
  return uid;
}
function trap(s: CfState, owner: string, target: string, id: string): string {
  const uid = `t${++uidN}`;
  s.traps.push({ uid, id, owner, target, posedRound: s.round, seenBy: [owner] });
  return uid;
}
function hab(s: CfState, pid: string, id: string): string {
  const uid = `h${++uidN}`;
  P(s, pid).habitues.push({ uid, id });
  return uid;
}
/** Partie prête : mulligans faits, mains vides, 6 Tournées chacun (l'ardoise n'est alors pas proposée). */
function setup(n = 2, seed = 1, deck = FILL, config = {}): { s: CfState; L: string; O: string } {
  let s = newGame(config, Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i + 1}`, deck })), seed);
  for (const p of s.players) s = act(s, p.id, { type: 'mulligan', cards: [] });
  for (const p of s.players) { p.hand = []; p.tournees = 6; }
  return { s, L: s.order[0], O: s.order[1] };
}
const roll = (keep = [false, false, false]): CfAction => ({ type: 'roll', keep });
const stop: CfAction = { type: 'stop' };
const play = (card: string, prm: Record<string, unknown> = {}): CfAction => ({ type: 'play', card, ...prm } as CfAction);
const pass: CfAction = { type: 'pass' };
const cost = (id: string) => cardDef(id)!.cost;

/** Tour complet : le meneur lance une fois et s'arrête, l'autre lance une fois (fin automatique). */
function quickRound(s: CfState, L: string, O: string, dl: number[], dO: number[]): CfState {
  s = act(s, L, roll(), dl);
  s = act(s, L, stop);
  s = act(s, O, roll(), dO);
  if (s.phase === 'turn' && waitingFor(s)[0] === O && P(s, O).r.throwsUsed > 0) s = act(s, O, stop);
  return s;
}

// ---------------------------------------------------------------------------------------------

describe('Coups Fourrés : déroulé', () => {
  it('début de partie : 5 cartes, échange de 2 au plus, tirage du meneur, service', () => {
    let s = newGame({}, [{ id: 'a', deck: FILL }, { id: 'b', deck: FILL }], 3);
    expect(s.phase).toBe('mulligan');
    expect(s.players.every((p) => p.hand.length === 5)).toBe(true);
    expect(waitingFor(s).sort()).toEqual(['a', 'b']);
    const two = legalActions(s, 'a').filter((x) => x.type === 'mulligan' && x.cards.length === 2);
    expect(two).toHaveLength(10);
    expect(legalActions(s, 'a').some((x) => x.type === 'mulligan' && x.cards.length === 3)).toBe(false);
    s = act(s, 'a', two[0]);
    expect(P(s, 'a').hand).toHaveLength(5);
    s = act(s, 'b', { type: 'mulligan', cards: [] });
    expect(s.phase).toBe('turn');
    expect(s.round).toBe(1);
    for (const p of s.players) { expect(p.hand).toHaveLength(6); expect(p.tournees).toBe(2); expect(p.tokens).toBe(11); }
    expect(waitingFor(s)).toEqual([s.order[0]]);
  });

  it('le meneur fixe le nombre de lancers de l’autre', () => {
    let { s, L, O } = setup();
    expect(legalActions(s, L).filter((a) => a.type === 'roll')).toHaveLength(1); // 1er lancer : tout lancer
    expect(legalActions(s, L).some((a) => a.type === 'stop')).toBe(false);
    s = act(s, L, roll(), [6, 3, 2]);
    s = act(s, L, roll([true, false, false]), [5, 4]);
    s = act(s, L, stop);
    expect(waitingFor(s)).toEqual([O]);
    expect(throwLimit(s, O)).toBe(2);
  });

  it('comptes : le gagnant donne la valeur de sa combinaison ; nénette ≥ 2 ; égalité parfaite = rien', () => {
    let { s, L, O } = setup();
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(P(s, L).tokens).toBe(5);
    expect(P(s, O).tokens).toBe(17);
    expect(s.round).toBe(2);
    expect(s.order[0]).toBe(O); // le perdant mène
    // nénette : le perdant reçoit au moins 2
    const t = setup(2, 5);
    s = quickRound(t.s, t.L, t.O, [6, 3, 2], [2, 2, 1]);
    expect(P(s, t.O).tokens).toBe(13);
    // égalité parfaite
    const u = setup(2, 6);
    s = quickRound(u.s, u.L, u.O, [6, 3, 2], [2, 3, 6]);
    expect(P(s, u.L).tokens).toBe(11);
    expect(P(s, u.O).tokens).toBe(11);
    expect(s.order[0]).toBe(u.L); // égalité : même meneur
  });

  it('fin de partie : le premier à 0 jeton gagne', () => {
    let { s, L, O } = setup();
    P(s, L).tokens = 3;
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(L);
    expect(s.ranking).toEqual([L, O]);
    expect(waitingFor(s)).toEqual([]);
    expect(legalActions(s, O)).toEqual([]);
  });

  it('fermeture du bistrot : après la dernière manche prévue, le moins de jetons gagne', () => {
    let { s, L, O } = setup(2, 1, FILL, { rules: { maxRounds: 1 } });
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(L);
  });

  it('deck vide : on mélange la défausse (1 jeton reçu) ; sans défausse, 1 jeton par pioche manquante', () => {
    const deck = ['domino', 'domino', 'domino', 'domino', 'domino', 'domino'];
    let { s, L, O } = setup(2, 1, deck);
    expect(P(s, L).deck).toHaveLength(0);
    P(s, O).discard.push({ uid: 'x1', id: 'cul-sec' });
    s = quickRound(s, L, O, [6, 3, 2], [2, 3, 6]); // égalité : jetons inchangés
    expect(P(s, L).tokens).toBe(12); // aucune défausse : 1 jeton pour la pioche manquante
    expect(P(s, O).tokens).toBe(12); // défausse mélangée : 1 jeton
    expect(P(s, O).hand.some((k) => k.id === 'cul-sec')).toBe(true);
  });

  it('plus de limite de main ni d’ardoise (0.39, décision de Sam)', () => {
    let { s, L, O } = setup();
    for (let i = 0; i < 8; i++) give(s, O, 'domino');
    const before = P(s, O).hand.length;
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(s.phase).toBe('turn');
    expect(P(s, O).hand.length).toBe(before + 1); // rien à défausser, + la pioche de la nouvelle manche
    expect(legalActions(s, s.order[0]).some((a) => a.type === 'ardoise')).toBe(false);
  });

  it('un piège non déclenché revient en main après 3 manches', () => {
    let { s, L, O } = setup();
    const uid = trap(s, O, L, 'faux-421');
    s.traps[0].posedRound = s.round - 2;
    s = quickRound(s, L, O, [6, 3, 2], [2, 3, 6]);
    expect(s.traps).toHaveLength(0);
    expect(P(s, O).hand.some((k) => k.uid === uid)).toBe(true);
  });

  it('valeur par défaut à l’expiration du temps', () => {
    let { s, L, O } = setup();
    expect(defaultAction(s, L)).toEqual({ type: 'roll', keep: [false, false, false] });
    s = act(s, L, roll(), [6, 3, 2]);
    expect(defaultAction(s, L)).toEqual({ type: 'stop' });
    expect(defaultAction(s, O)).toBeNull();
  });
});

describe('Coups Fourrés : les 34 cartes', () => {
  it('Le Patron : +1 Tournée par manche, une carte après une défaite, Habitués protégés', () => {
    let { s, L, O } = setup();
    const u = give(s, L, 'patron');
    give(s, O, 'reaction-chaine');
    s = act(s, L, play(u));
    expect(waitingFor(s)).toEqual([O]); // le Patron lui-même peut être annulé pendant qu'on le pose
    s = act(s, O, pass);
    s = act(s, L, play(give(s, L, 'josiane')));
    expect(waitingFor(s)).toEqual([L]); // ensuite, ses Habitués sont protégés
    expect(P(s, L).habitues.map((h) => h.id)).toEqual(['patron', 'josiane']);
    P(s, L).tournees = 0;
    const hand = P(s, L).hand.length;
    s = quickRound(s, L, O, [6, 3, 2], [6, 6, 6]); // L perd
    expect(P(s, L).tournees).toBe(4); // 2 + 1 (perdant) + 1 (Patron)
    expect(P(s, L).hand.length).toBe(hand + 2); // pioche + Patron
  });

  it('Josiane : relance un dé sans utiliser de lancer, une fois par manche', () => {
    let { s, L } = setup();
    const u = give(s, L, 'josiane');
    s = act(s, L, play(u));
    s = act(s, L, roll(), [1, 2, 3]);
    s = act(s, L, { type: 'josiane', card: u, die: 2 }, [4]);
    expect(P(s, L).r.dice).toEqual([1, 2, 4]);
    expect(P(s, L).r.throwsUsed).toBe(1);
    expect(legalActions(s, L).some((a) => a.type === 'josiane')).toBe(false);
  });

  it('Le Vieux Marcel : les suites valent 4', () => {
    let { s, L, O } = setup();
    hab(s, L, 'vieux-marcel');
    s = quickRound(s, L, O, [3, 4, 5], [6, 3, 2]);
    expect(P(s, O).tokens).toBe(15);
  });

  it('Le Pilier de comptoir : 1 jeton de moins, plusieurs Piliers ne se cumulent pas', () => {
    let { s, L, O } = setup();
    hab(s, O, 'pilier'); hab(s, O, 'pilier');
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(P(s, O).tokens).toBe(16);
  });

  it('Le Videur : le premier piège adverse de la manche est annulé', () => {
    let { s, L } = setup();
    hab(s, L, 'videur');
    trap(s, 'p1' === L ? 'p0' : 'p1', L, 'croche-patte');
    s = act(s, L, roll(), [4, 2, 1]);
    s = act(s, L, stop);
    expect(P(s, L).r.dice).toEqual([4, 2, 1]);
    expect(s.traps).toHaveLength(0);
    expect(lastEvents.some((e) => e.kind === 'videur')).toBe(true);
  });

  it('Tournée du patron : +2 Tournées et 1 carte', () => {
    let { s, L } = setup();
    P(s, L).tournees = 2;
    s = act(s, L, play(give(s, L, 'tournee-patron')));
    expect(P(s, L).tournees).toBe(2 - cost('tournee-patron') + 2);
    expect(P(s, L).hand).toHaveLength(1);
  });

  it('Ticket de caisse : annule un Coup qui coûte 3 ou moins', () => {
    let { s, L, O } = setup();
    const t = give(s, O, 'ticket-caisse');
    s = act(s, L, play(give(s, L, 'cul-sec')));
    expect(waitingFor(s)).toEqual([O]);
    expect(s.respond).toEqual([O]);
    s = act(s, O, play(t));
    expect(P(s, L).r.bonusThrows).toBe(0);
    expect(P(s, L).discard.some((k) => k.id === 'cul-sec')).toBe(true);
    // un Coup à 4 ne peut pas être annulé
    give(s, O, 'ticket-caisse');
    s = act(s, L, roll(), [3, 2, 1]);
    expect(cost('bon-numero')).toBeGreaterThan(3);
    s = act(s, L, play(give(s, L, 'bon-numero'), { die: 0, face: 4 }));
    expect(waitingFor(s)).toEqual([L]);
    expect(P(s, L).r.dice).toEqual([4, 2, 1]);
  });

  it('Fermeture ! : un Habitué adverse rentre chez lui ; sans Habitué, on pioche 2 cartes', () => {
    let { s, L, O } = setup();
    const h = hab(s, O, 'josiane');
    s = act(s, L, play(give(s, L, 'fermeture'), { habitue: h }));
    expect(P(s, O).habitues).toHaveLength(0);
    expect(P(s, O).discard.some((k) => k.uid === h)).toBe(true);
    const t = setup();
    const before = P(t.s, t.L).hand.length;
    const f = give(t.s, t.L, 'fermeture');
    expect(legalActions(t.s, t.L).filter((a) => a.type === 'play' && a.card === f)).toEqual([{ type: 'play', card: f }]);
    const s2 = act(t.s, t.L, play(f));
    expect(P(s2, t.L).hand.length).toBe(before + 2);
  });

  it('Habitué : reste 3 manches (celle où il arrive comprise), puis rentre chez lui', () => {
    let { s, L, O } = setup();
    s = act(s, L, play(give(s, L, 'pilier')));
    expect(P(s, L).habitues[0].rounds).toBe(3);
    s = quickRound(s, L, O, [6, 3, 2], [5, 3, 2]);
    expect(P(s, L).habitues[0].rounds).toBe(2);
    const a = s.order[0], b = s.order[1];
    s = quickRound(s, a, b, [6, 3, 2], [5, 3, 2]);
    expect(P(s, L).habitues[0].rounds).toBe(1);
    const a2 = s.order[0], b2 = s.order[1];
    s = quickRound(s, a2, b2, [6, 3, 2], [5, 3, 2]);
    expect(P(s, L).habitues).toHaveLength(0);
    expect(P(s, L).discard.some((k) => k.id === 'pilier')).toBe(true);
  });

  it('La note est salée (Dernier mot) : +2 jetons au perdant si vous gagnez, détail aux comptes', () => {
    let { s, L, O } = setup();
    const n = give(s, L, 'note-salee');
    s = act(s, L, roll(), [6, 6, 6]);
    s = act(s, L, stop);
    s = act(s, O, roll(), [6, 3, 2]);
    expect(s.phase).toBe('lastword');
    expect(waitingFor(s)).toEqual([L]);
    s = act(s, L, play(n));
    expect(P(s, O).tokens).toBe(19);
    expect(s.lastRound!.detail).toEqual([{ label: 'Brelan de 6', delta: 6 }, { label: 'La note est salée', delta: 2 }]);
  });

  it('Cul sec : un lancer de plus, au-delà de la limite', () => {
    let { s, L } = setup();
    s = act(s, L, play(give(s, L, 'cul-sec')));
    expect(throwLimit(s, L)).toBe(4);
  });

  it('Tête qui tourne : un dé sur sa face opposée', () => {
    let { s, L } = setup();
    s = act(s, L, roll(), [3, 2, 1]);
    s = act(s, L, play(give(s, L, 'tete-tourne'), { die: 0 }));
    expect(P(s, L).r.dice).toEqual([4, 2, 1]);
  });

  it('Pari de comptoir : +2 jetons au perdant', () => {
    let { s, L, O } = setup();
    s = act(s, L, play(give(s, L, 'pari-comptoir')));
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(P(s, O).tokens).toBe(19);
    const t = setup(2, 9);
    s = act(t.s, t.L, play(give(t.s, t.L, 'pari-comptoir')));
    s = quickRound(s, t.L, t.O, [6, 3, 2], [6, 6, 6]); // le parieur perd
    expect(P(s, t.L).tokens).toBe(19);
  });

  it('Double tournée : la combinaison gagnante vaut le double', () => {
    let { s, L, O } = setup();
    s = act(s, L, play(give(s, L, 'double-tournee')));
    s = quickRound(s, L, O, [5, 5, 5], [6, 3, 2]);
    expect(P(s, L).tokens).toBe(1);
    expect(P(s, O).tokens).toBe(21);
  });

  it('Le dé sous la table : relance un dé adverse ; si personne n’a fini, un de ses dés', () => {
    let { s, L, O } = setup();
    const u0 = give(s, L, 'de-sous-table');
    s = act(s, L, roll(), [6, 6, 6]);
    expect(legalActions(s, L).filter((a) => a.type === 'play' && a.card === u0).map((a) => (a as { target: string }).target)).toEqual([L, L, L]);
    s = act(s, L, stop);
    const u = give(s, O, 'de-sous-table');
    give(s, O, 'tournee-patron'); // garde le tour ouvert après la carte (sinon la manche se termine aussitôt)
    s = act(s, O, roll(), [1, 2, 3]);
    s = act(s, O, play(u, { target: L, die: 0 }), [1]);
    expect(P(s, L).r.dice).toEqual([1, 6, 6]);
  });

  it('Les yeux qui piquent : annule un Coup qui change des dés (plus de riposte sur les dés gardés)', () => {
    let { s, L, O } = setup();
    const y = give(s, O, 'yeux-piquent');
    s = act(s, L, roll(), [4, 2, 6]);
    s = act(s, L, roll([true, true, false]), [5]);
    expect(waitingFor(s)).toEqual([L]); // garder des dés n'ouvre plus de fenêtre de riposte
    s = act(s, L, play(give(s, L, 'tete-tourne'), { die: 2 }));
    expect(waitingFor(s)).toEqual([O]);
    s = act(s, O, play(y));
    expect(P(s, L).r.dice).toEqual([4, 2, 5]);
    // Un Coup qui ne touche pas aux dés : pas de riposte possible avec cette carte.
    s = act(s, L, play(give(s, L, 'tournee-patron')));
    expect(waitingFor(s)).toEqual([L]);
  });

  it('Gueule de bois : le perdant n’aura qu’un seul lancer à la manche suivante (qu’il mène)', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'gueule-bois');
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]); // L gagne : rien
    expect(s.traps).toHaveLength(1);
    s = quickRound(s, O, L, [6, 6, 6], [6, 3, 2]); // L perd : le piège se déclenche
    expect(s.traps).toHaveLength(0);
    expect(s.order).toEqual([L, O]);
    expect(throwLimit(s, L)).toBe(1);
    s = act(s, L, roll(), [6, 3, 2]);
    expect(throwLimit(s, O)).toBe(3); // un meneur limité ne limite pas les autres
  });

  it('Tournée générale : en second, les deux relancent tout, puis un dé de plus', () => {
    let { s, L, O } = setup();
    s = act(s, L, roll(), [6, 6, 6]);
    s = act(s, L, stop);
    const u = give(s, O, 'tournee-generale');
    give(s, O, 'tournee-patron'); // garde le tour ouvert après la carte
    s = act(s, O, roll(), [1, 2, 3]);
    s = act(s, O, play(u, { target: L }), [2, 2, 3, 4, 2, 5]);
    expect(P(s, L).r.dice).toEqual([2, 2, 3]);
    expect(P(s, O).r.dice).toEqual([4, 2, 5]);
    expect(s.choice?.kind).toBe('tournee-generale');
    s = act(s, O, { type: 'choose', index: 2 }, [1]);
    expect(P(s, O).r.dice).toEqual([4, 2, 1]);
  });

  it('Leurre : défaussé par une Fouine, son propriétaire pioche 1 carte', () => {
    let { s, L, O } = setup();
    const t = trap(s, O, L, 'leurre');
    s = act(s, L, play(give(s, L, 'fouine'), { trap: t }));
    expect(P(s, O).hand).toHaveLength(1);
    expect(s.choice).toBeNull();
    expect(s.traps).toHaveLength(0);
  });

  it('Croche-patte : à la fin du tour, un dé est relancé au hasard', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'croche-patte');
    s = act(s, L, roll(), [4, 2, 6]);
    s = act(s, L, roll([true, true, false]), [6]); // garder des dés ne déclenche plus rien
    expect(s.traps).toHaveLength(1);
    s = act(s, L, stop, [1]);
    const ev = lastEvents.find((e) => e.kind === 'croche-patte')!;
    expect(ev.rolled).toHaveLength(1);
    expect(P(s, L).r.dice.filter((d) => d === 1)).toHaveLength(1);
    expect(s.traps).toHaveLength(0);
  });

  it('Main dans le sac : un Coup qui coûte 2 ou plus est annulé (pas les petits)', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'main-sac');
    s = act(s, L, play(give(s, L, 'cul-sec')));
    expect(P(s, L).r.bonusThrows).toBe(1);
    expect(s.traps).toHaveLength(1);
    s = act(s, L, roll(), [3, 2, 1]);
    s = act(s, L, play(give(s, L, 'tete-tourne'), { die: 0 }));
    expect(P(s, L).r.dice).toEqual([3, 2, 1]);
    expect(P(s, L).tournees).toBe(6 - cost('cul-sec') - cost('tete-tourne'));
    expect(P(s, L).discard.some((k) => k.id === 'tete-tourne')).toBe(true);
    expect(s.traps).toHaveLength(0);
  });

  it('Fouine : défausse le piège choisi ; sans piège, piocher', () => {
    let { s, L, O } = setup();
    const t = trap(s, O, L, 'faux-421');
    s = act(s, L, play(give(s, L, 'fouine'), { trap: t }));
    expect(s.choice).toBeNull();
    expect(s.traps).toHaveLength(0);
    expect(P(s, O).discard.some((k) => k.id === 'faux-421')).toBe(true);
    expect(eventsFor(lastEvents, L).some((e) => e.kind === 'fouine-defausse' && e.card === 'faux-421')).toBe(true);
    expect(P(s, L).tournees).toBe(6 - cost('fouine'));
    const n = P(s, L).hand.length;
    s = act(s, L, play(give(s, L, 'fouine')));
    expect(P(s, L).hand.length).toBe(n + 1);
  });

  it('Ardoise piégée : 2 Tournées de plus pour jouer un Coup, sinon il est annulé', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'ardoise-piegee');
    P(s, L).tournees = 2 + cost('cul-sec');
    s = act(s, L, play(give(s, L, 'cul-sec')));
    expect(P(s, L).tournees).toBe(0);
    expect(P(s, L).r.bonusThrows).toBe(1);
    const t = setup(2, 8);
    trap(t.s, t.O, t.L, 'ardoise-piegee');
    P(t.s, t.L).tournees = 1 + cost('cul-sec');
    s = act(t.s, t.L, play(give(t.s, t.L, 'cul-sec')));
    expect(P(s, t.L).r.bonusThrows).toBe(0);
  });

  it('Faux 4-2-1 : le 4-2-1 ne vaut que 2', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'faux-421');
    s = act(s, L, roll(), [4, 2, 1]);
    s = act(s, L, stop);
    expect(lastEvents.some((e) => e.kind === 'faux-421' && eventsFor([e], L)[0].text.startsWith('Votre 4-2-1 ne vaut plus que 2'))).toBe(true);
    s = act(s, O, roll(), [6, 3, 2]);
    expect(P(s, O).tokens).toBe(13);
  });

  it('Le coup de la nénette : un gagnant à 1 ou 2 jetons devient une nénette', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'coup-nenette');
    s = quickRound(s, L, O, [6, 5, 3], [6, 4, 2]);
    expect(P(s, L).tokens).toBe(13); // a perdu avec une nénette : au moins 2
    expect(P(s, O).tokens).toBe(9);    // une suite (vaut 2) aussi
    const t = setup(2, 5);
    trap(t.s, t.L, t.O, 'coup-nenette');
    s = quickRound(t.s, t.L, t.O, [6, 3, 2], [4, 3, 2]);
    expect(lastEvents.some((e) => e.kind === 'coup-nenette')).toBe(true);
    expect(P(s, t.O).tokens).toBe(13);
  });

  it('Retournement de veste : l’adversaire reçoit les jetons à votre place', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'retournement-veste');
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(P(s, L).tokens).toBe(17);
    expect(P(s, O).tokens).toBe(11);
    // en dessous de 6 jetons, rien
    const t = setup(2, 3);
    trap(t.s, t.O, t.L, 'retournement-veste');
    s = quickRound(t.s, t.L, t.O, [3, 3, 3], [6, 3, 2]);
    expect(P(s, t.O).tokens).toBe(14);
    expect(s.traps).toHaveLength(1);
  });

  it('Coup de coude : piochez 1 carte', () => {
    let { s, L } = setup();
    s = act(s, L, play(give(s, L, 'coup-coude')));
    expect(P(s, L).hand).toHaveLength(1);
  });

  it('Mise en bouche : la prochaine carte est gratuite (seulement la suivante)', () => {
    let { s, L } = setup();
    s = act(s, L, roll(), [3, 2, 1]);
    s = act(s, L, play(give(s, L, 'mise-bouche')));
    s = act(s, L, play(give(s, L, 'bon-numero'), { die: 0, face: 4 }));
    expect(P(s, L).tournees).toBe(6 - cost('mise-bouche'));
    expect(P(s, L).r.dice).toEqual([4, 2, 1]);
    s = act(s, L, play(give(s, L, 'tete-tourne'), { die: 2 }));
    expect(P(s, L).tournees).toBe(6 - cost('mise-bouche') - cost('tete-tourne'));
  });

  it('Coup de pouce : +1 ou −1 à un dé (bornes respectées)', () => {
    let { s, L } = setup();
    s = act(s, L, roll(), [3, 2, 6]);
    const u = give(s, L, 'coup-pouce');
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === u && a.die === 2 && a.delta === 1)).toBe(false);
    s = act(s, L, play(u, { die: 0, delta: 1 }));
    expect(P(s, L).r.dice).toEqual([4, 2, 6]);
  });

  it('Calcul mental : regarder 3 cartes, en garder une, les autres sous le deck', () => {
    let { s, L, O } = setup();
    P(s, L).deck = [{ uid: 'd1', id: 'cul-sec' }, { uid: 'd2', id: 'leurre' }, { uid: 'd3', id: 'patron' }, { uid: 'd4', id: 'domino' }];
    s = act(s, L, play(give(s, L, 'calcul-mental')));
    expect(s.choice?.kind).toBe('calcul');
    expect(viewFor(s, O).choice).toEqual({ kind: 'calcul', player: L });
    s = act(s, L, { type: 'choose', index: 2 });
    expect(P(s, L).hand.map((k) => k.id)).toEqual(['patron']);
    expect(P(s, L).deck.map((k) => k.id)).toEqual(['domino', 'cul-sec', 'leurre']);
  });

  it('Recompter (Dernier mot) : après 3 autres cartes, ±1 à un dé', () => {
    let { s, L, O } = setup();
    const r = give(s, L, 'recompter');
    for (let i = 0; i < 3; i++) s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, roll(), [5, 2, 1]);
    s = act(s, L, stop);
    s = act(s, O, roll(), [6, 6, 6]);
    expect(s.phase).toBe('lastword');
    expect(waitingFor(s)).toEqual([L]); // le perdant parle en premier
    s = act(s, L, play(r, { die: 0, delta: -1 }));
    expect(P(s, L).tokens).toBe(3); // 4-2-1 : il donne 8
  });

  it('Domino : l’adversaire perd toutes ses Tournées', () => {
    let { s, L, O } = setup();
    P(s, O).tournees = 5;
    s = act(s, L, play(give(s, L, 'domino'), { target: O }));
    expect(P(s, O).tournees).toBe(0);
  });

  it('Réaction en chaîne : chaîne LIFO, et retour en main dès la 3e carte', () => {
    let { s, L, O } = setup();
    const rL = give(s, L, 'reaction-chaine');
    P(s, L).tournees = 6;
    s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, play(give(s, L, 'coup-coude')));
    const rO = give(s, O, 'reaction-chaine');
    s = act(s, L, play(give(s, L, 'tournee-patron')));
    expect(waitingFor(s)).toEqual([O]);
    s = act(s, O, play(rO));
    expect(waitingFor(s)).toEqual([L]);
    s = act(s, L, play(rL)); // 4e carte de L : elle revient
    expect(s.stack).toHaveLength(0);
    // La Riposte de L s'applique d'abord (annule celle de O), puis la Tournée du patron se résout.
    expect(P(s, L).tournees).toBe(6 - 2 * cost('coup-coude') - cost('tournee-patron') - cost('reaction-chaine') + 2);
    expect(P(s, L).hand.some((k) => k.uid === rL)).toBe(true);
    expect(P(s, O).discard.some((k) => k.uid === rO)).toBe(true);
  });

  it('Le bon numéro : un dé sur la face de votre choix', () => {
    let { s, L } = setup();
    s = act(s, L, roll(), [6, 6, 6]);
    s = act(s, L, play(give(s, L, 'bon-numero'), { die: 1, face: 1 }));
    expect(P(s, L).r.dice).toEqual([6, 1, 6]);
    expect(P(s, L).tournees).toBe(6 - cost('bon-numero'));
  });

  it('Le grand enchaînement : rejoue gratuitement le dernier Coup', () => {
    let { s, L } = setup();
    P(s, L).tournees = 6;
    s = act(s, L, roll(), [3, 2, 1]);
    s = act(s, L, play(give(s, L, 'coup-pouce'), { die: 1, delta: 1 }));
    expect(P(s, L).r.dice).toEqual([3, 3, 1]);
    const g = give(s, L, 'grand-enchainement');
    s = act(s, L, play(g, { die: 0, delta: 1 }));
    expect(P(s, L).r.dice).toEqual([4, 3, 1]);
    expect(P(s, L).tournees).toBe(6 - cost('coup-pouce') - cost('grand-enchainement'));
  });

  it('chaque carte du catalogue a son test', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(CARDS).toHaveLength(34);
    for (const c of CARDS) expect(src, c.id).toContain(`'${c.id}'`);
  });
});

describe('Coups Fourrés : information partielle et événements', () => {
  it('viewFor ne montre ni la main, ni les pièges, ni le deck, ni le hasard de l’adversaire', () => {
    const decks = STARTER_DECKS.map((d) => Object.entries(d.cards).flatMap(([id, n]) => Array(n).fill(id) as string[]));
    let s = newGame({}, [{ id: 'a', deck: decks[0] }, { id: 'b', deck: decks[1] }], 11);
    s = act(s, 'a', { type: 'mulligan', cards: [] });
    s = act(s, 'b', { type: 'mulligan', cards: [] });
    const t = trap(s, 'b', 'a', 'faux-421');
    const v = viewFor(s, 'a');
    const json = JSON.stringify(v);
    const b = v.players.find((p) => p.id === 'b')!;
    expect(b.hand).toBeUndefined();
    expect(b.handCount).toBe(P(s, 'b').hand.length);
    expect(b.deckCount).toBe(P(s, 'b').deck.length);
    expect(b.families).toEqual(['ivresse', 'pieges']);
    expect(v.traps).toEqual([{ uid: t, owner: 'b', target: 'a', posedRound: s.round, id: null }]);
    for (const k of [...P(s, 'b').hand, ...P(s, 'b').deck]) expect(json).not.toContain(`"${k.uid}"`);
    expect(json).not.toContain('"rng"');
    expect(json).not.toContain('"deck"');
    expect(viewFor(s, 'b').players.find((p) => p.id === 'b')!.hand).toHaveLength(P(s, 'b').hand.length);
    expect(viewFor(s, 'b').traps[0].id).toBe('faux-421');
  });

  it('un piège posé reste caché aux autres pendant la pose', () => {
    let { s, L, O } = setup();
    const r = give(s, O, 'reaction-chaine');
    const u = give(s, L, 'faux-421');
    s = act(s, L, play(u, { target: O }));
    const vo = viewFor(s, O);
    expect(vo.stack[0]).toMatchObject({ kind: 'card', cardId: null, type: 'piege' });
    const evO = eventsFor(lastEvents, O);
    expect(JSON.stringify(evO)).not.toContain('Faux');
    expect(eventsFor(lastEvents, L).some((e) => e.text.includes('Faux 4-2-1'))).toBe(true);
    s = act(s, O, pass);
    expect(viewFor(s, O).traps[0].id).toBeNull();
    void r;
  });

  it('les cartes piochées ne sont visibles que de leur propriétaire', () => {
    let { s, L, O } = setup();
    s = act(s, L, play(give(s, L, 'coup-coude')));
    const forO = eventsFor(lastEvents, O);
    const forL = eventsFor(lastEvents, L);
    expect(forO.some((e) => e.kind === 'pioche-privee')).toBe(false);
    expect(forL.some((e) => e.kind === 'pioche-privee' && e.card === 'domino')).toBe(true);
    expect(forL.some((e) => e.text === 'Vous jouez Coup de coude.')).toBe(true);
  });
});

describe('Coups Fourrés : partie libre à 3 ou 4', () => {
  it('à 3 : seul le plus mauvais reçoit, du meilleur', () => {
    let { s } = setup(3, 2);
    const [a, b, c] = s.order;
    expect(P(s, a).tokens).toBe(9);
    for (const id of [a, b, c]) P(s, id).tokens = 7;
    s = act(s, a, roll(), [6, 6, 6]); s = act(s, a, stop);
    s = act(s, b, roll(), [6, 3, 2]);
    s = act(s, c, roll(), [5, 3, 2]);
    expect(P(s, a).tokens).toBe(1);
    expect(P(s, b).tokens).toBe(7);
    expect(P(s, c).tokens).toBe(13);
    expect(s.order[0]).toBe(c);
  });

  it('à 4 : piège posé sur un joueur précis (visible de tous), sorties et classement', () => {
    let { s } = setup(4, 7);
    const [a, b, c, d] = s.order;
    const u = give(s, a, 'faux-421');
    const opts = legalActions(s, a).filter((x) => x.type === 'play' && x.card === u);
    expect(opts.map((x) => (x as { target: string }).target).sort()).toEqual([b, c, d].sort());
    s = act(s, a, play(u, { target: c }));
    expect(viewFor(s, d).traps[0]).toMatchObject({ owner: a, target: c, id: null });
    P(s, a).tokens = 2;
    s = act(s, a, roll(), [6, 6, 6]); s = act(s, a, stop);
    s = act(s, b, roll(), [6, 3, 2]);
    s = act(s, c, roll(), [5, 3, 2]);
    s = act(s, d, roll(), [6, 4, 2]);
    expect(P(s, a).out).toBe(true);
    expect(P(s, a).place).toBe(1);
    // 0.39 : à 3 ou 4 aussi, la partie s'arrête au premier déchargé ; les autres sont classés par jetons.
    expect(s.phase).toBe('over');
    expect(s.ranking[0]).toBe(a);
    expect(s.ranking).toHaveLength(4);
    expect(s.traps).toHaveLength(0); // les pièges d'un joueur sorti quittent la table
  });

  it('égalité pour la meilleure combinaison : personne ne donne', () => {
    let { s } = setup(3, 2);
    const [a, b, c] = s.order;
    s = act(s, a, roll(), [6, 6, 6]); s = act(s, a, stop);
    s = act(s, b, roll(), [6, 6, 6]);
    s = act(s, c, roll(), [5, 3, 2]);
    expect([a, b, c].map((id) => P(s, id).tokens)).toEqual([9, 9, 9]);
  });
});

// ---------------------------------------------------------------------------------------------
// Parties complètes entre ordinateurs

function randomDeck(r: () => number): string[] {
  const d: string[] = [];
  while (d.length < 20) {
    const c = CARDS[Math.floor(r() * CARDS.length)];
    if (d.filter((x) => x === c.id).length < (c.rarity === 'legendaire' ? 1 : 2)) d.push(c.id);
  }
  return d;
}

function aiGame(seed: number, n: number, levels: CfLevel[], roundTrip = false): CfState {
  const r = mulberry32(seed);
  let s = newGame({}, Array.from({ length: n }, (_, i) => ({ id: `p${i}`, deck: randomDeck(r) })), seed);
  const rng = mulberry32(seed + 1);
  for (let step = 0; s.phase !== 'over'; step++) {
    if (step > 20000) throw new Error('partie bloquée');
    const pid = waitingFor(s)[0];
    const legal = legalActions(s, pid);
    expect(legal.length).toBeGreaterThan(0);
    const a = cfDecide(viewFor(s, pid), legal, levels[Number(pid.slice(1))], rng);
    const res = apply(s, pid, a);
    expect(res.ok).toBe(true);
    s = roundTrip ? JSON.parse(JSON.stringify(res.state)) : res.state;
  }
  return s;
}

describe('Coups Fourrés : parties entre ordinateurs', () => {
  it('déterminisme : même graine, même partie ; l’état survit à JSON', () => {
    const a = aiGame(42, 2, ['fine-fouine', 'habitue']);
    const b = aiGame(42, 2, ['fine-fouine', 'habitue'], true);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const c = aiGame(43, 2, ['fine-fouine', 'habitue']);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('des centaines de parties à 2, 3 et 4, tous niveaux : actions toujours légales, aucune partie bloquée', () => {
    const levels: CfLevel[] = ['debutant', 'habitue', 'fine-fouine'];
    let rounds = 0;
    for (let g = 0; g < 240; g++) {
      const n = 2 + (g % 3);
      const s = aiGame(1000 + g, n, Array.from({ length: n }, (_, i) => levels[(g + i) % 3]));
      expect(s.phase).toBe('over');
      expect(s.ranking).toHaveLength(n);
      expect(s.round).toBeLessThanOrEqual(s.rules.maxRounds);
      rounds += s.round;
    }
    expect(rounds / 240).toBeGreaterThan(2);
  }, 120000);

  it('l’ordinateur ne dépend pas de l’information cachée (main et deck adverses)', () => {
    for (let g = 0; g < 30; g++) {
      const r = mulberry32(g);
      let s = newGame({}, [{ id: 'p0', deck: randomDeck(r) }, { id: 'p1', deck: randomDeck(r) }], g);
      const rng = mulberry32(g);
      for (let step = 0; step < 400 && s.phase !== 'over'; step++) {
        const pid = waitingFor(s)[0];
        const other = pid === 'p0' ? 'p1' : 'p0';
        const legal = legalActions(s, pid);
        const seed = Math.floor(rng() * 1e9);
        const a = cfDecide(viewFor(s, pid), legal, 'fine-fouine', mulberry32(seed));
        // Même situation, mais main et deck adverses remplacés : la décision doit être identique.
        const alt: CfState = JSON.parse(JSON.stringify(s));
        const o = P(alt, other);
        o.hand = o.hand.map((k) => ({ ...k, id: 'leurre' }));
        o.deck = o.deck.map((k) => ({ ...k, id: 'patron' })).reverse();
        for (const t of alt.traps) if (t.owner === other && !t.seenBy.includes(pid)) t.id = 'leurre';
        const b = cfDecide(viewFor(alt, pid), legal, 'fine-fouine', mulberry32(seed));
        expect(b).toEqual(a);
        s = apply(s, pid, a).state;
      }
    }
  }, 60000);

  it('apply refuse une action illégale sans modifier l’état', () => {
    const { s, L, O } = setup();
    const before = JSON.stringify(s);
    expect(apply(s, O, roll()).ok).toBe(false);
    expect(apply(s, L, stop).ok).toBe(false);
    expect(apply(s, L, play('inexistante')).ok).toBe(false);
    expect(apply(s, L, { type: 'roll', keep: [true, true, true] }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});
