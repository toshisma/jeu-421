import { ALBUM, ALBUM_FULL_COINS, monthName, type MonthRecap } from '../../../shared/progress/profile';
import type { ProfileApi } from '../account/useProfile';
import { DiceRow } from './MiniDie';
import { Shell } from './Screens';

/** Album des combinaisons : chaque combinaison réussie au moins une fois se colle dans l'album. */
export function AlbumScreen({ pa, onBack }: { pa: ProfileApi; onBack: () => void }) {
  const have = new Set(pa.profile.album ?? []);
  const pages = new Set(pa.profile.albumPages ?? []);
  const total = ALBUM.reduce((n, a) => n + a.keys.length, 0);
  return (
    <Shell title="Album des combinaisons" onBack={onBack}>
      <p className="muted">Réussissez chaque combinaison au moins une fois, en solo ou en ligne (la mort subite ne compte pas).
        Chaque page complétée rapporte des pièces ; l'album complet débloque des dés « Collectionneur » et un titre, plus {ALBUM_FULL_COINS} pièces.</p>
      <div className="pass-total"><b>{have.size}</b> sur {total}</div>
      {ALBUM.map((page) => (
        <section key={page.id} className={`album-page${pages.has(page.id) ? ' done' : ''}`}>
          <header><h3>{page.name}</h3><span>{pages.has(page.id) ? 'Complète' : `${page.keys.filter((k) => have.has(k)).length} sur ${page.keys.length}`}, {page.coins} pièces</span></header>
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
      <h3>{monthName(m.id).replace(/^./, (c) => c.toUpperCase())}</h3>
      <div className="pv-stats">
        <div><b>{m.played}</b><small>parties</small></div>
        <div><b>{pct(m.won, m.played)} %</b><small>de victoires</small></div>
        <div><b>{m.c421}</b><small>4-2-1</small></div>
        <div><b>{m.best?.label ?? '–'}</b><small>meilleur coup</small></div>
      </div>
      <ul className="recap-lines">
        {fav && <li>Adversaire préféré : <b>{fav[0]}</b> ({fav[1]} partie{fav[1] > 1 ? 's' : ''})</li>}
        {m.played > 0 && <li>Vous jouez surtout <b>vers {favH} h</b>.</li>}
      </ul>
      <div className="hours" aria-label="Parties par heure">
        {m.hours.map((h, i) => <i key={i} style={{ height: `${(100 * h) / maxH}%` }} title={`${i} h : ${h} partie${h > 1 ? 's' : ''}`} />)}
      </div>
      <div className="hours-axis"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
    </section>
  );
}

/** Récap du mois (et du mois précédent). Pour soi : rien n'est partagé. */
export function RecapScreen({ pa, onBack }: { pa: ProfileApi; onBack: () => void }) {
  const { month, prevMonth } = pa.profile;
  return (
    <Shell title="Votre récap" onBack={onBack}>
      {!month && !prevMonth && <p className="empty">Jouez quelques parties : votre récap du mois se remplira au fil du jeu.</p>}
      {month && <MonthCard m={month} />}
      {prevMonth && <MonthCard m={prevMonth} />}
    </Shell>
  );
}
