/**
 * « Coups Fourrés » : progression du joueur (partagé client / serveur).
 * Types des réponses de l'API /api/cf/*, divisions de la ligue, points (Elo simplifié),
 * missions du jour, tirage d'un booster (RNG injecté : le serveur fournit un RNG cryptographique).
 * Rien ici n'est autoritaire : le serveur recalcule tout (comptes seulement).
 */
import { BOOSTER, CARDS, CF_RULES, cardDef, deckProblems, type CardRarity } from './catalog';

// --- Ligue -------------------------------------------------------------------------------------
export type CfDivisionId = 'comptoir' | 'bistrot' | 'brasserie' | 'cabaret' | 'grand-cafe';
export interface CfDivision {
  id: CfDivisionId;
  name: string;
  /** Points à partir desquels on y entre. */
  min: number;
  /** Récompenses de fin de saison. */
  boosters: number;
  /** Dos de carte de la saison : simple ou animé. */
  back?: 'simple' | 'anime';
  /** Titre de saison. */
  title?: boolean;
}
export const CF_DIVISIONS: CfDivision[] = [
  { id: 'comptoir', name: 'Comptoir', min: 0, boosters: 1 },
  { id: 'bistrot', name: 'Bistrot', min: 300, boosters: 2 },
  { id: 'brasserie', name: 'Brasserie', min: 700, boosters: 3, back: 'simple' },
  { id: 'cabaret', name: 'Cabaret', min: 1200, boosters: 4, back: 'simple', title: true },
  { id: 'grand-cafe', name: 'Grand Café', min: 1800, boosters: 5, back: 'anime', title: true },
];
/** « Légende du zinc » : les 20 premiers du Grand Café en fin de saison (+1 légendaire au choix). */
export const CF_LEGEND_COUNT = 20;
export const CF_LEGEND_NAME = 'Légende du zinc';
/** Nouvelle saison : chacun redescend de ce nombre de divisions. */
export const CF_SEASON_DROP = 2;
/** Points de référence d'une partie : victoire / défaite entre joueurs de même niveau. */
export const CF_POINTS = { win: 25, loss: 20, scale: 400, minWin: 8, maxWin: 42, minLoss: 8, maxLoss: 32 };

export const cfDivisionIndex = (points: number) => {
  let i = 0;
  for (let k = 0; k < CF_DIVISIONS.length; k++) if (points >= CF_DIVISIONS[k].min) i = k;
  return i;
};
export const cfDivisionOf = (points: number): CfDivision => CF_DIVISIONS[cfDivisionIndex(points)];

/**
 * Points gagnés ou perdus (Elo simplifié) : +25 / −20 à niveau égal ; battre plus fort rapporte
 * plus, perdre contre plus faible coûte plus. Bornés pour rester lisibles.
 */
export function cfLeagueDelta(myPoints: number, oppPoints: number, won: boolean): number {
  const expected = 1 / (1 + 10 ** ((oppPoints - myPoints) / CF_POINTS.scale));
  if (won) return Math.max(CF_POINTS.minWin, Math.min(CF_POINTS.maxWin, Math.round(2 * CF_POINTS.win * (1 - expected))));
  return -Math.max(CF_POINTS.minLoss, Math.min(CF_POINTS.maxLoss, Math.round(2 * CF_POINTS.loss * expected)));
}
/** Plancher de la saison : le début de la plus haute division atteinte (on ne la perd plus). */
export const cfFloor = (best: number) => cfDivisionOf(best).min;
/** Nouveaux points d'un joueur après une partie (plancher compris). */
export function cfApplyDelta(points: number, best: number, delta: number): { points: number; best: number } {
  const p = Math.max(cfFloor(best), points + delta);
  return { points: p, best: Math.max(best, p) };
}
/** Points de départ de la saison suivante : deux divisions plus bas. */
export const cfNextSeasonPoints = (points: number) => CF_DIVISIONS[Math.max(0, cfDivisionIndex(points) - CF_SEASON_DROP)].min;

/** Saison = mois de Bruxelles (AAAA-MM) ; `day` : AAAA-MM-JJ. */
export const cfSeasonOf = (day: string) => day.slice(0, 7);
/** Premier jour de la saison suivante (AAAA-MM-01). */
export function cfSeasonEnd(season: string): string {
  const [y, m] = season.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

// --- Missions du jour ------------------------------------------------------------------------------
export type CfMissionKind = 'partie' | 'victoire' | 'classee' | 'victoire-classee' | 'pieges' | 'dernier-mot' | 'cartes' | 'habitues';
export interface CfMissionDef { id: string; kind: CfMissionKind; text: string; target: number; capsules: number }
export const CF_MISSIONS: CfMissionDef[] = [
  { id: 'gagner-1', kind: 'victoire', text: 'Gagner une partie', target: 1, capsules: 25 },
  { id: 'jouer-2', kind: 'partie', text: 'Jouer 2 parties', target: 2, capsules: 20 },
  { id: 'classee-1', kind: 'classee', text: 'Jouer une partie classée', target: 1, capsules: 25 },
  { id: 'gagner-classee', kind: 'victoire-classee', text: 'Gagner une partie classée', target: 1, capsules: 40 },
  { id: 'pieges-5', kind: 'pieges', text: 'Jouer 5 pièges', target: 5, capsules: 30 },
  { id: 'dernier-mot', kind: 'dernier-mot', text: 'Gagner une manche avec un Dernier mot', target: 1, capsules: 35 },
  { id: 'cartes-15', kind: 'cartes', text: 'Jouer 15 cartes', target: 15, capsules: 20 },
  { id: 'habitues-3', kind: 'habitues', text: 'Mettre 3 Habitués en jeu', target: 3, capsules: 25 },
];
export const CF_MISSIONS_PER_DAY = 3;

/** Les 3 missions du jour (les mêmes pour tout le monde), dont toujours une simple (jouer / gagner). */
export function cfDailyMissions(day: string): CfMissionDef[] {
  let h = 2166136261;
  for (const ch of `cf:${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let s = h >>> 0;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const easy = CF_MISSIONS.filter((m) => m.kind === 'partie' || m.kind === 'victoire');
  const first = easy[Math.floor(next() * easy.length)];
  const rest = CF_MISSIONS.filter((m) => !easy.includes(m));
  const out = [first];
  while (out.length < CF_MISSIONS_PER_DAY && rest.length) out.push(rest.splice(Math.floor(next() * rest.length), 1)[0]);
  return out;
}

// --- Collection, boosters, éclats -------------------------------------------------------------
/** Nombre d'exemplaires utiles en deck (au-delà : recyclage conseillé). */
export const cfMaxUseful = (cardId: string) => (cardDef(cardId)?.rarity === 'legendaire' ? CF_RULES.maxLegendaryCopies : CF_RULES.maxCopies);

export interface CfPulledCard { id: string; shiny: boolean }
/** Rareté tirée selon BOOSTER.odds (u dans [0, 1[). */
export function cfRarityFor(u: number): CardRarity {
  let acc = 0;
  const order: CardRarity[] = ['commune', 'rare', 'epique', 'legendaire'];
  for (const r of order) { acc += BOOSTER.odds[r]; if (u < acc) return r; }
  return 'commune';
}
const BY_RARITY: Record<CardRarity, string[]> = { commune: [], rare: [], epique: [], legendaire: [] };
for (const card of CARDS) BY_RARITY[card.rarity].push(card.id);
/**
 * Tirage d'un booster : 5 cartes au pur hasard, rareté selon BOOSTER.odds puis carte au hasard
 * dans la rareté, brillante à BOOSTER.shinyChance. Aucune garantie. `rng` renvoie un nombre dans [0, 1[.
 */
export function cfRollBooster(rng: () => number): CfPulledCard[] {
  const out: CfPulledCard[] = [];
  for (let i = 0; i < BOOSTER.size; i++) {
    const pool = BY_RARITY[cfRarityFor(rng())];
    const id = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    out.push({ id, shiny: rng() < BOOSTER.shinyChance });
  }
  return out;
}

/** Decks qui deviendraient invalides si la collection passait à `after` (noms des decks). */
export function cfDecksBroken(decks: { name: string; cards: Record<string, number> }[], after: Record<string, number>): string[] {
  return decks.filter((d) => deckProblems(d.cards, after).length > 0 && deckProblems(d.cards).length === 0).map((d) => d.name);
}

// --- Types des réponses de l'API ------------------------------------------------------------------
export interface CfOwnedCard { count: number; shiny: number }
export interface CfDeck { id: string; name: string; cards: Record<string, number>; valid: boolean; problems: string[]; createdAt: number; updatedAt: number }
export interface CfMissionView extends CfMissionDef { progress: number; done: boolean }
export interface CfLeagueMe { season: string; endsOn: string; points: number; best: number; floor: number; division: CfDivisionId; games: number; wins: number; rank: number | null }
export interface CfGameView { opponent: string | null; vsBot: boolean; ranked: boolean; result: 'victoire' | 'defaite' | 'abandon'; points: number; capsules: number; at: number }
export interface CfState {
  discovered: boolean;
  capsules: number;
  shards: number;
  boosters: number;
  /** Légendaires au choix à réclamer (récompense « Légende du zinc »). */
  legendPicks: number;
  collection: Record<string, CfOwnedCard>;
  decks: CfDeck[];
  activeDeck: string | null;
  cosmetics: string[];
  titles: string[];
  missions: CfMissionView[];
  /** Capsules déjà gagnées aujourd'hui contre l'ordinateur (plafond CAPSULES.vsBotDailyMax). */
  botCapsulesToday: number;
  firstWinToday: boolean;
  league: CfLeagueMe;
  history: CfGameView[];
}
export interface CfOpenedCard extends CfPulledCard { rarity: CardRarity; isNew: boolean }
export interface CfLeagueBoard { me: CfLeagueMe; divisions: CfDivision[]; top: { rank: number; username: string; points: number; division: CfDivisionId; games: number; wins: number }[] }
export const CF_MAX_DECKS = 5;
export const CF_DECK_NAME_MAX = 24;
