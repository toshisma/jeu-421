/**
 * Jetons qui volent : du pot (ou du gagnant) jusqu'au perdant de la manche, en arc, un par un.
 * Purement décoratif : calque fixe au-dessus de l'écran, nettoyé à la fin de l'animation.
 */
export function flyTokens(from: Element | null, to: Element | null, amount: number) {
  if (!from || !to || amount <= 0) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const sx = a.left + a.width / 2, sy = a.top + a.height / 2;
  const ex = b.left + b.width / 2, ey = b.top + b.height / 2;
  const n = Math.min(10, Math.max(1, Math.round(amount)));
  const layer = document.createElement('div');
  layer.className = 'token-layer';
  document.body.appendChild(layer);
  let left = n;
  for (let i = 0; i < n; i++) {
    const t = document.createElement('i');
    t.className = 'flying-token';
    layer.appendChild(t);
    const jx = (Math.random() - 0.5) * 30, jy = (Math.random() - 0.5) * 16;
    const mx = (sx + ex) / 2 + jx, my = Math.min(sy, ey) - 70 - Math.random() * 40;
    const anim = t.animate([
      { transform: `translate(${sx - 13}px, ${sy - 13}px) scale(0.6) rotateX(0deg)`, opacity: 0 },
      { transform: `translate(${sx - 13}px, ${sy - 13}px) scale(1)`, opacity: 1, offset: 0.08 },
      { transform: `translate(${mx - 13}px, ${my - 13}px) scale(1.15) rotateX(180deg)`, offset: 0.5 },
      { transform: `translate(${ex - 13 + jx / 3}px, ${ey - 13 + jy / 3}px) scale(0.9) rotateX(360deg)`, opacity: 1, offset: 0.92 },
      { transform: `translate(${ex - 13}px, ${ey - 13}px) scale(0.5)`, opacity: 0 },
    ], { duration: 820, delay: i * 75, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'both' });
    anim.onfinish = () => { if (--left === 0) layer.remove(); };
  }
  setTimeout(() => layer.remove(), 820 + n * 75 + 500);
}
