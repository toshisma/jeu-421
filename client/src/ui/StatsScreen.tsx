import { useEffect, useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { Icon } from './Icon';
import { Shell } from './kit';

/** Réponse de GET /api/stats : uniquement des totaux anonymes, calculés par le serveur. */
export interface PublicStats {
  live: { online: number; gamesInProgress: number; inRooms: number };
  peak: { n: number; at: number };
  today: { day: string; games: number; players: number; wins: number; signups: number };
  totals: { users: number; games: number; multiplayer: number; vsAi: number; playSeconds: number; since: string | null };
  days: { day: string; games: number; players: number }[];
  generatedAt: number;
}
interface AdminStats extends PublicStats {
  presence: { menu: number; solo: number; online: number };
  connected?: { name: string | null; state: string; since: number }[];
  signups: { username: string; at: number }[];
  active: { today: number; week: number; month: number };
  mostActiveWeek: { username: string; games: number; wins: number; last: number }[];
  mostActiveAll: { username: string; games: number; wins: number; last: number }[];
  longest: { mode: string; humans: number; bots: number; seconds: number; at: number; accounts: string[] }[];
}

const REFRESH_MS = 12_000;
const nf = (n: number) => n.toLocaleString('fr-BE');
const plural = (n: number, one: string, many: string) => `${nf(n)} ${n > 1 ? many : one}`;
function duration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h >= 1) return `${nf(h)} h ${m.toString().padStart(2, '0')}`;
  return `${m} min`;
}
const dayLabel = (d: string, long = false) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateTime = (t: number) => new Date(t).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Statistiques rafraîchies toutes les 12 secondes, en pause quand l'onglet est caché. */
function usePolling<T>(path: string, token?: string | null, every = REFRESH_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      api<T>(path, { token }).then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => { if (alive) setError((e as Error).message); });
    };
    load();
    const t = setInterval(load, every);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', load); };
  }, [path, token, every]);
  return { data, error };
}

/** Bandeau de l'accueil : joueurs en ligne et parties en cours. Masqué si le serveur ne répond pas. */
export function LiveStrip({ onOpen }: { onOpen: () => void }) {
  const { data } = usePolling<PublicStats>('/stats', null, 15_000);
  if (!data) return null;
  return (
    <button className="live-strip" onClick={onOpen} aria-label="Voir les statistiques du jeu">
      <span className="live-dot" aria-hidden />
      <b>{plural(data.live.online, 'joueur en ligne', 'joueurs en ligne')}</b>
      <span>{plural(data.live.gamesInProgress, 'partie en cours', 'parties en cours')}</span>
    </button>
  );
}

function Counter({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="stat-counter" title={hint}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/** Histogramme simple : une barre par jour, valeur au survol et au toucher. */
function DayChart({ days, metric }: { days: PublicStats['days']; metric: 'games' | 'players' }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d[metric]));
  const W = 100 / days.length;
  const shown = sel ?? days.length - 1;
  const d = days[shown];
  const total = days.reduce((a, x) => a + x[metric], 0);
  const name = metric === 'games' ? ['partie', 'parties'] : ['joueur', 'joueurs'];
  return (
    <figure className="day-chart">
      <figcaption>
        <span><b>{nf(d[metric])}</b> {d[metric] > 1 ? name[1] : name[0]}, {sel === null ? "aujourd'hui" : dayLabel(d.day, true)}</span>
        <span className="muted">{metric === 'games' ? `${plural(total, 'partie', 'parties')} sur la période` : `${nf(Math.max(...days.map((x) => x.players)))} au plus en un jour`}</span>
      </figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${metric === 'games' ? 'Parties' : 'Joueurs'} par jour sur ${days.length} jours`}
        onMouseLeave={() => setSel(null)}>
        {[0.5, 1].map((f) => <line key={f} x1="0" x2="100" y1={40 - 38 * f} y2={40 - 38 * f} className="grid" />)}
        {days.map((x, i) => {
          const h = (38 * x[metric]) / max;
          return (
            <g key={x.day} onMouseEnter={() => setSel(i)} onClick={() => setSel(i === sel ? null : i)}>
              <rect x={i * W} y="0" width={W} height="40" className="hit" />
              <rect x={i * W + W * 0.15} y={40 - Math.max(h, x[metric] ? 0.8 : 0)} width={W * 0.7} height={Math.max(h, x[metric] ? 0.8 : 0)} rx="0.6"
                className={i === shown ? 'bar on' : 'bar'}><title>{`${dayLabel(x.day)} : ${x[metric]}`}</title></rect>
            </g>
          );
        })}
      </svg>
      <div className="chart-axis"><span>{dayLabel(days[0].day)}</span><span>{dayLabel(days[days.length - 1].day)}</span></div>
    </figure>
  );
}

export function StatsScreen({ pa, onBack, onAdmin }: { pa: ProfileApi; onBack: () => void; onAdmin: () => void }) {
  const { data: s, error } = usePolling<PublicStats>('/stats');
  const [range, setRange] = useState<7 | 30>(7);
  const [metric, setMetric] = useState<'games' | 'players'>('games');
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!pa.token) return;
    api<{ admin: boolean }>('/admin/whoami', { token: pa.token }).then((r) => setAdmin(r.admin)).catch(() => setAdmin(false));
  }, [pa.token]);

  return (
    <Shell title="Statistiques" onBack={onBack} icon="stats" wide sub="Chiffres du jeu, mis à jour toutes les 12 s">
      {!s && !error && <p className="muted">Chargement…</p>}
      {!s && error && <p className="error">Statistiques indisponibles pour l'instant : {error}</p>}
      {s && (
        <div className="stats">
          <section className="stats-live" aria-live="polite">
            <div className="live-head"><span className="live-dot" aria-hidden /> En direct</div>
            <div className="stat-row big">
              <Counter value={nf(s.live.online)} label={s.live.online > 1 ? 'joueurs en ligne' : 'joueur en ligne'} hint="Appareils avec le jeu ouvert et reliés au serveur en ce moment" />
              <Counter value={nf(s.live.gamesInProgress)} label={s.live.gamesInProgress > 1 ? 'parties en cours' : 'partie en cours'} hint="Parties en ligne en cours, et parties solo en cours sur un appareil relié" />
              <Counter value={nf(s.live.inRooms)} label={s.live.inRooms > 1 ? 'joueurs aux tables' : 'joueur à une table'} hint="Joueurs connectés à une table en ligne (salon ou partie)" />
            </div>
          </section>

          <div className="cols">
            <section>
              <h3>Aujourd'hui <small className="k-count">{dayLabel(s.today.day, true)}</small></h3>
              <div className="stat-row">
                <Counter value={nf(s.today.games)} label="parties jouées" />
                <Counter value={nf(s.today.players)} label="joueurs différents" />
                <Counter value={nf(s.today.signups)} label="nouveaux inscrits" />
                <Counter value={nf(s.today.wins)} label="victoires" hint="Victoires de joueurs (les ordinateurs ne comptent pas)" />
              </div>
            </section>
            <section>
              <h3>Depuis le début</h3>
              <div className="stat-row">
                <Counter value={nf(s.totals.users)} label="joueurs inscrits" />
                <Counter value={nf(s.totals.games)} label="parties jouées" />
                <Counter value={nf(s.totals.multiplayer)} label="parties à plusieurs" hint="Au moins deux joueurs humains" />
                <Counter value={nf(s.totals.vsAi)} label="parties contre l'ordinateur" />
                <Counter value={duration(s.totals.playSeconds)} label="de jeu au total" />
                <Counter value={nf(s.peak.n)} label="record de joueurs en ligne" hint={s.peak.at ? `Le ${dateTime(s.peak.at)}` : undefined} />
              </div>
            </section>
          </div>

          <section className="stats-chart">
            <div className="chart-tools">
              <div className="seg">
                <button className={metric === 'games' ? 'on' : ''} onClick={() => setMetric('games')}>Parties</button>
                <button className={metric === 'players' ? 'on' : ''} onClick={() => setMetric('players')}>Joueurs</button>
              </div>
              <div className="seg">
                <button className={range === 7 ? 'on' : ''} onClick={() => setRange(7)}>7 jours</button>
                <button className={range === 30 ? 'on' : ''} onClick={() => setRange(30)}>30 jours</button>
              </div>
            </div>
            <DayChart days={s.days.slice(-range)} metric={metric} />
          </section>

          <p className="muted small stats-note">
            Chiffres calculés par le serveur à partir des parties réellement terminées (solo et en ligne{s.totals.since ? `, depuis le ${dayLabel(s.totals.since, true)}` : ''}).
            Une partie abandonnée ne compte pas ; les soirées sur un seul téléphone et le mode arbitre ne passent pas par le serveur et ne sont pas comptés.
            Jours à l'heure de Bruxelles. Aucune donnée personnelle n'est affichée.
          </p>
          {admin && <button className="btn secondary" onClick={onAdmin}><Icon name="settings" size={18} /> Tableau de bord (administration)</button>}
        </div>
      )}
    </Shell>
  );
}

/** Tableau de bord réservé à l'administration : le serveur refuse tout autre compte. */
export function AdminScreen({ pa, onBack }: { pa: ProfileApi; onBack: () => void }) {
  const { data: s, error } = usePolling<AdminStats>('/admin/stats', pa.token, 20_000);
  const Board = ({ rows }: { rows: AdminStats['mostActiveAll'] }) => (
    rows.length === 0 ? <p className="empty">Aucune partie de compte pour l'instant.</p> : (
      <ol className="board">
        {rows.map((r, i) => (
          <li key={r.username}>
            <span className="b-rank">{i + 1}</span>
            <span className="b-name">{r.username}<small>dernière partie le {dateTime(r.last)}</small></span>
            <span className="b-wins"><b>{r.games}</b> <small>parties, {r.wins} vict.</small></span>
          </li>
        ))}
      </ol>
    ));
  return (
    <Shell title="Administration" onBack={onBack} wide>
      {!s && !error && <p className="muted">Chargement…</p>}
      {error && <p className="error">{error}</p>}
      {s && (
        <div className="stats">
          <section className="connected">
            <h3>Connectés en ce moment ({s.connected?.length ?? 0})</h3>
            {!s.connected?.length ? <p className="empty">Personne pour l'instant.</p> : (
              <ul>
                {s.connected.map((c, i) => (
                  <li key={i}>
                    <i className={`fr-dot ${c.state === 'menu' ? 'on' : 'play'}`} aria-hidden />
                    <b>{c.name ?? 'Visiteur sans compte'}</b>
                    <small>{c.state === 'online' ? 'en partie en ligne' : c.state === 'solo' ? 'en partie solo' : 'dans les menus'} · depuis {Math.max(1, Math.round((Date.now() - c.since) / 60_000))} min</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="stat-row">
            <Counter value={nf(s.live.online)} label="en ligne" />
            <Counter value={nf(s.presence.solo)} label="en solo" />
            <Counter value={nf(s.presence.online)} label="dans le jeu en ligne" />
            <Counter value={nf(s.presence.menu)} label="dans les menus" hint="Connexions (un appareil peut avoir plusieurs onglets)" />
          </div>
          <div className="stat-row">
            <Counter value={nf(s.active.today)} label="comptes actifs aujourd'hui" />
            <Counter value={nf(s.active.week)} label="sur 7 jours" />
            <Counter value={nf(s.active.month)} label="sur 30 jours" />
          </div>
          <div className="cols">
            <section>
              <h3>Les plus actifs, 7 jours</h3>
              <Board rows={s.mostActiveWeek} />
              <h3>Les plus actifs, depuis le début</h3>
              <Board rows={s.mostActiveAll} />
            </section>
            <section>
              <h3>Nouveaux inscrits, 30 jours ({s.signups.length})</h3>
              {s.signups.length === 0 ? <p className="empty">Aucun.</p> : (
                <ul className="list compact">{s.signups.map((u) => <li key={u.username}><b>{u.username}</b><small>{dateTime(u.at)}</small></li>)}</ul>
              )}
              <h3>Parties les plus longues</h3>
              {s.longest.length === 0 ? <p className="empty">Aucune.</p> : (
                <ol className="list compact">
                  {s.longest.map((g, i) => (
                    <li key={i}>
                      <b>{duration(g.seconds)}</b>
                      <small>{g.mode === 'online' ? 'en ligne' : 'solo'}, {plural(g.humans, 'humain', 'humains')}{g.bots ? `, ${g.bots} ordi.` : ''}, le {dateTime(g.at)}{g.accounts.length ? ` : ${g.accounts.join(', ')}` : ''}</small>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </Shell>
  );
}
