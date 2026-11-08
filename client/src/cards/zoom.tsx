/**
 * Coups Fourrés : « voir la carte en grand », partout où une carte apparaît (demande de Sam, novembre :
 * « on doit toujours pouvoir agrandir les cartes pour les lire »).
 *
 * - `zoomCard(id)` ouvre la carte en grand (la grande carte lisible, texte entier) par-dessus tout.
 * - `useLongPress(cb)` : un toucher long (≈ 0,45 s) ouvre la carte SANS déclencher le toucher normal
 *   (pas de carte jouée ni ajoutée par erreur) ; le menu contextuel du navigateur est bloqué.
 * - `<ZoomBtn id />` : petite loupe à poser dans un coin de carte (toucher = carte en grand).
 * - `<CardZoomHost />` : l'affichage, monté une fois par le mode (CfMode).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { appHeight } from '../ui/navGuard';
import { cardDef, FAMILY_LABEL, RARITY_LABEL } from '../../../shared/cards/catalog';
import { Icon } from '../ui/Icon';
import { BigCard } from './BoardParts';

const EV = '421:cf-zoom';

/** Ouvre la carte en grand (fiche lisible). */
export function zoomCard(id: string | null | undefined) {
  if (!id || !cardDef(id) || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EV, { detail: id }));
}

/**
 * Toucher long : appelle `onLong` au bout de `ms`, et avale le « clic » qui suit (rien ne se joue).
 * Un mouvement de plus de 10 px (on fait défiler la main) annule.
 */
export function useLongPress(onLong: (() => void) | null | undefined, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; start.current = null; }, []);
  useEffect(() => cancel, [cancel]);
  if (!onLong) return {};
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        try { navigator.vibrate?.(12); } catch { /* */ }
        onLong();
      }, ms);
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); },
    // Le clic qui suit un toucher long ne doit rien faire d'autre (ni jouer, ni ajouter la carte).
    onClickCapture: (e: MouseEvent) => { if (fired.current) { fired.current = false; e.stopPropagation(); e.preventDefault(); } },
  };
}

/** Petite loupe dans le coin d'une carte : la carte en grand, sans toucher à la carte elle-même. */
export function ZoomBtn({ id, className }: { id: string; className?: string }) {
  const name = cardDef(id)?.name ?? 'la carte';
  const open = (e: MouseEvent | KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); zoomCard(id); };
  // <span role="button"> : la loupe se pose souvent DANS un bouton (carte à choisir), un <button> y serait invalide.
  return (
    <span className={`cf-zoombtn${className ? ` ${className}` : ''}`} role="button" tabIndex={0} aria-label={`Lire « ${name} » en grand`}
      onClick={open} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(e); }}>
      <Icon name="search" size={13} />
    </span>
  );
}

/** Affichage de la carte en grand (monté une fois). Toucher n'importe où ou « Fermer » : on revient. */
export function CardZoomHost() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setId((e as CustomEvent<string>).detail);
    window.addEventListener(EV, on);
    return () => window.removeEventListener(EV, on);
  }, []);
  useEffect(() => {
    if (!id) return;
    const k = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setId(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [id]);
  if (!id) return null;
  const d = cardDef(id);
  if (!d) return null;
  const w = typeof window !== 'undefined' ? Math.min(330, window.innerWidth - 32, Math.round((appHeight() - 150) * 0.66)) : 300;
  return (
    <div className="cf-bigzoom" role="dialog" aria-modal="true" aria-label={`${d.name} en grand`} onClick={() => setId(null)}>
      <div className="cf-bigzoom-in" onClick={(e) => e.stopPropagation()}>
        <BigCard id={id} width={Math.max(220, w)} className="cf-bigzoom-card" />
        <p className="cf-bigzoom-flavor"><em>{d.flavor}</em><small>{FAMILY_LABEL[d.family]} · {RARITY_LABEL[d.rarity]}</small></p>
        <button className="cfn-act ghost full" onClick={() => setId(null)} autoFocus>Fermer</button>
      </div>
    </div>
  );
}
