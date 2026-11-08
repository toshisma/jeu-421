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
  /** « Commande du comptoir » : une règle bonus tirée au hasard à chaque manche (0.39). */
  commandes?: boolean;
  /**
   * Parties en ligne : fenêtres de réponse « à l'aveugle ». Une Riposte ou un Dernier mot est proposé
   * à tout joueur qui POURRAIT en avoir un d'après l'information publique (familles de son deck,
   * Tournées, réduction en cours), et pas seulement à ceux qui en ont vraiment un : ainsi, qu'on
   * ait ou non la carte, la partie marque la même pause (le serveur fixe sa durée). Les règles ne
   * changent pas (sans la carte, on ne peut que passer).
   */
  windows?: boolean;
}

export interface CardInst { uid: string; id: string; /** Habitué en jeu : manches restantes (celle en cours comprise). */ rounds?: number; /** Habitué débauché : joueur à qui la carte revient quand il quitte le comptoir. */ from?: string }

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
  /** On efface tout : si ce joueur perd la manche, il ne reçoit qu'un jeton (> 0 ; 0.40, avant : aucun). */
  efface?: number;
  /** Carte qui limite ce joueur à un seul lancer (Gueule de bois, Le verre offert). */
  penaltyCard?: string;
  /** 0.46 — L’Addition : si ce joueur gagne, sa combinaison vaut au moins 3. */
  addition?: number;
  /** 0.46 — À votre santé ! : si ce joueur perd, le gagnant reçoit aussi ce nombre de jetons. */
  sante?: number;
  /** 0.46 — La Souricière / Le Nœud coulant : plus aucune carte jouable cette manche (carte responsable). */
  locked?: string;
  /** 0.46 — L’Effet papillon : réduction de toutes les cartes jusqu'à la fin de la manche. */
  roundDiscount?: number;
  /** 0.46 — moment (numéro de décision) du dernier Coup joué, pour L’Écho. */
  lastCoupAt?: number;
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
  /** Carte à l'origine de penaltyNext (Gueule de bois, Le verre offert). */
  penaltyNextCard?: string;
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
      /** 0.46 — Retour à l’envoyeur : la carte annulée retourne dans la main de son joueur. */
      backToHand?: boolean;
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
  /** Détail du montant : valeur de la combinaison, puis chaque carte qui l'a changé (affiché aux comptes). */
  detail?: { label: string; delta: number }[];
  /** Le gagnant n'avait pas assez de jetons : il a donné tout ce qu'il avait (montant prévu). */
  cappedFrom?: number;
}

/**
 * Commandes du comptoir (0.39, idée validée par Sam) : une règle bonus par manche, la même pour tous,
 * annoncée en grand au début de la manche. Une phrase chacune, rien à retenir d'une manche à l'autre.
 */
export const COMMANDES: { id: string; title: string; text: string }[] = [
  { id: 'brelans', title: 'Brelans +2', text: 'Les brelans valent 2 de plus.' },
  { id: 'suites', title: 'Suites à 4', text: 'Les suites valent 4.' },
  { id: '421', title: '4-2-1 à 10', text: 'Le 4-2-1 vaut 10.' },
  { id: 'nenette', title: 'Nénette à 4', text: 'Celui qui perd avec une nénette reçoit au moins 4 jetons.' },
  { id: 'tournees', title: 'Tournée générale', text: 'Chacun reçoit 1 Tournée de plus au service.' },
  { id: 'pioche', title: 'Bonne pioche', text: 'Chacun pioche 1 carte de plus au service.' },
  { id: 'lancers', title: 'Un pour la route', text: 'Un lancer de plus pour tout le monde.' },
  { id: 'consolation', title: 'Consolation', text: 'Le perdant de la manche pioche 2 cartes.' },
];
export const commandeOf = (id: string | null | undefined) => COMMANDES.find((c) => c.id === id) ?? null;

export interface CfState {
  v: 1;
  /** Commandes du comptoir activées (partie de l'ordinateur, en ligne) et celle de la manche en cours. */
  commandes?: boolean;
  commande?: string | null;
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
  /** Joueur visé (pose d'un piège à 3-4 joueurs). */
  target?: string;
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
    pari: 0, doubles: 0, noteSalee: 0, faux421: false, forcedNenette: false, efface: 0, dice: [0, 0, 0], throwsUsed: 0, done: false,
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
  if (config.commandes) { s.commandes = true; s.commande = null; }
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
}

/** Gain de Tournées (réserve max). `viaCard` : gain dû à une carte (sans effet depuis la refonte de Main dans le sac). */
function gainTournees(c: Ctx, p: CfPlayer, n: number, viaCard: boolean): number {
  if (viaCard && n > 0 && !p.out) {
    // Le Pique-assiette (0.46) : les Tournées gagnées grâce à une carte vont à celui qui l'a posé.
    const t = trapsOn(c.s, p.id, 'pique-assiette')[0];
    if (t && triggerTrap(c, t)) {
      const o = pl(c.s, t.owner);
      const g = gainTournees(c, o, n, true);
      emit(c, { kind: 'pique-assiette', player: p.id, card: 'pique-assiette', who: o.id, text: `Le Pique-assiette : ${o.name} prend les ${plural(n, 'Tournée')} de ${p.name} (+${g}).`, textYou: `Votre Pique-assiette prend les ${plural(n, 'Tournée')} de ${p.name} (+${g}).` });
      return 0;
    }
  }
  const got = Math.max(0, Math.min(n, c.s.rules.tourneesMax - p.tournees));
  p.tournees += got;
  return got;
}

// ---------------------------------------------------------------------------------------------
// Pièges

const trapsOn = (s: CfState, target: string, id: string) => s.traps.filter((t) => t.target === target && t.id === id && t.owner !== target);
/** Pièges posés devant ce joueur (tous poseurs confondus). */
export const trapsBefore = (s: { traps: { target: string }[] }, target: string) => s.traps.filter((t) => t.target === target).length;
/** 0.46 (demande de Sam) : au plus maxTrapsOn pièges devant un même joueur (anciens états : maxTraps). */
export const maxTrapsOn = (s: Pick<CfState, 'rules'>) => s.rules.maxTrapsOn ?? s.rules.maxTraps;
/** Ce joueur peut-il poser un piège devant cette cible (place devant elle, et pas plus de maxTraps posés par lui) ? */
export function canPoseOn(s: Pick<CfState, 'traps' | 'rules'>, owner: string, target: string): boolean {
  return trapsBefore(s, target) < maxTrapsOn(s) && s.traps.filter((t) => t.owner === owner).length < s.rules.maxTraps;
}
/** Le Garde champêtre (0.46) : les Coups et Derniers mots adverses ne touchent pas aux dés de ce joueur. */
export const guarded = (p: Pick<CfPlayer, 'habitues'>) => p.habitues.some((h) => h.id === 'garde-champetre');

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
  complice(c, owner);
  return true;
}

/** Le Complice (0.40) : quand un piège de son patron se déclenche, +1 Tournée et 1 carte. */
/** Le Leurre révélé ou revenu en main : Tournée(s) et carte(s) pour son poseur. */
function leurreBonus(c: Ctx, o: CfPlayer) {
  gainTournees(c, o, LEURRE_TOURNEES, true);
  draw(c, o, LEURRE_DRAW, false, true);
}

function complice(c: Ctx, owner: CfPlayer) {
  if (owner.out || !owner.habitues.some((h) => h.id === 'complice')) return;
  const g = gainTournees(c, owner, 1, true);
  emit(c, { kind: 'complice', player: owner.id, card: 'complice', who: owner.id, text: `Le Complice de ${owner.name} : +${plural(g, 'Tournée')} et une carte.`, textYou: `Votre Complice : +${plural(g, 'Tournée')} et une carte.` });
  draw(c, owner, 1, false, true);
}

// ---------------------------------------------------------------------------------------------
// Combinaisons

export interface Eval { combo: Combo; value: number; rank: number }

/** Combinaison d'un joueur, avec les effets de cartes (Vieux Marcel, nénette forcée, Faux 4-2-1). */
export function evalPlayer(s: Pick<CfState, 'values'> & { commande?: string | null }, p: Pick<CfPlayer, 'habitues' | 'r'>): Eval {
  if (p.r.forcedNenette) {
    const combo = evaluate([2, 2, 1], s.values);
    return { combo, value: combo.value, rank: 0 };
  }
  const combo = evaluate(p.r.dice, s.values);
  let value = combo.value;
  if (combo.kind === 'suite' && (p.habitues.some((h) => h.id === 'vieux-marcel') || s.commande === 'suites')) value = Math.max(value, 4);
  if (combo.kind === 'brelan' && s.commande === 'brelans') value += 2;
  if (combo.kind === 'brelan' && p.habitues.some((h) => h.id === 'joueur-belote')) value += BELOTE_BONUS;
  if (combo.kind === '421' && s.commande === '421') value = 10;
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
  if (best.r.forcedNenette || e.value > 2 || e.combo.kind === 'nenette') return false;
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
  if (s.commandes) {
    // Commande du comptoir : tirée au hasard, jamais deux fois de suite la même.
    const pool = COMMANDES.filter((x) => x.id !== s.commande);
    const k = pool[Math.floor(rnd(s) * pool.length)];
    s.commande = k.id;
    emit(c, { kind: 'commande', text: `Commande du comptoir : ${k.text}`, card: undefined });
  }
  for (const id of s.order) {
    const p = pl(s, id);
    const pen = p.penaltyNext;
    p.r = emptyRound();
    p.r.throwPenalty = pen;
    if (pen) p.r.penaltyCard = p.penaltyNextCard ?? 'gueule-bois';
    p.penaltyNext = 0;
    delete p.penaltyNextCard;
  }
  // Service : pioche, Tournées, Patron.
  for (const id of s.order) {
    const p = pl(s, id);
    draw(c, p, s.commande === 'pioche' ? 2 : 1);
    if (p.ardoiseSkip) {
      p.ardoiseSkip = false;
      emit(c, { kind: 'ardoise', player: id, who: id, text: `${p.name} rembourse l'ardoise : pas de Tournées cette manche.`, textYou: 'Vous remboursez l’ardoise : pas de Tournées cette manche.' });
    } else {
      const n = s.rules.tourneesPerRound + (s.prevLoser === id ? s.rules.tourneesLoserBonus : 0) + (s.commande === 'tournees' ? 1 : 0);
      gainTournees(c, p, n, false);
    }
  }
  for (const id of s.order) {
    const p = pl(s, id);
    const patrons = p.habitues.filter((h) => h.id === 'patron').length;
    if (patrons > 0) {
      const g = gainTournees(c, p, patrons, true);
      const card = true; // 0.39 : le Patron sert toujours une carte avec la Tournée (il ne reste que 3 manches)
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
  return (p.r.throwPenalty > 0 ? 1 : base) + p.r.bonusThrows + (s.commande === 'lancers' ? 1 : 0) + p.habitues.filter((h) => h.id === 'pochtron').length;
}

function rollDice(c: Ctx, p: CfPlayer, keep: boolean[]) {
  const kept = [0, 1, 2].filter((i) => keep[i]);
  if (kept.length && p.r.throwsUsed > 0 && !guarded(p)) {
    // Le Hoquet (0.46) : un des dés gardés est relancé aussi.
    const t = trapsOn(c.s, p.id, 'hoquet')[0];
    if (t && triggerTrap(c, t)) {
      const i = kept[Math.floor(rnd(c.s) * kept.length)];
      keep = keep.map((k, j) => k && j !== i);
      emit(c, { kind: 'hoquet', player: p.id, card: 'hoquet', who: p.id, text: `Le Hoquet : ${p.name} relance aussi son ${p.r.dice[i]} gardé.`, textYou: `Le Hoquet : votre ${p.r.dice[i]} gardé est relancé aussi.` });
    }
  }
  const rolled: number[] = [];
  for (let i = 0; i < 3; i++) if (!keep[i]) { setDice(p, i, c.die()); rolled.push(i); }
  p.r.throwsUsed++;
  const e = evalPlayer(c.s, p);
  const vt = p.r.throwsUsed === 2 ? trapsOn(c.s, p.id, 'verre-de-trop')[0] : undefined;
  emit(c, { kind: 'lancer', player: p.id, dice: [...p.r.dice], kept: [...keep], rolled, throwIndex: p.r.throwsUsed, who: p.id,
    text: `${p.name} lance : ${p.r.dice.join('-')} (${e.combo.label}).`, textYou: `Vous lancez : ${p.r.dice.join('-')} (${e.combo.label}).` });
  // Le Verre de trop (0.40) : au 2e lancer du tour, le joueur piégé reçoit 1 jeton.
  if (vt && triggerTrap(c, vt)) {
    p.tokens += 1;
    emit(c, { kind: 'verre-de-trop', player: p.id, card: 'verre-de-trop', who: p.id, text: `Le Verre de trop : ${p.name} reçoit 1 jeton (2e lancer).`, textYou: 'Le Verre de trop : vous recevez 1 jeton (2e lancer).' });
  }
}

function endTurn(c: Ctx, p: CfPlayer) {
  const s = c.s;
  p.r.done = true;
  // Croche-patte : à la fin du tour, un dé du joueur piégé est relancé au hasard.
  const cp = guarded(p) ? undefined : trapsOn(s, p.id, 'croche-patte')[0];
  if (cp && triggerTrap(c, cp)) {
    const i = Math.floor(rnd(s) * 3);
    const before = p.r.dice[i];
    setDice(p, i, c.die());
    emit(c, { kind: 'croche-patte', player: p.id, who: p.id, dice: [...p.r.dice], rolled: [i], text: `Croche-patte : le ${before} de ${p.name} est relancé (${p.r.dice.join('-')}).`, textYou: `Croche-patte : votre ${before} est relancé (${p.r.dice.join('-')}).` });
  }
  // La Peau de banane (0.46) : sur une combinaison qui vaut 4 ou plus, un dé est relancé au hasard.
  if (evalPlayer(s, p).value >= PEAU_MIN && !guarded(p)) {
    const pb = trapsOn(s, p.id, 'peau-banane')[0];
    if (pb && triggerTrap(c, pb)) {
      const i = Math.floor(rnd(s) * 3);
      const before = p.r.dice[i];
      setDice(p, i, c.die());
      emit(c, { kind: 'peau-banane', player: p.id, who: p.id, dice: [...p.r.dice], rolled: [i], text: `La Peau de banane : le ${before} de ${p.name} est relancé (${p.r.dice.join('-')}).`, textYou: `La Peau de banane : votre ${before} est relancé (${p.r.dice.join('-')}).` });
    }
  }
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
    // Égalité en tête : personne ne « devrait gagner », Le coup de la nénette ne se déclenche pas.
    if (s.order.filter((id) => ev[id].rank === ev[b].rank).length > 1) break;
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
    const detail: { label: string; delta: number }[] = [{ label: ev[best].combo.label, delta: amount }];
    const step = (label: string, next: number) => { detail.push({ label, delta: next - amount }); amount = next; parts.push(label); };
    if ((W.r.addition ?? 0) > 0 && amount < 3) step('L’Addition', 3);
    if (W.r.doubles > 0) step('Double tournée', amount * 2 ** W.r.doubles);
    if (W.r.noteSalee > 0) step('La note est salée', amount + 2 * W.r.noteSalee);
    const pari = W.r.pari + L.r.pari;
    if (pari > 0) step('Pari de comptoir', amount + 2 * pari);
    if (W.habitues.some((h) => h.id === 'fanfaron')) step('Le Fanfaron', amount + 1);
    // La Der des ders (0.46) : piège sur le perdant, 1 jeton de plus pour lui.
    const dd = trapsOn(s, L.id, 'der-des-ders')[0];
    if (dd && triggerTrap(c, dd)) step('La Der des ders', amount + 1);
    if (L.habitues.some((h) => h.id === 'pilier') && amount > 1) step('Pilier de comptoir', Math.max(1, amount - 2)); // 0.40 : 2 de moins
    const nenMin = s.commande === 'nenette' ? Math.max(4, s.values.nenetteMin) : s.values.nenetteMin;
    if (ev[worst].combo.kind === 'nenette' && amount < nenMin) step('nénette', nenMin);
    const efface = (L.r.efface ?? 0) > 0;
    if (efface && amount > 1) step('On efface tout', 1);
    let reversed = false;
    if (amount >= VESTE_MIN) {
      const t = s.traps.find((x) => x.id === 'retournement-veste' && x.owner === L.id && x.target === W.id);
      if (t && triggerTrap(c, t)) reversed = true;
    }
    let given: number;
    const sante = reversed ? 0 : (L.r.sante ?? 0);
    if (reversed) {
      // Le gagnant reçoit les jetons à la place du perdant (pris à la réserve) ; le perdant ne reçoit rien.
      given = amount;
      W.tokens += amount;
    } else {
      given = Math.min(amount, W.tokens);
      W.tokens -= given;
      L.tokens += given;
      // À votre santé ! (0.46) : le gagnant reçoit aussi un jeton.
      if (sante > 0) W.tokens += sante;
    }
    const extra = parts.length ? ` (${parts.join(', ')})` : '';
    const text = reversed
      ? `Retournement de veste ! C'est ${W.name} qui reçoit ${plural(given, 'jeton')} à la place de ${L.name}.`
      : efface ? `${W.name} gagne la manche avec ${ev[best].combo.label}, mais ${L.name} efface tout : il ne reçoit qu’un jeton.`
      : `${W.name} gagne la manche avec ${ev[best].combo.label} et donne ${plural(given, 'jeton')} à ${L.name}${extra}.${sante > 0 ? ` À votre santé ! ${W.name} reçoit aussi ${plural(sante, 'jeton')}.` : ''}`;
    summary = { round: s.round, winner: W.id, loser: L.id, amount: given, reversed, combos, text, detail, ...(given < amount ? { cappedFrom: amount } : {}) };
    emit(c, { kind: 'comptes', player: W.id, text });
    // Le Lot de consolation (0.46) : piège sur le gagnant, son poseur gagne 1 Tournée et pioche 1 carte.
    for (const t of trapsOn(s, W.id, 'lot-consolation')) {
      if (triggerTrap(c, t)) {
        const o = pl(s, t.owner);
        const g = gainTournees(c, o, LOT_TOURNEES, true);
        emit(c, { kind: 'lot-consolation', player: o.id, card: 'lot-consolation', who: o.id, text: `Le Lot de consolation : ${o.name} gagne ${plural(g, 'Tournée')} et pioche ${plural(LOT_DRAW, 'carte')}.`, textYou: `Le Lot de consolation : vous gagnez ${plural(g, 'Tournée')} et piochez ${plural(LOT_DRAW, 'carte')}.` });
        draw(c, o, LOT_DRAW, false, true);
      }
      break;
    }
    // Gueule de bois (0.40) : le perdant n'aura qu'un seul lancer à la manche suivante (qu'il mènera).
    for (const t of trapsOn(s, L.id, 'gueule-bois')) {
      if (triggerTrap(c, t)) {
        L.penaltyNext = 1;
        L.penaltyNextCard = 'gueule-bois';
        emit(c, { kind: 'gueule-bois', player: L.id, who: L.id, text: `${L.name} n'aura qu'un seul lancer à la prochaine manche (Gueule de bois).`, textYou: 'Vous n’aurez qu’un seul lancer à la prochaine manche (Gueule de bois).' });
      }
      break;
    }
    s.prevLoser = L.id;
    s.leader = L.id;
    if (s.commande === 'consolation' && !L.out) {
      emit(c, { kind: 'effet', player: L.id, who: L.id, text: `Consolation : ${L.name} pioche 2 cartes.`, textYou: 'Consolation : vous piochez 2 cartes.' });
      draw(c, L, 2);
    }
  }
  s.lastRound = summary;
  if (exits(c)) return;
  if (s.round >= s.rules.maxRounds) return finish(c, true);
  endRound(c);
}

/**
 * Sorties : un joueur sans jeton est déchargé et la partie s'arrête (0.39 : à 3 ou 4 aussi ; les autres
 * sont classés par jetons). Vérifié aux comptes et après Le Pourboire. Renvoie true si la partie est finie.
 */
function exits(c: Ctx): boolean {
  const s = c.s;
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
  if (left.length <= 1 || s.ranking.length > 0) { finish(c, false); return true; }
  return false;
}

function leaveTable(s: CfState, p: CfPlayer) {
  for (const t of s.traps.filter((t) => t.owner === p.id || t.target === p.id)) pl(s, t.owner).discard.push({ uid: t.uid, id: t.id });
  s.traps = s.traps.filter((t) => t.owner !== p.id && t.target !== p.id);
  for (const h of [...p.habitues]) habitueLeaves(s, p, h);
}

/** Un Habitué quitte le comptoir : il va dans la défausse de son joueur d'origine (Le Débauchage). */
function habitueLeaves(s: CfState, holder: CfPlayer, h: CardInst) {
  holder.habitues = holder.habitues.filter((x) => x.uid !== h.uid);
  const home = h.from ? s.players.find((x) => x.id === h.from) ?? holder : holder;
  home.discard.push({ uid: h.uid, id: h.id });
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
  // Habitués : une manche de moins ; au bout de habitueRounds manches, ils rentrent chez eux (défaussés).
  for (const p of active(s)) {
    for (const h of [...p.habitues]) {
      h.rounds = (h.rounds ?? s.rules.habitueRounds ?? 3) - 1;
      if (h.rounds > 0) continue;
      habitueLeaves(s, p, h);
      emit(c, { kind: 'habitue-part', player: p.id, card: h.id, who: p.id, text: `${cardName(h.id)} rentre chez lui (Habitué de ${p.name}).`, textYou: `${cardName(h.id)} rentre chez lui : il quitte votre comptoir.` });
    }
  }
  // Pièges non déclenchés depuis trapReturnRounds manches (celle de la pose comprise) : retour en main.
  for (const t of [...s.traps]) {
    if (s.round - t.posedRound + 1 >= s.rules.trapReturnRounds) {
      s.traps = s.traps.filter((x) => x.uid !== t.uid);
      const o = pl(s, t.owner);
      o.hand.push({ uid: t.uid, id: t.id });
      emit(c, { kind: 'piege-retour', player: o.id, who: o.id, text: `Un piège de ${o.name} revient dans sa main.`, textYou: `Votre piège ${cardName(t.id)} revient dans votre main.` });
      if (t.id === 'leurre') leurreBonus(c, o);
    }
  }
  s.discardQueue = s.order.filter((id) => pl(s, id).hand.length > s.rules.handMax);
  if (s.discardQueue.length) { s.phase = 'discard'; return; }
  startRound(c);
}

// ---------------------------------------------------------------------------------------------
// Coûts et options des cartes

/** Coût réel d'une carte pour ce joueur maintenant (Mise en bouche, Le Beau-frère). */
export function costOf(_s: CfState, p: Pick<CfPlayer, 'habitues' | 'r'>, id: string): number {
  return Math.max(0, def(id).cost - beauFrere(p, id) - (id === 'mise-bouche' ? 0 : p.r.discount) - (p.r.roundDiscount ?? 0));
}
/** La petite sœur reprend le dernier Coup de la défausse, sauf une autre petite sœur. */
export const petiteSoeurOk = (k: { id: string }) => def(k.id)?.type === 'coup' && k.id !== 'petite-soeur';
/** La Boucle (0.46) reprend des Coups, sauf une autre Boucle et La petite sœur (pas de va-et-vient sans fin). */
export const boucleOk = (k: { id: string }) => def(k.id)?.type === 'coup' && k.id !== 'boucle' && k.id !== 'petite-soeur';
/** Habitués que Les Retrouvailles peut réinstaller (le dernier de la défausse qui peut s'installer). */
export function retrouvaillesTarget(p: Pick<CfPlayer, 'discard' | 'habitues'>, maxHabitues: number): CardInst | null {
  if (p.habitues.length >= maxHabitues) return null;
  for (let i = p.discard.length - 1; i >= 0; i--) {
    const k = p.discard[i];
    if (def(k.id)?.type === 'habitue' && !p.habitues.some((h) => h.id === k.id)) return k;
  }
  return null;
}
/** L’Écho (0.46) : le dernier Coup joué par un adversaire dans la manche (ou null). */
export function echoSource(s: { players: { id: string; out: boolean; r: Pick<RoundState, 'lastCoup' | 'lastCoupAt'> }[] }, pid: string): string | null {
  let best: { id: string; at: number } | null = null;
  for (const o of s.players) {
    if (o.id === pid || o.out || !o.r.lastCoup) continue;
    const at = o.r.lastCoupAt ?? 0;
    if (!best || at > best.at) best = { id: o.r.lastCoup, at };
  }
  return best?.id ?? null;
}
/** Le Beau-frère : vos cartes coûtent 1 Tournée de moins (0.40 : toutes, plus seulement les Coups ; un seul Beau-frère en jeu). */
export function beauFrere(p: Pick<CfPlayer, 'habitues'>, id: string): number {
  return def(id) && p.habitues.some((h) => h.id === 'beau-frere') ? 1 : 0;
}

const diceIdx = [0, 1, 2];
/** Ticket de caisse : annule un Coup adverse qui coûte au plus ce nombre de Tournées (coût imprimé). */
export const TICKET_MAX = 4;
/** Le Pot aux roses : annule un Coup ou un Dernier mot qui coûte au moins ce nombre de Tournées (coût imprimé). */
export const POT_MIN = 2;
/** Mise en bouche : réduction qui rend la prochaine carte gratuite. */
const MISE_FREE = 99;
/** Retournement de veste : se déclenche quand le perdant devrait recevoir au moins ce nombre de jetons. */
export const VESTE_MIN = 8;
/** Tournée du patron : Tournées gagnées (0.41 : 3, pour 2 Tournées, au lieu de 2 pour 1). */
export const TOURNEE_PATRON_GAIN = 3;
/** Leurre : cartes piochées et Tournées gagnées quand il est révélé ou revient en main (0.41 : 1 + 1 Tournée, avant 2 cartes). */
export const LEURRE_DRAW = 1;
export const LEURRE_TOURNEES = 1;
/** Fermeture ! sans Habitué adverse : Tournées gagnées (0.41, avant 2 cartes piochées). */
export const FERMETURE_TOURNEES = 2;
/** Le Vide-poches : Tournées prises à l'adversaire (0.41), en plus de la carte défaussée au hasard. */
export const VIDE_POCHES_TOURNEES = 1;
/** Le Mouchard : ce que gagne son poseur quand il se déclenche (0.41 : 1 Tournée + 1 carte, avant 2 cartes). */
export const MOUCHARD_DRAW = 1;
export const MOUCHARD_TOURNEES = 1;
/** Ardoise piégée : Tournées à payer en plus pour un Coup. */
export const ARDOISE_EXTRA = 3;
/** Flagrant délit : annule un Coup ou un Habitué qui coûte au plus ce nombre de Tournées (coût imprimé). */
export const FLAGRANT_MAX = 1;
/** Main dans le sac : annule un Coup qui coûte au moins ce nombre de Tournées (coût imprimé). */
export const MAIN_SAC_MIN = 1;
/** Coups qui changent des dés (Les yeux qui piquent peut les annuler). */
export const DICE_COUPS = new Set(['tete-tourne', 'coup-pouce', 'bon-numero', 'de-sous-table', 'tournee-generale', 'petit-dernier', 'miroir', 'verres-echanges', 'fee-verte', 'ricochet']);
/** Le Joueur de belote : ce que valent ses brelans en plus. */
export const BELOTE_BONUS = 3;
/** Le Plat du jour : Tournées gagnées. */
export const PLAT_TOURNEES = 2;
/** Le Lot de consolation : ce que gagne son poseur quand il se déclenche. */
export const LOT_TOURNEES = 1;
export const LOT_DRAW = 2;
/** L’Effet papillon : cartes piochées. */
export const PAPILLON_DRAW = 1;
/** La Fée verte : relances au plus pour tomber sur la face choisie. */
export const FEE_TRIES = 3;
/** La Peau de banane : se déclenche sur une combinaison qui vaut au moins ceci. */
export const PEAU_MIN = 4;
/** L’Addition : valeur minimale de la combinaison du gagnant. */
export const ADDITION_MIN = 3;

/** Coup réellement joué par un élément de la pile (Le grand enchaînement et L’Écho rejouent un autre Coup). */
export function playedCoupOf(s: { players: { id: string; out: boolean; r: Pick<RoundState, 'lastCoup' | 'lastCoupAt'> }[] }, owner: string, cardId: string): string {
  if (cardId === 'grand-enchainement') return s.players.find((p) => p.id === owner)?.r.lastCoup ?? cardId;
  if (cardId === 'echo') return echoSource(s, owner) ?? cardId;
  return cardId;
}

/** Paramètres possibles pour l'effet d'un Coup (ou d'un Dernier mot), sans tenir compte du coût. */
function effectOptions(s: CfState, p: CfPlayer, id: string): PlayParams[] {
  const opps = active(s).filter((o) => o.id !== p.id);
  const myTurn = s.phase === 'turn' && s.order[s.turn] === p.id && !p.r.done;
  const rolled = p.r.throwsUsed > 0;
  switch (id) {
    case 'tournee-patron': case 'cul-sec': case 'pari-comptoir': case 'double-tournee': case 'coup-coude':
    case 'mise-bouche': case 'calcul-mental': case 'note-salee': case 'efface-tout': case 'tant-qu-on-y-est':
    case 'cafe-serre': case 'plat-du-jour': case 'addition': case 'sante': case 'effet-papillon':
      return [{}];
    case 'boule-de-neige':
      return p.r.played >= 1 ? [{}] : [];
    case 'compte-rond':
      return p.r.played >= 1 ? [{}] : [];
    case 'retrouvailles':
      return retrouvaillesTarget(p, s.rules.maxHabitues) ? [{}] : [];
    case 'boucle':
      return p.discard.some(boucleOk) ? [{}] : [];
    case 'debauchage': {
      // Sans aucun Habitué adverse : on pioche 2 cartes. Le Patron protège ses Habitués (2 Tournées ou moins).
      const all = opps.flatMap((o) => o.habitues.map((h) => ({ o, h })));
      if (!all.length) return [{}];
      if (p.habitues.length >= s.rules.maxHabitues) return [];
      return all.filter((x) => !p.habitues.some((y) => y.id === x.h.id) && !patronProtects(s, x.o.id, def('debauchage'))).map((x) => ({ habitue: x.h.uid }));
    }
    case 'petit-dernier':
      return myTurn && rolled ? diceIdx.map((die) => ({ die })) : [];
    case 'calva':
      return p.r.dice.some((x) => x > 0) ? diceIdx.map((die) => ({ die })) : [];
    case 'miroir': {
      if (!(myTurn && rolled)) return [];
      const out: PlayParams[] = [];
      for (const die of diceIdx) for (const j of diceIdx) {
        const face = p.r.dice[j];
        if (j !== die && face !== p.r.dice[die] && !out.some((o) => o.die === die && o.face === face)) out.push({ die, face });
      }
      return out;
    }
    case 'fee-verte': {
      if (!(myTurn && rolled)) return [];
      const out: PlayParams[] = [];
      for (const die of diceIdx) for (let face = 1; face <= 6; face++) if (p.r.dice[die] !== face) out.push({ die, face });
      return out;
    }
    case 'derniere-maille': {
      if (p.r.played < 2) return [];
      const out: PlayParams[] = [];
      for (const die of diceIdx) for (let face = 1; face <= 6; face++) if (p.r.dice[die] !== face && p.r.dice[die] > 0) out.push({ die, face });
      return out;
    }
    case 'verres-echanges':
      return myTurn && rolled ? opps.filter((o) => o.r.done && !guarded(o)).map((o) => ({ target: o.id })) : [];
    case 'passe-passe':
      return s.traps.filter((t) => t.owner === p.id && t.id !== 'leurre').map((t) => ({ trap: t.uid }));
    case 'denonciation':
      return s.traps.filter((t) => t.target === p.id && t.owner !== p.id).map((t) => ({ trap: t.uid }));
    case 'embuscade': {
      if (!p.hand.some((k) => def(k.id).type === 'piege')) return [];
      return opps.filter((o) => canPoseOn(s, p.id, o.id)).map((o) => ({ target: o.id }));
    }
    case 'verre-offert': case 'pourboire':
      return opps.map((o) => ({ target: o.id }));
    case 'coup-etrier':
      return p.r.dice.some((x) => x > 0) ? diceIdx.map((die) => ({ die })) : [];
    case 'vide-poches':
      return opps.filter((o) => o.hand.length > 0 || o.tournees > 0).map((o) => ({ target: o.id }));
    case 'petite-soeur':
      return p.discard.some(petiteSoeurOk) ? [{}] : [];
    case 'trinquer': {
      // Échange : un de mes dés contre un dé de l'adversaire, tous deux pris au hasard.
      if (!p.r.dice.some((x) => x > 0)) return [];
      return opps.filter((o) => o.r.dice.some((x) => x > 0) && !guarded(o)).map((o) => ({ target: o.id }));
    }
    case 'tete-tourne':
      return myTurn && rolled ? diceIdx.map((die) => ({ die })) : [];
    case 'coup-pouce': case 'recompter': case 'ricochet': {
      if (id !== 'recompter' && !(myTurn && rolled)) return [];
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
      if (!myTurn) return [];
      const out: PlayParams[] = [];
      for (const o of opps) if (o.r.done && !guarded(o)) for (const die of diceIdx) out.push({ target: o.id, die });
      // Personne n'a encore fini son tour : on relance un de ses propres dés.
      if (!out.length && rolled) for (const die of diceIdx) out.push({ target: p.id, die });
      return out;
    }
    case 'tournee-generale': {
      if (!(myTurn && rolled)) return [];
      const done = opps.filter((o) => o.r.done && !guarded(o)).map((o) => ({ target: o.id }));
      return done.length ? done : [{}];
    }
    case 'domino':
      return opps.map((o) => ({ target: o.id }));
    case 'fermeture': {
      // Sans aucun Habitué adverse : on fait la caisse. S'il n'y a que des Habitués protégés par le
      // Patron, la carte n'est pas jouable (on ne gagne pas les Tournées pour autant).
      const all = opps.flatMap((o) => o.habitues.map((h) => ({ o, h })));
      if (!all.length) return [{}];
      return all.filter((x) => !patronProtects(s, x.o.id, def('fermeture'))).map((x) => ({ habitue: x.h.uid }));
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
  if (p.r.locked) return [];
  const opps = active(s).filter((o) => o.id !== p.id);
  if (respond) {
    if (d.type !== 'riposte') return [];
    const top = s.stack[s.stack.length - 1];
    if (!top || top.owner === p.id) return [];
    if (top.kind !== 'card') return [];
    if (k.id === 'yeux-piquent') return top.type === 'coup' && top.card && DICE_COUPS.has(playedCoupOf(s, top.owner, top.card.id)) ? [{}] : [];
    if (k.id === 'table-reservee') return top.type === 'piege' && top.params.target === p.id ? [{}] : [];
    if (k.id === 'a-la-votre') return top.type === 'riposte' ? [{}] : [];
    if (k.id === 'retour-envoyeur') return top.type === 'coup' ? [{}] : [];
    if (k.id === 'flagrant-delit') {
      return top.type === 'coup' && def(top.card.id).cost <= FLAGRANT_MAX ? [{}] : [];
    }
    if (k.id === 'ticket-caisse') return top.type === 'coup' && def(top.card.id).cost <= TICKET_MAX ? [{}] : [];
    if (k.id === 'pot-aux-roses') return (top.type === 'coup' || top.type === 'dernier-mot') && def(top.card.id).cost >= POT_MIN ? [{}] : [];
    if (k.id === 'reaction-chaine') {
      if (top.type === 'habitue' && patronProtects(s, top.owner, d)) return [];
      return [{}];
    }
    return [];
  }
  if (d.type === 'riposte') return [];
  if (s.phase === 'lastword') {
    if (d.type !== 'dernier-mot') return [];
    if (k.id === 'recompter' && p.r.played < 1) return [];
    // Le Garde champêtre protège aussi des Derniers mots adverses (Trinquer).
    return effectOptions(s, p, k.id);
  }
  const myTurn = s.phase === 'turn' && s.order[s.turn] === p.id && !p.r.done;
  if (!myTurn) return [];
  if (d.type === 'dernier-mot') return [];
  // Un même Habitué ne peut pas être deux fois devant le même joueur (décision de Sam : rien d'inutile en jeu).
  if (d.type === 'habitue') return p.habitues.length < s.rules.maxHabitues && !p.habitues.some((h) => h.id === k.id) ? [{}] : [];
  if (d.type === 'piege') {
    // 0.46 (demande de Sam) : 3 pièges au plus devant un même joueur, et 3 posés au plus par joueur.
    return opps.filter((o) => canPoseOn(s, p.id, o.id)).map((o) => ({ target: o.id }));
  }
  // Coup
  if (k.id === 'grand-enchainement') {
    if (!p.r.lastCoup) return [{}]; // aucun Coup à rejouer : on pioche 2 cartes
    return effectOptions(s, p, p.r.lastCoup);
  }
  if (k.id === 'echo') {
    const src = echoSource(s, p.id);
    return src ? effectOptions(s, p, src) : [];
  }
  if (k.id === 'ricochet' && p.r.played < 1) return [];
  return effectOptions(s, p, k.id);
}

/** Le Patron : les Habitués de ce joueur ne peuvent être ni chassés ni annulés par une carte qui coûte 2 ou moins. */
function patronProtects(s: CfState, ownerId: string, attacker: CardDef): boolean {
  return attacker.cost <= 2 && pl(s, ownerId).habitues.some((h) => h.id === 'patron');
}

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
  if (d.type === 'coup' && k.id !== 'grand-enchainement' && k.id !== 'echo') { p.r.lastCoup = k.id; p.r.lastCoupAt = s.decisions; }

  if (d.type === 'piege') {
    emit(c, { kind: 'pose', player: p.id, who: p.id, target: params.target, text: `${p.name} pose un piège${isDuel(s) ? '' : ` sur ${nm(s, params.target!)}`}.`, textYou: `Vous posez ${cardName(k.id)}${isDuel(s) ? '' : ` sur ${nm(s, params.target!)}`}.` });
  } else {
    const verb = d.type === 'habitue' ? 'installe' : 'joue';
    emit(c, { kind: 'carte', player: p.id, card: k.id, who: p.id, text: `${p.name} ${verb} ${d.name}${cost !== d.cost ? ` (pour ${plural(cost, 'Tournée')})` : ''}.`, textYou: `Vous ${verb === 'joue' ? 'jouez' : 'installez'} ${d.name}.` });
  }
  // Le Comptable (0.46) : à la 2e carte de la manche, +1 Tournée et 1 carte.
  if (playedBefore === 1 && p.habitues.some((h) => h.id === 'comptable')) {
    const g = gainTournees(c, p, 1, true);
    emit(c, { kind: 'effet', player: p.id, card: 'comptable', who: p.id, text: `Le Comptable de ${p.name} : +${plural(g, 'Tournée')} et une carte.`, textYou: `Votre Comptable : +${plural(g, 'Tournée')} et une carte.` });
    draw(c, p, 1, false, true);
  }
  // La Souricière (0.46) : après la 1re carte de la manche, plus aucune autre (la carte, elle, est jouée).
  if (playedBefore === 0) {
    const t = trapsOn(s, p.id, 'souriciere')[0];
    if (t && triggerTrap(c, t)) {
      p.r.locked = 'souriciere';
      emit(c, { kind: 'souriciere', player: p.id, who: p.id, text: `La Souricière : ${p.name} ne pourra plus jouer de carte cette manche.`, textYou: 'La Souricière : vous ne pourrez plus jouer de carte cette manche.' });
    }
  }
  // Le Nœud coulant (0.46) : à la 2e carte, 1 jeton et plus aucune autre carte cette manche.
  if (playedBefore === 1) {
    const t = trapsOn(s, p.id, 'noeud-coulant')[0];
    if (t && triggerTrap(c, t)) {
      p.r.locked = 'noeud-coulant';
      p.tokens += 1;
      emit(c, { kind: 'noeud-coulant', player: p.id, who: p.id, text: `Le Nœud coulant : ${p.name} reçoit 1 jeton et ne pourra plus jouer de carte cette manche.`, textYou: 'Le Nœud coulant : vous recevez 1 jeton et ne pourrez plus jouer de carte cette manche.' });
    }
  }
  // L'Engrenage (0.40) : la 2e carte de la manche du joueur piégé est annulée (le Patron protège ses Habitués).
  if (playedBefore === 1 && !(d.type === 'habitue' && patronProtects(s, p.id, def('engrenage')))) {
    const t = trapsOn(s, p.id, 'engrenage')[0];
    if (t && triggerTrap(c, t)) {
      emit(c, { kind: 'engrenage', player: p.id, card: k.id, who: p.id, text: `L’Engrenage : la 2e carte de ${p.name} est annulée.`, textYou: 'L’Engrenage : votre 2e carte de la manche est annulée.' });
      if (s.phase === 'lastword' && !responding && d.type === 'dernier-mot') s.lastword!.passes = 0;
      s.stack.push({ kind: 'card', owner: p.id, card: k, type: d.type, params, cost, cancelled: true, playedBefore, returnsToHand: false, targetIdx });
      resolveStack(c);
      return;
    }
  }
  if (d.type === 'habitue' && !patronProtects(s, p.id, def('courant-air'))) {
    // Le Courant d'air : l'Habitué rentre aussitôt chez lui.
    const t = trapsOn(s, p.id, 'courant-air')[0];
    if (t && triggerTrap(c, t)) {
      p.discard.push(k);
      emit(c, { kind: 'courant-air', player: p.id, card: k.id, who: p.id, text: `Le Courant d’air : ${d.name} rentre aussitôt chez lui (Habitué de ${p.name}).`, textYou: `Le Courant d’air : votre ${d.name} rentre aussitôt chez lui.` });
      return;
    }
  }
  if (d.type === 'riposte') {
    // Le Courant d'air (0.40) : une Riposte s'envole aussi, sans effet.
    const t = trapsOn(s, p.id, 'courant-air')[0];
    if (t && triggerTrap(c, t)) {
      emit(c, { kind: 'courant-air', player: p.id, card: k.id, who: p.id, text: `Le Courant d’air : la Riposte ${d.name} de ${p.name} s’envole, sans effet.`, textYou: `Le Courant d’air : votre ${d.name} s’envole, sans effet.` });
      s.stack.push({ kind: 'card', owner: p.id, card: k, type: d.type, params, cost, cancelled: true, playedBefore, returnsToHand: false, targetIdx });
      resolveStack(c);
      return;
    }
  }
  if (d.type === 'dernier-mot') {
    // Le Mot de trop (0.46) : le Dernier mot est annulé.
    const t = trapsOn(s, p.id, 'mot-de-trop')[0];
    if (t && triggerTrap(c, t)) {
      emit(c, { kind: 'mot-de-trop', player: p.id, card: k.id, who: p.id, text: `Le Mot de trop : le Dernier mot ${d.name} de ${p.name} est annulé.`, textYou: `Le Mot de trop : votre ${d.name} est annulé.` });
      if (s.phase === 'lastword' && !responding) s.lastword!.passes = 0;
      s.stack.push({ kind: 'card', owner: p.id, card: k, type: d.type, params, cost, cancelled: true, playedBefore, returnsToHand: false, targetIdx });
      resolveStack(c);
      return;
    }
  }
  // La Fouine (correctif 0.46) : elle retire un piège, elle ne déclenche pas ceux qui guettent les Coups.
  const fouine = k.id === 'fouine';
  if (d.type === 'coup' && d.cost >= MAIN_SAC_MIN && !fouine) {
    // Main dans le sac : un Coup qui coûte MAIN_SAC_MIN ou plus (coût imprimé) est annulé (0.40 : 1, avant 2).
    const t = trapsOn(s, p.id, 'main-sac')[0];
    if (t && triggerTrap(c, t)) {
      p.discard.push(k);
      emit(c, { kind: 'annule', player: p.id, card: k.id, who: p.id, text: `Main dans le sac : ${d.name} de ${p.name} est annulé.`, textYou: `Main dans le sac : votre ${d.name} est annulé.` });
      return;
    }
  }
  if (d.type === 'coup' && !fouine) {
    for (const t of trapsOn(s, p.id, 'ardoise-piegee')) {
      if (!triggerTrap(c, t)) continue;
      if (p.tournees >= ARDOISE_EXTRA) {
        p.tournees -= ARDOISE_EXTRA;
        emit(c, { kind: 'ardoise-piegee', player: p.id, who: p.id, text: `Ardoise piégée : ${p.name} paie ${ARDOISE_EXTRA} Tournées de plus.`, textYou: `Ardoise piégée : vous payez ${ARDOISE_EXTRA} Tournées de plus.` });
      } else {
        p.discard.push(k);
        emit(c, { kind: 'annule', player: p.id, card: k.id, who: p.id, text: `Ardoise piégée : ${p.name} ne peut pas payer, ${d.name} est annulé.`, textYou: `Ardoise piégée : vous ne pouvez pas payer, ${d.name} est annulé.` });
        return;
      }
    }
  }
  if (d.type === 'coup' && !fouine) {
    // Le Mouchard : quand l'adversaire joue un Coup, le poseur gagne 1 Tournée et pioche 1 carte (0.41).
    const t = trapsOn(s, p.id, 'mouchard')[0];
    if (t && triggerTrap(c, t)) {
      const o = pl(s, t.owner);
      const g = gainTournees(c, o, MOUCHARD_TOURNEES, true);
      emit(c, { kind: 'mouchard', player: p.id, card: 'mouchard', who: o.id, text: `Le Mouchard a tout vu : ${o.name} gagne ${plural(g, 'Tournée')} et pioche ${plural(MOUCHARD_DRAW, 'carte')}.`, textYou: `Votre Mouchard a tout vu : vous gagnez ${plural(g, 'Tournée')} et piochez ${plural(MOUCHARD_DRAW, 'carte')}.` });
      draw(c, o, MOUCHARD_DRAW, false, true);
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
export function mightRespond(s: CfState, p: CfPlayer, top: StackItem): boolean {
  if (top.owner === p.id || p.out || p.r.locked) return false;
  const f = p.families;
  if (top.kind === 'keep') return false; // 0.39 : plus aucune riposte sur des dés gardés (moins d'interruptions)
  if (f.includes('ivresse') && top.type === 'coup' && DICE_COUPS.has(playedCoupOf(s, top.owner, top.card.id)) && canPay(p, def('yeux-piquent').cost)) return true;
  if (f.includes('ivresse') && top.type === 'riposte' && canPay(p, def('a-la-votre').cost)) return true;
  if (f.includes('chaines') && canPay(p, def('reaction-chaine').cost)) return true;
  if (f.includes('chaines') && top.type === 'coup' && canPay(p, def('retour-envoyeur').cost)) return true;
  if (f.includes('pieges') && (top.type === 'coup' || top.type === 'dernier-mot') && def(top.card.id).cost >= POT_MIN && canPay(p, def('pot-aux-roses').cost)) return true;
  if (f.includes('pieges') && top.type === 'coup' && def(top.card.id).cost <= FLAGRANT_MAX && canPay(p, def('flagrant-delit').cost)) return true;
  if (f.includes('habitues') && top.type === 'piege' && top.params.target === p.id && canPay(p, def('table-reservee').cost)) return true;
  return f.includes('habitues') && top.type === 'coup' && def(top.card.id).cost <= TICKET_MAX && canPay(p, def('ticket-caisse').cost);
}
/** Ce joueur pourrait-il avoir un Dernier mot jouable ? */
export function mightHaveLastword(s: CfState, p: CfPlayer): boolean {
  if (p.out || p.r.locked) return false;
  const f = p.families;
  if (f.includes('habitues') && canPay(p, Math.min(def('note-salee').cost, def('addition').cost))) return true;
  if (f.includes('ivresse') && canPay(p, Math.min(def('trinquer').cost, def('coup-etrier').cost, def('sante').cost))) return true;
  if (f.includes('pieges') && s.traps.some((t) => t.target === p.id && t.owner !== p.id) && canPay(p, def('denonciation').cost)) return true;
  return f.includes('chaines') && p.r.played >= 1 && canPay(p, Math.min(def('recompter').cost, def('compte-rond').cost));
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
      if (it.backToHand) owner.hand.push(it.card);
      else owner.discard.push(it.card);
      emit(c, { kind: 'annule', player: owner.id, card: it.card.id, who: owner.id, text: `${it.type === 'piege' ? 'Le piège' : cardName(it.card.id)} de ${owner.name} est annulé${it.backToHand ? ' et retourne dans sa main' : ''}.`, textYou: `${it.type === 'piege' ? 'Votre piège' : cardName(it.card.id)} est annulé${it.backToHand ? ' et retourne dans votre main' : ''}.` });
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
    installHabitue(c, p, it.card);
    return;
  }
  if (d.type === 'piege') {
    poseTrap(c, p, it.card, it.params.target!);
    return;
  }
  if (d.type === 'riposte') {
    const target = s.stack[it.targetIdx!];
    if (target) {
      target.cancelled = true;
      if (id === 'retour-envoyeur' && target.kind === 'card') target.backToHand = true;
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
    if (!replay) {
      emit(c, { kind: 'effet', player: p.id, card: id, who: p.id, text: `Le grand enchaînement : ${p.name} pioche 2 cartes.`, textYou: 'Le grand enchaînement : vous piochez 2 cartes.' });
      draw(c, p, 2, false, true);
      return;
    }
    emit(c, { kind: 'rejoue', player: p.id, card: replay, who: p.id, text: `Le grand enchaînement : ${p.name} rejoue ${cardName(replay)}.`, textYou: `Le grand enchaînement : vous rejouez ${cardName(replay)}.` });
    // Revalide la cible (elle a pu changer pendant la chaîne ; le Patron protège ses Habitués de Fermeture !).
    if (!effectOptions(s, p, replay).some((o) => sameParams(o, it.params))) return;
    effect(c, p, replay, it.params, it.playedBefore, it.card.uid);
    return;
  }
  if (id === 'echo') {
    const src = echoSource(s, p.id);
    if (!src || !effectOptions(s, p, src).some((o) => sameParams(o, it.params))) {
      emit(c, { kind: 'sans-effet', player: p.id, card: id, text: `${d.name} n'a plus d'effet.` });
      return;
    }
    emit(c, { kind: 'rejoue', player: p.id, card: src, who: p.id, text: `L’Écho : ${p.name} rejoue ${cardName(src)}.`, textYou: `L’Écho : vous rejouez ${cardName(src)}.` });
    effect(c, p, src, it.params, it.playedBefore, it.card.uid);
    return;
  }
  if (!effectOptions(s, p, id).some((o) => sameParams(o, it.params))) {
    emit(c, { kind: 'sans-effet', player: p.id, card: id, text: `${d.name} n'a plus d'effet.` });
    return;
  }
  effect(c, p, id, it.params, it.playedBefore, it.card.uid);
}

/** Un Habitué s'installe (effets d'arrivée compris). */
function installHabitue(c: Ctx, p: CfPlayer, card: CardInst) {
  const s = c.s;
  const id = card.id;
  if (p.habitues.length >= s.rules.maxHabitues || p.habitues.some((h) => h.id === id)) {
    // Plus de place (la situation a changé pendant la chaîne) : il retourne dans la main.
    p.hand.push({ uid: card.uid, id });
    emit(c, { kind: 'effet', player: p.id, card: id, who: p.id, text: `${cardName(id)} ne trouve pas de place : il retourne dans la main de ${p.name}.`, textYou: `${cardName(id)} ne trouve pas de place : il retourne dans votre main.` });
    return;
  }
  for (const h of p.habitues) if (id === 'doyen') h.rounds = (h.rounds ?? s.rules.habitueRounds ?? 3) + 1;
  p.habitues.push({ uid: card.uid, id, rounds: s.rules.habitueRounds ?? 3 });
  guetteurSees(s, p);
  if (id === 'vieux-marcel' || id === 'guetteur' || id === 'doyen' || id === 'joueur-belote') {
    const extra = id === 'doyen' && p.habitues.length > 1 ? ' ; vos autres Habitués restent 1 manche de plus' : '';
    const t = id === 'doyen' ? ' gagne 1 Tournée et' : '';
    emit(c, { kind: 'effet', player: p.id, card: id, who: p.id, text: `${cardName(id)} s’installe : ${p.name}${t} pioche 1 carte${extra ? ' ; ses autres Habitués restent 1 manche de plus' : ''}.`, textYou: `${cardName(id)} s’installe : vous ${id === 'doyen' ? 'gagnez 1 Tournée et ' : ''}piochez 1 carte${extra}.` });
    draw(c, p, 1, false, true);
  }
  if (id === 'doyen') gainTournees(c, p, 1, true);
  if (id === 'guetteur') {
    const g = gainTournees(c, p, 1, true);
    emit(c, { kind: 'effet', player: p.id, card: id, who: p.id, text: `Le Guetteur s’installe : ${p.name} gagne ${plural(g, 'Tournée')}.`, textYou: `Le Guetteur s’installe : vous gagnez ${plural(g, 'Tournée')} ; vous voyez les pièges posés devant vous.` });
  }
  if (id === 'beau-frere') {
    // 0.40 : le Beau-frère arrive avec une Tournée.
    const g = gainTournees(c, p, 1, true);
    emit(c, { kind: 'effet', player: p.id, card: id, who: p.id, text: `Le Beau-frère s’installe : ${p.name} gagne ${plural(g, 'Tournée')}.`, textYou: `Le Beau-frère s’installe : vous gagnez ${plural(g, 'Tournée')}.` });
  }
}

/** Un piège est posé (L’Attrape-nigaud peut le défausser aussitôt ; plus de place : il retourne en main). */
function poseTrap(c: Ctx, p: CfPlayer, card: CardInst, target: string) {
  const s = c.s;
  const victim = s.players.find((x) => x.id === target);
  if (!victim || victim.out || !canPoseOn(s, p.id, target)) {
    p.hand.push({ uid: card.uid, id: card.id });
    emit(c, { kind: 'effet', player: p.id, who: p.id, text: `Plus de place pour un piège : il retourne dans la main de ${p.name}.`, textYou: `Plus de place pour ce piège : ${cardName(card.id)} retourne dans votre main.` });
    return;
  }
  // L'Attrape-nigaud (0.46) : posé devant le poseur par sa cible, il défausse le nouveau piège.
  const an = s.traps.find((t) => t.id === 'attrape-nigaud' && t.target === p.id && t.owner === target);
  if (an && triggerTrap(c, an)) {
    p.discard.push({ uid: card.uid, id: card.id });
    emit(c, { kind: 'attrape-nigaud', player: p.id, card: card.id, who: p.id, text: `L’Attrape-nigaud : le piège de ${p.name} (${cardName(card.id)}) est défaussé, ${victim.name} pioche 1 carte.`, textYou: `L’Attrape-nigaud : votre piège ${cardName(card.id)} est défaussé.` });
    draw(c, victim, 1, false, true);
    if (card.id === 'leurre') leurreBonus(c, p);
    return;
  }
  // Le Guetteur (0.46) : son joueur voit les pièges posés devant lui (et s'en souvient).
  s.traps.push({ uid: card.uid, id: card.id, owner: p.id, target, posedRound: s.round, seenBy: victim.habitues.some((h) => h.id === 'guetteur') ? [p.id, target] : [p.id] });
}
function guetteurSees(s: CfState, p: CfPlayer) {
  if (!p.habitues.some((h) => h.id === 'guetteur')) return;
  for (const t of s.traps) if (t.target === p.id && !t.seenBy.includes(p.id)) t.seenBy.push(p.id);
}

function sameParams(a: PlayParams, b: PlayParams): boolean {
  return PARAM_KEYS.every((k) => a[k] === b[k]);
}

function effect(c: Ctx, p: CfPlayer, id: string, prm: PlayParams, playedBefore: number, selfUid = '') {
  const s = c.s;
  const you = (t: string, y: string, extra: Partial<CfEvent> = {}) => emit(c, { kind: 'effet', player: p.id, card: id, who: p.id, text: t, textYou: y, ...extra });
  switch (id) {
    case 'tournee-patron': {
      const g = gainTournees(c, p, TOURNEE_PATRON_GAIN, true);
      you(`${p.name} gagne ${plural(g, 'Tournée')} et pioche 1 carte.`, `Vous gagnez ${plural(g, 'Tournée')} et piochez 1 carte.`);
      draw(c, p, 1, false, true);
      break;
    }
    case 'fermeture': {
      if (!prm.habitue) {
        // 0.41 : on fait la caisse (2 Tournées) au lieu de piocher 2 cartes.
        const g = gainTournees(c, p, FERMETURE_TOURNEES, true);
        you(`Fermeture ! Aucun Habitué à chasser : ${p.name} fait la caisse (+${plural(g, 'Tournée')}).`, `Fermeture ! Aucun Habitué à chasser : vous faites la caisse (+${plural(g, 'Tournée')}).`);
        break;
      }
      const owner = s.players.find((o) => o.habitues.some((h) => h.uid === prm.habitue));
      if (!owner) break;
      const h = owner.habitues.find((x) => x.uid === prm.habitue)!;
      habitueLeaves(s, owner, h);
      emit(c, { kind: 'effet', player: owner.id, card: id, who: owner.id, text: `Fermeture ! ${cardName(h.id)} rentre chez lui (Habitué de ${owner.name}).`, textYou: `Fermeture ! ${cardName(h.id)} rentre chez lui.` });
      break;
    }
    case 'note-salee': p.r.noteSalee++; break;
    case 'cul-sec':
      p.r.bonusThrows++;
      you(`${p.name} a droit à un lancer de plus et pioche 1 carte.`, 'Vous avez droit à un lancer de plus et piochez 1 carte.');
      draw(c, p, 1, false, true);
      break;
    case 'tete-tourne':
      setDice(p, prm.die!, 7 - p.r.dice[prm.die!]);
      you(`${p.name} retourne un dé : ${p.r.dice.join('-')}.`, `Vous retournez un dé : ${p.r.dice.join('-')}.`, { dice: [...p.r.dice] });
      break;
    case 'pari-comptoir': p.r.pari++; break;
    case 'double-tournee': p.r.doubles++; break;
    case 'coup-pouce': case 'recompter': case 'ricochet':
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
      if (o.id === p.id) {
        you(`Le dé sous la table : ${p.name} relance un de ses dés (${p.r.dice.join('-')}).`, `Le dé sous la table : vous relancez un de vos dés (${p.r.dice.join('-')}).`, { dice: [...p.r.dice], rolled: [prm.die!] });
        break;
      }
      emit(c, { kind: 'effet', player: o.id, card: id, who: o.id, dice: [...o.r.dice], rolled: [prm.die!], text: `Le dé sous la table : un dé de ${o.name} est relancé (${o.r.dice.join('-')}).`, textYou: `Le dé sous la table : un de vos dés est relancé (${o.r.dice.join('-')}).` });
      break;
    }
    case 'tournee-generale': {
      if (!prm.target) {
        for (const i of diceIdx) setDice(p, i, c.die());
        you(`Tournée générale : ${p.name} relance tous ses dés (${p.r.dice.join('-')}).`, `Tournée générale : vous relancez tous vos dés (${p.r.dice.join('-')}).`, { dice: [...p.r.dice], rolled: [0, 1, 2] });
        break;
      }
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
      const n = o.tournees;
      o.tournees = 0;
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
      // 0.40 : la Fouine défausse directement le piège choisi (plus de paiement ni de choix).
      const o = pl(s, t.owner);
      s.traps = s.traps.filter((x) => x.uid !== t.uid);
      o.discard.push({ uid: t.uid, id: t.id });
      emit(c, { kind: 'fouine-defausse', player: p.id, card: t.id, who: p.id, text: `La Fouine de ${p.name} défausse le piège ${cardName(t.id)} de ${o.name} et pioche 1 carte.`, textYou: `La Fouine défausse le piège ${cardName(t.id)} de ${o.name} : vous piochez 1 carte.` });
      if (t.id === 'leurre') {
        emit(c, { kind: 'leurre', player: o.id, who: o.id, text: `C'était un Leurre : ${o.name} gagne ${plural(LEURRE_TOURNEES, 'Tournée')} et pioche ${plural(LEURRE_DRAW, 'carte')}.`, textYou: `Votre Leurre est découvert : vous gagnez ${plural(LEURRE_TOURNEES, 'Tournée')} et piochez ${plural(LEURRE_DRAW, 'carte')}.` });
        leurreBonus(c, o);
      }
      // 0.40 : la Fouine pioche aussi une carte quand elle défausse un piège.
      draw(c, p, 1, false, true);
      break;
    }
    case 'coup-coude': draw(c, p, 1, false, true); break;
    case 'pourboire': {
      const o = pl(s, prm.target!);
      p.tokens -= 1;
      o.tokens += 1;
      emit(c, { kind: 'effet', player: p.id, card: id, who: p.id, text: `Le Pourboire : ${p.name} donne 1 jeton à ${o.name} (il lui en reste ${p.tokens}) et pioche 1 carte.`, textYou: `Le Pourboire : vous donnez 1 jeton à ${o.name} (il vous en reste ${p.tokens}) et piochez 1 carte.` });
      if (!exits(c)) draw(c, p, 1, false, true);
      break;
    }
    case 'coup-etrier': {
      const before = p.r.dice[prm.die!];
      setDice(p, prm.die!, c.die());
      you(`Le Coup de l’étrier : ${p.name} relance son ${before} (${p.r.dice.join('-')}).`, `Le Coup de l’étrier : vous relancez votre ${before} (${p.r.dice.join('-')}).`, { dice: [...p.r.dice], rolled: [prm.die!] });
      break;
    }
    case 'efface-tout':
      p.r.efface = (p.r.efface ?? 0) + 1;
      you(`On efface tout : si ${p.name} perd la manche, il ne recevra qu’un jeton.`, 'On efface tout : si vous perdez la manche, vous ne recevrez qu’un jeton.');
      break;
    case 'verre-offert': {
      const o = pl(s, prm.target!);
      const later = o.r.done || s.order.indexOf(o.id) <= s.turn || s.phase !== 'turn';
      if (later) { o.penaltyNext = 1; o.penaltyNextCard = 'verre-offert'; } else { o.r.throwPenalty = 1; o.r.penaltyCard = 'verre-offert'; }
      const when = later ? 'à son prochain tour (manche suivante)' : 'ce tour-ci';
      emit(c, { kind: 'effet', player: o.id, card: id, who: o.id, text: `Le verre offert : ${o.name} n'aura qu'un seul lancer ${when}.`, textYou: `Le verre offert : vous n'aurez qu'un seul lancer ${later ? 'à votre prochain tour (manche suivante)' : 'ce tour-ci'}.` });
      break;
    }
    case 'trinquer': {
      const o = pl(s, prm.target!);
      const i = Math.floor(rnd(s) * 3);
      const j = Math.floor(rnd(s) * 3);
      const mine = p.r.dice[i];
      const his = o.r.dice[j];
      setDice(p, i, his);
      setDice(o, j, mine);
      emit(c, { kind: 'effet', player: o.id, card: id, who: o.id, dice: [...o.r.dice], text: `Trinquer : ${o.name} donne son ${his} et reçoit un ${mine} (${o.r.dice.join('-')}).`, textYou: `Trinquer : vous donnez votre ${his} et recevez un ${mine} (${o.r.dice.join('-')}).` });
      you(`Trinquer : ${p.name} échange son ${mine} contre le ${his} de ${o.name} (${p.r.dice.join('-')}).`, `Trinquer : vous échangez votre ${mine} contre le ${his} de ${o.name} (${p.r.dice.join('-')}).`, { dice: [...p.r.dice] });
      break;
    }
    case 'vide-poches': {
      // 0.41 : prend aussi 1 Tournée à l'adversaire (s'il en a).
      const o = pl(s, prm.target!);
      const took = Math.min(VIDE_POCHES_TOURNEES, o.tournees);
      if (took > 0) {
        o.tournees -= took;
        const g = gainTournees(c, p, took, true);
        emit(c, { kind: 'effet', player: o.id, card: id, who: o.id, text: `Le Vide-poches : ${p.name} prend ${plural(took, 'Tournée')} à ${o.name}${g < took ? ' (sa réserve est pleine)' : ''}.`, textYou: `Le Vide-poches : ${p.name} vous prend ${plural(took, 'Tournée')}.` });
      }
      if (!o.hand.length) break;
      const [k] = o.hand.splice(Math.floor(rnd(s) * o.hand.length), 1);
      o.discard.push(k);
      emit(c, { kind: 'effet', player: o.id, card: id, who: o.id, text: `Le Vide-poches : ${o.name} défausse ${cardName(k.id)} au hasard.`, textYou: `Le Vide-poches : vous défaussez ${cardName(k.id)} au hasard.` });
      break;
    }
    case 'tant-qu-on-y-est': {
      const g = gainTournees(c, p, playedBefore + 2, true);
      you(`Tant qu’on y est : ${p.name} gagne ${plural(g, 'Tournée')}.`, `Tant qu’on y est : vous gagnez ${plural(g, 'Tournée')}.`);
      break;
    }
    case 'petite-soeur': {
      let i = p.discard.length - 1;
      // Un Coup seulement, jamais une autre petite sœur (sinon deux petites sœurs se renverraient la balle sans fin).
      while (i >= 0 && (p.discard[i].uid === selfUid || !petiteSoeurOk(p.discard[i]))) i--;
      if (i < 0) { you(`La petite sœur : aucun Coup à reprendre pour ${p.name}.`, 'La petite sœur : aucun Coup à reprendre.'); break; }
      const [k] = p.discard.splice(i, 1);
      p.hand.push({ uid: k.uid, id: k.id });
      you(`La petite sœur : ${p.name} reprend ${cardName(k.id)} en main.`, `La petite sœur : vous reprenez ${cardName(k.id)} en main.`);
      break;
    }
    case 'mise-bouche':
      p.r.discount = MISE_FREE;
      you(`${p.name} pioche 1 carte : sa prochaine carte sera gratuite.`, 'Vous piochez 1 carte : votre prochaine carte sera gratuite.');
      draw(c, p, 1, false, true);
      break;
    case 'cafe-serre': {
      const hab = p.habitues.length > 0;
      const g = hab ? gainTournees(c, p, 1, true) : 0;
      you(`Le Café serré : ${p.name} pioche 1 carte${hab ? ` et gagne ${plural(g, 'Tournée')}` : ''}.`, `Le Café serré : vous piochez 1 carte${hab ? ` et gagnez ${plural(g, 'Tournée')}` : ''}.`);
      draw(c, p, 1, false, true);
      break;
    }
    case 'plat-du-jour': {
      const g = gainTournees(c, p, PLAT_TOURNEES, true);
      you(`Le Plat du jour : ${p.name} gagne ${plural(g, 'Tournée')}.`, `Le Plat du jour : vous gagnez ${plural(g, 'Tournée')}.`);
      break;
    }
    case 'boule-de-neige': {
      const n = Math.min(3, playedBefore);
      you(`La Boule de neige : ${p.name} pioche ${plural(n, 'carte')}.`, `La Boule de neige : vous piochez ${plural(n, 'carte')}.`);
      draw(c, p, n, false, true);
      break;
    }
    case 'effet-papillon':
      p.r.roundDiscount = (p.r.roundDiscount ?? 0) + 1;
      you(`L’Effet papillon : ${p.name} pioche ${plural(PAPILLON_DRAW, 'carte')} ; ses cartes coûtent 1 Tournée de moins cette manche.`, `L’Effet papillon : vous piochez ${plural(PAPILLON_DRAW, 'carte')} ; vos cartes coûtent 1 Tournée de moins cette manche.`);
      draw(c, p, PAPILLON_DRAW, false, true);
      break;
    case 'addition': p.r.addition = (p.r.addition ?? 0) + 1; you(`L’Addition : si ${p.name} gagne, sa combinaison vaudra au moins ${ADDITION_MIN}.`, `L’Addition : si vous gagnez, votre combinaison vaudra au moins ${ADDITION_MIN}.`); break;
    case 'sante': p.r.sante = (p.r.sante ?? 0) + 1; you(`À votre santé ! Si ${p.name} perd, le gagnant recevra aussi 1 jeton.`, 'À votre santé ! Si vous perdez, le gagnant recevra aussi 1 jeton.'); break;
    case 'compte-rond': {
      const g = gainTournees(c, p, Math.min(3, playedBefore), true);
      you(`Le Compte rond : ${p.name} gagne ${plural(g, 'Tournée')}.`, `Le Compte rond : vous gagnez ${plural(g, 'Tournée')}.`);
      break;
    }
    case 'petit-dernier': case 'calva': {
      const before = p.r.dice[prm.die!];
      setDice(p, prm.die!, id === 'calva' ? 7 - before : c.die());
      const lab = id === 'calva' ? 'Le Petit Calva' : 'Un petit dernier';
      const verb = id === 'calva' ? 'retourne' : 'relance';
      you(`${lab} : ${p.name} ${verb} son ${before} (${p.r.dice.join('-')}).`, `${lab} : vous ${id === 'calva' ? 'retournez' : 'relancez'} votre ${before} (${p.r.dice.join('-')}).`, { dice: [...p.r.dice], ...(id === 'calva' ? {} : { rolled: [prm.die!] }) });
      break;
    }
    case 'miroir': case 'derniere-maille': {
      setDice(p, prm.die!, prm.face!);
      const lab = id === 'miroir' ? 'Le Miroir du bar' : 'La Dernière maille';
      you(`${lab} : ${p.name} met un dé sur ${prm.face} (${p.r.dice.join('-')}).`, `${lab} : vous mettez un dé sur ${prm.face} (${p.r.dice.join('-')}).`, { dice: [...p.r.dice] });
      break;
    }
    case 'fee-verte': {
      let tries = 0;
      while (tries < FEE_TRIES) { tries++; setDice(p, prm.die!, c.die()); if (p.r.dice[prm.die!] === prm.face) break; }
      const ok = p.r.dice[prm.die!] === prm.face;
      you(`La Fée verte : ${ok ? `le dé de ${p.name} tombe sur ${prm.face}` : `pas de ${prm.face} pour ${p.name}`} en ${plural(tries, 'essai')} (${p.r.dice.join('-')}).`, `La Fée verte : ${ok ? `votre dé tombe sur ${prm.face}` : `pas de ${prm.face}`} en ${plural(tries, 'essai')} (${p.r.dice.join('-')}).`, { dice: [...p.r.dice], rolled: [prm.die!] });
      break;
    }
    case 'verres-echanges': {
      const o = pl(s, prm.target!);
      const mine = [...p.r.dice];
      const his = [...o.r.dice];
      for (const i of diceIdx) { setDice(p, i, his[i]); setDice(o, i, mine[i]); }
      p.r.forcedNenette = false; o.r.forcedNenette = false;
      emit(c, { kind: 'effet', player: o.id, card: id, who: o.id, dice: [...o.r.dice], text: `Les Verres échangés : ${o.name} récupère les dés de ${p.name} (${o.r.dice.join('-')}).`, textYou: `Les Verres échangés : vous récupérez les dés de ${p.name} (${o.r.dice.join('-')}).` });
      you(`Les Verres échangés : ${p.name} prend les dés de ${o.name} (${p.r.dice.join('-')}).`, `Les Verres échangés : vous prenez les dés de ${o.name} (${p.r.dice.join('-')}).`, { dice: [...p.r.dice] });
      break;
    }
    case 'debauchage': {
      if (!prm.habitue) {
        you(`Le Débauchage : aucun Habitué à débaucher, ${p.name} pioche 2 cartes.`, 'Le Débauchage : aucun Habitué à débaucher, vous piochez 2 cartes.');
        draw(c, p, 2, false, true);
        break;
      }
      const owner = s.players.find((o) => o.habitues.some((h) => h.uid === prm.habitue));
      if (!owner) break;
      const h = owner.habitues.find((x) => x.uid === prm.habitue)!;
      owner.habitues = owner.habitues.filter((x) => x.uid !== h.uid);
      const moved: CardInst = { ...h };
      const home = h.from ?? owner.id;
      if (home === p.id) delete moved.from; else moved.from = home;
      p.habitues.push(moved);
      guetteurSees(s, p);
      emit(c, { kind: 'effet', player: owner.id, card: id, who: owner.id, text: `Le Débauchage : ${cardName(h.id)} quitte ${owner.name} pour ${p.name}.`, textYou: `Le Débauchage : votre ${cardName(h.id)} passe chez ${p.name}.` });
      break;
    }
    case 'retrouvailles': {
      const k = retrouvaillesTarget(p, s.rules.maxHabitues);
      if (k) {
        p.discard = p.discard.filter((x) => x.uid !== k.uid);
        you(`Les Retrouvailles : ${cardName(k.id)} revient chez ${p.name}.`, `Les Retrouvailles : ${cardName(k.id)} revient s’installer devant vous.`);
        installHabitue(c, p, { uid: k.uid, id: k.id });
      }
      draw(c, p, 1, false, true);
      break;
    }
    case 'boucle': {
      const got: CardInst[] = [];
      for (let i = p.discard.length - 1; i >= 0 && got.length < 2; i--) {
        const k = p.discard[i];
        if (k.uid !== selfUid && boucleOk(k)) got.push(k);
      }
      p.discard = p.discard.filter((x) => !got.includes(x));
      p.hand.push(...got.map((k) => ({ uid: k.uid, id: k.id })));
      you(`La Boucle : ${p.name} reprend ${got.map((k) => cardName(k.id)).join(' et ') || 'rien'}.`, `La Boucle : vous reprenez ${got.map((k) => cardName(k.id)).join(' et ') || 'rien'}.`);
      break;
    }
    case 'passe-passe': {
      const t = s.traps.find((x) => x.uid === prm.trap && x.owner === p.id);
      if (!t) break;
      s.traps = s.traps.filter((x) => x.uid !== t.uid);
      p.hand.push({ uid: t.uid, id: t.id });
      const g = gainTournees(c, p, 1, true);
      you(`Le Tour de passe-passe : ${p.name} reprend un piège, gagne ${plural(g, 'Tournée')} et pioche 1 carte.`, `Le Tour de passe-passe : vous reprenez ${cardName(t.id)}, gagnez ${plural(g, 'Tournée')} et piochez 1 carte.`);
      draw(c, p, 1, false, true);
      break;
    }
    case 'denonciation': {
      const t = s.traps.find((x) => x.uid === prm.trap);
      if (!t) break;
      const o = pl(s, t.owner);
      s.traps = s.traps.filter((x) => x.uid !== t.uid);
      o.discard.push({ uid: t.uid, id: t.id });
      emit(c, { kind: 'fouine-defausse', player: p.id, card: t.id, who: p.id, text: `La Dénonciation de ${p.name} défausse le piège ${cardName(t.id)} de ${o.name}.`, textYou: `La Dénonciation défausse le piège ${cardName(t.id)} de ${o.name} : vous piochez 1 carte et gagnez 1 Tournée.` });
      if (t.id === 'leurre') leurreBonus(c, o);
      draw(c, p, 1, false, true);
      gainTournees(c, p, 1, true);
      break;
    }
    case 'embuscade': {
      const o = pl(s, prm.target!);
      let n = 0;
      for (const k of [...p.hand]) {
        if (def(k.id).type !== 'piege' || !canPoseOn(s, p.id, o.id)) continue;
        p.hand = p.hand.filter((x) => x.uid !== k.uid);
        emit(c, { kind: 'pose', player: p.id, who: p.id, target: o.id, text: `${p.name} pose un piège${isDuel(s) ? '' : ` sur ${o.name}`}.`, textYou: `Vous posez ${cardName(k.id)}${isDuel(s) ? '' : ` sur ${o.name}`}.` });
        poseTrap(c, p, k, o.id);
        n++;
      }
      you(`L’Embuscade : ${p.name} pose ${plural(n, 'piège')}.`, `L’Embuscade : vous posez ${plural(n, 'piège')}.`);
      break;
    }
    case 'calcul-mental': {
      const top = p.deck.splice(0, 3);
      if (top.length === 0) { you(`${p.name} n'a plus de cartes à regarder.`, 'Votre deck est vide.'); break; }
      if (top.length === 1) { p.hand.push(top[0]); break; }
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
  penaltyNextCard?: string;
  out: boolean;
  place: number | null;
  r: RoundState;
  throwLimit: number | null;
}

export interface CfTrapView { uid: string; owner: string; target: string; posedRound: number; id: string | null }

export interface CfView {
  you: string;
  /** Commande du comptoir de la manche (identifiant, voir COMMANDES), si la partie en a. */
  commande?: string | null;
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
    ...(s.commandes ? { commande: s.commande ?? null } : {}),
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
      penaltyNext: p.penaltyNext, ...(p.penaltyNextCard ? { penaltyNextCard: p.penaltyNextCard } : {}), out: p.out, place: p.place, r: structuredClone(p.r),
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
