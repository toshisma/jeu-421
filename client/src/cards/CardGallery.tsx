/**
 * TEMPORAIRE : planche de relecture des cartes « Coups Fourrés » (ouverte par `?cf-gallery=1`).
 * Sert aux captures et à la relecture par Sam ; à retirer quand les vrais écrans du mode existent.
 * `?cf-gallery=1&vue=cartes|main|objets` n'affiche qu'une partie (pour les captures).
 */
import { useState } from 'react';
import { CARDS } from '../../../shared/cards/catalog';
import { BoosterPack, CapsuleIcon, CardBack, CardView, FamilyBadge, HandFan, MiniCard, RarityGem, TrapBack } from './components';

const HAND = ['tournee-patron', 'fouine', 'tete-tourne', 'reaction-chaine', 'bon-numero', 'patron', 'gueule-bois'];

export function CardGallery() {
  const vue = new URLSearchParams(location.search).get('vue');
  const [sel, setSel] = useState(2);
  const all = !vue;
  return (
    <div className="cf-gallery">
      {all && <h1>Coups Fourrés · les 34 cartes</h1>}
      {(all || vue === 'cartes') && (
        <section id="cf-g-cartes">
          <div className="cf-g-grid">
            {CARDS.map((c) => <CardView key={c.id} id={c.id} />)}
          </div>
        </section>
      )}
      {(all || vue === 'etats') && (
        <section id="cf-g-etats">
          <h2>États</h2>
          <div className="cf-g-row">
            <CardView id="retournement-veste" shiny />
            <CardView id="patron" isNew />
            <CardView id="cul-sec" count={2} selected />
            <CardView id="domino" dimmed />
            <CardView id="grand-enchainement" width={150} shiny />
            <CardView id="josiane" width={110} />
          </div>
        </section>
      )}
      {(all || vue === 'main') && (
        <section id="cf-g-main">
          <h2>Main de 7 cartes</h2>
          <div className="cf-g-hand">
            <HandFan>
              {HAND.map((id, i) => (
                <MiniCard key={i} id={id} playable={i !== 4 && i !== 5} disabled={i === 4 || i === 5} selected={sel === i} onClick={() => setSel(i)} />
              ))}
            </HandFan>
          </div>
          <div className="cf-g-hand">
            <HandFan>
              {HAND.slice(0, 5).map((id, i) => <MiniCard key={i} id={id} playable shiny={i === 1} isNew={i === 3} />)}
            </HandFan>
          </div>
        </section>
      )}
      {(all || vue === 'objets') && (
        <section id="cf-g-objets">
          <h2>Dos, piège, booster, capsule</h2>
          <div className="cf-g-row cf-g-objets">
            <CardBack width={160} />
            <CardBack />
            <TrapBack width={68} />
            <TrapBack />
            <BoosterPack />
            <span className="cf-g-cap"><CapsuleIcon size={64} /><CapsuleIcon size={26} /><b>340</b></span>
          </div>
          <div className="cf-g-row">
            <FamilyBadge family="habitues" /><FamilyBadge family="ivresse" /><FamilyBadge family="pieges" /><FamilyBadge family="chaines" short />
            <RarityGem rarity="commune" label /><RarityGem rarity="rare" label /><RarityGem rarity="epique" label /><RarityGem rarity="legendaire" label />
          </div>
        </section>
      )}
    </div>
  );
}
