/**
 * Poker menteur contre l'ordinateur : table, décisions du joueur et rejeu par le serveur.
 * Les dés viennent de la graine (moteur) ; les ordinateurs tirent leurs hésitations dans un flux
 * propre à l'état de la partie (`pmBotRng`) au lieu de Math.random : même décision partout.
 */
import { act, newGame, placeOf, PM_LEVELS, PM_LIVES, type PmAction, type PmLevel, type PmState } from '../pokermenteur/engine';
import { decide } from '../pokermenteur/ai';
import { newPmFeat, trackPmFeats, type PmFeats } from '../pokermenteur/feats';
import { REJEU_ERRORS, isPersonaId, streamAt, type ReplayResult } from './common';
import type { Rng } from '../rng';

export const PM_ME = 'moi';
export const MAX_MOVES_PM = 2000;

export interface SetupPm {
  level: PmLevel; lives: number; noStraights: boolean;
  /** Personnages des ordinateurs (1 à 5), dans l'ordre des sièges (le joueur est au siège 0). */
  bots: string[];
  /** Siège de celui qui commence (tiré par le téléphone avant de connaître la graine). */
  start: number;
}

export function setupPmFrom(raw: unknown): SetupPm | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r) return null;
  const bots = Array.isArray(r.bots) ? r.bots : null;
  if (!bots || bots.length < 1 || bots.length > 5 || !bots.every(isPersonaId) || new Set(bots).size !== bots.length || bots.includes(PM_ME)) return null;
  if (!PM_LEVELS.includes(r.level as PmLevel) || !(PM_LIVES as readonly number[]).includes(r.lives as number) || typeof r.noStraights !== 'boolean') return null;
  if (typeof r.start !== 'number' || !Number.isInteger(r.start) || r.start < 0 || r.start > bots.length) return null;
  return { level: r.level as PmLevel, lives: r.lives as number, noStraights: r.noStraights, bots: bots as string[], start: r.start };
}

/** Sièges : moi puis les ordinateurs ; l'ordre de jeu commence au siège `start`. */
export function newGamePm(setup: SetupPm, seed: number, names?: string[]): PmState {
  const seats = [{ id: PM_ME, name: names?.[0] ?? PM_ME }, ...setup.bots.map((id, i) => ({ id, name: names?.[i + 1] ?? id, bot: setup.level }))];
  const order = [...seats.slice(setup.start), ...seats.slice(0, setup.start)];
  return newGame(order, { lives: setup.lives, noStraights: setup.noStraights }, seed);
}

/** Tirage d'un ordinateur pour la décision en cours (dérivé de la graine et de l'état). */
export const pmBotRng = (s: PmState): Rng => streamAt(s.seed, (s.turns * 64 + s.draws) * 8 + ['annonce', 'decision', 'relance', 'fini'].indexOf(s.phase), 0x9a7 + s.current);
export const pmBotDecide = (s: PmState, level: PmLevel): PmAction => decide(s, level, pmBotRng(s));

/** M = « Menteur ! » ; C = je crois ; R<positions> = relancer ces dés ; A<5 faces 0–5> = annoncer. Séparées par « . ». */
export function encodePm(a: PmAction): string {
  switch (a.type) {
    case 'menteur': return 'M';
    case 'croire': return 'C';
    case 'relancer': return `R${a.pick.join('')}`;
    case 'annoncer': return `A${a.hand.join('')}`;
  }
}
function decodePm(m: string): PmAction | null {
  if (m === 'M') return { type: 'menteur' };
  if (m === 'C') return { type: 'croire' };
  let x = /^R([0-4]{0,5})$/.exec(m);
  if (x) return { type: 'relancer', pick: [...x[1]].map(Number) };
  x = /^A([0-5]{5})$/.exec(m);
  if (x) return { type: 'annoncer', hand: [...x[1]].map(Number) };
  return null;
}

export interface FactsPm {
  won: boolean; place: number; opponents: number; level: PmLevel;
  callsRight: number; bluffsPassed: number; pokerAs: number; livesLost: number;
}

export function replayPm(setup: SetupPm, seed: number, moves: unknown): ReplayResult<FactsPm> {
  if (typeof moves !== 'string' || (moves && !/^[MCRA0-5.]+$/.test(moves))) return { ok: false, error: REJEU_ERRORS.format };
  const list = moves ? moves.split('.') : [];
  if (list.length > MAX_MOVES_PM) return { ok: false, error: REJEU_ERRORS.tooLong };
  let s = newGamePm(setup, seed);
  const feats: PmFeats = { [PM_ME]: newPmFeat() };
  let mi = 0;
  for (let guard = 0; s.phase !== 'fini'; guard++) {
    if (guard > 100_000) return { ok: false, error: REJEU_ERRORS.tooLong };
    const mine = s.players[s.current].id === PM_ME;
    let a: PmAction | null;
    if (mine) {
      if (mi >= list.length) return { ok: false, error: REJEU_ERRORS.incomplete };
      a = decodePm(list[mi++]);
      if (!a) return { ok: false, error: REJEU_ERRORS.format };
    } else a = pmBotDecide(s, setup.level);
    const r = act(s, a);
    if ('error' in r) return { ok: false, error: mine ? REJEU_ERRORS.illegal : REJEU_ERRORS.setup };
    trackPmFeats(feats, s, a, r.state, true);
    s = r.state;
  }
  if (mi < list.length) return { ok: false, error: REJEU_ERRORS.extra };
  const f = feats[PM_ME];
  return { ok: true, facts: {
    won: s.winner === PM_ME, place: placeOf(s, PM_ME), opponents: setup.bots.length, level: setup.level,
    callsRight: f.callsRight, bluffsPassed: f.bluffsPassed, pokerAs: f.pokerAs, livesLost: f.livesLost,
  } };
}
