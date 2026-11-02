import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { getItem } from '../../../shared/progress/catalog';
import { monthName } from '../../../shared/progress/profile';
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
  if (!s) return <p className="muted">Chargement…</p>;
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
            <small className="muted">Saison de {monthName(s.season)}, encore {days} jour{days > 1 ? 's' : ''}</small>
            <b className="season-div">{cur.name}</b>
            <span>{pts} points{s.me?.rank ? `, ${s.me.rank}e` : ''}{s.me ? ` · ${s.me.wins} victoire${s.me.wins > 1 ? 's' : ''} en ${s.me.games} partie${s.me.games > 1 ? 's' : ''}` : ''}</span>
          </div>
          <figure className="season-die">
            <DieCube id={s.die} size={64} spin />
            <figcaption>{getItem(s.die)?.name}</figcaption>
          </figure>
        </div>
        {next && (
          <div className="season-bar" aria-label={`${pts} points sur ${next.min} pour ${next.name}`}>
            <i style={{ width: `${Math.min(100, (100 * (pts - cur.min)) / (next.min - cur.min))}%` }} />
            <span>Encore {next.min - pts} points pour {next.name}</span>
          </div>
        )}
        <p className="muted small">Comptent : les parties en ligne entre au moins deux vrais joueurs (pas les ordinateurs, pas la mort subite). Le premier gagne des points, le dernier en perd. Tout repart à zéro le 1er du mois.</p>
      </section>

      <h3>Récompenses de fin de saison</h3>
      <ul className="season-rewards">
        {s.divisions.map((d, i) => (
          <li key={d.id} className={i <= di ? 'reached' : ''} style={{ '--dc': DIV_COLOR[d.id] } as CSSProperties}>
            <b>{d.name}</b><small>{d.min}+ pts</small>
            <span>
              {[d.bags ? `${d.bags} sac${d.bags > 1 ? 's' : ''}` : null,
                i >= s.divisions.findIndex((x) => x.id === s.dieFrom) ? 'le dé de saison' : null,
                i >= s.divisions.findIndex((x) => x.id === s.titleFrom) ? `le titre « ${d.name} de ${monthName(s.season)} »` : null].filter(Boolean).join(', ') || 'rien, mais l’honneur'}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">Le dé « {getItem(s.die)?.name} » ne pourra plus jamais être obtenu une fois la saison finie.</p>

      <h3>Meilleurs joueurs de la saison</h3>
      <ol className="board">
        {s.top.length === 0 && <li className="muted">Personne encore : jouez une partie en ligne contre de vrais joueurs !</li>}
        {s.top.map((r) => (
          <li key={r.username} className={`${r.username === pa.session?.username ? 'me ' : ''}clickable`} onClick={() => onOpen(r.username)}>
            <span className="b-rank">{r.rank}</span>
            <span className="b-name">{r.username}<small style={{ color: DIV_COLOR[r.division] }}>{nameOf(r.division)}</small></span>
            <span className="b-wins"><b>{r.points}</b> <small>pts</small></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
