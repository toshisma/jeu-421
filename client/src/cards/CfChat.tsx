/**
 * Coups Fourrés en ligne : tchat de la table et réactions, comme au 421 classique
 * (messages signalables avec le bouton ⋯, tchat coupable, joueurs bloqués masqués).
 */
import { useEffect, useRef, useState } from 'react';
import type { ProfileApi } from '../account/useProfile';
import { EMOTES, PHRASES } from '../../../shared/protocol';
import type { CfChatMsg } from '../../../shared/cards/protocol';
import { Icon } from '../ui/Icon';
import { ReportDialog, ReportMsgButton, type ReportTarget } from '../ui/Report';
import type { CfController } from './controller';

const MUTE = '421.tchat-muet';
const readMute = () => { try { return localStorage.getItem(MUTE) === '1'; } catch { return false; } };
type ChatCtrl = CfController & { chat?: CfChatMsg[]; sendChat?: (t: string) => Promise<{ ok: boolean; error?: string }>; sendEmote?: (e: string) => Promise<unknown>; spectator?: boolean };

/** Bouton du tchat (barre du haut du plateau), avec compteur de messages non lus. */
export function CfChatButton({ controller, pa }: { controller: CfController; pa: ProfileApi }) {
  const c = controller as ChatCtrl;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [muted, setMuted] = useState(readMute);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const visible = (c.chat ?? []).filter((m) => !(m.account && pa.isBlocked(m.account)));
  useEffect(() => { if (open) { setSeen(visible.length); list.current?.scrollTo(0, list.current.scrollHeight); } }, [open, visible.length]);
  if (!c.sendChat) return null;
  const unread = muted ? 0 : Math.max(0, visible.length - seen);
  const mine = (m: CfChatMsg) => m.account === pa.session?.username;
  const send = async (t: string) => {
    if (!t.trim()) return;
    const r = await c.sendChat!(t.trim());
    setErr(r.ok ? null : r.error ?? 'Message refusé.');
    if (r.ok) setText('');
  };
  const last = visible[visible.length - 1];
  return (
    <>
      <button className="cf-ib cf-chat-btn" onClick={() => setOpen((o) => !o)} aria-label={unread ? `Tchat, ${unread} nouveaux messages` : 'Tchat et réactions'}>
        <Icon name="chat" size={18} />{unread > 0 && <i className="bell-badge">{unread > 9 ? '9+' : unread}</i>}
      </button>
      {!open && !muted && last && Date.now() - last.at < 6000 && !mine(last) && (
        <div className="cf-chat-peek" key={last.id}><b>{last.name}</b>{last.spectator ? ' (spectateur)' : ''} {last.text}</div>
      )}
      {open && (
        <section className="chat-panel cf-chat-panel" aria-label="Tchat de la table">
          <header>
            <b>Tchat</b>
            <button className="btn ghost small" onClick={() => { const m = !muted; setMuted(m); try { localStorage.setItem(MUTE, m ? '1' : '0'); } catch { /* */ } }}>{muted ? '🔇 Tchat coupé' : '🔔 Couper le tchat'}</button>
            <button className="icon-btn small" onClick={() => setOpen(false)} aria-label="Fermer"><Icon name="close" size={16} /></button>
          </header>
          {!c.spectator && c.sendEmote && (
            <div className="cf-emotes" aria-label="Réactions">
              {EMOTES.map((e) => <button key={e} onClick={() => { void c.sendEmote!(e); setOpen(false); }}>{e}</button>)}
            </div>
          )}
          {muted ? <p className="muted small">Le tchat est coupé : touchez « Tchat coupé » pour le réactiver.</p> : (
            <ul ref={list}>
              {visible.length === 0 && <li className="muted small">Pas encore de message. Une phrase rapide ?</li>}
              {visible.map((m) => (
                <li key={m.id} className={`${mine(m) ? 'me' : ''}${m.spectator ? ' spec' : ''}`}>
                  <span><b>{m.name}</b>{m.spectator && <small className="chat-spec"> (spectateur)</small>} {m.text}</span>
                  {m.account && !mine(m) && <ReportMsgButton name={m.name} onClick={() => setReport({ username: m.account!, message: { place: 'table', id: m.id, text: m.text } })} />}
                </li>
              ))}
            </ul>
          )}
          <div className="cf-phrases">{PHRASES.slice(0, 6).map((p) => <button key={p} onClick={() => void send(p)}>{p}</button>)}</div>
          {err && <p className="error small">{err}</p>}
          <form onSubmit={(e) => { e.preventDefault(); void send(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={c.spectator ? 'Message (spectateur)…' : 'Votre message…'} enterKeyHint="send" />
            <button className="btn primary small" disabled={!text.trim()}>Envoyer</button>
          </form>
        </section>
      )}
      {report && <ReportDialog pa={pa} target={report} onClose={() => setReport(null)} />}
    </>
  );
}
