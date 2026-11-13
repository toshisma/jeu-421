/**
 * Traductions du jeu : français (par défaut), anglais, allemand, néerlandais.
 *
 * COMMENT AJOUTER UNE CHAÎNE (pour le 421, Coups Fourrés, le reste du site) :
 *  1. ajouter `'zone.nom': 'Texte français',` dans shared/i18n/fr.ts (les clés viennent de ce fichier ;
 *     garder le français exact d'origine) ; le préfixe de la clé dit la zone (`dm.` Courtisan, `nav.`…) ;
 *  2. ajouter la même clé dans en.ts, de.ts, nl.ts (une clé absente s'affiche en français : repli sûr) ;
 *  3. dans un écran React : `tr('zone.nom')`, avec `import { tr } from '<...>/i18n/lang'` (client/src/i18n/lang.ts).
 *     Valeurs : `tr('dm.opp', { n: 2, s: 's' })`, avec `{n}` et `{s}` dans les textes.
 *     Pluriel : `{s}` vaut « s » ou rien ; une langue où cela ne colle pas l'omet ou l'écrit autrement.
 *     Nombres : `fmtNum(n)` (client). Le composant racine doit lire `useLang()` pour se réafficher au changement.
 *  4. depuis shared/ ou le serveur (message envoyé à un joueur dont on connaît la langue) :
 *     `translate('fr' | 'en' | 'de' | 'nl', 'zone.nom', vars)` de ce module, sans React.
 *  5. message du serveur en français destiné à une table mixte : `translateServerText(lang, texte)`
 *     (shared/i18n/server-texts.ts) le traduit côté navigateur ; ajouter sa règle dans ce fichier
 *     (tests/i18n.test.ts vérifie la couverture de server/dixmille-online.ts).
 *
 * LA LANGUE (voir resolveLang) : choix enregistré du joueur > `?lang=` > navigateur (seulement si AUTO_LANG)
 * > français. Jamais de redirection : l'accueil `/` reste en français pour Googlebot.
 */
import { fr, type MessageKey } from './fr';
import { en } from './en';
import { de } from './de';
import { nl } from './nl';

export type { MessageKey };
export type Lang = 'fr' | 'en' | 'de' | 'nl';
export const LANGS: readonly Lang[] = ['fr', 'en', 'de', 'nl'];
/** Noms affichés dans le sélecteur (chaque langue dans sa langue). */
export const LANG_NAMES: Record<Lang, string> = { fr: 'Français', en: 'English', de: 'Deutsch', nl: 'Nederlands' };
/** Locale pour les nombres, dates et pages. */
export const LANG_LOCALE: Record<Lang, string> = { fr: 'fr-BE', en: 'en-US', de: 'de-DE', nl: 'nl-NL' };

/**
 * Détection automatique selon le navigateur : DÉSACTIVÉE (13/11/2026). Googlebot visite avec un navigateur
 * en anglais : avec la détection, il voyait l'accueil en anglais et le site a disparu de « 421 en ligne ».
 * Le jeu est donc en français tant que le joueur n'a rien choisi (Réglages, `?lang=`) ; un anglophone,
 * germanophone ou néerlandophone se voit seulement PROPOSER sa langue (suggestedLang + bandeau LangHint).
 * Ne pas repasser à true.
 */
export const AUTO_LANG = false;

/** Langue à proposer (sans l'imposer) d'après le navigateur : en, de ou nl ; null pour le français et le reste. */
export function suggestedLang(browser: string | null | undefined): Lang | null {
  const m = /^(en|de|nl)(?:[-_]|$)/i.exec(browser ?? '');
  return m ? (m[1].toLowerCase() as Lang) : null;
}

/** Robots d'indexation : jamais de bandeau ni de langue autre que le français pour eux. */
export const isCrawler = (ua: string | null | undefined) =>
  /bot|crawl|spider|slurp|google|bing|yandex|baidu|duckduck|facebookexternalhit|embedly|preview|lighthouse/i.test(ua ?? '');

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

export const DICTS: Record<Lang, Partial<Record<MessageKey, string>>> = { fr, en, de, nl };

/** Choix de la langue, sans effet de bord. `auto` : détection du navigateur (par défaut AUTO_LANG). */
export function resolveLang(o: { saved?: unknown; param?: unknown; browser?: string | null; auto?: boolean }): Lang {
  if (isLang(o.saved)) return o.saved;
  if (isLang(o.param)) return o.param;
  if (o.auto ?? AUTO_LANG) {
    const s = suggestedLang(o.browser);
    if (s) return s;
  }
  return 'fr';
}

/** Texte d'une clé dans une langue (repli sur le français), `{x}` remplacés. Utilisable partout (React, shared, serveur). */
export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = DICTS[lang][key] ?? fr[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Nombre formaté (« 2 000 », « 2,000 », « 2.000 »). */
export const numberIn = (lang: Lang, n: number) => n.toLocaleString(LANG_LOCALE[lang]);
