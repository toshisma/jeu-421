/**
 * Illustrations du comptoir : dessins SVG maison (aucune image sous licence), dans une même
 * palette que le sac de dés (`BagIcon`) : or (#fff1b8 → #e0b155 → #a8761f), bois (#a8673a → #5e331a),
 * métal (#c9ced3 → #6f767d), rouge tabac (#c8312b), bleu émail (#1d3c8f), feutre (#2f8a63).
 * Toutes acceptent `size` (pixels ou '1em') et se dessinent dans un carré 96 × 96.
 * On y trouve aussi les effets de récompense (coffre et cadeau qui s'ouvrent, pièces qui jaillissent)
 * et la petite célébration de victoire de l'écran de fin.
 */
import { useEffect, useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { BagIcon } from './BagIcon';

export { BagIcon };

type ArtProps = { size?: number | string; className?: string; title?: string };

/** Identifiant unique pour les dégradés (plusieurs dessins identiques sur la même page). */
function useUid() { return useId().replace(/:/g, ''); }

function Svg({ size = 48, className, title, children, view = '0 0 96 96' }: ArtProps & { children: ReactNode; view?: string }) {
  return (
    <svg className={`art${className ? ` ${className}` : ''}`} width={size} height={size} viewBox={view}
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Dégradés partagés : or, bois, métal. */
function Golds({ u }: { u: string }) {
  return (
    <>
      <linearGradient id={`g${u}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1b8" /><stop offset=".45" stopColor="#e8b84a" /><stop offset="1" stopColor="#9c6a14" /></linearGradient>
      <linearGradient id={`w${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b0713f" /><stop offset="1" stopColor="#5e331a" /></linearGradient>
      <linearGradient id={`m${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e3e7ea" /><stop offset=".5" stopColor="#a2a9b0" /><stop offset="1" stopColor="#5f666d" /></linearGradient>
      <radialGradient id={`l${u}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff6cf" stopOpacity="1" /><stop offset=".55" stopColor="#ffd77a" stopOpacity=".55" /><stop offset="1" stopColor="#ffd77a" stopOpacity="0" /></radialGradient>
    </>
  );
}

/** Pièce du comptoir (face avec un « 4 » frappé). */
export function CoinArt(p: ArtProps) {
  const u = useUid();
  return (
    <Svg {...p}>
      <defs><Golds u={u} /></defs>
      <ellipse cx="48" cy="90" rx="26" ry="4" fill="rgba(0,0,0,.3)" />
      <circle cx="48" cy="50" r="36" fill="#9c6a14" />
      <circle cx="48" cy="46" r="36" fill={`url(#g${u})`} />
      <circle cx="48" cy="46" r="27" fill="none" stroke="#a8761f" strokeWidth="3" />
      <circle cx="48" cy="46" r="31" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" strokeDasharray="2 3" />
      <text x="48" y="58" textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontWeight="800" fontSize="34" fill="#8a5a10">4</text>
      <path d="M26 30 A28 28 0 0 1 44 19" stroke="rgba(255,255,255,.75)" strokeWidth="4" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/** Pile de pièces. */
export function CoinsArt(p: ArtProps) {
  const u = useUid();
  const coin = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <ellipse cx={x} cy={y + 4} rx="20" ry="7" fill="#8a5a10" />
      <ellipse cx={x} cy={y} rx="20" ry="7" fill={`url(#g${u})`} stroke="#a8761f" strokeWidth="1.2" />
    </g>
  );
  return (
    <Svg {...p}>
      <defs><Golds u={u} /></defs>
      <ellipse cx="48" cy="88" rx="34" ry="5" fill="rgba(0,0,0,.3)" />
      {[78, 70, 62, 54].map((y) => coin(36, y))}
      {[80, 72].map((y) => coin(62, y))}
      <circle cx="64" cy="38" r="16" fill={`url(#g${u})`} stroke="#a8761f" strokeWidth="2" />
      <circle cx="64" cy="38" r="11" fill="none" stroke="#a8761f" strokeWidth="1.6" />
      <path d="M54 32 A12 12 0 0 1 60 25" stroke="rgba(255,255,255,.8)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/** Coffre du comptoir : fermé, ou ouvert avec sa lumière et ses pièces. */
export function ChestArt({ open = false, ...p }: ArtProps & { open?: boolean }) {
  const u = useUid();
  return (
    <Svg {...p}>
      <defs><Golds u={u} /></defs>
      <ellipse cx="48" cy="88" rx="34" ry="5" fill="rgba(0,0,0,.35)" />
      {open && <ellipse cx="48" cy="34" rx="42" ry="26" fill={`url(#l${u})`} />}
      {open && <g>
        <circle cx="34" cy="34" r="7" fill={`url(#g${u})`} stroke="#a8761f" /><circle cx="49" cy="27" r="7" fill={`url(#g${u})`} stroke="#a8761f" />
        <circle cx="63" cy="34" r="7" fill={`url(#g${u})`} stroke="#a8761f" /><circle cx="42" cy="40" r="6" fill={`url(#g${u})`} stroke="#a8761f" />
        <circle cx="56" cy="41" r="6" fill={`url(#g${u})`} stroke="#a8761f" />
      </g>}
      {/* caisse */}
      <path d="M14 44 H82 V80 Q82 84 78 84 H18 Q14 84 14 80 Z" fill={`url(#w${u})`} />
      <path d="M14 56 H82 M14 70 H82" stroke="rgba(0,0,0,.22)" strokeWidth="2" />
      <path d="M17 48 H79" stroke="rgba(255,220,170,.25)" strokeWidth="2" />
      {/* couvercle */}
      {open ? (
        <g transform="rotate(-18 16 44)">
          <path d="M14 44 C14 20 82 20 82 44 Z" fill={`url(#w${u})`} />
          <path d="M14 44 C14 20 82 20 82 44" fill="none" stroke="#3a1f0c" strokeWidth="2" />
          <rect x="25" y="25" width="7" height="19" fill={`url(#m${u})`} /><rect x="64" y="25" width="7" height="19" fill={`url(#m${u})`} />
        </g>
      ) : (
        <g>
          <path d="M14 44 C14 18 82 18 82 44 Z" fill={`url(#w${u})`} />
          <path d="M20 36 C26 26 70 26 76 36" stroke="rgba(255,220,170,.3)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M14 44 H82" stroke="#3a1f0c" strokeWidth="2.5" />
          <path d="M25 24 C27 22 30 21 32 21 V44 H25 Z" fill={`url(#m${u})`} /><path d="M64 21 C66 21 69 22 71 24 V44 H64 Z" fill={`url(#m${u})`} />
        </g>
      )}
      {/* ferrures et serrure */}
      <rect x="25" y="44" width="7" height="40" fill={`url(#m${u})`} /><rect x="64" y="44" width="7" height="40" fill={`url(#m${u})`} />
      {[50, 62, 76].map((y) => <g key={y}><circle cx="28.5" cy={y} r="1.5" fill="#f2f4f5" /><circle cx="67.5" cy={y} r="1.5" fill="#f2f4f5" /></g>)}
      <rect x="40" y={open ? 46 : 38} width="16" height="18" rx="3" fill={`url(#g${u})`} stroke="#7a5410" strokeWidth="1.5" />
      <path d={open ? 'M48 51 v6' : 'M48 43 v6'} stroke="#3a2410" strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

/** Cadeau du jour : boîte émaillée et ruban rouge ; ouvert, le couvercle s'envole et la lumière sort. */
export function GiftArt({ open = false, ...p }: ArtProps & { open?: boolean }) {
  const u = useUid();
  return (
    <Svg {...p}>
      <defs>
        <Golds u={u} />
        <linearGradient id={`b${u}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5b8cff" /><stop offset="1" stopColor="#1d3c8f" /></linearGradient>
        <linearGradient id={`r${u}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ef5a52" /><stop offset="1" stopColor="#a81f1f" /></linearGradient>
      </defs>
      <ellipse cx="48" cy="89" rx="32" ry="4.5" fill="rgba(0,0,0,.35)" />
      {open && <ellipse cx="48" cy="40" rx="40" ry="28" fill={`url(#l${u})`} />}
      <rect x="18" y="46" width="60" height="38" rx="4" fill={`url(#b${u})`} />
      <path d="M24 52 V78" stroke="rgba(255,255,255,.3)" strokeWidth="3" strokeLinecap="round" />
      <rect x="42" y="46" width="12" height="38" fill={`url(#r${u})`} />
      <g transform={open ? 'translate(4 -16) rotate(14 48 38)' : undefined}>
        <rect x="13" y="33" width="70" height="15" rx="4" fill={`url(#b${u})`} stroke="rgba(255,255,255,.3)" strokeWidth="1.5" />
        <rect x="42" y="33" width="12" height="15" fill={`url(#r${u})`} />
        <path d="M48 33 C34 12 17 20 27 30 C32 34 44 33 48 33 Z" fill={`url(#r${u})`} />
        <path d="M48 33 C62 12 79 20 69 30 C64 34 52 33 48 33 Z" fill={`url(#r${u})`} />
        <path d="M30 26 C35 22 41 25 45 31" stroke="rgba(255,255,255,.35)" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="48" cy="33" r="5" fill="#ff8b84" />
      </g>
      {open && <g fill="#fff8d6"><path d="M30 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /><path d="M66 24 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" /></g>}
    </Svg>
  );
}

/** Trophée du tournoi. */
export function TrophyArt(p: ArtProps) {
  const u = useUid();
  return (
    <Svg {...p}>
      <defs><Golds u={u} /></defs>
      <ellipse cx="48" cy="88" rx="26" ry="4" fill="rgba(0,0,0,.35)" />
      <path d="M22 18 C10 18 8 38 30 42" fill="none" stroke={`url(#g${u})`} strokeWidth="6" strokeLinecap="round" />
      <path d="M74 18 C86 18 88 38 66 42" fill="none" stroke={`url(#g${u})`} strokeWidth="6" strokeLinecap="round" />
      <path d="M24 12 H72 V30 C72 48 60 56 48 58 C36 56 24 48 24 30 Z" fill={`url(#g${u})`} />
      <path d="M31 16 V30 C31 42 38 49 44 52" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="3" strokeLinecap="round" />
      <rect x="43" y="57" width="10" height="12" fill={`url(#g${u})`} />
      <rect x="30" y="68" width="36" height="16" rx="3" fill={`url(#w${u})`} />
      <rect x="38" y="72" width="20" height="7" rx="1.5" fill={`url(#g${u})`} />
      <path d="M48 22 l3 6 6.5 1 -4.7 4.6 1.1 6.5 -5.9-3.1 -5.9 3.1 1.1-6.5 -4.7-4.6 6.5-1z" fill="#fff8d6" />
    </Svg>
  );
}

/** Haut-de-forme du patron de la semaine. */
export function TopHatArt(p: ArtProps) {
  const u = useUid();
  return (
    <Svg {...p}>
      <defs>
        <Golds u={u} />
        <linearGradient id={`h${u}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1a1a1f" /><stop offset=".4" stopColor="#3d3d48" /><stop offset="1" stopColor="#121216" /></linearGradient>
      </defs>
      <ellipse cx="48" cy="88" rx="30" ry="4" fill="rgba(0,0,0,.35)" />
      <ellipse cx="48" cy="72" rx="37" ry="10" fill="#141418" />
      <path d="M14 70 C24 76 72 76 82 70" stroke="rgba(255,255,255,.12)" strokeWidth="2" fill="none" />
      <path d="M28 20 C28 14 68 14 68 20 L66 68 C66 74 30 74 30 68 Z" fill={`url(#h${u})`} />
      <path d="M29.5 54 C34 59 62 59 66.5 54 L66 64 C61 69 35 69 30 64 Z" fill="#b8282f" />
      <path d="M31 57 C40 61 56 61 65 57" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" fill="none" />
      <rect x="54" y="55" width="7" height="9" rx="1" fill={`url(#g${u})`} />
      <ellipse cx="48" cy="20" rx="20" ry="5" fill="#2c2c34" />
      <path d="M35 24 L34 50" stroke="rgba(255,255,255,.18)" strokeWidth="3" strokeLinecap="round" />
      {/* moustache du patron */}
      <path d="M36 84 C40 79 46 80 48 83 C50 80 56 79 60 84 C55 86 51 85 48 84 C45 85 41 86 36 84 Z" fill="#e8e1d2" />
    </Svg>
  );
}

/** Cible et fléchette du défi du jour. */
export function TargetArt(p: ArtProps) {
  const u = useUid();
  return (
    <Svg {...p}>
      <defs>
        <Golds u={u} />
        <radialGradient id={`d${u}`} cx="45%" cy="40%" r="60%"><stop offset="0" stopColor="#3a2a1a" /><stop offset="1" stopColor="#140c06" /></radialGradient>
      </defs>
      <ellipse cx="46" cy="89" rx="26" ry="4" fill="rgba(0,0,0,.35)" />
      <circle cx="46" cy="50" r="35" fill={`url(#d${u})`} stroke={`url(#g${u})`} strokeWidth="3.5" />
      <circle cx="46" cy="50" r="27" fill="#ece0c4" /><circle cx="46" cy="50" r="19" fill="#c8312b" />
      <circle cx="46" cy="50" r="11" fill="#ece0c4" /><circle cx="46" cy="50" r="4.5" fill="#1d3c8f" />
      <path d="M22 34 A28 28 0 0 1 36 24" stroke="rgba(255,255,255,.4)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M47 49 L80 17" stroke="#6b4a2a" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M80 17 l9 -3 -4 8 z M76 15 l5 -9 3 6 z" fill={`url(#g${u})`} />
    </Svg>
  );
}

/** Parchemin des missions : `done` cases cochées sur `total`. */
export function ScrollArt({ done = 2, total = 3, ...p }: ArtProps & { done?: number; total?: number }) {
  const u = useUid();
  const rows = Math.min(3, Math.max(1, total));
  return (
    <Svg {...p}>
      <defs>
        <linearGradient id={`p${u}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#e9d8b0" /><stop offset=".5" stopColor="#fbf0d6" /><stop offset="1" stopColor="#d6c08e" /></linearGradient>
        <linearGradient id={`c${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9b977" /><stop offset="1" stopColor="#9c7a3c" /></linearGradient>
      </defs>
      <ellipse cx="48" cy="90" rx="28" ry="4" fill="rgba(0,0,0,.3)" />
      <rect x="22" y="16" width="52" height="66" rx="3" fill={`url(#p${u})`} />
      <path d="M26 20 V78" stroke="rgba(140,100,40,.18)" strokeWidth="2" />
      <rect x="16" y="9" width="64" height="11" rx="5.5" fill={`url(#c${u})`} />
      <rect x="16" y="77" width="64" height="11" rx="5.5" fill={`url(#c${u})`} />
      <circle cx="16" cy="14.5" r="3" fill="#7a5a26" /><circle cx="80" cy="14.5" r="3" fill="#7a5a26" />
      {Array.from({ length: rows }, (_, i) => {
        const y = 34 + i * 16;
        return (
          <g key={i}>
            {i < done
              ? <path d={`M30 ${y} l4 4 8-9`} stroke="#2f9a62" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              : <rect x="30" y={y - 6} width="10" height="10" rx="2" fill="none" stroke="#8a7550" strokeWidth="2.5" />}
            <path d={`M48 ${y} H66`} stroke="#8a7550" strokeWidth="3" strokeLinecap="round" />
          </g>
        );
      })}
      <path d="M70 70 l6 10 M66 72 l2 10" stroke="#c8312b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="69" cy="69" r="6" fill="#c8312b" /><circle cx="69" cy="69" r="3" fill="#8f1f1a" />
    </Svg>
  );
}

/** Ticket doré du pass du mois, avec le palier atteint. */
export function TicketArt({ label, ...p }: ArtProps & { label?: string | number }) {
  const u = useUid();
  return (
    <Svg {...p}>
      <defs><Golds u={u} /></defs>
      <ellipse cx="48" cy="86" rx="30" ry="4" fill="rgba(0,0,0,.3)" />
      <g transform="rotate(-14 48 48)">
        <path d="M10 30 H86 V42 A6 6 0 0 0 86 54 V66 H10 V54 A6 6 0 0 0 10 42 Z" fill="#8a5a10" transform="translate(0 3)" />
        <path d="M10 30 H86 V42 A6 6 0 0 0 86 54 V66 H10 V54 A6 6 0 0 0 10 42 Z" fill={`url(#g${u})`} />
        <rect x="15" y="35" width="66" height="26" rx="2" fill="none" stroke="rgba(122,84,16,.55)" strokeWidth="1.5" />
        <path d="M63 30 V66" stroke="#7a5410" strokeWidth="2" strokeDasharray="3 3" />
        <path d="M37 37 l3.5 7 7.7 1.1 -5.6 5.4 1.3 7.6 -6.9-3.6 -6.9 3.6 1.3-7.6 -5.6-5.4 7.7-1.1z" fill="#fff8d6" stroke="#a8761f" strokeWidth="1.5" />
        <text x="74" y="54" fontFamily="'Barlow Condensed', sans-serif" fontWeight="800" fontSize={String(label ?? '').length > 1 ? 13 : 16} fill="#5a3a08" textAnchor="middle">{label ?? ''}</text>
        <path d="M14 33 H58" stroke="rgba(255,255,255,.6)" strokeWidth="2" strokeLinecap="round" />
      </g>
    </Svg>
  );
}

/** Table de jeu ronde vue de dessus, avec des joueurs autour (jeu en ligne). */
export function TableArt(p: ArtProps) {
  const u = useUid();
  const seats: [number, number, string][] = [[16, 32, '#5b8cff'], [48, 14, '#b06ad9'], [80, 30, '#e8964a'], [86, 66, '#3fbf8a'], [12, 68, '#ef5a52']];
  return (
    <Svg {...p}>
      <defs>
        <Golds u={u} />
        <radialGradient id={`t${u}`} cx="45%" cy="35%" r="70%"><stop offset="0" stopColor="#3fa67a" /><stop offset="1" stopColor="#145c3e" /></radialGradient>
      </defs>
      <ellipse cx="48" cy="86" rx="38" ry="6" fill="rgba(0,0,0,.35)" />
      <ellipse cx="48" cy="60" rx="40" ry="24" fill={`url(#w${u})`} />
      <ellipse cx="48" cy="56" rx="34" ry="19" fill={`url(#t${u})`} />
      <ellipse cx="48" cy="56" rx="30" ry="16" fill="none" stroke="rgba(241,204,125,.45)" strokeWidth="1.2" strokeDasharray="2 2.5" />
      <g transform="translate(34 46) rotate(-12)"><rect width="12" height="12" rx="3" fill="#fbf6e9" /><circle cx="3.5" cy="3.5" r="1.4" fill="#222" /><circle cx="8.5" cy="8.5" r="1.4" fill="#222" /></g>
      <g transform="translate(50 50) rotate(14)"><rect width="12" height="12" rx="3" fill="#fbf6e9" /><circle cx="6" cy="6" r="1.7" fill="#c8312b" /></g>
      <g transform="translate(42 60) rotate(4)"><rect width="11" height="11" rx="3" fill="#fbf6e9" /><circle cx="3" cy="3" r="1.3" fill="#222" /><circle cx="8" cy="3" r="1.3" fill="#222" /><circle cx="3" cy="8" r="1.3" fill="#222" /><circle cx="8" cy="8" r="1.3" fill="#222" /></g>
      {seats.map(([x, y, c]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="9.5" fill={c} stroke="#fff" strokeWidth="2.5" />
          <circle cx={x} cy={y - 2.5} r="3.2" fill="rgba(255,255,255,.85)" />
          <path d={`M${x - 5} ${y + 5.5} a5 4.5 0 0 1 10 0`} fill="rgba(255,255,255,.85)" />
        </g>
      ))}
    </Svg>
  );
}

/** Deux personnages qui trinquent (entre amis). */
export function FriendsArt(p: ArtProps) {
  const u = useUid();
  return (
    <Svg {...p}>
      <defs><Golds u={u} /></defs>
      <ellipse cx="48" cy="88" rx="32" ry="4" fill="rgba(0,0,0,.3)" />
      <circle cx="30" cy="34" r="12" fill="#5b8cff" stroke="#fff" strokeWidth="2.5" />
      <path d="M12 80 a18 18 0 0 1 36 0 Z" fill="#5b8cff" stroke="#fff" strokeWidth="2.5" />
      <circle cx="66" cy="34" r="12" fill="#e8964a" stroke="#fff" strokeWidth="2.5" />
      <path d="M48 80 a18 18 0 0 1 36 0 Z" fill="#e8964a" stroke="#fff" strokeWidth="2.5" />
      <path d="M40 10 h9 l-2 14 a3 3 0 0 1 -5 0 Z" fill={`url(#g${u})`} transform="rotate(-14 44 16)" />
      <path d="M48 10 h9 l-2 14 a3 3 0 0 1 -5 0 Z" fill={`url(#g${u})`} transform="rotate(14 52 16)" />
      <path d="M46 6 l2 -4 M50 6 l3 -3 M42 7 l-3 -3" stroke="#fff1b8" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ------------------------------------------------------------------------------------------------
// Effets : éclat d'une récompense prête, ouverture du coffre / du cadeau, victoire.

/** Rayons de lumière qui tournent lentement derrière un objet (récompense prête, victoire). */
export function Rays({ className }: { className?: string }) {
  return <span className={`fx-rays${className ? ` ${className}` : ''}`} aria-hidden />;
}

/** Pièces qui jaillissent d'un point (positions tirées une fois au montage). */
export function CoinBurst({ count = 14, spread = 140, className }: { count?: number; spread?: number; className?: string }) {
  const coins = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const d = spread * (0.55 + Math.random() * 0.5);
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: (Math.random() - 0.5) * 720, delay: i * 0.035 + Math.random() * 0.08, s: 0.7 + Math.random() * 0.5 };
  }), [count, spread]);
  return (
    <span className={`fx-coins${className ? ` ${className}` : ''}`} aria-hidden>
      {coins.map((c, i) => (
        <i key={i} style={{ '--dx': `${c.dx}px`, '--dy': `${c.dy}px`, '--r': `${c.r}deg`, '--s': c.s, animationDelay: `${c.delay}s` } as CSSProperties}><CoinArt size={26} /></i>
      ))}
    </span>
  );
}

/**
 * Ouverture du coffre ou du cadeau : l'objet tremble (`phase = 'opening'`, en attendant le serveur),
 * puis s'ouvre, la lumière sort et les pièces jaillissent (`phase = 'open'`). Un toucher ferme.
 */
export function RewardBurst({ kind, phase, title, detail, onClose }: { kind: 'chest' | 'gift'; phase: 'opening' | 'open'; title?: string; detail?: string; onClose: () => void }) {
  useEffect(() => {
    if (phase !== 'open') return;
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [phase, onClose]);
  const open = phase === 'open';
  return (
    <div className={`reward-burst ${phase}`} role="status" aria-live="polite" onClick={onClose}>
      <div className="rb-stage">
        {open && <Rays />}
        {open && <CoinBurst count={16} spread={150} />}
        <span className="rb-art">{kind === 'chest' ? <ChestArt open={open} size={150} /> : <GiftArt open={open} size={150} />}</span>
      </div>
      {open && title && <b className="rb-title">{title}</b>}
      {open && detail && <small className="rb-detail">{detail}</small>}
    </div>
  );
}

/** Petite célébration de victoire (écran de fin) : trophée, rayons et pièces. */
export function VictoryBurst() {
  return (
    <div className="victory-burst" aria-hidden>
      <Rays />
      <CoinBurst count={12} spread={110} />
      <span className="vb-trophy"><TrophyArt size={92} /></span>
    </div>
  );
}
