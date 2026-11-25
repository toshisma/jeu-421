/**
 * « La vie du jeu » : la ligne d'actualité de l'accueil (GET /api/vie, server/vie.ts).
 *
 * Une seule ligne, sur la vitrine 3D, à côté de « N sur le site » : elle fait défiler calmement
 * (≈ 6 s par élément) le mot du patron, les champions de la semaine, la dernière mise à jour… mêlés
 * au fil des parties récentes. Rien à montrer : elle ne prend aucune place.
 *
 * UN ÉLÉMENT (VieItem) :
 *  - `id`     : identifiant stable (« patron », « champions », « maj », « theme »…) ;
 *  - `icon`   : un emoji ;
 *  - le texte : soit `key` (clé de traduction, zone shared/i18n/zones/vie.*.ts) + `params`,
 *               soit `text` (texte brut, affiché tel quel à tout le monde : le mot du patron) ;
 *               une valeur de `params` peut être une chaîne, un nombre, ou un texte par langue
 *               `{ fr, en?, de?, nl? }` (repli sur le français) : voir `vieParam` ;
 *  - `action` : ce que fait un toucher : 'news' (Nouveautés), 'campaigns' (écran Campagnes),
 *               'ranking' (Campagnes, sur le classement solo), 'shop' (Boutique), 'fetes' (fiche des fêtes),
 *               'none' (petite fiche avec le texte en entier).
 *
 * AJOUTER UNE SOURCE (autres chantiers : thème de la semaine, fêtes / calendrier, arrivage du mois…) :
 * une fonction `(day, now) => VieItem | null` (day = jour de Bruxelles « AAAA-MM-JJ », now = ms),
 * puis UNE ligne dans server/app.ts : `vie.addSource(maSource)` (ou dans `VIE_SOURCES` de server/vie.ts).
 * La source est appelée au plus toutes les quelques secondes (cache) ; une erreur l'écarte sans rien casser.
 * Ses textes vont dans la zone vie (4 langues) ou dans sa propre zone, la clé étant une MessageKey.
 */
import type { Lang, MessageKey } from './i18n';
import { CHANGELOG, type ChangelogEntry } from './changelog';
import { today } from './progress/quests';

export type VieAction = 'news' | 'campaigns' | 'ranking' | 'shop' | 'fetes' | 'none';
/** Texte par langue (le français est obligatoire : repli). */
export type VieLocalized = { fr: string } & Partial<Record<Exclude<Lang, 'fr'>, string>>;
export type VieParam = string | number | VieLocalized;

export interface VieItem {
  id: string;
  icon: string;
  key?: MessageKey;
  params?: Record<string, VieParam>;
  /** Texte brut (sans traduction) : prioritaire sur `key`. */
  text?: string;
  action: VieAction;
}
/** Source d'éléments supplémentaires (voir l'en-tête). */
export type VieSource = (day: string, now: number) => VieItem | null;
export interface VieResponse { ok: true; items: VieItem[]; at: number }

/** Nombre maximal d'éléments renvoyés (la ligne reste calme). */
export const VIE_MAX_ITEMS = 6;
/** Mot du patron : longueur maximale, durée par défaut et maximale (jours). */
export const PATRON_MAX = 140;
export const PATRON_DAYS = 7;
export const PATRON_MAX_DAYS = 60;
/** « Mis à jour il y a N jours » : montré seulement si la dernière version a au plus ce nombre de jours (sinon il dirait l'inverse). */
export const MAJ_MAX_DAYS = 21;

export const vieParam = (v: VieParam, lang: Lang): string | number => (typeof v === 'object' ? v[lang] ?? v.fr : v);

/** Nettoie le mot du patron : une ligne, sans caractères de contrôle, 140 caractères au plus. */
export function cleanPatron(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PATRON_MAX).trim();
}

const dayNum = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86400_000);

/** Jours (de Bruxelles) écoulés entre la publication d'une version et `day`. */
export function daysSince(entry: Pick<ChangelogEntry, 'date'>, day: string): number {
  return Math.max(0, dayNum(day) - dayNum(today(new Date(entry.date))));
}

/** « Mis à jour il y a N jours : <titre> » (titre traduit par le client via la version). */
export function updateItem(day: string, log: readonly ChangelogEntry[] = CHANGELOG, titles?: Partial<Record<Lang, Record<string, { title: string }>>>): VieItem | null {
  const e = log[0];
  if (!e) return null;
  const n = daysSince(e, day);
  if (n > MAJ_MAX_DAYS) return null;
  const title: VieLocalized = { fr: e.title };
  for (const l of ['en', 'de', 'nl'] as const) { const t = titles?.[l]?.[e.version]?.title; if (t) title[l] = t; }
  return { id: 'maj', icon: '🆕', key: n === 0 ? 'vie.maj0' : n === 1 ? 'vie.maj1' : 'vie.majN', params: { n, title, version: e.version }, action: 'news' };
}

export interface VieChampions {
  /** 1er du classement solo de la semaine passée. */
  solo?: string | null;
  /** Champion d'un bistrot (le plus de points) la semaine passée. */
  bistrot?: string | null;
  /** Vainqueur des tournois programmés de la semaine passée (le plus de victoires) et son nombre de victoires. */
  tournoi?: { name: string; wins: number } | null;
}

/** « Champions de la semaine : Julie (solo), Marc (bistrot), Paul (tournoi) », dans les 4 langues. */
export function championsItem(c: VieChampions, label: (lang: Lang, what: 'solo' | 'bistrot' | 'tournoi') => string): VieItem | null {
  const parts: [string, 'solo' | 'bistrot' | 'tournoi'][] = [];
  if (c.solo) parts.push([c.solo, 'solo']);
  if (c.bistrot) parts.push([c.bistrot, 'bistrot']);
  if (c.tournoi) parts.push([c.tournoi.name, 'tournoi']);
  if (!parts.length) return null;
  const list = (lang: Lang) => parts.map(([n, w]) => `${n} (${label(lang, w)})`).join(', ');
  return { id: 'champions', icon: '🏆', key: 'vie.champions', params: { list: { fr: list('fr'), en: list('en'), de: list('de'), nl: list('nl') } }, action: 'ranking' };
}
