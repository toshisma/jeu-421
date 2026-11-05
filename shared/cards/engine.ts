/**
 * « Coups Fourrés » : moteur de règles du mode cartes du 421.
 *
 * Pur TypeScript (ni DOM ni Node), déterministe avec une graine : le même état + la même action
 * donnent toujours le même résultat. L'état est un objet JSON simple (sérialisable tel quel),
 * y compris l'état du générateur aléatoire (`rng`).
 *
 * API :
 *   newGame(config, players, seed)        → état initial (phase « mulligan »)
 *   legalActions(state, playerId)         → actions permises à ce joueur maintenant
 *   apply(state, playerId, action, opts?) → { ok, error?, state, events }  (l'état reçu n'est jamais modifié)
 *   viewFor(state, playerId)              → ce que ce joueur a le droit de voir (information partielle)
 *   waitingFor(state)                     → qui doit agir maintenant
 *   defaultAction(state, playerId)        → action à jouer quand le temps est écoulé
 *   eventsFor(events, playerId)           → événements visibles par ce joueur, textes à la 2e personne
 *
 * Toutes les vérifications passent par legalActions : apply refuse toute action qui n'y figure pas
 * (le serveur peut donc relayer les actions des clients sans autre contrôle).
 */
import { evaluate, type Combo } from '../combos';
import { DEFAULT_CONFIG, type ComboValues } from '../config';
import { CARD_BY_ID, CF_RULES, type CardDef, type CardFamily, type CardType } from './catalog';

// ---------------------------------------------------------------------------------------------
// Types

export type CfRules = { -readonly [K in keyof typeof CF_RULES]: number };

export interface CfConfig {
  /** Jetons de départ (par défaut : CF_RULES.startTokens en duel, startTokensMulti à 3-4). */
  startTokens?: number;
  /** Surcharge de réglages (essais d'équilibrage). */
  rules?: Partial<CfRules>;
  values?: ComboValues;
  /**
   * Parties en ligne : fenêtres de réponse « à l'aveugle ». Une Riposte ou un Dernier mot est proposé
   * à tout joueur qui POURRAIT en avoir un d'après l'information publique (familles de son deck,
   * Tournées, réduction en cours), et pas seulement à ceux qui en ont vraiment un : ainsi, qu'on
   * ait ou non la carte, la partie marque la même pause (le serveur fixe sa durée). Les règles ne
   * changent pas (sans la carte, on ne peut que passer).
   */
  windows?: boolean;
}

export interface CardInst { uid: string; id: string }

export interface PosedTrap {
  uid: string;
  id: string;
  owner: string;
  /** Joueur visé (en duel : l'adversaire). */
  target: string;
  posedRound: number;
  /** Joueurs qui ont vu la carte (propriétaire + Fouine). */
  seenBy: string[];
  revealed?: boolean;
}

export interface RoundState {
  /** Cartes jouées dans la manche (Coups, Ripostes, Dernier mot, pièges posés, Habitués). */
  played: number;
  /** Dernier Coup joué (pour Le grand enchaînement). */
  lastCoup: string | null;
  /** Réduction de la prochaine carte (Mise en bouche). */
  discount: number;
  josianeUsed: number;
  videurUsed: number;
  /** Gueule de bois : un seul lancer cette manche (> 0). */
  throwPenalty: number;
  /** Lancers en plus ce tour (Cul sec). */
  bonusThrows: number;
  pari: number;
  doubles: number;
  noteSalee: number;
  /** Faux 4-2-1 déclenché : un 4-2-1 de ce joueur ne vaut que 2 cette manche. */
  faux421: boolean;
  /** Le coup de la nénette : combinaison forcée en nénette (tant que les dés ne changent pas). */
  forcedNenette: boolean;
  dice: number[];
  throwsUsed: number;
  /** Tour terminé (combinaison posée sur la table). */
  done: boolean;
}

export interface CfPlayer {
  id: string;
  name: string;
  tokens: number;
  tournees: number;
  deck: CardInst[]; // [0] = dessus
  hand: CardInst[];
  discard: CardInst[];
  habitues: CardInst[];
  /** Familles présentes dans le deck (information publique). */
  families: CardFamily[];
  deckSize: number;
  ardoiseUsed: boolean;
  /** L'ardoise a été prise : rien à recevoir à la prochaine distribution. */
  ardoiseSkip: boolean;
  mulliganDone: boolean;
  /** Gueule de bois : lancers en moins à la manche suivante. */
  penaltyNext: number;
  out: boolean;
  place: number | null;
  r: RoundState;
}

export interface PlayParams { target?: string; die?: number; face?: number; delta?: number; trap?: string; habitue?: string }

export type CfAction =
  | { type: 'mulligan'; cards: string[] }
  | { type: 'roll'; keep: boolean[] }
  | { type: 'stop' }
  | ({ type: 'play'; card: string } & PlayParams)
  | { type: 'josiane'; card: string; die: number }
  | { type: 'ardoise' }
  | { type: 'pass' }
  | { type: 'choose'; index: number }
  | { type: 'discard'; card: string };

export type StackItem =
  | {
      kind: 'card'; owner: string; card: CardInst; type: CardType; params: PlayParams; cost: number;
      cancelled: boolean; playedBefore: number; returnsToHand: boolean;
      /** Index dans la pile de l'élément visé (Ripostes). */
      targetIdx: number | null;
    }
  | { kind: 'keep'; owner: string; keep: boolean[]; cancelled: boolean };

export type Choice =
  | { kind: 'calcul'; player: string; cards: CardInst[] }
  | { kind: 'fouine'; player: string; trap: string; cardId: string }
  | { kind: 'tournee-generale'; player: string };

export type CfPhase = 'mulligan' | 'turn' | 'lastword' | 'discard' | 'over';

export interface RoundSummary {
  round: number;
  winner: string | null; // celui qui donne
  loser: string | null; // celui qui reçoit
  amount: number;
  reversed: boolean;
  combos: Record<string, { dice: number[]; label: string; value: number }>;
  text: string;
}

export interface CfState {
  v: 1;
  rules: CfRules;
  values: ComboValues;
  rng: number;
  nextUid: number;
  players: CfPlayer[]; // ordre des sièges (sens horaire)
  phase: CfPhase;
  round: number;
  leader: string;
  order: string[];
  turn: number;
  traps: PosedTrap[];
  stack: StackItem[];
  respond: string[] | null;
  choice: Choice | null;
  lastword: { order: string[]; idx: number; passes: number } | null;
  discardQueue: string[];
  prevLoser: string | null;
  lastRound: RoundSummary | null;
  ranking: string[];
  winner: string | null;
  version: number;
  decisions: number;
  /** Fenêtres de réponse à l'aveugle (voir CfConfig.windows). */
  windows?: boolean;
}

export interface CfEvent {
  kind: string;
  /** Texte à la 3e personne (journal, spectateurs). */
  text: string;
  /** Joueur concerné : pour lui, le texte `textYou` remplace `text`. */
  who?: string;
  textYou?: string;
  /** Si présent : seuls ces joueurs voient l'événement. */
  to?: string[];
  player?: string;
  card?: string;
  dice?: number[];
  kept?: boolean[];
  throwIndex?: number;
  /** Données de rejeu : quels dés ont été (re)lancés. */
  rolled?: number[];
}

export interface ApplyOptions {
  /** Source de dés officielle (ex. crypto côté serveur). Par défaut : le générateur de l'état. */
  rollDie?: () => number;
  /** Modifie l'état reçu au lieu de le copier (simulations rapides). */
  inPlace?: boolean;
}

export interface ApplyResult { ok: boolean; error?: string; state: CfState; events: CfEvent[] }

// ---------------------------------------------------------------------------------------------
// Hasard (mulberry32, état dans le JSON)

function rnd(s: CfState): number {
  const a = (s.rng + 0x6d2b79f5) >>> 0;
  s.rng = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(s: CfState, arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------------------------------------------------------------------------------------------
// Contexte d'application

interface Ctx { s: CfState; ev: CfEvent[]; die: () => number }

const def = (id: string): CardDef => CARD_BY_ID[id];
export const cardName = (id: string) => CARD_BY_ID[id]?.name ?? id;
export const pl = (s: CfState, id: string) => s.players.find((p) => p.id === id)!;
const nm = (s: CfState, id: string) => pl(s, id).name;
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
const active = (s: CfState) => s.players.filter((p) => !p.out);
const isDuel = (s: CfState) => s.players.length === 2;

function emit(c: Ctx, e: CfEvent) { c.ev.push(e); }

function emptyRound(): RoundState {
  return {
    played: 0, lastCoup: null, discount: 0, josianeUsed: 0, videurUsed: 0, throwPenalty: 0, bonusThrows: 0,
    pari: 0, doubles: 0, noteSalee: 0, faux421: false, forcedNenette: false, dice: [0, 0, 0], throwsUsed: 0, done: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Création

export function newGame(config: CfConfig, players: { id: string; name?: string; deck: string[] }[], seed: number): CfState {
  if (players.length < 2 || players.length > 4) throw new Error('Coups Fourrés se joue de 2 à 4 joueurs');
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('Identifiants de joueurs en double');
  const rules: CfRules = { ...(CF_RULES as unknown as CfRules), ...(config.rules ?? {}) };
  const duel = players.length === 2;
  const start = config.startTokens ?? (duel ? rules.startTokens : rules.startTokensMulti);
  const s: CfState = {
    v: 1, rules, values: config.values ?? { ...DEFAULT_CONFIG.values }, rng: (seed >>> 0) || 1, nextUid: 1,
    players: [], phase: 'mulligan', round: 0, leader: players[0].id, order: [], turn: 0, traps: [], stack: [],
    respond: null, choice: null, lastword: null, discardQueue: [], prevLoser: null, lastRound: null, ranking: [],
    winner: null, version: 0, decisions: 0,
  };
  if (config.windows) s.windows = true;
  for (const p of players) {
    for (const id of p.deck) if (!CARD_BY_ID[id]) throw new Error(`Carte inconnue : ${id}`);
    const deck = p.deck.map((id) => ({ uid: `k${s.nextUid++}`, id }));
    shuffle(s, deck);
    const fam = [...new Set(p.deck.map((id) => def(id).family))].sort() as CardFamily[];
    s.players.push({
      id: p.id, name: p.name ?? p.id, tokens: start, tournees: 0, deck, hand: [], discard: [], habitues: [],
      families: fam, deckSize: p.deck.length, ardoiseUsed: false, ardoiseSkip: false, mulliganDone: false,
      penaltyNext: 0, out: false, place: null, r: emptyRound(),
    });
  }
  const c: Ctx = { s, ev: [], die: () => 1 + Math.floor(rnd(s) * 6) };
  for (const p of s.players) draw(c, p, rules.startHand, true);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Pioche, Tournées

function draw(c: Ctx, p: CfPlayer, n: number, silent = false, viaCard = false) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!p.deck.length && c.s.rules.reshufflePenalty > 0 && p.discard.length) {
      p.deck = p.discard;
      p.discard = [];
      shuffle(c.s, p.deck);
      p.tokens += c.s.rules.reshufflePenalty;
      emit(c, { kind: 'deck-vide', player: p.id, who: p.id, text: `Le deck de ${p.name} est vide : ${p.name} mélange sa défausse et reçoit ${plural(c.s.rules.reshufflePenalty, 'jeton')}.`, textYou: `Votre deck est vide : vous mélangez votre défausse et recevez ${plural(c.s.rules.reshufflePenalty, 'jeton')}.` });
    }
    const card = p.deck.shift();
    if (!card) {
      p.tokens += 1;
      emit(c, { kind: 'deck-vide', player: p.id, who: p.id, text: `Le deck de ${p.name} est vide : ${p.name} reçoit 1 jeton.`, textYou: 'Votre deck est vide : vous recevez 1 jeton.' });
      continue;
    }
    p.hand.push(card);
    got++;
    if (!silent) {
      emit(c, { kind: 'pioche', player: p.id, text: `${p.name} pioche une carte.`, who: p.id, textYou: 'Vous piochez une carte.' });
      emit(c, { kind: 'pioche-privee', player: p.id, card: card.id, to: [p.id], text: `Vous piochez ${cardName(card.id)}.` });
    }
  }
  if (viaCard && got > 0) mainSac(c, p, 0, got);
}

/** Main dans le sac : l'adversaire gagne des Tournées ou pioche grâce à une carte → le poseur en fait autant. */
function mainSac(c: Ctx, p: CfPlayer, tournees: number, cards: number) {
  for (const t of trapsOn(c.s, p.id, 'main-sac')) {
    if (!triggerTrap(c, t)) continue;
    const o = pl(c.s, t.owner);
    if (tournees > 0) {
      const g = gainTournees(c, o, tournees, false);
      emit(c, { kind: 'piege', player: o.id, card: t.id, who: o.id, text: `Main dans le sac ! ${o.name} gagne aussi ${plural(g, 'Tournée')}.`, textYou: `Main dans le sac ! Vous gagnez aussi ${plural(g, 'Tournée')}.` });
    } else {
      emit(c, { kind: 'piege', player: o.id, card: t.id, who: o.id, text: `Main dans le sac ! ${o.name} pioche aussi ${plural(cards, 'carte')}.`, textYou: `Main dans le sac ! Vous piochez aussi ${plural(cards, 'carte')}.` });
      draw(c, o, cards);
    }
    return;
  }
}

/** Gain de Tournées (réserve max). `viaCard` : gain dû à une carte (déclenche Main dans le sac). */
function gainTournees(c: Ctx, p: CfPlayer, n: number, viaCard: boolean): number {
  const got = Math.max(0, Math.min(n, c.s.rules.tourneesMax - p.tournees));
  p.tournees += got;
  if (viaCard && got > 0) mainSac(c, p, got, 0);
  return got;
}

// ---------------------------------------------------------------------------------------------
// Pièges

const trapsOn = (s: CfState, target: string, id: string) => s.traps.filter((t) => t.target === target && t.id === id && t.owner !== target);

/** Déclenche un piège : renvoie false s'il est annulé par le Videur. Le piège est retiré dans tous les cas. */
function triggerTrap(c: Ctx, t: PosedTrap): boolean {
  const s = c.s;
  s.traps = s.traps.filter((x) => x.uid !== t.uid);
  const owner = pl(s, t.owner);
  owner.discard.push({ uid: t.uid, id: t.id });
  const victim = pl(s, t.target);
  const videurs = victim.habitues.filter((h) => h.id === 'videur').length;
  if (victim.r.videurUsed < videurs) {
    victim.r.videurUsed++;
    emit(c, { kind: 'videur', player: victim.id, card: t.id, who: victim.id, text: `Le Videur de ${victim.name} met dehors le piège ${cardName(t.id)} de ${owner.name}.`, textYou: `Votre Videur met dehors le piège ${cardName(t.id)} de ${owner.name}.` });
    return false;
  }
  emit(c, { kind: 'piege-revele', player: owner.id, card: t.id, text: `${owner.name} révèle un piège : ${cardName(t.id)} !`, who: owner.id, textYou: `Votre piège se déclenche : ${cardName(t.id)} !` });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Combinaisons

export interface Eval { combo: Combo; value: number; rank: number }

/** Combinaison d'un joueur, avec les effets de cartes (Vieux Marcel, nénette forcée, Faux 4-2-1). */
export function evalPlayer(s: Pick<CfState, 'values'>, p: Pick<CfPlayer, 'habitues' | 'r'>): Eval {
  if (p.r.forcedNenette) {
    const combo = evaluate([2, 2, 1], s.values);
    return { combo, value: combo.value, rank: 0 };
  }
  const combo = evaluate(p.r.dice, s.values);
  let value = combo.value;
  if (combo.kind === 'suite' && p.habitues.some((h) => h.id === 'vieux-marcel')) value = 4;
  if (combo.kind === '421' && p.r.faux421) value = 2;
  return { combo, value, rank: combo.rank };
}

function setDice(p: CfPlayer, i: number, v: number) {
  if (p.r.dice[i] !== v) { p.r.dice[i] = v; p.r.forcedNenette = false; }
}

/** Pièges de fin de tour (Faux 4-2-1, Le coup de la nénette), vérifiés à la fin du tour et avant les comptes. */
function finalTraps(c: Ctx, p: CfPlayer) {
  const s = c.s;
  let e = evalPlayer(s, p);
  if (e.combo.kind === '421' && !p.r.faux421) {
    const t = trapsOn(s, p.id, 'faux-421')[0];
    if (t && triggerTrap(c, t)) {
      p.r.faux421 = true;
      emit(c, { kind: 'faux-421', player: p.id, who: p.id, text: `Le 4-2-1 de ${p.name} ne vaut plus que 2 (Faux 4-2-1).`, textYou: 'Votre 4-2-1 ne vaut plus que 2 (Faux 4-2-1).' });
    }
  }
}

/** Le coup de la nénette : vérifié aux comptes, sur le joueur qui devrait gagner avec une combinaison qui vaut 1. */
function nenetteTrap(c: Ctx, best: CfPlayer, ranks: Record<string, number>): boolean {
  const s = c.s;
  const e = evalPlayer(s, best);
  if (best.r.forcedNenette || e.value !== 1 || e.combo.kind === 'nenette') return false;
  const t = s.traps.find((x) => x.id === 'coup-nenette' && x.target === best.id && x.owner !== best.id && ranks[x.owner] < e.rank);
  if (!t || !triggerTrap(c, t)) return false;
  best.r.forcedNenette = true;
  emit(c, { kind: 'coup-nenette', player: best.id, who: best.id, text: `La combinaison de ${best.name} devient une nénette (Le coup de la nénette) !`, textYou: 'Votre combinaison devient une nénette (Le coup de la nénette) !' });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Déroulé d'une manche

function seatOrderFrom(s: CfState, startId: string): string[] {
  const n = s.players.length;
  const i0 = s.players.findIndex((p) => p.id === startId);
  const out: string[] = [];
  for (let k = 0; k < n; k++) { const p = s.players[(i0 + k) % n]; if (!p.out) out.push(p.id); }
  return out;
}

function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  if (pl(s, s.leader).out) s.leader = seatOrderFrom(s, s.leader)[0];
  s.order = seatOrderFrom(s, s.leader);
  s.turn = 0;
  s.phase = 'turn';
  s.lastword = null;
  emit(c, { kind: 'manche', text: `Manche ${s.round} : ${nm(s, s.leader)} mène.`, who: s.leader, textYou: `Manche ${s.round} : vous menez.` });
  for (const id of s.order) {
    const p = pl(s, id);
    const pen = p.penaltyNext;
    p.r = emptyRound();
    p.r.throwPenalty = pen;
    p.penaltyNext = 0;
  }
  // Service : pioche, Tournées, Patron.
  for (const id of s.order) {
    const p = pl(s, id);
    draw(c, p, 1);
    if (p.ardoiseSkip) {
      p.ardoiseSkip = false;
      emit(c, { kind: 'ardoise', player: id, who: id, text: `${p.name} rembourse l'ardoise : pas de Tournées cette manche.`, textYou: 'Vous remboursez l’ardoise : pas de Tournées cette manche.' });
    } else {
      const n = s.rules.tourneesPerRound + (s.prevLoser === id ? s.rules.tourneesLoserBonus : 0);
      gainTournees(c, p, n, false);
    }
  }
  for (const id of s.order) {
    const p = pl(s, id);
    const patrons = p.habitues.filter((h) => h.id === 'patron').length;
    if (patrons > 0) {
      const g = gainTournees(c, p, patrons, true);
      const card = s.prevLoser === id;
      emit(c, { kind: 'patron', player: id, who: id, text: `Le Patron sert ${p.name} : +${plural(g, 'Tournée')}${card ? ' et une carte' : ''}.`, textYou: `Le Patron vous sert : +${plural(g, 'Tournée')}${card ? ' et une carte' : ''}.` });
      if (card) draw(c, p, patrons, false, true);
    }
  }
  beginTurn(c);
}

function beginTurn(c: Ctx) {
  const s = c.s;
  const p = pl(s, s.order[s.turn]);
  p.r.dice = [0, 0, 0];
  p.r.throwsUsed = 0;
  p.r.done = false;
  emit(c, { kind: 'tour', player: p.id, who: p.id, text: `À ${p.name} de jouer (${plural(throwLimit(s, p.id), 'lancer')} au plus).`, textYou: `À vous de jouer (${plural(throwLimit(s, p.id), 'lancer')} au plus).` });
}

/** Nombre de lancers permis à ce joueur ce tour. */
export function throwLimit(s: CfState, pid: string): number {
  const p = pl(s, pid);
  const leader = pl(s, s.order[0]);
  // Le meneur fixe le maximum des autres (sauf s'il était lui-même limité par une Gueule de bois).
  const base = pid === s.order[0] || leader.r.throwPenalty > 0 ? s.rules.maxThrows : Math.min(s.rules.maxThrows, Math.max(1, leader.r.throwsUsed));
  return (p.r.throwPenalty > 0 ? 1 : base) + p.r.bonusThrows;
}

function rollDice(c: Ctx, p: CfPlayer, keep: boolean[]) {
  const rolled: number[] = [];
  for (let i = 0; i < 3; i++) if (!keep[i]) { setDice(p, i, c.die()); rolled.push(i); }
  p.r.throwsUsed++;
  const e = evalPlayer(c.s, p);
  emit(c, { kind: 'lancer', player: p.id, dice: [...p.r.dice], kept: [...keep], rolled, throwIndex: p.r.throwsUsed, who: p.id,
    text: `${p.name} lance : ${p.r.dice.join('-')} (${e.combo.label}).`, textYou: `Vous lancez : ${p.r.dice.join('-')} (${e.combo.label}).` });
}

function endTurn(c: Ctx, p: CfPlayer) {
  const s = c.s;
  p.r.done = true;
  const e = evalPlayer(s, p);
  emit(c, { kind: 'fin-tour', player: p.id, dice: [...p.r.dice], who: p.id, text: `${p.name} s'arrête sur ${e.combo.label}.`, textYou: `Vous vous arrêtez sur ${e.combo.label}.` });
  finalTraps(c, p);
  s.turn++;
  if (s.turn < s.order.length) beginTurn(c);
  else startLastword(c);
}

/** Classement courant de la manche : du plus mauvais au meilleur (à égalité, celui qui a joué en dernier d'abord). */
export function standing(s: CfState): string[] {
  const idx = (id: string) => s.order.indexOf(id);
  return [...s.order].sort((a, b) => (evalPlayer(s, pl(s, a)).rank - evalPlayer(s, pl(s, b)).rank) || (idx(b) - idx(a)));
}

function startLastword(c: Ctx) {
  const s = c.s;
  s.phase = 'lastword';
  s.lastword = { order: standing(s), idx: 0, passes: 0 };
  lastwordNext(c);
}

function lastwordNext(c: Ctx) {
  const s = c.s;
  const lw = s.lastword!;
  const n = lw.order.length;
  while (lw.passes < n) {
    const pid = lw.order[lw.idx % n];
    if (hasLastword(s, pid)) return;
    lw.passes++;
    lw.idx++;
  }
  settle(c);
}

function hasLastword(s: CfState, pid: string): boolean {
  const p = pl(s, pid);
  if (s.windows && mightHaveLastword(s, p)) return true;
  return p.hand.some((k) => def(k.id).type === 'dernier-mot' && cardOptions(s, p, k, false).length > 0);
}

// ---------------------------------------------------------------------------------------------
// Comptes

function settle(c: Ctx) {
  const s = c.s;
  for (const id of s.order) finalTraps(c, pl(s, id));
  const ev: Record<string, Eval> = {};
  const bestOf = () => {
    for (const id of s.order) ev[id] = evalPlayer(s, pl(s, id));
    let b = s.order[0];
    for (const id of s.order) if (ev[id].rank > ev[b].rank) b = id;
    return b;
  };
  for (let guard = 0; guard < 4; guard++) {
    const b = bestOf();
    const ranks = Object.fromEntries(s.order.map((id) => [id, ev[id].rank]));
    if (!nenetteTrap(c, pl(s, b), ranks)) break;
  }
  bestOf();
  const combos: RoundSummary['combos'] = {};
  for (const id of s.order) combos[id] = { dice: [...pl(s, id).r.dice], label: ev[id].combo.label, value: ev[id].value };

  // Égalité pour la meilleure ou pour la plus mauvaise place : personne ne donne (comme l'égalité parfaite en duel).
  let best = s.order[0];
  let worst = s.order[0];
  for (const id of s.order) {
    if (ev[id].rank > ev[best].rank) best = id;
    if (ev[id].rank < ev[worst].rank) worst = id;
  }
  const tiedBest = s.order.filter((id) => ev[id].rank === ev[best].rank).length > 1;
  const tiedWorst = s.order.filter((id) => ev[id].rank === ev[worst].rank).length > 1;
  let summary: RoundSummary;
  if (tiedBest || tiedWorst) {
    const text = ev[best].rank === ev[worst].rank ? 'Égalité parfaite : personne ne donne de jetons.' : `Égalité pour la ${tiedBest ? 'meilleure' : 'plus mauvaise'} combinaison : personne ne donne de jetons.`;
    summary = { round: s.round, winner: null, loser: null, amount: 0, reversed: false, combos, text };
    emit(c, { kind: 'comptes', text: summary.text });
    s.prevLoser = null;
  } else {
    const W = pl(s, best);
    const L = pl(s, worst);
    let amount = ev[best].value;
    const parts: string[] = [];
    if (W.r.doubles > 0) { amount *= 2 ** W.r.doubles; parts.push('Double tournée'); }
    if (W.r.noteSalee > 0) { amount += W.r.noteSalee; parts.push('La note est salée'); }
    const pari = W.r.pari + L.r.pari;
    if (pari > 0) { amount += 2 * pari; parts.push('Pari de comptoir'); }
    if (L.habitues.some((h) => h.id === 'pilier') && amount > 1) { amount -= 1; parts.push('Pilier de comptoir'); }
    if (ev[worst].combo.kind === 'nenette' && amount < s.values.nenetteMin) { amount = s.values.nenetteMin; parts.push('nénette'); }
    let reversed = false;
    if (amount >= 4) {
      const t = s.traps.find((x) => x.id === 'retournement-veste' && x.owner === L.id && x.target === W.id);
      if (t && triggerTrap(c, t)) reversed = true;
    }
    let given: number;
    if (reversed) {
      // Le gagnant reçoit les jetons à la place du perdant (pris à la réserve) ; le perdant ne reçoit rien.
      given = amount;
      W.tokens += amount;
    } else {
      given = Math.min(amount, W.tokens);
      W.tokens -= given;
      L.tokens += given;
    }
    const extra = parts.length ? ` (${parts.join(', ')})` : '';
    const text = reversed
      ? `Retournement de veste ! C'est ${W.name} qui reçoit ${plural(given, 'jeton')} à la place de ${L.name}.`
      : `${W.name} gagne la manche avec ${ev[best].combo.label} et donne ${plural(given, 'jeton')} à ${L.name}${extra}.`;
    summary = { round: s.round, winner: W.id, loser: L.id, amount: given, reversed, combos, text };
    emit(c, { kind: 'comptes', player: W.id, text });
    // Gueule de bois : le gagnant aura un lancer de moins à la manche suivante.
    for (const t of trapsOn(s, W.id, 'gueule-bois')) {
      if (triggerTrap(c, t)) {
        W.penaltyNext = 1;
        emit(c, { kind: 'gueule-bois', player: W.id, who: W.id, text: `${W.name} n'aura qu'un seul lancer à la prochaine manche (Gueule de bois).`, textYou: 'Vous n’aurez qu’un seul lancer à la prochaine manche (Gueule de bois).' });
      }
      break;
    }
    s.prevLoser = L.id;
    s.leader = L.id;
  }
  s.lastRound = summary;
  // Sorties
  for (const p of s.players) {
    if (!p.out && p.tokens <= 0) {
      p.out = true;
      p.place = s.players.filter((x) => x.out).length;
      s.ranking.push(p.id);
      emit(c, { kind: 'sortie', player: p.id, who: p.id, text: `${p.name} n'a plus de jetons : ${p.place === 1 ? 'victoire !' : `${p.place}e place.`}`, textYou: `Vous n'avez plus de jetons : ${p.place === 1 ? 'victoire !' : `${p.place}e place.`}` });
      leaveTable(s, p);
    }
  }
  const left = active(s);
  if (left.length <= 1 || (isDuel(s) && s.ranking.length > 0)) return finish(c, false);
  if (s.round >= s.rules.maxRounds) return finish(c, true);
  endRound(c);
}

function leaveTable(s: CfState, p: CfPlayer) {
  for (const t of s.traps.filter((t) => t.owner === p.id || t.target === p.id)) pl(s, t.owner).discard.push({ uid: t.uid, id: t.id });
  s.traps = s.traps.filter((t) => t.owner !== p.id && t.target !== p.id);
  p.discard.push(...p.habitues);
  p.habitues = [];
}

function finish(c: Ctx, timeUp: boolean) {
  const s = c.s;
  const rest = active(s).sort((a, b) => a.tokens - b.tokens || s.players.indexOf(a) - s.players.indexOf(b));
  for (const p of rest) { p.place = s.ranking.length + 1; s.ranking.push(p.id); }
  s.winner = s.ranking[0];
  s.phase = 'over';
  s.stack = []; s.respond = null; s.choice = null; s.lastword = null;
  const w = pl(s, s.winner);
  emit(c, { kind: 'fin', player: w.id, who: w.id, text: `${timeUp ? 'Dernière manche jouée : ' : ''}${w.name} gagne la partie !`, textYou: `${timeUp ? 'Dernière manche jouée : ' : ''}vous gagnez la partie !` });
}

function endRound(c: Ctx) {
  const s = c.s;
  // Pièges non déclenchés depuis trapReturnRounds manches (celle de la pose comprise) : retour en main.
  for (const t of [...s.traps]) {
    if (s.round - t.posedRound + 1 >= s.rules.trapReturnRounds) {
      s.traps = s.traps.filter((x) => x.uid !== t.uid);
      const o = pl(s, t.owner);
      o.hand.push({ uid: t.uid, id: t.id });
      emit(c, { kind: 'piege-retour', player: o.id, who: o.id, text: `Un piège de ${o.name} revient dans sa main.`, textYou: `Votre piège ${cardName(t.id)} revient dans votre main.` });
      if (t.id === 'leurre') draw(c, o, 1, false, true);
    }
  }
  s.discardQueue = s.order.filter((id) => pl(s, id).hand.length > s.rules.handMax);
  if (s.discardQueue.length) { s.phase = 'discard'; return; }
  startRound(c);
}

// ---------------------------------------------------------------------------------------------
// Coûts et options des cartes

/** Coût réel d'une carte pour ce joueur maintenant (Mise en bouche). */
export function costOf(_s: CfState, p: CfPlayer, id: string): number {
  return Math.max(0, def(id).cost - p.r.discount);
}

const diceIdx = [0, 1, 2];

/** Paramètres possibles pour l'effet d'un Coup (ou d'un Dernier mot), sans tenir compte du coût. */
function effectOptions(s: CfState, p: CfPlayer, id: string): PlayParams[] {
  const opps = active(s).filter((o) => o.id !== p.id);
  const myTurn = s.phase === 'turn' && s.order[s.turn] === p.id && !p.r.done;
  const rolled = p.r.throwsUsed > 0;
  const second = s.order.indexOf(p.id) > 0;
  switch (id) {
    case 'tournee-patron': case 'cul-sec': case 'pari-comptoir': case 'double-tournee': case 'coup-coude':
    case 'mise-bouche': case 'calcul-mental': case 'note-salee':
      return [{}];
    case 'tete-tourne':
      return myTurn && rolled ? diceIdx.map((die) => ({ die })) : [];
    case 'coup-pouce': case 'recompter': {
      if (id === 'coup-pouce' && !(myTurn && rolled)) return [];
      const out: PlayParams[] = [];
      for (const die of diceIdx) for (const delta of [1, -1]) {
        const v = p.r.dice[die] + delta;
        if (v >= 1 && v <= 6) out.push({ die, delta });
      }
      return out;
    }
    case 'bon-numero': {
      if (!(myTurn && rolled)) return [];
      const out: PlayParams[] = [];
      for (const die of diceIdx) for (let face = 1; face <= 6; face++) if (p.r.dice[die] !== face) out.push({ die, face });
      return out;
    }
    case 'de-sous-table': {
      if (!(myTurn && second)) return [];
      const out: PlayParams[] = [];
      for (const o of opps) if (o.r.done) for (const die of diceIdx) out.push({ target: o.id, die });
      return out;
    }
    case 'tournee-generale':
      if (!(myTurn && second && rolled)) return [];
      return opps.filter((o) => o.r.done).map((o) => ({ target: o.id }));
    case 'domino':
      return opps.map((o) => ({ target: o.id }));
    case 'fermeture': {
      const out: PlayParams[] = [];
      for (const o of opps) for (const h of o.habitues) out.push({ habitue: h.uid });
      return out;
    }
    case 'fouine': {
      const ts = s.traps.filter((t) => t.owner !== p.id);
      return ts.length ? ts.map((t) => ({ trap: t.uid })) : [{}];
    }
    default:
      return [];
  }
}

/** Options de jeu d'une carte de la main (avec coût et conditions de timing). `respond` : fenêtre de Riposte. */
function cardOptions(s: CfState, p: CfPlayer, k: CardInst, respond: boolean): PlayParams[] {
  const d = def(k.id);
  const cost = costOf(s, p, k.id);
  if (cost > p.tournees) return [];
  const opps = active(s).filter((o) => o.id !== p.id);
  if (respond) {
    if (d.type !== 'riposte') return [];
    const top = s.stack[s.stack.length - 1];
    if (!top || top.owner === p.id) return [];
    if (k.id === 'yeux-piquent') return top.kind === 'keep' ? [{}] : [];
    if (top.kind !== 'card') return [];
    if (k.id === 'ticket-caisse') return top.type === 'coup' && def(top.card.id).cost <= 2 ? [{}] : [];
    if (k.id === 'reaction-chaine') {
      if (top.type === 'habitue' && patronProtects(s, top.owner, d)) return [];
      return [{}];
    }
    return [];
  }
  if (d.type === 'riposte') return [];
  if (s.phase === 'lastword') {
    if (d.type !== 'dernier-mot') return [];
    if (k.id === 'recompter' && p.r.played < 3) return [];
    return effectOptions(s, p, k.id);
  }
  const myTurn = s.phase === 'turn' && s.order[s.turn] === p.id && !p.r.done;
  if (!myTurn) return [];
  if (d.type === 'dernier-mot') return [];
  // Un même Habitué ne peut pas être deux fois devant le même joueur (décision de Sam : rien d'inutile en jeu).
  if (d.type === 'habitue') return p.habitues.length < s.rules.maxHabitues && !p.habitues.some((h) => h.id === k.id) ? [{}] : [];
  if (d.type === 'piege') {
    if (s.traps.filter((t) => t.owner === p.id).length >= s.rules.maxTraps) return [];
    return opps.map((o) => ({ target: o.id }));
  }
  // Coup
  if (k.id === 'grand-enchainement') {
    if (!p.r.lastCoup) return [];
    return effectOptions(s, p, p.r.lastCoup);
  }
  if (k.id === 'fermeture') return effectOptions(s, p, k.id).filter((o) => !patronProtects(s, ownerOfHabitue(s, o.habitue!), d));
  return effectOptions(s, p, k.id);
}

/** Le Patron : les Habitués de ce joueur ne peuvent être ni chassés ni annulés par une carte qui coûte 2 ou moins. */
function patronProtects(s: CfState, ownerId: string, attacker: CardDef): boolean {
  return attacker.cost <= 2 && pl(s, ownerId).habitues.some((h) => h.id === 'patron');
}
const ownerOfHabitue = (s: CfState, uid: string) => s.players.find((p) => p.habitues.some((h) => h.uid === uid))!.id;

// ---------------------------------------------------------------------------------------------
// Qui doit agir

export function waitingFor(s: CfState): string[] {
  if (s.phase === 'over') return [];
  if (s.choice) return [s.choice.player];
  if (s.respond && s.respond.length) return [s.respond[0]];
  switch (s.phase) {
    case 'mulligan': return s.players.filter((p) => !p.mulliganDone).map((p) => p.id);
    case 'turn': return [s.order[s.turn]];
    case 'lastword': { const lw = s.lastword!; return [lw.order[lw.idx % lw.order.length]]; }
    case 'discard': return [s.discardQueue[0]];
  }
  return [];
}

/** Nature de la décision attendue (pour l'interface et le minuteur). */
export function decisionKind(s: CfState): 'mulligan' | 'turn' | 'respond' | 'choice' | 'lastword' | 'discard' | null {
  if (s.phase === 'over') return null;
  if (s.choice) return 'choice';
  if (s.respond && s.respond.length) return 'respond';
  return s.phase;
}

// ---------------------------------------------------------------------------------------------
// Actions légales

function subsets<T>(arr: T[], max: number): T[][] {
  const out: T[][] = [[]];
  for (let i = 0; i < arr.length; i++) {
    const n = out.length;
    for (let j = 0; j < n; j++) if (out[j].length < max) out.push([...out[j], arr[i]]);
  }
  return out;
}

const KEEPS: boolean[][] = [
  [false, false, false], [true, false, false], [false, true, false], [false, false, true],
  [true, true, false], [true, false, true], [false, true, true],
];

export function legalActions(s: CfState, pid: string): CfAction[] {
  if (!waitingFor(s).includes(pid)) return [];
  const p = pl(s, pid);
  const out: CfAction[] = [];
  if (s.choice) {
    const ch = s.choice;
    if (ch.kind === 'calcul') ch.cards.forEach((_, index) => out.push({ type: 'choose', index }));
    else if (ch.kind === 'fouine') { out.push({ type: 'choose', index: 0 }); if (p.tournees >= 1) out.push({ type: 'choose', index: 1 }); }
    else { out.push({ type: 'choose', index: -1 }); for (const i of diceIdx) out.push({ type: 'choose', index: i }); }
    return out;
  }
  if (s.respond && s.respond.length) {
    out.push({ type: 'pass' });
    for (const k of p.hand) for (const o of cardOptions(s, p, k, true)) out.push({ type: 'play', card: k.uid, ...o });
    return out;
  }
  switch (s.phase) {
    case 'mulligan':
      for (const sub of subsets(p.hand.map((k) => k.uid), s.rules.mulligan)) out.push({ type: 'mulligan', cards: sub.sort() });
      return out;
    case 'discard':
      for (const k of p.hand) out.push({ type: 'discard', card: k.uid });
      return out;
    case 'lastword':
      out.push({ type: 'pass' });
      for (const k of p.hand) for (const o of cardOptions(s, p, k, false)) out.push({ type: 'play', card: k.uid, ...o });
      return out;
    case 'turn': {
      const limit = throwLimit(s, pid);
      if (p.r.throwsUsed === 0) out.push({ type: 'roll', keep: [false, false, false] });
      else {
        if (p.r.throwsUsed < limit) for (const keep of KEEPS) out.push({ type: 'roll', keep });
        out.push({ type: 'stop' });
        const jos = p.habitues.filter((h) => h.id === 'josiane');
        if (jos.length > p.r.josianeUsed) for (const die of diceIdx) out.push({ type: 'josiane', card: jos[p.r.josianeUsed].uid, die });
      }
      for (const k of p.hand) for (const o of cardOptions(s, p, k, false)) out.push({ type: 'play', card: k.uid, ...o });
      if (!p.ardoiseUsed && p.tournees < s.rules.tourneesMax) out.push({ type: 'ardoise' });
      return out;
    }
  }
  return out;
}

const PARAM_KEYS = ['target', 'die', 'face', 'delta', 'trap', 'habitue'] as const;
/** Clé canonique d'une action (comparaison). */
export function actionKey(a: CfAction): string {
  switch (a.type) {
    case 'mulligan': return `mulligan:${[...a.cards].sort().join(',')}`;
    case 'roll': return `roll:${a.keep.map((k) => (k ? 1 : 0)).join('')}`;
    case 'josiane': return `josiane:${a.card}:${a.die}`;
    case 'choose': return `choose:${a.index}`;
    case 'discard': return `discard:${a.card}`;
    case 'play': {
      const rec = a as unknown as Record<string, unknown>;
      return `play:${a.card}:${PARAM_KEYS.map((k) => (rec[k] === undefined ? '' : String(rec[k]))).join(':')}`;
    }
    default: return a.type;
  }
}

/** Action jouée automatiquement quand le temps est écoulé. */
export function defaultAction(s: CfState, pid: string): CfAction | null {
  const legal = legalActions(s, pid);
  if (!legal.length) return null;
  if (s.choice) return legal[0];
  if (s.respond && s.respond.length) return { type: 'pass' };
  switch (s.phase) {
    case 'mulligan': return { type: 'mulligan', cards: [] };
    case 'lastword': return { type: 'pass' };
    case 'discard': {
      const p = pl(s, pid);
      const worst = [...p.hand].sort((a, b) => def(b.id).cost - def(a.id).cost)[0];
      return { type: 'discard', card: worst.uid };
    }
    case 'turn': {
      const p = pl(s, pid);
      return p.r.throwsUsed === 0 ? { type: 'roll', keep: [false, false, false] } : { type: 'stop' };
    }
  }
  return legal[0];
}

// ---------------------------------------------------------------------------------------------
// Application d'une action

export function apply(state: CfState, pid: string, action: CfAction, opts: ApplyOptions = {}): ApplyResult {
  const legal = legalActions(state, pid);
  if (!action || typeof action !== 'object') return { ok: false, error: 'Action invalide', state, events: [] };
  let key: string;
  try { key = actionKey(action); } catch { return { ok: false, error: 'Action invalide', state, events: [] }; }
  const found = legal.find((a) => actionKey(a) === key);
  if (!found) return { ok: false, error: legal.length ? 'Action impossible maintenant' : "Ce n'est pas à vous d'agir", state, events: [] };
  const s: CfState = opts.inPlace ? state : structuredClone(state);
  const c: Ctx = { s, ev: [], die: opts.rollDie ?? (() => 1 + Math.floor(rnd(s) * 6)) };
  s.version++;
  s.decisions++;
  const p = pl(s, pid);
  const a = found;
  switch (a.type) {
    case 'mulligan': doMulligan(c, p, a.cards); break;
    case 'roll': doRoll(c, p, a.keep); break;
    case 'stop': endTurn(c, p); break;
    case 'josiane': {
      p.r.josianeUsed++;
      setDice(p, a.die, c.die());
      emit(c, { kind: 'josiane', player: p.id, dice: [...p.r.dice], rolled: [a.die], who: p.id, text: `Josiane relance un dé pour ${p.name} : ${p.r.dice.join('-')}.`, textYou: `Josiane relance un de vos dés : ${p.r.dice.join('-')}.` });
      break;
    }
    case 'ardoise': {
      p.ardoiseUsed = true;
      p.ardoiseSkip = true;
      const g = gainTournees(c, p, s.rules.ardoiseLoan, false);
      emit(c, { kind: 'ardoise', player: p.id, who: p.id, text: `${p.name} prend l'ardoise : +${plural(g, 'Tournée')} (rien à la prochaine manche).`, textYou: `Vous prenez l'ardoise : +${plural(g, 'Tournée')} (rien à la prochaine manche).` });
      break;
    }
    case 'pass': {
      if (s.respond && s.respond.length) {
        s.respond.shift();
        refreshRespond(s);
        if (!s.respond.length) { s.respond = null; resolveStack(c); }
      } else if (s.phase === 'lastword') {
        const lw = s.lastword!;
        lw.passes++; lw.idx++;
        lastwordNext(c);
      }
      break;
    }
    case 'choose': doChoose(c, p, a.index); break;
    case 'discard': {
      const k = p.hand.find((x) => x.uid === a.card)!;
      p.hand = p.hand.filter((x) => x.uid !== a.card);
      p.discard.push(k);
      emit(c, { kind: 'defausse', player: p.id, card: k.id, who: p.id, text: `${p.name} défausse ${cardName(k.id)} (main pleine).`, textYou: `Vous défaussez ${cardName(k.id)} (main pleine).` });
      if (p.hand.length <= s.rules.handMax) s.discardQueue.shift();
      if (!s.discardQueue.length) startRound(c);
      break;
    }
    case 'play': doPlay(c, p, a); break;
  }
  autoStop(c);
  return { ok: true, state: s, events: c.ev };
}

/** Fin de tour automatique : plus de lancers et plus rien à jouer. */
function autoStop(c: Ctx) {
  const s = c.s;
  for (let guard = 0; guard < 8; guard++) {
    if (s.phase !== 'turn' || s.choice || (s.respond && s.respond.length) || s.stack.length) return;
    const pid = s.order[s.turn];
    const legal = legalActions(s, pid);
    if (legal.length === 1 && legal[0].type === 'stop') endTurn(c, pl(s, pid));
    else return;
  }
}

function doMulligan(c: Ctx, p: CfPlayer, uids: string[]) {
  const s = c.s;
  const back = p.hand.filter((k) => uids.includes(k.uid));
  p.hand = p.hand.filter((k) => !uids.includes(k.uid));
  p.deck.push(...back);
  draw(c, p, back.length, true);
  p.mulliganDone = true;
  emit(c, { kind: 'mulligan', player: p.id, who: p.id, text: back.length ? `${p.name} échange ${plural(back.length, 'carte')}.` : `${p.name} garde sa main.`, textYou: back.length ? `Vous échangez ${plural(back.length, 'carte')}.` : 'Vous gardez votre main.' });
  if (s.players.every((x) => x.mulliganDone)) {
    s.leader = s.players[Math.floor(rnd(s) * s.players.length)].id;
    emit(c, { kind: 'tirage', player: s.leader, who: s.leader, text: `Tirage au sort : ${nm(s, s.leader)} mène la première manche.`, textYou: 'Tirage au sort : vous menez la première manche.' });
    startRound(c);
  }
}

function doRoll(c: Ctx, p: CfPlayer, keep: boolean[]) {
  const s = c.s;
  keep = [...keep];
  const kept = keep.filter(Boolean).length;
  if (kept >= 1) {
    const t = trapsOn(s, p.id, 'croche-patte')[0];
    if (t && triggerTrap(c, t)) {
      const ks = diceIdx.filter((i) => keep[i]);
      const i = ks[Math.floor(rnd(s) * ks.length)];
      keep[i] = false;
      emit(c, { kind: 'croche-patte', player: p.id, who: p.id, text: `Croche-patte : le ${p.r.dice[i]} de ${p.name} repart au lancer.`, textYou: `Croche-patte : votre ${p.r.dice[i]} repart au lancer.` });
    }
  }
  if (keep.some(Boolean)) {
    s.stack.push({ kind: 'keep', owner: p.id, keep, cancelled: false });
    openRespond(c);
  } else rollDice(c, p, keep);
}

function doPlay(c: Ctx, p: CfPlayer, a: Extract<CfAction, { type: 'play' }>) {
  const s = c.s;
  const k = p.hand.find((x) => x.uid === a.card)!;
  const d = def(k.id);
  const cost = costOf(s, p, k.id);
  const params: PlayParams = {};
  for (const key of PARAM_KEYS) if (a[key] !== undefined) (params as Record<string, unknown>)[key] = a[key];
  p.tournees -= cost;
  p.r.discount = 0;
  p.hand = p.hand.filter((x) => x.uid !== k.uid);
  const playedBefore = p.r.played;
  p.r.played++;
  const responding = !!(s.respond && s.respond.length);
  if (responding) s.respond = null;
  const targetIdx = d.type === 'riposte' ? s.stack.length - 1 : null;
  if (d.type === 'coup' && k.id !== 'grand-enchainement') p.r.lastCoup = k.id;

  if (d.type === 'piege') {
    emit(c, { kind: 'pose', player: p.id, who: p.id, text: `${p.name} pose un piège${isDuel(s) ? '' : ` sur ${nm(s, params.target!)}`}.`, textYou: `Vous posez ${cardName(k.id)}${isDuel(s) ? '' : ` sur ${nm(s, params.target!)}`}.` });
  } else {
    const verb = d.type === 'habitue' ? 'installe' : 'joue';
    emit(c, { kind: 'carte', player: p.id, card: k.id, who: p.id, text: `${p.name} ${verb} ${d.name}${cost !== d.cost ? ` (pour ${plural(cost, 'Tournée')})` : ''}.`, textYou: `Vous ${verb === 'joue' ? 'jouez' : 'installez'} ${d.name}.` });
  }
  if (d.type === 'coup') {
    for (const t of trapsOn(s, p.id, 'ardoise-piegee')) {
      if (!triggerTrap(c, t)) continue;
      if (p.tournees >= 2) {
        p.tournees -= 2;
        emit(c, { kind: 'ardoise-piegee', player: p.id, who: p.id, text: `Ardoise piégée : ${p.name} paie 2 Tournées de plus.`, textYou: 'Ardoise piégée : vous payez 2 Tournées de plus.' });
      } else {
        p.discard.push(k);
        emit(c, { kind: 'annule', player: p.id, card: k.id, who: p.id, text: `Ardoise piégée : ${p.name} ne peut pas payer, ${d.name} est annulé.`, textYou: `Ardoise piégée : vous ne pouvez pas payer, ${d.name} est annulé.` });
        return;
      }
    }
  }
  const returnsToHand = k.id === 'reaction-chaine' && p.r.played >= 3;
  s.stack.push({ kind: 'card', owner: p.id, card: k, type: d.type, params, cost, cancelled: false, playedBefore, returnsToHand, targetIdx });
  if (s.phase === 'lastword' && !responding && d.type === 'dernier-mot') s.lastword!.passes = 0;
  openRespond(c);
}

function eligibleResponders(s: CfState, top: StackItem): string[] {
  const seats = seatOrderFrom(s, top.owner).slice(1);
  return seats.filter((id) => { const q = pl(s, id); return (s.windows && mightRespond(s, q, top)) || q.hand.some((k) => cardOptions(s, q, k, true).length > 0); });
}

// Fenêtres à l'aveugle : ce qu'un adversaire peut déduire de l'information publique seulement
// (familles du deck, Tournées, réduction, cartes déjà jouées dans la manche).
const canPay = (p: CfPlayer, cost: number) => Math.max(0, cost - p.r.discount) <= p.tournees;
/** Ce joueur pourrait-il avoir une Riposte jouable contre cet élément de la pile ? */
export function mightRespond(_s: CfState, p: CfPlayer, top: StackItem): boolean {
  if (top.owner === p.id || p.out) return false;
  const f = p.families;
  if (top.kind === 'keep') return f.includes('ivresse') && canPay(p, def('yeux-piquent').cost);
  if (f.includes('chaines') && canPay(p, def('reaction-chaine').cost)) return true;
  return f.includes('habitues') && top.type === 'coup' && def(top.card.id).cost <= 2 && canPay(p, def('ticket-caisse').cost);
}
/** Ce joueur pourrait-il avoir un Dernier mot jouable ? */
export function mightHaveLastword(_s: CfState, p: CfPlayer): boolean {
  if (p.out) return false;
  const f = p.families;
  if (f.includes('habitues') && canPay(p, def('note-salee').cost)) return true;
  return f.includes('chaines') && p.r.played >= 3 && canPay(p, def('recompter').cost);
}
function refreshRespond(s: CfState) {
  const top = s.stack[s.stack.length - 1];
  if (!s.respond || !top) return;
  const ok = new Set(eligibleResponders(s, top));
  s.respond = s.respond.filter((id) => ok.has(id));
}
function openRespond(c: Ctx) {
  const s = c.s;
  const top = s.stack[s.stack.length - 1];
  const q = eligibleResponders(s, top);
  if (q.length) { s.respond = q; return; }
  s.respond = null;
  resolveStack(c);
}

function resolveStack(c: Ctx) {
  const s = c.s;
  while (s.stack.length && !s.choice) {
    const it = s.stack.pop()!;
    const owner = pl(s, it.owner);
    if (it.kind === 'keep') {
      rollDice(c, owner, it.keep);
      continue;
    }
    if (it.cancelled) {
      owner.discard.push(it.card);
      emit(c, { kind: 'annule', player: owner.id, card: it.card.id, who: owner.id, text: `${it.type === 'piege' ? 'Le piège' : cardName(it.card.id)} de ${owner.name} est annulé.`, textYou: `${it.type === 'piege' ? 'Votre piège' : cardName(it.card.id)} est annulé.` });
      if (it.type === 'piege') emit(c, { kind: 'revele', player: owner.id, card: it.card.id, text: `C'était ${cardName(it.card.id)}.` });
      continue;
    }
    resolveCard(c, it);
  }
  if (!s.stack.length && !s.choice) afterStack(c);
}

function afterStack(c: Ctx) {
  const s = c.s;
  if (s.phase === 'lastword' && s.lastword) {
    // Après un Dernier mot (et ses réponses), on passe au joueur suivant.
    if (s.lastword.passes === 0) s.lastword.idx++;
    lastwordNext(c);
  }
}

function resolveCard(c: Ctx, it: Extract<StackItem, { kind: 'card' }>) {
  const s = c.s;
  const p = pl(s, it.owner);
  const id = it.card.id;
  const d = def(id);
  if (d.type === 'habitue') {
    p.habitues.push(it.card);
    return;
  }
  if (d.type === 'piege') {
    const target = it.params.target!;
    s.traps.push({ uid: it.card.uid, id, owner: p.id, target, posedRound: s.round, seenBy: [p.id] });
    return;
  }
  if (d.type === 'riposte') {
    const target = s.stack[it.targetIdx!];
    if (id === 'yeux-piquent') {
      if (target && target.kind === 'keep') {
        target.keep = [false, false, false];
        const o = pl(s, target.owner);
        emit(c, { kind: 'yeux-piquent', player: o.id, who: o.id, text: `Les yeux qui piquent : ${o.name} doit relâcher tous ses dés.`, textYou: 'Les yeux qui piquent : vous devez relâcher tous vos dés.' });
      }
    } else if (target) {
      target.cancelled = true;
    }
    if (it.returnsToHand) {
      p.hand.push(it.card);
      emit(c, { kind: 'retour-main', player: p.id, card: id, who: p.id, text: `Réaction en chaîne revient dans la main de ${p.name}.`, textYou: 'Réaction en chaîne revient dans votre main.' });
    } else p.discard.push(it.card);
    return;
  }
  // Coup ou Dernier mot
  p.discard.push(it.card);
  if (id === 'grand-enchainement') {
    const replay = p.r.lastCoup;
    if (!replay) return;
    emit(c, { kind: 'rejoue', player: p.id, card: replay, who: p.id, text: `Le grand enchaînement : ${p.name} rejoue ${cardName(replay)}.`, textYou: `Le grand enchaînement : vous rejouez ${cardName(replay)}.` });
    // Revalide la cible (elle a pu changer pendant la chaîne).
    if (!effectOptions(s, p, replay).some((o) => sameParams(o, it.params))) return;
    effect(c, p, replay, it.params, it.playedBefore);
    return;
  }
  if (!effectOptions(s, p, id).some((o) => sameParams(o, it.params))) {
    emit(c, { kind: 'sans-effet', player: p.id, card: id, text: `${d.name} n'a plus d'effet.` });
    return;
  }
  effect(c, p, id, it.params, it.playedBefore);
}

function sameParams(a: PlayParams, b: PlayParams): boolean {
  return PARAM_KEYS.every((k) => a[k] === b[k]);
}

function effect(c: Ctx, p: CfPlayer, id: string, prm: PlayParams, playedBefore: number) {
  const s = c.s;
  const you = (t: string, y: string, extra: Partial<CfEvent> = {}) => emit(c, { kind: 'effet', player: p.id, card: id, who: p.id, text: t, textYou: y, ...extra });
  switch (id) {
    case 'tournee-patron': {
      const g = gainTournees(c, p, 2, true);
      you(`${p.name} gagne ${plural(g, 'Tournée')}.`, `Vous gagnez ${plural(g, 'Tournée')}.`);
      break;
    }
    case 'fermeture': {
      const owner = s.players.find((o) => o.habitues.some((h) => h.uid === prm.habitue));
      if (!owner) break;
      const h = owner.habitues.find((x) => x.uid === prm.habitue)!;
      owner.habitues = owner.habitues.filter((x) => x.uid !== h.uid);
      owner.hand.push(h);
      emit(c, { kind: 'effet', player: owner.id, card: id, who: owner.id, text: `Fermeture ! ${cardName(h.id)} retourne dans la main de ${owner.name}.`, textYou: `Fermeture ! ${cardName(h.id)} retourne dans votre main.` });
      break;
    }
    case 'note-salee': p.r.noteSalee++; break;
    case 'cul-sec':
      p.r.bonusThrows++;
      you(`${p.name} a droit à un lancer de plus.`, 'Vous avez droit à un lancer de plus.');
      break;
    case 'tete-tourne':
      setDice(p, prm.die!, 7 - p.r.dice[prm.die!]);
      you(`${p.name} retourne un dé : ${p.r.dice.join('-')}.`, `Vous retournez un dé : ${p.r.dice.join('-')}.`, { dice: [...p.r.dice] });
      break;
    case 'pari-comptoir': p.r.pari++; break;
    case 'double-tournee': p.r.doubles++; break;
    case 'coup-pouce': case 'recompter':
      setDice(p, prm.die!, p.r.dice[prm.die!] + prm.delta!);
      you(`${p.name} ${prm.delta! > 0 ? 'ajoute' : 'retire'} 1 à un dé : ${p.r.dice.join('-')}.`, `Vous ${prm.delta! > 0 ? 'ajoutez' : 'retirez'} 1 à un dé : ${p.r.dice.join('-')}.`, { dice: [...p.r.dice] });
      break;
    case 'bon-numero':
      setDice(p, prm.die!, prm.face!);
      you(`${p.name} met un dé sur ${prm.face} : ${p.r.dice.join('-')}.`, `Vous mettez un dé sur ${prm.face} : ${p.r.dice.join('-')}.`, { dice: [...p.r.dice] });
      break;
    case 'de-sous-table': {
      const o = pl(s, prm.target!);
      setDice(o, prm.die!, c.die());
      emit(c, { kind: 'effet', player: o.id, card: id, who: o.id, dice: [...o.r.dice], rolled: [prm.die!], text: `Le dé sous la table : un dé de ${o.name} est relancé (${o.r.dice.join('-')}).`, textYou: `Le dé sous la table : un de vos dés est relancé (${o.r.dice.join('-')}).` });
      break;
    }
    case 'tournee-generale': {
      const o = pl(s, prm.target!);
      for (const i of diceIdx) setDice(o, i, c.die());
      for (const i of diceIdx) setDice(p, i, c.die());
      emit(c, { kind: 'effet', player: o.id, card: id, who: o.id, dice: [...o.r.dice], rolled: [0, 1, 2], text: `Tournée générale : ${o.name} relance tout (${o.r.dice.join('-')}).`, textYou: `Tournée générale : vous relancez tout (${o.r.dice.join('-')}).` });
      you(`Tournée générale : ${p.name} relance tout (${p.r.dice.join('-')}).`, `Tournée générale : vous relancez tout (${p.r.dice.join('-')}).`, { dice: [...p.r.dice], rolled: [0, 1, 2] });
      s.choice = { kind: 'tournee-generale', player: p.id };
      break;
    }
    case 'domino': {
      const o = pl(s, prm.target!);
      const n = Math.min(o.tournees, playedBefore);
      o.tournees -= n;
      emit(c, { kind: 'effet', player: o.id, card: id, who: o.id, text: `Domino : ${o.name} perd ${plural(n, 'Tournée')}.`, textYou: `Domino : vous perdez ${plural(n, 'Tournée')}.` });
      break;
    }
    case 'fouine': {
      if (!prm.trap) {
        you(`Aucun piège en vue : ${p.name} pioche 1 carte.`, 'Aucun piège en vue : vous piochez 1 carte.');
        draw(c, p, 1, false, true);
        break;
      }
      const t = s.traps.find((x) => x.uid === prm.trap);
      if (!t) break;
      if (!t.seenBy.includes(p.id)) t.seenBy.push(p.id);
      emit(c, { kind: 'fouine', player: p.id, card: t.id, to: [p.id], text: `La Fouine vous montre le piège : ${cardName(t.id)}.` });
      emit(c, { kind: 'fouine-public', player: p.id, text: `${p.name} regarde un piège de ${nm(s, t.owner)}.` });
      if (t.id === 'leurre' && !t.revealed) {
        t.revealed = true;
        const o = pl(s, t.owner);
        emit(c, { kind: 'leurre', player: o.id, who: o.id, text: `C'était un Leurre : ${o.name} pioche 1 carte.`, textYou: 'Votre Leurre est découvert : vous piochez 1 carte.' });
        draw(c, o, 1, false, true);
      }
      if (p.tournees >= 1) s.choice = { kind: 'fouine', player: p.id, trap: t.uid, cardId: t.id };
      break;
    }
    case 'coup-coude': draw(c, p, 1, false, true); break;
    case 'mise-bouche':
      p.r.discount += 2;
      you(`${p.name} : sa prochaine carte coûtera 2 de moins.`, 'Votre prochaine carte coûtera 2 de moins.');
      break;
    case 'calcul-mental': {
      const top = p.deck.splice(0, 3);
      if (top.length === 0) { you(`${p.name} n'a plus de cartes à regarder.`, 'Votre deck est vide.'); break; }
      if (top.length === 1) { p.hand.push(top[0]); mainSac(c, p, 0, 1); break; }
      s.choice = { kind: 'calcul', player: p.id, cards: top };
      break;
    }
  }
}

function doChoose(c: Ctx, p: CfPlayer, index: number) {
  const s = c.s;
  const ch = s.choice!;
  s.choice = null;
  if (ch.kind === 'calcul') {
    const keep = ch.cards[index];
    p.hand.push(keep);
    p.deck.push(...ch.cards.filter((_, i) => i !== index));
    emit(c, { kind: 'calcul', player: p.id, who: p.id, text: `${p.name} garde une carte et remet les autres sous son deck.`, textYou: `Vous gardez ${cardName(keep.id)}.` });
    mainSac(c, p, 0, 1);
  } else if (ch.kind === 'fouine') {
    const t = s.traps.find((x) => x.uid === ch.trap);
    if (index === 1 && t) {
      p.tournees -= 1;
      s.traps = s.traps.filter((x) => x.uid !== t.uid);
      pl(s, t.owner).discard.push({ uid: t.uid, id: t.id });
      emit(c, { kind: 'fouine-defausse', player: p.id, card: t.id, who: p.id, text: `${p.name} paie 1 Tournée et défausse le piège ${cardName(t.id)} de ${nm(s, t.owner)}.`, textYou: `Vous payez 1 Tournée et défaussez ${cardName(t.id)}.` });
    }
  } else if (ch.kind === 'tournee-generale' && index >= 0) {
    setDice(p, index, c.die());
    emit(c, { kind: 'effet', player: p.id, card: 'tournee-generale', dice: [...p.r.dice], rolled: [index], who: p.id, text: `${p.name} relance un dé : ${p.r.dice.join('-')}.`, textYou: `Vous relancez un dé : ${p.r.dice.join('-')}.` });
  }
  resolveStack(c);
}

// ---------------------------------------------------------------------------------------------
// Information partielle

export interface CfPlayerView {
  id: string;
  name: string;
  tokens: number;
  tournees: number;
  handCount: number;
  /** Seulement pour soi. */
  hand?: CardInst[];
  deckCount: number;
  families: CardFamily[];
  discard: CardInst[];
  habitues: CardInst[];
  ardoiseUsed: boolean;
  ardoiseSkip: boolean;
  penaltyNext: number;
  out: boolean;
  place: number | null;
  r: RoundState;
  throwLimit: number | null;
}

export interface CfTrapView { uid: string; owner: string; target: string; posedRound: number; id: string | null }

export interface CfView {
  you: string;
  phase: CfPhase;
  round: number;
  leader: string;
  order: string[];
  turn: number;
  /** Joueurs qui doivent agir. */
  waiting: string[];
  decision: ReturnType<typeof decisionKind>;
  rules: CfRules;
  values: ComboValues;
  players: CfPlayerView[];
  traps: CfTrapView[];
  stack: ({ kind: 'keep'; owner: string; keep: boolean[] } | { kind: 'card'; owner: string; cardId: string | null; type: CardType; params: PlayParams })[];
  choice: Choice | { kind: Choice['kind']; player: string } | null;
  lastword: CfState['lastword'];
  lastRound: RoundSummary | null;
  ranking: string[];
  winner: string | null;
  version: number;
}

export function viewFor(s: CfState, pid: string): CfView {
  return {
    you: pid,
    phase: s.phase,
    round: s.round,
    leader: s.leader,
    order: [...s.order],
    turn: s.turn,
    waiting: waitingFor(s),
    decision: decisionKind(s),
    rules: { ...s.rules },
    values: { ...s.values },
    players: s.players.map((p) => ({
      id: p.id, name: p.name, tokens: p.tokens, tournees: p.tournees, handCount: p.hand.length,
      hand: p.id === pid ? p.hand.map((k) => ({ ...k })) : undefined,
      deckCount: p.deck.length, families: [...p.families], discard: p.discard.map((k) => ({ ...k })),
      habitues: p.habitues.map((k) => ({ ...k })), ardoiseUsed: p.ardoiseUsed, ardoiseSkip: p.ardoiseSkip,
      penaltyNext: p.penaltyNext, out: p.out, place: p.place, r: structuredClone(p.r),
      throwLimit: s.phase === 'turn' && s.order.includes(p.id) && s.order.indexOf(p.id) <= s.turn ? throwLimit(s, p.id) : null,
    })),
    traps: s.traps.map((t) => ({ uid: t.uid, owner: t.owner, target: t.target, posedRound: t.posedRound, id: t.seenBy.includes(pid) ? t.id : null })),
    stack: s.stack.map((it) => it.kind === 'keep'
      ? { kind: 'keep' as const, owner: it.owner, keep: [...it.keep] }
      : { kind: 'card' as const, owner: it.owner, cardId: it.type === 'piege' && it.owner !== pid ? null : it.card.id, type: it.type, params: it.type === 'piege' && it.owner !== pid ? { target: it.params.target } : { ...it.params } }),
    choice: s.choice ? (s.choice.player === pid ? structuredClone(s.choice) : { kind: s.choice.kind, player: s.choice.player }) : null,
    lastword: s.lastword ? structuredClone(s.lastword) : null,
    lastRound: s.lastRound ? structuredClone(s.lastRound) : null,
    ranking: [...s.ranking],
    winner: s.winner,
    version: s.version,
  };
}

/** Événements visibles par ce joueur, avec le texte à la 2e personne quand il est concerné. */
export function eventsFor(events: CfEvent[], pid: string): CfEvent[] {
  return events
    .filter((e) => !e.to || e.to.includes(pid))
    .filter((e) => !(e.kind === 'pioche' && e.player === pid)) // le joueur a déjà la version privée
    .map((e) => {
      const { textYou, ...rest } = e;
      return e.who === pid && textYou ? { ...rest, text: textYou } : rest;
    });
}
