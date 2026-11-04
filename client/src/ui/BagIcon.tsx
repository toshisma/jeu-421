import { useId } from 'react';

/**
 * Sac de dés : une bourse en velours fermée par un cordon doré, un dé brodé devant.
 * Remplace l'émoji « sac à dos » qu'on ne reconnaissait pas comme un sac de dés.
 * `size` en pixels, ou '1em' pour suivre la taille du texte.
 */
export function BagIcon({ size = 24, color = 'rouge', title }: { size?: number | string; color?: 'rouge' | 'bleu' | 'vert'; title?: string }) {
  const id = useId().replace(/:/g, '');
  const tone = { rouge: ['#c23a3a', '#7e1b22', '#4a0d14'], bleu: ['#3d63c9', '#1f3a86', '#0f1f4d'], vert: ['#2f9a62', '#1b5e3c', '#0c3321'] }[color];
  return (
    <svg className="bag-icon" width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={`v${id}`} cx="38%" cy="40%" r="70%">
          <stop offset="0" stopColor={tone[0]} />
          <stop offset="0.6" stopColor={tone[1]} />
          <stop offset="1" stopColor={tone[2]} />
        </radialGradient>
        <linearGradient id={`o${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.5" stopColor="#e0b155" />
          <stop offset="1" stopColor="#9c6f1e" />
        </linearGradient>
      </defs>
      {/* ombre au sol */}
      <ellipse cx="32" cy="60" rx="19" ry="3" fill="rgba(0,0,0,0.35)" />
      {/* collerette froncée au-dessus du cordon */}
      <path d="M22 18 C20 10 25 6 27 9 C28 5 31 4 32 8 C33 4 36 5 37 9 C39 6 44 10 42 18 Z" fill={`url(#v${id})`} />
      <path d="M27 9 L28.5 17 M32 8 L32 17 M37 9 L35.5 17" stroke="rgba(0,0,0,0.3)" strokeWidth="1.2" fill="none" />
      {/* bourse */}
      <path d="M22 18 C10 26 8 40 12 50 C15 57 49 57 52 50 C56 40 54 26 42 18 Z" fill={`url(#v${id})`} />
      {/* plis du tissu */}
      <path d="M26 21 C21 30 20 42 22 53 M38 21 C43 30 44 42 42 53" stroke="rgba(0,0,0,0.22)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M20 26 C16 33 15 40 17 47" stroke="rgba(255,255,255,0.22)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* cordon doré, nœud et glands */}
      <path d="M20 18.5 C26 21.5 38 21.5 44 18.5" stroke={`url(#o${id})`} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <circle cx="41" cy="20" r="2.6" fill={`url(#o${id})`} />
      <path d="M41 21 C42 25 44 27 45 31" stroke={`url(#o${id})`} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M41 21 C40 25 39 28 39.5 32" stroke={`url(#o${id})`} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M43.5 30 l3 4 M38 31 l1 4.5" stroke="#c9952f" strokeWidth="1.6" strokeLinecap="round" />
      {/* dé brodé devant */}
      <g transform="rotate(-8 32 39)">
        <rect x="23" y="30" width="18" height="18" rx="4" fill="#fbf6e9" stroke="#e0b155" strokeWidth="1.5" />
        <rect x="23" y="30" width="18" height="18" rx="4" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="0.8" strokeDasharray="1.6 1.4" />
        <circle cx="27.8" cy="34.8" r="2" fill="#1d1d1d" />
        <circle cx="32" cy="39" r="2" fill="#c8312b" />
        <circle cx="36.2" cy="43.2" r="2" fill="#1d1d1d" />
      </g>
    </svg>
  );
}
