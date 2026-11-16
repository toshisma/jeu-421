/**
 * Administration : messages privés (protection des joueurs). En français seulement (outil d'administration).
 *  - « À vérifier » : alertes automatiques et conversations signalées non traitées (admins et modérateurs).
 *  - « Rechercher » : un compte, ses conversations, puis n'importe quelle conversation (administrateurs).
 * Chaque ouverture d'une conversation demande un motif ; le serveur l'inscrit au journal d'administration.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../account/api';
import { READ_MOTIVES, type ReadMotive } from '../../../shared/pm-safety';
import { askConfirm } from './confirm';

const when = (t: number | null | undefined) => (t ? new Date(t).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');

interface Cat { id: string; label: string }
interface Alert { id: number; a: string; b: string; aId: string; bId: string; day: string; at: number; score: number; cats: Cat[] }
interface Rep { id: number; reporter: string; target: string; reporterId: string; targetId: string; reason: string; comment: string; at: number; whole: boolean }
interface Person { id: string; username: string; createdAt: number; admin: boolean; moderator: boolean; ban: { until: number | null; reason: string } | null }
interface Msg { id: number; from: string; text: string; at: number; readAt: number | null; removed: { by: string; at: number } | null; cats: Cat[] }
interface Conv {
  a: Person; b: Person; messages: Msg[]; closed: boolean; retentionDays: number;
  alerts: { id: number; day: string; score: number; cats: string[] }[];
  reports: { id: number; reporter: string; target: string; reason: string; comment: string; at: number }[];
}
interface Target { a: string; b: string; motive: ReadMotive }

export function AdminPmPanel({ token, admin }: { token: string | null; admin: boolean }) {
  const [view, setView] = useState<'queue' | 'search'>('queue');
  const [ask, setAsk] = useState<Target | null>(null);
  const [open, setOpen] = useState<(Target & { detail: string }) | null>(null);
  if (open) return <Conversation token={token} admin={admin} t={open} onClose={() => setOpen(null)} />;
  return (
    <div className="apm">
      <p className="muted small">Lecture réservée à la protection des joueurs. Chaque ouverture d’une conversation est inscrite au journal (qui, quand, quelle conversation, motif).{!admin && ' Les modérateurs ne voient que les conversations signalées ou alertées.'}</p>
      {admin && (
        <div className="adm-chips" role="tablist" aria-label="Vue">
          <button role="tab" aria-selected={view === 'queue'} className={view === 'queue' ? 'on' : ''} onClick={() => setView('queue')}>À vérifier</button>
          <button role="tab" aria-selected={view === 'search'} className={view === 'search' ? 'on' : ''} onClick={() => setView('search')}>Rechercher un compte</button>
        </div>
      )}
      {view === 'queue' || !admin ? <Queue token={token} onOpen={setAsk} /> : <Search token={token} onOpen={setAsk} />}
      {ask && <MotiveDialog t={ask} onCancel={() => setAsk(null)} onOk={(motive, detail) => { setOpen({ ...ask, motive, detail }); setAsk(null); }} />}
    </div>
  );
}

function Queue({ token, onOpen }: { token: string | null; onOpen: (t: Target) => void }) {
  const [d, setD] = useState<{ alerts: Alert[]; reports: Rep[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ alerts: Alert[]; reports: Rep[] }>('/pm-mod/queue', { token }).then(setD).catch((e) => setErr((e as Error).message)); }, [token]);
  if (err) return <p className="error">{err}</p>;
  if (!d) return <p className="muted">Chargement…</p>;
  return (
    <div className="apm-queue">
      <section className="adm-card">
        <h3>Conversations signalées ({d.reports.length})</h3>
        {!d.reports.length ? <p className="empty">Aucun signalement de message privé en attente.</p> : (
          <ul className="adm-items">
            {d.reports.map((r) => (
              <li key={r.id}>
                <span><b>{r.reporter} signale {r.target}</b><small>{r.reason}{r.whole ? ' · conversation entière' : ' · un message'} · {when(r.at)}{r.comment ? ` · « ${r.comment} »` : ''}</small></span>
                <button className="btn small primary" onClick={() => onOpen({ a: r.reporterId, b: r.targetId, motive: 'signalement' })}>Lire</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="adm-card">
        <h3>Alertes automatiques ({d.alerts.length})</h3>
        <p className="muted small">Faisceau de signaux à risque sur 7 jours (âge, photo, coordonnées, rencontre, autre messagerie, secret). Une alerte par conversation et par jour au plus. Rien n’est bloqué côté joueurs.</p>
        {!d.alerts.length ? <p className="empty">Aucune alerte en attente.</p> : (
          <ul className="adm-items">
            {d.alerts.map((a) => (
              <li key={a.id}>
                <span><b>{a.a} ↔ {a.b}</b><small>{a.cats.map((c) => c.label).join(' · ')} · score {a.score} · {when(a.at)}</small></span>
                <button className="btn small primary" onClick={() => onOpen({ a: a.aId, b: a.bId, motive: 'alerte' })}>Lire</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Search({ token, onOpen }: { token: string | null; onOpen: (t: Target) => void }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<{ id: string; username: string; messages: number }[] | null>(null);
  const [user, setUser] = useState<{ user: Person; conversations: { username: string; id: string; messages: number; first: number; last: number; alerts: number; reports: number; closed: boolean }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const search = async () => {
    setErr(null); setUser(null);
    try { setUsers((await api<{ users: NonNullable<typeof users> }>(`/pm-mod/search?q=${encodeURIComponent(q.trim())}`, { token })).users); } catch (e) { setErr((e as Error).message); }
  };
  const pick = async (id: string) => {
    setErr(null);
    try { setUser(await api<NonNullable<typeof user>>(`/pm-mod/user/${encodeURIComponent(id)}`, { token })); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <section className="adm-card">
      <form className="adm-search" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) void search(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pseudo (2 lettres au moins)" aria-label="Pseudo à chercher" autoCapitalize="off" />
        <button className="btn small primary" type="submit" disabled={q.trim().length < 2}>Chercher</button>
      </form>
      {err && <p className="error small">{err}</p>}
      {users && !user && (!users.length ? <p className="empty">Aucun compte.</p> : (
        <ul className="adm-items">
          {users.map((u) => <li key={u.id}><span><b>{u.username}</b><small>{u.messages} message{u.messages > 1 ? 's' : ''} privé{u.messages > 1 ? 's' : ''}</small></span><button className="btn small ghost" onClick={() => void pick(u.id)}>Conversations</button></li>)}
        </ul>
      ))}
      {user && (
        <>
          <h3 className="apm-who">{user.user.username}{user.user.ban && <span className="adm-badge danger">suspendu</span>} <button className="btn small ghost" onClick={() => setUser(null)}>← Résultats</button></h3>
          {!user.conversations.length ? <p className="empty">Aucune conversation privée.</p> : (
            <ul className="adm-items">
              {user.conversations.map((c) => (
                <li key={c.id}>
                  <span><b>avec {c.username}</b><small>{c.messages} message{c.messages > 1 ? 's' : ''} · du {when(c.first)} au {when(c.last)}{c.alerts ? ` · ${c.alerts} alerte${c.alerts > 1 ? 's' : ''}` : ''}{c.reports ? ` · ${c.reports} signalement${c.reports > 1 ? 's' : ''}` : ''}{c.closed ? ' · échange fermé' : ''}</small></span>
                  <button className="btn small primary" onClick={() => onOpen({ a: user.user.id, b: c.id, motive: c.reports ? 'signalement' : c.alerts ? 'alerte' : 'securite' })}>Lire</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function MotiveDialog({ t, onCancel, onOk }: { t: Target; onCancel: () => void; onOk: (m: ReadMotive, detail: string) => void }) {
  const [m, setM] = useState<ReadMotive>(t.motive);
  const [detail, setDetail] = useState('');
  const okDisabled = m === 'autre' && detail.trim().length < 3;
  return (
    <div className="sheet-back" role="dialog" aria-modal="true" aria-label="Motif de la lecture" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="sheet apm-motive">
        <header className="sheet-head"><h2>Pourquoi ouvrir cette conversation ?</h2></header>
        <div className="sheet-body">
          <p className="muted small">Le motif est inscrit au journal d’administration avec votre pseudo, l’heure et la conversation.</p>
          <div className="mod-choices" role="radiogroup" aria-label="Motif">
            {READ_MOTIVES.map((x) => <button key={x.id} type="button" role="radio" aria-checked={m === x.id} className={m === x.id ? 'on' : ''} onClick={() => setM(x.id)}>{x.label}</button>)}
          </div>
          <input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={200} placeholder={m === 'autre' ? 'Précisez le motif (obligatoire)' : 'Précision (facultatif)'} aria-label="Précision du motif" />
          <div className="adm-inline">
            <button className="btn small primary" disabled={okDisabled} onClick={() => onOk(m, detail.trim())}>Ouvrir la conversation</button>
            <button className="btn small ghost" onClick={onCancel}>Annuler</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Conversation({ token, admin, t, onClose }: { token: string | null; admin: boolean; t: Target & { detail: string }; onClose: () => void }) {
  const [c, setC] = useState<Conv | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [susp, setSusp] = useState<{ user: string; duration: string; reason: string }>({ user: '', duration: '7j', reason: '' });
  // Une seule lecture tracée à l'ouverture ; après une action, l'affichage est mis à jour sur place.
  const load = useCallback(() => {
    api<Conv>('/pm-mod/conversation', { token, body: { a: t.a, b: t.b, motive: t.motive, detail: t.detail } }).then((d) => { setC(d); setErr(null); }).catch((e) => setErr((e as Error).message));
  }, [token, t]);
  useEffect(load, [load]);
  const act = async (path: string, body: object, done: string, after: (x: Conv) => Conv, confirmText?: string) => {
    if (confirmText && !(await askConfirm(confirmText, 'Confirmer'))) return;
    setMsg(null); setErr(null);
    try { await api(path, { token, body: { a: c!.a.id, b: c!.b.id, ...body } }); setMsg(done); setC((x) => (x ? after(x) : x)); } catch (e) { setErr((e as Error).message); }
  };
  const me = 'vous';
  const person = (p: Person) => <>{p.username}{p.admin && <span className="adm-badge">admin</span>}{p.moderator && <span className="adm-badge">modérateur</span>}{p.ban && <span className="adm-badge danger">suspendu</span>}</>;
  return (
    <section className="adm-sheet apm-conv">
      <header><button className="btn small ghost" onClick={onClose}>← Messages privés</button><h3>{c ? <>{person(c.a)} ↔ {person(c.b)}</> : '…'}</h3></header>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok small">{msg}</p>}
      {c && <>
        <p className="muted small">Motif : {READ_MOTIVES.find((x) => x.id === t.motive)?.label}{t.detail ? ` (${t.detail})` : ''} · inscrit au journal. {c.messages.length} message{c.messages.length > 1 ? 's' : ''} · conservation {Math.round(c.retentionDays / 30)} mois{c.closed ? ' · échange fermé par la modération' : ''}</p>
        {(c.reports.length > 0 || c.alerts.length > 0) && (
          <ul className="apm-flags">
            {c.reports.map((r) => <li key={`r${r.id}`}>🚩 <b>{r.reporter}</b> signale <b>{r.target}</b> : {r.reason}{r.comment ? ` — « ${r.comment} »` : ''} <small>{when(r.at)}</small></li>)}
            {c.alerts.map((a) => <li key={`a${a.id}`}>⚠ Alerte du {a.day} : {a.cats.join(' · ')} (score {a.score})</li>)}
          </ul>
        )}
        <ol className="apm-thread">
          {c.messages.map((m) => (
            <li key={m.id} className={`${m.from === c.a.username ? 'a' : 'b'}${m.removed ? ' removed' : ''}${m.cats.length ? ' hit' : ''}`}>
              <div className="apm-meta"><b>{m.from}</b> <small>{when(m.at)}{m.readAt ? ' · lu' : ''}</small>
                {m.cats.map((x) => <span key={x.id} className="adm-badge danger" title={x.label}>{x.label}</span>)}
              </div>
              <p>{m.text}</p>
              {m.removed ? <small className="apm-gone">Supprimé par {m.removed.by}, le {when(m.removed.at)}</small>
                : <button className="btn small ghost danger" onClick={() => void act(`/pm-mod/messages/${m.id}/delete`, {}, 'Message supprimé.', (x) => ({ ...x, messages: x.messages.map((y) => (y.id === m.id ? { ...y, removed: { by: me, at: Date.now() } } : y)) }), 'Supprimer ce message chez les deux joueurs ? (une copie reste visible ici)')}>Supprimer</button>}
            </li>
          ))}
        </ol>
        <section className="adm-card apm-actions">
          <h3>Actions</h3>
          <div className="adm-inline">
            <button className="btn small primary" onClick={() => void act('/pm-mod/handled', {}, 'Conversation marquée traitée.', (x) => ({ ...x, alerts: [], reports: [] }))}>Marquer traité</button>
            <button className="btn small ghost" onClick={() => void act('/pm-mod/pair/block', { block: !c.closed }, c.closed ? 'Échange rouvert.' : 'Échange fermé : ils ne peuvent plus s’écrire.', (x) => ({ ...x, closed: !x.closed }), c.closed ? undefined : `Fermer l’échange entre ${c.a.username} et ${c.b.username} ?`)}>{c.closed ? 'Rouvrir l’échange' : 'Bloquer l’échange entre eux'}</button>
          </div>
          <div className="adm-inline apm-susp">
            <select value={susp.user} onChange={(e) => setSusp({ ...susp, user: e.target.value })} aria-label="Compte à suspendre">
              <option value="">Suspendre…</option>
              {[c.a, c.b].filter((p) => !p.admin && (admin || !p.moderator)).map((p) => <option key={p.id} value={p.id}>{p.username}</option>)}
            </select>
            <select value={susp.duration} onChange={(e) => setSusp({ ...susp, duration: e.target.value })} aria-label="Durée">
              <option value="1j">1 jour</option><option value="7j">7 jours</option><option value="30j">30 jours</option><option value="def">Définitivement</option>
            </select>
            <input value={susp.reason} onChange={(e) => setSusp({ ...susp, reason: e.target.value })} maxLength={200} placeholder="Raison (montrée au joueur)" aria-label="Raison" />
            <button className="btn small danger-solid" disabled={!susp.user} onClick={() => {
              const who = [c.a, c.b].find((p) => p.id === susp.user)?.username;
              void act('/pm-mod/suspend', { user: susp.user, duration: susp.duration, reason: susp.reason }, `${who} est suspendu.`, (x) => { const ban = { until: null, reason: susp.reason }; return { ...x, a: x.a.id === susp.user ? { ...x.a, ban } : x.a, b: x.b.id === susp.user ? { ...x.b, ban } : x.b }; }, `Suspendre ${who} (${susp.duration === 'def' ? 'définitivement' : susp.duration.replace('j', ' jour(s)')}) ?`);
            }}>Suspendre</button>
          </div>
        </section>
      </>}
    </section>
  );
}
