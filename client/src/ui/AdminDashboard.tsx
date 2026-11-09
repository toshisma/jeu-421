/**
 * Tableau de bord et commandes d'administration. Réservé aux comptes ADMIN_USERS : le serveur
 * vérifie chaque appel (403 sinon), cet écran ne fait qu'afficher.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { lazyScreen } from '../lazy';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { askConfirm } from './confirm';
import { Shell } from './Screens';
import { ModerationPanel, useModeration } from './Moderation';
import { LiveTab } from './AdminLive';

/** Statistiques des cartes de Coups Fourrés : chargées à la demande (illustrations des cartes). */
const CfAdminStats = lazyScreen(() => import('../cards/CfAdminStats'), 'CfAdminStats');

const nf = (n: number) => Math.round(n).toLocaleString('fr-BE');
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '–');
const dayShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateTime = (t: number | null) => (t ? new Date(t).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');

type Tab = 'enligne' | 'apercu' | 'signalements' | 'personnes' | 'joueurs' | 'visiteurs' | 'retention' | 'activite' | 'economie' | 'cf' | 'journal';
const TABS: [Tab, string][] = [
  ['enligne', 'En ligne'], ['apercu', 'Vue d’ensemble'], ['signalements', 'Signalements'], ['personnes', 'Personnes'], ['joueurs', 'Joueurs'], ['visiteurs', 'Visiteurs'], ['retention', 'Rétention'],
  ['activite', 'Activité'], ['economie', 'Économie'], ['cf', 'Coups Fourrés'], ['journal', 'Journal admin'],
];

/** Chargement d'une route admin, avec rechargement à la demande. */
function useAdmin<T>(path: string | null, token: string | null, every = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const load = () => api<T>(path, { token }).then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => { if (alive) setError((e as Error).message); });
    load();
    const t = every ? setInterval(() => { if (document.visibilityState === 'visible') load(); }, every) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [path, token, every, n]);
  return { data, error, reload: useCallback(() => setN((x) => x + 1), []) };
}

function Kpi({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return <div className="stat-counter" title={hint}><b className={value.length >= 8 ? 'long' : undefined}>{value}</b><span>{label}</span></div>;
}

// --- Graphiques (SVG, sans dépendance) ---------------------------------------------------------
interface Series { key: string; label: string; cls: string }
/**
 * Barres par jour, une ou deux séries empilées. Survol / toucher : valeur du jour dans la légende.
 */
function Bars({ rows, series, title, unit, grouped }: { rows: ({ day: string } & Record<string, number | string>)[]; series: Series[]; title: string; unit?: string; grouped?: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
  if (!rows.length) return null;
  const val = (r: (typeof rows)[number], k: string) => Number(r[k]) || 0;
  const tot = (r: (typeof rows)[number]) => series.reduce((a, s) => a + val(r, s.key), 0);
  const max = Math.max(1, ...rows.map((x) => (grouped ? Math.max(...series.map((s) => val(x, s.key))) : tot(x))));
  const W = 100 / rows.length, H = 40;
  const shown = sel ?? rows.length - 1;
  const r = rows[shown];
  const sum = rows.reduce((a, x) => a + tot(x), 0);
  return (
    <figure className="adm-chart">
      <figcaption>
        <span className="adm-chart-title">{title}</span>
        <span className="adm-chart-val">
          {grouped ? series.map((s, k) => <span key={s.key}>{k ? ' / ' : ''}<b>{nf(val(r, s.key))}</b> {s.label.toLowerCase()}</span>) : <><b>{nf(tot(r))}</b>{unit ? ` ${unit}` : ''}</>}
          {' · '}{sel === null ? 'aujourd’hui' : dayLong(r.day)}
          {series.length > 1 && !grouped && <small> ({series.map((s) => `${s.label.toLowerCase()} ${nf(val(r, s.key))}`).join(', ')})</small>}
        </span>
      </figcaption>
      {series.length > 1 && (
        <div className="adm-legend">{series.map((s) => <span key={s.key}><i className={s.cls} aria-hidden />{s.label}</span>)}</div>
      )}
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title} : ${nf(sum)} sur ${rows.length} jours`} onMouseLeave={() => setSel(null)}>
        {[0.5, 1].map((f) => <line key={f} x1="0" x2="100" y1={H - 38 * f} y2={H - 38 * f} className="grid" />)}
        {rows.map((x, i) => {
          let y = H;
          return (
            <g key={x.day} onMouseEnter={() => setSel(i)} onClick={() => setSel(i === sel ? null : i)}>
              <rect x={i * W} y="0" width={W} height={H} className="hit" />
              {grouped && series.map((s, k) => {
                const v = val(x, s.key);
                if (!v) return null;
                const h = Math.max(0.8, (38 * v) / max), bw = (W * 0.8) / series.length;
                return <rect key={s.key} x={i * W + W * 0.1 + k * bw} y={H - h} width={Math.max(0.2, bw - 0.15)} height={h} rx="0.4" className={`${s.cls}${i === shown ? ' on' : ''}`} />;
              })}
              {!grouped && series.map((s) => {
                const v = val(x, s.key);
                if (!v) return null;
                const h = Math.max(0.8, (38 * v) / max);
                y -= h;
                return <rect key={s.key} x={i * W + W * 0.15} y={y + 0.15} width={W * 0.7} height={Math.max(0.5, h - 0.3)} rx="0.5" className={`${s.cls}${i === shown ? ' on' : ''}`} />;
              })}
            </g>
          );
        })}
      </svg>
      <div className="chart-axis"><span>{dayShort(rows[0].day)}</span><span>max {nf(max)}</span><span>{dayShort(rows[rows.length - 1].day)}</span></div>
    </figure>
  );
}

/** Classement horizontal (provenance, pages, pays…) : barres CSS. */
function TopList({ title, rows, empty }: { title: string; rows: { k: string; n: number; v?: number }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="adm-card">
      <h3>{title}</h3>
      {!rows.length ? <p className="empty">{empty ?? 'Rien pour l’instant.'}</p> : (
        <ul className="adm-top">
          {rows.map((r) => (
            <li key={r.k}>
              <span className="adm-top-k" title={r.k}>{r.k}</span>
              <span className="adm-top-n">{nf(r.n)}{r.v != null && r.v !== r.n ? <small> · {nf(r.v)} pers.</small> : null}</span>
              <span className="adm-top-bar" style={{ width: `${(100 * r.n) / max}%` }} aria-hidden />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- Onglets -----------------------------------------------------------------------------------
interface Overview {
  day: string; users: number; bannedCount: number; coins: number; bags: number;
  active: { today: number; week: number; month: number };
  games: { solo: number; online: number; tournaments: number };
  days: { day: string; signups: number; active: number; solo: number; online: number; tournaments: number }[];
}
interface Live { live: { online: number; gamesInProgress: number; inRooms: number }; connected?: { name: string | null; state: string; since: number }[] }

function OverviewTab({ o, live, onLive }: { o: Overview; live: Live | null; onLive: () => void }) {
  const sum = (k: 'signups' | 'solo' | 'online' | 'tournaments') => o.days.reduce((a, d) => a + d[k], 0);
  return (
    <>
      <div className="stat-row">
        <Kpi value={nf(o.active.today)} label="comptes actifs aujourd’hui" />
        <Kpi value={nf(o.active.week)} label="actifs sur 7 jours" />
        <Kpi value={nf(o.active.month)} label="actifs sur 30 jours" />
        <Kpi value={nf(o.games.solo)} label="parties solo" hint="Depuis le début" />
        <Kpi value={nf(o.games.online)} label="parties en ligne" hint="Depuis le début (tables de tournoi comprises)" />
        <Kpi value={nf(o.games.tournaments)} label="tournois terminés" hint="Comptés depuis l’arrivée de ce tableau de bord" />
        <Kpi value={nf(o.bags)} label="sacs non ouverts" />
        <Kpi value={nf(o.bannedCount)} label="comptes suspendus" />
      </div>
      <section className="adm-card">
        <Bars title="Parties par jour (30 jours)" rows={o.days} series={[{ key: 'solo', label: 'Solo', cls: 's1' }, { key: 'online', label: 'En ligne', cls: 's2' }]} />
        <p className="muted small">{nf(sum('solo'))} solo, {nf(sum('online'))} en ligne et {nf(sum('tournaments'))} tournois sur la période.</p>
      </section>
      <div className="adm-grid">
        <section className="adm-card"><Bars title="Nouveaux comptes par jour" rows={o.days} series={[{ key: 'signups', label: 'Inscriptions', cls: 's1' }]} /></section>
        <section className="adm-card"><Bars title="Comptes actifs par jour" rows={o.days} series={[{ key: 'active', label: 'Actifs', cls: 's2' }]} /></section>
      </div>
      {live?.connected && (
        <section className="adm-card">
          <h3>Connectés en ce moment ({live.connected.length}) <button className="linkish" onClick={onLive}>Voir le détail (onglet En ligne)</button></h3>
          {!live.connected.length ? <p className="empty">Personne pour l’instant.</p> : (
            <ul className="list compact">
              {live.connected.map((c, i) => (
                <li key={i}><b>{c.name ?? 'Visiteur sans compte'}</b>
                  <small>{c.state === 'online' ? 'en ligne' : c.state === 'solo' ? 'en solo' : 'menus'} · {Math.max(1, Math.round((Date.now() - c.since) / 60_000))} min</small></li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

interface Visitors {
  days: { day: string; visits: number; visitors: number }[];
  totals: { visits: number; visitors: number };
  conversion: { newVisitors: number; converted: number };
  referrers: { k: string; n: number; v: number }[]; countries: { k: string; n: number; v: number }[]; langs: { k: string; n: number; v: number }[];
  devices: { k: string; n: number; v: number }[]; landings: { k: string; n: number; v: number }[];
  utm: { source: string; medium: string; campaign: string; n: number }[];
  funnel?: Funnel & { byLanding: (Funnel & { landing: string })[] };
}
interface Funnel { visitors: number; guidePlay: number; solo: number; online: number; cards?: number; played: number; invite: number; invited: number; returned: number }
/** Parcours des nouveaux visiteurs : arrivée → partie lancée → multijoueur → invitation → retour. */
function FunnelBlock({ f }: { f: NonNullable<Visitors['funnel']> }) {
  return (
    <section className="adm-card">
      <h3>Parcours des nouveaux visiteurs <small className="muted">première visite dans la période</small></h3>
      <div className="stat-row">
        <Kpi value={pct(f.played, f.visitors)} label={`ont lancé une partie (${nf(f.played)})`} hint="Solo, en ligne ou Coups Fourrés, à n’importe quel moment depuis leur arrivée" />
        <Kpi value={pct(f.online, f.visitors)} label={`ont joué en ligne (${nf(f.online)})`} hint="Table rejointe ou créée : partie rapide, salon privé, tournoi" />
        <Kpi value={pct(f.invite, f.visitors)} label={`ont invité quelqu’un (${nf(f.invite)})`} hint="Lien ou code de table partagé depuis le salon" />
        <Kpi value={pct(f.returned, f.visitors)} label={`sont revenus un autre jour (${nf(f.returned)})`} />
      </div>
      <p className="muted small">{nf(f.invited)} sont arrivés par un lien d’invitation ; {nf(f.guidePlay)} ont cliqué sur « Jouer » depuis une page d’aide (règles, stratégie…) ; {nf(f.cards ?? 0)} ont lancé une partie de Coups Fourrés.</p>
      {f.byLanding.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Page d’arrivée</th><th>Nouveaux</th><th>Clic Jouer</th><th>Partie</th><th>En ligne</th><th>Coups Fourrés</th><th>Retour</th></tr></thead>
            <tbody>{f.byLanding.map((r) => (
              <tr key={r.landing}><th>{r.landing}</th><td>{nf(r.visitors)}</td><td>{r.landing === '/' ? '–' : pct(r.guidePlay, r.visitors)}</td><td>{pct(r.played, r.visitors)}</td><td>{pct(r.online, r.visitors)}</td><td>{pct(r.cards ?? 0, r.visitors)}</td><td>{pct(r.returned, r.visitors)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function VisitorsTab({ token }: { token: string | null }) {
  const [range, setRange] = useState(30);
  const { data: v, error } = useAdmin<Visitors>(`/admin/visitors?days=${range}`, token);
  if (error) return <p className="error">{error}</p>;
  if (!v) return <p className="muted">Chargement…</p>;
  return (
    <>
      <div className="seg"><button className={range === 7 ? 'on' : ''} onClick={() => setRange(7)}>7 jours</button><button className={range === 30 ? 'on' : ''} onClick={() => setRange(30)}>30 jours</button><button className={range === 90 ? 'on' : ''} onClick={() => setRange(90)}>90 jours</button></div>
      <div className="stat-row">
        <Kpi value={nf(v.totals.visits)} label="visites" hint="Une visite = une arrivée sur le jeu ou sur une page d’aide (au plus une par demi-heure et par visiteur)" />
        <Kpi value={nf(v.totals.visitors)} label="visiteurs différents" />
        <Kpi value={nf(v.conversion.newVisitors)} label="nouveaux visiteurs" />
        <Kpi value={pct(v.conversion.converted, v.conversion.newVisitors)} label={`ont créé un compte (${nf(v.conversion.converted)})`} hint="Nouveaux visiteurs de la période qui ont ensuite créé leur compte" />
      </div>
      <section className="adm-card"><Bars title="Visiteurs par jour" rows={v.days} series={[{ key: 'visitors', label: 'Visiteurs', cls: 's2' }]} /></section>
      {v.funnel && <FunnelBlock f={v.funnel} />}
      <AudienceBlock token={token} range={range} />
      <div className="adm-grid">
        <TopList title="Provenance" rows={v.referrers} />
        <TopList title="Pages d’arrivée" rows={v.landings} />
        <TopList title="Langue du navigateur" rows={v.langs} />
        <TopList title="Appareil" rows={v.devices} />
      </div>
      <section className="adm-card">
        <h3>Campagnes (paramètres utm_*)</h3>
        {!v.utm.length ? <p className="empty">Aucun lien de campagne utilisé. Exemple : https://421online.com/?utm_source=facebook&amp;utm_campaign=lancement</p> : (
          <ul className="list compact">{v.utm.map((u, i) => <li key={i}><b>{u.source}</b><small>{[u.medium, u.campaign].filter(Boolean).join(' · ') || '—'} · {nf(u.n)} visites</small></li>)}</ul>
        )}
      </section>
      <p className="muted small">Suivi anonyme : ni cookie, ni adresse IP conservée (identifiant d’appareil haché avec un sel secret). Pays d’après le fuseau horaire de l’appareil (à défaut, la langue du navigateur). Temps passé : seulement onglet visible, plafonné par le serveur.</p>
    </>
  );
}


/** Durée lisible : « 45 s », « 12 min », « 3 h 05 ». */
const dur = (s: number) => {
  if (s < 60) return `${Math.round(s)} s`;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};
const shortDate = (t: number) => new Date(t).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ratio = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)} %`);

interface Audience {
  totals: { seconds: number; visitors: number; avgPerVisitorDay: number; avgPerVisitor: number; avgPerVisit: number };
  days: { day: string; avg: number; minutes: number }[];
  countries: { code: string | null; name: string; flag: string; visitors: number; accounts: number; seconds: number; avgSeconds: number; d1: number | null; d7: number | null; method: string | null }[];
}
function AudienceBlock({ token, range }: { token: string | null; range: number }) {
  const { data: a } = useAdmin<Audience>(`/admin/audience?days=${range}`, token);
  if (!a) return null;
  const methods = [...new Set(a.countries.map((c) => c.method).filter(Boolean))];
  return (
    <>
      <div className="stat-row">
        <Kpi value={dur(a.totals.avgPerVisitorDay)} label="par visiteur et par jour" hint="Temps moyen passé (onglet visible) un jour donné, par visiteur actif ce jour-là" />
        <Kpi value={dur(a.totals.avgPerVisit)} label="en moyenne par visite" />
        <Kpi value={dur(a.totals.avgPerVisitor)} label="par visiteur sur la période" />
        <Kpi value={dur(a.totals.seconds)} label="de temps passé au total" />
      </div>
      <section className="adm-card"><Bars title="Minutes passées sur le site par jour" unit="min" rows={a.days} series={[{ key: 'minutes', label: 'Minutes', cls: 's1' }]} /></section>
      <section className="adm-card">
        <h3>Par pays <small className="muted">{methods.length ? methods.join(', ') : 'd’après le fuseau horaire'}</small></h3>
        {!a.countries.length ? <p className="empty">Aucun visiteur sur la période.</p> : (
          <div className="adm-table-wrap">
            <table className="adm-table adm-countries">
              <thead><tr><th>Pays</th><th>Visiteurs</th><th>Comptes</th><th>Temps</th><th>Moy.</th><th>J1</th><th>J7</th></tr></thead>
              <tbody>{a.countries.map((c) => (
                <tr key={c.code ?? '-'}><th><span aria-hidden>{c.flag}</span> {c.name}</th><td>{nf(c.visitors)}</td><td>{nf(c.accounts)}</td><td>{dur(c.seconds)}</td><td>{dur(c.avgSeconds)}</td><td>{ratio(c.d1)}</td><td>{ratio(c.d7)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

interface PersonRow {
  key: string; label: string; userId: string | null; username: string | null; country: string | null; countryName: string; flag: string; countrySrc: string | null;
  device: string | null; source: string; firstAt: number; lastAt: number; visits: number; activeDays: number; seconds: number; avgSeconds: number; games: number;
  back: { d1: boolean | null; d7: boolean | null; d30: boolean | null };
}
const DEVICE_ICON: Record<string, string> = { mobile: '📱', ordinateur: '💻', tablette: '📲' };
function Dots({ back }: { back: PersonRow['back'] }) {
  return (
    <span className="adm-dots" aria-label={`Retour J1 ${back.d1 == null ? 'trop tôt' : back.d1 ? 'oui' : 'non'}, J7 ${back.d7 == null ? 'trop tôt' : back.d7 ? 'oui' : 'non'}, J30 ${back.d30 == null ? 'trop tôt' : back.d30 ? 'oui' : 'non'}`}>
      {(['d1', 'd7', 'd30'] as const).map((k) => (
        <span key={k} className={`adm-dot ${back[k] == null ? 'na' : back[k] ? 'yes' : 'no'}`} title={`${k.toUpperCase()} : ${back[k] == null ? 'trop tôt' : back[k] ? 'revenu' : 'pas revenu'}`}>
          {back[k] == null ? '·' : back[k] ? '✓' : '✗'}<small>{k.slice(1)}</small>
        </span>
      ))}
    </span>
  );
}
function PeopleTab({ token, onOpen, initialSearch = '' }: { token: string | null; onOpen: (userId: string) => void; initialSearch?: string }) {
  const [sort, setSort] = useState('last');
  const [kind, setKind] = useState('');
  const [country, setCountry] = useState('');
  const [device, setDevice] = useState('');
  const [q, setQ] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [sort, kind, country, device, search]);
  const size = 20;
  const { data, error } = useAdmin<{ total: number; people: PersonRow[]; countries: { code: string; name: string; flag: string }[] }>(
    `/admin/people?sort=${sort}&kind=${kind}&country=${encodeURIComponent(country)}&device=${device}&q=${encodeURIComponent(search)}&page=${page}&size=${size}`, token, 30_000);
  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;
  const who = (p: PersonRow) => p.username
    ? <button className="linkish" onClick={() => onOpen(p.userId!)}>{p.username}</button>
    : <b>{p.label}</b>;
  return (
    <>
      <form className="adm-search" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pseudo ou n° de visiteur (#a3f9)" aria-label="Recherche" autoCapitalize="off" />
        <button className="btn small primary" type="submit">Chercher</button>
        {search && <button className="btn small ghost" type="button" onClick={() => { setQ(''); setSearch(''); }}>Effacer</button>}
      </form>
      <div className="adm-filters">
        <label><span>Tri</span><select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="last">Dernière visite</option><option value="time">Temps passé</option><option value="first">Première visite</option>
          <option value="visits">Nombre de visites</option><option value="days">Jours actifs</option></select></label>
        <label><span>Qui</span><select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Tout le monde</option><option value="comptes">Avec un compte</option><option value="visiteurs">Visiteurs sans compte</option></select></label>
        <label><span>Pays</span><select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Tous</option>{data?.countries.map((c) => <option key={c.code || '-'} value={c.code || '-'}>{c.flag} {c.name}</option>)}</select></label>
        <label><span>Appareil</span><select value={device} onChange={(e) => setDevice(e.target.value)}>
          <option value="">Tous</option><option value="mobile">Mobile</option><option value="ordinateur">Ordinateur</option><option value="tablette">Tablette</option></select></label>
      </div>
      {error && <p className="error">{error}</p>}
      {data && <p className="muted small">{nf(data.total)} personne{data.total > 1 ? 's' : ''} · pays d’après le fuseau horaire de l’appareil · pastilles : revenu à J1 / J7 / J30</p>}
      {data && (!data.people.length ? <p className="empty">Personne ne correspond.</p> : (
        <>
          <ul className="adm-people" aria-label="Liste des visiteurs et joueurs">
            {data.people.map((p) => (
              <li key={p.key}>
                <div className="adm-p-head">
                  <span className="adm-p-flag" title={`${p.countryName}${p.countrySrc ? ` (${p.countrySrc})` : ''}`} aria-hidden>{p.flag}</span>
                  <span className="adm-p-who">{who(p)}<small>{p.countryName}{p.device ? ` · ${DEVICE_ICON[p.device] ?? ''} ${p.device}` : ''}{p.username ? ` · ${p.label.startsWith('Visiteur') ? p.label : 'compte'}` : ''}</small></span>
                  <Dots back={p.back} />
                </div>
                <dl className="adm-p-grid">
                  <div><dt>Temps passé</dt><dd>{dur(p.seconds)}</dd></div>
                  <div><dt>Moy./visite</dt><dd>{p.visits ? dur(p.avgSeconds) : '–'}</dd></div>
                  <div><dt>Visites</dt><dd>{nf(p.visits)}</dd></div>
                  <div><dt>Jours actifs</dt><dd>{nf(p.activeDays)}</dd></div>
                  <div><dt>Parties</dt><dd>{nf(p.games)}</dd></div>
                  <div className="wide"><dt>Provenance</dt><dd title={p.source}>{p.source}</dd></div>
                  <div><dt>1re visite</dt><dd title={dateTime(p.firstAt)}>{shortDate(p.firstAt)}</dd></div>
                  <div><dt>Dernière</dt><dd title={dateTime(p.lastAt)}>{shortDate(p.lastAt)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="adm-pager">
            <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>← Précédent</button>
            <span>Page {page + 1} / {pages}</span>
            <button className="btn small" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Suivant →</button>
          </div>
        </>
      ))}
    </>
  );
}

function RetentionTab({ token }: { token: string | null }) {
  const [by, setBy] = useState<'day' | 'week'>('week');
  const [who, setWho] = useState<'comptes' | 'visiteurs'>('visiteurs');
  const { data, error } = useAdmin<{ rows: { cohort: string; size: number; d1: number | null; d7: number | null; d30: number | null }[] }>(`/admin/retention?by=${by}&who=${who}`, token);
  const cell = (n: number | null, size: number) => {
    if (n == null) return <td className="na">–</td>;
    const p = size ? n / size : 0;
    return <td style={{ background: `rgba(91, 135, 224, ${0.08 + p * 0.7})` }}>{pct(n, size)}<small>{nf(n)}</small></td>;
  };
  return (
    <>
      <div className="adm-tools">
        <div className="seg"><button className={who === 'visiteurs' ? 'on' : ''} onClick={() => setWho('visiteurs')}>Visiteurs</button><button className={who === 'comptes' ? 'on' : ''} onClick={() => setWho('comptes')}>Comptes</button></div>
        <div className="seg"><button className={by === 'week' ? 'on' : ''} onClick={() => setBy('week')}>Par semaine</button><button className={by === 'day' ? 'on' : ''} onClick={() => setBy('day')}>Par jour</button></div>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (!data.rows.length ? <p className="empty">{who === 'visiteurs' ? 'Aucune première visite sur la période.' : 'Aucune inscription sur la période.'}</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table retention">
            <thead><tr><th>{by === 'week' ? 'Semaine du' : 'Jour'}</th><th>{who === 'visiteurs' ? 'Nouveaux' : 'Inscrits'}</th><th>J1</th><th>J7</th><th>J30</th></tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.cohort}><th>{dayShort(r.cohort)}</th><td>{nf(r.size)}</td>{cell(r.d1, r.size)}{cell(r.d7, r.size)}{cell(r.d30, r.size)}</tr>)}</tbody>
          </table>
        </div>
      ))}
      <p className="muted small">{who === 'visiteurs'
        ? 'Visiteurs (avec ou sans compte) regroupés selon leur première visite. JN : part de ceux revenus au moins N jours après. « – » : trop tôt pour le savoir.'
        : 'JN : part des comptes revenus (jeu ouvert ou partie jouée) au moins N jours après leur inscription. « – » : trop tôt pour le savoir.'}</p>
    </>
  );
}

const KINDS: [string, string][] = [['', 'Tout'], ['connexion', 'Connexions'], ['partie', 'Parties'], ['achat', 'Achats'], ['sac', 'Sacs'], ['succes', 'Succès'], ['niveau', 'Niveaux'], ['gain', 'Gains'], ['admin', 'Admin']];
const KIND_ICON: Record<string, string> = { connexion: '🔑', partie: '🎲', achat: '🛒', sac: '🎲', succes: '🏅', niveau: '⭐', gain: '🪙', admin: '🛡️' };
function ActivityTab({ token, user, setUser }: { token: string | null; user: string; setUser: (u: string) => void }) {
  const [kind, setKind] = useState('');
  const [draft, setDraft] = useState(user);
  useEffect(() => setDraft(user), [user]);
  const q = `/admin/activity?user=${encodeURIComponent(user)}&kind=${kind}&limit=150`;
  const { data, error } = useAdmin<{ activity: { at: number; username: string; kind: string; text: string }[] }>(q, token);
  return (
    <>
      <form className="adm-search" onSubmit={(e) => { e.preventDefault(); setUser(draft.trim()); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Filtrer par pseudo (vide : tout le monde)" aria-label="Pseudo" />
        <button className="btn small" type="submit">Filtrer</button>
        {user && <button className="btn small ghost" type="button" onClick={() => setUser('')}>Effacer</button>}
      </form>
      <div className="adm-chips">{KINDS.map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      {error && <p className="error">{error}</p>}
      {data && (!data.activity.length ? <p className="empty">Aucune activité.</p> : (
        <ul className="adm-feed">
          {data.activity.map((a, i) => (
            <li key={i}>
              <span className="adm-feed-ico" aria-hidden>{KIND_ICON[a.kind] ?? '•'}</span>
              <span className="adm-feed-main"><button className="linkish" onClick={() => setUser(a.username)}>{a.username}</button> {a.text}</span>
              <small>{dateTime(a.at)}</small>
            </li>
          ))}
        </ul>
      ))}
    </>
  );
}

function EconomyTab({ token, coins }: { token: string | null; coins: number | null }) {
  const [range, setRange] = useState(30);
  const { data: e, error } = useAdmin<{ bySource: { source: string; label: string; earned: number; spent: number }[]; days: { day: string; earned: number; spent: number }[]; richest: { username: string; coins: number }[] }>(`/admin/economy?days=${range}`, token);
  if (error) return <p className="error">{error}</p>;
  if (!e) return <p className="muted">Chargement…</p>;
  const earned = e.bySource.reduce((a, s) => a + s.earned, 0), spent = e.bySource.reduce((a, s) => a + s.spent, 0);
  const max = Math.max(1, ...e.bySource.map((s) => Math.max(s.earned, s.spent)));
  return (
    <>
      <div className="seg"><button className={range === 7 ? 'on' : ''} onClick={() => setRange(7)}>7 jours</button><button className={range === 30 ? 'on' : ''} onClick={() => setRange(30)}>30 jours</button><button className={range === 90 ? 'on' : ''} onClick={() => setRange(90)}>90 jours</button></div>
      <div className="stat-row">
        <Kpi value={coins == null ? '…' : nf(coins)} label="pièces en circulation" hint="Somme des pièces de tous les comptes" />
        <Kpi value={`+${nf(earned)}`} label="pièces gagnées" />
        <Kpi value={spent ? `−${nf(spent)}` : '0'} label="pièces dépensées" />
        <Kpi value={`${earned - spent >= 0 ? '+' : '−'}${nf(Math.abs(earned - spent))}`} label="solde de la période" />
      </div>
      <section className="adm-card">
        <Bars grouped title="Pièces par jour" rows={e.days} series={[{ key: 'earned', label: 'Gagnées', cls: 's1' }, { key: 'spent', label: 'Dépensées', cls: 's2' }]} />
      </section>
      <section className="adm-card">
        <h3>Par source</h3>
        <div className="adm-legend"><span><i className="s1" aria-hidden />Gagnées</span><span><i className="s2" aria-hidden />Dépensées</span></div>
        {!e.bySource.length ? <p className="empty">Aucun mouvement enregistré sur la période.</p> : (
          <ul className="adm-eco">
            {e.bySource.map((s) => (
              <li key={s.source}>
                <span className="adm-eco-k">{s.label}</span>
                <span className="adm-eco-bars">
                  <span className="b s1" style={{ width: `${(100 * s.earned) / max}%` }} /><em>+{nf(s.earned)}</em>
                  <span className="b s2" style={{ width: `${(100 * s.spent) / max}%` }} /><em>−{nf(s.spent)}</em>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <TopList title="Comptes les plus riches" rows={e.richest.map((r) => ({ k: r.username, n: r.coins }))} />
      <GroschenAdmin token={token} days={range} />
    </>
  );
}

/** Le Courtisan : les Groschen (monnaie du mode), en circulation, bloqués en partie, mouvements. */
const GR_LABELS: Record<string, string> = { cadeau: 'Cadeau du jour', mise: 'Mises', gain: 'Pots gagnés', remboursement: 'Remboursements' };
function GroschenAdmin({ token, days }: { token: string | null; days: number }) {
  const { data: g } = useAdmin<{ circulation: number; escrow: number; byReason: { reason: string; earned: number; spent: number; moves: number }[]; richest: { username: string; balance: number }[] }>(`/admin/groschen?days=${days}`, token);
  if (!g) return null;
  return (
    <>
      <h3 style={{ marginTop: 18 }}>Le Courtisan : les Groschen</h3>
      <div className="stat-row">
        <Kpi value={nf(g.circulation)} label="Groschen en circulation" hint="Somme des soldes de tous les comptes" />
        <Kpi value={nf(g.escrow)} label="mises bloquées" hint="Parties en cours avec mise" />
      </div>
      <section className="adm-card">
        <h3>Mouvements ({days} jours)</h3>
        {!g.byReason.length ? <p className="empty">Aucun mouvement.</p> : (
          <ul className="adm-eco">{g.byReason.map((r) => (
            <li key={r.reason}><span className="adm-eco-k">{GR_LABELS[r.reason] ?? r.reason}</span><span className="adm-eco-bars"><em>+{nf(r.earned)}</em><em>−{nf(r.spent)}</em><em>{nf(r.moves)} mouv.</em></span></li>
          ))}</ul>
        )}
      </section>
      <TopList title="Plus gros soldes de Groschen" rows={g.richest.map((r) => ({ k: r.username, n: r.balance }))} />
    </>
  );
}

function LogTab({ token }: { token: string | null }) {
  const { data, error } = useAdmin<{ log: { at: number; admin: string; action: string; target: string | null; details: string }[] }>('/admin/log?limit=200', token);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Chargement…</p>;
  return !data.log.length ? <p className="empty">Aucune commande d’administration pour l’instant.</p> : (
    <ul className="adm-feed">
      {data.log.map((l, i) => (
        <li key={i}><span className="adm-feed-ico" aria-hidden>🛡️</span><span className="adm-feed-main"><b>{l.admin}</b> → <b>{l.target ?? '?'}</b> : {l.details}</span><small>{dateTime(l.at)}</small></li>
      ))}
    </ul>
  );
}

// --- Joueurs : recherche, fiche et commandes ---------------------------------------------------
interface PlayerSheet {
  id: string; username: string; createdAt: number; lastSeen: number | null; admin: boolean;
  coins: number; xp: number; level: number; prestige: number; bags: number; shards: number;
  items: { id: string; name: string; category: string; rarity: string | null }[];
  games: { total: number; solo: number; online: number; won: number; played: number };
  achievements: number;
  ban: { reason: string; until: number | null; by: string; at: number; text: string } | null;
}
function PlayersTab({ token, onActivity, onChanged, open }: { token: string | null; onActivity: (u: string) => void; onChanged: () => void; open?: string | null }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data: list } = useAdmin<{ players: { id: string; username: string; createdAt: number; coins: number; level: number; banned: boolean }[] }>(`/admin/players?q=${encodeURIComponent(search)}`, token);
  const [sel, setSel] = useState<string | null>(open ?? null);
  useEffect(() => { if (open) setSel(open); }, [open]);
  return (
    <>
      <form className="adm-search" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un pseudo" aria-label="Pseudo" autoCapitalize="off" />
        <button className="btn small primary" type="submit">Chercher</button>
      </form>
      {sel ? <PlayerCardAdmin token={token} id={sel} onClose={() => setSel(null)} onActivity={onActivity} onChanged={onChanged} /> : (
        <>
          <p className="muted small">{search ? `Résultats pour « ${search} »` : 'Derniers inscrits'}</p>
          {list && (!list.players.length ? <p className="empty">Aucun joueur trouvé.</p> : (
            <ul className="adm-players">
              {list.players.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setSel(p.id)}>
                    <b>{p.username}{p.banned && <span className="adm-badge danger">suspendu</span>}</b>
                    <small>niv. {p.level} · {nf(p.coins)} pièces · inscrit le {dateTime(p.createdAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </>
      )}
    </>
  );
}

function PlayerCardAdmin({ token, id, onClose, onActivity, onChanged }: { token: string | null; id: string; onClose: () => void; onActivity: (u: string) => void; onChanged: () => void }) {
  const { data, error, reload } = useAdmin<{ player: PlayerSheet }>(`/admin/players/${encodeURIComponent(id)}`, token);
  const { data: cat } = useAdmin<{ items: { id: string; name: string; category: string; rarity: string | null }[] }>('/admin/catalog', token);
  const [p, setP] = useState<PlayerSheet | null>(null);
  useEffect(() => { if (data) setP(data.player); }, [data]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [coins, setCoins] = useState('100');
  const [bags, setBags] = useState('1');
  const [item, setItem] = useState('');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const owned = useMemo(() => new Set(p?.items.map((i) => i.id)), [p]);
  const groups = useMemo(() => {
    const g = new Map<string, NonNullable<typeof cat>['items']>();
    for (const it of cat?.items ?? []) { if (owned.has(it.id)) continue; if (!g.has(it.category)) g.set(it.category, []); g.get(it.category)!.push(it); }
    return [...g.entries()];
  }, [cat, owned]);

  const run = async (path: string, body: object, confirm?: string) => {
    if (!p) return;
    if (confirm && !(await askConfirm(confirm))) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ player: PlayerSheet }>(`/admin/players/${encodeURIComponent(p.id)}/${path}`, { body, token });
      setP(r.player); setMsg({ ok: true, text: 'C’est fait (enregistré dans le journal).' }); onChanged();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
  if (error) return <p className="error">{error} <button className="btn small ghost" onClick={reload}>Réessayer</button></p>;
  if (!p) return <p className="muted">Chargement…</p>;
  const n = (s: string) => Math.trunc(Number(s));
  return (
    <section className="adm-sheet">
      <header>
        <button className="btn small ghost" onClick={onClose}>← Liste</button>
        <h3>{p.username}{p.admin && <span className="adm-badge">admin</span>}{p.ban && <span className="adm-badge danger">suspendu</span>}</h3>
      </header>
      <div className="stat-row">
        <Kpi value={nf(p.coins)} label="pièces" />
        <Kpi value={`${p.level}${p.prestige ? ` ★${p.prestige}` : ''}`} label={`niveau (${nf(p.xp)} XP)`} />
        <Kpi value={nf(p.bags)} label="sacs à ouvrir" />
        <Kpi value={nf(p.games.total)} label={`parties (${p.games.solo} solo, ${p.games.online} en ligne)`} hint={`${p.games.won} gagnées ; ${p.games.played} parties au compteur du profil`} />
      </div>
      <dl className="adm-dl">
        <dt>Inscription</dt><dd>{dateTime(p.createdAt)}</dd>
        <dt>Dernière activité</dt><dd>{dateTime(p.lastSeen)}</dd>
        <dt>Éclats · succès</dt><dd>{nf(p.shards)} · {p.achievements}</dd>
        <dt>Statut</dt><dd>{p.ban ? <span className="error">{p.ban.text} (par {p.ban.by}, le {dateTime(p.ban.at)})</span> : 'Actif'}</dd>
      </dl>
      <button className="btn small secondary" onClick={() => onActivity(p.username)}>Voir son activité</button>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}

      <div className="adm-actions">
        <fieldset disabled={busy}>
          <legend>Pièces</legend>
          <div className="adm-inline">
            <input type="number" inputMode="numeric" min="1" value={coins} onChange={(e) => setCoins(e.target.value)} aria-label="Nombre de pièces" />
            <button className="btn small" onClick={() => run('coins', { delta: n(coins) })}>Donner</button>
            <button className="btn small danger" onClick={() => run('coins', { delta: -n(coins) }, `Retirer ${coins} pièces à ${p.username} ?`)}>Retirer</button>
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Sacs de dés</legend>
          <div className="adm-inline">
            <input type="number" inputMode="numeric" min="1" value={bags} onChange={(e) => setBags(e.target.value)} aria-label="Nombre de sacs" />
            <button className="btn small" onClick={() => run('bags', { delta: n(bags) })}>Donner</button>
            <button className="btn small danger" onClick={() => run('bags', { delta: -n(bags) }, `Retirer ${bags} sac(s) à ${p.username} ?`)}>Retirer</button>
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Donner un objet</legend>
          <div className="adm-inline">
            <select value={item} onChange={(e) => setItem(e.target.value)} aria-label="Objet du catalogue">
              <option value="">Choisir un objet…</option>
              {groups.map(([g, its]) => <optgroup key={g} label={g}>{its.map((it) => <option key={it.id} value={it.id}>{it.name}{it.rarity ? ` (${it.rarity})` : ''}</option>)}</optgroup>)}
            </select>
            <button className="btn small" disabled={!item} onClick={() => { void run('items', { id: item, action: 'give' }); setItem(''); }}>Donner</button>
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>{p.ban ? 'Suspension' : 'Suspendre le compte'}</legend>
          {p.ban ? <button className="btn small" onClick={() => run('unban', {}, `Lever la suspension de ${p.username} ?`)}>Lever la suspension</button> : p.admin ? <p className="muted small">Un compte administrateur ne peut pas être suspendu.</p> : (
            <div className="adm-ban">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (facultatif, visible du joueur)" maxLength={200} aria-label="Motif" />
              <div className="adm-inline">
                <input type="number" inputMode="numeric" min="1" value={days} onChange={(e) => setDays(e.target.value)} placeholder="Jours (vide : définitif)" aria-label="Durée en jours" />
                <button className="btn small danger-solid" onClick={() => run('ban', { reason, days: days ? n(days) : null },
                  `Suspendre ${p.username} ${days ? `pendant ${days} jour(s)` : 'définitivement'} ? Ses sessions en cours seront coupées.`)}>Suspendre</button>
              </div>
            </div>
          )}
        </fieldset>
      </div>

      <h4>Objets possédés ({p.items.length}) <small className="muted">hors objets gratuits</small></h4>
      {!p.items.length ? <p className="empty">Aucun objet.</p> : (
        <ul className="adm-items">
          {p.items.map((it) => (
            <li key={it.id}>
              <span><b>{it.name}</b><small>{it.category}{it.rarity ? ` · ${it.rarity}` : ''}</small></span>
              <button className="btn small ghost danger" disabled={busy} onClick={() => run('items', { id: it.id, action: 'remove' }, `Retirer « ${it.name} » à ${p.username} ?`)}>Retirer</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminDashboard({ pa, onBack }: { pa: ProfileApi; onBack: () => void }) {
  const token = pa.token;
  const [tab, setTab] = useState<Tab>(() => { try { return (sessionStorage.getItem('421.admin.tab') as Tab) || 'enligne'; } catch { return 'enligne'; } });
  const [peopleSearch, setPeopleSearch] = useState({ q: '', n: 0 });
  useEffect(() => { try { sessionStorage.setItem('421.admin.tab', tab); } catch { /* */ } }, [tab]);
  const [activityUser, setActivityUser] = useState('');
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  const { data: o, error, reload } = useAdmin<Overview>('/admin/overview', token, 30_000);
  const { data: live } = useAdmin<Live>('/admin/stats', token, 20_000);
  const mod = useModeration(token);
  const [pending, setPending] = useState<number | null>(null);
  const toTreat = pending ?? mod?.pending ?? 0;
  return (
    <Shell title="Administration" onBack={onBack} wide>
      {error && <p className="error">{error}</p>}
      {!o && !error && <p className="muted">Chargement…</p>}
      {o && (
        <div className="stats adm">
          <div className="stat-row big adm-kpis">
            <Kpi value={nf(o.users)} label="joueurs inscrits" />
            <Kpi value={nf(o.active.today)} label="actifs aujourd’hui" />
            <button className="stat-counter adm-kpi-link" onClick={() => setTab('enligne')} title="Voir qui est en ligne"><b>{live ? nf(live.live.online) : '…'}</b><span>en ligne maintenant</span></button>
            <Kpi value={nf(o.coins)} label="pièces en circulation" />
          </div>
          <nav className="tabs adm-tabs" role="tablist">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'signalements' && toTreat > 0 && <i className="tab-badge" aria-label={`${toTreat} à traiter`}>{toTreat > 99 ? '99+' : toTreat}</i>}</button>)}
          </nav>
          {tab === 'enligne' && <LiveTab token={token} onOpenPlayer={(id) => { setOpenPlayer(id); setTab('joueurs'); }}
            onOpenVisitor={(label) => { setPeopleSearch((p) => ({ q: label.replace(/^Visiteur /, ''), n: p.n + 1 })); setTab('personnes'); }} />}
          {tab === 'apercu' && <OverviewTab o={o} live={live} onLive={() => setTab('enligne')} />}
          {tab === 'signalements' && <ModerationPanel token={token} admin onPending={setPending} />}
          {tab === 'personnes' && <PeopleTab key={peopleSearch.n} initialSearch={peopleSearch.q} token={token} onOpen={(id) => { setOpenPlayer(id); setTab('joueurs'); }} />}
          {tab === 'joueurs' && <PlayersTab token={token} open={openPlayer} onActivity={(u) => { setActivityUser(u); setTab('activite'); }} onChanged={reload} />}
          {tab === 'visiteurs' && <VisitorsTab token={token} />}
          {tab === 'retention' && <RetentionTab token={token} />}
          {tab === 'activite' && <ActivityTab token={token} user={activityUser} setUser={setActivityUser} />}
          {tab === 'economie' && <EconomyTab token={token} coins={o.coins} />}
          {tab === 'cf' && <Suspense fallback={<p className="muted">Chargement…</p>}><CfAdminStats token={token} /></Suspense>}
          {tab === 'journal' && <LogTab token={token} />}
        </div>
      )}
    </Shell>
  );
}
