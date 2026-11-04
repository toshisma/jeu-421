/**
 * Messages privés entre amis : bouton de l'accueil (pastille des non-lus), liste des conversations
 * et fil de discussion. Le texte est toujours affiché comme du texte (React l'échappe), jamais en HTML.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { onPm, setUnread, useUnread, type PmMessage } from '../messages';
import { BigAction, Empty, Initial, Section, Shell } from './kit';
import { Icon } from './Icon';

const PM_MAX = 500;

interface Conversation { username: string; unread: number; friend: boolean; last: { text: string; at: number; mine: boolean } }

/** Heure courte : « 14:05 », « hier », « lun. », « 12/10 ». */
export function pmWhen(t: number, now = Date.now()): string {
  const d = new Date(t), n = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 86400_000);
  if (diff <= 0) return d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'hier';
  if (diff < 7) return d.toLocaleDateString('fr-BE', { weekday: 'short' });
  return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' });
}

/** Bulle de discussion à côté du bouton Amis, avec le nombre de messages non lus. */
export function MessagesButton({ pa, onOpen }: { pa: ProfileApi; onOpen: () => void }) {
  const n = useUnread(pa.token);
  return (
    <button className="bell" onClick={onOpen} aria-label={n ? `Messages : ${n} non lu${n > 1 ? 's' : ''}` : 'Messages'}>
      <Icon name="chat" size={22} />
      {n > 0 && <i className="bell-badge">{n > 9 ? '9+' : n}</i>}
    </button>
  );
}

/** Écran Messages : la liste des conversations, ou une conversation ouverte. */
export function MessagesScreen({ pa, initial, onBack, onAccount }: { pa: ProfileApi; initial?: string; onBack: () => void; onAccount: () => void }) {
  const [open, setOpen] = useState<string | null>(initial ?? null);
  if (!pa.isAccount) {
    return (
      <Shell title="Messages" onBack={onBack} icon="chat" foot={<BigAction icon="key" tone="gold" label="Créer mon compte" sub="Gratuit, sans adresse e-mail" onClick={onAccount} />}>
        <Empty icon="chat">Avec un compte, écrivez à vos amis : vos messages les attendront même s’ils ne sont pas en ligne.</Empty>
      </Shell>
    );
  }
  if (open) return <Thread pa={pa} username={open} onBack={() => (initial && open === initial ? onBack() : setOpen(null))} />;
  return <Conversations pa={pa} onBack={onBack} onOpen={setOpen} />;
}

function Conversations({ pa, onBack, onOpen }: { pa: ProfileApi; onBack: () => void; onOpen: (u: string) => void }) {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [friends, setFriends] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<{ conversations: Conversation[]; unread: number }>('/messages', { token: pa.token! })
    .then((r) => { setList(r.conversations); setUnread(r.unread); setErr(null); }).catch((e) => setErr((e as Error).message));
  useEffect(() => {
    void load();
    api<{ friends: { username: string; me?: boolean }[] }>('/friends', { token: pa.token! }).then((r) => setFriends(r.friends.filter((f) => !f.me).map((f) => f.username))).catch(() => {});
    return onPm((e) => { if (e.type === 'message') void load(); });
  }, [pa.token]); // eslint-disable-line react-hooks/exhaustive-deps
  const without = friends.filter((f) => !list?.some((c) => c.username === f));
  const unread = list?.reduce((n, c) => n + c.unread, 0) ?? 0;
  return (
    <Shell title="Messages" onBack={onBack} icon="chat" sub={list ? (unread ? `${unread} non lu${unread > 1 ? 's' : ''}` : `${list.length} conversation${list.length > 1 ? 's' : ''}`) : undefined}>
      {err && <p className="error small">{err}</p>}
      {!list && !err && <p className="muted">Chargement…</p>}
      {list?.length === 0 && <Empty icon="chat">{friends.length ? 'Aucune conversation pour le moment. Écrivez à un ami ci-dessous.' : 'Ajoutez d’abord des amis depuis l’écran Amis : vous pourrez ensuite leur écrire.'}</Empty>}
      {!!list?.length && (
        <ul className="pm-convs">
          {list.map((c) => (
            <li key={c.username}>
              <button className={`pm-conv${c.unread ? ' unread' : ''}`} onClick={() => onOpen(c.username)}>
                <Initial name={c.username} />
                <span className="pm-conv-main">
                  <span className="pm-conv-top"><b>{c.username}</b><small>{pmWhen(c.last.at)}</small></span>
                  <span className="pm-conv-last">{c.last.mine ? 'Vous : ' : ''}{c.last.text}</span>
                </span>
                {c.unread > 0 && <i className="pm-count" aria-label={`${c.unread} non lu${c.unread > 1 ? 's' : ''}`}>{c.unread > 9 ? '9+' : c.unread}</i>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {without.length > 0 && (
        <Section title="Écrire à un ami">
          <div className="pm-new">{without.map((f) => <button key={f} className="pm-new-btn" onClick={() => onOpen(f)}><Initial name={f} /><span>{f}</span><Icon name="chat" size={18} /></button>)}</div>
        </Section>
      )}
    </Shell>
  );
}

/** Hauteur visible réelle (clavier mobile ouvert compris) : le champ de saisie reste au-dessus du clavier. */
function useViewportHeight() {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const up = () => { setH(vv.height); window.scrollTo(0, 0); };
    up(); vv.addEventListener('resize', up); vv.addEventListener('scroll', up);
    return () => { vv.removeEventListener('resize', up); vv.removeEventListener('scroll', up); };
  }, []);
  return h;
}

function Thread({ pa, username, onBack }: { pa: ProfileApi; username: string; onBack: () => void }) {
  const [msgs, setMsgs] = useState<PmMessage[] | null>(null);
  const [friend, setFriend] = useState(true);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const vh = useViewportHeight();
  const key = username.toLowerCase();

  const load = () => api<{ messages: PmMessage[]; friend: boolean }>(`/messages/${encodeURIComponent(username)}`, { token: pa.token! })
    .then((r) => { setMsgs(r.messages); setFriend(r.friend); setErr(null); })
    .catch((e) => setErr((e as Error).message));
  useEffect(() => {
    void load();
    return onPm((e) => {
      if (e.type === 'message' && e.with.toLowerCase() === key) {
        setMsgs((l) => (l && !l.some((m) => m.id === e.message.id) ? [...l, e.message] : l));
        // Conversation ouverte : le message est lu tout de suite.
        if (!e.message.mine && document.visibilityState === 'visible') void api<{ unread: number }>(`/messages/${encodeURIComponent(username)}/read`, { token: pa.token!, body: {} }).then((r) => setUnread(r.unread)).catch(() => {});
      }
      if (e.type === 'read' && e.by.toLowerCase() === key) setMsgs((l) => l?.map((m) => (m.mine ? { ...m, read: true } : m)) ?? l);
    });
  }, [username, pa.token]); // eslint-disable-line react-hooks/exhaustive-deps
  // Au retour sur l'onglet : relire (messages arrivés entre-temps, marqués lus).
  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps
  // Défilement automatique vers le dernier message.
  useLayoutEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; }, [msgs?.length, vh]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true); setErr(null);
    try {
      const r = await api<{ message: PmMessage }>(`/messages/${encodeURIComponent(username)}`, { token: pa.token!, body: { text: t } });
      setMsgs((l) => (l && !l.some((m) => m.id === r.message.id) ? [...l, r.message] : l));
      setText('');
    } catch (e) { setErr((e as Error).message); } finally { setSending(false); input.current?.focus(); }
  };
  const lastMine = msgs ? [...msgs].reverse().find((m) => m.mine) : undefined;

  return (
    <div className="pm-thread" style={vh ? { height: vh } : undefined}>
      <header className="pm-head">
        <button className="icon-btn" onClick={onBack} aria-label="Retour"><Icon name="back" /></button>
        <Initial name={username} />
        <h2>{username}</h2>
      </header>
      <div className="pm-scroll" ref={box} aria-live="polite">
        {!msgs && !err && <p className="muted center">Chargement…</p>}
        {msgs?.length === 0 && <p className="muted center small">Aucun message. Dites bonjour à {username} !</p>}
        {msgs?.map((m, i) => {
          const prev = msgs[i - 1];
          const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
          return (
            <div key={m.id} className="pm-row-wrap">
              {newDay && <p className="pm-day">{new Date(m.at).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
              <div className={`pm-msg ${m.mine ? 'mine' : 'theirs'}`}>
                <span className="pm-text">{m.text}</span>
                <small>{new Date(m.at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}{m === lastMine && m.read ? ' · Lu' : ''}</small>
              </div>
            </div>
          );
        })}
      </div>
      {err && <p className="error small pm-err">{err}</p>}
      {friend ? (
        <form className="pm-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <textarea ref={input} value={text} rows={1} maxLength={PM_MAX} placeholder={`Message à ${username}`} aria-label={`Message à ${username}`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); void send(); } }} />
          <button className="btn primary pm-send" disabled={!text.trim() || sending} aria-label="Envoyer"><Icon name="send" size={20} /></button>
          {text.length > PM_MAX - 100 && <small className="pm-left">{PM_MAX - text.length}</small>}
        </form>
      ) : <p className="muted small pm-closed">Vous n’êtes plus amis avec {username} : vous ne pouvez plus lui écrire.</p>}
    </div>
  );
}
