/**
 * Langue du jeu côté navigateur (React) : au-dessus de shared/i18n (mode d'emploi en tête de shared/i18n/index.ts).
 * Choix enregistré du joueur (Réglages, sélecteur du Courtisan) > `?lang=` > navigateur (si AUTO_LANG) > français.
 */
import { useSyncExternalStore } from 'react';
import { LANG_LOCALE, isCrawler, isLang, numberIn, resolveLang, suggestedLang, translate, type Lang, type MessageKey } from '../../../shared/i18n';
import { translateServerText } from '../../../shared/i18n/server-texts';
import { applyDataLang } from './data';

export type { Lang };
const KEY = '421.lang';

export const langParam = (search: string): Lang | null => { const v = new URLSearchParams(search).get('lang'); return isLang(v) ? v : null; };

const hasWindow = typeof window !== 'undefined';
function readSaved(): Lang | null { try { const v = localStorage.getItem(KEY); return isLang(v) ? v : null; } catch { return null; } }
const param = hasWindow ? langParam(location.search) : null;

let current: Lang = resolveLang({ saved: hasWindow ? readSaved() : null, param, browser: hasWindow ? navigator.language : '' });
const listeners = new Set<() => void>();
applyDataLang(current);
if (hasWindow) document.documentElement.lang = current;

/** Langue à proposer au joueur (bandeau), seulement s'il n'a encore rien choisi et n'a pas refusé. */
const HINT_KEY = '421.langHint';
export function langSuggestion(): Lang | null {
  if (!hasWindow || readSaved() || param || isCrawler(navigator.userAgent)) return null;
  try { if (localStorage.getItem(HINT_KEY)) return null; } catch { return null; }
  const s = suggestedLang(navigator.language);
  return s && s !== current ? s : null;
}
export function dismissLangSuggestion() { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* */ } }

/** Langue en cours (hors React : messages, confirmations). */
export const getLang = (): Lang => current;
/** Choix du joueur : enregistré, prioritaire sur tout le reste. */
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* */ }
  if (hasWindow) document.documentElement.lang = l;
  if (l !== current) { current = l; applyDataLang(l); listeners.forEach((f) => f()); }
}

/** Pour un composant React : il se réaffiche quand la langue change. */
export function useLang(): Lang {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getLang, () => 'fr' as Lang);
}

/** Paramètre `lang` à garder dans l'adresse quand le jeu la nettoie (un rechargement reste dans la langue demandée). */
export const keptLangSearch = (): string => (param ? `?lang=${param}` : '');

/** Texte d'une clé dans la langue en cours ; `{x}` remplacés. */
export const tr = (key: MessageKey, vars?: Record<string, string | number | null | undefined>): string => translate(current, key, vars as Record<string, string | number> | undefined);
/** Message du serveur (toujours en français à l'origine) dans la langue en cours. */
export const trServer = (text: string): string => translateServerText(current, text);
/** Nombre selon la langue. */
export const fmtNum = (n: number) => numberIn(current, n);
/** Locale de la langue en cours (nombres et dates). */
export const loc = () => LANG_LOCALE[current];
