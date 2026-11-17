/**
 * Classement solo de la semaine (zone i18n `chm.sw.`) : victoires contre l'ordinateur des quatre jeux.
 *  - SoloWeekPanel : section de l'écran « Campagnes » (classement général ou entre amis, ma place,
 *    plafond du jour, podium de la semaine passée) ;
 *  - SoloWeekBadge : petit trophée « 🏆 3e » du bloc Campagne de l'accueil ;
 *  - SoloWeekNote : ligne de fin de partie (« +4 points au classement solo de la semaine »).
 * Le serveur fait foi (server/solo-week.ts) ; rien n'est calculé ici.
 */
import { useEffect, useState } from 'react';
import { SW_DAILY_CAP, SW_LEVEL_POINTS, SW_MIN_PLAYERS, SW_PRIZES, type SoloWeekBoard, type SoloWeekRow } from '../../../shared/soloweek';
import { api } from '../account/api';
import { tr } from '../i18n/lang';

/** Tableau gardé une minute (accueil et écran Campagnes) ; vidé après une partie gagnée. */
let cache: { key: string; at: number; board: SoloWeekBoard } | null = null;
export const forgetSoloWeek = () => { cache = null; };

export function useSoloWeek(token: string | null | undefined): { board: SoloWeekBoard | null; error: boolean } {
  const key = token ?? '';
  const fresh = cache && cache.key === key && Date.now() - cache.at < 60_000 ? cache.board : null;
  const [board, setBoard] = useState<SoloWeekBoard | null>(fresh);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (cache && cache.key === key && Date.now() - cache.at < 60_000) { setBoard(cache.board); return; }
    let alive = true;
    api<SoloWeekBoard & { ok: boolean }>('/solo-week', { token: token || null })
      .then((b) => { cache = { key, at: Date.now(), board: b }; if (alive) { setBoard(b); setError(false); } })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { board, error };
}

export const rankLabel = (n: number) => (n === 1 ? tr('chm.sw.rank1') : tr('chm.sw.rank', { n }));

function timeLeft(endsAt: number): string {
  const ms = Math.max(0, endsAt - Date.now());
  const d = Math.floor(ms / 86400_000), h = Math.floor((ms % 86400_000) / 3600_000), m = Math.max(1, Math.floor((ms % 3600_000) / 60_000));
  return d ? tr('chm.sw.dh', { d, h }) : h ? tr('chm.sw.h', { h }) : tr('chm.sw.m', { m });
}

function Rows({ rows }: { rows: SoloWeekRow[] }) {
  return (
    <ol className="sw-rows">
      {rows.map((r) => (
        <li key={`${r.rank}-${r.username}`} className={`${r.me ? 'me' : ''}${r.friend ? ' friend' : ''}${r.rank <= 3 ? ` podium p${r.rank}` : ''}`}>
          <span className="sw-rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : rankLabel(r.rank)}</span>
          <span className="sw-name">{r.username}{r.friend && <small className="sw-friend">{tr('chm.sw.friendTag')}</small>}</span>
          <span className="sw-pts">{tr('chm.sw.pts', { n: r.points })}</span>
        </li>
      ))}
    </ol>
  );
}

export function SoloWeekPanel({ token, isAccount }: { token: string | null | undefined; isAccount: boolean }) {
  const { board, error } = useSoloWeek(isAccount ? token : null);
  const [tab, setTab] = useState<'all' | 'friends'>('all');
  return (
    <section className="sw-panel" id="classement-solo" aria-labelledby="sw-title">
      <header className="sw-head">
        <h2 id="sw-title"><span aria-hidden>🏆</span> {tr('chm.sw.title')}</h2>
        {board && <span className="sw-ends">{tr('chm.sw.ends', { t: timeLeft(board.endsAt) })}</span>}
      </header>
      <p className="sw-rule">{tr('chm.sw.rule', { a: SW_LEVEL_POINTS[0], b: SW_LEVEL_POINTS[1], c: SW_LEVEL_POINTS[2], cap: SW_DAILY_CAP })}</p>
      <p className="sw-rule">{tr('chm.sw.prizes', { a: SW_PRIZES[0], b: SW_PRIZES[1], c: SW_PRIZES[2], n: SW_MIN_PLAYERS })}</p>
      {!isAccount && <p className="sw-me">{tr('chm.sw.guest')}</p>}
      {error && !board && <p className="sw-empty">{tr('chm.sw.error')}</p>}
      {board && <>
        {board.me && (
          <p className="sw-me">
            {board.me.rank ? tr('chm.sw.me', { rank: rankLabel(board.me.rank), p: board.me.points }) : tr('chm.sw.meNone')}
            <small>{tr('chm.sw.today', { p: board.me.today, cap: SW_DAILY_CAP })}</small>
          </p>
        )}
        {isAccount && (
          <div className="sw-tabs" role="group">
            <button aria-pressed={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{tr('chm.sw.all')}</button>
            <button aria-pressed={tab === 'friends'} className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>{tr('chm.sw.friends')}</button>
          </div>
        )}
        {tab === 'all'
          ? (board.top.length ? <Rows rows={board.top} /> : <p className="sw-empty">{tr('chm.sw.empty')}</p>)
          : (board.friends.some((r) => r.friend) ? <Rows rows={board.friends} /> : <p className="sw-empty">{tr('chm.sw.noFriends')}</p>)}
        {board.last.length > 0 && (
          <div className="sw-last">
            <h3>{tr('chm.sw.last')}</h3>
            <Rows rows={board.last.map((r) => ({ rank: r.rank, username: r.username, points: r.points, wins: 0 }))} />
          </div>
        )}
      </>}
    </section>
  );
}

/** Trophée du bloc Campagne : ma place cette semaine (comptes), sinon le trophée seul. */
export function SoloWeekBadge({ token, isAccount, onOpen }: { token: string | null | undefined; isAccount: boolean; onOpen: () => void }) {
  const { board } = useSoloWeek(isAccount ? token : null);
  const rank = board?.me?.rank ?? null;
  return (
    <button className="camp-all sw-badge" onClick={onOpen} aria-label={`${tr('chm.sw.homeAria')}${rank ? ` : ${rankLabel(rank)}` : ''}`} title={tr('chm.sw.homeAria')}>
      <span aria-hidden>🏆</span>{rank ? <b aria-hidden>{rankLabel(rank)}</b> : null}
    </button>
  );
}

/** Ligne de fin de partie gagnée, d'après la réponse du serveur (`week`). */
export function SoloWeekNote({ week }: { week: { gained: number; points: number } | null | undefined }) {
  useEffect(() => { if (week) forgetSoloWeek(); }, [week]);
  if (!week) return null;
  return <p className={`sw-note${week.gained > 0 ? '' : ' capped'}`}><span aria-hidden>🏆</span> {week.gained > 0 ? tr('chm.sw.gained', { n: week.gained }) : tr('chm.sw.capped')}</p>;
}
