/**
 * Administration : statistiques réelles des cartes de Coups Fourrés (onglet « Coups Fourrés » du
 * tableau de bord, administrateurs seulement : le serveur vérifie, voir server/cf-stats.ts).
 * Chargé à la demande (les illustrations des cartes ne pèsent pas sur le reste du tableau de bord).
 */
import { useEffect, useState } from 'react';
import { api } from '../account/api';
import { FAMILY_LABEL, RARITY_LABEL, TYPE_LABEL } from '../../../shared/cards/catalog';
import { CF_STAT_FILTERS, type CfStatFilter, type CfStatsReport } from '../../../shared/cards/stats';
import { CF_LEVEL_LABEL, type CfLevel } from '../../../shared/cards/ai';
import { CardArt } from './art';

const pc = (x: number | null, digits = 0) => (x === null ? '–' : `${(100 * x).toFixed(digits).replace('.', ',')} %`);
const pts = (x: number | null) => (x === null ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(100 * x).toFixed(1).replace('.', ',')} pts`);
const nf = (n: number) => Math.round(n).toLocaleString('fr-BE');
const dur = (ms: number | null) => { if (ms === null) return '–'; const m = Math.round(ms / 60_000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const FAM_CLS: Record<string, string> = { habitues: 'cf-hab', ivresse: 'cf-ivr', pieges: 'cf-pie', chaines: 'cf-cha' };
type Report = CfStatsReport & { days: number; mode: CfStatFilter };
type Sort = 'ecart' | 'presence' | 'jeu' | 'nom';

export function CfAdminStats({ token }: { token: string | null }) {
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState<CfStatFilter>('tout');
  const [sort, setSort] = useState<Sort>('ecart');
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    api<Report>(`/admin/cf/cards?days=${days}&mode=${mode}`, { token }).then((d) => { if (alive) setR(d); }).catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [days, mode, token]);

  const cards = r ? (sort === 'ecart' ? r.cards : [...r.cards].sort((a, b) =>
    sort === 'presence' ? (b.presence ?? 0) - (a.presence ?? 0) : sort === 'jeu' ? (b.playRate ?? 0) - (a.playRate ?? 0) : a.name.localeCompare(b.name, 'fr'))) : [];
  const levels = r ? Object.entries(r.byLevel) : [];
  return (
    <div className="cf-adm">
      <div className="seg">{[[7, '7 jours'], [30, '30 jours'], [0, 'Tout']].map(([d, l]) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d as number)}>{l}</button>)}</div>
      <div className="seg cf-adm-modes">{CF_STAT_FILTERS.map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
      {error && <p className="error">{error}</p>}
      {!r && !error && <p className="muted">Chargement…</p>}
      {r && (
        <>
          <div className="stat-row">
            <div className="stat-counter"><b>{nf(r.games)}</b><span>parties notées</span></div>
            <div className="stat-counter" title="Taux de victoire moyen des joueurs (référence des écarts)"><b>{pc(r.base)}</b><span>victoires (moyenne)</span></div>
            <div className="stat-counter"><b>{dur(r.avgDurationMs)}</b><span>durée moyenne{r.avgRounds !== null ? ` · ${r.avgRounds.toFixed(1).replace('.', ',')} manches` : ''}</span></div>
            <div className="stat-counter" title="Duels : le joueur qui mène la première manche gagne la partie"><b>{pc(r.firstLeader.rate)}</b><span>premier meneur gagnant ({nf(r.firstLeader.games)} duels)</span></div>
          </div>
          <p className="muted small">
            Classé {nf(r.byMode.classee)} · entre amis {nf(r.byMode.ami + r.byMode.table)} · ordinateur {nf(r.byMode.bot)} · tournoi {nf(r.byMode.tournoi)}
            {levels.length > 0 && <> · contre l’ordinateur : {levels.map(([lv, x]) => `${CF_LEVEL_LABEL[lv as CfLevel] ?? lv} ${pc(x.games ? x.wins / x.games : null)} de victoires (${nf(x.games)})`).join(', ')}</>}
          </p>
          {r.games < r.minSample && <p className="cf-adm-warn">Échantillon trop petit ({nf(r.games)} parties) : attendez au moins {r.minSample} parties avant de tirer des conclusions.</p>}

          <section className="adm-card">
            <h3>Par famille</h3>
            <div className="adm-table-wrap">
              <table className="adm-table cf-adm-table">
                <thead><tr><th>Famille</th><th>Présence</th><th>Exemplaires</th><th>Part des cartes jouées</th><th>Victoires (présente)</th><th>Victoires (jouée)</th><th>Écart</th></tr></thead>
                <tbody>{r.families.map((f) => (
                  <tr key={f.family} className={f.small ? 'small' : ''}>
                    <th><span className={`cf-fam ${FAM_CLS[f.family]}`}><i />{f.label}</span></th>
                    <td>{pc(f.presence)}</td><td>{f.copies === null ? '–' : f.copies.toFixed(1).replace('.', ',')}</td><td>{pc(f.playShare)}</td>
                    <td>{pc(f.winPresent)}</td><td>{pc(f.winPlayed)}</td>
                    <td className={f.small || f.delta === null ? '' : f.delta >= 0.07 ? 'up' : f.delta <= -0.07 ? 'down' : ''}>{pts(f.delta)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className="adm-card">
            <h3>Par carte</h3>
            <p className="muted small">Trié par écart : taux de victoire quand la carte est jouée, comparé à la moyenne ({pc(r.base)}). En dessous de {r.minSample} parties avec la carte dans le deck, l’échantillon est trop petit (en fin de liste).</p>
            <div className="seg cf-adm-sort">{([['ecart', 'Écart'], ['presence', 'Présence'], ['jeu', 'Jouée'], ['nom', 'Nom']] as [Sort, string][]).map(([k, l]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div>
            <ul className="cf-adm-cards">
              {cards.map((c) => (
                <li key={c.id} className={`${c.small ? 'small' : ''}${c.verdict ? ` is-${c.verdict}` : ''}`}>
                  <span className={`cf-adm-art ${FAM_CLS[c.family]}`} aria-hidden><CardArt id={c.id} /></span>
                  <span className="cf-adm-name">
                    <b>{c.name}</b>
                    <small>{FAMILY_LABEL[c.family]} · {TYPE_LABEL[c.type]} · {RARITY_LABEL[c.rarity]} · coût {c.cost}</small>
                    {c.verdict && <em>{c.verdict === 'forte' ? 'Trop forte ?' : 'Trop faible ?'}</em>}
                    {c.small && <em className="warn">Échantillon trop petit ({nf(c.decks)} parties)</em>}
                  </span>
                  <span className="cf-adm-nums">
                    <span><small>Présence</small><b>{pc(c.presence)}</b></span>
                    <span><small>Jouée</small><b>{pc(c.playRate)}</b></span>
                    <span><small>Victoires si jouée</small><b>{pc(c.winPlayed)}</b></span>
                    <span><small>Si pas jouée</small><b>{pc(c.winUnplayed)}</b></span>
                    <span className={c.small || c.delta === null ? '' : c.delta > 0 ? 'up' : 'down'}><small>Écart</small><b>{pts(c.delta)}</b></span>
                    <span><small>Parties</small><b>{nf(c.decks)}</b></span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
