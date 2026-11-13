import { useState } from 'react';
import { LANG_NAMES, type Lang } from '../../../shared/i18n';
import { dismissLangSuggestion, langSuggestion, setLang } from './lang';

/** Texte du bandeau, écrit dans la langue proposée (le joueur ne lit peut-être pas le français). */
const ASK: Record<Exclude<Lang, 'fr'>, { q: string; no: string }> = {
  en: { q: 'Play in English?', no: 'Keep French' },
  de: { q: 'Auf Deutsch spielen?', no: 'Französisch behalten' },
  nl: { q: 'In het Nederlands spelen?', no: 'Frans houden' },
};

/**
 * Propose la langue du navigateur sans l'imposer (Google doit toujours voir l'accueil en français).
 * Petit bandeau flottant : n'ajoute aucune hauteur à l'accueil.
 */
export function LangHint() {
  const [lang, setL] = useState<Lang | null>(() => langSuggestion());
  if (!lang || lang === 'fr') return null;
  const t = ASK[lang];
  const close = () => { dismissLangSuggestion(); setL(null); };
  return (
    <div className="lang-hint" role="dialog" aria-label={t.q} lang={lang}>
      <span>🌐 {t.q}</span>
      <button type="button" className="lang-hint-yes" onClick={() => { setLang(lang); dismissLangSuggestion(); setL(null); }}>{LANG_NAMES[lang]}</button>
      <button type="button" className="lang-hint-no" onClick={close} aria-label={t.no} title={t.no}>✕</button>
    </div>
  );
}
