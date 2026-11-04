import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Petite fenêtre flottante (volume, musique, réactions, aide) accrochée à un bouton.
 * Elle est rendue à la racine de la page, au-dessus de tout : aucun conteneur qui défile
 * ou qui coupe son contenu (menu « Plus », barre du haut en partie…) ne peut la tronquer.
 * Sa position est recalculée pour rester entièrement dans l'écran (marges de 12 px),
 * sous le bouton, ou au-dessus s'il n'y a pas la place en dessous.
 */
export function FloatingPop({ anchor, onClose, className, children, label }: {
  anchor: React.RefObject<HTMLElement>; onClose: () => void; className: string; children: React.ReactNode; label?: string;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxW: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = pop.current;
      if (!a || !p) return;
      const vw = window.innerWidth, vh = window.innerHeight, m = 12;
      const maxW = vw - 2 * m;
      const w = Math.min(p.offsetWidth, maxW), h = p.offsetHeight;
      // Aligné sur le bord droit du bouton, puis ramené dans l'écran.
      let left = a.right - w;
      left = Math.max(m, Math.min(left, vw - m - w));
      let top = a.bottom + 8;
      if (top + h > vh - m && a.top - 8 - h >= m) top = a.top - 8 - h;
      top = Math.max(m, Math.min(top, vh - m - h));
      setPos({ left, top, maxW });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key); };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={pop} className={`floating-pop ${className}`} role="dialog" aria-label={label}
      style={pos ? { left: pos.left, top: pos.top, maxWidth: pos.maxW } : { left: 0, top: 0, visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}
