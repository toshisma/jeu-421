/**
 * Coups Fourrés : statistiques réelles des cartes (tableau de bord d'administration).
 *
 * Pendant une partie, `CfPlayTracker` note qui mène la première manche et les cartes jouées par
 * chaque joueur (d'après l'état AVANT l'action : on retrouve la carte en main par son uid, même
 * pour un piège posé face cachée). À la fin, le serveur enregistre une ligne par joueur humain
 * (deck, cartes jouées, victoire) : voir server/cf-stats.ts.
 *
 * `cfCardReport` agrège ces lignes (logique pure, testée) : présence dans les decks, taux de jeu,
 * taux de victoire quand la carte est jouée / quand elle est dans le deck sans être jouée, écart à
 * la moyenne, et la même chose par famille.
 */
import { CARDS, FAMILY_LABEL, cardDef, type CardFamily, type CardRarity, type CardType } from './catalog';
import type { CfAction, CfEvent, CfState } from './engine';

/** En dessous de ce nombre de parties (avec la carte dans le deck), l'échantillon est trop petit. */
export const CF_STATS_MIN_SAMPLE = 30;
/** Écart de taux de victoire (en points de %) à partir duquel une carte est signalée forte ou faible. */
export const CF_STATS_ALERT = 0.07;

export type CfStatMode = 'classee' | 'ami' | 'table' | 'bot' | 'tournoi';
/** Filtre du tableau de bord : « amis » regroupe les défis entre amis et les tables à code. */
export type CfStatFilter = 'tout' | 'classee' | 'amis' | 'bot' | 'tournoi';
export const CF_STAT_FILTERS: [CfStatFilter, string][] = [['tout', 'Tout'], ['classee', 'Classé'], ['amis', 'Entre amis'], ['bot', 'Ordinateur'], ['tournoi', 'Tournoi']];
export const filterModes = (f: CfStatFilter): CfStatMode[] | null =>
  f === 'classee' ? ['classee'] : f === 'amis' ? ['ami', 'table'] : f === 'bot' ? ['bot'] : f === 'tournoi' ? ['tournoi'] : null;

/** Suit une partie : premier meneur et cartes jouées par joueur. */
export class CfPlayTracker {
  firstLeader: string | null = null;
  readonly plays = new Map<string, Record<string, number>>();
  /** Action acceptée par le moteur ; `before` = état juste avant (non modifié par apply). */
  action(before: CfState, pid: string, a: CfAction) {
    if (a.type !== 'play') return;
    const k = before.players.find((p) => p.id === pid)?.hand.find((x) => x.uid === a.card);
    if (!k) return;
    const m = this.plays.get(pid) ?? {};
    m[k.id] = (m[k.id] ?? 0) + 1;
    this.plays.set(pid, m);
  }
  events(evs: CfEvent[]) {
    if (this.firstLeader) return;
    const t = evs.find((e) => e.kind === 'tirage' && e.player);
    if (t) this.firstLeader = t.player!;
  }
  playsOf(pid: string): Record<string, number> { return this.plays.get(pid) ?? {}; }
}

/** Liste de cartes d'un deck (identifiants répétés) → { id: exemplaires }. */
export const deckCounts = (cards: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const id of cards) out[id] = (out[id] ?? 0) + 1;
  return out;
};

/** Une partie terminée, vue d'un joueur humain. */
export interface CfStatRow {
  gameId: number;
  mode: CfStatMode;
  won: boolean;
  deck: Record<string, number>;
  plays: Record<string, number>;
}
export interface CfStatGame {
  id: number;
  mode: CfStatMode;
  level: string | null;
  players: number;
  rounds: number;
  durationMs: number;
  /** Duel seulement : le meneur de la première manche a gagné (null : inconnu ou partie à 3-4). */
  firstLeaderWon: boolean | null;
}

const rate = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export interface CfCardStat {
  id: string; name: string; family: CardFamily; rarity: CardRarity; type: CardType; cost: number;
  /** Parties (vues d'un joueur) avec la carte dans le deck. */
  decks: number;
  presence: number | null;
  /** Parties où elle a été jouée au moins une fois. */
  played: number;
  playRate: number | null;
  playsPerGame: number | null;
  winPlayed: number | null;
  winUnplayed: number | null;
  winDeck: number | null;
  /** Taux de victoire quand jouée − moyenne de toutes les parties (null si jamais jouée). */
  delta: number | null;
  small: boolean;
  verdict: 'forte' | 'faible' | null;
}
export interface CfFamilyStat {
  family: CardFamily; label: string;
  /** Parties où le deck contient au moins une carte de la famille. */
  decks: number;
  presence: number | null;
  /** Exemplaires moyens dans un deck qui en contient. */
  copies: number | null;
  /** Part des cartes jouées qui viennent de cette famille. */
  playShare: number | null;
  winPresent: number | null;
  /** Taux de victoire quand au moins une carte de la famille a été jouée. */
  winPlayed: number | null;
  delta: number | null;
  small: boolean;
}
export interface CfStatsReport {
  games: number;
  playerGames: number;
  /** Taux de victoire moyen des joueurs humains (référence des écarts). */
  base: number | null;
  avgDurationMs: number | null;
  avgRounds: number | null;
  firstLeader: { games: number; won: number; rate: number | null };
  byMode: Record<CfStatMode, number>;
  byLevel: Record<string, { games: number; wins: number }>;
  minSample: number;
  cards: CfCardStat[];
  families: CfFamilyStat[];
}

/** Agrège les parties : par carte (triées par écart à la moyenne, échantillons trop petits à la fin) et par famille. */
export function cfCardReport(games: CfStatGame[], rows: CfStatRow[]): CfStatsReport {
  const wins = rows.filter((r) => r.won).length;
  const base = rate(wins, rows.length);
  const duels = games.filter((g) => g.firstLeaderWon !== null);
  const byMode = { classee: 0, ami: 0, table: 0, bot: 0, tournoi: 0 } as Record<CfStatMode, number>;
  for (const g of games) byMode[g.mode] = (byMode[g.mode] ?? 0) + 1;
  const byLevel: Record<string, { games: number; wins: number }> = {};
  const gameById = new Map(games.map((g) => [g.id, g]));
  for (const r of rows) {
    const lv = gameById.get(r.gameId)?.level;
    if (!lv) continue;
    const x = (byLevel[lv] ??= { games: 0, wins: 0 });
    x.games++; if (r.won) x.wins++;
  }
  const verdict = (delta: number | null, small: boolean) => (small || delta === null ? null : delta >= CF_STATS_ALERT ? 'forte' : delta <= -CF_STATS_ALERT ? 'faible' : null);

  const cards: CfCardStat[] = CARDS.map((c) => {
    let decks = 0, played = 0, plays = 0, wPlayed = 0, unplayed = 0, wUnplayed = 0, wDeck = 0;
    for (const r of rows) {
      if (!r.deck[c.id]) continue;
      decks++;
      if (r.won) wDeck++;
      const n = r.plays[c.id] ?? 0;
      if (n > 0) { played++; plays += n; if (r.won) wPlayed++; } else { unplayed++; if (r.won) wUnplayed++; }
    }
    const winPlayed = rate(wPlayed, played);
    const delta = winPlayed !== null && base !== null ? winPlayed - base : null;
    const small = decks < CF_STATS_MIN_SAMPLE;
    return {
      id: c.id, name: c.name, family: c.family, rarity: c.rarity, type: c.type, cost: c.cost,
      decks, presence: rate(decks, rows.length), played, playRate: rate(played, decks), playsPerGame: rate(plays, decks),
      winPlayed, winUnplayed: rate(wUnplayed, unplayed), winDeck: rate(wDeck, decks), delta, small, verdict: verdict(delta, small),
    };
  });
  cards.sort((a, b) => Number(a.small) - Number(b.small) || Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || b.decks - a.decks || a.name.localeCompare(b.name, 'fr'));

  let allPlays = 0;
  for (const r of rows) for (const n of Object.values(r.plays)) allPlays += n;
  const families: CfFamilyStat[] = (Object.keys(FAMILY_LABEL) as CardFamily[]).map((f) => {
    let decks = 0, copies = 0, wPresent = 0, famPlays = 0, playedIn = 0, wPlayed = 0;
    for (const r of rows) {
      const n = Object.entries(r.deck).reduce((a, [id, k]) => a + (cardDef(id)?.family === f ? k : 0), 0);
      const p = Object.entries(r.plays).reduce((a, [id, k]) => a + (cardDef(id)?.family === f ? k : 0), 0);
      famPlays += p;
      if (n > 0) { decks++; copies += n; if (r.won) wPresent++; }
      if (p > 0) { playedIn++; if (r.won) wPlayed++; }
    }
    const winPlayed = rate(wPlayed, playedIn);
    return {
      family: f, label: FAMILY_LABEL[f], decks, presence: rate(decks, rows.length), copies: rate(copies, decks), playShare: rate(famPlays, allPlays),
      winPresent: rate(wPresent, decks), winPlayed, delta: winPlayed !== null && base !== null ? winPlayed - base : null, small: decks < CF_STATS_MIN_SAMPLE,
    };
  });

  return {
    games: games.length, playerGames: rows.length, base,
    avgDurationMs: games.length ? games.reduce((a, g) => a + g.durationMs, 0) / games.length : null,
    avgRounds: games.length ? games.reduce((a, g) => a + g.rounds, 0) / games.length : null,
    firstLeader: { games: duels.length, won: duels.filter((g) => g.firstLeaderWon).length, rate: rate(duels.filter((g) => g.firstLeaderWon).length, duels.length) },
    byMode, byLevel, minSample: CF_STATS_MIN_SAMPLE, cards, families,
  };
}
