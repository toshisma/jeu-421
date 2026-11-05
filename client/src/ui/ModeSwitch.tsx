/**
 * Sélecteur de mode, au même endroit sur l'accueil du 421 classique et dans le menu de Coups Fourrés
 * (juste sous la barre du haut) : seul l'onglet allumé change.
 */
export function ModeSwitch({ active, onClassic, onCards }: { active: 'classique' | 'cartes'; onClassic: () => void; onCards: () => void }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Mode de jeu">
      <button role="tab" aria-selected={active === 'classique'} className={`ms-tab classique${active === 'classique' ? ' on' : ''}`} onClick={active === 'classique' ? undefined : onClassic}>
        <span className="ms-plate" aria-hidden>421</span>Classique
      </button>
      <button role="tab" aria-selected={active === 'cartes'} className={`ms-tab cartes${active === 'cartes' ? ' on' : ''}`} onClick={active === 'cartes' ? undefined : onCards}>
        <span className="ms-fan" aria-hidden><i className="h" /><i className="v" /><i className="p" /></span>Coups Fourrés
        {active === 'classique' && <em className="ms-new">Nouveau</em>}
      </button>
    </div>
  );
}
