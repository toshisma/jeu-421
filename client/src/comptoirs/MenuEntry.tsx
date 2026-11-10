/** Entrées de la Tournée des comptoirs : carte du menu du 421 et pastille de l'accueil (sans hauteur en plus). */
import { TDC_BISTROS, TDC_MAX_STARS, reputation } from '../../../shared/progress/comptoirs';
import type { Profile } from '../../../shared/progress/profile';
import { tr } from '../i18n/lang';

export function TdcMenuCard({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  const rep = reputation(profile.tdc);
  const won = TDC_BISTROS.filter((b) => (profile.tdc?.[b.id] ?? 0) & 1).length;
  return (
    <button className="tdc-entry" onClick={onOpen}>
      <span className="tdc-entry-art" aria-hidden><span className="tdc-awning" /><span className="tdc-entry-door">🍺</span></span>
      <span className="tdc-entry-text">
        <b>{tr('tdc.title')}</b>
        <small>{rep ? tr('tdc.menuSub', { n: rep, b: won, t: TDC_BISTROS.length }) : tr('tdc.q.marche.d')}</small>
      </span>
      {rep ? <em className="tdc-entry-rep"><span aria-hidden>★</span>{rep}<small>/{TDC_MAX_STARS}</small></em> : <em className="tdc-entry-new">{tr('tdc.menuNew')}</em>}
    </button>
  );
}

export function TdcHomeChip({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  const rep = reputation(profile.tdc);
  return (
    <button className="tdc-home-chip" onClick={onOpen} aria-label={tr('tdc.homeAria', { n: rep })}>
      <span aria-hidden>🍺</span><span className="tdc-home-chip-t">{tr('tdc.title')}</span><b><span aria-hidden>★</span>{rep}</b>
    </button>
  );
}
