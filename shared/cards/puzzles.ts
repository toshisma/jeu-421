/**
 * « L'énigme du jour » de Coups Fourrés : une fin de tour fixe, la même pour tout le monde ce jour-là
 * (heure de Bruxelles), à résoudre par le raisonnement, sans hasard.
 *
 * L'adversaire a fini son tour ; vous n'avez plus de lancer. Avec vos cartes (seulement des cartes à
 * effet fixe : Tête qui tourne, Coup de pouce, Le bon numéro, Recompter, Double tournée, La note est
 * salée… ; plus Mise en bouche depuis la 0.40, qui fait piocher) et vos Tournées, gagnez la manche en donnant le plus de jetons
 * possible. Score = jetons donnés à l'adversaire si vous gagnez la manche, 0 sinon.
 *
 * Tout passe par le vrai moteur (shared/cards/engine.ts) : l'énigme est un état de partie construit
 * à la main, les coups sont des actions du moteur, et le score est lu dans le résumé de la manche.
 * Le générateur tire des situations au hasard (graine = date), le solveur explore toutes les suites
 * de coups, et on ne garde que les situations intéressantes (voir `interesting`).
 */
import { CARD_BY_ID } from './catalog';
import { actionKey, apply, evalPlayer, legalActions, newGame, type CfAction, type CfState } from './engine';

export const ENIGME_ME = 'moi';
export const ENIGME_OPP = 'adv';
export const ENIGME_SHARE_URL = 'https://421online.com/?mode=cartes';
/** Récompense (comptes, une fois par jour) : volontairement modeste. */
export const ENIGME_CAPSULES = { best: 10, played: 5 };
/** Garde-fou : nombre d'actions au plus dans une réponse. */
export const ENIGME_MAX_ACTIONS = 40;

export interface CfPuzzle {
  day: string;
  /** Graine retenue (date + numéro d'essai) : sert aussi de graine au moteur. */
  seed: number;
  oppName: string;
  oppDice: number[];
  /** Habitués devant l'adversaire (ex. Le Pilier de comptoir). */
  oppHabitues: string[];
  /** Pièges de l'adversaire posés devant vous, connus (face visible). */
  traps: string[];
  dice: number[];
  hand: string[];
  tournees: number;
  /** Vos Habitués en jeu. */
  habitues: string[];
  /** Votre défausse (pour La petite sœur). */
  discard: string[];
  /** Meilleur score possible, et le moins de cartes pour l'obtenir. */
  best: number;
  bestCards: number;
  /** Une suite de coups qui donne le meilleur score (actions du moteur, joueur ENIGME_ME). */
  solution: CfAction[];
  /** Score d'un joueur naïf (joue la première carte qui améliore ses dés). */
  naive: number;
}

export interface PuzzleSetup { oppName: string; oppDice: number[]; oppHabitues: string[]; traps: string[]; dice: number[]; hand: string[]; tournees: number; habitues: string[]; discard: string[]; seed: number }

// ---------------------------------------------------------------------------------------------
// Date et hasard déterministe

/** Jour de Bruxelles (AAAA-MM-JJ) d'un instant. */
export const enigmeDay = (t: number = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// État du moteur

/** Construit l'état de partie de l'énigme : manche 1, l'adversaire a fini, à vous, plus de lancer. */
export function puzzleState(p: PuzzleSetup): CfState {
  const s = newGame({ startTokens: 99 }, [{ id: ENIGME_OPP, name: p.oppName, deck: [] }, { id: ENIGME_ME, name: 'Vous', deck: [] }], p.seed || 1);
  // Deck : des cartes injouables ici (Ripostes sans rien à annuler) ; une pioche ne change donc rien
  // et la défausse n'est jamais remélangée (pas de hasard caché).
  let uid = 1;
  const inst = (id: string) => ({ uid: `e${uid++}`, id });
  const opp = s.players[0], me = s.players[1];
  for (const x of s.players) { x.tokens = 99; x.mulliganDone = true; x.tournees = 0; }
  s.phase = 'turn';
  s.round = 1;
  s.leader = ENIGME_OPP;
  s.order = [ENIGME_OPP, ENIGME_ME];
  s.turn = 1;
  opp.r = { ...opp.r, dice: [...p.oppDice], throwsUsed: 3, done: true };
  opp.habitues = p.oppHabitues.map((id) => ({ ...inst(id), rounds: 3 }));
  me.r = { ...me.r, dice: [...p.dice], throwsUsed: 3, done: false };
  me.hand = p.hand.map(inst);
  me.tournees = p.tournees;
  me.habitues = p.habitues.map((id) => ({ ...inst(id), rounds: 3 }));
  me.discard = p.discard.map(inst);
  me.deck = Array.from({ length: 12 }, () => inst('ticket-caisse'));
  me.families = [...new Set(p.hand.map((id) => CARD_BY_ID[id].family))].sort();
  s.traps = p.traps.map((id) => ({ ...inst(id), owner: ENIGME_OPP, target: ENIGME_ME, posedRound: 1, seenBy: [ENIGME_OPP, ENIGME_ME], revealed: true }));
  return s;
}

/** Score d'une manche finie : jetons donnés à l'adversaire si vous gagnez, 0 sinon ; null si pas finie. */
export function puzzleScore(s: CfState): number | null {
  const r = s.lastRound;
  if (!r) return null;
  return r.winner === ENIGME_ME && !r.reversed ? r.amount : 0;
}

export interface ReplayResult { ok: boolean; error?: string; score: number; cards: number; state: CfState; finished: boolean }

/** Rejoue une suite d'actions sur l'énigme (le serveur s'en sert pour calculer le score officiel). */
export function replayPuzzle(p: PuzzleSetup, actions: unknown): ReplayResult {
  let s = puzzleState(p);
  const bad = (error: string): ReplayResult => ({ ok: false, error, score: 0, cards: 0, state: s, finished: false });
  if (!Array.isArray(actions) || actions.length > ENIGME_MAX_ACTIONS) return bad('Réponse invalide.');
  let cards = 0;
  for (const a of actions) {
    if (s.lastRound) return bad('Coups en trop après la fin de la manche.');
    if (!a || typeof a !== 'object') return bad('Réponse invalide.');
    const r = apply(s, ENIGME_ME, a as CfAction);
    if (!r.ok) return bad('Coup impossible dans cette énigme.');
    if ((a as CfAction).type === 'play') cards++;
    s = r.state;
  }
  const score = puzzleScore(s);
  if (score === null) return { ok: false, error: 'La manche n’est pas finie : terminez votre tour.', score: 0, cards, state: s, finished: false };
  return { ok: true, score, cards, state: s, finished: true };
}

// ---------------------------------------------------------------------------------------------
// Solveur

interface Solved { score: number; cards: number; line: CfAction[]; dist: Map<number, number> }

function memoKey(s: CfState): string {
  const me = s.players[1], opp = s.players[0];
  const r = me.r;
  return JSON.stringify([s.phase, s.lastword?.idx ?? -1, s.lastword?.passes ?? -1, r.dice, r.played, r.discount, r.doubles, r.noteSalee, r.pari,
    r.faux421, r.forcedNenette, r.lastCoup, r.done, me.tournees, me.hand.map((k) => k.uid).sort(), me.discard.map((k) => k.uid),
    me.habitues.map((k) => k.uid), opp.habitues.map((k) => k.uid), s.traps.map((t) => t.uid), opp.r.dice]);
}

/** Explore toutes les suites de coups : meilleur score, puis le moins de cartes ; et la répartition des scores. */
export function solvePuzzle(start: CfState, limit = 200_000): Solved | null {
  const memo = new Map<string, Solved>();
  let nodes = 0;
  const rec = (s: CfState, depth = 0): Solved | null => {
    if (depth > 24) return null;
    const sc = puzzleScore(s);
    if (sc !== null) return { score: sc, cards: 0, line: [], dist: new Map([[sc, 1]]) };
    const key = memoKey(s);
    const m = memo.get(key);
    if (m) return m;
    if (++nodes > limit) return null;
    const legal = legalActions(s, ENIGME_ME);
    if (!legal.length) return null; // ne devrait pas arriver (personne d'autre ne joue)
    let best: Solved | null = null;
    const dist = new Map<number, number>();
    for (const a of legal) {
      const r = apply(s, ENIGME_ME, a);
      if (!r.ok) continue;
      const sub = rec(r.state, depth + 1);
      if (!sub) return null;
      for (const [k, n] of sub.dist) dist.set(k, (dist.get(k) ?? 0) + n);
      const cards = sub.cards + (a.type === 'play' ? 1 : 0);
      if (!best || sub.score > best.score || (sub.score === best.score && cards < best.cards)) best = { score: sub.score, cards, line: [a, ...sub.line], dist };
    }
    if (!best) return null;
    best.dist = dist;
    memo.set(key, best);
    return best;
  };
  return rec(start);
}

const myRank = (s: CfState) => evalPlayer(s, s.players[1]).rank;
const BONUS = new Set(['double-tournee', 'note-salee', 'pari-comptoir']);

/**
 * Joueur naïf : joue la première carte (dans l'ordre de sa main) qui améliore ses dés ; quand rien
 * n'améliore et qu'il gagne, il ajoute les cartes qui font payer plus (Double tournée, Note salée,
 * Pari) ; sinon il s'arrête.
 */
export function naivePlay(start: CfState): { score: number; actions: CfAction[] } {
  let s = start;
  const actions: CfAction[] = [];
  for (let guard = 0; guard < 40 && puzzleScore(s) === null; guard++) {
    const legal = legalActions(s, ENIGME_ME);
    const cur = myRank(s);
    let pick: CfAction | undefined;
    for (const a of legal) {
      if (a.type !== 'play') continue;
      const r = apply(s, ENIGME_ME, a);
      if (r.ok && myRank(r.state) > cur) { pick = a; break; }
    }
    if (!pick && cur > evalPlayer(s, s.players[0]).rank) {
      pick = legal.find((a) => a.type === 'play' && BONUS.has(s.players[1].hand.find((k) => k.uid === a.card)?.id ?? ''));
    }
    pick ??= legal.find((a) => a.type === 'stop' || a.type === 'pass') ?? legal[0];
    const r = apply(s, ENIGME_ME, pick);
    if (!r.ok) break;
    actions.push(pick);
    s = r.state;
  }
  return { score: puzzleScore(s) ?? 0, actions };
}

// ---------------------------------------------------------------------------------------------
// Générateur

const OPP_NAMES = ['Mado', 'Dédé', 'Ginette', 'Riton', 'Lulu', 'Bébert', 'Momo', 'Suzette', 'Jojo', 'Paulette'];
/** Cartes à effet fixe (aucun tirage, aucune pioche) et leur poids dans le tirage de la main. */
const POOL: [string, number][] = [
  ['tete-tourne', 3], ['coup-pouce', 3], ['recompter', 3], ['double-tournee', 2], ['note-salee', 2],
  ['tant-qu-on-y-est', 2], ['pari-comptoir', 1.2], ['bon-numero', 1], ['petite-soeur', 1.3],
];
const TRAPS = ['main-sac', 'ardoise-piegee', 'faux-421', 'coup-nenette', 'retournement-veste'];
/**
 * 0.46 : cartes du nouveau set à effet fixe, dans les énigmes à partir de ce jour seulement (les énigmes
 * des jours passés ne changent pas : leurs meilleurs scores sont déjà enregistrés).
 */
export const POOL_046_FROM = '2026-11-10';
const POOL_046: [string, number][] = [['miroir', 1.5], ['calva', 1.2], ['addition', 1]];

function candidate(rnd: () => number, seed: number, day = ''): PuzzleSetup {
  const pool = day >= POOL_046_FROM ? [...POOL, ...POOL_046] : POOL;
  const die = () => 1 + Math.floor(rnd() * 6);
  const pickW = (list: [string, number][]) => {
    const tot = list.reduce((a, x) => a + x[1], 0);
    let u = rnd() * tot;
    for (const [id, w] of list) { u -= w; if (u < 0) return id; }
    return list[list.length - 1][0];
  };
  const size = 3 + Math.floor(rnd() * 3);
  const hand: string[] = [];
  const traps: string[] = [];
  const oppHabitues: string[] = [];
  const habitues: string[] = [];
  const discard: string[] = [];
  if (rnd() < 0.35) traps.push(TRAPS[Math.floor(rnd() * TRAPS.length)]);
  if (rnd() < 0.25) oppHabitues.push('pilier');
  const hr = rnd();
  if (hr < 0.1) habitues.push('beau-frere'); else if (hr < 0.2) habitues.push('vieux-marcel');
  if (traps.length && rnd() < 0.5) hand.push('fouine');
  if (oppHabitues.length && rnd() < 0.4) hand.push('fermeture');
  while (hand.length < size) {
    const id = pickW(pool);
    if (hand.filter((x) => x === id).length >= 2) continue;
    hand.push(id);
  }
  // Ordre de la main mélangé (le joueur naïf joue dans cet ordre).
  for (let i = hand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [hand[i], hand[j]] = [hand[j], hand[i]]; }
  if (hand.includes('petite-soeur') && rnd() < 0.6) discard.push(rnd() < 0.5 ? 'tete-tourne' : 'coup-pouce');
  const tournees = 1 + Math.floor(rnd() * 6);
  return {
    seed, oppName: OPP_NAMES[Math.floor(rnd() * OPP_NAMES.length)], oppDice: [die(), die(), die()].sort((a, b) => b - a),
    oppHabitues, traps, dice: [die(), die(), die()], hand, tournees, habitues, discard,
  };
}

export interface PuzzleCheck { best: number; bestCards: number; solution: CfAction[]; naive: number; bestShare: number; paths: number; stopScore: number }

/** Résout une situation et mesure son intérêt. */
export function analyse(p: PuzzleSetup): PuzzleCheck | null {
  const s0 = puzzleState(p);
  const sol = solvePuzzle(s0);
  if (!sol) return null;
  const paths = [...sol.dist.values()].reduce((a, b) => a + b, 0);
  const stop = apply(s0, ENIGME_ME, { type: 'stop' });
  let stopScore = 0;
  if (stop.ok) { let s = stop.state; for (let g = 0; g < 8 && puzzleScore(s) === null; g++) { const r = apply(s, ENIGME_ME, { type: 'pass' }); if (!r.ok) break; s = r.state; } stopScore = puzzleScore(s) ?? 0; }
  return { best: sol.score, bestCards: sol.cards, solution: sol.line, naive: naivePlay(s0).score, bestShare: (sol.dist.get(sol.score) ?? 0) / paths, paths, stopScore };
}

/**
 * Énigme intéressante : on peut gagner, il faut au moins 2 cartes, le joueur naïf fait moins bien,
 * s'arrêter tout de suite aussi, et peu de suites de coups mènent au meilleur score.
 */
export function interesting(c: PuzzleCheck): boolean {
  return c.best >= 2 && c.best <= 20 && c.bestCards >= 2 && c.bestCards <= 6 && c.naive < c.best && c.stopScore < c.best && c.bestShare <= 0.12 && c.paths >= 20;
}

/** Génère l'énigme d'un jour (sans cache) : déterministe, même date, même énigme. */
export function generatePuzzle(day: string): CfPuzzle {
  let fallback: { p: PuzzleSetup; c: PuzzleCheck } | null = null;
  for (let attempt = 0; attempt < 600; attempt++) {
    const seed = hash(`cf-enigme:${day}:${attempt}`);
    const p = candidate(mulberry(seed), seed, day);
    const c = analyse(p);
    if (!c || c.best <= 0) continue;
    if (interesting(c)) return { day, ...p, best: c.best, bestCards: c.bestCards, solution: c.solution, naive: c.naive };
    if (c.naive < c.best && c.bestCards >= 2 && (!fallback || c.bestShare < fallback.c.bestShare)) fallback = { p, c };
  }
  if (!fallback) throw new Error(`Aucune énigme trouvée pour ${day}`);
  return { day, ...fallback.p, best: fallback.c.best, bestCards: fallback.c.bestCards, solution: fallback.c.solution, naive: fallback.c.naive };
}

const cache = new Map<string, CfPuzzle>();
/** L'énigme du jour (gardée en mémoire : quelques jours au plus). */
export function dailyPuzzle(day: string): CfPuzzle {
  const hit = cache.get(day);
  if (hit) return hit;
  const out = generatePuzzle(day);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  cache.set(day, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Textes (solution, partage)

const nm = (id: string) => CARD_BY_ID[id]?.name ?? id;

/** La solution en phrases, rejouée dans le moteur : « Tête qui tourne : le 2 devient 5 (6-5-4). » */
export function describeLine(p: PuzzleSetup, actions: CfAction[]): string[] {
  let s = puzzleState(p);
  const out: string[] = [];
  for (const a of actions) {
    const me = s.players[1];
    const before = [...me.r.dice];
    const card = a.type === 'play' ? me.hand.find((k) => k.uid === a.card) : undefined;
    const lastword = s.phase === 'lastword';
    const r = apply(s, ENIGME_ME, a);
    if (!r.ok) break;
    s = r.state;
    if (a.type === 'stop') { out.push(`Vous finissez votre tour sur ${before.join('-')}.`); continue; }
    if (!card) continue;
    // Dés après l'effet : lus dans les événements (la manche finie, le moteur remet les dés à zéro).
    const ev = [...r.events].reverse().find((e) => e.player === ENIGME_ME && e.card === card.id && e.dice);
    const after = ev?.dice ?? s.players[1].r.dice;
    const pa = a as { die?: number; trap?: string; habitue?: string };
    const i = typeof pa.die === 'number' ? pa.die : -1;
    let t = nm(card.id);
    if (card.id === 'fouine' && pa.trap) t += ` : vous défaussez le piège ${nm(p.traps[0] ?? '')}`;
    else if (card.id === 'fermeture' && pa.habitue) t += ` : ${nm(p.oppHabitues[0] ?? '')} rentre chez lui`;
    else if (i >= 0 && before[i] !== after[i]) t += ` : le ${before[i]} devient ${after[i]} (${after.join('-')})`;
    else if (card.id === 'mise-bouche') t += ' : la carte suivante est gratuite';
    else if (card.id === 'tant-qu-on-y-est') t += ` : vous avez ${s.players[1].tournees} Tournée${s.players[1].tournees > 1 ? 's' : ''}`;
    else if (card.id === 'petite-soeur') t += ' : vous reprenez votre dernier Coup en main';
    out.push(`${t}${lastword ? ' (Dernier mot)' : ''}.`);
  }
  const sc = puzzleScore(s);
  if (sc !== null) out.push(sc > 0 ? `${s.players[0].name} reçoit ${sc} jeton${sc > 1 ? 's' : ''}.` : 'Vous ne gagnez pas la manche.');
  return out;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const shortDay = (day: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : day; };

/**
 * Texte à partager (façon Wordle), sans dévoiler la solution : une case par jeton possible
 * (🟩 obtenu, ⬛ manqué ; ramené à 10 cases au plus), le nombre de cartes jouées, la série, le lien.
 */
export function enigmeShareText(day: string, score: number, best: number, cards: number, streak = 0, url = ENIGME_SHARE_URL): string {
  const cells = Math.min(10, Math.max(1, best));
  const got = best > 0 ? Math.round((Math.max(0, Math.min(score, best)) / best) * cells) : 0;
  const grid = '🟩'.repeat(got) + '⬛'.repeat(cells - got);
  return [
    `Énigme Coups Fourrés · ${shortDay(day)}`,
    `${grid} ${score}/${best} jeton${best > 1 ? 's' : ''}`,
    `🃏 ${cards} carte${cards > 1 ? 's' : ''} jouée${cards > 1 ? 's' : ''}${score >= best ? ' · ⭐ meilleur score' : ''}${streak > 1 ? ` · 🔥 ${streak} jours` : ''}`,
    url,
  ].join('\n');
}

/** Clé d'une action (pour comparer deux réponses). */
export const enigmeKey = (actions: CfAction[]) => actions.map(actionKey).join('|');

/** Jour précédent (AAAA-MM-JJ). */
export function prevDay(day: string): string {
  const t = Date.parse(`${day}T12:00:00Z`) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Série de jours réussis (meilleur score trouvé), jours consécutifs jusqu'à aujourd'hui ; si
 * l'énigme du jour n'est pas encore faite, la série d'hier compte encore.
 */
export function enigmeStreak(days: { day: string; score: number; best: number }[], today: string): number {
  const ok = new Map(days.map((d) => [d.day, d.score >= d.best && d.best > 0]));
  let d = ok.has(today) ? today : prevDay(today);
  let n = 0;
  while (ok.get(d)) { n++; d = prevDay(d); }
  return n;
}
