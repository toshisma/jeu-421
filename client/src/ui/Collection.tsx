import { monthNameL } from '../i18n/data';
import { tr } from '../i18n/lang';
import { ALBUM, ALBUM_FULL_COINS, type MonthRecap } from '../../../shared/progress/profile';
import type { ProfileApi } from '../account/useProfile';
import { DiceRow } from './MiniDie';
import type { MessageKey } from '../../../shared/i18n';
import { Empty, Shell } from './kit';
import { trn } from '../i18n/g421';

/** Album des combinaisons : chaque combinaison réussie au moins une fois se colle dans l'album. */
export function AlbumScreen({ pa, onBack }: { pa: ProfileApi; onBack: () => void }) {
  const have = new Set(pa.profile.album ?? []);
  const pages = new Set(pa.profile.albumPages ?? []);
  const total = ALBUM.reduce((n, a) => n + a.keys.length, 0);
  return (
    <Shell title={tr('g421.menu.album')} onBack={onBack} icon="album" sub={trn('g421.al.count', have.size, { t: total })}>
      <div className="pass-hero">
        <span className="pass-tier"><b>{have.size}</b><small>{tr('g421.al.of', { t: total })}</small></span>
        <div className="pass-hero-main">
          <span className="pv-lvl-bar gold"><i style={{ width: `${(100 * have.size) / total}%` }} /></span>
          <small className="k-hint">{tr('g421.al.hint', { n: ALBUM_FULL_COINS })}</small>
        </div>
      </div>
      {ALBUM.map((page) => (
        <section key={page.id} className={`album-page${pages.has(page.id) ? ' done' : ''}`}>
          <header><h3>{tr(`g421.al.page.${page.id}` as MessageKey)}</h3><span>{pages.has(page.id) ? tr('g421.al.done') : tr('g421.al.pageOf', { a: page.keys.filter((k) => have.has(k)).length, b: page.keys.length })}, {tr('g421.sch.feeCoins', { n: page.coins })}</span></header>
          <ul>
            {page.keys.map((k) => (
              <li key={k} className={have.has(k) ? 'got' : ''}>
                <DiceRow dice={k.split('').map(Number)} size={26} />
                <small>{have.has(k) ? k.split('').join('-') : '?'}</small>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

function MonthCard({ m }: { m: MonthRecap }) {
  const fav = Object.entries(m.opp).sort((a, b) => b[1] - a[1])[0];
  const maxH = Math.max(1, ...m.hours);
  const favH = m.hours.indexOf(Math.max(...m.hours));
  return (
    <section className="recap">
      <h3>{monthNameL(m.id).replace(/^./, (c) => c.toUpperCase())}</h3>
      <div className="pv-stats">
        <div><b>{m.played}</b><small>{tr('app.parties_2')}</small></div>
        <div><b>{pct(m.won, m.played)} %</b><small>{tr('app.de_victoires')}</small></div>
        <div><b>{m.c421}</b><small>4-2-1</small></div>
        <div><b>{m.best?.label ?? '–'}</b><small>{tr('app.meilleur_coup')}</small></div>
      </div>
      <ul className="recap-lines">
        {fav && <li>{tr('app.adversaire_prefere')} <b>{fav[0]}</b> ({fav[1]} {tr(fav[1] > 1 ? 'app.partie.p' : 'app.partie')}</li>}
        {m.played > 0 && <li>{tr('app.vous_jouez_surtout')} <b>{tr('app.vers_h', { favH })}</b>.</li>}
      </ul>
      <div className="hours" aria-label={tr('app.parties_par_heure')}>
        {m.hours.map((h, i) => <i key={i} style={{ height: `${(100 * h) / maxH}%` }} title={tr(h > 1 ? 'app.h_partie.p' : 'app.h_partie', { i, h })} />)}
      </div>
      <div className="hours-axis"><span>{tr('app.0_h')}</span><span>{tr('app.6_h')}</span><span>{tr('app.12_h')}</span><span>{tr('app.18_h')}</span><span>{tr('app.23_h')}</span></div>
    </section>
  );
}

/** Récap du mois (et du mois précédent). Pour soi : rien n'est partagé. */
export function RecapScreen({ pa, onBack }: { pa: ProfileApi; onBack: () => void }) {
  const { month, prevMonth } = pa.profile;
  return (
    <Shell title={tr('app.votre_recap')} onBack={onBack} icon="chart" sub={tr('app.pour_vous_seul_rien_n_est_partage')}>
      {!month && !prevMonth && <Empty icon="chart">{tr('app.jouez_quelques_parties_votre_recap_d')}</Empty>}
      {month && <MonthCard m={month} />}
      {prevMonth && <MonthCard m={prevMonth} />}
    </Shell>
  );
}
