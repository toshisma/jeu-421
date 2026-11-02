/**
 * Moteur de règles du 421 — pur TypeScript, sans rendu ni réseau.
 * Utilisé tel quel par le serveur (autorité en multijoueur) et par le client (mode solo).
 *
 * Les fonctions d'action modifient l'état reçu et renvoient { ok } ou { ok:false, error }.
 * Chaque action réussie incrémente `version`, ce qui permet au serveur de rejeter
 * les doubles clics et les actions envoyées sur un état périmé.
 */
import type { GameConfig } from './config';
import { compareTurn, evaluate, type Combo } from './combos';

export type Phase = 'charge' | 'decharge' | 'manche' | 'fini';

export interface TurnResult { dice: number[]; combo: Combo; throws: number }

export interface PlayerState {
  id: string;
  name: string;
  tokens: number;
  score: number;
  out: boolean; // sorti (s'est débarrassé de ses jetons)
  finishPos: number | null;
  lastResult: TurnResult | null;
}

export interface RollRecord {
  seq: number;
  round: number;
  playerId: string;
  dice: number[];
  kept: boolean[];
  throwIndex: number; // 1 = premier lancer
  throwLimit: number;
  combo: Combo;
  rolloff: boolean;
}

export interface LogEntry { seq: number; round: number; kind: 'manche' | 'info' | 'barrage'; text: string }

export interface RoundSummary {
  seq: number;
  round: number;
  phase: Phase;
  winnerId: string | null;
  loserId: string | null;
  amount: number;
  text: string;
  barrage: boolean;
}

export interface GameState {
  config: GameConfig;
  players: PlayerState[]; // ordre des sièges
  phase: Phase;
  pot: number;
  round: number;
  roundStarter: string;
  roundOrder: string[]; // ordre de jeu de la manche en cours
  turnIdx: number;
  isRolloff: boolean;
  rolloffPayout: number | null;
  rolloffPayerId: string | null;
  rolloffLabel: string | null; // combinaison du payeur, conservée pendant le barrage
  dice: number[]; // dés du joueur actif (0 = pas encore lancé)
  throwsUsed: number;
  throwLimit: number;
  roundThrowLimit: number | null; // fixé par le premier joueur
  results: Record<string, TurnResult>;
  history: RollRecord[];
  log: LogEntry[];
  lastSummary: RoundSummary | null;
  ranking: string[]; // à la fin : du premier au dernier
  loserId: string | null;
  version: number;
  seq: number;
}

export type ActionResult = { ok: true; roll?: RollRecord } | { ok: false; error: string };

const HISTORY_CAP = 80;
const LOG_CAP = 60;

export function createGame(config: GameConfig, players: { id: string; name: string }[], firstIdx = 0): GameState {
  if (players.length < 2 || players.length > 6) throw new Error('Il faut entre 2 et 6 joueurs');
  const ps: PlayerState[] = players.map((p) => ({
    id: p.id, name: p.name,
    tokens: config.variant === 'decharge' ? config.startTokens : 0,
    score: 0, out: false, finishPos: null, lastResult: null,
  }));
  const s: GameState = {
    config,
    players: ps,
    phase: config.variant === 'classique' ? 'charge' : config.variant === 'decharge' ? 'decharge' : 'manche',
    pot: config.variant === 'classique' ? config.totalTokens : 0,
    round: 1,
    roundStarter: ps[firstIdx % ps.length].id,
    roundOrder: [],
    turnIdx: 0,
    isRolloff: false,
    rolloffPayout: null,
    rolloffPayerId: null,
    rolloffLabel: null,
    dice: [0, 0, 0],
    throwsUsed: 0,
    throwLimit: config.maxThrows,
    roundThrowLimit: null,
    results: {},
    history: [],
    log: [],
    lastSummary: null,
    ranking: [],
    loserId: null,
    version: 0,
    seq: 0,
  };
  addLog(s, 'info', s.phase === 'charge' ? `La charge commence : ${s.pot} jetons dans le pot.` : 'La partie commence.');
  startRound(s, s.roundStarter);
  return s;
}

// ---------------------------------------------------------------------------------------------

export function currentPlayerId(s: GameState): string | null {
  return s.phase === 'fini' ? null : s.roundOrder[s.turnIdx] ?? null;
}
export const getPlayer = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const nameOf = (s: GameState, id: string) => getPlayer(s, id).name;
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

function addLog(s: GameState, kind: LogEntry['kind'], text: string) {
  s.log.push({ seq: ++s.seq, round: s.round, kind, text });
  if (s.log.length > LOG_CAP) s.log.shift();
}

function isActive(s: GameState, p: PlayerState): boolean {
  return !p.out;
}

/** Ordre de jeu à partir d'un joueur, dans le sens configuré, parmi les joueurs encore en jeu. */
function orderFrom(s: GameState, starterId: string): string[] {
  const n = s.players.length;
  const step = s.config.direction === 'horaire' ? 1 : -1;
  let idx = s.players.findIndex((p) => p.id === starterId);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const p = s.players[(((idx + k * step) % n) + n) % n];
    if (isActive(s, p)) out.push(p.id);
  }
  return out;
}

function nextSeat(s: GameState, fromId: string): string {
  const order = orderFrom(s, fromId);
  return order[1] ?? order[0];
}

function startRound(s: GameState, starterId: string) {
  // Si le joueur prévu est sorti, on prend le suivant encore en jeu.
  const starter = getPlayer(s, starterId);
  s.roundStarter = isActive(s, starter) ? starterId : nextSeat(s, starterId);
  s.roundOrder = orderFrom(s, s.roundStarter);
  s.turnIdx = 0;
  s.results = {};
  s.roundThrowLimit = null;
  s.isRolloff = false;
  s.rolloffPayout = null;
  s.rolloffPayerId = null;
  s.rolloffLabel = null;
  beginTurn(s);
}

function beginTurn(s: GameState) {
  s.dice = [0, 0, 0];
  s.throwsUsed = 0;
  let limit = s.isRolloff ? 1 : s.phase === 'charge' ? s.config.chargeThrows : s.config.maxThrows;
  if (!s.isRolloff && s.config.leaderSetsThrows && s.roundThrowLimit != null) limit = Math.min(limit, s.roundThrowLimit);
  s.throwLimit = limit;
}

// ---------------------------------------------------------------------------------------------
// Actions

/**
 * Lancer (ou relancer) les dés. `keep[i] = true` conserve le dé i.
 * `rollDie` est la source officielle de hasard (crypto côté serveur).
 */
export function rollAction(s: GameState, playerId: string, keep: boolean[], rollDie: () => number): ActionResult {
  if (s.phase === 'fini') return { ok: false, error: 'La partie est terminée' };
  if (currentPlayerId(s) !== playerId) return { ok: false, error: "Ce n'est pas votre tour" };
  if (s.throwsUsed >= s.throwLimit) return { ok: false, error: 'Plus aucun lancer disponible' };
  if (!Array.isArray(keep) || keep.length !== 3 || keep.some((k) => typeof k !== 'boolean'))
    return { ok: false, error: 'Sélection de dés invalide' };
  const k = s.throwsUsed === 0 ? [false, false, false] : keep;
  if (k.every(Boolean)) return { ok: false, error: 'Sélectionnez au moins un dé à relancer' };

  s.dice = s.dice.map((d, i) => (k[i] ? d : rollDie()));
  s.throwsUsed++;
  const combo = evaluate(s.dice, s.config.values);
  const roll: RollRecord = {
    seq: ++s.seq, round: s.round, playerId, dice: [...s.dice], kept: [...k],
    throwIndex: s.throwsUsed, throwLimit: s.throwLimit, combo, rolloff: s.isRolloff,
  };
  s.history.push(roll);
  if (s.history.length > HISTORY_CAP) s.history.shift();
  if (s.throwsUsed >= s.throwLimit) endTurn(s);
  s.version++;
  return { ok: true, roll };
}

/** Valider son tour (garder la combinaison actuelle). */
export function stopAction(s: GameState, playerId: string): ActionResult {
  if (s.phase === 'fini') return { ok: false, error: 'La partie est terminée' };
  if (currentPlayerId(s) !== playerId) return { ok: false, error: "Ce n'est pas votre tour" };
  if (s.throwsUsed < 1) return { ok: false, error: 'Lancez les dés au moins une fois' };
  endTurn(s);
  s.version++;
  return { ok: true };
}

function endTurn(s: GameState) {
  const id = s.roundOrder[s.turnIdx];
  const result: TurnResult = { dice: [...s.dice], combo: evaluate(s.dice, s.config.values), throws: s.throwsUsed };
  s.results[id] = result;
  getPlayer(s, id).lastResult = result;
  if (s.turnIdx === 0 && !s.isRolloff && s.config.leaderSetsThrows) s.roundThrowLimit = s.throwsUsed;
  s.turnIdx++;
  if (s.turnIdx >= s.roundOrder.length) resolveRound(s);
  else beginTurn(s);
}

// ---------------------------------------------------------------------------------------------
// Fin de manche

/** Total des dés. */
export const diceSum = (d: number[]) => d[0] + d[1] + d[2];

/**
 * Comparaison de deux tours pour la manche en cours. Pendant un barrage « à l'addition »,
 * c'est le total des trois dés qui départage (le plus petit total perd) ; sinon la figure.
 */
export function turnComparer(s: GameState) {
  if (s.isRolloff && s.config.rolloffMode === 'addition') return (a: TurnResult, b: TurnResult) => diceSum(a.dice) - diceSum(b.dice);
  return (a: TurnResult, b: TurnResult) => compareTurn(a, b, s.config);
}

function summarize(s: GameState, partial: Omit<RoundSummary, 'seq' | 'round' | 'phase'>, phase: Phase) {
  s.lastSummary = { seq: ++s.seq, round: s.round, phase, ...partial };
  addLog(s, partial.barrage ? 'barrage' : 'manche', partial.text);
}

function resolveRound(s: GameState) {
  const cfg = s.config;
  const order = s.roundOrder;
  const res = (id: string) => s.results[id];
  const phaseAtRound = s.phase;

  // --- Variante aux points ---------------------------------------------------------------
  if (s.phase === 'manche') {
    let best = order[0];
    for (const id of order) {
      getPlayer(s, id).score += res(id).combo.value;
      if (compareTurn(res(id), res(best), cfg) > 0) best = id;
    }
    summarize(s, {
      winnerId: best, loserId: null, amount: res(best).combo.value, barrage: false,
      text: `Manche ${s.round} : meilleure combinaison pour ${nameOf(s, best)} (${res(best).combo.label}).`,
    }, phaseAtRound);
    if (s.round >= cfg.rounds) {
      finish(s, [...s.players].sort((a, b) => b.score - a.score).map((p) => p.id), null);
      return;
    }
    s.round++;
    startRound(s, nextSeat(s, s.roundStarter));
    return;
  }

  // --- Charge / décharge ------------------------------------------------------------------
  const cmp = turnComparer(s);
  let best = order[0];
  for (const id of order) if (cmp(res(id), res(best)) > 0) best = id;
  let worst: string[] = [order[0]];
  for (const id of order.slice(1)) {
    const c = cmp(res(id), res(worst[0]));
    if (c < 0) worst = [id];
    else if (c === 0) worst.push(id);
  }
  let payerId = s.isRolloff ? s.rolloffPayerId! : best;
  let payout = s.isRolloff ? s.rolloffPayout! : res(best).combo.value;
  let payLabel = s.isRolloff ? s.rolloffLabel! : res(best).combo.label;

  let loser: string;
  if (worst.length > 1) {
    if (cfg.tieRule === 'barrage') {
      summarize(s, {
        winnerId: null, loserId: null, amount: payout, barrage: true,
        text: `Égalité pour la dernière place entre ${worst.map((id) => nameOf(s, id)).join(', ')} : barrage ${cfg.rolloffMode === 'addition' ? 'à l’addition' : 'à la figure'} !`,
      }, phaseAtRound);
      s.isRolloff = true;
      s.rolloffPayout = payout;
      s.rolloffPayerId = payerId;
      s.rolloffLabel = payLabel;
      s.roundOrder = worst;
      s.turnIdx = 0;
      s.results = {};
      beginTurn(s);
      return;
    }
    loser = cfg.tieRule === 'premierPerd' ? worst[0] : worst[worst.length - 1];
  } else loser = worst[0];

  // Au barrage, si le « payeur » d'origine perd lui-même, le meilleur des autres paie.
  if (loser === payerId) {
    const others = order.filter((id) => id !== loser);
    payerId = others.reduce((a, b) => (cmp(res(b), res(a)) > 0 ? b : a), others[0]);
    payLabel = res(payerId).combo.label;
  }
  if (res(loser).combo.kind === 'nenette') payout = Math.max(payout, cfg.values.nenetteMin);

  const loserP = getPlayer(s, loser);
  let text: string;
  let amount: number;
  if (s.phase === 'charge') {
    amount = Math.min(payout, s.pot);
    s.pot -= amount;
    loserP.tokens += amount;
    text = `${loserP.name} prend ${plural(amount, 'jeton')} au pot (${payLabel} de ${nameOf(s, payerId)}).`;
  } else {
    const payer = getPlayer(s, payerId);
    amount = Math.min(payout, payer.tokens);
    payer.tokens -= amount;
    loserP.tokens += amount;
    text = `${payer.name} donne ${plural(amount, 'jeton')} à ${loserP.name} (${payLabel}).`;
  }
  summarize(s, { winnerId: payerId, loserId: loser, amount, barrage: false, text }, phaseAtRound);

  let finishCount = s.players.filter((p) => p.finishPos != null).length;
  const exit = (p: PlayerState) => {
    p.out = true;
    p.finishPos = ++finishCount;
    addLog(s, 'info', `${p.name} n'a plus de jetons et sort de la partie.`);
  };

  if (s.phase === 'charge' && s.pot === 0) {
    s.phase = 'decharge';
    addLog(s, 'info', 'Le pot est vide : place à la décharge !');
    for (const p of s.players) if (p.tokens === 0) exit(p);
  } else if (s.phase === 'decharge') {
    const payer = getPlayer(s, payerId);
    if (payer.tokens === 0 && !payer.out) exit(payer);
  }

  const remaining = s.players.filter((p) => !p.out);
  if (s.phase === 'decharge' && remaining.length <= 1) {
    const last = remaining[0] ?? loserP;
    const ranking = s.players.filter((p) => p.out).sort((a, b) => a.finishPos! - b.finishPos!).map((p) => p.id);
    finish(s, [...ranking, last.id], last.id);
    return;
  }

  s.round++;
  startRound(s, cfg.loserStarts ? loser : nextSeat(s, s.roundStarter));
}

function finish(s: GameState, ranking: string[], loserId: string | null) {
  s.phase = 'fini';
  s.ranking = ranking;
  s.loserId = loserId;
  s.dice = [...s.dice];
  addLog(s, 'info', loserId
    ? `Partie terminée : ${nameOf(s, loserId)} a perdu. Bravo à ${nameOf(s, ranking[0])} !`
    : `Partie terminée : victoire de ${nameOf(s, ranking[0])} !`);
}

// ---------------------------------------------------------------------------------------------
// Aides pour l'affichage

/** Joueur en tête et joueur en difficulté (null si non pertinent). */
export function standings(s: GameState): { leader: string | null; struggling: string | null } {
  const active = s.players.filter((p) => !p.out);
  if (active.length < 2) return { leader: null, struggling: null };
  if (s.config.variant === 'manches') {
    const sorted = [...active].sort((a, b) => b.score - a.score);
    if (sorted[0].score === sorted[sorted.length - 1].score) return { leader: null, struggling: null };
    return { leader: sorted[0].id, struggling: sorted[sorted.length - 1].id };
  }
  // Moins on a de jetons, mieux c'est.
  const sorted = [...active].sort((a, b) => a.tokens - b.tokens);
  if (sorted[0].tokens === sorted[sorted.length - 1].tokens) return { leader: null, struggling: null };
  return { leader: sorted[0].id, struggling: sorted[sorted.length - 1].id };
}

// ---------------------------------------------------------------------------------------------
// Suivi de la manche en cours (affichage « 521 pour 6 jetons »)

export interface RoundStatus {
  /** Joueur(s) actuellement en dernière place, avec leur combinaison. */
  worst: { ids: string[]; combo: Combo } | null;
  /** Meilleure combinaison actuelle (celle qui fixe l'enjeu). */
  best: { id: string; combo: Combo } | null;
  /** Jetons que prendrait le perdant si la manche s'arrêtait maintenant. */
  amount: number;
  /** Joueurs qui n'ont pas encore terminé leur tour (joueur actif compris). */
  remaining: number;
  /** Variante aux points : pas d'enjeu, seulement le meilleur score. */
  points: boolean;
  /** Barrage à l'addition : on compare le total des dés. */
  addition: boolean;
}

/**
 * État de la manche à partir des tours déjà terminés, en appliquant exactement les mêmes règles
 * que la fin de manche (enjeu fixé par le meilleur, nénette, pot vide, payeur à court de jetons).
 * `extra` permet de simuler « et si le joueur actif gardait ses dés maintenant ? ».
 */
export function roundStatus(s: GameState, extra?: { id: string; dice: number[]; throws: number }): RoundStatus {
  const cfg = s.config;
  const results: Record<string, TurnResult> = { ...s.results };
  if (extra) results[extra.id] = { dice: extra.dice, combo: evaluate(extra.dice, cfg.values), throws: extra.throws };
  const played = s.roundOrder.filter((id) => results[id]);
  const remaining = s.roundOrder.length - played.length;
  const points = s.phase === 'manche';
  const addition = s.isRolloff && cfg.rolloffMode === 'addition';
  if (!played.length || s.phase === 'fini') return { worst: null, best: null, amount: 0, remaining, points, addition };

  const cmp = turnComparer(s);
  let best = played[0];
  for (const id of played) if (cmp(results[id], results[best]) > 0) best = id;
  let worst = [played[0]];
  for (const id of played.slice(1)) {
    const c = cmp(results[id], results[worst[0]]);
    if (c < 0) worst = [id]; else if (c === 0) worst.push(id);
  }
  if (points) return { worst: null, best: { id: best, combo: results[best].combo }, amount: results[best].combo.value, remaining, points, addition };

  let payer = s.isRolloff ? s.rolloffPayerId! : best;
  let amount = s.isRolloff ? s.rolloffPayout! : results[best].combo.value;
  // Qui perdrait, selon la règle d'égalité (null = barrage).
  const loser = worst.length === 1 ? worst[0]
    : cfg.tieRule === 'premierPerd' ? worst[0] : cfg.tieRule === 'dernierPerd' ? worst[worst.length - 1] : null;
  // Comme en fin de manche : si le perdant est aussi le « payeur », le meilleur des autres paie.
  if (loser && loser === payer && played.length > 1) {
    const others = played.filter((id) => id !== loser);
    payer = others.reduce((x, y) => (cmp(results[y], results[x]) > 0 ? y : x), others[0]);
  }
  if (loser && results[loser].combo.kind === 'nenette') amount = Math.max(amount, cfg.values.nenetteMin);
  if (s.phase === 'charge') amount = Math.min(amount, s.pot);
  else if (s.phase === 'decharge') amount = Math.min(amount, getPlayer(s, payer).tokens);
  return {
    worst: { ids: worst, combo: results[worst[0]].combo },
    best: { id: best, combo: results[best].combo },
    amount, remaining, points, addition,
  };
}
