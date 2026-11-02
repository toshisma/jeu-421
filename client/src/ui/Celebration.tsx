import { useMemo, type CSSProperties } from 'react';
import { fxDef } from '../../../shared/progress/dice-collection';

/** Célébration d'un 4-2-1 (effet de collection) : plein écran, 2,4 s, sans bloquer le jeu. */
export function Celebration({ id }: { id: string }) {
  const fx = fxDef(id);
  const pieces = useMemo(() => {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const col = (i: number) => fx?.colors[i % (fx?.colors.length || 1)] ?? '#ffd23f';
    switch (id) {
      case 'fx-ballons': return Array.from({ length: 14 }, (_, i) => ({ left: `${rnd(4, 92)}%`, '--c': col(i), animationDelay: `${rnd(0, 0.6)}s`, '--d': `${rnd(1.8, 2.6)}s`, '--sw': `${rnd(-30, 30)}px` }));
      case 'fx-pluie-or': return Array.from({ length: 42 }, (_, i) => ({ left: `${rnd(0, 98)}%`, '--c': col(i), animationDelay: `${rnd(0, 0.9)}s`, '--d': `${rnd(1.2, 2)}s`, '--r': `${rnd(-200, 200)}deg` }));
      case 'fx-feu-artifice': return Array.from({ length: 4 }, (_, k) => ({ left: `${rnd(15, 85)}%`, top: `${rnd(12, 55)}%`, animationDelay: `${k * 0.35}s`, '--c': col(k) }));
      case 'fx-eclair': return [];
      default: return Array.from({ length: 46 }, (_, i) => { const a = rnd(0, Math.PI * 2), d = rnd(120, 340); return { '--c': col(i), '--x': `${Math.cos(a) * d}px`, '--y': `${Math.sin(a) * d - 60}px`, '--r': `${rnd(-540, 540)}deg`, animationDelay: `${rnd(0, 0.15)}s` }; });
    }
  }, [id, fx]);
  if (!fx) return null;
  return (
    <div className={`celebration c-${id.slice(3)}`} aria-hidden>
      {id === 'fx-eclair' && (
        <>
          <i className="flash" />
          <svg className="bolt" viewBox="0 0 100 300"><polyline points="62,0 30,120 58,128 22,300 80,108 50,100 78,0" /></svg>
        </>
      )}
      {id === 'fx-feu-artifice'
        ? pieces.map((p, k) => (
          <span key={k} className="burst" style={p as CSSProperties}>
            {Array.from({ length: 18 }, (_, j) => <i key={j} style={{ '--a': `${(360 / 18) * j}deg`, '--c': fxDef(id)!.colors[(j + k) % fxDef(id)!.colors.length] } as CSSProperties} />)}
          </span>
        ))
        : pieces.map((p, k) => <i key={k} className="pc" style={p as CSSProperties} />)}
    </div>
  );
}
