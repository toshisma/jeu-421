/**
 * Tournois et tables publiques : réglages, répartition en tables, qualifications, gains.
 * Logique pure, partagée par le serveur (autorité) et l'interface (aperçus).
 *
 * Déroulement d'un tournoi : les inscrits sont répartis en tables équilibrées ; à chaque table
 * on joue une partie de 421 ; la meilleure moitié de chaque table (arrondie au-dessus) passe au
 * tour suivant. Quand il reste assez peu de joueurs pour une seule table, c'est la finale.
 */
import type { RepInfo } from './progress/repu';
import { DEFAULT_CONFIG, sanitizeConfig, type GameConfig } from './config';
import { MAX_PLAYERS } from './protocol';
import type { ScheduledInfo } from './scheduled';

export type Visibility = 'public' | 'private';
export type Payout = 'winner' | 'podium';

/** Mises possibles (pièces du jeu). 0 = partie sans mise. */
export const STAKES = [0, 10, 25, 50, 100, 250, 500, 1000];
export const TOURNAMENT_SIZES = [4, 6, 8, 12, 16, 24, 32];
export const TABLE_SIZES = [3, 4, 5, 6];
export const MIN_TOURNAMENT_PLAYERS = 4;
/** Répartition « podium » de la cagnotte. */
export const PODIUM_SHARES = [0.6, 0.3, 0.1];

/** Réglages d'une table (salon) en plus des règles du jeu. */
export interface TableSettings {
  visibility: Visibility;
  maxPlayers: number; // 2 à 6
  stake: number; // mise par joueur, 0 = sans mise
}
export const DEFAULT_TABLE: TableSettings = { visibility: 'private', maxPlayers: MAX_PLAYERS, stake: 0 };

export interface TournamentSettings {
  title: string;
  visibility: Visibility;
  maxPlayers: number; // nombre d'inscrits maximum
  tableSize: number; // joueurs par table
  stake: number; // droit d'entrée
  payout: Payout;
  config: GameConfig;
}
export const DEFAULT_TOURNAMENT: TournamentSettings = {
  title: '', visibility: 'public', maxPlayers: 8, tableSize: 4, stake: 0, payout: 'podium', config: DEFAULT_CONFIG,
};

const pick = <T>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const cleanTitle = (v: unknown, d: string) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 32) : '') || d;

export function sanitizeTable(raw: unknown): TableSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const max = Number(r.maxPlayers);
  return {
    visibility: pick(r.visibility, ['public', 'private'] as const, DEFAULT_TABLE.visibility),
    maxPlayers: Number.isInteger(max) && max >= 2 && max <= MAX_PLAYERS ? max : DEFAULT_TABLE.maxPlayers,
    stake: pick(Number(r.stake), STAKES, 0),
  };
}

export function sanitizeTournament(raw: unknown, defaultTitle = 'Tournoi'): TournamentSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_TOURNAMENT;
  const maxPlayers = pick(Number(r.maxPlayers), TOURNAMENT_SIZES, d.maxPlayers);
  return {
    title: cleanTitle(r.title, defaultTitle),
    visibility: pick(r.visibility, ['public', 'private'] as const, d.visibility),
    maxPlayers,
    tableSize: pick(Number(r.tableSize), TABLE_SIZES, d.tableSize),
    stake: pick(Number(r.stake), STAKES, 0),
    payout: pick(r.payout, ['winner', 'podium'] as const, d.payout),
    config: sanitizeConfig(r.config ?? DEFAULT_CONFIG),
  };
}

/** Répartit les joueurs en tables équilibrées d'au plus `tableSize` joueurs (ordre conservé en serpentin). */
export function splitTables<T>(players: T[], tableSize: number): T[][] {
  const n = players.length;
  if (n <= tableSize) return [players.slice()];
  const k = Math.ceil(n / tableSize);
  const tables: T[][] = Array.from({ length: k }, () => []);
  // Serpentin : 0,1,2,2,1,0,0,1… pour mélanger les têtes de série.
  players.forEach((p, i) => {
    const lap = Math.floor(i / k), pos = i % k;
    tables[lap % 2 === 0 ? pos : k - 1 - pos].push(p);
  });
  return tables;
}

/** Nombre de qualifiés d'une table (la meilleure moitié, arrondie au-dessus). */
export const qualifiersOf = (tableSize: number) => Math.ceil(tableSize / 2);

/** Nombre de tours prévus pour `n` inscrits. */
export function roundsFor(n: number, tableSize: number): number {
  let rounds = 1;
  while (n > tableSize) {
    n = splitTables(Array.from({ length: n }, (_, i) => i), tableSize).reduce((s, t) => s + qualifiersOf(t.length), 0);
    rounds++;
  }
  return rounds;
}

/** Gains par place (index 0 = premier) pour une cagnotte donnée. Le reste des arrondis va au premier. */
export function prizes(pot: number, players: number, payout: Payout): number[] {
  if (pot <= 0) return [];
  if (payout === 'winner' || players < 3) return [pot];
  const shares = PODIUM_SHARES.map((s) => Math.floor(pot * s));
  shares[0] += pot - shares.reduce((a, b) => a + b, 0);
  return shares;
}

/** Partage d'une cagnotte de table entre ex æquo (premier servi pour les restes). */
export function splitPot(pot: number, winners: number): number[] {
  if (winners <= 0) return [];
  const base = Math.floor(pot / winners);
  return Array.from({ length: winners }, (_, i) => base + (i < pot - base * winners ? 1 : 0));
}

// --- Messages échangés ------------------------------------------------------------------------

export interface PublicTournamentPlayer {
  id: string;
  name: string;
  avatar: string;
  connected: boolean;
  left: boolean;
  /** Tour (0 = premier) où le joueur a été éliminé ; null s'il est encore en lice. */
  out: number | null;
  account?: string;
  photo?: string | null;
  /** Titre et accessoire d'avatar choisis par le joueur (comptes). */
  title?: string;
  accessory?: string;
  /** Niveau de prestige (0 si aucun). */
  prestige?: number;
  /** Réputation de la Tournée des comptoirs (profil serveur, comptes avec au moins une étoile). */
  rep?: RepInfo;
  bot?: boolean;
}
export interface PublicTable {
  code: string;
  ids: string[];
  /** Classement de la table une fois la partie finie (du premier au dernier). */
  ranking: string[] | null;
  qualified: number;
}
export interface PublicTournament {
  code: string;
  hostId: string;
  status: 'inscriptions' | 'en-cours' | 'termine';
  settings: TournamentSettings;
  players: PublicTournamentPlayer[];
  rounds: { tables: PublicTable[] }[];
  pot: number;
  prizes: number[];
  /** Classement final (du premier au dernier) une fois le tournoi terminé. */
  standings: string[] | null;
  /** Début du tour suivant (ms), pendant la pause entre deux tours. */
  nextRoundAt: number | null;
  /** Tournoi programmé (11h / 21h) : rendez-vous, compte à rebours et barème en sacs. */
  sched?: ScheduledInfo;
}

/** Entrées des listes publiques. */
export interface LobbyEntry { code: string; title: string; host: string; players: number; max: number; stake: number; variant: GameConfig['variant']; turnSeconds: number }
export interface TournamentEntry { code: string; title: string; host: string; players: number; max: number; stake: number; tableSize: number; payout: Payout }

/** Nom d'un tour pour l'affichage. */
export function roundName(index: number, total: number): string {
  if (index === total - 1) return 'Finale';
  if (index === total - 2) return 'Demi-finales';
  return `Tour ${index + 1}`;
}

/** Table actuelle d'un joueur (dernier tour où il figure), pour rejoindre sa partie. */
export function currentTableOf(t: PublicTournament, playerId: string): PublicTable | null {
  for (let r = t.rounds.length - 1; r >= 0; r--) {
    const tb = t.rounds[r].tables.find((x) => x.ids.includes(playerId));
    if (tb) return r === t.rounds.length - 1 ? tb : null;
  }
  return null;
}

/** Libellé court d'une mise. */
export const stakeLabel = (stake: number) => (stake > 0 ? `${stake} pièces` : 'Sans mise');
