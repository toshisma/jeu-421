/**
 * En-tête commun des trois menus de mode (421 classique, Coups Fourrés, Le Courtisan) : retour au
 * menu principal à gauche, nom du mode, puis ce qui ne concerne que ce mode (sa monnaie, ses
 * règles). Le général (amis, boutique, collection, réglages…) est dans le menu principal.
 */
import { Icon } from './Icon';

export type ModeTone = 'classique' | 'cartes' | 'dixmille';

export function ModeBar({ tone, title, onBack, children }: {
  tone: ModeTone; title: string; onBack: () => void;
  /** À droite : monnaie du mode, règles, amis… */
  children?: React.ReactNode;
}) {
  return (
    <header className={`mode-bar ${tone}`}>
      <button className="mode-back" onClick={onBack} aria-label="Retour au menu principal">
        <Icon name="back" size={20} /><span>Menu</span>
      </button>
      {/* Le nom du mode est déjà en grand juste dessous (vitrine) : ici, seulement pour les lecteurs d'écran. */}
      <span className="sr-only">{title}</span>
      <span className="mode-bar-fill" />
      <span className="mode-bar-right">{children}</span>
    </header>
  );
}

/** Petite pastille de l'en-tête (monnaie du mode, joueurs en ligne…). */
export function ModeChip({ children, onClick, label }: { children: React.ReactNode; onClick?: () => void; label?: string }) {
  return onClick
    ? <button className="mode-chip" onClick={onClick} aria-label={label}>{children}</button>
    : <span className="mode-chip" aria-label={label}>{children}</span>;
}
