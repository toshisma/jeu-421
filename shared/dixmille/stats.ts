/** Statistiques personnelles du Courtisan, gardées dans le profil (module sans dépendance : lu par le profil). */
export interface DmStats {
  games: number; wins: number; bestTurn: number; bestPot: number;
  /*
   * Faits VÉRIFIÉS (0.53, succès du Courtisan) : seulement les parties jouées par le serveur (en ligne,
   * ou contre l'ordinateur à une table du serveur), jamais un résultat annoncé par le téléphone.
   */
  /** Parties et victoires vérifiées. */
  vGames: number; vWins: number;
  /** Victoires contre au moins un autre joueur humain. */
  onlineWins: number;
  /** Plus gros tour encaissé, vu par le serveur. */
  vBestTurn: number;
  /** Le plus de mains pleines dans un même tour. */
  hotMax: number;
  /** Lancers dont les 6 dés ont été mis de côté d'un coup ; grandes suites ; six dés identiques. */
  six: number; straight: number; sixKind: number;
  /** Victoires sans aucun « Raté » (partie en 4 000 points ou plus). */
  cleanWins: number;
  /** Niveaux d'ordinateur battus (1 Débutant, 2 Habitué, 4 Fine fouine). */
  beaten: number;
  /** Série de victoires vérifiées en cours, et meilleure série. */
  streak: number; bestStreak: number;
  /** Pots de Groschen emportés. */
  pots: number;
}
export const EMPTY_DM_STATS: DmStats = {
  games: 0, wins: 0, bestTurn: 0, bestPot: 0,
  vGames: 0, vWins: 0, onlineWins: 0, vBestTurn: 0, hotMax: 0, six: 0, straight: 0, sixKind: 0, cleanWins: 0, beaten: 0, streak: 0, bestStreak: 0, pots: 0,
};
/** Plus gros tour plausible (garde-fou : un tour enregistré ne peut pas dépasser ça). */
export const DM_TURN_MAX = 30_000;
export function cleanDmStats(v: unknown): DmStats | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const n = (x: unknown, max = 1e9) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(max, Math.floor(x)) : 0);
  const s: DmStats = {
    games: n(r.games), wins: n(r.wins), bestTurn: n(r.bestTurn, DM_TURN_MAX), bestPot: n(r.bestPot),
    vGames: n(r.vGames), vWins: n(r.vWins), onlineWins: n(r.onlineWins), vBestTurn: n(r.vBestTurn, DM_TURN_MAX), hotMax: n(r.hotMax, 50),
    six: n(r.six), straight: n(r.straight), sixKind: n(r.sixKind), cleanWins: n(r.cleanWins), beaten: n(r.beaten, 7) & 7,
    streak: n(r.streak), bestStreak: n(r.bestStreak), pots: n(r.pots),
  };
  s.wins = Math.min(s.wins, s.games);
  s.vGames = Math.min(s.vGames, s.games);
  s.vWins = Math.min(s.vWins, s.vGames, s.wins);
  s.onlineWins = Math.min(s.onlineWins, s.vWins);
  s.cleanWins = Math.min(s.cleanWins, s.vWins);
  s.streak = Math.min(s.streak, s.vWins);
  s.bestStreak = Math.max(s.streak, Math.min(s.bestStreak, s.vWins));
  return s.games || s.bestPot ? s : undefined;
}
