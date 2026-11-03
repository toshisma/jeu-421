import { useLayoutEffect, useRef } from 'react';
const P: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

/**
 * Petit dé pour l'historique, les cartes et la barre d'action. Dessiné dans un canvas : le « mode
 * sombre forcé » de certains navigateurs Android recolore les SVG (points blancs sur dé blanc),
 * jamais le contenu d'un canvas.
 */
export function MiniDie({ value, size = 22, kept = false, dim = false, body, pip }: { value: number; size?: number; kept?: boolean; dim?: boolean; body?: string; pip?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1;
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const S = size * dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.scale(S / 100, S / 100);
    g.beginPath();
    g.roundRect(4, 4, 92, 92, 18);
    g.fillStyle = body ?? '#f6f3ec';
    g.fill();
    g.lineWidth = kept ? 9 : 3;
    g.strokeStyle = kept ? '#2a50b5' : 'rgba(0,0,0,0.3)';
    g.stroke();
    g.fillStyle = pip ?? '#141414';
    for (const [x, y] of P[value] ?? []) { g.beginPath(); g.arc(x, y, value === 1 ? 12 : 9.5, 0, Math.PI * 2); g.fill(); }
  }, [value, size, kept, body, pip, dpr]);
  return (
    <canvas ref={ref} className={`mini-die${kept ? ' kept' : ''}${dim ? ' dim' : ''}`} width={Math.round(size * dpr)} height={Math.round(size * dpr)}
      style={{ width: size, height: size }} role="img" aria-label={value ? `dé ${value}` : 'dé'} />
  );
}

export function DiceRow({ dice, size = 20, kept }: { dice: number[]; size?: number; kept?: boolean[] }) {
  return (
    <span className="dice-row">
      {dice.map((d, i) => <MiniDie key={i} value={d} size={size} kept={kept?.[i]} />)}
    </span>
  );
}
