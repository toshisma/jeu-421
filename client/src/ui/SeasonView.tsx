import { ofMonthL } from '../i18n/data';
import { tr } from '../i18n/lang';
import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { getItem } from '../../../shared/progress/catalog';
import type { Division } from '../../../shared/season';
import { DieCube } from './DiceCollection';

interface Season {
  season: string; endsOn: string; divisions: Division[]; dieFrom: string; titleFrom: string; die: string;
  me: { points: number; games: number; wins: number; division: string; rank: number | null } | null;
  top: { rank: number; username: string; points: number; games: number; wins: number; division: string }[];
}
const DIV_COLOR: Record<string, string> = { comptoir: '#9aa5ab', terrasse: '#7bd389', salle: '#4f9dff', arriere: '#b26bff', patron: '#f2b632' };

/** Saison classée du mois : division, points, récompenses, meilleurs joueurs. */
export function SeasonView({ pa, onOpen }: { pa: ProfileApi; onOpen: (username: string) => void }) {
  const [s, setS] = useState<Season | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<Season>('/season', { token: pa.token }).then(setS).catch((e) => setErr(e.message)); }, [pa.token]);
  if (err) return <p className="error">{err}</p>;
  if (!s) return <p className="muted">{tr('app.chargement')}</p>;
  const days = Math.max(0, Math.ceil((Date.parse(`${s.endsOn}T00:00:00+01:00`) - Date.now()) / 86400_000));
  const pts = s.me?.points ?? 0;
  const di = s.divisions.findIndex((d) => d.id === (s.me?.division ?? 'comptoir'));
  const cur = s.divisions[di], next = s.divisions[di + 1];
  const nameOf = (id: string) => s.divisions.find((d) => d.id === id)?.name ?? id;
  return (
    <div className="season">
      <section className="season-card" style={{ '--dc': DIV_COLOR[cur.id] } as CSSProperties}>
        <div className="season-top">
          <div>
            <small className="muted">{tr('app.saison')} {ofMonthL(s.season)}{tr(days > 1 ? 'app.encore_jour.p' : 'app.encore_jour', { days })}</small>
            <b className="season-div">{cur.name}</b>
            <span>{pts} {tr('app.points')}{s.me?.rank ? `, ${tr('app.m_ord', { n: s.me.rank })}` : ''}{s.me ? ` · ${tr(s.me.wins > 1 ? 'app.m_wins.p' : 'app.m_wins', { wins: s.me.wins })} ${tr('app.m_in')} ${tr(s.me.games > 1 ? 'app.m_games.p' : 'app.m_games', { games: s.me.games })}` : ''}</span>
          </div>
          <figure className="season-die">
            <DieCube id={s.die} size={64} spin />
            <figcaption>{getItem(s.die)?.name}</figcaption>
          </figure>
        </div>
        {next && (
          <div className="season-bar" aria-label={tr('app.points_sur_pour', { pts, min: next.min, name: next.name })}>
            <i style={{ width: `${Math.min(100, (100 * (pts - cur.min)) / (next.min - cur.min))}%` }} />
            <span>{tr('app.encore')} {next.min - pts} {tr('app.points_pour')} {next.name}</span>
          </div>
        )}
        <p className="muted small">{tr('app.comptent_les_parties_en_ligne_entre_')}</p>
      </section>

      <h3>{tr('app.recompenses_de_fin_de_saison')}</h3>
      <ul className="season-rewards">
        {s.divisions.map((d, i) => (
          <li key={d.id} className={i <= di ? 'reached' : ''} style={{ '--dc': DIV_COLOR[d.id] } as CSSProperties}>
            <b>{d.name}</b><small>{d.min}{tr('app.pts')}</small>
            <span>
              {[d.bags ? tr(d.bags > 1 ? 'app.sac.p' : 'app.sac', { bags: d.bags }) : null,
                i >= s.divisions.findIndex((x) => x.id === s.dieFrom) ? tr('app.le_de_de_saison') : null,
                i >= s.divisions.findIndex((x) => x.id === s.titleFrom) ? tr('app.le_titre', { name: d.name, v: ofMonthL(s.season) }) : null].filter(Boolean).join(', ') || tr('app.rien_mais_l_honneur')}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">{tr('app.le_de_ne_pourra_plus_jamais_etre', { name: getItem(s.die)?.name })}</p>

      <h3>{tr('app.meilleurs_joueurs_de_la_saison')}</h3>
      <ol className="board">
        {s.top.length === 0 && <li className="muted">{tr('app.personne_encore_jouez_une_partie_en__2')}</li>}
        {s.top.map((r) => (
          <li key={r.username} className={`${r.username === pa.session?.username ? 'me ' : ''}clickable`} onClick={() => onOpen(r.username)}>
            <span className="b-rank">{r.rank}</span>
            <span className="b-name">{r.username}<small style={{ color: DIV_COLOR[r.division] }}>{nameOf(r.division)}</small></span>
            <span className="b-wins"><b>{r.points}</b> <small>{tr('app.pts_2')}</small></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
