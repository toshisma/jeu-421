/**
 * Campagnes solo sur l'accueil (zone i18n `chm.`) :
 *  - CampaignHomeCard : bloc « Campagne » posé en bas de la vitrine 3D (remplace l'ancienne pastille de la
 *    Tournée) : campagne du dernier jeu ouvert (ou la Tournée), prochaine étape, étoiles, gros bouton
 *    « Continuer », pastilles pour passer d'une campagne à l'autre, accès à l'écran « Campagnes » ;
 *  - CampaignStars : petite indication « ★ 5/36 » sur la carte d'un jeu ;
 *  - helpers communs (nom d'un jeu, icône, texte de la prochaine étape) pour l'écran « Campagnes ».
 * Une campagne « bientôt » (maxStars = 0) n'apparaît nulle part.
 */
import { useState } from 'react';
import { DICTS, type MessageKey } from '../../../shared/i18n';
import { homeCampaign, readyCampaigns, summarize, type Campaign, type CampaignGame, type CampaignSummary } from '../../../shared/campaigns';
import type { Profile } from '../../../shared/progress/profile';
import { tr } from '../i18n/lang';
import { Icon } from '../ui/Icon';
import { lastGame, noteLastGame } from './lastGame';

/** Texte d'une clé venue d'un fichier de campagne (vide si la clé n'existe pas encore). */
export const trKey = (k: string): string => (k in DICTS.fr ? tr(k as MessageKey) : '');

export const GAME_TONE: Record<CampaignGame, 'classique' | 'cartes' | 'dixmille' | 'poker'> = { '421': 'classique', cf: 'cartes', dm: 'dixmille', pm: 'poker' };
export const GAME_ICON: Record<CampaignGame, string> = { '421': '🍺', cf: '🃏', dm: '👑', pm: '🎭' };
export const gameName = (g: CampaignGame): string => (g === '421' ? tr('app.421_classique') : g === 'cf' ? 'Coups Fourrés' : g === 'dm' ? tr('app.le_courtisan') : tr('pm.name'));

/** Ligne « prochaine étape » d'une campagne. */
export function nextLine(s: CampaignSummary): string {
  const name = s.next ? trKey(s.next.nameKey) : '';
  if (!s.next || !name) return s.done ? tr('chm.done') : tr('chm.locked');
  if (s.done) return tr('chm.more', { name });
  return tr(s.stars ? 'chm.next' : 'chm.first', { name });
}
/** Libellé du bouton d'une campagne. */
export const goLabel = (s: CampaignSummary): string => tr(s.stars === 0 ? 'chm.start' : s.done && !s.next ? 'chm.see' : 'chm.continue');

export function CampaignHomeCard({ profile, onOpen, onAll }: { profile: Profile; onOpen: (id: string) => void; onAll: () => void }) {
  const [pick, setPick] = useState<CampaignGame | null>(lastGame);
  const camps = readyCampaigns();
  const c: Campaign = homeCampaign(pick);
  const s = summarize(c, profile);
  const name = trKey(c.nameKey);
  const choose = (g: CampaignGame) => { noteLastGame(g); setPick(g); };
  return (
    <section className={`camp-home ${GAME_TONE[c.game]}`} aria-label={tr('chm.eyebrow')}>
      <div className="camp-home-top">
        <span className="camp-eyebrow">{tr('chm.eyebrow')}</span>
        {camps.length > 1 && <span className="camp-pills" role="group" aria-label={tr('chm.all')}>
          {camps.map((x) => {
            const xs = summarize(x, profile);
            return (
              <button key={x.id} className={`camp-pill ${GAME_TONE[x.game]}${x.id === c.id ? ' on' : ''}`} aria-pressed={x.id === c.id}
                aria-label={tr('chm.pickAria', { name: trKey(x.nameKey), n: xs.stars, max: xs.maxStars })} onClick={() => choose(x.game)}>
                <span aria-hidden>{GAME_ICON[x.game]}</span><b aria-hidden>{xs.stars}</b>
              </button>
            );
          })}
        </span>}
        <button className="camp-all" onClick={onAll} aria-label={tr('chm.all')} title={tr('chm.all')}><Icon name="history" size={16} /></button>
      </div>
      <div className="camp-home-row">
        <button className="camp-home-main" onClick={() => onOpen(c.id)}>
          <span className="camp-ic" aria-hidden>{GAME_ICON[c.game]}</span>
          <span className="camp-home-text">
            <b>{name}</b>
            <small><span className="camp-stars" aria-label={tr('chm.starsAria', { n: s.stars, max: s.maxStars })}><span aria-hidden>★</span>{s.stars}<small>/{s.maxStars}</small></span> · {nextLine(s)}</small>
          </span>
        </button>
        <button className="camp-go" onClick={() => onOpen(c.id)}>{goLabel(s)}</button>
      </div>
    </section>
  );
}

/** « ★ 5/36 » sur la carte d'un jeu de l'accueil (rien si le jeu n'a pas encore de campagne). */
export function campaignStarsOf(profile: Profile, g: CampaignGame): { stars: number; max: number } | undefined {
  const c = readyCampaigns().find((x) => x.game === g);
  if (!c) return undefined;
  const s = summarize(c, profile);
  return { stars: s.stars, max: s.maxStars };
}
