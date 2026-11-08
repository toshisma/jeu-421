/**
 * Fenêtres de l'invitation à créer un compte (chargées à la demande) :
 *  - GuestInvitePopup : après une partie, pour les invités. Elle ne se ferme jamais toute seule :
 *    croix bien visible, « Plus tard », touche Échap ou toucher à côté.
 *  - WelcomeGiftPopup : au premier passage après la création du compte, les 3 sacs de dés et les
 *    3 boosters Coups Fourrés offerts, avec accès direct à leur ouverture.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { BagIcon } from './BagIcon';
import { Icon } from './Icon';
import { BoosterPack } from '../cards/components';
import type { InviteGame, WelcomeGift } from './guestInvite';

/** Illustration : trois sacs de dés et trois boosters, sous une lumière de comptoir. */
function GiftArt({ small, bags = true, packs = true }: { small?: boolean; bags?: boolean; packs?: boolean }) {
  const bag = small ? 46 : 54;
  const pack = small ? 38 : 44;
  return (
    <div className={`gi-art${small ? ' small' : ''}`} aria-hidden>
      <span className="gi-glow" />
      {bags && <div className="gi-group gi-bags">
        <span className="gi-b gi-b1"><BagIcon size={bag} color="bleu" /></span>
        <span className="gi-b gi-b3"><BagIcon size={bag} color="vert" /></span>
        <span className="gi-b gi-b2"><BagIcon size={bag + 12} color="rouge" /></span>
        <em className="gi-count">×3</em>
      </div>}
      {bags && packs && <span className="gi-plus">+</span>}
      {packs && <div className="gi-group gi-packs">
        <span className="gi-p gi-p1"><BoosterPack width={pack} /></span>
        <span className="gi-p gi-p3"><BoosterPack width={pack} /></span>
        <span className="gi-p gi-p2"><BoosterPack width={pack + 6} /></span>
        <em className="gi-count">×3</em>
      </div>}
    </div>
  );
}

/** Fenêtre commune : voile, carte, croix, Échap, toucher à côté. */
function Popup({ onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); } };
    window.addEventListener('keydown', onKey, true);
    const prev = document.activeElement as HTMLElement | null;
    // Le focus va sur la fenêtre (lecteurs d'écran, Tab), sans cadre de focus sur un bouton au toucher.
    card.current?.focus({ preventScroll: true });
    return () => { window.removeEventListener('keydown', onKey, true); prev?.focus?.({ preventScroll: true }); };
  }, []);
  return (
    <div className="gi-veil" role="dialog" aria-modal="true" aria-labelledby="gi-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gi-card" ref={card} tabIndex={-1}>
        <span className="gi-rays" aria-hidden />
        <button type="button" className="gi-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={22} /></button>
        {children}
      </div>
    </div>
  );
}

const LEAD: Record<InviteGame, string> = {
  '421': 'Belle partie !',
  cf: 'Belle partie de cartes !',
  courtisan: 'Belle partie de Courtisan !',
};

export function GuestInvitePopup({ game, onCreate, onClose }: { game: InviteGame; onCreate: () => void; onClose: () => void }) {
  return (
    <Popup label="Créez un compte gratuit" onClose={onClose}>
      <p className="gi-kicker">{LEAD[game]}</p>
      <h2 id="gi-title" className="gi-title">Un cadeau vous attend</h2>
      <GiftArt />
      <p className="gi-offer">Créez un compte gratuit : <b>3 sacs de dés + 3 boosters Coups Fourrés</b> offerts</p>
      <ul className="gi-perks">
        <li><span className="gi-ic"><Icon name="album" size={18} /></span>Agrandissez votre collection de dés et de cartes</li>
        <li><span className="gi-ic"><Icon name="lock" size={18} /></span>Progression sauvegardée, sur tous vos appareils</li>
        <li><span className="gi-ic"><Icon name="trophy" size={18} /></span>Parties en ligne, classées et tournois</li>
        <li><span className="gi-ic"><Icon name="people" size={18} /></span>Amis, messages et Groschen au Courtisan</li>
      </ul>
      <button type="button" className="btn big gi-cta" onClick={onCreate}><Icon name="plus" size={20} /> Créer un compte</button>
      <p className="gi-fine">Gratuit, sans adresse e-mail, en une minute.</p>
      <button type="button" className="btn ghost small gi-later" onClick={onClose}>Plus tard</button>
    </Popup>
  );
}

export function WelcomeGiftPopup({ gift, bags, onBags, onBoosters, onClose }: {
  gift: WelcomeGift; bags: number; onBags: () => void; onBoosters: () => void; onClose: () => void;
}) {
  const both = gift.bags && gift.boosters;
  return (
    <Popup label="Votre cadeau de bienvenue" onClose={onClose}>
      <p className="gi-kicker">Bienvenue, {gift.user} !</p>
      <h2 id="gi-title" className="gi-title">{both ? '3 sacs de dés et 3 boosters vous attendent' : gift.bags ? 'Vos sacs de dés vous attendent' : 'Vos 3 boosters vous attendent'}</h2>
      <GiftArt small bags={gift.bags} packs={gift.boosters} />
      <p className="gi-offer">Ouvrez-les quand vous voulez : leur contenu est tiré au hasard, à l'ouverture.</p>
      <div className="gi-gifts">
        {gift.bags && (
          <button type="button" className="btn big gi-cta" onClick={onBags}>
            <BagIcon size={26} /> Ouvrir mes sacs de dés{bags > 0 ? ` (${bags})` : ''}
          </button>
        )}
        {gift.boosters && (
          <button type="button" className="btn big gi-cta violet" onClick={onBoosters}>
            <Icon name="cards" size={22} /> Ouvrir mes 3 boosters
          </button>
        )}
      </div>
      <button type="button" className="btn ghost small gi-later" onClick={onClose}>Plus tard</button>
      <p className="gi-fine">Vos sacs restent dans la Collection, vos boosters dans Coups Fourrés.</p>
    </Popup>
  );
}
