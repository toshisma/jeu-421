/**
 * Panel de modération : signalements des joueurs (regroupés par joueur signalé), décisions et
 * sanctions, antécédents, équipe de modération (admins). Le serveur vérifie chaque appel.
 * Onglet « Signalements » de l'administration, et écran « Modération » pour les modérateurs.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { DECISIONS, DURATIONS, type Decision } from '../../../shared/moderation';
import { askConfirm } from './confirm';
import { Shell } from './kit';

const when = (t: number | null | undefined) => (t ? new Date(t).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
const hour = (t: number) => new Date(t).toLocaleTimeString('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' });

interface Frozen { author: string; text: string; at: number }
export interface ModReport {
  id: number; reporter: string; target: string; targetId: string; kind: 'joueur' | 'message';
  reason: string; reasonLabel: string; comment: string; at: number;
  message: { place: string; placeLabel: string; where: string; text: string; at: number; context: Frozen[] } | null;
  status: 'ouvert' | 'traite'; decision: string | null; decisionLabel: string | null; duration: string | null;
  decidedBy: string | null; decidedAt: number | null; note: string | null;
}
interface TargetInfo {
  username: string; exists: boolean; role: 'admin' | 'moderateur' | null; reports: number; pending: number; sanctions: number;
  ban: { until: number | null; reason: string } | null; mute: { id: number; until: number; reason: string } | null;
}
type Filter = 'ouvert' | 'traite' | 'tous';

const durLabel = (d: string | null) => (d ? [...DURATIONS.muet, ...DURATIONS.suspension].find((x) => x.id === d)?.label ?? d : '');

/** Nombre de signalements à traiter (pastille), relu toutes les minutes. */
export function useModeration(token: string | null | undefined) {
  const [me, setMe] = useState<{ admin: boolean; moderator: boolean; pending: number } | null>(null);
  useEffect(() => {
    if (!token) { setMe(null); return; }
    let alive = true;
    const load = () => api<{ admin: boolean; moderator: boolean; pending: number }>('/moderation/whoami', { token }).then((r) => { if (alive) setMe(r); }).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [token]);
  return me;
}

export function ModerationPanel({ token, admin, onPending }: { token: string | null; admin: boolean; onPending?: (n: number) => void }) {
  const [filter, setFilter] = useState<Filter>('ouvert');
  const [sort, setSort] = useState<'joueur' | 'date'>('joueur');
  const [data, setData] = useState<{ reports: ModReport[]; targets: Record<string, TargetInfo>; pending: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ reports: ModReport[]; targets: Record<string, TargetInfo>; pending: number }>(`/moderation/reports?status=${filter}`, { token })
      .then((d) => { setData(d); setErr(null); onPending?.(d.pending); }).catch((e) => setErr((e as Error).message));
  }, [filter, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000); return () => clearInterval(t); }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    if (sort === 'date') return data.reports.map((r) => ({ key: `r${r.id}`, targetId: r.targetId, reports: [r] }));
    const m = new Map<string, ModReport[]>();
    for (const r of data.reports) { if (!m.has(r.targetId)) m.set(r.targetId, []); m.get(r.targetId)!.push(r); }
    return [...m.entries()].map(([targetId, reports]) => ({ key: targetId, targetId, reports }))
      .sort((a, b) => b.reports.length - a.reports.length || b.reports[0].at - a.reports[0].at);
  }, [data, sort]);

  if (sheet) return <ModPlayerSheet token={token} admin={admin} id={sheet} onClose={() => { setSheet(null); load(); }} />;
  return (
    <div className="mod-panel">
      <div className="mod-bar">
        <div className="adm-chips" role="tablist" aria-label="Filtre">
          {([['ouvert', `À traiter${data ? ` (${data.pending})` : ''}`], ['traite', 'Traités'], ['tous', 'Tous']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <label className="mod-sort">Trier <select value={sort} onChange={(e) => setSort(e.target.value as 'joueur' | 'date')}><option value="joueur">par joueur signalé</option><option value="date">du plus récent</option></select></label>
      </div>
      {err && <p className="error">{err}</p>}
      {!data && !err && <p className="muted">Chargement…</p>}
      {data && !groups.length && <p className="empty">{filter === 'ouvert' ? 'Aucun signalement à traiter. Tout est calme au comptoir.' : 'Aucun signalement.'}</p>}
      {groups.map((g) => {
        const t = data!.targets[g.targetId];
        return (
          <section key={g.key} className="mod-group">
            <header className="mod-target">
              <div>
                <h3>{t?.username ?? g.reports[0].target}{t?.role === 'admin' && <span className="adm-badge">admin</span>}{t?.role === 'moderateur' && <span className="adm-badge">modérateur</span>}
                  {t?.ban && <span className="adm-badge danger">suspendu</span>}{t?.mute && <span className="adm-badge danger">muet</span>}{t && !t.exists && <span className="adm-badge">compte supprimé</span>}</h3>
                {t && <small>{t.reports} signalement{t.reports > 1 ? 's' : ''} reçu{t.reports > 1 ? 's' : ''} · {t.pending} à traiter · {t.sanctions ? `${t.sanctions} sanction${t.sanctions > 1 ? 's' : ''} au total` : 'aucune sanction'}</small>}
              </div>
              {t?.exists && <button className="btn small ghost" onClick={() => setSheet(g.targetId)}>Fiche</button>}
            </header>
            <ul className="mod-reports">
              {g.reports.map((r) => <ReportItem key={r.id} r={r} t={t} token={token} admin={admin} onDone={load} />)}
            </ul>
          </section>
        );
      })}
      {admin && <ModeratorsBlock token={token} />}
    </div>
  );
}

function FrozenMessage({ m, target }: { m: NonNullable<ModReport['message']>; target: string }) {
  return (
    <div className="mod-msg">
      <small className="mod-where">{m.placeLabel} · {m.where}</small>
      <ol>
        {m.context.map((c, i) => <li key={i} className="ctx"><b>{c.author}</b> <span>{c.text}</span> <small>{hour(c.at)}</small></li>)}
        <li className="hit"><b>{target}</b> <span>{m.text}</span> <small>{when(m.at)}</small></li>
      </ol>
    </div>
  );
}

function ReportItem({ r, t, token, admin, onDone }: { r: ModReport; t?: TargetInfo; token: string | null; admin: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`mod-report ${r.status}`}>
      <div className="mod-line">
        <span className="mod-reason">{r.kind === 'message' ? '💬' : '👤'} {r.reasonLabel}</span>
        <small>{when(r.at)}</small>
      </div>
      <p className="mod-who">Signalé par <b>{r.reporter}</b>{r.kind === 'message' ? ' (message)' : ' (joueur)'}</p>
      {r.comment && <p className="mod-comment">« {r.comment} »</p>}
      {r.message && <FrozenMessage m={r.message} target={r.target} />}
      {r.status === 'traite' ? (
        <p className={`mod-decision${r.decision !== 'classer' ? ' sanction' : ''}`}>
          <b>{r.decisionLabel}{r.duration ? ` (${durLabel(r.duration)})` : ''}</b> par {r.decidedBy}, le {when(r.decidedAt)}{r.note ? <><br /><small>Note : {r.note}</small></> : null}
        </p>
      ) : open ? <DecisionForm r={r} t={t} token={token} admin={admin} onCancel={() => setOpen(false)} onDone={onDone} />
        : <button className="btn small primary" onClick={() => setOpen(true)}>Décider</button>}
    </li>
  );
}

function DecisionForm({ r, t, token, admin, onCancel, onDone }: { r: ModReport; t?: TargetInfo; token: string | null; admin: boolean; onCancel: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState<Decision>('classer');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [all, setAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const protectedTarget = t?.role === 'admin' || (t?.role === 'moderateur' && !admin);
  const others = Math.max(0, (t?.pending ?? 1) - 1);
  const durs = decision === 'muet' || decision === 'suspension' ? DURATIONS[decision] : null;
  const submit = async () => {
    if (durs && !duration) { setErr('Choisissez une durée.'); return; }
    const d = DECISIONS.find((x) => x.id === decision)!;
    if (d.sanction && !(await askConfirm(`${d.label}${durs ? ` (${durLabel(duration)})` : ''} pour ${r.target} ?`, 'Confirmer'))) return;
    setBusy(true); setErr(null);
    try {
      await api(`/moderation/reports/${r.id}/decide`, { token, body: { decision, duration: durs ? duration : undefined, note, all } });
      onDone();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <fieldset className="mod-form" disabled={busy}>
      <legend>Décision</legend>
      {protectedTarget && <p className="muted small">{t?.role === 'admin' ? 'Un compte administrateur ne peut pas être sanctionné.' : 'Un modérateur ne peut pas sanctionner un autre modérateur.'} Vous pouvez classer le signalement.</p>}
      <div className="mod-choices">
        {DECISIONS.map((d) => (
          <button key={d.id} type="button" className={`${decision === d.id ? 'on' : ''}${d.sanction ? ' s' : ''}`} disabled={d.sanction && protectedTarget}
            onClick={() => { setDecision(d.id); setDuration(''); }}>{d.label}</button>
        ))}
      </div>
      {durs && (
        <div className="mod-choices dur" role="radiogroup" aria-label="Durée">
          {durs.map((x) => <button key={x.id} type="button" role="radio" aria-checked={duration === x.id} className={duration === x.id ? 'on' : ''} onClick={() => setDuration(x.id)}>{x.label}</button>)}
        </div>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note interne (facultatif, jamais montrée au joueur)" aria-label="Note interne" />
      {others > 0 && <label className="mod-all"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Appliquer aussi aux {others} autre{others > 1 ? 's' : ''} signalement{others > 1 ? 's' : ''} en attente sur {r.target}</label>}
      {DECISIONS.find((x) => x.id === decision)?.sanction && <p className="k-hint">Le joueur sanctionné est prévenu (raison et échéance) ; ceux qui l’ont signalé reçoivent un remerciement, sans détail.</p>}
      {err && <p className="error small">{err}</p>}
      <div className="adm-inline">
        <button type="button" className={`btn small ${decision === 'classer' ? 'primary' : 'danger-solid'}`} onClick={() => void submit()}>Valider</button>
        <button type="button" className="btn small ghost" onClick={onCancel}>Annuler</button>
      </div>
    </fieldset>
  );
}

interface ModSheet {
  id: string; username: string; createdAt: number; role: string | null;
  ban: { until: number | null; reason: string } | null; mute: { id: number; until: number; reason: string } | null;
  sanctions: { id: number; kind: string; label: string; reason: string; until: number | null; by: string; at: number; note: string; liftedAt: number | null; liftedBy: string | null }[];
  reports: ModReport[];
}
/** Fiche d'un joueur : statut, sanctions précédentes (levables), signalements reçus. */
function ModPlayerSheet({ token, admin, id, onClose }: { token: string | null; admin: boolean; id: string; onClose: () => void }) {
  const [p, setP] = useState<ModSheet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { api<{ player: ModSheet }>(`/moderation/players/${encodeURIComponent(id)}`, { token }).then((r) => setP(r.player)).catch((e) => setErr((e as Error).message)); }, [id, token]);
  useEffect(load, [load]);
  const lift = async (s: ModSheet['sanctions'][number]) => {
    if (!(await askConfirm(`Lever « ${s.label} » de ${p?.username} maintenant ?`, 'Lever'))) return;
    try { await api(`/moderation/sanctions/${s.id}/lift`, { token, body: {} }); load(); } catch (e) { setErr((e as Error).message); }
  };
  const now = Date.now();
  return (
    <section className="adm-sheet">
      <header><button className="btn small ghost" onClick={onClose}>← Signalements</button><h3>{p?.username ?? '…'}</h3></header>
      {err && <p className="error">{err}</p>}
      {p && <>
        <dl className="adm-dl">
          <dt>Inscription</dt><dd>{when(p.createdAt)}</dd>
          <dt>Rôle</dt><dd>{p.role === 'admin' ? 'Administrateur' : p.role === 'moderateur' ? 'Modérateur' : 'Joueur'}</dd>
          <dt>Statut</dt><dd>{p.ban ? <span className="error">Suspendu {p.ban.until ? `jusqu’au ${when(p.ban.until)}` : 'définitivement'}</span> : p.mute ? <span className="error">Muet jusqu’au {when(p.mute.until)}</span> : 'Actif'}</dd>
          <dt>Signalements</dt><dd>{p.reports.length} reçu{p.reports.length > 1 ? 's' : ''}, {p.reports.filter((r) => r.status === 'ouvert').length} à traiter</dd>
        </dl>
        <h4>Sanctions ({p.sanctions.length})</h4>
        {!p.sanctions.length ? <p className="empty">Aucune sanction.</p> : (
          <ul className="adm-items">
            {p.sanctions.map((s) => {
              const active = !s.liftedAt && (s.kind === 'bannissement' || (s.until != null && s.until > now && s.kind !== 'avertissement'));
              return (
                <li key={s.id}>
                  <span><b>{s.label}</b><small>{s.reason} · par {s.by}, le {when(s.at)}{s.until ? ` · jusqu’au ${when(s.until)}` : ''}{s.liftedAt ? ` · levée par ${s.liftedBy}` : ''}{s.note ? ` · note : ${s.note}` : ''}</small></span>
                  {active && (s.kind !== 'bannissement' || admin) && <button className="btn small ghost" onClick={() => void lift(s)}>Lever</button>}
                </li>
              );
            })}
          </ul>
        )}
        <h4>Signalements reçus</h4>
        <ul className="mod-reports">
          {p.reports.map((r) => (
            <li key={r.id} className={`mod-report ${r.status}`}>
              <div className="mod-line"><span className="mod-reason">{r.kind === 'message' ? '💬' : '👤'} {r.reasonLabel}</span><small>{when(r.at)}</small></div>
              <p className="mod-who">Par <b>{r.reporter}</b> · {r.status === 'ouvert' ? 'à traiter' : `${r.decisionLabel}${r.duration ? ` (${durLabel(r.duration)})` : ''} par ${r.decidedBy}`}</p>
              {r.message && <FrozenMessage m={r.message} target={r.target} />}
            </li>
          ))}
        </ul>
      </>}
    </section>
  );
}

/** Équipe de modération : nommer ou retirer un modérateur (administrateurs seulement). */
function ModeratorsBlock({ token }: { token: string | null }) {
  const [list, setList] = useState<{ username: string; addedBy: string; at: number }[] | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => { api<{ moderators: NonNullable<typeof list> }>('/moderation/moderators', { token }).then((r) => setList(r.moderators)).catch(() => {}); }, [token]);
  useEffect(load, [load]);
  const add = async () => {
    try { await api('/moderation/moderators', { token, body: { username: name.trim() } }); setMsg({ ok: true, text: `${name.trim()} est maintenant modérateur.` }); setName(''); load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const remove = async (u: string) => {
    if (!(await askConfirm(`Retirer ${u} de l’équipe de modération ?`, 'Retirer'))) return;
    try { await api(`/moderation/moderators/${encodeURIComponent(u)}`, { token, method: 'DELETE' }); setMsg({ ok: true, text: `${u} n’est plus modérateur.` }); load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  return (
    <section className="adm-card mod-team">
      <h3>Équipe de modération</h3>
      <p className="muted small">Les modérateurs voient ce panel et peuvent sanctionner (sauf un admin ou un autre modérateur). Ils n’ont pas accès aux autres outils d’administration.</p>
      {list && (!list.length ? <p className="empty">Aucun modérateur pour l’instant.</p> : (
        <ul className="adm-items">
          {list.map((m) => <li key={m.username}><span><b>{m.username}</b><small>nommé par {m.addedBy}, le {when(m.at)}</small></span><button className="btn small ghost danger" onClick={() => void remove(m.username)}>Retirer</button></li>)}
        </ul>
      ))}
      <form className="adm-search" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void add(); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pseudo du joueur" aria-label="Pseudo du nouveau modérateur" autoCapitalize="off" />
        <button className="btn small primary" type="submit" disabled={!name.trim()}>Nommer modérateur</button>
      </form>
      {msg && <p className={msg.ok ? 'ok small' : 'error small'}>{msg.text}</p>}
    </section>
  );
}

/** Écran « Modération » (modérateurs ; les admins y ont aussi accès). */
export function ModerationScreen({ pa, onBack }: { pa: ProfileApi; onBack: () => void }) {
  const me = useModeration(pa.token);
  const [pending, setPending] = useState<number | null>(null);
  return (
    <Shell title="Modération" onBack={onBack} wide icon="flag" sub={pending != null ? (pending ? `${pending} signalement${pending > 1 ? 's' : ''} à traiter` : 'Rien à traiter') : undefined}>
      {!me ? <p className="muted">Chargement…</p> : !(me.admin || me.moderator) ? <p className="error">Accès réservé à l’équipe de modération.</p>
        : <ModerationPanel token={pa.token} admin={me.admin} onPending={setPending} />}
    </Shell>
  );
}
