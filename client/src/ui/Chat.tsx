import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatMessage } from '../../../shared/protocol';
import type { ProfileApi } from '../account/useProfile';
import { Icon } from './Icon';
import { ReportDialog, ReportMsgButton, type ReportTarget } from './Report';

const MUTE = '421.tchat-muet';
const readMute = () => { try { return localStorage.getItem(MUTE) === '1'; } catch { return false; } };

/** Ce dont le tchat a besoin d'une table (421 en ligne, Le Courtisan). */
export interface ChatSource {
  subscribe: (cb: () => void) => () => void; chat: ChatMessage[]; chatId: string; spectating: boolean; sendChat: (text: string) => Promise<string | null>;
}

/** Tchat de table : bouton flottant avec compteur, panneau repliable, tchat coupable. */
export function Chat({ session, pa }: { session: ChatSource; pa: ProfileApi }) {
  const chat = useSyncExternalStore((cb) => session.subscribe(cb), () => session.chat);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(readMute);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [seen, setSeen] = useState(0);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const visible = chat.filter((m) => !(m.account && pa.isBlocked(m.account)));
  useEffect(() => { if (open) { setSeen(visible.length); list.current?.scrollTo(0, list.current.scrollHeight); } }, [open, visible.length]);
  const unread = muted ? 0 : Math.max(0, visible.length - seen);
  const toggleMute = () => { const m = !muted; setMuted(m); try { localStorage.setItem(MUTE, m ? '1' : '0'); } catch { /* */ } };
  const last = visible[visible.length - 1];
  return (
    <>
      {!open && !muted && last && Date.now() - last.at < 6000 && last.playerId !== session.chatId && (
        <div className="chat-peek" key={last.at}><b>{last.name}</b>{last.spectator && <small className="chat-spec"> (spectateur)</small>} {last.text}</div>
      )}
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} aria-label={unread ? `Tchat, ${unread} nouveaux messages` : 'Tchat'}>
        <span aria-hidden>💬</span>{unread > 0 && <i className="bell-badge">{unread > 9 ? '9+' : unread}</i>}
      </button>
      {open && (
        <section className="chat-panel" aria-label="Tchat de la table">
          <header>
            <b>Tchat</b>
            <button className="btn ghost small" onClick={toggleMute}>{muted ? '🔇 Tchat coupé' : '🔔 Couper le tchat'}</button>
            <button className="icon-btn small" onClick={() => setOpen(false)} aria-label="Fermer"><Icon name="close" size={16} /></button>
          </header>
          {muted ? <p className="muted small">Le tchat est coupé : vous ne voyez plus les messages. Touchez « Tchat coupé » pour le réactiver.</p> : (
            <ul ref={list}>
              {visible.length === 0 && <li className="muted small">Pas encore de message. Dites bonjour à la table !</li>}
              {visible.map((m, i) => <li key={m.id ?? i} className={`${m.playerId === session.chatId ? 'me' : ''}${m.spectator ? ' spec' : ''}`}><span><b>{m.name}</b>{m.spectator && <small className="chat-spec"> (spectateur)</small>} {m.text}</span>
                {m.id && m.account && m.playerId !== session.chatId && m.account !== pa.session?.username && <ReportMsgButton name={m.name} onClick={() => setReport({ username: m.account!, message: { place: 'table', id: m.id!, text: m.text } })} />}</li>)}
            </ul>
          )}
          {err && <p className="error small">{err}</p>}
          <form onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; const r = await session.sendChat(text); setErr(r); if (!r) setText(''); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={session.spectating ? 'Message (en tant que spectateur)…' : 'Votre message…'} enterKeyHint="send" />
            <button className="btn primary small" disabled={!text.trim()}>Envoyer</button>
          </form>
        </section>
      )}
      {report && <ReportDialog pa={pa} target={report} onClose={() => setReport(null)} />}
    </>
  );
}
