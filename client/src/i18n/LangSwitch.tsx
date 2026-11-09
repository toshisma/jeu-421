/** Sélecteur de langue (Réglages, Courtisan) et petite mention « le reste est en français ». */
import { LANGS, LANG_NAMES } from '../../../shared/i18n';
import { setLang, tr, useLang, type Lang } from './lang';

export function LangSwitch({ full }: { full?: boolean }) {
  const lang = useLang();
  return (
    <label className={`lang-switch${full ? ' full' : ''}`}>
      <span className="sr-only">{tr('lang.switch')}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
      </select>
    </label>
  );
}

/** Hors français : discrète précision sur ce qui reste en français. */
export function FrenchOnlyNote() {
  // Tout le jeu est traduit : plus de précision à afficher.
  return null;
}
