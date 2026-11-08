/** Coups Fourrés : moteur de règles (chaque carte, timing, information partielle, fin de partie, IA). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  apply, defaultAction, eventsFor, legalActions, newGame, throwLimit, viewFor, waitingFor,
  type CfAction, type CfEvent, type CfState,
  FERMETURE_TOURNEES, TOURNEE_PATRON_GAIN, BELOTE_BONUS, LOT_DRAW, PLAT_TOURNEES,
} from '../shared/cards/engine';
import { cfDecide, type CfLevel } from '../shared/cards/ai';
import { CARDS, CF_RULES, STARTER_DECKS, cardDef } from '../shared/cards/catalog';
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
    for (const p of s.players) { expect(p.hand).toHaveLength(6); expect(p.tournees).toBe(CF_RULES.tourneesPerRound); expect(p.tokens).toBe(11); }
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

describe('Coups Fourrés : les cartes', () => {
  it('Le Patron : +1 Tournée par manche, une carte après une défaite, Habitués protégés', () => {
    let { s, L, O } = setup();
    const u = give(s, L, 'patron');
    give(s, O, 'reaction-chaine');
    s = act(s, L, play(u));
    expect(waitingFor(s)).toEqual([O]); // le Patron lui-même peut être annulé pendant qu'on le pose
    s = act(s, O, pass);
    s = act(s, L, play(give(s, L, 'josiane')));
    // Le Patron protège ses Habitués d'une carte qui coûte 2 ou moins : selon le coût de Réaction en chaîne,
    // l'adversaire peut répondre ou non (0.41 : elle coûte 2, Josiane est protégée).
    if (cost('reaction-chaine') <= 2) expect(waitingFor(s)).not.toContain(O);
    else { expect(waitingFor(s)).toEqual([O]); s = act(s, O, pass); }
    expect(P(s, L).habitues.map((h) => h.id)).toEqual(['patron', 'josiane']);
    P(s, L).tournees = 0;
    const hand = P(s, L).hand.length;
    s = quickRound(s, L, O, [6, 3, 2], [6, 6, 6]); // L perd
    expect(P(s, L).tournees).toBe(CF_RULES.tourneesPerRound + CF_RULES.tourneesLoserBonus + 1); // service + perdant + Patron
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

  it('Le Pilier de comptoir : 2 jetons de moins, plusieurs Piliers ne se cumulent pas', () => {
    let { s, L, O } = setup();
    hab(s, O, 'pilier'); hab(s, O, 'pilier');
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(P(s, O).tokens).toBe(15);
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

  it('Tournée du patron : +3 Tournées et 1 carte', () => {
    let { s, L } = setup();
    P(s, L).tournees = 2;
    s = act(s, L, play(give(s, L, 'tournee-patron')));
    expect(P(s, L).tournees).toBe(Math.min(6, 2 - cost('tournee-patron') + TOURNEE_PATRON_GAIN));
    expect(P(s, L).hand).toHaveLength(1);
  });

  it('Ticket de caisse : annule un Coup qui coûte 4 ou moins', () => {
    let { s, L, O } = setup();
    const t = give(s, O, 'ticket-caisse');
    s = act(s, L, play(give(s, L, 'cul-sec')));
    expect(waitingFor(s)).toEqual([O]);
    expect(s.respond).toEqual([O]);
    s = act(s, O, play(t));
    expect(P(s, L).r.bonusThrows).toBe(0);
    expect(P(s, L).discard.some((k) => k.id === 'cul-sec')).toBe(true);
    // un Coup à 5 ne peut pas être annulé
    give(s, O, 'ticket-caisse');
    s = act(s, L, roll(), [3, 2, 1]);
    expect(cost('bon-numero')).toBeGreaterThan(4);
    P(s, L).tournees = CF_RULES.tourneesMax;
    s = act(s, L, play(give(s, L, 'bon-numero'), { die: 0, face: 4 }));
    expect(waitingFor(s)).toEqual([L]);
    expect(P(s, L).r.dice).toEqual([4, 2, 1]);
  });

  it('Fermeture ! : un Habitué adverse rentre chez lui ; sans Habitué, on fait la caisse (+2 Tournées)', () => {
    let { s, L, O } = setup();
    const h = hab(s, O, 'josiane');
    s = act(s, L, play(give(s, L, 'fermeture'), { habitue: h }));
    expect(P(s, O).habitues).toHaveLength(0);
    expect(P(s, O).discard.some((k) => k.uid === h)).toBe(true);
    const t = setup();
    const f = give(t.s, t.L, 'fermeture');
    const before = P(t.s, t.L).hand.length;
    P(t.s, t.L).tournees = 3;
    expect(legalActions(t.s, t.L).filter((a) => a.type === 'play' && a.card === f)).toEqual([{ type: 'play', card: f }]);
    const s2 = act(t.s, t.L, play(f));
    expect(P(s2, t.L).hand.length).toBe(before - 1);
    expect(P(s2, t.L).tournees).toBe(3 - cost('fermeture') + FERMETURE_TOURNEES);
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

  it('Leurre : défaussé par une Fouine, son propriétaire gagne 1 Tournée et pioche 1 carte', () => {
    let { s, L, O } = setup();
    const t = trap(s, O, L, 'leurre');
    P(s, O).tournees = 2;
    s = act(s, L, play(give(s, L, 'fouine'), { trap: t }));
    expect(P(s, O).hand).toHaveLength(1);
    expect(P(s, O).tournees).toBe(3);
    expect(P(s, L).hand).toHaveLength(1); // la Fouine pioche aussi
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

  it('Main dans le sac : un Coup qui coûte 1 ou plus est annulé (pas les gratuits)', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'main-sac');
    s = act(s, L, play(give(s, L, 'coup-coude')));
    expect(P(s, L).hand).toHaveLength(1);
    expect(s.traps).toHaveLength(1);
    s = act(s, L, roll(), [3, 2, 1]);
    s = act(s, L, play(give(s, L, 'tete-tourne'), { die: 0 }));
    expect(P(s, L).r.dice).toEqual([3, 2, 1]);
    expect(P(s, L).tournees).toBe(6 - cost('coup-coude') - cost('tete-tourne'));
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

  it('Ardoise piégée : 3 Tournées de plus pour jouer un Coup, sinon il est annulé', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'ardoise-piegee');
    P(s, L).tournees = 3 + cost('cul-sec');
    s = act(s, L, play(give(s, L, 'cul-sec')));
    expect(P(s, L).tournees).toBe(0);
    expect(P(s, L).r.bonusThrows).toBe(1);
    const t = setup(2, 8);
    trap(t.s, t.O, t.L, 'ardoise-piegee');
    P(t.s, t.L).tournees = 2 + cost('cul-sec');
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
    s = quickRound(s, L, O, [4, 2, 1], [6, 3, 2]);
    expect(P(s, L).tokens).toBe(19);
    expect(P(s, O).tokens).toBe(11);
    // en dessous de 8 jetons, rien (0.40 : seuil relevé de 6 à 8)
    const t = setup(2, 3);
    trap(t.s, t.O, t.L, 'retournement-veste');
    s = quickRound(t.s, t.L, t.O, [6, 6, 6], [6, 3, 2]);
    expect(P(s, t.O).tokens).toBe(17);
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
    expect(P(s, L).tournees).toBe(6 - 2 * cost('coup-coude') - cost('tournee-patron') - cost('reaction-chaine') + TOURNEE_PATRON_GAIN);
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

  it('Le Beau-frère : vos Coups coûtent 1 Tournée de moins (pas les autres cartes)', () => {
    let { s, L, O } = setup();
    s = act(s, L, play(give(s, L, 'beau-frere')));
    expect(P(s, L).habitues.map((h) => h.id)).toEqual(['beau-frere']);
    expect(P(s, L).tournees).toBe(Math.min(6, 6 - cost('beau-frere') + 1)); // il arrive avec une Tournée
    const t0 = P(s, L).tournees;
    s = act(s, L, roll(), [6, 3, 2]);
    s = act(s, L, play(give(s, L, 'coup-pouce'), { die: 1, delta: 1 }));
    expect(P(s, L).tournees).toBe(t0 - (cost('coup-pouce') - 1));
    P(s, L).tournees = 0;
    const oneCost = ['verre-offert', 'cul-sec', 'domino', 'fermeture'].find((id) => cost(id) === 1)!;
    const d = give(s, L, oneCost); // 1 Tournée imprimée : gratuite avec le Beau-frère
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === d)).toBe(true);
    const tr = give(s, L, 'mouchard'); // une carte gratuite reste jouable (rien à déduire)
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === tr)).toBe(true);
    expect(P(s, O).habitues).toHaveLength(0);
  });

  it('On efface tout (Dernier mot) : si vous perdez, vous ne recevez qu’un jeton', () => {
    let { s, L, O } = setup();
    const e = give(s, L, 'efface-tout');
    s = act(s, L, roll(), [6, 3, 2]);
    s = act(s, L, stop);
    s = act(s, O, roll(), [6, 6, 6]);
    expect(s.phase).toBe('lastword');
    s = act(s, L, play(e));
    expect(P(s, L).tokens).toBe(12);
    expect(P(s, O).tokens).toBe(10);
    expect(s.lastRound!.winner).toBe(O);
    expect(s.lastRound!.detail!.at(-1)).toEqual({ label: 'On efface tout', delta: -5 });
    expect(s.lastRound!.text).toContain('qu’un jeton');
    expect(s.order[0]).toBe(L); // il a quand même perdu : il mène
    // Joué par le gagnant : sans effet.
    const t = setup(2, 4);
    s = t.s;
    const e2 = give(s, t.L, 'efface-tout');
    s = act(s, t.L, roll(), [6, 6, 6]);
    s = act(s, t.L, stop);
    s = act(s, t.O, roll(), [6, 3, 2]);
    s = act(s, t.L, play(e2));
    expect(P(s, t.L).tokens).toBe(5); // il gagne : il donne ses 6 jetons comme d'habitude
  });

  it('Le verre offert : un seul lancer à son prochain tour (ce tour-ci, ou la manche suivante)', () => {
    let { s, L, O } = setup();
    s = act(s, L, play(give(s, L, 'verre-offert'), { target: O }));
    s = act(s, L, roll(), [6, 3, 2]);
    s = act(s, L, roll(), [6, 5, 4]);
    s = act(s, L, stop);
    expect(throwLimit(s, O)).toBe(1);
    expect(P(s, O).r.penaltyCard).toBe('verre-offert');
    // L a déjà joué : l'effet attend la manche suivante.
    s = act(s, O, play(give(s, O, 'verre-offert'), { target: L }));
    expect(P(s, L).penaltyNext).toBe(1);
    expect(viewFor(s, O).players.find((p) => p.id === L)!.penaltyNextCard).toBe('verre-offert');
    s = act(s, O, roll(), [6, 6, 6]); // un seul lancer : fin de tour automatique
    expect(s.round).toBe(2);
    expect(s.order[0]).toBe(L);
    expect(throwLimit(s, L)).toBe(1);
    expect(P(s, L).r.penaltyCard).toBe('verre-offert');
  });

  it('Trinquer (Dernier mot) : un dé de chaque côté, pris au hasard, change de camp', () => {
    for (let seed = 1; seed <= 6; seed++) {
      let { s, L, O } = setup(2, seed);
      const t = give(s, L, 'trinquer');
      s = act(s, L, roll(), [6, 5, 3]);
      s = act(s, L, stop);
      s = act(s, O, roll(), [4, 2, 1]);
      expect(s.phase).toBe('lastword');
      expect(legalActions(s, L).filter((a) => a.type === 'play')).toEqual([{ type: 'play', card: t, target: O }]);
      s = act(s, L, play(t, { target: O }));
      const a = s.lastRound!.combos[L].dice, b = s.lastRound!.combos[O].dice;
      expect([...a, ...b].sort()).toEqual([1, 2, 3, 4, 5, 6]);
      expect(a.filter((x, i) => x !== [6, 5, 3][i])).toHaveLength(1);
      expect(b.filter((x, i) => x !== [4, 2, 1][i])).toHaveLength(1);
    }
  });

  it('Le Vide-poches : prend 1 Tournée à l’adversaire, qui défausse une carte de sa main au hasard', () => {
    let { s, L, O } = setup();
    const v = give(s, L, 'vide-poches');
    P(s, O).tournees = 0;
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === v)).toBe(false); // ni Tournée ni carte
    P(s, O).tournees = 2;
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === v)).toBe(true); // une Tournée à prendre suffit
    give(s, O, 'domino'); give(s, O, 'cul-sec'); give(s, O, 'leurre');
    P(s, L).tournees = 3;
    s = act(s, L, play(v, { target: O }));
    expect(P(s, O).tournees).toBe(1);
    expect(P(s, L).tournees).toBe(3 - cost('vide-poches') + 1);
    expect(P(s, O).hand).toHaveLength(2);
    expect(P(s, O).discard).toHaveLength(1);
    expect(['domino', 'cul-sec', 'leurre']).toContain(P(s, O).discard[0].id);
  });

  it('Le Mouchard : quand l’adversaire joue un Coup, son poseur gagne 1 Tournée et pioche 1 carte', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'mouchard');
    s = act(s, L, play(give(s, L, 'pilier'))); // un Habitué : rien
    expect(s.traps).toHaveLength(1);
    P(s, O).tournees = 2;
    s = act(s, L, play(give(s, L, 'coup-coude')));
    expect(s.traps).toHaveLength(0);
    expect(P(s, O).hand).toHaveLength(1);
    expect(P(s, O).tournees).toBe(3);
    expect(lastEvents.some((e) => e.kind === 'mouchard')).toBe(true);
    // Le Videur l'arrête comme les autres pièges.
    const t = setup(2, 3);
    s = t.s;
    trap(s, t.O, t.L, 'mouchard');
    hab(s, t.L, 'videur');
    s = act(s, t.L, play(give(s, t.L, 'coup-coude')));
    expect(P(s, t.O).hand).toHaveLength(0);
  });

  it('Tant qu’on y est : 2 Tournées, plus 1 par autre carte jouée dans la manche', () => {
    let { s, L } = setup();
    P(s, L).tournees = cost('coup-coude') + cost('fouine') + cost('tant-qu-on-y-est');
    s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, play(give(s, L, 'fouine')));
    s = act(s, L, play(give(s, L, 'tant-qu-on-y-est')));
    expect(P(s, L).tournees).toBe(4);
    s = act(s, L, play(give(s, L, 'tant-qu-on-y-est')));
    expect(P(s, L).tournees).toBe(6); // 5 de plus, plafonné à 6
  });

  it('La petite sœur : reprend le dernier Coup de la défausse (jamais une autre petite sœur)', () => {
    let { s, L } = setup();
    const ps = give(s, L, 'petite-soeur');
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === ps)).toBe(false); // défausse vide
    s = act(s, L, roll(), [6, 3, 2]);
    s = act(s, L, play(give(s, L, 'coup-pouce'), { die: 1, delta: 1 }));
    P(s, L).discard.push({ uid: 'x-pil', id: 'pilier' }); // un Habitué rentré chez lui : ignoré
    s = act(s, L, play(ps));
    expect(P(s, L).hand.map((k) => k.id)).toEqual(['coup-pouce']);
    expect(P(s, L).discard.map((k) => k.id)).toEqual(['pilier', 'petite-soeur']);
    const ps2 = give(s, L, 'petite-soeur');
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === ps2)).toBe(false);
  });

  it('chaque carte du catalogue a son test', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(CARDS).toHaveLength(90);
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

describe('Coups Fourrés : les 8 cartes de la 0.40', () => {
  it('Le Pourboire : donne 1 de ses jetons ; le dernier fait gagner la partie', () => {
    let { s, L, O } = setup();
    const t = P(s, L).tokens, u = P(s, O).tokens;
    s = act(s, L, play(give(s, L, 'pourboire'), { target: O }));
    expect(P(s, L).tokens).toBe(t - 1);
    expect(P(s, O).tokens).toBe(u + 1);
    P(s, L).tokens = 1;
    s = act(s, L, play(give(s, L, 'pourboire'), { target: O }));
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(L);
  });

  it('Le Coup de l’étrier (Dernier mot) : relance un de ses dés', () => {
    let { s, L, O } = setup();
    const c = give(s, L, 'coup-etrier');
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === c)).toBe(false); // pas pendant le tour
    s = act(s, L, roll(), [4, 2, 2]);
    s = act(s, L, stop);
    s = act(s, O, roll(), [6, 6, 6]);
    expect(s.phase).toBe('lastword');
    expect(legalActions(s, L).filter((a) => a.type === 'play').map((a) => (a as { die?: number }).die)).toEqual([0, 1, 2]);
    s = act(s, L, play(c, { die: 2 }), [1]);
    expect(s.lastRound!.combos[L].dice).toEqual([4, 2, 1]);
    expect(s.lastRound!.winner).toBe(L);
  });

  it('Le Fanfaron (Habitué) : quand il gagne, le perdant reçoit 1 jeton de plus', () => {
    let { s, L, O } = setup();
    hab(s, L, 'fanfaron');
    const before = P(s, O).tokens;
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(P(s, O).tokens).toBe(before + 6 + 1);
  });

  it('Le Verre de trop : au 2e lancer du tour, le joueur piégé reçoit 1 jeton', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'verre-de-trop');
    const before = P(s, L).tokens;
    s = act(s, L, roll(), [6, 5, 3]);
    expect(P(s, L).tokens).toBe(before);
    s = act(s, L, roll([true, true, false]), [2]);
    expect(P(s, L).tokens).toBe(before + 1);
    expect(s.traps).toHaveLength(0);
    expect(lastEvents.some((e) => e.kind === 'verre-de-trop')).toBe(true);
  });

  it('Le Courant d’air : l’Habitué installé rentre aussitôt chez lui (sauf avec le Patron)', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'courant-air');
    s = act(s, L, play(give(s, L, 'pilier')));
    expect(P(s, L).habitues).toHaveLength(0);
    expect(P(s, L).discard.map((k) => k.id)).toContain('pilier');
    expect(s.traps).toHaveLength(0);
    // Le Patron protège ses Habitués d'une carte qui coûte 2 ou moins.
    const t = setup(2, 4);
    s = t.s;
    trap(s, t.O, t.L, 'courant-air');
    hab(s, t.L, 'patron');
    s = act(s, t.L, play(give(s, t.L, 'pilier')));
    expect(P(s, t.L).habitues.map((h) => h.id)).toContain('pilier');
    expect(s.traps).toHaveLength(1);
  });

  it('Le Pot aux roses (Riposte) : annule un Coup ou un Dernier mot qui coûte 2 ou plus', () => {
    let { s, L, O } = setup();
    const p = give(s, O, 'pot-aux-roses');
    s = act(s, L, play(give(s, L, 'coup-coude'))); // coûte 0 : pas de fenêtre pour le Pot aux roses
    expect(waitingFor(s)).toEqual([L]);
    s = act(s, L, roll(), [6, 5, 3]);
    s = act(s, L, play(give(s, L, 'tete-tourne'), { die: 2 }));
    expect(legalActions(s, O).some((a) => a.type === 'play' && a.card === p)).toBe(true);
    s = act(s, O, play(p));
    expect(P(s, L).r.dice).toEqual([6, 5, 3]);
    expect(lastEvents.some((e) => e.kind === 'annule')).toBe(true);
  });

  it('Le Complice (Habitué) : quand un de vos pièges se déclenche, +1 Tournée et 1 carte', () => {
    let { s, L, O } = setup();
    hab(s, O, 'complice');
    P(s, O).tournees = 2;
    trap(s, O, L, 'mouchard');
    s = act(s, L, play(give(s, L, 'coup-coude')));
    expect(P(s, O).tournees).toBe(4); // +1 (Mouchard) +1 (Complice)
    expect(P(s, O).hand).toHaveLength(2); // 1 (Mouchard) + 1 (Complice)
    expect(lastEvents.some((e) => e.kind === 'complice')).toBe(true);
  });

  it('L’Engrenage : la 2e carte de la manche du joueur piégé est annulée', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'engrenage');
    s = act(s, L, play(give(s, L, 'coup-coude')));
    expect(s.traps).toHaveLength(1);
    const before = P(s, L).tournees;
    s = act(s, L, play(give(s, L, 'tournee-patron')));
    expect(P(s, L).tournees).toBe(before - cost('tournee-patron')); // payée, mais annulée
    expect(s.traps).toHaveLength(0);
    expect(lastEvents.some((e) => e.kind === 'engrenage')).toBe(true);
    expect(P(s, L).discard.map((k) => k.id)).toContain('tournee-patron');
  });
});

describe('Coups Fourrés 0.46 : limite des pièges et correctifs', () => {
  it('3 pièges au plus DEVANT un même joueur (tous poseurs confondus), et 3 posés au plus par joueur', () => {
    const { s } = setup(4, 7);
    const [a, b, c, d] = s.order;
    trap(s, b, a, 'faux-421'); trap(s, b, a, 'croche-patte'); trap(s, c, a, 'mouchard');
    P(s, d).tournees = 6;
    s.turn = 3; // au tour de d
    const u = give(s, d, 'gueule-bois');
    const targets = legalActions(s, d).filter((x) => x.type === 'play' && x.card === u).map((x) => (x as { target: string }).target).sort();
    expect(targets).toEqual([b, c].sort()); // plus de place devant a
    trap(s, d, b, 'leurre'); trap(s, d, c, 'leurre'); trap(s, d, b, 'leurre');
    expect(legalActions(s, d).some((x) => x.type === 'play' && x.card === u)).toBe(false); // d a déjà 3 pièges posés
  });

  it('la Fouine ne déclenche pas le Mouchard ni l’Ardoise piégée : elle les retire', () => {
    let { s, L, O } = setup();
    const m = trap(s, O, L, 'mouchard');
    trap(s, O, L, 'ardoise-piegee');
    const oT = P(s, O).tournees = 2;
    s = act(s, L, play(give(s, L, 'fouine'), { trap: m }));
    expect(P(s, O).tournees).toBe(oT);
    expect(s.traps.map((t) => t.id)).toEqual(['ardoise-piegee']);
    expect(P(s, L).tournees).toBe(6 - cost('fouine'));
    expect(lastEvents.some((e) => e.kind === 'mouchard' || e.kind === 'ardoise-piegee')).toBe(false);
  });

  it('Fermeture ! contre des Habitués protégés par le Patron : injouable (ni « sans Habitué », ni Tournée perdue), Le grand enchaînement aussi', () => {
    const { s, L, O } = setup();
    hab(s, O, 'patron'); hab(s, O, 'josiane');
    const f = give(s, L, 'fermeture');
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === f)).toBe(false);
    P(s, L).r.lastCoup = 'fermeture';
    const g = give(s, L, 'grand-enchainement');
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === g)).toBe(false);
  });

  it('Le coup de la nénette ne se déclenche pas sur une égalité en tête à 3 joueurs', () => {
    let { s } = setup(3, 5);
    const [a, b, c] = s.order;
    trap(s, c, a, 'coup-nenette');
    s = act(s, a, roll(), [6, 3, 2]); s = act(s, a, stop);
    s = act(s, b, roll(), [6, 3, 2]);
    s = act(s, c, roll(), [2, 2, 1]);
    expect(lastEvents.some((e) => e.kind === 'coup-nenette')).toBe(false);
    expect(s.traps.map((t) => t.id)).toEqual(['coup-nenette']);
    expect(s.lastRound?.winner).toBeNull();
  });

  it('Les yeux qui piquent annulent Le grand enchaînement qui rejoue un Coup sur les dés', () => {
    let { s, L, O } = setup();
    s = act(s, L, roll(), [6, 3, 2]);
    s = act(s, L, play(give(s, L, 'tete-tourne'), { die: 0 }));
    expect(P(s, L).r.dice).toEqual([1, 3, 2]);
    const y = give(s, O, 'yeux-piquent');
    s = act(s, L, play(give(s, L, 'grand-enchainement'), { die: 1 }));
    expect(waitingFor(s)).toEqual([O]);
    s = act(s, O, play(y));
    expect(P(s, L).r.dice).toEqual([1, 3, 2]);
  });
});

describe('Coups Fourrés : les 40 cartes de la 0.46', () => {
  // --- Les Habitués
  it('Le Joueur de belote : les brelans valent 3 de plus', () => {
    let { s, L, O } = setup();
    hab(s, L, 'joueur-belote');
    s = quickRound(s, L, O, [5, 5, 5], [6, 3, 2]);
    expect(P(s, O).tokens).toBe(11 + 5 + BELOTE_BONUS);
  });
  it('Le Garde champêtre : ni Coup ni piège adverse ne touche ses dés', () => {
    let { s, L, O } = setup();
    hab(s, L, 'garde-champetre');
    trap(s, O, L, 'croche-patte');
    s = act(s, L, roll(), [4, 2, 1]); s = act(s, L, stop);
    expect(P(s, L).r.dice).toEqual([4, 2, 1]);
    expect(s.traps).toHaveLength(1);
    const d = give(s, O, 'de-sous-table');
    const v = give(s, O, 'verres-echanges');
    s = act(s, O, roll(), [6, 3, 2]);
    expect(legalActions(s, O).filter((a) => a.type === 'play' && a.card === d).every((a) => (a as { target: string }).target === O)).toBe(true);
    expect(legalActions(s, O).some((a) => a.type === 'play' && a.card === v)).toBe(false);
  });
  it('Le Doyen : +1 Tournée, 1 carte, et les autres Habitués restent 1 manche de plus', () => {
    let { s, L } = setup();
    P(s, L).tournees = 3;
    hab(s, L, 'pilier'); P(s, L).habitues[0].rounds = 2;
    s = act(s, L, play(give(s, L, 'doyen')));
    expect(P(s, L).habitues.map((h) => [h.id, h.rounds])).toEqual([['pilier', 3], ['doyen', 3]]);
    expect(P(s, L).hand).toHaveLength(1);
    expect(P(s, L).tournees).toBe(3 - cost('doyen') + 1);
  });
  it('Le Café serré : 1 carte, +1 Tournée avec un Habitué en jeu', () => {
    let { s, L } = setup();
    P(s, L).tournees = 3;
    s = act(s, L, play(give(s, L, 'cafe-serre')));
    expect([P(s, L).tournees, P(s, L).hand.length]).toEqual([3 - cost('cafe-serre'), 1]);
    hab(s, L, 'pilier');
    s = act(s, L, play(give(s, L, 'cafe-serre')));
    expect(P(s, L).tournees).toBe(3 - 2 * cost('cafe-serre') + 1);
  });
  it('Le Plat du jour : 2 Tournées', () => {
    let { s, L } = setup();
    P(s, L).tournees = 2;
    s = act(s, L, play(give(s, L, 'plat-du-jour')));
    expect(P(s, L).tournees).toBe(2 - cost('plat-du-jour') + PLAT_TOURNEES);
  });
  it('Table réservée (Riposte) : annule un piège posé devant soi', () => {
    let { s, L, O } = setup();
    const t = give(s, O, 'table-reservee');
    s = act(s, L, play(give(s, L, 'croche-patte'), { target: O }));
    expect(waitingFor(s)).toEqual([O]);
    s = act(s, O, play(t));
    expect(s.traps).toHaveLength(0);
    expect(P(s, L).discard.map((k) => k.id)).toContain('croche-patte');
  });
  it('L’Addition (Dernier mot) : la combinaison gagnante vaut au moins 3', () => {
    let { s, L, O } = setup();
    const a = give(s, L, 'addition');
    s = act(s, L, roll(), [6, 3, 2]); s = act(s, L, stop);
    s = act(s, O, roll(), [5, 3, 2]);
    expect(waitingFor(s)).toEqual([L]);
    s = act(s, L, play(a));
    expect(P(s, O).tokens).toBe(14);
  });
  it('Le Pique-assiette : les Tournées gagnées grâce à une carte vont à son poseur', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'pique-assiette');
    P(s, O).tournees = 0;
    s = act(s, L, play(give(s, L, 'tournee-patron')));
    expect(P(s, L).tournees).toBe(6 - cost('tournee-patron'));
    expect(P(s, O).tournees).toBe(TOURNEE_PATRON_GAIN);
    expect(s.traps).toHaveLength(0);
  });
  it('Le Débauchage : un Habitué adverse passe chez soi, puis rentre chez son joueur d’origine', () => {
    let { s, L, O } = setup();
    const h = hab(s, O, 'josiane'); P(s, O).habitues[0].rounds = 1;
    s = act(s, L, play(give(s, L, 'debauchage'), { habitue: h }));
    expect(P(s, L).habitues.map((x) => x.id)).toEqual(['josiane']);
    expect(P(s, O).habitues).toHaveLength(0);
    s = quickRound(s, L, O, [6, 3, 2], [5, 3, 2]);
    expect(P(s, L).habitues).toHaveLength(0);
    expect(P(s, O).discard.some((k) => k.uid === h)).toBe(true);
  });
  it('Les Retrouvailles : le dernier Habitué de la défausse revient pour 3 manches, et 1 carte', () => {
    let { s, L } = setup();
    P(s, L).discard.push({ uid: 'x1', id: 'pilier' }, { uid: 'x2', id: 'coup-coude' });
    s = act(s, L, play(give(s, L, 'retrouvailles')));
    expect(P(s, L).habitues.map((h) => [h.id, h.rounds])).toEqual([['pilier', 3]]);
    expect(P(s, L).hand).toHaveLength(1);
  });
  // --- L'Ivresse
  it('Un petit dernier : relance un de ses dés sans utiliser de lancer', () => {
    let { s, L } = setup();
    s = act(s, L, roll(), [6, 3, 2]);
    s = act(s, L, play(give(s, L, 'petit-dernier'), { die: 0 }), [4]);
    expect(P(s, L).r.dice).toEqual([4, 3, 2]);
    expect(P(s, L).r.throwsUsed).toBe(1);
  });
  it('Le Hoquet : en relançant, un des dés gardés est relancé aussi', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'hoquet');
    s = act(s, L, roll(), [4, 2, 6]);
    s = act(s, L, roll([true, true, false]), [5, 5]);
    const d = P(s, L).r.dice;
    expect(d[2]).toBe(5);
    expect([d[0], d[1]].filter((x) => x === 5)).toHaveLength(1);
    expect(lastEvents.some((e) => e.kind === 'hoquet')).toBe(true);
  });
  it('La Der des ders : le perdant reçoit 1 jeton de plus', () => {
    let { s, L, O } = setup();
    trap(s, L, O, 'der-des-ders');
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(P(s, O).tokens).toBe(18);
  });
  it('À votre santé ! (Dernier mot) : s’il perd, le gagnant reçoit aussi 1 jeton', () => {
    let { s, L, O } = setup();
    const a = give(s, O, 'sante');
    s = act(s, L, roll(), [6, 6, 6]); s = act(s, L, stop);
    s = act(s, O, roll(), [6, 3, 2]);
    expect(waitingFor(s)).toEqual([O]);
    s = act(s, O, play(a));
    expect([P(s, L).tokens, P(s, O).tokens]).toEqual([11 - 6 + 1, 17]);
  });
  it('Le Petit Calva (Dernier mot) : retourne un de ses dés', () => {
    let { s, L, O } = setup();
    const c = give(s, L, 'calva');
    s = act(s, L, roll(), [4, 2, 6]); s = act(s, L, stop);
    s = act(s, O, roll(), [5, 5, 5]);
    s = act(s, L, play(c, { die: 2 }));
    expect(P(s, O).tokens).toBe(19);
  });
  it('Le Miroir du bar : un dé prend la face d’un autre de ses dés', () => {
    let { s, L } = setup();
    s = act(s, L, roll(), [1, 1, 4]);
    s = act(s, L, play(give(s, L, 'miroir'), { die: 2, face: 1 }));
    expect(P(s, L).r.dice).toEqual([1, 1, 1]);
  });
  it('Le Pochtron : un lancer de plus à chaque tour', () => {
    const { s, L } = setup();
    hab(s, L, 'pochtron');
    expect(throwLimit(s, L)).toBe(CF_RULES.maxThrows + 1);
  });
  it('À la vôtre ! (Riposte) : annule une Riposte adverse', () => {
    let { s, L, O } = setup();
    give(s, O, 'ticket-caisse');
    const a = give(s, L, 'a-la-votre');
    s = act(s, L, play(give(s, L, 'cul-sec')));
    s = act(s, O, play(P(s, O).hand.find((k) => k.id === 'ticket-caisse')!.uid));
    expect(waitingFor(s)).toEqual([L]);
    s = act(s, L, play(a));
    expect(P(s, L).r.bonusThrows).toBe(1);
  });
  it('Les Verres échangés : échange ses trois dés contre ceux d’un adversaire qui a fini', () => {
    let { s, L, O } = setup();
    s = act(s, L, roll(), [6, 3, 2]); s = act(s, L, stop);
    const v = give(s, O, 'verres-echanges');
    s = act(s, O, roll(), [3, 2, 2]);
    s = act(s, O, play(v, { target: L }));
    expect([s.lastRound!.combos[O].dice, s.lastRound!.combos[L].dice]).toEqual([[6, 3, 2], [3, 2, 2]]);
  });
  it('La Fée verte : un dé relancé jusqu’à 3 fois vers la face choisie', () => {
    let { s, L } = setup();
    s = act(s, L, roll(), [6, 3, 2]);
    s = act(s, L, play(give(s, L, 'fee-verte'), { die: 0, face: 4 }), [5, 4]);
    expect(P(s, L).r.dice).toEqual([4, 3, 2]);
    s = act(s, L, play(give(s, L, 'fee-verte'), { die: 1, face: 1 }), [5, 5, 6]);
    expect(P(s, L).r.dice).toEqual([4, 6, 2]); // 3 essais ratés : le dernier reste
  });
  // --- Les Pièges
  it('Le Mot de trop : le Dernier mot adverse est annulé', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'mot-de-trop');
    const n = give(s, L, 'note-salee');
    s = act(s, L, roll(), [6, 6, 6]); s = act(s, L, stop);
    s = act(s, O, roll(), [6, 3, 2]);
    s = act(s, L, play(n));
    expect(P(s, O).tokens).toBe(17);
    expect(s.traps).toHaveLength(0);
  });
  it('La Peau de banane : sur une combinaison qui vaut 4 ou plus, un dé est relancé', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'peau-banane');
    s = act(s, L, roll(), [6, 6, 6]);
    s = act(s, L, stop, [1]);
    expect(P(s, L).r.dice.filter((x) => x === 1)).toHaveLength(1);
    expect(s.traps).toHaveLength(0);
  });
  it('Le Guetteur : +1 Tournée, 1 carte, et voit les pièges posés devant lui', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'faux-421');
    P(s, L).tournees = 3;
    s = act(s, L, play(give(s, L, 'guetteur')));
    expect(viewFor(s, L).traps[0].id).toBe('faux-421');
    expect([P(s, L).tournees, P(s, L).hand.length]).toEqual([3 - cost('guetteur') + 1, 1]);
  });
  it('La Dénonciation (Dernier mot) : défausse un piège posé devant soi, puis 1 carte', () => {
    let { s, L, O } = setup();
    const t = trap(s, O, L, 'coup-nenette');
    const d = give(s, L, 'denonciation');
    s = act(s, L, roll(), [6, 3, 2]); s = act(s, L, stop);
    s = act(s, O, roll(), [5, 3, 2]);
    P(s, L).tournees = 2;
    s = act(s, L, play(d, { trap: t }));
    expect(lastEvents.some((e) => e.kind === 'coup-nenette')).toBe(false);
    expect(P(s, L).tournees).toBe(2 - cost('denonciation') + 1 + CF_RULES.tourneesPerRound);
    expect(P(s, O).tokens).toBe(12);
  });
  it('Le Tour de passe-passe : reprend un de ses pièges (sauf un Leurre), +1 Tournée et 1 carte', () => {
    let { s, L, O } = setup();
    const t = trap(s, L, O, 'croche-patte');
    const lu = trap(s, L, O, 'leurre');
    P(s, L).tournees = 3;
    const pp = give(s, L, 'passe-passe');
    expect(legalActions(s, L).filter((a) => a.type === 'play' && a.card === pp).map((a) => (a as { trap: string }).trap)).toEqual([t]);
    s = act(s, L, play(pp, { trap: t }));
    expect(P(s, L).hand.map((k) => k.id)).toEqual(['croche-patte', 'domino']);
    expect(P(s, L).tournees).toBe(3 - cost('passe-passe') + 1);
    expect(s.traps.map((x) => x.uid)).toEqual([lu]);
  });
  it('L’Attrape-nigaud : le piège posé devant son poseur est défaussé, qui pioche 1 carte', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'attrape-nigaud');
    s = act(s, L, play(give(s, L, 'croche-patte'), { target: O }));
    expect(s.traps).toHaveLength(0);
    expect(P(s, L).discard.map((k) => k.id)).toContain('croche-patte');
    expect(P(s, O).hand).toHaveLength(1);
  });
  it('Le Lot de consolation : quand l’adversaire gagne, +1 Tournée et 2 cartes pour son poseur', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'lot-consolation');
    P(s, O).tournees = 0;
    s = quickRound(s, L, O, [6, 6, 6], [6, 3, 2]);
    expect(s.traps).toHaveLength(0);
    expect(P(s, O).hand).toHaveLength(LOT_DRAW + 1); // + la pioche du service
  });
  it('Flagrant délit (Riposte) : annule un Coup qui coûte 1 ou moins', () => {
    let { s, L, O } = setup();
    const f = give(s, O, 'flagrant-delit');
    s = act(s, L, play(give(s, L, 'cafe-serre')));
    s = act(s, O, play(f));
    expect(P(s, L).hand).toHaveLength(0);
    give(s, O, 'flagrant-delit');
    s = act(s, L, play(give(s, L, 'tournee-patron')));
    expect(waitingFor(s)).toEqual([L]); // 2 Tournées : hors de portée
  });
  it('La Souricière : après sa 1re carte, plus aucune carte de la manche', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'souriciere');
    s = act(s, L, play(give(s, L, 'coup-coude')));
    const u = give(s, L, 'coup-coude');
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === u)).toBe(false);
    expect(P(s, L).r.locked).toBe('souriciere');
  });
  it('L’Embuscade : pose gratuitement les pièges de la main (3 au plus devant lui)', () => {
    let { s, L, O } = setup();
    for (const id of ['croche-patte', 'faux-421', 'leurre', 'mouchard']) give(s, L, id);
    s = act(s, L, play(give(s, L, 'embuscade'), { target: O }));
    expect(s.traps.filter((t) => t.target === O)).toHaveLength(3);
    expect(P(s, L).hand).toHaveLength(1);
    expect(P(s, L).tournees).toBe(6 - cost('embuscade'));
  });
  // --- Les Chaînes
  it('La Boule de neige : 1 carte par autre carte jouée dans la manche', () => {
    let { s, L } = setup();
    const b = give(s, L, 'boule-de-neige');
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === b)).toBe(false);
    s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, play(give(s, L, 'coup-coude')));
    const n = P(s, L).hand.length;
    s = act(s, L, play(b));
    expect(P(s, L).hand.length).toBe(n - 1 + 2);
  });
  it('Le Ricochet : après une autre carte, ±1 à un dé', () => {
    let { s, L } = setup();
    s = act(s, L, roll(), [4, 2, 2]);
    const r = give(s, L, 'ricochet');
    expect(legalActions(s, L).some((a) => a.type === 'play' && a.card === r)).toBe(false);
    s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, play(r, { die: 2, delta: -1 }));
    expect(P(s, L).r.dice).toEqual([4, 2, 1]);
  });
  it('Le Nœud coulant : à sa 2e carte, 1 jeton et plus de carte', () => {
    let { s, L, O } = setup();
    trap(s, O, L, 'noeud-coulant');
    s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, play(give(s, L, 'coup-coude')));
    expect(P(s, L).tokens).toBe(12);
    expect(P(s, L).r.locked).toBe('noeud-coulant');
  });
  it('Le Compte rond (Dernier mot) : 1 Tournée par autre carte jouée', () => {
    let { s, L, O } = setup();
    const c = give(s, L, 'compte-rond');
    s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, play(give(s, L, 'coup-coude')));
    P(s, L).tournees = 1;
    s = act(s, L, roll(), [6, 3, 2]); s = act(s, L, stop);
    s = act(s, O, roll(), [5, 3, 2]);
    s = act(s, L, play(c));
    expect(P(s, L).tournees).toBe(1 - cost('compte-rond') + 2 + CF_RULES.tourneesPerRound);
  });
  it('Retour à l’envoyeur (Riposte) : annule un Coup, qui retourne dans la main de son joueur', () => {
    let { s, L, O } = setup();
    const r = give(s, O, 'retour-envoyeur');
    const c = give(s, L, 'cul-sec');
    s = act(s, L, play(c));
    s = act(s, O, play(r));
    expect(P(s, L).r.bonusThrows).toBe(0);
    expect(P(s, L).hand.map((k) => k.uid)).toEqual([c]);
  });
  it('Le Comptable : à la 2e carte de la manche, +1 Tournée et 1 carte', () => {
    let { s, L } = setup();
    hab(s, L, 'comptable');
    P(s, L).tournees = 3;
    s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, play(give(s, L, 'coup-coude')));
    expect(P(s, L).tournees).toBe(4);
    expect(P(s, L).hand).toHaveLength(3);
  });
  it('La Dernière maille (Dernier mot) : après 2 autres cartes, un dé sur la face voulue', () => {
    let { s, L, O } = setup();
    const m = give(s, L, 'derniere-maille');
    s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, play(give(s, L, 'coup-coude')));
    s = act(s, L, roll(), [4, 2, 6]); s = act(s, L, stop);
    s = act(s, O, roll(), [5, 5, 5]);
    s = act(s, L, play(m, { die: 2, face: 1 }));
    expect(P(s, O).tokens).toBe(19);
  });
  it('L’Écho : rejoue gratuitement le dernier Coup adverse de la manche', () => {
    let { s, L, O } = setup();
    s = act(s, L, play(give(s, L, 'tournee-patron')));
    s = act(s, L, roll(), [6, 3, 2]); s = act(s, L, stop);
    P(s, O).tournees = 2;
    const e = give(s, O, 'echo');
    s = act(s, O, play(e));
    expect(P(s, O).tournees).toBe(2 - cost('echo') + TOURNEE_PATRON_GAIN);
  });
  it('La Boucle : reprend les 2 derniers Coups de la défausse (sauf Boucle et petite sœur)', () => {
    let { s, L } = setup();
    P(s, L).discard.push({ uid: 'y1', id: 'coup-coude' }, { uid: 'y2', id: 'pilier' }, { uid: 'y3', id: 'cul-sec' }, { uid: 'y4', id: 'petite-soeur' });
    s = act(s, L, play(give(s, L, 'boucle')));
    expect(P(s, L).hand.map((k) => k.id).sort()).toEqual(['coup-coude', 'cul-sec']);
  });
  it('L’Effet papillon : 1 carte, et les autres cartes de la manche coûtent 1 de moins', () => {
    let { s, L } = setup();
    s = act(s, L, play(give(s, L, 'effet-papillon')));
    const t = P(s, L).tournees;
    s = act(s, L, play(give(s, L, 'tournee-patron')));
    expect(P(s, L).tournees).toBe(Math.min(6, t - (cost('tournee-patron') - 1) + TOURNEE_PATRON_GAIN));
  });
});
