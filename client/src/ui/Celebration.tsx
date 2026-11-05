import { useMemo, type CSSProperties } from 'react';
import { fxDef } from '../../../shared/progress/dice-collection';

/**
 * Célébration d'un 4-2-1 (effet de collection), côté écran : elle accompagne la mise en scène
 * jouée dans le bac 3D (confettis, ballons, éclair, pièces, feu d'artifice) et le texte « 4-2-1 ! ».
 * Plein écran, 2,4 s, sans bloquer le jeu.
 */
export function Celebration({ id }: { id: string }) {
  const fx = fxDef(id);
  const pieces = useMemo(() => {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const col = (i: number) => fx?.colors[i % (fx?.colors.length || 1)] ?? '#ffd23f';
    switch (id) {
      // Quelques ballons passent devant l'écran (les autres s'envolent dans le bac).
      case 'fx-ballons': return Array.from({ length: 6 }, (_, i) => ({ left: `${rnd(4, 88)}%`, '--c': col(i), animationDelay: `${0.4 + rnd(0, 0.7)}s`, '--d': `${rnd(1.6, 2.1)}s`, '--sw': `${rnd(-30, 30)}px` }));
      // Pièces qui tombent au premier plan, floues (profondeur de champ).
      case 'fx-pluie-or': return Array.from({ length: 14 }, (_, i) => ({ left: `${rnd(0, 96)}%`, '--c': col(i), animationDelay: `${rnd(0, 0.9)}s`, '--d': `${rnd(0.9, 1.4)}s`, '--r': `${rnd(-400, 400)}deg`, '--z': rnd(1, 1.8).toFixed(2) }));
      case 'fx-feu-artifice': return Array.from({ length: 3 }, (_, k) => ({ left: `${rnd(15, 85)}%`, top: `${rnd(8, 30)}%`, animationDelay: `${0.3 + k * 0.45}s`, '--c': col(k) }));
      case 'fx-eclair': return [];
      // Bravo ! : gerbe de confettis qui jaillit du texte.
      default: return Array.from({ length: 30 }, (_, i) => { const a = rnd(Math.PI * 1.05, Math.PI * 1.95), d = rnd(120, 260); return { '--c': col(i), '--x': `${Math.cos(a) * d}px`, '--y': `${Math.sin(a) * d}px`, '--r': `${rnd(-540, 540)}deg`, animationDelay: `${rnd(0, 0.12)}s` }; });
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
      {id === 'fx-pluie-or' && <i className="gold-glow" />}
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
