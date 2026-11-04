/**
 * Tournois programmés : deux rendez-vous par jour, à 11h00 et 21h00 (heure de Bruxelles).
 *
 * Déroulé d'un rendez-vous (H = heure annoncée) :
 *  - avant H : inscription payante (10 pièces) à tout moment, désinscription remboursée ;
 *  - de H à H+5 min : le salon est ouvert ; on peut encore s'inscrire et rejoindre le salon ;
 *  - à H+5 min : départ. Un inscrit absent du salon est retiré et remboursé. Moins de 4 joueurs
 *    présents : tournoi annulé, tout le monde est remboursé.
 *
 * Format (4 à 16 joueurs) : jusqu'à 6 joueurs, une seule table (la finale). Au-delà, tables de 3
 * ou 4 joueurs, la meilleure moitié de chaque table se qualifie, jusqu'à une finale de 4 à 6
 * joueurs : le classement complet de la finale donne au moins les 4 premières places.
 *
 * Logique pure (horloge passée en paramètre), partagée par le serveur et l'interface.
 */
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { qualifiersOf, splitTables } from './tournament';

export const SCHED_TZ = 'Europe/Brussels';
export const SCHED_HOURS = [11, 21];
export const SCHED_FEE = 10;
export const SCHED_MIN = 4;
export const SCHED_MAX = 16;
/** Durée du salon avant le départ. */
export const SCHED_LOBBY_MS = 5 * 60_000;
/** Rappel envoyé aux inscrits avant l'ouverture du salon. */
export const SCHED_REMIND_MS = 5 * 60_000;
/** Tables du premier tour, et taille maximale d'une finale. */
export const SCHED_TABLE = 4;
export const SCHED_FINAL_MAX = 6;
/** Règles des parties : la partie classique, 30 s par tour (personne ne bloque la table). */
export const SCHED_CONFIG: GameConfig = { ...DEFAULT_CONFIG, turnSeconds: 30 };

/** Paliers de gains (sacs de dés) selon le nombre de joueurs au départ. */
export const BAG_TIERS: { from: number; to: number; bags: number[] }[] = [
  { from: 4, to: 5, bags: [1] },
  { from: 6, to: 9, bags: [2, 1] },
  { from: 10, to: 15, bags: [3, 2, 1] },
  { from: 16, to: 16, bags: [5, 3, 2, 1] },
];
/** Sacs gagnés par place (index 0 = premier) pour `n` joueurs au départ. */
export function bagPrizes(n: number): number[] {
  const tier = BAG_TIERS.find((t) => n >= t.from && n <= t.to) ?? (n > SCHED_MAX ? BAG_TIERS[BAG_TIERS.length - 1] : null);
  return tier ? tier.bags.slice() : [];
}
/** Prochain palier (pour « encore 2 joueurs pour… »), ou null. */
export function nextTier(n: number): { missing: number; bags: number[] } | null {
  const t = BAG_TIERS.find((x) => x.from > n);
  return t ? { missing: t.from - n, bags: t.bags } : null;
}

/** Répartition d'un tour : une seule table (finale) s'il reste au plus 6 joueurs, sinon tables de 3 ou 4. */
export function schedTables<T>(players: T[]): T[][] {
  return players.length <= SCHED_FINAL_MAX ? [players.slice()] : splitTables(players, SCHED_TABLE);
}
/** Nombre de tours, et taille de la finale, pour `n` joueurs au départ. */
export function schedRounds(n: number): { rounds: number; final: number } {
  let rounds = 1;
  while (n > SCHED_FINAL_MAX) {
    n = schedTables(Array.from({ length: n }, (_, i) => i)).reduce((s, t) => s + qualifiersOf(t.length), 0);
    rounds++;
  }
  return { rounds, final: n };
}

// --- Heure de Bruxelles -----------------------------------------------------------------------

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHED_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function wall(t: number) {
  const p: Record<string, number> = {};
  for (const x of fmt.formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, min: p.minute, s: p.second };
}
/** Décalage de Bruxelles par rapport à UTC à l'instant `t` (ms) : +1 h en hiver, +2 h en été. */
export function brusselsOffset(t: number): number {
  const w = wall(t);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(t / 1000) * 1000;
}
/** Instant (ms UTC) correspondant à une heure murale de Bruxelles. */
export function brusselsTime(y: number, m: number, d: number, h: number, min = 0): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - brusselsOffset(guess);
  const off2 = brusselsOffset(t);
  if (guess - off2 !== t) t = guess - off2;
  return t;
}
/** Date de Bruxelles (AAAA-MM-JJ) à l'instant `t`. */
export function brusselsDay(t: number): string {
  const w = wall(t);
  return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

export interface Slot { id: string; startsAt: number; hour: number }
/** Identifiant stable d'un rendez-vous : « 2026-11-04-21h ». */
export const slotId = (day: string, hour: number) => `${day}-${String(hour).padStart(2, '0')}h`;

/**
 * Les `count` prochains rendez-vous dont le départ (H+5 min) n'est pas encore passé à `now`.
 * Le premier peut donc être un salon déjà ouvert.
 */
export function nextSlots(now: number, count = 2, graceMs = SCHED_LOBBY_MS): Slot[] {
  const w = wall(now);
  const out: Slot[] = [];
  for (let k = -1; out.length < count && k < 10; k++) {
    const base = new Date(Date.UTC(w.y, w.m - 1, w.d + k));
    const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, d = base.getUTCDate();
    const day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    for (const h of SCHED_HOURS) {
      const t = brusselsTime(y, m, d, h);
      if (t + graceMs > now && out.length < count) out.push({ id: slotId(day, h), startsAt: t, hour: h });
    }
  }
  return out;
}

/** « 21h00 » */
export const hourLabel = (hour: number) => `${hour}h00`;
/** Délai lisible : « 2 h 14 », « 14 min », « 45 s ». */
export function formatDelay(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.ceil(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(s / 3600), rest = Math.floor((s % 3600) / 60);
  return `${h} h ${String(rest).padStart(2, '0')}`;
}
/** Compte à rebours « 4:07 ». */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/** Libellé « 2 sacs », « 1 sac ». */
export const bagsLabel = (n: number) => `${n} sac${n > 1 ? 's' : ''}`;

// --- Messages échangés ------------------------------------------------------------------------

export type SlotStatus = 'a-venir' | 'salon' | 'en-cours' | 'termine' | 'annule';
export interface SlotView {
  id: string;
  hour: number;
  startsAt: number;
  /** Départ du tournoi (fin du salon). */
  beginsAt: number;
  status: SlotStatus;
  count: number;
  /** Le joueur (compte) est inscrit. */
  registered: boolean;
  /** Code du salon, pendant les 5 minutes d'ouverture. */
  code: string | null;
}
export interface LastResult {
  slot: string;
  hour: number;
  status: 'annule' | 'joue' | 'rembourse';
  /** Raison de l'annulation ou du remboursement. */
  reason: string | null;
  place: number | null;
  bags: number;
  refunded: number;
  players: number | null;
}
export interface ProgrammeView {
  now: number;
  fee: number;
  min: number;
  max: number;
  lobbyMs: number;
  slots: SlotView[];
  last: LastResult | null;
  /** Tournoi programmé en cours où vous jouez (pour y revenir). */
  playing: { code: string; hour: number; status: SlotStatus } | null;
}
/** Informations ajoutées à l'état d'un tournoi programmé. */
export interface ScheduledInfo {
  slot: string;
  hour: number;
  startsAt: number;
  beginsAt: number;
  /** Heure du serveur à l'envoi (corrige l'horloge du téléphone). */
  serverNow: number;
  registered: number;
  /** Raison de l'annulation, le cas échéant. */
  cancelled: string | null;
  /** Barème actuel (selon les présents) ou définitif (selon les partants). */
  bags: number[];
  /** Nombre de joueurs au départ (null avant le départ). */
  starters: number | null;
}
