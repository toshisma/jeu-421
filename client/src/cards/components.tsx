/**
 * Coups Fourrés : les composants visuels des cartes (carte complète, carte en main, dos, piège
 * face cachée, booster, capsule, pastilles). Fidèles aux prototypes validés par Sam
 * (CFCartes, CFPlateau, CFBooster). Styles : bloc « Coups Fourrés : cartes » de styles.css.
 */
import { GlossText } from './Gloss';
import { useId, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { cardDef, FAMILY_LABEL, RARITY_LABEL, TYPE_LABEL, type CardDef, type CardFamily, type CardRarity } from '../../../shared/cards/catalog';
import { CardArt } from './art';
import { TYPE_META, TypeIcon } from './cardTypes';
import { FAMILY_SHORT, FAMILY_STYLE, splitEmphasis } from './meta';
import { useLongPress, zoomCard, ZoomBtn } from './zoom';
import './fonts';

/** Largeur et hauteur de référence d'une carte complète (prototype). */
export const CARD_W = 230;
export const CARD_H = 322;
/** Carte en main (prototype de plateau). */
export const MINI_W = 84;
export const MINI_H = 118;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Rend un élément cliquable au clavier (Entrée / Espace) quand il a un onClick. */
function clickable(onClick?: () => void) {
  if (!onClick) return {};
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
  };
}

// ------------------------------------------------------------------ petites pièces

/** Pastille de coût dorée (en Tournées). */
export function CostBadge({ cost, size = 34, className }: { cost: number; size?: number; className?: string }) {
  return (
    <span className={cx('cf-cost', className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }} aria-label={`Coût : ${cost} Tournée${cost > 1 ? 's' : ''}`}>
      {cost}
    </span>
  );
}

/** Gemme de rareté (losange coloré), avec ou sans le nom de la rareté. */
export function RarityGem({ rarity, label = false, className }: { rarity: CardRarity; label?: boolean; className?: string }) {
  return (
    <span className={cx('cf-rar', className)} title={RARITY_LABEL[rarity]}>
      <i className={`cf-gem cf-gem-${rarity}`} aria-hidden="true" />
      {label ? RARITY_LABEL[rarity] : <span className="cf-sr">{RARITY_LABEL[rarity]}</span>}
    </span>
  );
}

/** Étiquette de famille (pastille de couleur + nom). */
export function FamilyBadge({ family, short = false, className }: { family: CardFamily; short?: boolean; className?: string }) {
  return (
    <span className={cx('cf-fam', FAMILY_STYLE[family].cls, className)}>
      <i aria-hidden="true" />
      {short ? FAMILY_SHORT[family] : FAMILY_LABEL[family]}
    </span>
  );
}

/** Capsule de bouteille rouge : la monnaie du mode. */
export function CapsuleIcon({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const id = `cf-cap-${uid}`;
  // Bord cranté : 21 dents, comme une vraie capsule.
  const pts: string[] = [];
  for (let i = 0; i < 42; i++) {
    const a = (i / 42) * Math.PI * 2;
    const r = i % 2 ? 44 : 49;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return (
    <svg className={cx('cf-capsule', className)} width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <radialGradient id={id} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#ff8a7a" /><stop offset=".6" stopColor="#c8312b" /><stop offset="1" stopColor="#7a121c" /></radialGradient>
      </defs>
      <polygon points={pts.join(' ')} fill="#7a121c" />
      <circle cx="50" cy="50" r="42" fill={`url(#${id})`} />
      <circle cx="50" cy="50" r="33" fill="none" stroke="#ffffff" strokeOpacity=".28" strokeWidth="4" />
      <path d="M30 34 Q40 24 54 24" fill="none" stroke="#ffffff" strokeOpacity=".55" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

// ------------------------------------------------------------------ carte complète

export interface CardViewProps {
  /** Identifiant de la carte (catalogue). */
  id: string;
  /** Largeur affichée en pixels (230 par défaut) : la carte est mise à l'échelle, sans flou. */
  width?: number;
  /** Version brillante (reflet irisé animé + étiquette « Brillante »). */
  shiny?: boolean;
  /** Étiquette « Nouveau » (première fois dans la collection). */
  isNew?: boolean;
  /** Assombrie (pas possédée, pas jouable…). */
  dimmed?: boolean;
  /** Entourée d'or (choisie). */
  selected?: boolean;
  /** Nombre d'exemplaires possédés : affiche « ×2 » à partir de 2. */
  count?: number;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /**
   * Lecture en grand : toucher long sur la carte (sans la jouer ni l'ajouter), plus une loupe dans le
   * coin. Par défaut pour toute carte de moins de 200 px ; 'press' = toucher long seulement ; false = rien.
   */
  zoom?: boolean | 'press';
}

/** Corps de la carte à sa taille de référence (230×322). */
function CardFace({ def, shiny, isNew, count, gloss }: { def: CardDef; shiny?: boolean; isNew?: boolean; count?: number; gloss?: boolean }) {
  const [, bold] = splitEmphasis(def.id, def.text);
  const long = def.text.length + def.flavor.length > 150;
  return (
    <>
      {shiny && <span className="cf-tag cf-tag-shiny">Brillante</span>}
      {isNew && <span className="cf-tag cf-tag-new">Nouveau</span>}
      <div className="cf-top">
        <CostBadge cost={def.cost} />
        <h3 className={cx('cf-name', def.name.length > 15 && 'cf-name-long')}>{def.name}</h3>
      </div>
      <div className="cf-art"><CardArt id={def.id} /></div>
      <div className="cf-type"><span className="cfn-typetag"><TypeIcon type={def.type} size={13} color={TYPE_META[def.type].color} />{TYPE_LABEL[def.type]}</span><RarityGem rarity={def.rarity} label /></div>
      <div className={cx('cf-txt', long && 'cf-txt-long')}>
        <p><GlossText text={def.text} bold={bold || undefined} plain={!gloss} /></p>
        <em>{def.flavor}</em>
      </div>
      <div className="cf-foot">{FAMILY_LABEL[def.family]}</div>
      {count !== undefined && count > 1 && <span className="cf-count">{`×${count}`}</span>}
    </>
  );
}

/** Carte complète, fidèle au prototype (230×322 de base, prop `width` pour la taille affichée). */
export function CardView({ id, width, shiny, isNew, dimmed, selected, count, onClick, className, style, zoom }: CardViewProps) {
  const def = cardDef(id);
  const w = width ?? CARD_W;
  const z = zoom ?? (w < 200);
  const press = useLongPress(z && def ? () => zoomCard(id) : null);
  if (!def) return null;
  const scale = w / CARD_W;
  const classes = cx(
    'cf-card', FAMILY_STYLE[def.family].cls,
    def.rarity === 'legendaire' && 'cf-legendary',
    shiny && 'cf-shiny', dimmed && 'cf-dimmed', selected && 'cf-selected', onClick && 'cf-clickable',
  );
  const label = `${def.name}, ${TYPE_LABEL[def.type]}, ${RARITY_LABEL[def.rarity]}, coût ${def.cost}${shiny ? ', brillante' : ''}${count && count > 1 ? `, ${count} exemplaires` : ''}`;
  return (
    <div
      className={cx('cf-card-box', className)}
      style={{ width: w, height: Math.round(w * CARD_H / CARD_W), ...style }}
      aria-label={onClick ? label : undefined}
      {...clickable(onClick)}
      {...press}
    >
      <article className={classes} style={scale === 1 ? undefined : { transform: `scale(${scale})` }} aria-label={onClick ? undefined : label}>
        <CardFace def={def} shiny={shiny} isNew={isNew} count={count} gloss={w >= 170 && !onClick} />
      </article>
      {z === true && <ZoomBtn id={id} />}
    </div>
  );
}

// ------------------------------------------------------------------ carte en main

export interface MiniCardProps {
  id: string;
  /** Jouable maintenant : liseré doré. */
  playable?: boolean;
  /** Choisie : soulevée et entourée d'or. */
  selected?: boolean;
  /** Pas jouable (trop chère, mauvais moment) : assombrie. */
  disabled?: boolean;
  shiny?: boolean;
  isNew?: boolean;
  /** Largeur affichée (84 par défaut). */
  width?: number;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

/** Carte de main (84×118) : coût, image, nom et type. */
export function MiniCard({ id, playable, selected, disabled, shiny, isNew, width, onClick, className, style }: MiniCardProps) {
  const def = cardDef(id);
  if (!def) return null;
  const w = width ?? MINI_W;
  const scale = w / MINI_W;
  return (
    <div
      className={cx('cf-mini-box', className)}
      style={{ width: w, height: Math.round(w * MINI_H / MINI_W), ...style }}
      aria-label={`${def.name}, ${TYPE_LABEL[def.type]}, coût ${def.cost}${disabled ? ', pas jouable' : playable ? ', jouable' : ''}`}
      aria-pressed={onClick ? !!selected : undefined}
      aria-disabled={disabled || undefined}
      {...clickable(onClick)}
    >
      <div
        className={cx('cf-mini', FAMILY_STYLE[def.family].cls, def.rarity === 'legendaire' && 'cf-legendary',
          playable && 'cf-playable', selected && 'cf-selected', disabled && 'cf-disabled', shiny && 'cf-shiny')}
        style={scale === 1 ? undefined : { transform: `scale(${scale})` }}
      >
        {isNew && <span className="cf-mini-new">Nouveau</span>}
        <span className="cf-mini-cost">{def.cost}</span>
        <span className="cf-mini-art"><CardArt id={def.id} /></span>
        <b className={cx('cf-mini-name', def.name.length > 14 && 'cf-mini-name-long')}>{def.name}</b>
        <small>{TYPE_LABEL[def.type]}</small>
      </div>
    </div>
  );
}

/**
 * Main en éventail : place les cartes en arc, en les serrant pour tenir dans la largeur
 * disponible (aucun débordement horizontal, même à 360 px avec 7 cartes).
 */
export function HandFan({ children, className, style }: { children: ReactNode[]; className?: string; style?: CSSProperties }) {
  const n = children.length;
  const step = n > 1 ? Math.min(6, 24 / (n - 1)) : 0;
  return (
    <div className={cx('cf-fan', className)} style={{ ['--n' as string]: n, ...style }}>
      <div className="cf-fan-inner">
        {children.map((child, i) => {
          const off = i - (n - 1) / 2;
          const slot: CSSProperties = {
            left: n > 1 ? `calc((100% - ${MINI_W}px) * ${i / (n - 1)})` : `calc(50% - ${MINI_W / 2}px)`,
            transform: `translateY(${(off * off * 1.4).toFixed(1)}px) rotate(${(off * step).toFixed(1)}deg)`,
            zIndex: i + 1,
          };
          return <div key={i} className="cf-fan-slot" style={slot}>{child}</div>;
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dos, piège, booster

/** Dos de carte du mode : violet nuit, emblème « CF » original. Dessin vectoriel, net à toute taille. */
export function CardBack({ width = MINI_W, className, style }: { width?: number; className?: string; style?: CSSProperties }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const g = (n: string) => `cf-back-${n}-${uid}`;
  return (
    <svg className={cx('cf-back', className)} style={style} width={width} height={Math.round(width * CARD_H / CARD_W)} viewBox="0 0 230 322" role="img" aria-label="Carte face cachée" focusable="false">
      <defs>
        <linearGradient id={g('bg')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4a2c7a" /><stop offset=".55" stopColor="#2a1848" /><stop offset="1" stopColor="#140a24" /></linearGradient>
        <pattern id={g('los')} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="22" height="22" fill="none" /><path d="M0 0 L22 0 M0 0 L0 22" stroke="#a99ad0" strokeOpacity=".16" strokeWidth="2" />
        </pattern>
        <radialGradient id={g('halo')} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#f1cc7d" stopOpacity=".35" /><stop offset="1" stopColor="#f1cc7d" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="230" height="322" rx="14" fill={`url(#${g('bg')})`} />
      <rect x="10" y="10" width="210" height="302" rx="9" fill={`url(#${g('los')})`} />
      <rect x="10" y="10" width="210" height="302" rx="9" fill="none" stroke="#a99ad0" strokeWidth="3" />
      <rect x="18" y="18" width="194" height="286" rx="6" fill="none" stroke="#f1cc7d" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
      {[[30, 30], [200, 30], [30, 292], [200, 292]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 8} L${x + 8} ${y} L${x} ${y + 8} L${x - 8} ${y}Z`} fill="#f1cc7d" />
      ))}
      <circle cx="115" cy="161" r="88" fill={`url(#${g('halo')})`} />
      <circle cx="115" cy="161" r="62" fill="#1c1030" stroke="#f1cc7d" strokeWidth="4" />
      <circle cx="115" cy="161" r="54" fill="none" stroke="#a99ad0" strokeWidth="1.5" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <circle key={i} cx={115 + 58 * Math.cos(a)} cy={161 + 58 * Math.sin(a)} r="2" fill="#f1cc7d" />;
      })}
      <text x="115" y="180" textAnchor="middle" fontFamily="'Alfa Slab One', 'Rockwell', serif" fontSize="52" fill="#f1cc7d">CF</text>
      <path d="M86 126 L95 112 L104 124 L115 108 L126 124 L135 112 L144 126Z" fill="#d6a6ff" />
      <g transform="translate(115 214)">
        <rect x="-11" y="-11" width="22" height="22" rx="5" fill="#fbf6e9" transform="rotate(12)" />
        <circle cx="-4" cy="-4" r="2.4" fill="#c8312b" transform="rotate(12)" /><circle cx="4" cy="4" r="2.4" fill="#c8312b" transform="rotate(12)" />
      </g>
    </svg>
  );
}

/** Piège posé face cachée (rayures violettes et point d'interrogation). */
export function TrapBack({ width = 34, className, style }: { width?: number; className?: string; style?: CSSProperties }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const id = `cf-trap-${uid}`;
  return (
    <svg className={cx('cf-trap', className)} style={style} width={width} height={Math.round(width * 46 / 34)} viewBox="0 0 34 46" role="img" aria-label="Piège posé" focusable="false">
      <defs>
        <pattern id={id} width="8.5" height="8.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8.5" height="8.5" fill="#2a1a40" /><rect width="4.25" height="8.5" fill="#3b2457" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width="33" height="45" rx="5.5" fill={`url(#${id})`} />
      <rect x="1.5" y="1.5" width="31" height="43" rx="4.5" fill="none" stroke="#a99ad0" strokeWidth="2" />
      <text x="17" y="30" textAnchor="middle" fontFamily="'Alfa Slab One', 'Rockwell', serif" fontSize="20" fill="#d6a6ff">?</text>
    </svg>
  );
}

/** Le sachet du booster (5 cartes) : papier métallisé violet, bords sertis, emblème « CF ». */
export function BoosterPack({ width = 160, count = 5, className, style }: { width?: number; count?: number; className?: string; style?: CSSProperties }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const g = (n: string) => `cf-pack-${n}-${uid}`;
  const teeth = (y: number, dir: 1 | -1) => {
    let d = `M6 ${y}`;
    for (let x = 6; x < 154; x += 8) d += ` L${x + 4} ${y + 6 * dir} L${x + 8} ${y}`;
    return d;
  };
  return (
    <svg className={cx('cf-pack', className)} style={style} width={width} height={Math.round(width * 220 / 160)} viewBox="0 0 160 220" role="img" aria-label={`Booster de ${count} cartes`} focusable="false">
      <defs>
        <linearGradient id={g('foil')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6b46a3" /><stop offset=".45" stopColor="#3b2457" /><stop offset=".6" stopColor="#5a3b85" /><stop offset="1" stopColor="#1c1030" />
        </linearGradient>
        <linearGradient id={g('shine')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" /><stop offset=".5" stopColor="#ffffff" stopOpacity=".32" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={g('clip')}><path d="M4 6 L156 6 L156 214 L4 214Z" /></clipPath>
        <linearGradient id={g('crimp')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1cc7d" /><stop offset="1" stopColor="#b8892c" /></linearGradient>
      </defs>
      <path d={`M6 18 L154 18 L156 202 L4 202Z`} fill={`url(#${g('foil')})`} />
      <rect x="6" y="6" width="148" height="14" fill={`url(#${g('crimp')})`} />
      <path d={teeth(6, -1)} fill="none" stroke="#b8892c" strokeWidth="1.5" />
      <rect x="4" y="200" width="152" height="14" fill={`url(#${g('crimp')})`} />
      <path d={teeth(214, 1)} fill="none" stroke="#b8892c" strokeWidth="1.5" />
      <g stroke="#8a6418" strokeWidth="1" opacity=".6">{Array.from({ length: 18 }, (_, i) => <path key={i} d={`M${10 + i * 8} 8 L${10 + i * 8} 18 M${10 + i * 8} 202 L${10 + i * 8} 212`} />)}</g>
      {/* éventail des quatre familles */}
      {[['#2f7a55', -24], ['#a3263a', -8], ['#5a3b85', 8], ['#2c54c2', 24]].map(([c, r], i) => (
        <rect key={i} x="62" y="40" width="36" height="50" rx="5" fill={c as string} stroke="#f1cc7d" strokeWidth="1.5" transform={`rotate(${r} 80 110)`} />
      ))}
      <circle cx="80" cy="118" r="30" fill="#1c1030" stroke="#f1cc7d" strokeWidth="3" />
      <text x="80" y="130" textAnchor="middle" fontFamily="'Alfa Slab One', 'Rockwell', serif" fontSize="30" fill="#f1cc7d">CF</text>
      <text x="80" y="170" textAnchor="middle" fontFamily="'Alfa Slab One', 'Rockwell', serif" fontSize="15" fill="#fbf6e9">Coups Fourrés</text>
      <rect x="50" y="178" width="60" height="16" rx="8" fill="#f1cc7d" />
      <text x="80" y="190" textAnchor="middle" fontFamily="'Barlow Condensed', 'Barlow', sans-serif" fontWeight="800" fontSize="12" fill="#2a1a05">{count} CARTES</text>
      <path d="M-20 200 L60 18 L90 18 L10 200Z" fill={`url(#${g('shine')})`} clipPath={`url(#${g('clip')})`} />
      <path d="M6 18 L154 18 L156 202 L4 202Z" fill="none" stroke="#d6a6ff" strokeOpacity=".5" strokeWidth="1.5" />
    </svg>
  );
}
