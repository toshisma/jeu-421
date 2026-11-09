import { loc, tr } from '../i18n/lang';
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
const nf = (n: number) => n.toLocaleString(loc());
const plural = (n: number, one: string, many: string) => `${nf(n)} ${n > 1 ? many : one}`;
function duration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h >= 1) return `${nf(h)} h ${m.toString().padStart(2, '0')}`;
  return tr('app.min', { m });
}
const dayLabel = (d: string, long = false) => new Date(`${d}T12:00:00Z`).toLocaleDateString(loc(), long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateTime = (t: number) => new Date(t).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/(\d{1,2}):(\d{2})/, '$1 h $2');

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
    <button className="live-strip" onClick={onOpen} aria-label={tr('app.voir_les_statistiques_du_jeu')}>
      <span className="live-dot" aria-hidden />
      <b>{plural(data.live.online, tr('app.joueur_en_ligne'), tr('app.joueurs_en_ligne'))}</b>
      <span>{plural(data.live.gamesInProgress, tr('app.partie_en_cours_2'), tr('app.parties_en_cours'))}</span>
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
        <span><b>{nf(d[metric])}</b> {d[metric] > 1 ? name[1] : name[0]}, {sel === null ? tr('app.aujourd_hui') : dayLabel(d.day, true)}</span>
        <span className="muted">{metric === 'games' ? tr('app.sur_la_periode', { v: plural(total, 'partie', 'parties') }) : tr('app.au_plus_en_un_jour', { v: nf(Math.max(...days.map((x) => x.players))) })}</span>
      </figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={tr('app.par_jour_sur_jours', { v: metric === 'games' ? tr('app.parties') : tr('app.joueurs_2'), n: days.length })}
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
    <Shell title={tr('app.statistiques')} onBack={onBack} icon="stats" wide sub={tr('app.chiffres_du_jeu_mis_a_jour_toutes')}>
      {!s && !error && <p className="muted">{tr('app.chargement')}</p>}
      {!s && error && <p className="error">{tr('app.statistiques_indisponibles_pour_l_in')} {error}</p>}
      {s && (
        <div className="stats">
          <section className="stats-live" aria-live="polite">
            <div className="live-head"><span className="live-dot" aria-hidden /> {tr('app.en_direct')}</div>
            <div className="stat-row big">
              <Counter value={nf(s.live.online)} label={s.live.online > 1 ? tr('app.joueurs_en_ligne') : tr('app.joueur_en_ligne')} hint={tr('app.appareils_avec_le_jeu_ouvert_et_reli')} />
              <Counter value={nf(s.live.gamesInProgress)} label={s.live.gamesInProgress > 1 ? tr('app.parties_en_cours') : tr('app.partie_en_cours_2')} hint={tr('app.parties_en_ligne_en_cours_et_parties')} />
              <Counter value={nf(s.live.inRooms)} label={s.live.inRooms > 1 ? 'joueurs aux tables' : tr('app.joueur_a_une_table')} hint={tr('app.joueurs_connectes_a_une_table_en_lig')} />
            </div>
          </section>

          <div className="cols">
            <section>
              <h3>{tr('app.aujourd_hui_2')} <small className="k-count">{dayLabel(s.today.day, true)}</small></h3>
              <div className="stat-row">
                <Counter value={nf(s.today.games)} label={tr('app.parties_jouees')} />
                <Counter value={nf(s.today.players)} label={tr('app.joueurs_differents')} />
                <Counter value={nf(s.today.signups)} label="nouveaux inscrits" />
                <Counter value={nf(s.today.wins)} label="victoires" hint={tr('app.victoires_de_joueurs_les_ordinateurs')} />
              </div>
            </section>
            <section>
              <h3>{tr('app.depuis_le_debut')}</h3>
              <div className="stat-row">
                <Counter value={nf(s.totals.users)} label="joueurs inscrits" />
                <Counter value={nf(s.totals.games)} label={tr('app.parties_jouees')} />
                <Counter value={nf(s.totals.multiplayer)} label={tr('app.parties_a_plusieurs')} hint={tr('app.au_moins_deux_joueurs_humains')} />
                <Counter value={nf(s.totals.vsAi)} label={tr('app.parties_contre_l_ordinateur')} />
                <Counter value={duration(s.totals.playSeconds)} label="de jeu au total" />
                <Counter value={nf(s.peak.n)} label={tr('app.record_de_joueurs_en_ligne')} hint={s.peak.at ? tr('app.le', { v: dateTime(s.peak.at) }) : undefined} />
              </div>
            </section>
          </div>

          <section className="stats-chart">
            <div className="chart-tools">
              <div className="seg">
                <button className={metric === 'games' ? 'on' : ''} onClick={() => setMetric('games')}>{tr('app.parties')}</button>
                <button className={metric === 'players' ? 'on' : ''} onClick={() => setMetric('players')}>{tr('app.joueurs_2')}</button>
              </div>
              <div className="seg">
                <button className={range === 7 ? 'on' : ''} onClick={() => setRange(7)}>{tr('app.7_jours')}</button>
                <button className={range === 30 ? 'on' : ''} onClick={() => setRange(30)}>{tr('app.30_jours')}</button>
              </div>
            </div>
            <DayChart days={s.days.slice(-range)} metric={metric} />
          </section>

          <p className="muted small stats-note">
            {tr('app.chiffres_calcules_par_le_serveur_a_p')}{s.totals.since ? tr('app.depuis_le_2', { v: dayLabel(s.totals.since, true) }) : ''}{tr('app.une_partie_abandonnee_ne_compte_pas_')}
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
