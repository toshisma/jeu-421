/**
 * Entrée de la Tournée des comptoirs dans le menu du 421 : l'entrée principale du menu (au-dessus de la vitrine
 * « Jouer contre l'ordinateur »), avec la prochaine étape et un bouton « Continuer ».
 * (L'accueil passe par le bloc Campagne : client/src/campaigns/HomeCard.tsx.)
 */
import { campaignSummary } from '../../../shared/campaigns/r421';
import type { Profile } from '../../../shared/progress/profile';
import { tr } from '../i18n/lang';
import { goLabel, nextLine } from '../campaigns/HomeCard';

export function TdcMenuCard({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  const s = campaignSummary(profile);
  return (
    <button className="tdc-entry featured" onClick={onOpen} aria-label={`${tr('tdc.title')} · ${tr('chm.starsAria', { n: s.stars, max: s.maxStars })}`}>
      <span className="tdc-entry-art" aria-hidden><span className="tdc-awning" /><span className="tdc-entry-door">🍺</span></span>
      <span className="tdc-entry-text">
        <small className="tdc-entry-eyebrow">{tr('chm.eyebrow')} · <span className="tdc-entry-rep-in"><span aria-hidden>★</span>{s.stars}<span className="tdc-entry-rep-max">/{s.maxStars}</span></span></small>
        <b>{tr('tdc.title')}</b>
        <small>{nextLine(s)}</small>
      </span>
      <em className="camp-go tdc-entry-go">{goLabel(s)}</em>
    </button>
  );
}
