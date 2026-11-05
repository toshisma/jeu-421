/**
 * Coups Fourrés : les 5 types de cartes, avec une icône et une couleur FIXES partout
 * (cartes, main, annonces, fiche, journal, règles). Prototypes validés par Sam (CFN*).
 */
import type { CardType } from '../../../shared/cards/catalog';

export interface TypeMeta {
  label: string;
  /** Couleur fixe du type (texte, icône, liseré). */
  color: string;
  /** Moment où la carte se joue, en quelques mots (ligne de type des grandes cartes). */
  moment: string;
  /** Définition en une phrase (légende des 5 types). */
  def: string;
}

export const TYPE_META: Record<CardType, TypeMeta> = {
  coup: { label: 'Coup', color: '#f1cc7d', moment: 'Pendant votre tour', def: 'Pendant votre tour, avant ou après un lancer.' },
  piege: { label: 'Piège', color: '#d6a6ff', moment: 'Se pose pendant votre tour', def: 'Posé face cachée pendant votre tour ; se déclenche tout seul chez l’adversaire.' },
  riposte: { label: 'Riposte', color: '#7cc4ff', moment: 'En réponse à l’adversaire', def: 'En réponse à une carte de l’adversaire, même pendant son tour.' },
  'dernier-mot': { label: 'Dernier mot', color: '#ff9fb2', moment: 'Quand les dés sont posés', def: 'Quand les deux combinaisons sont posées, avant les comptes.' },
  habitue: { label: 'Habitué', color: '#7fe0b2', moment: 'Reste 3 manches', def: 'S’installe devant vous et agit pendant 3 manches (celle où il arrive comprise), puis rentre chez lui.' },
};

export const TYPE_ORDER: CardType[] = ['coup', 'piege', 'riposte', 'dernier-mot', 'habitue'];

/** Icône d'un type : éclair (Coup), mâchoire (Piège), bouclier (Riposte), bulle (Dernier mot), personnage (Habitué). */
export function TypeIcon({ type, size = 14, color, className }: { type: CardType; size?: number; color?: string; className?: string }) {
  const c = color ?? TYPE_META[type].color;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ color: c, flex: 'none' }}>
      {type === 'coup' && <path d="M13 2 L5 13 h6 l-2 9 8-12 h-6z" fill="currentColor" stroke="none" />}
      {type === 'piege' && <><path d="M3 15 h18 M5 15 l2-6 2 6 2-6 2 6 2-6 2 6 2-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M3 15 q9 7 18 0" fill="none" stroke="currentColor" strokeWidth="2" /></>}
      {type === 'riposte' && <path d="M12 2 L20 5 V11 Q20 18 12 22 Q4 18 4 11 V5Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />}
      {type === 'dernier-mot' && <><path d="M4 5 h16 v10 H10 l-5 4 v-4 H4z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /><path d="M8 10 h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></>}
      {type === 'habitue' && <><circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M4 21 a8 8 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth="2.2" /></>}
    </svg>
  );
}

/** Étiquette « icône + Type » à la couleur du type (option : « · moment »). */
export function TypeTag({ type, moment, size = 12, className }: { type: CardType; moment?: boolean; size?: number; className?: string }) {
  const m = TYPE_META[type];
  return (
    <span className={`cfn-typetag${className ? ` ${className}` : ''}`} style={{ color: m.color }}>
      <TypeIcon type={type} size={size} />{m.label}{moment ? ` · ${m.moment}` : ''}
    </span>
  );
}

/** Légende des 5 types (fiche de carte, aide « ? », règles). */
export function TypeLegend({ highlight, title = 'Les 5 types de cartes' }: { highlight?: CardType; title?: string | null }) {
  return (
    <div className="cfn-legend">
      {title && <b className="cfn-legend-title">{title}</b>}
      {TYPE_ORDER.map((t) => (
        <div key={t} className={`cfn-legend-row${highlight === t ? ' on' : ''}`} style={highlight === t ? { borderColor: TYPE_META[t].color } : undefined}>
          <span className="cfn-legend-ic"><TypeIcon type={t} size={18} /></span>
          <span className="cfn-legend-txt"><b style={{ color: TYPE_META[t].color }}>{TYPE_META[t].label}</b><small>{TYPE_META[t].def}</small></span>
        </div>
      ))}
    </div>
  );
}
