/**
 * Réputation de la Tournée des comptoirs, à table en ligne (421, Courtisan, Coups Fourrés, Poker menteur) :
 * petite étoile + nombre, couleur du palier ; au toucher, une bulle donne le palier, les étoiles et les
 * quartiers terminés. La valeur vient du serveur (champ `rep` du joueur) ; sans elle, rien n'est affiché.
 * Placement : `className="rep-on-av"` (posée sur le coin de l'avatar, sans rien déplacer) ou
 * `rep-corner` (coin d'une case de joueur) ; l'étiquette ne prend jamais de place dans la ligne du nom.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TDC_QUARTERS } from '../../../shared/progress/comptoirs';
import { bestRep, readRep, REP_CONNOISSEURS, repTier, type RepInfo } from '../../../shared/progress/repu';
import type { MessageKey } from '../../../shared/i18n';
import { tr } from '../i18n/lang';

const tierName = (t: number) => tr(`rep.tier${Math.max(1, Math.min(4, t))}` as MessageKey);
const POP_W = 224;

export function RepBadge({ rep, className }: { rep?: RepInfo | null; className?: string }) {
  const [at, setAt] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [at]);
  const r = readRep(rep);
  if (!r) return null;
  const tier = repTier(r.s);
  const name = tierName(tier);
  // Les clics ne remontent pas à la carte du joueur (qui ouvre son profil), même depuis la bulle (portail React).
  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  let pop: React.ReactNode = null;
  if (at) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(8, Math.min(vw - POP_W - 8, at.left + at.width / 2 - POP_W / 2));
    const below = at.bottom + 120 < vh;
    pop = createPortal(
      <div className="rep-pop-back" onClick={(e) => { stop(e); setAt(null); }} onPointerDown={stop}>
        <div className={`rep-pop rt${tier}`} role="dialog" aria-label={name}
          style={{ left, width: POP_W, ...(below ? { top: at.bottom + 6 } : { bottom: vh - at.top + 6 }) }}>
          <b><i aria-hidden>★</i>{name}</b>
          <span>{tr('rep.stars', { n: r.s, s: r.s > 1 ? 's' : '' })}</span>
          <span>{tr('rep.quarters', { n: r.q, max: TDC_QUARTERS.length })}</span>
          <small>{tr('rep.source')}</small>
        </div>
      </div>, document.body);
  }
  return (
    <>
      <button type="button" className={`rep-badge rt${tier}${className ? ` ${className}` : ''}`} aria-label={tr('rep.aria', { n: r.s, tier: name })}
        title={name} onPointerDown={stop}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAt(at ? null : e.currentTarget.getBoundingClientRect()); }}>
        <i aria-hidden>★</i>{r.s}
      </button>
      {pop}
    </>
  );
}

/** Salon : « Table de connaisseurs » quand un joueur assis a une belle réputation (palier 3 et plus). */
export function RepTable({ reps }: { reps: (RepInfo | null | undefined)[] }) {
  const b = bestRep(reps.map(readRep));
  if (!b || repTier(b.s) < REP_CONNOISSEURS) return null;
  return (
    <p className={`rep-table rt${repTier(b.s)}`}>
      <i aria-hidden>★</i><b>{tr('rep.table')}</b><small>{tr('rep.tableBest', { tier: tierName(repTier(b.s)), n: b.s })}</small>
    </p>
  );
}
