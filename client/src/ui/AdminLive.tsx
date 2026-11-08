/**
 * Administration : « En ligne maintenant ». Chaque appareil relié au jeu en ce moment (comptes et
 * invités), ce qu'il fait, d'où il vient. Rafraîchi toutes les 5 s tant que l'onglet est visible.
 * Le serveur vérifie l'accès (403 pour les non-admins) et ne renvoie ni adresse IP ni email.
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../account/api';
import { Avatar } from './Avatar';

type Game = '421' | 'cf' | 'courtisan';
type Status = 'partie' | 'salon' | 'menu';
export interface LiveRow {
  key: string; kind: 'compte' | 'invite';
  userId: string | null; username: string | null; level: number | null; photo: string | null; admin: boolean;
  label: string; displayName: string | null; avatar: string | null;
  activity: { game: Game | null; status: Status; where: string; code: string | null; mode: 'solo' | 'en ligne' | 'tournoi' | 'spectateur' | null };
  activitySince: number; otherTabs: string[]; tabs: number; since: number; device: 'mobile' | 'tablette' | 'ordinateur';
  country: string | null; countryName: string | null; flag: string | null; newcomer: boolean | null; activeDays: number | null; oldClient: boolean;
}
interface LiveData {
  at: number; rows: LiveRow[];
  summary: { accounts: number; guests: number; playing: number; inMenus: number; byGame: Record<Game | 'aucun', number> };
}

const GAME: Record<Game, string> = { '421': '421', cf: 'Coups Fourrés', courtisan: 'Le Courtisan' };
const STATUS: Record<Status, string> = { partie: 'En partie', salon: 'À une table', menu: 'Menus' };
const DEVICE: Record<LiveRow['device'], string> = { mobile: 'Téléphone', tablette: 'Tablette', ordinateur: 'Ordinateur' };
type Filter = 'tous' | 'comptes' | 'invites' | 'jeu';
type Sort = 'activite' | 'recent' | 'ancien' | 'nom';

/** Durée lisible : « 40 s », « 12 min », « 1 h 05 ». */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}

export function LiveTab({ token, onOpenPlayer, onOpenVisitor }: { token: string | null; onOpenPlayer: (userId: string) => void; onOpenVisitor: (label: string) => void }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // horloge du serveur − horloge locale
  const [, tick] = useState(0);
  const [filter, setFilter] = useState<Filter>(() => { try { return (sessionStorage.getItem('421.admin.live.f') as Filter) || 'tous'; } catch { return 'tous'; } });
  const [sort, setSort] = useState<Sort>('activite');
  useEffect(() => { try { sessionStorage.setItem('421.admin.live.f', filter); } catch { /* */ } }, [filter]);
  useEffect(() => {
    let alive = true;
    const load = () => api<LiveData>('/admin/live', { token })
      .then((d) => { if (alive) { setData(d); setOffset(d.at - Date.now()); setError(null); } })
      .catch((e) => { if (alive) setError((e as Error).message); });
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5000);
    const c = setInterval(() => tick((x) => x + 1), 1000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(t); clearInterval(c); document.removeEventListener('visibilitychange', onVis); };
  }, [token]);
  const now = Date.now() + offset;

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.rows;
    if (filter === 'comptes') r = r.filter((x) => x.kind === 'compte');
    else if (filter === 'invites') r = r.filter((x) => x.kind === 'invite');
    else if (filter === 'jeu') r = r.filter((x) => x.activity.status !== 'menu');
    const name = (x: LiveRow) => (x.username ?? x.displayName ?? x.label).toLowerCase();
    if (sort === 'recent') r = [...r].sort((a, b) => b.since - a.since);
    else if (sort === 'ancien') r = [...r].sort((a, b) => a.since - b.since);
    else if (sort === 'nom') r = [...r].sort((a, b) => name(a).localeCompare(name(b), 'fr'));
    return r;
  }, [data, filter, sort]);

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Chargement…</p>;
  const s = data.summary;
  const games = (['421', 'cf', 'courtisan'] as Game[]).filter((g) => s.byGame[g] > 0);
  return (
    <section className="adm-live" aria-label="En ligne maintenant">
      <header className="adm-live-head">
        <h3><i className="adm-live-dot" aria-hidden />En ligne maintenant <small className="muted">{data.rows.length} appareil{data.rows.length > 1 ? 's' : ''}</small></h3>
        <small className="muted">{error ? 'Connexion perdue, nouvel essai…' : `mis à jour il y a ${ago(now - data.at)}`}</small>
      </header>
      <div className="adm-live-kpis">
        <button className={filter === 'comptes' ? 'on' : ''} onClick={() => setFilter(filter === 'comptes' ? 'tous' : 'comptes')}><b>{s.accounts}</b><span>compte{s.accounts > 1 ? 's' : ''}</span></button>
        <button className={filter === 'invites' ? 'on' : ''} onClick={() => setFilter(filter === 'invites' ? 'tous' : 'invites')}><b>{s.guests}</b><span>invité{s.guests > 1 ? 's' : ''}</span></button>
        <button className={filter === 'jeu' ? 'on' : ''} onClick={() => setFilter(filter === 'jeu' ? 'tous' : 'jeu')}><b>{s.playing}</b><span>en partie</span></button>
        <div><b>{s.inMenus}</b><span>dans les menus</span></div>
      </div>
      {(games.length > 0 || s.byGame.aucun > 0) && (
        <p className="adm-live-games">
          {games.map((g) => <span key={g} className={`adm-live-game g-${g}`}>{GAME[g]} <b>{s.byGame[g]}</b></span>)}
          {s.byGame.aucun > 0 && <span className="adm-live-game">Ailleurs (accueil, boutique…) <b>{s.byGame.aucun}</b></span>}
        </p>
      )}
      <div className="adm-live-tools">
        <div className="seg" role="group" aria-label="Filtre">
          {([['tous', 'Tous'], ['comptes', 'Comptes'], ['invites', 'Invités'], ['jeu', 'En partie']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <label className="adm-live-sort"><span>Tri</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="activite">En partie d’abord</option>
            <option value="recent">Arrivés récemment</option>
            <option value="ancien">Connectés depuis longtemps</option>
            <option value="nom">Nom</option>
          </select>
        </label>
      </div>
      {!rows.length ? (
        <p className="empty">{data.rows.length ? 'Personne dans ce filtre.' : 'Personne en ligne pour l’instant.'}</p>
      ) : (
        <ul className="adm-live-list">
          {rows.map((r) => <LiveItem key={r.key} r={r} now={now} onOpenPlayer={onOpenPlayer} onOpenVisitor={onOpenVisitor} />)}
        </ul>
      )}
      <p className="muted small">Un appareil par ligne (ses onglets regroupés). Pays d’après l’hébergeur, le fuseau horaire ou la langue du navigateur : jamais d’adresse IP. Un invité est désigné par son numéro de visiteur anonyme (onglet « Personnes ») et le nom qu’il a choisi pour jouer.</p>
    </section>
  );
}

function LiveItem({ r, now, onOpenPlayer, onOpenVisitor }: { r: LiveRow; now: number; onOpenPlayer: (id: string) => void; onOpenVisitor: (label: string) => void }) {
  const a = r.activity;
  return (
    <li className={`adm-live-item st-${a.status}`}>
      <Avatar photo={r.photo} emoji={r.avatar ?? (r.kind === 'invite' ? '👤' : undefined)} size={40} />
      <div className="adm-live-main">
        <div className="adm-live-who">
          {r.kind === 'compte' && r.userId
            ? <button className="linkish" onClick={() => onOpenPlayer(r.userId!)} title="Ouvrir la fiche du joueur">{r.username}</button>
            : <span className="adm-live-guest">Invité{r.displayName ? <> · <b>{r.displayName}</b></> : null}</span>}
          {r.level != null && <span className="adm-badge">niv. {r.level}</span>}
          {r.admin && <span className="adm-badge">admin</span>}
          <span className={`adm-live-st st-${a.status}`}>{STATUS[a.status]}</span>
        </div>
        <div className="adm-live-what">
          {a.game && <span className={`adm-live-game g-${a.game}`}>{GAME[a.game]}</span>}
          <span>{a.where}{a.mode === 'en ligne' && a.status !== 'menu' && !a.where.includes('ligne') ? ' · en ligne' : ''}</span>
          {a.code && <span className="adm-live-code">table <b>{a.code.length > 8 ? a.code.slice(0, 8) : a.code}</b></span>}
          <span className="muted">depuis {ago(now - r.activitySince)}</span>
        </div>
        <div className="adm-live-meta">
          <span>{r.flag ? `${r.flag} ` : ''}{r.countryName ?? 'Pays inconnu'}</span>
          <span>{DEVICE[r.device]}</span>
          <span>connecté depuis {ago(now - r.since)}</span>
          {r.newcomer === true && <span className="adm-live-new">Nouveau aujourd’hui</span>}
          {r.newcomer === false && r.activeDays != null && <span>Habitué · {r.activeDays} jour{r.activeDays > 1 ? 's' : ''}</span>}
          {r.kind === 'invite' && <button className="linkish" onClick={() => onOpenVisitor(r.label)} title="Voir ce visiteur dans l’onglet Personnes">{r.label}</button>}
          {r.oldClient && <span title="Onglet ouvert avant la dernière mise à jour : détail limité">ancienne version</span>}
        </div>
        {r.otherTabs.length > 0 && (
          <div className="adm-live-tabs">{r.tabs} onglets · aussi : {r.otherTabs.join(' ; ')}</div>
        )}
      </div>
    </li>
  );
}
