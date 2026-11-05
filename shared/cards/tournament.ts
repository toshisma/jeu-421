/**
 * Coups Fourrés : tournoi du samedi (logique pure, partagée par le serveur et l'interface).
 *
 * Chaque samedi à 20 h 30 (heure de Bruxelles) : le salon ouvre pour 10 minutes, puis départ à
 * 20 h 40. (Le tournoi du 421 classique est à 21 h 00, salon de 21 h 00 à 21 h 05 : le salon de
 * Coups Fourrés est fermé avant.) Élimination directe en duels, mêmes règles que le classé.
 *
 *  - Inscription gratuite pendant la semaine ou pendant les 10 minutes du salon (comptes ayant
 *    découvert le mode, avec un deck actif valide). Désinscription libre jusqu'au départ.
 *  - Au départ, seuls les inscrits présents dans le salon jouent (4 à 32). Moins de 4 : annulé.
 *  - Tableau tiré au hasard ; s'il n'y a pas une puissance de 2 de joueurs, certains passent le
 *    premier tour sans jouer (au plus un par match du premier tour, donc jamais deux de suite).
 *  - Un match commence dès que ses deux joueurs sont connus, après une courte pause.
 *    Absent au départ d'un match = forfait ; abandon ou déconnexion longue = défaite ;
 *    deux absents = personne ne passe (l'adversaire suivant passe sans jouer).
 *  - Récompenses en boosters, modestes, selon le nombre de joueurs au départ (cfTourPrizes).
 */
import { brusselsDay, brusselsTime } from '../scheduled';

export const CF_TOUR_WEEKDAY = 6; // samedi
export const CF_TOUR_HOUR = 20;
export const CF_TOUR_MINUTE = 30;
/** Durée du salon avant le départ. */
export const CF_TOUR_LOBBY_MS = 10 * 60_000;
/** Rappel aux inscrits : 10 minutes avant l'ouverture du salon. */
export const CF_TOUR_REMIND_MS = 10 * 60_000;
/** Annonce Discord : 1 heure avant l'ouverture du salon. */
export const CF_TOUR_ANNOUNCE_MS = 60 * 60_000;
/** Pause entre deux matchs d'un même joueur. */
export const CF_TOUR_PAUSE_MS = 45_000;
export const CF_TOUR_MIN = 4;
export const CF_TOUR_MAX = 32;
/** Un tournoi fini reste affiché (résultats, tableau) pendant ce temps avant de passer au suivant. */
export const CF_TOUR_SHOW_MS = 12 * 3600_000;

/** Boosters par étape (vainqueur, finaliste, demi-finalistes) selon le nombre de joueurs au départ. */
export const CF_TOUR_PRIZE_TIERS: { from: number; to: number; boosters: number[] }[] = [
  { from: 4, to: 7, boosters: [2, 1] },
  { from: 8, to: 15, boosters: [3, 2, 1] },
  { from: 16, to: CF_TOUR_MAX, boosters: [4, 2, 1] },
];
export function cfTourPrizes(n: number): number[] {
  return (CF_TOUR_PRIZE_TIERS.find((t) => n >= t.from && n <= t.to)?.boosters ?? []).slice();
}
/** Boosters pour une place (1 = vainqueur, 2 = finaliste, 3 = demi-finaliste). */
export const cfTourBoostersFor = (place: number | null, n: number) => (place === 1 ? cfTourPrizes(n)[0] ?? 0 : place === 2 ? cfTourPrizes(n)[1] ?? 0 : place === 3 ? cfTourPrizes(n)[2] ?? 0 : 0);

// --- Calendrier -----------------------------------------------------------------------------------
export interface CfTourSlot { id: string; startsAt: number; beginsAt: number }
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
/** Identifiant stable d'un tournoi : « cf-2026-11-07 ». */
export const cfTourId = (day: string) => `cf-${day}`;
/** Prochain tournoi dont le départ (fin du salon) n'est pas encore passé à `now` (le salon peut être ouvert). */
export function cfNextTour(now: number): CfTourSlot {
  for (let k = 0; k < 9; k++) {
    const day = brusselsDay(now + k * 86_400_000);
    if (weekday(day) !== CF_TOUR_WEEKDAY) continue;
    const [y, m, d] = day.split('-').map(Number);
    const startsAt = brusselsTime(y, m, d, CF_TOUR_HOUR, CF_TOUR_MINUTE);
    if (startsAt + CF_TOUR_LOBBY_MS > now) return { id: cfTourId(day), startsAt, beginsAt: startsAt + CF_TOUR_LOBBY_MS };
  }
  throw new Error('Aucun samedi trouvé');
}
/** Date lisible d'un tournoi : « samedi 7 novembre ». */
export const cfTourDate = (startsAt: number) => new Date(startsAt).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Brussels' });

// --- Tableau --------------------------------------------------------------------------------------
export type CfMatchStatus = 'attente' | 'pret' | 'en-cours' | 'fini';
export type CfMatchReason = 'bye' | 'victoire' | 'forfait' | 'abandon' | 'double-forfait' | null;
export interface CfMatch {
  a: string | null;
  b: string | null;
  winner: string | null;
  status: CfMatchStatus;
  reason: CfMatchReason;
  /** Code de la partie en cours (pour la regarder). */
  game: string | null;
  /** Le match peut commencer à partir de cet instant (pause). */
  readyAt: number | null;
  endedAt: number | null;
}
export interface CfBracket { size: number; startedAt: number; rounds: CfMatch[][] }

const blank = (): CfMatch => ({ a: null, b: null, winner: null, status: 'attente', reason: null, game: null, readyAt: null, endedAt: null });
function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Tirage au hasard du tableau (2 joueurs au moins). Les joueurs sans adversaire passent le premier tour. */
export function cfDrawBracket(players: string[], rng: () => number, now: number): CfBracket {
  if (players.length < 2) throw new Error('Il faut au moins 2 joueurs');
  let size = 2;
  while (size < players.length) size *= 2;
  const ps = shuffle(players, rng);
  const byes = size - ps.length;
  const pairs: [string, string | null][] = [];
  let k = 0;
  for (let i = 0; i < size / 2; i++) pairs.push(i < byes ? [ps[k++], null] : [ps[k++], ps[k++]]);
  const first = shuffle(pairs, rng).map(([a, b]) => ({ ...blank(), a, b }));
  const rounds: CfMatch[][] = [first];
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, blank));
  const br: CfBracket = { size, startedAt: now, rounds };
  cfAdvance(br, now, 0);
  return br;
}

/**
 * Fait avancer le tableau : passages sans adversaire, joueurs qualifiés placés au tour suivant,
 * matchs prêts (avec `pauseMs` après la fin du plus récent des deux matchs précédents).
 */
export function cfAdvance(b: CfBracket, now: number, pauseMs: number) {
  for (let r = 0; r < b.rounds.length; r++) {
    b.rounds[r].forEach((m, i) => {
      if (m.status !== 'attente') return;
      if (r === 0) {
        if (m.b === null) Object.assign(m, { winner: m.a, status: 'fini', reason: 'bye', endedAt: b.startedAt });
        else Object.assign(m, { status: 'pret', readyAt: b.startedAt });
        return;
      }
      const f1 = b.rounds[r - 1][2 * i], f2 = b.rounds[r - 1][2 * i + 1];
      if (f1.status !== 'fini' || f2.status !== 'fini') return;
      m.a = f1.winner; m.b = f2.winner;
      const last = Math.max(f1.endedAt ?? b.startedAt, f2.endedAt ?? b.startedAt);
      if (m.a && m.b) {
        const played = (f: CfMatch) => f.reason !== 'bye' && f.reason !== 'double-forfait' && f.reason !== null;
        Object.assign(m, { status: 'pret', readyAt: played(f1) || played(f2) ? last + pauseMs : last });
      } else if (m.a || m.b) Object.assign(m, { winner: m.a ?? m.b, status: 'fini', reason: 'bye', endedAt: last });
      else Object.assign(m, { winner: null, status: 'fini', reason: 'double-forfait', endedAt: last });
    });
  }
}

/** Matchs prêts à commencer à `now`. */
export function cfReadyMatches(b: CfBracket, now: number): { round: number; index: number; match: CfMatch }[] {
  const out: { round: number; index: number; match: CfMatch }[] = [];
  b.rounds.forEach((ms, round) => ms.forEach((match, index) => { if (match.status === 'pret' && (match.readyAt ?? 0) <= now) out.push({ round, index, match }); }));
  return out;
}

/** Résultat d'un match (winner null : double forfait). */
export function cfReport(b: CfBracket, round: number, index: number, winner: string | null, reason: CfMatchReason, now: number) {
  const m = b.rounds[round]?.[index];
  if (!m || m.status === 'fini') return;
  Object.assign(m, { winner, reason, status: 'fini', endedAt: now });
}

export const cfFinal = (b: CfBracket) => b.rounds[b.rounds.length - 1][0];
export const cfBracketDone = (b: CfBracket) => cfFinal(b).status === 'fini';
/** Où se trouve ce joueur dans le tableau (match en cours ou à venir, sinon le dernier joué). */
export function cfFindMatch(b: CfBracket, userId: string): { round: number; index: number; match: CfMatch } | null {
  let found: { round: number; index: number; match: CfMatch } | null = null;
  b.rounds.forEach((ms, round) => ms.forEach((match, index) => { if (match.a === userId || match.b === userId) found = { round, index, match }; }));
  return found;
}

/**
 * Places finales : 1 vainqueur, 2 finaliste, 3 demi-finalistes, 5 quarts, 9, 17…
 * Un joueur éliminé au tour r (0 = premier tour) sur R tours prend la place 2^(R-1-r) + 1.
 */
export function cfPlaces(b: CfBracket): Map<string, number> {
  const R = b.rounds.length;
  const out = new Map<string, number>();
  b.rounds.forEach((ms, r) => ms.forEach((m) => {
    if (m.status !== 'fini') return;
    for (const p of [m.a, m.b]) if (p && p !== m.winner) out.set(p, 2 ** (R - 1 - r) + 1);
  }));
  const f = cfFinal(b);
  if (f.status === 'fini' && f.winner) out.set(f.winner, 1);
  return out;
}

/** Nom d'un tour d'après le nombre de tours restants. */
export function cfRoundName(round: number, total: number): string {
  const left = total - round;
  return left === 1 ? 'Finale' : left === 2 ? 'Demi-finales' : left === 3 ? 'Quarts de finale' : left === 4 ? 'Huitièmes de finale' : left === 5 ? 'Seizièmes de finale' : `Tour ${round + 1}`;
}

// --- Messages échangés ----------------------------------------------------------------------------
export type CfTourStatus = 'a-venir' | 'salon' | 'en-cours' | 'termine' | 'annule';
export interface CfTourPlayer { name: string; photo?: string }
export interface CfTourMatchView {
  a: CfTourPlayer | null;
  b: CfTourPlayer | null;
  /** 'a' ou 'b' : le gagnant. */
  winner: 'a' | 'b' | null;
  status: CfMatchStatus;
  reason: CfMatchReason;
  /** Code de la partie, à regarder (match en cours). */
  game: string | null;
  readyAt: number | null;
  /** Je joue ce match. */
  mine: boolean;
}
export interface CfTourView {
  id: string;
  startsAt: number;
  beginsAt: number;
  /** Heure du serveur à l'envoi (corrige l'horloge du téléphone). */
  serverNow: number;
  status: CfTourStatus;
  /** Inscrits (avant le départ) ou joueurs au départ. */
  count: number;
  min: number;
  max: number;
  lobbyMs: number;
  registered: boolean;
  /** Présent dans le salon (pendant les 10 minutes d'ouverture). */
  here: boolean;
  /** Joueurs présents dans le salon. */
  present: number;
  /** Pourquoi on ne peut pas s'inscrire (pas de compte, mode pas découvert, pas de deck…), ou null. */
  cannot: string | null;
  /** Barème actuel (selon les inscrits) ou définitif (selon les joueurs au départ). */
  prizes: number[];
  starters: number | null;
  reason: string | null;
  rounds: { name: string; matches: CfTourMatchView[] }[] | null;
  /** Mon parcours : statut, place et boosters gagnés. */
  me: { state: 'inscrit' | 'en-lice' | 'elimine' | 'vainqueur' | 'absent'; place: number | null; boosters: number; match: CfTourMatchView | null } | null;
  champion: CfTourPlayer | null;
  /** Prochain tournoi (quand celui-ci est fini ou annulé). */
  next: { id: string; startsAt: number } | null;
}
