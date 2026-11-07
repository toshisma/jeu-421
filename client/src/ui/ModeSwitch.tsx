/**
 * Sélecteur de mode, au même endroit sur l'accueil du 421 classique, dans le menu de Coups Fourrés
 * et dans celui du Courtisan (juste sous la barre du haut) : seul l'onglet allumé change.
 */
export type GameMode = 'classique' | 'cartes' | 'dixmille';

export function ModeSwitch({ active, onClassic, onCards, onDixMille }: {
  active: GameMode; onClassic: () => void; onCards: () => void;
  /** Le Courtisan (troisième onglet, s'il est disponible). */
  onDixMille?: () => void;
}) {
  const three = !!onDixMille;
  return (
    <div className={`mode-switch${three ? ' three' : ''}`} role="tablist" aria-label="Mode de jeu">
      <button role="tab" aria-selected={active === 'classique'} className={`ms-tab classique${active === 'classique' ? ' on' : ''}`} onClick={active === 'classique' ? undefined : onClassic}>
        <span className="ms-plate" aria-hidden>421</span>Classique
      </button>
      <button role="tab" aria-selected={active === 'cartes'} className={`ms-tab cartes${active === 'cartes' ? ' on' : ''}`} onClick={active === 'cartes' ? undefined : onCards}>
        <span className="ms-fan" aria-hidden><i className="h" /><i className="v" /><i className="p" /></span>Coups Fourrés
        {active === 'classique' && !three && <em className="ms-new">Nouveau</em>}
      </button>
      {onDixMille && (
        <button role="tab" aria-selected={active === 'dixmille'} className={`ms-tab dixmille${active === 'dixmille' ? ' on' : ''}`} onClick={active === 'dixmille' ? undefined : onDixMille}>
          <span className="ms-dice" aria-hidden><i /><i /></span>Courtisan
          {active !== 'dixmille' && <em className="ms-new">Nouveau</em>}
        </button>
      )}
    </div>
  );
}
