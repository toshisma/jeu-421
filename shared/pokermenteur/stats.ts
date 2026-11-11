/** Statistiques personnelles du Poker menteur, gardées dans le profil (module sans dépendance : lu par le profil). */
export interface PmStats {
  /** Parties et victoires (y compris celles contre l'ordinateur annoncées par le téléphone). */
  games: number; wins: number;
  /*
   * Faits VÉRIFIÉS : seulement les parties jouées par le serveur (en ligne, ordinateurs compris),
   * jamais un résultat annoncé par le téléphone. Seuls ceux-là font avancer les succès « en ligne ».
   */
  vGames: number; vWins: number;
  /** Victoires contre au moins un autre joueur humain. */
  onlineWins: number;
  /** « Menteur ! » criés à raison (décision du joueur lui-même). */
  callsRight: number;
  /** Mensonges qui sont passés : le suivant a cru. */
  bluffsPassed: number;
  /** Vrais Poker d'As révélés sous son gobelet. */
  pokerAs: number;
  /** Victoires sans perdre une seule vie, à 3 joueurs ou plus. */
  flawless: number;
  /** Niveaux d'ordinateur battus (1 Débutant, 2 Habitué, 4 Fine fouine). */
  beaten: number;
  /** Série de victoires vérifiées en cours, et meilleure série. */
  streak: number; bestStreak: number;
}
export const EMPTY_PM_STATS: PmStats = {
  games: 0, wins: 0, vGames: 0, vWins: 0, onlineWins: 0, callsRight: 0, bluffsPassed: 0, pokerAs: 0, flawless: 0, beaten: 0, streak: 0, bestStreak: 0,
};
export function cleanPmStats(v: unknown): PmStats | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const n = (x: unknown, max = 1e9) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(max, Math.floor(x)) : 0);
  const s: PmStats = {
    games: n(r.games), wins: n(r.wins), vGames: n(r.vGames), vWins: n(r.vWins), onlineWins: n(r.onlineWins),
    callsRight: n(r.callsRight), bluffsPassed: n(r.bluffsPassed), pokerAs: n(r.pokerAs), flawless: n(r.flawless), beaten: n(r.beaten, 7) & 7,
    streak: n(r.streak), bestStreak: n(r.bestStreak),
  };
  s.wins = Math.min(s.wins, s.games);
  s.vGames = Math.min(s.vGames, s.games);
  s.vWins = Math.min(s.vWins, s.vGames, s.wins);
  s.onlineWins = Math.min(s.onlineWins, s.vWins);
  s.flawless = Math.min(s.flawless, s.vWins);
  s.streak = Math.min(s.streak, s.vWins);
  s.bestStreak = Math.max(s.streak, Math.min(s.bestStreak, s.vWins));
  return s.games ? s : undefined;
}
