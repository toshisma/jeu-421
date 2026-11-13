/**
 * 421 contre l'ordinateur (partie libre, Patron de la semaine, adversaires de fête, Tournée des
 * comptoirs) : table, hasard à graine, liste des décisions du joueur et rejeu par le serveur.
 * Voir shared/rejeu/common.ts pour le principe.
 *
 * Hasard : chaque lancer et chaque décision d'ordinateur tirent dans un flux propre à (graine,
 * numéro d'action de la partie) — l'ordre est donc toujours le même sur le téléphone et sur le serveur.
 * La 3D n'est pas concernée : le bac anime les dés jusqu'aux valeurs données par le moteur (comme en ligne).
 */
import { DEFAULT_CONFIG, isSuddenDeath, sanitizeConfig, type GameConfig } from '../config';
import { createGame, currentPlayerId, rollAction, stopAction, type GameState } from '../engine';
import { decide, type Difficulty } from '../ai';
import type { ComboKind } from '../combos';
import { albumKey, didWin, finalPlace, settledPlace } from '../progress/profile';
import { bossOfWeek } from '../progress/boss';
import { feteBoss } from '../progress/fetes';
import { tdcBistro, tdcConfig, tdcPatron } from '../progress/comptoirs';
import { REJEU_ERRORS, isPersonaId, streamAt, type ReplayResult } from './common';
import type { Rng } from '../rng';

export const ME = 'moi';
export const botId = (i: number) => `ia-${i}`;
/** Décisions au plus dans une partie (≈ 15 fois une très longue partie réelle). */
export const MAX_MOVES_421 = 4000;
const DIFFS: Difficulty[] = ['facile', 'normal', 'difficile'];

/**
 * Prudence des personnages (shared/ai.ts : AiStyle). Mêmes valeurs que client/src/game/personas.ts et
 * client/src/fetes/personas.ts (un test le vérifie) ; patrons de la Tournée : shared/progress/comptoirs.ts.
 */
export const PERSONA_CAUTION: Record<string, number> = {
  marcel: 0.02, josiane: 0.05, baron: 0, lulu: -0.03, dede: -0.05, simone: 0.01, gege: 0.03,
  'fete-saint-nicolas': 0.01, 'fete-fouettard': 0.02, 'fete-pere-noel': 0,
};
/** Habitués du 421 (parties libres et acolytes du patron). */
export const HABITUES = ['marcel', 'josiane', 'baron', 'lulu', 'dede', 'simone', 'gege'];
export const cautionOf = (persona: string): number | null => PERSONA_CAUTION[persona] ?? tdcPatron(persona)?.caution ?? null;

export interface Opp421 { persona: string; difficulty: Difficulty }
export interface Setup421 {
  config: GameConfig;
  opponents: Opp421[];
  /** Siège du premier joueur (tiré par le téléphone avant de connaître la graine). */
  firstIdx: number;
}

/**
 * Table d'une partie qui commence, validée par le serveur. `kind` dit ce que le serveur a fixé :
 * partie libre (règles et adversaires choisis par le joueur), patron de la semaine, adversaire de fête
 * ou bistrot de la Tournée (règles et adversaires imposés : ceux envoyés par le téléphone sont vérifiés).
 * Renvoie null si la table n'est pas valable.
 */
export function setup421For(raw: unknown, kind: { boss?: string | null; tdc?: string | null; day: string }): Setup421 | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const opps = Array.isArray(r.opponents) ? r.opponents : null;
  if (!opps || opps.length < 1 || opps.length > 5) return null;
  const opponents: Opp421[] = [];
  for (const o of opps) {
    const p = (o as Record<string, unknown>)?.persona, d = (o as Record<string, unknown>)?.difficulty;
    if (!isPersonaId(p) || cautionOf(p) === null || !DIFFS.includes(d as Difficulty)) return null;
    opponents.push({ persona: p, difficulty: d as Difficulty });
  }
  const firstIdx = r.firstIdx;
  if (typeof firstIdx !== 'number' || !Number.isInteger(firstIdx) || firstIdx < 0 || firstIdx > opponents.length) return null;
  const same = (a: Opp421[], b: Opp421[]) => a.length === b.length && a.every((x, i) => x.persona === b[i].persona && x.difficulty === b[i].difficulty);

  if (kind.tdc) {
    const b = tdcBistro(kind.tdc);
    if (!b || !same(opponents, b.opponents)) return null;
    return { config: tdcConfig(b), opponents, firstIdx };
  }
  if (kind.boss) {
    const week = bossOfWeek(kind.day);
    const fete = feteBoss(kind.day);
    if (week.id === kind.boss) {
      // Le patron (difficile) et ses acolytes (habitués, normal), comme BossController.
      if (opponents[0].persona !== week.persona || opponents[0].difficulty !== 'difficile' || opponents.length !== 1 + week.sidekicks) return null;
      const side = opponents.slice(1);
      if (side.some((o) => o.difficulty !== 'normal' || !HABITUES.includes(o.persona) || o.persona === week.persona) || new Set(side.map((o) => o.persona)).size !== side.length) return null;
      return { config: sanitizeConfig({ ...DEFAULT_CONFIG, ...week.config }), opponents, firstIdx };
    }
    if (fete && fete.def.id === kind.boss) {
      const cast = fete.cast.slice(0, 1 + fete.def.sidekicks);
      const want = cast.map((id, i) => ({ persona: `fete-${id}`, difficulty: (i === 0 ? 'difficile' : 'normal') as Difficulty }));
      if (!same(opponents, want)) return null;
      return { config: sanitizeConfig({ ...DEFAULT_CONFIG, ...fete.def.config }), opponents, firstIdx };
    }
    return null;
  }
  // Partie libre : règles bornées, habitués seulement.
  if (opponents.some((o) => !HABITUES.includes(o.persona))) return null;
  // Une seule difficulté pour toute la table (la récompense se calcule sur elle), et pas deux fois le même habitué.
  if (opponents.some((o) => o.difficulty !== opponents[0].difficulty) || new Set(opponents.map((o) => o.persona)).size !== opponents.length) return null;
  return { config: sanitizeConfig(r.config), opponents, firstIdx };
}

// ---------------------------------------------------------------------------------------------
// Hasard à graine

/** Dés du prochain lancer (au moment où la partie en est à `version`). */
export function dieAt(seed: number, version: number): () => number {
  const rng = streamAt(seed, version, 0xd1ce);
  return () => 1 + Math.floor(rng() * 6);
}
/** Tirage des décisions d'un ordinateur (au moment `version`). */
export const botRngAt = (seed: number, version: number): Rng => streamAt(seed, version, 0xb07);

/** Coup d'un ordinateur, joué à l'identique sur le téléphone et sur le serveur. */
export function playBot421(s: GameState, setup: Setup421, seed: number, pid: string): { rolled: boolean } {
  const opp = setup.opponents[Number(pid.slice(3))];
  const d = decide(s, pid, opp.difficulty, botRngAt(seed, s.version), { caution: cautionOf(opp.persona) ?? 0 });
  if (d.kind === 'roll' && rollAction(s, pid, d.keep, dieAt(seed, s.version)).ok) return { rolled: true };
  stopAction(s, pid);
  return { rolled: false };
}

export function newGame421(setup: Setup421, names?: string[]): GameState {
  const players = [{ id: ME, name: names?.[0] ?? ME }, ...setup.opponents.map((_, i) => ({ id: botId(i), name: names?.[i + 1] ?? botId(i) }))];
  return createGame(setup.config, players, setup.firstIdx);
}

// ---------------------------------------------------------------------------------------------
// Décisions du joueur : une lettre par décision.
//  S = garder (valider son tour) ; a…h = lancer, en gardant les dés du masque (bit i = dé i gardé) ;
//  i…p = idem, lancer fait d'un geste (glissé sur le bac : statistique « lancers d'un geste »).

export function moveRoll(keep: boolean[], gesture: boolean): string {
  const m = (keep[0] ? 1 : 0) | (keep[1] ? 2 : 0) | (keep[2] ? 4 : 0);
  return String.fromCharCode(97 + m + (gesture ? 8 : 0));
}
export const MOVE_STOP = 'S';

/** Faits d'une partie, calculés par le moteur (le téléphone compte les mêmes dans GameScreen). */
export interface Facts421 {
  won: boolean;
  place: number;
  /** Manche en cours quand la place du joueur est devenue définitive (ou à la fin). */
  rounds: number;
  roundsLost?: number;
  count421: number;
  combos: Partial<Record<ComboKind, number>>;
  gestureThrows: number;
  maxTokens: number;
  comboKeys: string[];
  best?: { label: string; rank: number };
  suddenDeath: boolean;
  opponents: number;
  difficulty: Difficulty;
}

/**
 * Rejoue une partie : graine + table + décisions du joueur. S'arrête dès que la place du joueur est
 * définitive (sorti avant la fin : sa place ne peut plus changer) ou à la fin de la partie.
 * Refuse une décision impossible, une liste trop courte (partie inachevée) ou trop longue.
 */
export function replay421(setup: Setup421, seed: number, moves: unknown): ReplayResult<Facts421> {
  if (typeof moves !== 'string' || !/^[a-pS]*$/.test(moves)) return { ok: false, error: REJEU_ERRORS.format };
  if (moves.length > MAX_MOVES_421) return { ok: false, error: REJEU_ERRORS.tooLong };
  let s: GameState;
  try { s = newGame421(setup); } catch { return { ok: false, error: REJEU_ERRORS.setup }; }
  const f: Facts421 = {
    won: false, place: setup.opponents.length + 1, rounds: 1, count421: 0, combos: {}, gestureThrows: 0, maxTokens: 0, comboKeys: [],
    suddenDeath: isSuddenDeath(setup.config), opponents: setup.opponents.length, difficulty: setup.opponents[0].difficulty,
  };
  let lost = 0;
  let mi = 0;
  const done = () => s.phase === 'fini' || settledPlace(s, ME) != null;
  const after = (summarySeq: number | undefined) => {
    const me = s.players.find((p) => p.id === ME)!;
    f.maxTokens = Math.max(f.maxTokens, me.tokens);
    const sm = s.lastSummary;
    if (sm && sm.seq !== summarySeq && !sm.barrage && sm.loserId === ME) lost++;
  };
  after(undefined);
  for (let guard = 0; !done(); guard++) {
    if (guard > 400_000) return { ok: false, error: REJEU_ERRORS.tooLong };
    const pid = currentPlayerId(s)!;
    const seq = s.lastSummary?.seq;
    if (pid !== ME) { playBot421(s, setup, seed, pid); after(seq); continue; }
    if (mi >= moves.length) return { ok: false, error: REJEU_ERRORS.incomplete };
    const c = moves[mi++];
    if (c === MOVE_STOP) {
      if (!stopAction(s, ME).ok) return { ok: false, error: REJEU_ERRORS.illegal };
    } else {
      const m = c.charCodeAt(0) - 97;
      const keep = [!!(m & 1), !!(m & 2), !!(m & 4)];
      const r = rollAction(s, ME, keep, dieAt(seed, s.version));
      if (!r.ok) return { ok: false, error: REJEU_ERRORS.illegal };
      const roll = r.roll!;
      if (roll.combo.kind === '421' && !roll.rolloff) f.count421++;
      f.combos[roll.combo.kind] = (f.combos[roll.combo.kind] ?? 0) + 1;
      if (m & 8) f.gestureThrows++;
      const k = albumKey(roll.dice);
      if (k && !f.comboKeys.includes(k)) f.comboKeys.push(k);
      if (!f.best || roll.combo.rank > f.best.rank) f.best = { label: roll.combo.label, rank: roll.combo.rank };
    }
    after(seq);
  }
  if (mi < moves.length) return { ok: false, error: REJEU_ERRORS.extra };
  f.won = didWin(s, ME);
  f.place = finalPlace(s, ME);
  f.rounds = s.round;
  f.roundsLost = s.config.variant === 'manches' ? undefined : lost;
  return { ok: true, facts: f };
}
