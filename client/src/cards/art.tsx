/**
 * Coups Fourrés : les illustrations des cartes (affiches de bistrot, aplats, peu de couleurs).
 * Chaque dessin est un SVG 214×122 qui raconte l'effet de la carte d'un coup d'œil.
 * Les 10 premières viennent telles quelles du prototype validé par Sam (CFCartes), « Tournée du
 * patron » du prototype de plateau ; les autres sont dessinées dans le même style.
 * Personnages et objets originaux uniquement.
 *
 * Les identifiants SVG (dégradés, motifs, filtres) sont préfixés par l'id de la carte et suffixés
 * par un identifiant d'instance (useId) : une même carte peut être affichée plusieurs fois.
 */
import { useId, type ReactNode } from 'react';

/** Donne un identifiant SVG unique pour cette instance. */
type G = (name: string) => string;
/** Donne la référence `url(#…)` correspondante. */
type U = (name: string) => string;

const SLAB = "'Alfa Slab One', 'Rockwell', serif";

// ------------------------------------------------------------------ petites pièces réutilisées

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};

/** Un dé vu de face (crème, points sombres ; le 1 et le 4 en rouge comme au comptoir). */
function Die({ x, y, s, v, rot = 0, fill = '#fbf6e9', pip, opacity, filter }: {
  x: number; y: number; s: number; v: number; rot?: number; fill?: string; pip?: string; opacity?: number; filter?: string;
}) {
  const c = pip ?? '#2a1d12';
  return (
    <g transform={rot ? `rotate(${rot} ${x + s / 2} ${y + s / 2})` : undefined} opacity={opacity} filter={filter}>
      <rect x={x} y={y} width={s} height={s} rx={s * 0.21} fill={fill} />
      {PIPS[v].map(([a, b], i) => <circle key={i} cx={x + a * s} cy={y + b * s} r={s * 0.095} fill={c} />)}
    </g>
  );
}

/** Petite étoile à quatre branches (éclat). */
const Spark = ({ x, y, r = 7, fill = '#ffd36b' }: { x: number; y: number; r?: number; fill?: string }) => (
  <path d={`M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28}Z`} fill={fill} />
);

/** Fond en dégradé radial (2 ou 3 teintes). */
function Radial({ g, u, c, cx = '50%', cy = '50%', r = '70%' }: { g: G; u: U; c: string[]; cx?: string; cy?: string; r?: string }) {
  return (
    <>
      <defs>
        <radialGradient id={g('bg')} cx={cx} cy={cy} r={r}>
          {c.map((col, i) => <stop key={i} offset={c.length === 1 ? 0 : i / (c.length - 1)} stopColor={col} />)}
        </radialGradient>
      </defs>
      <rect width="214" height="122" fill={u('bg')} />
    </>
  );
}

/** Fond en dégradé vertical. */
function Linear({ g, u, c }: { g: G; u: U; c: string[] }) {
  return (
    <>
      <defs>
        <linearGradient id={g('bg')} x1="0" y1="0" x2="0" y2="1">
          {c.map((col, i) => <stop key={i} offset={i / (c.length - 1)} stopColor={col} />)}
        </linearGradient>
      </defs>
      <rect width="214" height="122" fill={u('bg')} />
    </>
  );
}

/** Demi de bière (bas du verre en x, y ; largeur w, hauteur h). */
function Beer({ x, y, w = 22, h = 28, rot = 0 }: { x: number; y: number; w?: number; h?: number; rot?: number }) {
  const t = y - h;
  return (
    <g transform={rot ? `rotate(${rot} ${x + w / 2} ${y})` : undefined}>
      <path d={`M${x - 1} ${t + 4} L${x + 1.5} ${y} L${x + w - 1.5} ${y} L${x + w + 1} ${t + 4}Z`} fill="#ffc23d" />
      <path d={`M${x - 2} ${t + 1} Q${x + w / 2} ${t - 7} ${x + w + 2} ${t + 1} L${x + w + 2} ${t + 7} L${x - 2} ${t + 7}Z`} fill="#fffaf0" />
      <rect x={x + 4} y={t + 10} width="3" height={h - 14} rx="1.5" fill="#fff" opacity=".45" />
    </g>
  );
}

/** Verre de vin rouge sur pied. */
function Wine({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>
      <path d={`M${x - 11} ${y - 30} Q${x - 12} ${y - 14} ${x} ${y - 12} Q${x + 12} ${y - 14} ${x + 11} ${y - 30}Z`} fill="#fbf6e9" opacity=".5" />
      <path d={`M${x - 11.5} ${y - 22} Q${x - 11} ${y - 14} ${x} ${y - 12} Q${x + 11} ${y - 14} ${x + 11.5} ${y - 22}Z`} fill="#8e1f2c" />
      <rect x={x - 1.2} y={y - 13} width="2.4" height="11" fill="#fbf6e9" />
      <ellipse cx={x} cy={y - 1.5} rx="7" ry="2" fill="#fbf6e9" />
    </g>
  );
}

/** Comptoir en bois au bas de l'image (dessus clair à la hauteur y). */
const Counter = ({ y = 101, dark = '#5a3418', top = '#c99560' }: { y?: number; dark?: string; top?: string }) => (
  <>
    <rect x="0" y={y + 3} width="214" height={122 - y - 3} fill={dark} />
    <rect x="0" y={y} width="214" height="5" fill={top} />
  </>
);

/** Petite carte à jouer (dos ou face colorée). */
function MiniCardShape({ x, y, w = 26, h = 36, rot = 0, fill, edge = '#f1cc7d', children }: {
  x: number; y: number; w?: number; h?: number; rot?: number; fill: string; edge?: string; children?: ReactNode;
}) {
  return (
    <g transform={rot ? `rotate(${rot} ${x + w / 2} ${y + h / 2})` : undefined}>
      <rect x={x} y={y} width={w} height={h} rx={w * 0.14} fill={fill} stroke={edge} strokeWidth="2" />
      {children}
    </g>
  );
}

// ------------------------------------------------------------------ les dessins

const ART: Record<string, (g: G, u: U) => ReactNode> = {
  // ================================================================ Prototype validé (CFCartes, CFPlateau)

  patron: (g, u) => (
    <>
    <defs><radialGradient id={g('bg')} cx="50%" cy="35%" r="70%"><stop offset="0" stopColor="#e9b45a" /><stop offset=".55" stopColor="#7a4a1c" /><stop offset="1" stopColor="#2b1708" /></radialGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <g opacity=".55"><rect x="14" y="16" width="186" height="3" fill="#3a2410" /><rect x="20" y="0" width="9" height="16" rx="2" fill="#2f7a55" /><rect x="34" y="4" width="7" height="12" rx="2" fill="#c8312b" /><rect x="160" y="2" width="9" height="14" rx="2" fill="#d4ad2f" /><rect x="174" y="5" width="7" height="11" rx="2" fill="#5a3b85" /><rect x="186" y="0" width="9" height="16" rx="2" fill="#2f7a55" /></g>
    <path d="M58 122 Q60 84 107 78 Q154 84 156 122Z" fill="#fbf6e9" />
    <path d="M66 122 Q68 90 94 82 L107 104 L120 82 Q146 90 148 122Z" fill="#1d1712" />
    <path d="M95 80 L107 86 L95 92Z M119 80 L107 86 L119 92Z" fill="#c8312b" /><circle cx="107" cy="86" r="3" fill="#8e1f2c" />
    <rect x="100" y="66" width="14" height="14" fill="#e6b088" />
    <ellipse cx="85" cy="54" rx="5" ry="7" fill="#e6b088" /><ellipse cx="129" cy="54" rx="5" ry="7" fill="#e6b088" />
    <ellipse cx="107" cy="50" rx="22" ry="25" fill="#f0c39a" />
    <path d="M86 46 Q86 30 96 27" fill="none" stroke="#5a3a20" strokeWidth="5" strokeLinecap="round" /><path d="M128 46 Q128 30 118 27" fill="none" stroke="#5a3a20" strokeWidth="5" strokeLinecap="round" />
    <path d="M95 42 Q99 39 103 42 M111 42 Q115 39 119 42" fill="none" stroke="#3a2414" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="99" cy="48" r="2.2" fill="#1d1712" /><circle cx="115" cy="48" r="2.2" fill="#1d1712" />
    <path d="M107 50 Q104 57 107 59" fill="none" stroke="#c98b62" strokeWidth="2" strokeLinecap="round" />
    <path d="M84 64 Q95 54 107 61 Q119 54 130 64 Q122 70 107 65 Q92 70 84 64Z" fill="#3a2414" />
    <rect x="0" y="104" width="214" height="18" fill="#5a3418" /><rect x="0" y="101" width="214" height="5" fill="#c99560" />
    <rect x="163" y="66" width="9" height="36" rx="2" fill="#d4ad2f" /><rect x="157" y="58" width="21" height="11" rx="4" fill="#b8892c" /><rect x="165" y="44" width="5" height="16" rx="2" fill="#2a1a08" />
    <path d="M30 76 L28 101 L46 101 L44 76Z" fill="#ffd36b" opacity=".9" /><path d="M28 72 Q37 66 46 72 L46 79 L28 79Z" fill="#fff8e8" />
    </>
  ),
  josiane: (g, u) => (
    <>
    <defs><linearGradient id={g('bg')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7cc4a2" /><stop offset="1" stopColor="#1f5a40" /></linearGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <g fill="#ffffff" opacity=".18"><circle cx="30" cy="24" r="14" /><circle cx="184" cy="96" r="20" /></g>
    <path d="M58 122 Q60 86 92 80 Q124 86 128 122Z" fill="#8e1f2c" />
    <path d="M74 122 L78 96 L106 96 L110 122Z" fill="#fbf6e9" />
    <path d="M112 92 Q132 72 150 46" fill="none" stroke="#f0c39a" strokeWidth="11" strokeLinecap="round" />
    <rect x="86" y="66" width="12" height="14" fill="#e6b088" />
    <ellipse cx="92" cy="52" rx="17" ry="19" fill="#f0c39a" />
    <path d="M74 50 Q74 30 92 30 Q110 30 110 50 Q104 38 92 39 Q80 38 74 50Z" fill="#8a4a2a" />
    <circle cx="92" cy="26" r="10" fill="#8a4a2a" />
    <circle cx="86" cy="52" r="2" fill="#1d1712" /><circle cx="99" cy="52" r="2" fill="#1d1712" />
    <path d="M86 60 Q92 65 99 60" fill="none" stroke="#a8473a" strokeWidth="2" strokeLinecap="round" />
    <circle cx="82" cy="58" r="3" fill="#ef9a8a" opacity=".6" /><circle cx="103" cy="58" r="3" fill="#ef9a8a" opacity=".6" />
    <ellipse cx="156" cy="42" rx="34" ry="6" fill="#cfd6d9" /><ellipse cx="156" cy="40" rx="34" ry="5" fill="#eef2f3" />
    <path d="M134 18 L136 38 L148 38 L150 18Z" fill="#ffd36b" /><path d="M133 14 Q142 9 151 14 L151 20 L133 20Z" fill="#fffaf0" />
    <path d="M156 22 L158 38 L168 38 L170 22Z" fill="#a3263a" />
    <path d="M174 16 L176 38 L188 38 L190 16Z" fill="#ffd36b" /><path d="M173 12 Q182 7 191 12 L191 18 L173 18Z" fill="#fffaf0" />
    </>
  ),
  'cul-sec': (g, u) => (
    <>
    <defs><radialGradient id={g('bg')} cx="50%" cy="50%" r="70%"><stop offset="0" stopColor="#f06a5a" /><stop offset="1" stopColor="#4a0d18" /></radialGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <g stroke="#ffd9a8" strokeWidth="3" strokeLinecap="round" opacity=".6"><path d="M30 30 L52 40" /><path d="M24 60 L48 60" /><path d="M30 90 L52 80" /></g>
    <g transform="rotate(-38 110 62)">
    <path d="M84 30 L90 100 L130 100 L136 30Z" fill="#fff4dc" opacity=".35" />
    <path d="M86 52 L90 100 L130 100 L134 52Z" fill="#ffc23d" />
    <path d="M84 30 L90 100 L130 100 L136 30" fill="none" stroke="#fffaf0" strokeWidth="4" strokeLinejoin="round" />
    <path d="M84 50 Q110 40 136 50 L136 56 Q110 48 84 56Z" fill="#fffaf0" />
    <rect x="96" y="62" width="4" height="30" rx="2" fill="#fff" opacity=".5" />
    </g>
    <g fill="#ffc23d"><circle cx="160" cy="26" r="6" /><circle cx="176" cy="40" r="4" /><circle cx="150" cy="12" r="3.5" /><circle cx="186" cy="22" r="3" /></g>
    <g fill="#fffaf0"><circle cx="168" cy="16" r="5" /><circle cx="182" cy="52" r="3" /></g>
    <text x="178" y="104" fontFamily={SLAB} fontSize="22" fill="#fffaf0" textAnchor="middle">+1</text>
    </>
  ),
  'tete-tourne': (g, u) => (
    <>
    <defs><radialGradient id={g('bg')} cx="50%" cy="50%" r="75%"><stop offset="0" stopColor="#c94a5a" /><stop offset="1" stopColor="#3a0a14" /></radialGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <g fill="none" stroke="#ffd9e0" strokeWidth="2.5" opacity=".35"><path d="M107 61 m-50 0 a50 40 0 1 0 100 0 a50 40 0 1 0 -100 0" /><path d="M107 61 m-70 0 a70 54 0 1 0 140 0 a70 54 0 1 0 -140 0" /></g>
    <g transform="rotate(-12 76 62)"><rect x="50" y="36" width="52" height="52" rx="11" fill="#fbf6e9" /><g fill="#2a1d12"><circle cx="64" cy="50" r="5" /><circle cx="88" cy="50" r="5" /><circle cx="64" cy="74" r="5" /><circle cx="88" cy="74" r="5" /></g></g>
    <g transform="rotate(14 146 62)" opacity=".92"><rect x="120" y="36" width="52" height="52" rx="11" fill="#fbf6e9" /><g fill="#2a1d12"><circle cx="134" cy="50" r="5" /><circle cx="146" cy="62" r="5" /><circle cx="158" cy="74" r="5" /></g></g>
    <path d="M84 24 Q110 4 138 24" fill="none" stroke="#ffd36b" strokeWidth="4" strokeLinecap="round" /><path d="M132 14 L139 25 L126 27Z" fill="#ffd36b" />
    <path d="M138 100 Q110 120 84 100" fill="none" stroke="#ffd36b" strokeWidth="4" strokeLinecap="round" /><path d="M90 110 L83 99 L96 97Z" fill="#ffd36b" />
    <g fill="#ffd36b"><path d="M28 26 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" /><path d="M190 94 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /></g>
    </>
  ),
  'double-tournee': (g, u) => (
    <>
    <defs><radialGradient id={g('bg')} cx="50%" cy="40%" r="70%"><stop offset="0" stopColor="#ffb35c" /><stop offset=".5" stopColor="#b8303e" /><stop offset="1" stopColor="#3a0a14" /></radialGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <g fill="#fff3c4" opacity=".28"><path d="M107 40 L60 -10 L90 -10Z" /><path d="M107 40 L150 -10 L180 -10Z" /><path d="M107 40 L214 20 L214 50Z" /><path d="M107 40 L0 20 L0 50Z" /></g>
    <g transform="rotate(-16 80 74)"><rect x="56" y="44" width="44" height="58" rx="6" fill="#ffc23d" /><path d="M54 40 Q78 28 102 40 L102 50 L54 50Z" fill="#fffaf0" /><path d="M100 56 Q118 56 118 72 Q118 88 100 88" fill="none" stroke="#fff4dc" strokeWidth="7" /><rect x="64" y="56" width="5" height="38" rx="2" fill="#fff" opacity=".45" /></g>
    <g transform="rotate(16 134 74)"><rect x="114" y="44" width="44" height="58" rx="6" fill="#ffc23d" /><path d="M112 40 Q136 28 160 40 L160 50 L112 50Z" fill="#fffaf0" /><path d="M114 56 Q96 56 96 72 Q96 88 114 88" fill="none" stroke="#fff4dc" strokeWidth="7" /><rect x="146" y="56" width="5" height="38" rx="2" fill="#fff" opacity=".45" /></g>
    <g fill="#fffaf0"><circle cx="107" cy="30" r="5" /><circle cx="96" cy="20" r="3" /><circle cx="120" cy="18" r="3.5" /></g>
    <g transform="translate(176 26)"><path d="M0 -20 L6 -7 L20 -6 L9 3 L13 17 L0 9 L-13 17 L-9 3 L-20 -6 L-6 -7Z" fill="#ffd36b" /><text x="0" y="6" fontFamily={SLAB} fontSize="13" fill="#4a0d18" textAnchor="middle">x2</text></g>
    </>
  ),
  leurre: (g, u) => (
    <>
    <defs><radialGradient id={g('bg')} cx="50%" cy="45%" r="70%"><stop offset="0" stopColor="#9a7ad0" /><stop offset="1" stopColor="#1c1030" /></radialGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <ellipse cx="107" cy="112" rx="60" ry="8" fill="#000" opacity=".35" />
    <rect x="70" y="26" width="74" height="74" rx="15" fill="#fbf6e9" />
    <circle cx="88" cy="86" r="5" fill="#2a1d12" /><circle cx="126" cy="86" r="5" fill="#2a1d12" />
    <g fill="none" stroke="#1d1712" strokeWidth="4"><circle cx="92" cy="52" r="11" /><circle cx="122" cy="52" r="11" /><path d="M103 52 L111 52" /><path d="M81 50 L70 46 M133 50 L144 46" /></g>
    <circle cx="92" cy="53" r="3.5" fill="#1d1712" /><circle cx="122" cy="53" r="3.5" fill="#1d1712" />
    <path d="M84 37 Q92 32 100 37 M114 37 Q122 32 130 37" fill="none" stroke="#1d1712" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M107 56 Q100 70 104 74 Q110 76 114 72" fill="#e7a08a" stroke="#b5634f" strokeWidth="2" />
    <path d="M86 76 Q97 68 107 74 Q117 68 128 76 Q118 82 107 77 Q96 82 86 76Z" fill="#1d1712" />
    <g fill="#ffd36b" fontFamily={SLAB} fontSize="20" textAnchor="middle"><text x="34" y="44">?</text><text x="182" y="40">?</text><text x="176" y="96" fontSize="14">?</text></g>
    </>
  ),
  fouine: (g, u) => (
    <>
    <defs><linearGradient id={g('bg')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b2a5c" /><stop offset="1" stopColor="#140b24" /></linearGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <path d="M120 0 L214 0 L214 122 L150 122Z" fill="#ffe9a8" opacity=".08" />
    <g transform="rotate(8 150 70)"><rect x="118" y="20" width="70" height="98" rx="8" fill="#5a3b85" stroke="#a99ad0" strokeWidth="3" /><text x="153" y="80" fontFamily={SLAB} fontSize="34" fill="#a99ad0" textAnchor="middle">?</text></g>
    <path d="M60 122 Q64 82 92 76 Q112 78 118 96 L118 122Z" fill="#8a5a2e" />
    <path d="M80 122 Q82 96 98 92 Q110 96 112 122Z" fill="#f3e2c4" />
    <ellipse cx="96" cy="58" rx="30" ry="22" fill="#8a5a2e" />
    <path d="M100 60 Q128 58 136 66 Q128 74 104 72Z" fill="#8a5a2e" />
    <path d="M98 64 Q122 64 132 68 Q124 74 102 74Z" fill="#f3e2c4" />
    <circle cx="136" cy="66" r="4" fill="#1d1712" />
    <circle cx="76" cy="40" r="9" fill="#8a5a2e" /><circle cx="76" cy="40" r="4.5" fill="#d9a07a" />
    <circle cx="108" cy="52" r="5" fill="#1d1712" /><circle cx="109.5" cy="50.5" r="1.6" fill="#fff" />
    <path d="M100 44 L116 46" stroke="#4a2c12" strokeWidth="3" strokeLinecap="round" />
    <g transform="rotate(-20 44 70)"><circle cx="44" cy="58" r="18" fill="#cfe9ff" fillOpacity=".25" stroke="#d4ad2f" strokeWidth="5" /><rect x="40" y="76" width="8" height="30" rx="4" fill="#5a3418" /><path d="M34 52 Q38 46 46 46" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".7" /></g>
    </>
  ),
  'bon-numero': (g, u) => (
    <>
    <defs><radialGradient id={g('bg')} cx="50%" cy="55%" r="70%"><stop offset="0" stopColor="#5a86ff" /><stop offset="1" stopColor="#0b1840" /></radialGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <circle cx="107" cy="64" r="48" fill="none" stroke="#e3c060" strokeWidth="2" strokeDasharray="3 6" opacity=".7" />
    <g fontFamily={SLAB} fontSize="15" fill="#e3c060" textAnchor="middle"><text x="107" y="20">1</text><text x="150" y="44">2</text><text x="150" y="98">3</text><text x="64" y="98">5</text><text x="64" y="44">6</text></g>
    <rect x="83" y="42" width="48" height="48" rx="10" fill="#fbf6e9" /><g fill="#c8312b"><circle cx="96" cy="55" r="4.5" /><circle cx="118" cy="55" r="4.5" /><circle cx="96" cy="77" r="4.5" /><circle cx="118" cy="77" r="4.5" /></g>
    <path d="M132 34 Q150 20 172 22 L190 24 Q196 26 192 31 L170 32 L182 36 Q188 40 182 43 L160 42 Q148 46 140 44Z" fill="#f0c39a" stroke="#c98b62" strokeWidth="1.5" />
    <path d="M120 40 L136 36" stroke="#f0c39a" strokeWidth="8" strokeLinecap="round" />
    <g fill="#ffd36b"><path d="M60 22 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" /><path d="M168 98 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" /></g>
    </>
  ),
  'reaction-chaine': (g, u) => (
    <>
    <defs><linearGradient id={g('bg')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a64d8" /><stop offset="1" stopColor="#0b1840" /></linearGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <rect x="0" y="100" width="214" height="22" fill="#0a1433" opacity=".6" />
    <g stroke="#0b1840" strokeWidth="2">
    <g transform="rotate(-62 34 100)"><rect x="26" y="52" width="18" height="48" rx="3" fill="#fbf6e9" /></g>
    <g transform="rotate(-48 62 100)"><rect x="54" y="52" width="18" height="48" rx="3" fill="#fbf6e9" /></g>
    <g transform="rotate(-32 92 100)"><rect x="84" y="52" width="18" height="48" rx="3" fill="#fbf6e9" /></g>
    <g transform="rotate(-16 122 100)"><rect x="114" y="52" width="18" height="48" rx="3" fill="#fbf6e9" /></g>
    <rect x="146" y="52" width="18" height="48" rx="3" fill="#fbf6e9" />
    <rect x="176" y="52" width="18" height="48" rx="3" fill="#e3c060" />
    </g>
    <g fill="#2a1d12"><circle cx="155" cy="64" r="2.6" /><circle cx="155" cy="88" r="2.6" /><circle cx="185" cy="64" r="2.6" /><circle cx="185" cy="76" r="2.6" /><circle cx="185" cy="88" r="2.6" /></g>
    <g fill="none" stroke="#e3c060" strokeWidth="3" strokeLinecap="round"><path d="M40 28 Q60 14 80 26" /><path d="M92 22 Q112 8 132 22" /></g>
    <path d="M128 14 L134 23 L123 25Z" fill="#e3c060" />
    </>
  ),
  'retournement-veste': (g, u) => (
    <>
    <defs><radialGradient id={g('bg')} cx="50%" cy="30%" r="80%"><stop offset="0" stopColor="#c7a8ff" /><stop offset=".45" stopColor="#4a2c7a" /><stop offset="1" stopColor="#120820" /></radialGradient><linearGradient id={g('li')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd36b" /><stop offset="1" stopColor="#d4ad2f" /></linearGradient></defs>
    <rect width="214" height="122" fill={u('bg')} />
    <path d="M80 0 L134 0 L170 122 L44 122Z" fill="#fff6d0" opacity=".1" />
    <g transform="rotate(-8 80 66)"><path d="M58 26 L80 18 L88 34 L80 110 L46 110 L42 50Z" fill="#26183f" /><path d="M80 18 L88 34 L74 62 L66 34Z" fill="#3b2a5c" /><circle cx="70" cy="78" r="2.5" fill="#d4ad2f" /><circle cx="70" cy="92" r="2.5" fill="#d4ad2f" /></g>
    <g transform="rotate(10 140 66)"><path d="M156 26 L134 18 L126 34 L134 110 L168 110 L172 50Z" fill={u('li')} /><path d="M134 18 L126 34 L140 62 L148 34Z" fill="#b8892c" /><g stroke="#8e1f2c" strokeWidth="1.5" opacity=".55"><path d="M140 50 L164 48" /><path d="M140 66 L166 64" /><path d="M140 82 L166 80" /><path d="M140 98 L166 96" /></g></g>
    <path d="M84 16 Q107 -2 130 16" fill="none" stroke="#fff6d0" strokeWidth="4" strokeLinecap="round" /><path d="M124 6 L132 17 L119 19Z" fill="#fff6d0" />
    <path d="M130 116 Q107 132 84 112" fill="none" stroke="#fff6d0" strokeWidth="4" strokeLinecap="round" />
    <g fill="#fff6d0"><path d="M24 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" /><path d="M192 84 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" /><circle cx="190" cy="26" r="2.5" /><circle cx="30" cy="96" r="2" /></g>
    </>
  ),
  'tournee-patron': (g, u) => (
    <>
    <defs><radialGradient id={g('bg')} cx="50%" cy="40%" r="70%"><stop offset="0" stopColor="#8fd3b0" /><stop offset="1" stopColor="#0f3523" /></radialGradient></defs><rect width="214" height="122" fill={u('bg')} /><ellipse cx="107" cy="92" rx="80" ry="12" fill="#cfd6d9" /><ellipse cx="107" cy="89" rx="80" ry="10" fill="#eef2f3" /><g><path d="M52 46 L55 88 L75 88 L78 46Z" fill="#ffc23d" /><path d="M50 40 Q64 32 80 40 L80 50 L50 50Z" fill="#fffaf0" /><path d="M96 40 L99 88 L119 88 L122 40Z" fill="#ffc23d" /><path d="M94 34 Q108 26 124 34 L124 44 L94 44Z" fill="#fffaf0" /><path d="M140 46 L143 88 L163 88 L166 46Z" fill="#ffc23d" /><path d="M138 40 Q152 32 168 40 L168 50 L138 50Z" fill="#fffaf0" /></g><text x="186" y="34" fontFamily={SLAB} fontSize="20" fill="#fffaf0" textAnchor="middle">+2</text>
    </>
  ),

  // ================================================================ Les Habitués (nouveaux)

  // Vieil habitué à casquette qui compte jusqu'à trois sur ses doigts ; une suite 1-2-3 sur le zinc.
  'vieux-marcel': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#a8dcbd', '#3f8a65', '#123e2b']} cx="62%" cy="30%" r="80%" />
      <g fill="#ffffff" opacity=".14"><circle cx="150" cy="30" r="34" /></g>
      <path d="M34 122 Q38 86 82 80 Q124 86 130 122Z" fill="#6b5a48" />
      <path d="M70 84 L82 100 L94 84Z" fill="#c8312b" />
      <path d="M116 98 Q130 84 142 68" fill="none" stroke="#6b5a48" strokeWidth="13" strokeLinecap="round" />
      <rect x="76" y="66" width="13" height="16" fill="#e6b088" />
      <ellipse cx="65" cy="56" rx="4.5" ry="6.5" fill="#e6b088" />
      <ellipse cx="83" cy="54" rx="19" ry="21" fill="#f0c39a" />
      <path d="M62 46 Q63 30 84 29 Q103 30 105 43 L105 47 L62 48Z" fill="#4a4038" />
      <path d="M99 42 Q117 41 121 48 L101 49Z" fill="#2e2620" />
      <path d="M62 46 L105 45" stroke="#2e2620" strokeWidth="2" />
      <path d="M72 51 Q76 47 81 50 M87 50 Q92 47 96 51" fill="none" stroke="#f4efe6" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="77" cy="55" r="1.9" fill="#1d1712" /><circle cx="92" cy="55" r="1.9" fill="#1d1712" />
      <path d="M86 56 Q83 63 88 64" fill="none" stroke="#c98b62" strokeWidth="2" strokeLinecap="round" />
      <path d="M72 67 Q79 61 86 65 Q93 61 100 67 Q93 72 86 69 Q79 72 72 67Z" fill="#f4efe6" />
      <path d="M68 60 Q70 64 69 68 M100 60 Q99 64 101 67" fill="none" stroke="#d99a72" strokeWidth="1.4" strokeLinecap="round" />
      <g fill="#f0c39a" stroke="#c98b62" strokeWidth="1.2">
        <rect x="136" y="34" width="6" height="24" rx="3" />
        <rect x="143" y="30" width="6" height="28" rx="3" />
        <rect x="150" y="34" width="6" height="24" rx="3" />
        <ellipse cx="146" cy="62" rx="12" ry="10" />
        <ellipse cx="133" cy="60" rx="4" ry="7" transform="rotate(-30 133 60)" />
      </g>
      <g fontFamily={SLAB} fill="#ffd36b" textAnchor="middle">
        <text x="126" y="26" fontSize="13">1</text><text x="146" y="20" fontSize="15">2</text><text x="170" y="26" fontSize="21">3</text>
      </g>
      <Counter />
      <Die x={150} y={82} s={19} v={1} /><Die x={171} y={83} s={19} v={2} /><Die x={192} y={82} s={19} v={3} />
    </>
  ),

  // Silhouette massive accoudée au zinc, sur son tabouret depuis trente ans ; un jeton « −1 ».
  pilier: (g, u) => (
    <>
      <Radial g={g} u={u} c={['#e2bd72', '#7a6230', '#173a28']} cx="40%" cy="30%" r="80%" />
      <rect x="118" y="60" width="96" height="8" fill="#c99560" />
      <rect x="124" y="68" width="90" height="54" fill="#5a3418" />
      <g stroke="#3f230f" strokeWidth="2"><path d="M146 74 L146 118" /><path d="M176 74 L176 118" /><path d="M206 74 L206 118" /></g>
      <path d="M52 96 L48 122 M100 96 L104 122 M76 98 L76 122" stroke="#d4ad2f" strokeWidth="4" strokeLinecap="round" />
      <path d="M56 112 L98 112" stroke="#d4ad2f" strokeWidth="3" />
      <path d="M58 92 L52 120 L70 120 L76 94Z" fill="#14201a" />
      <ellipse cx="76" cy="94" rx="28" ry="6" fill="#c8312b" />
      <path d="M44 94 Q34 58 66 42 Q96 30 118 50 L132 56 Q140 62 132 66 L110 66 Q114 82 112 94Z" fill="#14201a" />
      <path d="M44 92 Q36 60 64 44" fill="none" stroke="#f1cc7d" strokeWidth="2.5" opacity=".7" strokeLinecap="round" />
      <path d="M96 56 Q118 56 138 58 L140 64 L100 66Z" fill="#14201a" />
      <circle cx="104" cy="32" r="15" fill="#14201a" />
      <path d="M88 24 Q100 12 118 20 L118 24 L88 26Z" fill="#14201a" /><circle cx="103" cy="14" r="3" fill="#14201a" />
      <path d="M117 30 Q122 33 119 37" fill="none" stroke="#f1cc7d" strokeWidth="2" opacity=".7" strokeLinecap="round" />
      <Beer x={138} y={60} w={13} h={20} />
      <g transform="translate(34 30)">
        <circle r="18" fill="#8a6418" /><circle r="15" fill="#d4ad2f" /><circle r="11.5" fill="none" stroke="#ffe9a8" strokeWidth="1.5" opacity=".7" />
        <text y="6" fontFamily={SLAB} fontSize="15" fill="#2a1a05" textAnchor="middle">−1</text>
      </g>
    </>
  ),

  // Le costaud bras croisés devant la porte ; un piège refoulé à l'entrée.
  videur: (g, u) => (
    <>
      <Linear g={g} u={u} c={['#2c6a4c', '#0b1f15']} />
      <circle cx="107" cy="0" r="40" fill="#ffd36b" opacity=".12" />
      <rect x="68" y="6" width="78" height="120" fill="#5a3418" stroke="#c99560" strokeWidth="4" />
      <circle cx="134" cy="24" r="8" fill="#ffd36b" opacity=".9" /><circle cx="134" cy="24" r="8" fill="none" stroke="#c99560" strokeWidth="2.5" />
      <circle cx="140" cy="76" r="3" fill="#d4ad2f" />
      <path d="M44 122 Q42 78 78 70 L136 70 Q172 78 170 122Z" fill="#1d1712" />
      <rect x="96" y="56" width="22" height="18" fill="#d9a07a" />
      <ellipse cx="107" cy="44" rx="17" ry="19" fill="#e6b088" />
      <ellipse cx="90" cy="46" rx="3.5" ry="5.5" fill="#d9a07a" /><ellipse cx="124" cy="46" rx="3.5" ry="5.5" fill="#d9a07a" />
      <path d="M92 39 L105 39 L104 47 L93 47Z M109 39 L122 39 L121 47 L110 47Z" fill="#1d1712" />
      <path d="M105 41 L109 41" stroke="#1d1712" strokeWidth="2" />
      <path d="M100 56 L114 56" stroke="#8a4a2a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M58 90 Q106 78 152 96 L150 108 Q106 94 60 104Z" fill="#d9a07a" />
      <path d="M60 106 Q108 116 152 92 L158 102 Q110 126 62 118Z" fill="#e6b088" />
      <path d="M48 84 Q54 98 62 104 L62 118 Q48 112 44 96Z M166 84 Q160 96 154 100 L156 112 Q168 106 170 96Z" fill="#1d1712" />
      <g transform="rotate(-14 30 62)">
        <rect x="15" y="42" width="30" height="42" rx="4" fill="#5a3b85" stroke="#a99ad0" strokeWidth="2" />
        <text x="30" y="71" fontFamily={SLAB} fontSize="18" fill="#a99ad0" textAnchor="middle">?</text>
      </g>
      <path d="M14 46 L46 80 M46 46 L14 80" stroke="#ff5a4a" strokeWidth="5" strokeLinecap="round" />
    </>
  ),

  // Ticket qui sort de la caisse enregistreuse, barré d'un tampon rouge.
  'ticket-caisse': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#8fd3b0', '#2f7a55', '#0f3523']} cx="50%" cy="30%" />
      <path d="M40 122 L52 64 L162 64 L174 122Z" fill="#b8892c" />
      <path d="M40 122 L52 64 L60 64 L50 122Z" fill="#d4ad2f" opacity=".7" />
      <rect x="58" y="44" width="54" height="22" rx="3" fill="#1d1712" />
      <text x="85" y="61" fontFamily={SLAB} fontSize="13" fill="#ffd36b" textAnchor="middle">0,00</text>
      <g fill="#fbf6e9">
        {[0, 1, 2].map((r) => [0, 1, 2, 3, 4, 5].map((c) => (
          <rect key={`${r}-${c}`} x={64 + c * 15 - r * 2} y={74 + r * 12} width="11" height="8" rx="2" />
        )))}
      </g>
      <rect x="36" y="110" width="142" height="12" fill="#8a6418" />
      <rect x="118" y="62" width="40" height="4" rx="2" fill="#1d1712" />
      <path d="M122 64 L122 12 Q122 4 130 4 L154 4 L154 64Z" fill="#fffaf0" />
      <path d="M122 12 Q122 4 130 4 Q124 8 128 14Z" fill="#e8dcc0" />
      <g stroke="#c9bfa8" strokeWidth="2" strokeLinecap="round"><path d="M128 16 L148 16" /><path d="M128 22 L144 22" /><path d="M128 28 L148 28" /><path d="M128 52 L148 52" /><path d="M128 58 L140 58" /></g>
      <g transform="rotate(-14 138 40)">
        <circle cx="138" cy="40" r="11" fill="none" stroke="#c8312b" strokeWidth="3" />
        <path d="M130 48 L146 32" stroke="#c8312b" strokeWidth="3" strokeLinecap="round" />
      </g>
      <Spark x={180} y={26} r={8} /><Spark x={30} y={34} r={6} fill="#fffaf0" />
    </>
  ),

  // Le rideau de fer descend sur la devanture : l'habitué reste dehors.
  fermeture: (g, u) => (
    <>
      <Linear g={g} u={u} c={['#2f7a55', '#0f3523']} />
      <rect x="26" y="26" width="162" height="96" fill="#ffd36b" />
      <rect x="26" y="26" width="162" height="96" fill="#fff3c4" opacity=".3" />
      <path d="M92 122 Q94 104 107 102 Q120 104 122 122Z" fill="#1d3a2a" />
      <circle cx="107" cy="96" r="8" fill="#1d3a2a" />
      <path d="M97 92 Q99 84 108 84 Q117 85 117 90 L121 91 L97 93Z" fill="#1d3a2a" />
      <rect x="26" y="26" width="162" height="62" fill="#9aa6ab" />
      <g stroke="#6f7b80" strokeWidth="2">
        {[33, 40, 47, 54, 61, 68, 75, 82].map((y) => <path key={y} d={`M26 ${y} L188 ${y}`} />)}
      </g>
      <rect x="26" y="84" width="162" height="7" fill="#4f5a5e" />
      <rect x="98" y="88" width="18" height="6" rx="3" fill="#2a3134" />
      <g>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <path key={i} d={`M${18 + i * 22.25} 6 L${40.25 + i * 22.25} 6 L${40.25 + i * 22.25} 22 Q${29 + i * 22.25} 30 ${18 + i * 22.25} 22Z`} fill={i % 2 ? '#fbf6e9' : '#c8312b'} />
        ))}
      </g>
      <rect x="14" y="2" width="186" height="5" rx="2" fill="#5a3418" />
      <g fill="#ffd36b">
        <path d="M12 40 L12 72 L6 72 L16 86 L26 72 L20 72 L20 40Z" transform="translate(-4 0)" />
        <path d="M194 40 L194 72 L188 72 L198 86 L208 72 L202 72 L202 40Z" transform="translate(0 0)" />
      </g>
    </>
  ),

  // L'addition, et la salière qui en rajoute une pincée : « +1 ».
  'note-salee': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#8fd3b0', '#2f7a55', '#0f3523']} cx="35%" cy="40%" />
      <g transform="rotate(-6 84 64)">
        <path d="M50 12 L118 12 L118 110 L112 104 L106 110 L100 104 L94 110 L88 104 L82 110 L76 104 L70 110 L64 104 L58 110 L50 104Z" fill="#fffaf0" />
        <text x="84" y="27" fontFamily={SLAB} fontSize="10" fill="#0f3523" textAnchor="middle">ADDITION</text>
        <g stroke="#c9bfa8" strokeWidth="2.4" strokeLinecap="round">
          <path d="M58 38 L92 38" /><path d="M102 38 L110 38" />
          <path d="M58 48 L86 48" /><path d="M102 48 L110 48" />
          <path d="M58 58 L94 58" /><path d="M102 58 L110 58" />
        </g>
        <path d="M58 68 L110 68" stroke="#0f3523" strokeWidth="2" strokeDasharray="3 3" />
        <text x="84" y="95" fontFamily={SLAB} fontSize="22" fill="#c8312b" textAnchor="middle">+1</text>
      </g>
      <g fill="#ffffff">
        <rect x="122" y="40" width="3" height="3" /><rect x="128" y="48" width="2.5" height="2.5" /><rect x="118" y="54" width="3" height="3" />
        <rect x="126" y="60" width="2.5" height="2.5" /><rect x="114" y="66" width="2.5" height="2.5" /><rect x="120" y="74" width="3" height="3" />
      </g>
      <g transform="rotate(-38 162 64)">
        <rect x="142" y="42" width="40" height="62" rx="12" fill="#eef2f3" />
        <rect x="142" y="70" width="40" height="34" rx="12" fill="#ffffff" />
        <rect x="142" y="42" width="40" height="62" rx="12" fill="none" stroke="#b9c2c6" strokeWidth="2" />
        <rect x="140" y="28" width="44" height="18" rx="7" fill="#b9c2c6" />
        <g fill="#6f7b80"><circle cx="152" cy="34" r="1.8" /><circle cx="162" cy="32" r="1.8" /><circle cx="172" cy="34" r="1.8" /><circle cx="157" cy="39" r="1.8" /><circle cx="167" cy="39" r="1.8" /></g>
        <text x="162" y="94" fontFamily={SLAB} fontSize="16" fill="#2f7a55" textAnchor="middle">S</text>
      </g>
    </>
  ),

  // ================================================================ L'Ivresse (nouveaux)

  // Deux mains qui topent au-dessus des dés posés sur le comptoir.
  'pari-comptoir': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#f6826a', '#b8303e', '#4a0d18']} cx="50%" cy="25%" r="80%" />
      <g fill="#fff3c4" opacity=".3">
        <path d="M107 28 L80 -6 L96 -6Z" /><path d="M107 28 L118 -6 L134 -6Z" /><path d="M107 28 L170 4 L176 18Z" /><path d="M107 28 L38 4 L32 18Z" />
      </g>
      <path d="M107 8 L113 20 L126 18 L118 28 L126 38 L113 36 L107 48 L101 36 L88 38 L96 28 L88 18 L101 20Z" fill="#ffd36b" />
      <path d="M-8 100 L86 44" stroke="#fbf6e9" strokeWidth="17" strokeLinecap="round" />
      <path d="M222 100 L128 44" stroke="#2c54c2" strokeWidth="17" strokeLinecap="round" />
      <path d="M-8 100 L86 44" stroke="#c8312b" strokeWidth="17" strokeDasharray="5 9" opacity=".8" />
      <g transform="rotate(32 94 34)"><rect x="84" y="18" width="20" height="30" rx="9" fill="#f0c39a" /><rect x="80" y="30" width="8" height="14" rx="4" fill="#f0c39a" /></g>
      <g transform="rotate(-32 120 34)"><rect x="110" y="18" width="20" height="30" rx="9" fill="#e6b088" /><rect x="126" y="30" width="8" height="14" rx="4" fill="#e6b088" /></g>
      <Counter y={100} dark="#3a1a0e" top="#8a5a2e" />
      <Die x={70} y={78} s={22} v={4} rot={-8} pip="#2a1d12" /><Die x={96} y={78} s={22} v={2} /><Die x={122} y={78} s={22} v={1} rot={10} />
      <text x="186" y="78" fontFamily={SLAB} fontSize="20" fill="#fffaf0" textAnchor="middle">±2</text>
    </>
  ),

  // Un dé qui roule sous la table… et une main qui le rattrape.
  'de-sous-table': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#c94a5a', '#7a1a2a', '#3a0a14']} cx="55%" cy="70%" />
      <rect x="0" y="108" width="214" height="14" fill="#2a0610" opacity=".55" />
      <ellipse cx="107" cy="110" rx="80" ry="6" fill="#000" opacity=".3" />
      <rect x="20" y="28" width="174" height="14" rx="3" fill="#8a5a2e" />
      <rect x="20" y="28" width="174" height="4" rx="2" fill="#c99560" />
      <rect x="34" y="42" width="9" height="70" fill="#5a3418" /><rect x="171" y="42" width="9" height="70" fill="#5a3418" />
      <path d="M14 28 L200 28 L196 46 Q180 52 164 46 Q148 52 132 46 Q116 52 100 46 Q84 52 68 46 Q52 52 36 46 Q24 50 18 46Z" fill="#fbf6e9" />
      <path d="M200 8 Q170 6 152 60 Q140 92 128 96" fill="none" stroke="#ffd36b" strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
      <g stroke="#ffd9e0" strokeWidth="2.5" strokeLinecap="round" opacity=".6"><path d="M150 80 L164 78" /><path d="M150 92 L166 92" /></g>
      <Die x={110} y={78} s={28} v={5} rot={24} />
      <path d="M-6 98 L70 96" stroke="#2c1a3a" strokeWidth="14" strokeLinecap="round" />
      <ellipse cx="80" cy="96" rx="12" ry="8" fill="#f0c39a" />
      <rect x="84" y="90" width="18" height="6" rx="3" fill="#f0c39a" />
      <Spark x={60} y={18} r={7} fill="#ffd36b" />
    </>
  ),

  // Yeux plissés, injectés : les dés deviennent flous.
  'yeux-piquent': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#d0606e', '#7a1a2a', '#3a0a14']} cx="50%" cy="30%" />
      <defs><filter id={g('flou')} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6" /></filter></defs>
      {[60, 154].map((cx) => (
        <g key={cx}>
          <path d={`M${cx - 34} 34 Q${cx} 14 ${cx + 34} 34 Q${cx} 50 ${cx - 34} 34Z`} fill="#fff4ea" />
          <g stroke="#e04a3a" strokeWidth="1.3" strokeLinecap="round"><path d={`M${cx - 28} 34 L${cx - 18} 36`} /><path d={`M${cx + 28} 34 L${cx + 17} 37`} /><path d={`M${cx - 24} 38 L${cx - 16} 37`} /></g>
          <circle cx={cx} cy="37" r="9" fill="#5a3418" /><circle cx={cx} cy="37" r="4" fill="#1d1712" /><circle cx={cx + 2.5} cy="34.5" r="1.6" fill="#fff" />
          <path d={`M${cx - 36} 34 Q${cx} 6 ${cx + 36} 34 Q${cx} 30 ${cx - 36} 34Z`} fill="#e6b088" />
          <path d={`M${cx - 36} 34 Q${cx} 30 ${cx + 36} 34`} fill="none" stroke="#7a3a22" strokeWidth="2.6" strokeLinecap="round" />
          <path d={`M${cx - 30} 18 Q${cx} 6 ${cx + 30} 16`} fill="none" stroke="#3a1a0e" strokeWidth="4" strokeLinecap="round" />
        </g>
      ))}
      <path d="M196 38 Q200 46 196 50 Q192 46 196 38Z" fill="#8fd8ff" />
      <Die x={40} y={70} s={34} v={4} rot={-8} opacity={0.45} filter={`url(#${g('flou')})`} />
      <Die x={34} y={66} s={34} v={4} rot={-8} filter={`url(#${g('flou')})`} />
      <Die x={96} y={74} s={34} v={2} opacity={0.45} filter={`url(#${g('flou')})`} />
      <Die x={90} y={70} s={34} v={2} filter={`url(#${g('flou')})`} />
      <Die x={152} y={70} s={34} v={1} rot={10} opacity={0.45} filter={`url(#${g('flou')})`} />
      <Die x={146} y={66} s={34} v={1} rot={10} filter={`url(#${g('flou')})`} />
    </>
  ),

  // Le lendemain : poche de glace sur la tête, et un lancer de moins.
  'gueule-bois': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#d0707a', '#8e2434', '#3a0a14']} cx="50%" cy="45%" />
      <defs>
        <pattern id={g('vichy')} width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#fbf6e9" /><rect width="5" height="10" fill="#e04a5a" opacity=".55" /><rect width="10" height="5" fill="#e04a5a" opacity=".55" />
        </pattern>
      </defs>
      <path d="M60 122 Q64 102 107 100 Q150 102 154 122Z" fill="#2c54c2" />
      <ellipse cx="107" cy="74" rx="30" ry="31" fill="#cfe0b0" />
      <ellipse cx="77" cy="78" rx="4.5" ry="7" fill="#bcd09c" /><ellipse cx="137" cy="78" rx="4.5" ry="7" fill="#bcd09c" />
      <path d="M90 74 Q95 70 100 74 M114 74 Q119 70 124 74" fill="none" stroke="#1d1712" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M88 82 Q94 86 100 82 M114 82 Q120 86 126 82" fill="none" stroke="#9ab07a" strokeWidth="2" strokeLinecap="round" />
      <path d="M96 94 Q101 90 107 94 Q113 98 118 94" fill="none" stroke="#5a3a20" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M74 52 Q76 24 107 22 Q138 24 140 52 Q107 62 74 52Z" fill={u('vichy')} />
      <path d="M74 52 Q107 62 140 52" fill="none" stroke="#b03040" strokeWidth="2" />
      <path d="M98 20 Q107 8 116 20 Q107 26 98 20Z" fill="#e04a5a" /><circle cx="107" cy="18" r="4" fill="#b03040" />
      <rect x="86" y="30" width="9" height="9" rx="2" fill="#bfe8ff" transform="rotate(12 90 34)" /><rect x="118" y="34" width="8" height="8" rx="2" fill="#bfe8ff" transform="rotate(-10 122 38)" />
      <g fill="none" stroke="#ffd36b" strokeWidth="2.6" strokeLinecap="round">
        <path d="M44 44 m-10 0 a10 10 0 1 0 20 0 a7 7 0 1 0 -14 0 a4 4 0 1 0 8 0" />
        <path d="M172 40 m-10 0 a10 10 0 1 0 20 0 a7 7 0 1 0 -14 0 a4 4 0 1 0 8 0" />
      </g>
      <text x="158" y="106" fontFamily={SLAB} fontSize="18" fill="#fffaf0" textAnchor="middle">−1</text>
      <Die x={172} y={88} s={24} v={1} rot={12} />
    </>
  ),

  // Tout le bistrot lève son verre : une rangée de verres brandis.
  'tournee-generale': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#ffd27a', '#c0303e', '#3a0a14']} cx="50%" cy="18%" r="85%" />
      <g fill="#fff3c4" opacity=".24">
        <path d="M107 20 L70 -10 L92 -10Z" /><path d="M107 20 L122 -10 L144 -10Z" /><path d="M107 20 L214 6 L214 36Z" /><path d="M107 20 L0 6 L0 36Z" /><path d="M107 20 L214 70 L200 92Z" /><path d="M107 20 L0 70 L14 92Z" />
      </g>
      {([
        [30, 72, '#2c54c2', 'b', -12],
        [68, 52, '#fbf6e9', 'w', -6],
        [107, 42, '#2f7a55', 'b', 0],
        [146, 52, '#5a3b85', 'w', 6],
        [184, 72, '#d4ad2f', 'b', 12],
      ] as const).map(([x, y, sleeve, kind, rot], i) => (
        <g key={i}>
          <path d={`M${x + (x - 107) * 0.25} 126 L${x} ${y + 10}`} stroke={sleeve} strokeWidth="12" strokeLinecap="round" />
          <circle cx={x} cy={y + 6} r="7.5" fill={i % 2 ? '#e6b088' : '#f0c39a'} />
          {kind === 'b' ? <Beer x={x - 11} y={y + 2} rot={rot} /> : <Wine x={x} y={y + 2} rot={rot} />}
        </g>
      ))}
      <g fill="#fffaf0"><circle cx="88" cy="12" r="2.5" /><circle cx="128" cy="10" r="3" /><circle cx="50" cy="30" r="2" /><circle cx="166" cy="28" r="2.5" /></g>
      <Spark x={22} y={22} r={7} /><Spark x={194} y={20} r={7} />
    </>
  ),

  // ================================================================ Les Pièges (nouveaux)

  // Un pied qui dépasse, et le dé qui trébuche.
  'croche-patte': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#9a7ad0', '#4a2c7a', '#1c1030']} cx="60%" cy="40%" />
      <rect x="0" y="100" width="214" height="22" fill="#2a1a40" />
      <rect x="0" y="99" width="214" height="2" fill="#a99ad0" opacity=".5" />
      <path d="M-4 64 L66 80 L64 98 L-4 96Z" fill="#a3263a" />
      <g stroke="#6e1424" strokeWidth="2"><path d="M10 68 L8 96" /><path d="M26 71 L24 97" /><path d="M42 75 L40 97" /></g>
      <rect x="54" y="78" width="14" height="8" fill="#fbf6e9" />
      <path d="M60 84 Q96 78 108 92 L108 100 L60 100Z" fill="#8a5a2e" />
      <rect x="58" y="97" width="52" height="4" rx="2" fill="#1d1712" />
      <path d="M72 86 L90 84" stroke="#f1cc7d" strokeWidth="1.6" />
      <path d="M200 96 Q170 92 150 70 Q138 52 128 46" fill="none" stroke="#ffd36b" strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
      <Die x={104} y={26} s={32} v={3} rot={38} />
      <g stroke="#ffd36b" strokeWidth="3" strokeLinecap="round"><path d="M112 84 L120 78" /><path d="M114 92 L124 92" /><path d="M104 76 L104 68" /></g>
      <Spark x={92} y={56} r={6} fill="#fffaf0" /><Spark x={154} y={20} r={7} />
      <text x="178" y="48" fontFamily={SLAB} fontSize="24" fill="#ffd36b" textAnchor="middle">!</text>
    </>
  ),

  // Une main rayée qui pioche dans la bourse de pièces.
  'main-sac': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#9a7ad0', '#4a2c7a', '#1c1030']} cx="45%" cy="55%" />
      <ellipse cx="107" cy="114" rx="64" ry="7" fill="#000" opacity=".35" />
      <path d="M58 112 Q40 100 50 76 Q58 60 78 58 L136 58 Q156 60 164 76 Q174 100 156 112Z" fill="#8a5a2e" />
      <path d="M58 112 Q48 100 54 84" fill="none" stroke="#c99560" strokeWidth="3" opacity=".6" strokeLinecap="round" />
      <ellipse cx="107" cy="58" rx="32" ry="8" fill="#2a1508" />
      <g fill="#d4ad2f" stroke="#8a6418" strokeWidth="1.5"><circle cx="90" cy="56" r="7" /><circle cx="124" cy="56" r="7" /></g>
      <path d="M220 -6 L138 42" stroke="#1d1712" strokeWidth="18" strokeLinecap="round" />
      <path d="M220 -6 L138 42" stroke="#fbf6e9" strokeWidth="18" strokeDasharray="5 7" />
      <g transform="rotate(-30 120 52)"><rect x="104" y="38" width="30" height="26" rx="10" fill="#f0c39a" /><rect x="104" y="52" width="9" height="22" rx="4.5" fill="#f0c39a" /><rect x="114" y="54" width="9" height="22" rx="4.5" fill="#e6b088" /></g>
      <path d="M75 62 Q107 70 139 62" fill="none" stroke="#8a5a2e" strokeWidth="6" strokeLinecap="round" />
      <path d="M78 64 Q70 74 62 70 M136 64 Q146 74 152 68" fill="none" stroke="#d4ad2f" strokeWidth="2.5" strokeLinecap="round" />
      <g fill="#ffd36b" stroke="#8a6418" strokeWidth="1.5">
        <circle cx="40" cy="108" r="8" /><circle cx="176" cy="104" r="8" /><circle cx="190" cy="92" r="7" /><circle cx="150" cy="26" r="7" />
      </g>
      <g fill="#8a6418" fontFamily={SLAB} fontSize="8" textAnchor="middle"><text x="40" y="111">1</text><text x="176" y="107">1</text></g>
      <Spark x={30} y={30} r={7} />
    </>
  ),

  // Une ardoise de craie… et le piège à loup en dessous.
  'ardoise-piegee': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#9a7ad0', '#4a2c7a', '#1c1030']} cx="50%" cy="35%" />
      <path d="M107 2 L64 10 M107 2 L150 10" stroke="#c99560" strokeWidth="1.6" />
      <circle cx="107" cy="3" r="2.5" fill="#d4ad2f" />
      <rect x="52" y="8" width="110" height="72" rx="4" fill="#8a5a2e" />
      <rect x="58" y="14" width="98" height="60" fill="#22302a" />
      <g fill="none" stroke="#f4efe6" strokeWidth="2" strokeLinecap="round" opacity=".88">
        <path d="M66 26 Q72 22 78 26 T90 26 T102 26" />
        <path d="M66 38 L96 38" /><path d="M66 48 L90 48" /><path d="M66 58 L100 58" />
      </g>
      <text x="130" y="56" fontFamily={SLAB} fontSize="24" fill="#f4efe6" textAnchor="middle" opacity=".92">+1</text>
      <rect x="120" y="72" width="16" height="5" rx="2" fill="#fbf6e9" />
      <ellipse cx="107" cy="112" rx="46" ry="7" fill="#4f5a5e" />
      <ellipse cx="107" cy="110" rx="42" ry="5" fill="#6f7b80" />
      <path d="M66 110 L72 98 L78 108 L84 94 L90 106 L96 92 L102 104 L107 90 L112 104 L118 92 L124 106 L130 94 L136 108 L142 98 L148 110" fill="none" stroke="#d7dee1" strokeWidth="3" strokeLinejoin="round" />
      <path d="M66 110 Q107 76 148 110" fill="none" stroke="#b9c2c6" strokeWidth="2.5" />
      <circle cx="107" cy="110" r="6" fill="#d4ad2f" />
      <path d="M20 112 L56 110 M158 110 L196 112" stroke="#b9c2c6" strokeWidth="3" strokeDasharray="4 3" />
      <Spark x={28} y={30} r={6} /><Spark x={188} y={40} r={7} />
    </>
  ),

  // Un 4 en façade… qui cache un 3 sous son masque.
  'faux-421': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#9a7ad0', '#4a2c7a', '#1c1030']} cx="45%" cy="45%" />
      <ellipse cx="104" cy="112" rx="50" ry="6" fill="#000" opacity=".35" />
      <Die x={70} y={34} s={68} v={3} />
      <path d="M72 50 Q58 52 60 64 Q62 74 72 72 M136 50 Q150 52 150 62 Q150 72 138 70" fill="none" stroke="#1d1712" strokeWidth="2.5" />
      <g transform="rotate(-9 104 50)">
        <rect x="74" y="20" width="62" height="56" rx="12" fill="#000" opacity=".25" transform="translate(3 4)" />
        <rect x="74" y="20" width="62" height="56" rx="12" fill="#f1e2c4" stroke="#d4ad2f" strokeWidth="2.5" />
        <g fill="#c8312b"><circle cx="90" cy="35" r="6" /><circle cx="120" cy="35" r="6" /><circle cx="90" cy="61" r="6" /><circle cx="120" cy="61" r="6" /></g>
      </g>
      <Die x={154} y={82} s={24} v={2} rot={-6} /><Die x={182} y={84} s={24} v={1} rot={8} />
      <text x="34" y="52" fontFamily={SLAB} fontSize="28" fill="#ffd36b" textAnchor="middle">?</text>
      <Spark x={176} y={30} r={7} />
    </>
  ),

  // Les dés 2-2-1 en bonnet de nuit : bonne nuit, la combinaison.
  'coup-nenette': (g, u) => (
    <>
      <Linear g={g} u={u} c={['#3a2366', '#120a20']} />
      <path d="M186 6 A16 16 0 1 0 202 32 A12.5 12.5 0 1 1 186 6Z" fill="#ffe9a8" />
      <g fill="#ffe9a8"><circle cx="24" cy="18" r="1.6" /><circle cx="60" cy="10" r="1.2" /><circle cx="140" cy="14" r="1.6" /><circle cx="100" cy="24" r="1.1" /><circle cx="160" cy="40" r="1.2" /></g>
      <ellipse cx="107" cy="108" rx="96" ry="14" fill="#a99ad0" opacity=".45" />
      {([
        [30, 62, 2, '#5a86ff', -6],
        [84, 60, 2, '#e04a5a', 4],
        [138, 62, 1, '#7fe0b2', -4],
      ] as const).map(([x, y, v, cap, rot], i) => (
        <g key={i} transform={`rotate(${rot} ${x + 20} ${y + 20})`}>
          <Die x={x} y={y} s={40} v={v} />
          <path d={`M${x - 2} ${y + 3} Q${x + 10} ${y - 30} ${x + 50} ${y - 16} Q${x + 34} ${y - 10} ${x + 42} ${y + 3}Z`} fill={cap} />
          <rect x={x - 3} y={y - 3} width="46" height="8" rx="4" fill="#fbf6e9" />
          <circle cx={x + 50} cy={y - 16} r="5" fill="#fbf6e9" />
        </g>
      ))}
      <g fontFamily={SLAB} fill="#ffe9a8" textAnchor="middle"><text x="190" y="66" fontSize="11">z</text><text x="198" y="56" fontSize="14">z</text><text x="186" y="80" fontSize="9">z</text></g>
    </>
  ),

  // ================================================================ Les Chaînes (nouveaux)

  // Deux coudes qui se cognent sur le comptoir ; une carte en profite pour sauter dans la main.
  'coup-coude': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#7aa0ff', '#2c54c2', '#0b1840']} cx="50%" cy="35%" />
      <Counter y={86} />
      <path d="M-10 36 L94 82 L30 88" fill="none" stroke="#fbf6e9" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-10 36 L94 82 L30 88" fill="none" stroke="#2c54c2" strokeWidth="18" strokeDasharray="4 6" strokeLinejoin="round" />
      <circle cx="26" cy="88" r="9" fill="#f0c39a" />
      <path d="M224 36 L120 82 L184 88" fill="none" stroke="#c8312b" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="188" cy="88" r="9" fill="#e6b088" />
      <g stroke="#ffd36b" strokeWidth="3" strokeLinecap="round"><path d="M107 62 L107 52" /><path d="M96 66 L90 58" /><path d="M118 66 L124 58" /></g>
      <g transform="rotate(12 108 26)">
        <rect x="96" y="8" width="24" height="34" rx="4" fill="#2c54c2" stroke="#e3c060" strokeWidth="2" />
        <text x="108" y="31" fontFamily={SLAB} fontSize="12" fill="#fbf6e9" textAnchor="middle">+1</text>
      </g>
      <path d="M86 40 Q90 28 96 24" fill="none" stroke="#e3c060" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
    </>
  ),

  // Le petit bol d'olives et ses cure-dents : la carte suivante est offerte (étiquette « 0 »).
  'mise-bouche': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#7aa0ff', '#2c54c2', '#0b1840']} cx="45%" cy="50%" />
      <ellipse cx="107" cy="112" rx="66" ry="8" fill="#000" opacity=".3" />
      <g stroke="#e3c060" strokeWidth="2.6" strokeLinecap="round"><path d="M86 66 L72 30" /><path d="M108 62 L112 22" /><path d="M128 66 L148 34" /></g>
      <circle cx="72" cy="30" r="4" fill="#c8312b" /><circle cx="112" cy="22" r="4" fill="#5aa9ff" /><circle cx="148" cy="34" r="4" fill="#ffd36b" />
      <g fill="#7a9a3a">
        <ellipse cx="76" cy="66" rx="10" ry="8" /><ellipse cx="96" cy="62" rx="10" ry="8" /><ellipse cx="116" cy="62" rx="10" ry="8" /><ellipse cx="136" cy="66" rx="10" ry="8" /><ellipse cx="106" cy="68" rx="10" ry="8" />
      </g>
      <g fill="#c8312b"><circle cx="78" cy="64" r="3" /><circle cx="98" cy="60" r="3" /><circle cx="118" cy="60" r="3" /><circle cx="138" cy="64" r="3" /><circle cx="108" cy="66" r="3" /></g>
      <path d="M54 70 Q58 110 107 110 Q156 110 160 70Z" fill="#fbf6e9" />
      <path d="M58 84 Q107 96 156 84 L154 92 Q107 104 60 92Z" fill="#2c54c2" />
      <path d="M54 70 Q107 80 160 70" fill="none" stroke="#efe2c4" strokeWidth="4" />
      <g transform="translate(176 40) rotate(14)">
        <path d="M-14 -12 L10 -12 L20 0 L10 12 L-14 12Z" fill="#e3c060" />
        <circle cx="10" cy="0" r="2.5" fill="#0b1840" />
        <text x="-3" y="5" fontFamily={SLAB} fontSize="15" fill="#0b1840" textAnchor="middle">0</text>
      </g>
      <Spark x={30} y={30} r={7} />
    </>
  ),

  // Un pouce qui pousse le dé d'un cran : +1 ou −1.
  'coup-pouce': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#7aa0ff', '#2c54c2', '#0b1840']} cx="55%" cy="50%" />
      <rect x="-4" y="56" width="34" height="38" rx="4" fill="#fbf6e9" />
      <rect x="24" y="54" width="10" height="42" rx="3" fill="#e3c060" />
      <rect x="30" y="52" width="50" height="44" rx="16" fill="#f0c39a" />
      <g stroke="#c98b62" strokeWidth="1.6" strokeLinecap="round"><path d="M62 70 L76 70" /><path d="M60 80 L76 80" /><path d="M62 90 L74 90" /></g>
      <rect x="62" y="42" width="52" height="16" rx="8" fill="#f0c39a" stroke="#c98b62" strokeWidth="1.4" />
      <path d="M104 46 Q110 44 112 50" fill="none" stroke="#c98b62" strokeWidth="1.4" />
      <Die x={116} y={34} s={50} v={3} rot={14} />
      <g stroke="#ffd36b" strokeWidth="3" strokeLinecap="round" opacity=".8"><path d="M178 52 L192 50" /><path d="M180 66 L198 66" /><path d="M178 80 L192 82" /></g>
      <g fontFamily={SLAB} textAnchor="middle" fill="#ffd36b"><text x="150" y="24" fontSize="18">+1</text><text x="150" y="114" fontSize="18">−1</text></g>
    </>
  ),

  // Une tête pleine de chiffres qui tournent ; trois cartes du dessus, une gardée.
  'calcul-mental': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#7aa0ff', '#2c54c2', '#0b1840']} cx="35%" cy="40%" />
      <path d="M44 122 L46 100 Q30 92 32 66 Q34 34 66 30 Q96 30 102 56 L108 66 Q110 70 104 71 L102 78 Q102 86 92 86 L84 88 L84 104 Q84 112 82 122Z" fill="#fbf6e9" />
      <path d="M44 66 Q48 44 66 42" fill="none" stroke="#2c54c2" strokeWidth="3" strokeLinecap="round" opacity=".5" />
      <ellipse cx="66" cy="38" rx="56" ry="16" fill="none" stroke="#e3c060" strokeWidth="2" strokeDasharray="3 5" />
      <g fontFamily={SLAB} fill="#ffd36b" textAnchor="middle">
        <text x="14" y="42" fontSize="14">2</text><text x="40" y="22" fontSize="13">7</text><text x="96" y="24" fontSize="13">+</text><text x="122" y="44" fontSize="14">4</text><text x="66" y="60" fontSize="12" fill="#2c54c2">=</text>
      </g>
      <MiniCardShape x={140} y={50} rot={-14} fill="#5a3b85" edge="#a99ad0" />
      <MiniCardShape x={180} y={50} rot={14} fill="#a3263a" edge="#d9a07a" />
      <circle cx="173" cy="36" r="22" fill="#ffd36b" opacity=".25" />
      <MiniCardShape x={160} y={18} fill="#2c54c2" edge="#ffd36b">
        <path d="M173 30 l2.4 5.4 5.6 .6 -4.2 3.8 1.2 5.6 -5 -2.9 -5 2.9 1.2 -5.6 -4.2 -3.8 5.6 -.6z" fill="#ffd36b" />
      </MiniCardShape>
    </>
  ),

  // Un doigt qui recompte les points du dé, un par un.
  recompter: (g, u) => (
    <>
      <Radial g={g} u={u} c={['#7aa0ff', '#2c54c2', '#0b1840']} cx="40%" cy="45%" />
      <ellipse cx="94" cy="112" rx="50" ry="6" fill="#000" opacity=".3" />
      <Die x={52} y={20} s={84} v={5} />
      <g fontFamily={SLAB} fontSize="11" fill="#2c54c2" textAnchor="middle">
        <text x="64" y="34">1</text><text x="120" y="34">2</text><text x="84" y="58">3</text><text x="64" y="102">4</text><text x="122" y="102">5</text>
      </g>
      <path d="M196 124 L170 102" stroke="#e3c060" strokeWidth="22" strokeLinecap="round" />
      <circle cx="166" cy="96" r="16" fill="#f0c39a" />
      <path d="M160 86 L122 50" stroke="#f0c39a" strokeWidth="11" strokeLinecap="round" />
      <path d="M124 46 Q119 49 120 54" fill="none" stroke="#c98b62" strokeWidth="1.6" strokeLinecap="round" />
      <g stroke="#c98b62" strokeWidth="1.4" strokeLinecap="round"><path d="M156 98 L170 96" /><path d="M158 104 L172 104" /></g>
      <text x="184" y="34" fontFamily={SLAB} fontSize="20" fill="#ffd36b" textAnchor="middle">±1</text>
      <Spark x={150} y={22} r={6} fill="#fffaf0" />
    </>
  ),

  // Une rangée de dominos qui basculent, et une pièce perdue à chaque fois.
  domino: (g, u) => (
    <>
      <Linear g={g} u={u} c={['#3a64d8', '#0b1840']} />
      <rect x="0" y="102" width="214" height="20" fill="#0a1433" opacity=".6" />
      {[0, 1, 2].map((i) => {
        const x = 28 + i * 52;
        return (
          <g key={i} transform={`rotate(${i * 9} ${x + 34} 102)`}>
            <rect x={x} y="40" width="34" height="62" rx="5" fill="#141a2e" stroke="#e3c060" strokeWidth="2" />
            <path d={`M${x + 5} 71 L${x + 29} 71`} stroke="#fbf6e9" strokeWidth="2" />
            {(i === 0 ? [[0.5, 0.25], [0.3, 0.75], [0.7, 0.75]] : i === 1 ? [[0.3, 0.17], [0.7, 0.33], [0.5, 0.75]] : [[0.5, 0.25], [0.3, 0.62], [0.7, 0.62], [0.3, 0.88], [0.7, 0.88]])
              .map(([a, b], k) => <circle key={k} cx={x + a * 34} cy={40 + b * 62} r="3" fill="#fbf6e9" />)}
          </g>
        );
      })}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${52 + i * 52} ${24 - i * 4})`}>
          <circle r="11" fill="#d4ad2f" stroke="#8a6418" strokeWidth="1.5" />
          <text y="4" fontFamily={SLAB} fontSize="10" fill="#2a1a05" textAnchor="middle">−1</text>
        </g>
      ))}
      <path d="M150 12 Q176 6 190 28" fill="none" stroke="#e3c060" strokeWidth="2.5" strokeDasharray="3 4" strokeLinecap="round" />
      <path d="M186 22 L192 32 L182 32Z" fill="#e3c060" />
    </>
  ),

  // Une boucle de flèches dorées autour d'un éventail de cartes : on remet ça.
  'grand-enchainement': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#ffe08a', '#3a64d8', '#0b1840']} cx="50%" cy="50%" r="75%" />
      <g fill="#fff3c4" opacity=".2">
        <path d="M107 61 L60 -10 L90 -10Z" /><path d="M107 61 L130 -10 L160 -10Z" /><path d="M107 61 L214 30 L214 70Z" /><path d="M107 61 L0 30 L0 70Z" /><path d="M107 61 L60 130 L90 130Z" /><path d="M107 61 L130 130 L160 130Z" />
      </g>
      <g fill="none" stroke="#ffd36b" strokeWidth="6" strokeLinecap="round">
        <path d="M46 52 A62 46 0 0 1 160 22" />
        <path d="M168 70 A62 46 0 0 1 54 100" />
      </g>
      <path d="M152 10 L170 24 L150 32Z" fill="#ffd36b" />
      <path d="M62 112 L44 98 L64 90Z" fill="#ffd36b" />
      <MiniCardShape x={78} y={38} w={30} h={42} rot={-20} fill="#a3263a" edge="#f1cc7d" />
      <MiniCardShape x={106} y={38} w={30} h={42} rot={20} fill="#2f7a55" edge="#f1cc7d" />
      <MiniCardShape x={92} y={32} w={30} h={42} fill="#2c54c2" edge="#ffd36b">
        <text x="107" y="59" fontFamily={SLAB} fontSize="14" fill="#ffd36b" textAnchor="middle">×2</text>
      </MiniCardShape>
      <Spark x={24} y={24} r={7} /><Spark x={192} y={98} r={7} /><Spark x={186} y={44} r={4} fill="#fffaf0" />
    </>
  ),

  // ================================================================ Deuxième vague (8 cartes de plus)

  // Le beau-frère en marinière, clin d'œil complice : l'étiquette passe de 2 à 1.
  'beau-frere': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#a8dcbd', '#3f8a65', '#123e2b']} cx="35%" cy="30%" r="80%" />
      <g fill="#ffffff" opacity=".14"><circle cx="60" cy="34" r="36" /></g>
      <defs>
        <pattern id={g('raies')} width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#fbf6e9" /><rect y="5" width="10" height="5" fill="#2c54c2" /></pattern>
      </defs>
      <path d="M22 122 Q26 84 72 78 Q118 84 124 122Z" fill={u('raies')} />
      <path d="M58 80 L72 94 L86 80Z" fill="#e6b088" />
      <rect x="64" y="64" width="16" height="18" fill="#e6b088" />
      <ellipse cx="51" cy="50" rx="4.5" ry="6.5" fill="#e6b088" /><ellipse cx="93" cy="50" rx="4.5" ry="6.5" fill="#e6b088" />
      <ellipse cx="72" cy="48" rx="21" ry="23" fill="#f0c39a" />
      <path d="M50 42 Q50 22 72 22 Q94 22 94 40 Q86 30 72 31 Q58 30 50 42Z" fill="#3a2414" />
      <path d="M60 46 Q64 43 68 46" fill="none" stroke="#1d1712" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="82" cy="46" r="2.2" fill="#1d1712" />
      <path d="M77 40 Q82 37 87 40" fill="none" stroke="#3a2414" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M72 48 Q69 55 73 57" fill="none" stroke="#c98b62" strokeWidth="2" strokeLinecap="round" />
      <path d="M56 61 Q64 55 72 59 Q80 55 88 61 Q80 66 72 62 Q64 66 56 61Z" fill="#3a2414" />
      <path d="M118 104 Q130 86 140 66" fill="none" stroke="#f0c39a" strokeWidth="11" strokeLinecap="round" />
      <g transform="translate(160 52) rotate(-12)">
        <path d="M-30 -20 L18 -20 L32 0 L18 20 L-30 20Z" fill="#fbf6e9" stroke="#b9a56a" strokeWidth="2" />
        <circle cx="18" cy="0" r="3" fill="#123e2b" />
        <text x="-18" y="8" fontFamily={SLAB} fontSize="20" fill="#2a1d12" textAnchor="middle">2</text>
        <path d="M-27 10 L-9 -10" stroke="#c8312b" strokeWidth="3" strokeLinecap="round" />
        <text x="4" y="9" fontFamily={SLAB} fontSize="22" fill="#2f7a55" textAnchor="middle">1</text>
      </g>
      <path d="M190 22 Q204 36 196 48" fill="none" stroke="#b9a56a" strokeWidth="2" />
      <Spark x={196} y={96} r={7} /><Spark x={24} y={22} r={5} fill="#fffaf0" />
    </>
  ),

  // L'ardoise des comptes, et le chiffon qui efface les bâtons de craie.
  'efface-tout': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#8fd3b0', '#2f7a55', '#0f3523']} cx="50%" cy="35%" />
      <rect x="30" y="14" width="154" height="94" rx="5" fill="#8a5a2e" />
      <rect x="37" y="21" width="140" height="80" fill="#22302a" />
      <g stroke="#f4efe6" strokeWidth="3" strokeLinecap="round" opacity=".9">
        <path d="M50 34 L50 56" /><path d="M58 34 L58 56" /><path d="M66 34 L66 56" /><path d="M74 34 L74 56" /><path d="M44 52 L80 38" />
      </g>
      <g stroke="#f4efe6" strokeWidth="3" strokeLinecap="round" opacity=".35">
        <path d="M96 34 L96 56" /><path d="M104 34 L104 56" /><path d="M112 34 L112 56" />
      </g>
      <path d="M44 72 Q80 64 120 74 Q150 82 170 70" fill="none" stroke="#f4efe6" strokeWidth="14" opacity=".12" strokeLinecap="round" />
      <path d="M48 86 Q90 78 130 88" fill="none" stroke="#f4efe6" strokeWidth="10" opacity=".08" strokeLinecap="round" />
      <g transform="rotate(-16 142 66)">
        <path d="M118 52 Q140 44 166 52 L170 80 Q144 88 116 80Z" fill="#ffd36b" />
        <path d="M118 52 Q140 44 166 52 L166 58 Q140 50 118 58Z" fill="#fff3c4" />
        <g stroke="#d4ad2f" strokeWidth="1.6"><path d="M126 62 L124 78" /><path d="M140 60 L140 80" /><path d="M154 61 L156 79" /></g>
      </g>
      <g fill="#f4efe6" opacity=".7"><circle cx="112" cy="94" r="2" /><circle cx="122" cy="98" r="1.4" /><circle cx="104" cy="99" r="1.6" /></g>
      <Spark x={20} y={24} r={6} /><Spark x={196} y={102} r={7} />
    </>
  ),

  // Un verre glisse sur le zinc vers l'adversaire ; un seul dé l'attend.
  'verre-offert': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#f6826a', '#b8303e', '#4a0d18']} cx="40%" cy="40%" r="80%" />
      <g fill="#fff3c4" opacity=".18"><circle cx="70" cy="40" r="40" /></g>
      <Counter y={92} dark="#3a1a0e" top="#8a5a2e" />
      <g stroke="#ffd9a8" strokeWidth="3" strokeLinecap="round" opacity=".6"><path d="M28 84 L52 84" /><path d="M20 76 L46 76" /><path d="M34 68 L54 68" /></g>
      <path d="M-6 88 L60 84" stroke="#fbf6e9" strokeWidth="13" strokeLinecap="round" />
      <ellipse cx="66" cy="84" rx="9" ry="6.5" fill="#f0c39a" />
      <Wine x={90} y={92} rot={-4} />
      <Wine x={150} y={92} rot={0} />
      <path d="M120 56 Q120 40 134 40" fill="none" stroke="#ffd36b" strokeWidth="2.5" strokeDasharray="3 4" strokeLinecap="round" />
      <Die x={170} y={26} s={30} v={1} rot={10} />
      <g transform="translate(186 74)">
        <circle r="13" fill="#fbf6e9" />
        <text y="6" fontFamily={SLAB} fontSize="16" fill="#a3263a" textAnchor="middle">×1</text>
      </g>
      <Spark x={120} y={20} r={7} />
    </>
  ),

  // Deux verres qui trinquent ; deux dés qui changent de camp.
  trinquer: (g, u) => (
    <>
      <Radial g={g} u={u} c={['#ffb35c', '#b8303e', '#3a0a14']} cx="50%" cy="35%" r="75%" />
      <g fill="#fff3c4" opacity=".25">
        <path d="M107 30 L80 -6 L96 -6Z" /><path d="M107 30 L118 -6 L134 -6Z" /><path d="M107 30 L176 10 L180 24Z" /><path d="M107 30 L38 10 L34 24Z" />
      </g>
      <Beer x={74} y={74} w={26} h={36} rot={18} />
      <g transform="rotate(-18 128 70)"><Wine x={128} y={78} /></g>
      <Spark x={107} y={30} r={10} fill="#fffaf0" />
      <Die x={22} y={84} s={28} v={6} rot={-10} />
      <Die x={164} y={84} s={28} v={1} rot={8} />
      <path d="M40 80 Q107 50 170 80" fill="none" stroke="#ffd36b" strokeWidth="3" strokeLinecap="round" />
      <path d="M166 72 L172 82 L160 84Z" fill="#ffd36b" />
      <path d="M170 116 Q107 124 42 116" fill="none" stroke="#ffd36b" strokeWidth="3" strokeLinecap="round" />
      <path d="M48 110 L40 117 L50 122Z" fill="#ffd36b" />
    </>
  ),

  // Une main gantée tire une carte de la poche du veston.
  'vide-poches': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#9a7ad0', '#4a2c7a', '#1c1030']} cx="40%" cy="55%" />
      <path d="M-6 30 Q40 22 86 30 L96 122 L-6 122Z" fill="#3a2a22" />
      <path d="M86 30 L96 122" stroke="#5a463a" strokeWidth="3" />
      <path d="M14 60 L76 60 L74 100 Q46 106 18 100Z" fill="#2a1e18" />
      <path d="M14 60 L76 60" stroke="#a99ad0" strokeWidth="2.5" />
      <g transform="rotate(-22 70 52)">
        <MiniCardShape x={50} y={22} w={30} h={42} fill="#2f7a55" edge="#f1cc7d" />
        <MiniCardShape x={60} y={18} w={30} h={42} fill="#a3263a" edge="#f1cc7d" />
      </g>
      <path d="M220 -4 L118 30" stroke="#1d1712" strokeWidth="16" strokeLinecap="round" />
      <g transform="rotate(-20 108 34)">
        <rect x="92" y="22" width="30" height="24" rx="10" fill="#1d1712" />
        <rect x="90" y="34" width="10" height="20" rx="5" fill="#1d1712" />
        <rect x="100" y="36" width="10" height="20" rx="5" fill="#2a2420" />
      </g>
      <g stroke="#ffd36b" strokeWidth="2.5" strokeLinecap="round"><path d="M128 64 L140 72" /><path d="M120 74 L128 86" /></g>
      <MiniCardShape x={150} y={70} w={26} h={36} rot={24} fill="#5a3b85" edge="#a99ad0">
        <text x="163" y="94" fontFamily={SLAB} fontSize="14" fill="#a99ad0" textAnchor="middle">?</text>
      </MiniCardShape>
      <Spark x={190} y={40} r={7} /><Spark x={176} y={20} r={4} fill="#fffaf0" />
    </>
  ),

  // Derrière son journal troué, le mouchard ne perd rien ; deux cartes pour son complice.
  mouchard: (g, u) => (
    <>
      <Radial g={g} u={u} c={['#9a7ad0', '#4a2c7a', '#1c1030']} cx="45%" cy="40%" />
      <path d="M30 122 Q34 92 76 88 Q118 92 122 122Z" fill="#2a1e18" />
      <path d="M44 34 Q76 4 108 34 L108 40 L44 40Z" fill="#2a1e18" />
      <rect x="38" y="38" width="76" height="5" rx="2.5" fill="#2a1e18" />
      <g transform="rotate(-4 76 72)">
        <rect x="26" y="40" width="100" height="64" fill="#efe6d2" />
        <rect x="26" y="40" width="100" height="64" fill="none" stroke="#c9bfa8" strokeWidth="1.5" />
        <text x="76" y="54" fontFamily={SLAB} fontSize="9" fill="#2a1d12" textAnchor="middle">LE COMPTOIR</text>
        <g stroke="#b9ad94" strokeWidth="2" strokeLinecap="round">
          <path d="M34 82 L70 82" /><path d="M34 90 L66 90" /><path d="M34 98 L70 98" /><path d="M82 82 L118 82" /><path d="M82 90 L114 90" /><path d="M82 98 L118 98" />
        </g>
        <ellipse cx="62" cy="68" rx="7" ry="5" fill="#1c1030" /><ellipse cx="90" cy="68" rx="7" ry="5" fill="#1c1030" />
        <circle cx="64" cy="68" r="2.4" fill="#fbf6e9" /><circle cx="92" cy="68" r="2.4" fill="#fbf6e9" />
      </g>
      <path d="M134 42 Q150 26 170 30" fill="none" stroke="#ffd36b" strokeWidth="2.5" strokeDasharray="3 4" strokeLinecap="round" />
      <MiniCardShape x={156} y={36} w={26} h={36} rot={-10} fill="#5a3b85" edge="#a99ad0" />
      <MiniCardShape x={176} y={44} w={26} h={36} rot={12} fill="#5a3b85" edge="#ffd36b">
        <text x="189" y="67" fontFamily={SLAB} fontSize="12" fill="#ffd36b" textAnchor="middle">+2</text>
      </MiniCardShape>
      <Spark x={150} y={100} r={6} /><Spark x={20} y={20} r={6} fill="#fffaf0" />
    </>
  ),

  // Une rangée de cartes jouées, et une pile de Tournées qui grandit à chaque fois.
  'tant-qu-on-y-est': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#7aa0ff', '#2c54c2', '#0b1840']} cx="50%" cy="40%" />
      <Counter y={96} dark="#0a1433" top="#3a64d8" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <MiniCardShape x={24 + i * 34} y={44 - i * 6} w={26} h={36} rot={-8 + i * 8} fill={['#a3263a', '#2f7a55', '#2c54c2'][i]} edge="#e3c060" />
          <text x={37 + i * 34} y={30 - i * 6} fontFamily={SLAB} fontSize="12" fill="#ffd36b" textAnchor="middle">+1</text>
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Beer x={140 + i * 20} y={96} w={14} h={22 + i * 8} />
        </g>
      ))}
      <path d="M118 66 Q128 56 136 64" fill="none" stroke="#e3c060" strokeWidth="2.5" strokeDasharray="3 4" strokeLinecap="round" />
      <path d="M132 58 L140 66 L130 68Z" fill="#e3c060" />
      <Spark x={196} y={22} r={7} /><Spark x={124} y={16} r={4} fill="#fffaf0" />
    </>
  ),

  // La grande bouteille et sa petite sœur ; une flèche ramène la carte de la défausse à la main.
  'petite-soeur': (g, u) => (
    <>
      <Radial g={g} u={u} c={['#7aa0ff', '#2c54c2', '#0b1840']} cx="40%" cy="45%" />
      <Counter y={100} dark="#0a1433" top="#3a64d8" />
      <g>
        <rect x="40" y="40" width="30" height="60" rx="8" fill="#2f7a55" />
        <rect x="48" y="18" width="14" height="26" rx="4" fill="#2f7a55" />
        <rect x="47" y="14" width="16" height="7" rx="2" fill="#c8312b" />
        <rect x="40" y="58" width="30" height="22" fill="#fbf6e9" />
        <rect x="46" y="44" width="4" height="50" rx="2" fill="#fff" opacity=".3" />
      </g>
      <g>
        <rect x="82" y="66" width="20" height="34" rx="6" fill="#2f7a55" />
        <rect x="87" y="52" width="10" height="16" rx="3" fill="#2f7a55" />
        <rect x="86" y="49" width="12" height="5" rx="2" fill="#c8312b" />
        <rect x="82" y="76" width="20" height="13" fill="#fbf6e9" />
      </g>
      <MiniCardShape x={162} y={62} w={24} h={34} rot={10} fill="#5a3b85" edge="#a99ad0" />
      <MiniCardShape x={156} y={58} w={24} h={34} rot={-6} fill="#a3263a" edge="#d9a07a" />
      <MiniCardShape x={140} y={14} w={28} h={40} rot={-12} fill="#2c54c2" edge="#ffd36b">
        <path d="M154 30 l2.4 5.4 5.6 .6 -4.2 3.8 1.2 5.6 -5 -2.9 -5 2.9 1.2 -5.6 -4.2 -3.8 5.6 -.6z" fill="#ffd36b" />
      </MiniCardShape>
      <path d="M180 58 Q196 36 176 22" fill="none" stroke="#ffd36b" strokeWidth="3" strokeLinecap="round" />
      <path d="M182 20 L172 18 L176 28Z" fill="#ffd36b" />
      <Spark x={120} y={30} r={6} /><Spark x={22} y={26} r={5} fill="#fffaf0" />
    </>
  ),
};

/** Les cartes qui ont une illustration. */
export const CARD_ART_IDS: string[] = Object.keys(ART);
export const hasCardArt = (id: string): boolean => id in ART;

/** Illustration de secours (carte inconnue) : un point d'interrogation sur fond violet. */
const fallback = (g: G, u: U) => (
  <>
    <Radial g={g} u={u} c={['#5a3b85', '#1c1030']} />
    <text x="107" y="80" fontFamily={SLAB} fontSize="48" fill="#a99ad0" textAnchor="middle">?</text>
  </>
);

/**
 * Illustration d'une carte, SVG 214×122 qui remplit son conteneur (recadrée au centre si les
 * proportions diffèrent, comme sur les cartes en main).
 */
export function CardArt({ id, className }: { id: string; className?: string }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const g: G = (n) => `cf-${id}-${n}-${uid}`;
  const u: U = (n) => `url(#${g(n)})`;
  const draw = ART[id] ?? fallback;
  return (
    <svg className={className} viewBox="0 0 214 122" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {draw(g, u)}
    </svg>
  );
}
