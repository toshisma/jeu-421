/** Statistiques personnelles du Courtisan, gardées dans le profil (module sans dépendance : lu par le profil). */
export interface DmStats { games: number; wins: number; bestTurn: number; bestPot: number }
export const EMPTY_DM_STATS: DmStats = { games: 0, wins: 0, bestTurn: 0, bestPot: 0 };
/** Plus gros tour plausible (garde-fou : un tour enregistré ne peut pas dépasser ça). */
export const DM_TURN_MAX = 30_000;
export function cleanDmStats(v: unknown): DmStats | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const n = (x: unknown, max = 1e9) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(max, Math.floor(x)) : 0);
  const s = { games: n(r.games), wins: n(r.wins), bestTurn: n(r.bestTurn, DM_TURN_MAX), bestPot: n(r.bestPot) };
  s.wins = Math.min(s.wins, s.games);
  return s.games || s.bestPot ? s : undefined;
}

