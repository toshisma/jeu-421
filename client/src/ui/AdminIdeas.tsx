/**
 * Administration → onglet « Idées » : messages de la boîte à idées (server/feedback.ts).
 * Filtre par statut et par type, statut Lue / Faite / Pas retenue, réponse courte au joueur.
 * Chaque décision est journalisée côté serveur (Journal admin) ; « Faite » ou une réponse préviennent
 * le joueur (s'il a demandé à être prévenu). Écran en français, comme le reste de l'administration.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../account/api';
import { FB_REPLY_MAX, type FbKind, type FbStatus } from '../../../shared/feedback';

interface AdminFb {
  id: number; kind: FbKind; text: string; status: FbStatus; reply: string | null; at: number; updatedAt: number;
  username: string | null; guest: boolean; notify: boolean; flags: string[];
  context: { version: string; lang: string; viewport: string; screen: string };
}
const KIND: Record<FbKind, string> = { idee: '💡 Idée', souci: '🛠️ Souci', autre: '✉️ Autre' };
const STATUS: Record<FbStatus, string> = { recue: 'Reçue', lue: 'Lue', faite: 'Faite', refusee: 'Pas retenue' };
const FLAG: Record<string, string> = { lien: 'lien', ailleurs: 'autre messagerie', age: 'âge', photo: 'photo', coordonnees: 'coordonnées', rencontre: 'rencontre', secret: 'secret' };
const when = (t: number) => new Date(t).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Nombre de messages pas encore ouverts (pastille de l'onglet). */
export function useIdeasUnread(token: string | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!token) return;
    const load = () => api<{ unread: number }>('/admin/feedback/unread', { token }).then((r) => setN(r.unread)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [token]);
  return [n, setN] as const;
}

export function AdminIdeasPanel({ token, onUnread }: { token: string | null; onUnread: (n: number) => void }) {
  const [status, setStatus] = useState<FbStatus | ''>('');
  const [kind, setKind] = useState<FbKind | ''>('');
  const [items, setItems] = useState<AdminFb[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    const q = new URLSearchParams({ ...(status ? { status } : {}), ...(kind ? { kind } : {}) }).toString();
    api<{ items: AdminFb[]; unread: number; counts: Record<string, number> }>(`/admin/feedback${q ? `?${q}` : ''}`, { token })
      .then((r) => { setItems(r.items); setCounts(r.counts); onUnread(r.unread); setErr(null); }).catch((e) => setErr((e as Error).message));
  }, [status, kind, token, onUnread]);
  useEffect(load, [load]);
  const update = async (id: number, body: { status?: FbStatus; reply?: string }) => {
    try {
      const r = await api<{ item: AdminFb; unread: number; notified: boolean }>(`/admin/feedback/${id}`, { token, body });
      setItems((l) => l?.map((x) => (x.id === id ? r.item : x)) ?? l);
      onUnread(r.unread);
      return r.notified;
    } catch (e) { setErr((e as Error).message); return null; }
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <section className="adm-ideas">
      <div className="adm-ideas-filters">
        <label>Statut <select value={status} onChange={(e) => setStatus(e.target.value as FbStatus | '')}>
          <option value="">Tous ({total})</option>
          {(Object.keys(STATUS) as FbStatus[]).map((s) => <option key={s} value={s}>{STATUS[s]} ({counts[s] ?? 0})</option>)}
        </select></label>
        <label>Type <select value={kind} onChange={(e) => setKind(e.target.value as FbKind | '')}>
          <option value="">Tous</option>
          {(Object.keys(KIND) as FbKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
        </select></label>
      </div>
      {err && <p className="error small">{err}</p>}
      {!items ? <p className="muted">Chargement…</p> : !items.length ? <p className="empty">Aucun message ici.</p> : (
        <ul className="adm-ideas-list">{items.map((x) => <IdeaRow key={x.id} x={x} onUpdate={update} />)}</ul>
      )}
    </section>
  );
}

function IdeaRow({ x, onUpdate }: { x: AdminFb; onUpdate: (id: number, b: { status?: FbStatus; reply?: string }) => Promise<boolean | null> }) {
  const [reply, setReply] = useState(x.reply ?? '');
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const set = async (status: FbStatus) => {
    const n = await onUpdate(x.id, { status });
    if (n !== null) setNote(status === 'faite' ? (n ? 'Marquée faite : le joueur est prévenu.' : 'Marquée faite.') : `Marquée « ${STATUS[status]} ».`);
  };
  const send = async () => {
    const n = await onUpdate(x.id, { reply: reply.trim(), ...(x.status === 'recue' ? { status: 'lue' as const } : {}) });
    if (n !== null) { setNote(n ? 'Réponse envoyée : le joueur est prévenu.' : 'Réponse enregistrée (visible dans « Mes envois »).'); setOpen(false); }
  };
  const c = x.context;
  return (
    <li className={`adm-idea st-${x.status}`}>
      <div className="adm-idea-top">
        <b>{KIND[x.kind]}</b>
        <span className={`fb-st st-${x.status}`}>{STATUS[x.status]}</span>
        <span className="adm-idea-who">{x.guest ? 'Invité' : x.username ?? 'Compte supprimé'}</span>
        <small>{when(x.at)}</small>
      </div>
      <p className="adm-idea-text">{x.text}</p>
      <p className="adm-idea-ctx">v{c.version || '?'} · {c.lang || '?'} · {c.viewport || '?'} · page {c.screen || '?'}{x.notify ? ' · veut être prévenu' : ''}
        {x.flags.length > 0 && <span className="adm-idea-flag"> · ⚠️ {x.flags.map((f) => FLAG[f] ?? f).join(', ')}</span>}</p>
      {x.reply && !open && <p className="fb-reply"><b>Réponse :</b> {x.reply}</p>}
      <div className="adm-idea-actions">
        {x.status === 'recue' && <button className="btn small" onClick={() => void set('lue')}>Lue</button>}
        {x.status !== 'faite' && <button className="btn small primary" onClick={() => void set('faite')}>Faite</button>}
        {x.status !== 'refusee' && <button className="btn small ghost" onClick={() => void set('refusee')}>Pas retenue</button>}
        {!x.guest && <button className="btn small ghost" onClick={() => setOpen((o) => !o)}>{x.reply ? 'Modifier la réponse' : 'Répondre'}</button>}
      </div>
      {open && (
        <div className="adm-idea-reply">
          <textarea className="report-comment" rows={3} maxLength={FB_REPLY_MAX} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Réponse courte au joueur (en français)…" />
          <div className="adm-idea-actions"><small className="muted">{FB_REPLY_MAX - reply.length} caractères restants</small>
            <button className="btn small primary" disabled={!reply.trim()} onClick={() => void send()}>Envoyer la réponse</button></div>
        </div>
      )}
      {note && <p className="ok small">{note}</p>}
    </li>
  );
}
