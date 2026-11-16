/**
 * Administration : statistiques des QUATRE jeux (421, Le Courtisan, Coups Fourrés, Poker menteur).
 *  - GamesOverview : bloc de l'onglet « Vue d'ensemble » (parties par jour ventilées par jeu, indicateurs) ;
 *  - GamesTab : onglet « Jeux » (une section par jeu, « Qui joue à quoi », jeu lancé depuis l'accueil).
 * Données : GET /api/admin/games (server/games-stats.ts), réservé aux administrateurs (le serveur vérifie).
 * L'administration reste en français seulement.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from '../account/api';

type GameKey = '421' | 'courtisan' | 'cf' | 'poker';
const GAMES: GameKey[] = ['421', 'courtisan', 'cf', 'poker'];
const NAME: Record<GameKey, string> = { '421': '421', courtisan: 'Le Courtisan', cf: 'Coups Fourrés', poker: 'Poker menteur' };
const COLOR: Record<GameKey, string> = { '421': '#c9a227', courtisan: '#5b87e0', cf: '#d0674f', poker: '#4fa877' };

interface Since { all: string | null; solo: string | null; online: string | null; note: string }
interface Per {
  today: number; d7: number; d30: number; solo30: number; online30: number;
  players7: number; players30: number; accounts7: number; accounts30: number;
  medianS: number | null; medianSoloS: number | null; medianOnlineS: number | null; onlineShare: number | null; since: Since;
}
interface KN { k: string; n: number }
interface Report {
  day: string; from: string; runsSince: string;
  days: ({ day: string } & Record<string, number | string>)[];
  per: Record<GameKey, Per>;
  who: { accounts: number; perGame: Record<GameKey, number>; gamesPerAccount: { n: number; accounts: number }[]; combos: KN[] };
  details: {
    '421': {
      measuredSince: string; runs: number; variants: KN[]; kinds: KN[]; soloKinds: KN[]; tdcPlayed: KN[];
      tdc: { starsTotal: number; starsAccounts: number; byBistro: { k: string; stars: number; won: number }[]; bistros: number };
      boss: { winsAllTime: number; games30: number }; fete30: number;
      sched: { slots: KN[]; regs: KN[] }; tournois30: number; starts: { compte: number; invite: number };
    };
    courtisan: {
      measuredSince: string; runs: number; targets: KN[]; levels: KN[]; players: KN[]; stakes: KN[]; guests: number; abandoned: number; soloWinRate: number | null;
      starts: { compte: number; invite: number }; profiles: { games: number; accounts: number };
      groschen: { circulation: number; holders: number; since: string | null; ledger: { reason: string; n: number; sum: number; users: number }[] };
    };
    cf: { runs: number; modes: KN[]; levels: KN[]; players: KN[]; medianS: number | null; avgRounds: number | null };
    poker: {
      measuredSince: string; runs: number; lives: KN[]; noStraights: number; players: KN[]; levels: KN[]; medianSoloS: number | null; medianOnlineS: number | null;
      guests: number; abandoned: number; soloWinRate: number | null; starts: { compte: number; invite: number }; profiles: { games: number; accounts: number };
    };
  };
  clicks: { since: string | null; rows: { game: string; via: string; n: number }[] };
}

const H4: CSSProperties = { font: '700 1.0625rem var(--cond)', margin: '14px 0 6px' };
const nf = (n: number) => Math.round(n).toLocaleString('fr-BE');
const pc = (x: number | null) => (x == null ? '–' : `${Math.round(100 * x)} %`);
const dm = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : '–');
const dayShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dur = (s: number | null) => (s == null ? '–' : s < 90 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`);

/** Chargement partagé (aperçu et onglet) : un seul appel toutes les 60 s. */
function useGames(token: string | null) {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<Report>('/admin/games', { token }).then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => { if (alive) setError((e as Error).message); });
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [token]);
  return { data, error };
}

// --- Graphique : parties par jour, empilées par jeu --------------------------------------------
type Mode = 'tout' | 'solo' | 'online';
function GamesChart({ r }: { r: Report }) {
  const [mode, setMode] = useState<Mode>('tout');
  const [sel, setSel] = useState<number | null>(null);
  const v = (row: Report['days'][number], g: GameKey) =>
    (mode !== 'online' ? Number(row[`${g}_solo`]) || 0 : 0) + (mode !== 'solo' ? Number(row[`${g}_online`]) || 0 : 0);
  const tot = (row: Report['days'][number]) => GAMES.reduce((a, g) => a + v(row, g), 0);
  const rows = r.days;
  const max = Math.max(1, ...rows.map(tot));
  const W = 100 / rows.length, H = 40;
  const shown = sel ?? rows.length - 1;
  const cur = rows[shown];
  const sums = Object.fromEntries(GAMES.map((g) => [g, rows.reduce((a, x) => a + v(x, g), 0)])) as Record<GameKey, number>;
  return (
    <figure className="adm-chart">
      <figcaption>
        <span className="adm-chart-title">Parties par jour (30 jours), par jeu</span>
        <span className="adm-chart-val"><b>{nf(tot(cur))}</b> {sel === null ? 'aujourd’hui' : dayLong(cur.day)}
          <small> ({GAMES.map((g) => `${NAME[g]} ${nf(v(cur, g))}`).join(', ')})</small></span>
      </figcaption>
      <div className="seg" role="group" aria-label="Solo ou en ligne">
        {([['tout', 'Tout'], ['solo', 'Solo'], ['online', 'En ligne']] as [Mode, string][]).map(([k, l]) =>
          <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
      </div>
      <div className="adm-legend" style={{ marginTop: 8 }}>{GAMES.map((g) => <span key={g}><i aria-hidden style={{ background: COLOR[g] }} />{NAME[g]} · {nf(sums[g])}</span>)}</div>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label="Parties par jour et par jeu" onMouseLeave={() => setSel(null)}>
        {[0.5, 1].map((f) => <line key={f} x1="0" x2="100" y1={H - 38 * f} y2={H - 38 * f} className="grid" />)}
        {rows.map((x, i) => {
          let y = H;
          return (
            <g key={x.day} onMouseEnter={() => setSel(i)} onClick={() => setSel(i === sel ? null : i)}>
              <rect x={i * W} y="0" width={W} height={H} className="hit" />
              {GAMES.map((g) => {
                const n = v(x, g);
                if (!n) return null;
                const h = Math.max(0.8, (38 * n) / max);
                y -= h;
                return <rect key={g} x={i * W + W * 0.15} y={y + 0.15} width={W * 0.7} height={Math.max(0.5, h - 0.3)} rx="0.5" style={{ fill: COLOR[g], opacity: i === shown ? 1 : 0.8 }} />;
              })}
            </g>
          );
        })}
      </svg>
      <div className="chart-axis"><span>{dayShort(rows[0].day)}</span><span>max {nf(max)}</span><span>{dayShort(rows[rows.length - 1].day)}</span></div>
    </figure>
  );
}

const Line = ({ v, l }: { v: string; l: string }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
    <b style={{ font: '800 1.25rem var(--cond)', minWidth: 56, fontVariantNumeric: 'tabular-nums' }}>{v}</b><span style={{ color: 'var(--texte-2)', fontSize: '0.875rem', minWidth: 0 }}>{l}</span>
  </div>
);
function GameCard({ g, p }: { g: GameKey; p: Per }) {
  return (
    <section className="adm-card" style={{ borderTop: `4px solid ${COLOR[g]}` }}>
      <h3>{NAME[g]}</h3>
      <div>
        <Line v={nf(p.today)} l={`aujourd’hui · ${nf(p.d7)} sur 7 j · ${nf(p.d30)} sur 30 j`} />
        <Line v={nf(p.players7)} l={`joueurs distincts sur 7 j (${nf(p.accounts7)} comptes) · ${nf(p.players30)} sur 30 j`} />
        <Line v={dur(p.medianS)} l={`durée médiane (solo ${dur(p.medianSoloS)}, en ligne ${dur(p.medianOnlineS)})`} />
        <Line v={pc(p.onlineShare)} l={`en ligne sur 30 j (${nf(p.online30)} en ligne, ${nf(p.solo30)} solo)`} />
      </div>
      <p className="muted small">{p.since.all ? `Mesuré depuis le ${dm(p.since.all)}. ` : 'Encore aucune partie enregistrée. '}{p.since.note}</p>
    </section>
  );
}

/** Bloc de la « Vue d’ensemble ». */
export function GamesOverview({ token }: { token: string | null }) {
  const { data: r, error } = useGames(token);
  if (error) return <p className="error">{error}</p>;
  if (!r) return <p className="muted">Chargement des jeux…</p>;
  return (
    <>
      <section className="adm-card"><GamesChart r={r} />
        <p className="muted small">« En ligne » = table du serveur (parties rapides complétées par des ordinateurs comprises). Coups Fourrés : comptes seulement. Le Courtisan et le Poker menteur : parties solo mesurées depuis le {dm(r.runsSince)}.</p>
      </section>
      <div className="adm-grid">{GAMES.map((g) => <GameCard key={g} g={g} p={r.per[g]} />)}</div>
    </>
  );
}

// --- Onglet « Jeux » -----------------------------------------------------------------------------
function Mini({ title, rows, label = (k: string) => k, empty = 'Rien pour l’instant.' }: { title: string; rows: KN[]; label?: (k: string) => string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div>
      <h4 style={H4}>{title}</h4>
      {!rows.length ? <p className="empty">{empty}</p> : (
        <ul className="adm-top">{rows.map((r) => (
          <li key={r.k}><span className="adm-top-k" title={label(r.k)}>{label(r.k)}</span><span className="adm-top-n">{nf(r.n)}</span>
            <span className="adm-top-bar" style={{ width: `${(100 * r.n) / max}%` }} aria-hidden /></li>
        ))}</ul>
      )}
    </div>
  );
}
const LEVEL: Record<string, string> = { debutant: 'Débutant', habitue: 'Habitué', fouine: 'Fine fouine', 'fine-fouine': 'Fine fouine', facile: 'Facile', normal: 'Normal', difficile: 'Difficile' };
const VARIANT: Record<string, string> = { classique: 'Classique (charge + décharge)', decharge: 'Décharge seule', manches: 'Aux points (manches)', blitz: 'Blitz', 'mort-subite': 'Mort subite', inconnue: 'Inconnue (ancienne version / invité)' };
const KIND: Record<string, string> = { libre: 'Partie libre (solo)', patron: 'Patron de la semaine', fete: 'Adversaire de fête', 'Tournée des comptoirs': 'Tournée des comptoirs', salon: 'Salon en ligne', 'partie rapide': 'Partie rapide', tournoi: 'Tournoi', 'tournoi programmé': 'Tournoi programmé 11 h / 21 h' };
const SCHED: Record<string, string> = { 'a-venir': 'à venir', salon: 'inscriptions', 'en-cours': 'en cours', termine: 'terminés', fini: 'terminés', annule: 'annulés', inscrit: 'inscrits (en attente)', joue: 'ont joué', rembourse: 'remboursés' };
const CF_MODE: Record<string, string> = { classee: 'Classée', ami: 'Défi entre amis', table: 'Table à code', bot: 'Contre l’ordinateur', tournoi: 'Tournoi du samedi' };
const REASON: Record<string, string> = { bienvenue: 'Cadeau de bienvenue', cadeau: 'Cadeau du jour', mise: 'Mises', gain: 'Pots gagnés (part des joueurs)', 'gain-ordi': 'Pots gagnés (part des ordinateurs)', remboursement: 'Remboursements', admin: 'Commandes admin' };
const VIA: Record<string, string> = { accueil: 'Bouton « Lancer les dés » (accueil)', lien: 'Lien ?jouer= (pages d’aide)', menu: 'Menus du jeu', inconnu: 'Inconnu' };
const FIRST: Record<string, string> = { '421': '421 solo', courtisan: 'Le Courtisan', cartes: 'Coups Fourrés', poker: 'Poker menteur', online: '421 en ligne', inconnu: 'Inconnu (avant le suivi par jeu)' };

function Section({ g, children, r }: { g: GameKey; children: ReactNode; r: Report }) {
  const p = r.per[g];
  return (
    <section className="adm-card" style={{ borderTop: `4px solid ${COLOR[g]}` }}>
      <h3>{NAME[g]} <small className="muted">{nf(p.d30)} parties sur 30 j · {nf(p.accounts7)} comptes actifs sur 7 j</small></h3>
      {children}
    </section>
  );
}

export function GamesTab({ token, onOpenCf }: { token: string | null; onOpenCf?: () => void }) {
  const { data: r, error } = useGames(token);
  if (error) return <p className="error">{error}</p>;
  if (!r) return <p className="muted">Chargement…</p>;
  const d = r.details;
  const t = d['421'], c = d.courtisan, p = d.poker, cf = d.cf;
  const since = (s: string) => `Mesuré depuis le ${dm(s)}`;
  const starts = (s: { compte: number; invite: number }, done: number) => s.compte + s.invite
    ? `${nf(s.compte + s.invite)} parties solo commencées (${nf(s.compte)} comptes, ${nf(s.invite)} invités) pour ${nf(done)} terminées.` : '';
  const clickGames = [...new Set(r.clicks.rows.map((x) => x.game))];
  const clickVias = [...new Set(r.clicks.rows.map((x) => x.via))];
  const cell = (g: string, v: string) => r.clicks.rows.find((x) => x.game === g && x.via === v)?.n ?? 0;
  return (
    <div className="adm-games">
      <section className="adm-card">
        <h3>Qui joue à quoi <small className="muted">comptes actifs sur 7 jours</small></h3>
        <div className="stat-row">
          {GAMES.map((g) => <div key={g} className="stat-counter"><b style={{ color: COLOR[g] }}>{nf(r.who.perGame[g])}</b><span>{NAME[g]}</span></div>)}
        </div>
        <p className="muted small">{nf(r.who.accounts)} comptes ont joué sur 7 jours : {r.who.gamesPerAccount.map((x) => `${nf(x.accounts)} à ${x.n} jeu${x.n > 1 ? 'x' : ''}`).join(', ')}.
          {r.who.combos.length > 0 && <> Combinaisons les plus courantes : {r.who.combos.slice(0, 5).map((x) => `${x.k.split('+').map((k) => NAME[k as GameKey] ?? k).join(' + ')} (${nf(x.n)})`).join(' ; ')}.</>}</p>
        <p className="muted small">Invités : comptés par appareil quand ils jouent au 421, au Courtisan ou au Poker menteur (pas à Coups Fourrés) ; ils n’apparaissent pas ici (pas de compte).</p>
      </section>

      <Section g="421" r={r}>
        <div className="adm-grid">
          <Mini title="Genres de parties (30 j)" rows={t.kinds} label={(k) => KIND[k] ?? k} />
          <Mini title="Variantes jouées (30 j)" rows={t.variants} label={(k) => VARIANT[k] ?? k} />
        </div>
        <p className="muted small">{since(t.measuredSince)} pour les genres et variantes : solo des comptes et tables en ligne ({nf(t.runs)} parties). Les invités en solo sont comptés dans les totaux, sans détail. {starts(t.starts, r.per['421'].solo30)}</p>
        <h4 style={H4}>Tournée des comptoirs</h4>
        <div className="stat-row">
          <div className="stat-counter"><b>{nf(t.tdc.starsTotal)}</b><span>étoiles gagnées (depuis le début)</span></div>
          <div className="stat-counter"><b>{nf(t.tdc.starsAccounts)}</b><span>comptes avec au moins une étoile</span></div>
          <div className="stat-counter"><b>{nf(t.boss.winsAllTime)}</b><span>patrons de la semaine battus (depuis le début)</span></div>
          <div className="stat-counter"><b>{nf(t.boss.games30)}</b><span>parties contre le patron (30 j)</span></div>
        </div>
        <div className="adm-grid">
          <Mini title="Bistrots les plus joués (30 j)" rows={t.tdcPlayed} />
          <Mini title="Étoiles par bistrot (comptes)" rows={t.tdc.byBistro.map((b) => ({ k: `${b.k} · gagné par ${b.won}`, n: b.stars }))} />
        </div>
        <h4 style={H4}>Tournois</h4>
        <div className="adm-grid">
          <Mini title="Tournois programmés 11 h / 21 h (30 j)" rows={t.sched.slots} label={(k) => SCHED[k] ?? k} empty="Aucun créneau sur la période." />
          <Mini title="Inscriptions à ces tournois (30 j)" rows={t.sched.regs} label={(k) => SCHED[k] ?? k} empty="Aucune inscription." />
        </div>
        <p className="muted small">{nf(t.tournois30)} tournois terminés sur 30 jours (tous genres) ; {nf(t.fete30)} parties contre un adversaire de fête.</p>
      </Section>

      <Section g="courtisan" r={r}>
        <div className="adm-grid">
          <Mini title="Objectif choisi" rows={c.targets} label={(k) => (k === 'inconnu' ? 'Inconnu (ancienne version)' : `${nf(Number(k))} points`)} />
          <Mini title="Niveau des ordinateurs (parties)" rows={c.levels} label={(k) => LEVEL[k] ?? k} />
          <Mini title="Joueurs à table" rows={c.players} label={(k) => `${k} joueurs`} />
          <Mini title="Mises (tables du serveur)" rows={c.stakes} />
        </div>
        <p className="muted small">{since(c.measuredSince)} ({nf(c.runs)} parties, dont {nf(c.guests)} d’invités en solo ; {nf(c.abandoned)} départs en cours de partie en ligne). Victoires en solo : {pc(c.soloWinRate)}. {starts(c.starts, c.runs)} Depuis le début, les comptes ont cumulé {nf(c.profiles.games)} parties ({nf(c.profiles.accounts)} comptes).</p>
        <h4 style={H4}>Groschen</h4>
        <div className="stat-row">
          <div className="stat-counter"><b>{nf(c.groschen.circulation)}</b><span>en circulation ({nf(c.groschen.holders)} comptes)</span></div>
          {(['mise', 'gain', 'gain-ordi', 'cadeau'] as const).map((k) => { const x = c.groschen.ledger.find((l) => l.reason === k); return (
            <div key={k} className="stat-counter"><b>{nf(Math.abs(x?.sum ?? 0))}</b><span>{REASON[k].toLowerCase()} (30 j)</span></div>); })}
        </div>
        {c.groschen.ledger.length > 0 && (
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr><th>Mouvement (30 j)</th><th>Total</th><th>Nb</th><th>Comptes</th></tr></thead>
            <tbody>{c.groschen.ledger.map((l) => <tr key={l.reason}><th>{REASON[l.reason] ?? l.reason}</th><td>{l.sum > 0 ? '+' : ''}{nf(l.sum)}</td><td>{nf(l.n)}</td><td>{nf(l.users)}</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="muted small">{c.groschen.since ? `Journal des Groschen complet depuis le ${dm(c.groschen.since)}` : 'Aucun mouvement de Groschen enregistré'} (détail par compte : onglet Économie).</p>
      </Section>

      <Section g="cf" r={r}>
        <div className="adm-grid">
          <Mini title="Modes (30 j)" rows={cf.modes} label={(k) => CF_MODE[k] ?? k} />
          <Mini title="Niveau de l’ordinateur" rows={cf.levels} label={(k) => LEVEL[k] ?? k} />
          <Mini title="Joueurs à table" rows={cf.players} label={(k) => `${k} joueurs`} />
        </div>
        <p className="muted small">{cf.runs ? <>{nf(cf.runs)} parties vérifiées sur 30 jours · durée médiane {dur(cf.medianS)} · {(cf.avgRounds ?? 0).toFixed(1).replace('.', ',')} manches en moyenne.</> : 'Aucune partie vérifiée sur 30 jours.'} Comptes seulement ; les parties des invités se jouent sur l’appareil et ne sont pas comptées.
          {onOpenCf && <> <button className="linkish" onClick={onOpenCf}>Statistiques par carte (onglet Coups Fourrés)</button></>}</p>
      </Section>

      <Section g="poker" r={r}>
        <div className="adm-grid">
          <Mini title="Vies" rows={p.lives} />
          <Mini title="Joueurs à table" rows={p.players} label={(k) => `${k} joueurs`} />
          <Mini title="Niveau des ordinateurs (parties)" rows={p.levels} label={(k) => LEVEL[k] ?? k} />
        </div>
        <p className="muted small">{since(p.measuredSince)} ({nf(p.runs)} parties, dont {nf(p.guests)} d’invités en solo ; {nf(p.noStraights)} sans suites ; {nf(p.abandoned)} départs en cours de partie en ligne). Durée médiane : solo {dur(p.medianSoloS)}, en ligne {dur(p.medianOnlineS)}. Victoires en solo : {pc(p.soloWinRate)}. {starts(p.starts, p.runs)} Depuis le début, les comptes ont cumulé {nf(p.profiles.games)} parties ({nf(p.profiles.accounts)} comptes).</p>
      </Section>

      <section className="adm-card">
        <h3>Premier jeu lancé depuis l’accueil <small className="muted">nouveaux visiteurs, 30 j</small></h3>
        {!r.clicks.rows.length ? <p className="empty">Rien pour l’instant.</p> : (
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr><th>Jeu</th>{clickVias.map((v) => <th key={v}>{VIA[v] ?? v}</th>)}</tr></thead>
            <tbody>{clickGames.map((g) => <tr key={g}><th>{FIRST[g] ?? g}</th>{clickVias.map((v) => <td key={v}>{nf(cell(g, v))}</td>)}</tr>)}</tbody>
          </table></div>
        )}
        <p className="muted small">Seul suivi existant : la PREMIÈRE partie de chaque visiteur (jeu et provenance){r.clicks.since ? `, jeu noté depuis le ${dm(r.clicks.since)}` : ''}. Les clics suivants sur l’accueil ne sont pas enregistrés.</p>
      </section>
    </div>
  );
}
