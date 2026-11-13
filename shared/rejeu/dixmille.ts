/**
 * Le Courtisan contre l'ordinateur : table, décisions du joueur et rejeu par le serveur.
 * Le moteur (shared/dixmille/engine.ts) tire déjà ses dés depuis la graine, et les ordinateurs
 * (shared/dixmille/ai.ts, `decide` sans tirage fourni) décident à partir de l'état seul : la partie se
 * rejoue donc à l'identique à partir de la graine et des décisions du joueur.
 */
import { act, newGame, placeOf, DM_TARGETS, type DmAction, type DmLevel, type DmState } from '../dixmille/engine';
import { decide } from '../dixmille/ai';
import { newFeat, trackFeats, type DmFeats } from '../dixmille/feats';
import { REJEU_ERRORS, isPersonaId, type ReplayResult } from './common';

export const DM_ME = 'moi';
export const MAX_MOVES_DM = 3000;
const LEVELS: DmLevel[] = ['debutant', 'habitue', 'fouine'];

export interface SetupDm { level: DmLevel; target: number; /** Personnages des ordinateurs (1 à 3), dans l'ordre des sièges. */ bots: string[] }

export function setupDmFrom(raw: unknown): SetupDm | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r) return null;
  const bots = Array.isArray(r.bots) ? r.bots : null;
  if (!bots || bots.length < 1 || bots.length > 3 || !bots.every(isPersonaId) || new Set(bots).size !== bots.length || bots.includes(DM_ME)) return null;
  if (!LEVELS.includes(r.level as DmLevel) || !(DM_TARGETS as readonly number[]).includes(r.target as number)) return null;
  return { level: r.level as DmLevel, target: r.target as number, bots: bots as string[] };
}

export function newGameDm(setup: SetupDm, seed: number, names?: string[]): DmState {
  return newGame([{ id: DM_ME, name: names?.[0] ?? DM_ME }, ...setup.bots.map((id, i) => ({ id, name: names?.[i + 1] ?? id, bot: setup.level }))], setup.target, seed);
}

/** L = lancer ; R<positions> = mettre de côté et relancer ; E<positions> = mettre de côté et encaisser. Séparées par « . ». */
export function encodeDm(a: DmAction): string {
  return a.type === 'lancer' ? 'L' : `${a.type === 'relancer' ? 'R' : 'E'}${a.pick.join('')}`;
}
function decodeDm(m: string): DmAction | null {
  if (m === 'L') return { type: 'lancer' };
  const x = /^([RE])([0-5]{1,6})$/.exec(m);
  if (!x) return null;
  return { type: x[1] === 'R' ? 'relancer' : 'encaisser', pick: [...x[2]].map(Number) };
}

export interface FactsDm {
  won: boolean; place: number; opponents: number; level: DmLevel; target: number;
  bestTurn: number; misses: number; hotMax: number; six: number; straight: number; sixKind: number;
}

export function replayDm(setup: SetupDm, seed: number, moves: unknown): ReplayResult<FactsDm> {
  if (typeof moves !== 'string' || (moves && !/^[LRE0-5.]+$/.test(moves))) return { ok: false, error: REJEU_ERRORS.format };
  const list = moves ? moves.split('.') : [];
  if (list.length > MAX_MOVES_DM) return { ok: false, error: REJEU_ERRORS.tooLong };
  let s = newGameDm(setup, seed);
  const feats: DmFeats = { [DM_ME]: newFeat() };
  let mi = 0;
  for (let guard = 0; s.phase !== 'fini'; guard++) {
    if (guard > 200_000) return { ok: false, error: REJEU_ERRORS.tooLong };
    const mine = s.players[s.current].id === DM_ME;
    let a: DmAction | null;
    if (mine) {
      if (mi >= list.length) return { ok: false, error: REJEU_ERRORS.incomplete };
      a = decodeDm(list[mi++]);
      if (!a) return { ok: false, error: REJEU_ERRORS.format };
    } else a = decide(s, setup.level);
    const r = act(s, a);
    if ('error' in r) {
      if (mine) return { ok: false, error: REJEU_ERRORS.illegal };
      return { ok: false, error: REJEU_ERRORS.setup };
    }
    trackFeats(feats, s, a, r.state, true);
    s = r.state;
  }
  if (mi < list.length) return { ok: false, error: REJEU_ERRORS.extra };
  const me = s.players.find((p) => p.id === DM_ME)!;
  const f = feats[DM_ME];
  return { ok: true, facts: {
    won: s.winner === DM_ME, place: placeOf(s, DM_ME), opponents: setup.bots.length, level: setup.level, target: setup.target,
    bestTurn: me.best, misses: me.misses, hotMax: f.hotMax, six: f.six, straight: f.straight, sixKind: f.sixKind,
  } };
}
