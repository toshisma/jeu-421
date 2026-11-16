/**
 * Écran « Campagnes » : les campagnes solo des quatre jeux, avec leur progression et leur prochaine étape.
 * Ouvert depuis le bloc Campagne de l'accueil et depuis le menu « Plus ». Une campagne « bientôt » est masquée.
 */
import { readyCampaigns, summarize } from '../../../shared/campaigns';
import type { ProfileApi } from '../account/useProfile';
import { tr, useLang } from '../i18n/lang';
import { ModeBar } from '../ui/ModeBar';
import { GAME_ICON, GAME_TONE, gameName, goLabel, nextLine, trKey } from './HomeCard';
import { noteLastGame } from './lastGame';

export function CampaignsScreen({ pa, onBack, onOpen }: { pa: ProfileApi; onBack: () => void; onOpen: (id: string) => void }) {
  useLang();
  const camps = readyCampaigns().map((c) => ({ c, s: summarize(c, pa.profile) }));
  const total = camps.reduce((n, x) => n + x.s.stars, 0);
  const max = camps.reduce((n, x) => n + x.s.maxStars, 0);
  return (
    <div className="home2 v2 camp-screen">
      <ModeBar tone="classique" title={tr('chm.title')} onBack={onBack} />
      <main className="camp-list-main">
        <header className="camp-list-head">
          <h1>{tr('chm.title')}</h1>
          <p>{tr('chm.sub')}</p>
          <span className="camp-total" aria-label={tr('chm.starsAria', { n: total, max })}><span aria-hidden>★</span> {total}<small>/{max}</small></span>
          {!pa.isAccount && <p className="camp-guest">{tr('chm.guest')}</p>}
        </header>
        <ul className="camp-list">
          {camps.map(({ c, s }) => (
            <li key={c.id}>
              <button className={`camp-card ${GAME_TONE[c.game]}`} onClick={() => { noteLastGame(c.game); onOpen(c.id); }}>
                <span className="camp-ic big" aria-hidden>{GAME_ICON[c.game]}</span>
                <span className="camp-card-text">
                  <small className="camp-card-game">{gameName(c.game)}</small>
                  <b>{trKey(c.nameKey)}</b>
                  <small>{nextLine(s)}</small>
                  <span className="tile-bar"><i style={{ width: `${(100 * s.stars) / Math.max(1, s.maxStars)}%` }} /></span>
                </span>
                <span className="camp-card-side">
                  <span className="camp-stars" aria-label={tr('chm.starsAria', { n: s.stars, max: s.maxStars })}><span aria-hidden>★</span>{s.stars}<small>/{s.maxStars}</small></span>
                  <em className="camp-go">{goLabel(s)}</em>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
