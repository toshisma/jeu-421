import { cfText } from './i18n';
import { tr } from '../i18n/lang';
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

/** Source d'un tchat : celui de la partie (contrôleur) ou du salon d'attente (session en ligne). */
export interface CfChatSource {
  chat: CfChatMsg[];
  send: (t: string) => Promise<{ ok: boolean; error?: string }>;
  sendEmote?: (e: string) => Promise<unknown>;
  spectator?: boolean;
}

/**
 * Panneau de tchat (messages, réactions, phrases rapides, signalement ⋯, tchat coupable).
 * Partagé par le plateau (bouton en haut) et le salon d'attente des tables à code.
 */
export function CfChatPanel({ src, pa, onClose, inline }: { src: CfChatSource; pa: ProfileApi; onClose?: () => void; inline?: boolean }) {
  const [muted, setMuted] = useState(readMute);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const visible = src.chat.filter((m) => !(m.account && pa.isBlocked(m.account)));
  useEffect(() => { list.current?.scrollTo(0, list.current.scrollHeight); }, [visible.length]);
  const mine = (m: CfChatMsg) => m.account === pa.session?.username;
  const send = async (t: string) => {
    if (!t.trim()) return;
    const r = await src.send(t.trim());
    setErr(r.ok ? null : r.error ? cfText(r.error) : tr('cf.chat.message_refuse'));
    if (r.ok) setText('');
  };
  return (
    <>
      <section className={`chat-panel cf-chat-panel${inline ? ' inline' : ''}`} aria-label={inline ? tr('cf.chat.tchat_du_salon') : tr('cf.chat.tchat_de_la_table')}>
        <header>
          <b>{tr('cf.chat.tchat')}</b>
          <button className="btn ghost small" onClick={() => { const m = !muted; setMuted(m); try { localStorage.setItem(MUTE, m ? '1' : '0'); } catch { /* */ } }}>{muted ? tr('cf.chat.tchat_coupe') : tr('cf.chat.couper_le_tchat')}</button>
          {onClose && <button className="icon-btn small" onClick={onClose} aria-label={tr('cf.boardparts.fermer')}><Icon name="close" size={16} /></button>}
        </header>
        {!src.spectator && src.sendEmote && (
          <div className="cf-emotes" aria-label={tr('cf.chat.reactions')}>
            {EMOTES.map((e) => <button key={e} onClick={() => { void src.sendEmote!(e); onClose?.(); }}>{e}</button>)}
          </div>
        )}
        {muted ? <p className="muted small">{tr('cf.chat.le_tchat_est_coupe_touchez_tchat')}</p> : (
          <ul ref={list}>
            {visible.length === 0 && <li className="muted small">{tr('cf.chat.pas_encore_de_message_une_phrase')}</li>}
            {visible.map((m) => (
              <li key={m.id} className={`${mine(m) ? 'me' : ''}${m.spectator ? ' spec' : ''}`}>
                <span><b>{m.name}</b>{m.spectator && <small className="chat-spec">{tr('cf.chat.spectateur')}</small>} {m.text}</span>
                {m.account && !mine(m) && <ReportMsgButton name={m.name} onClick={() => setReport({ username: m.account!, message: { place: 'table', id: m.id, text: m.text } })} />}
              </li>
            ))}
          </ul>
        )}
        <div className="cf-phrases">{PHRASES.slice(0, 6).map((p) => <button key={p} onClick={() => void send(p)}>{p}</button>)}</div>
        {err && <p className="error small">{err}</p>}
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={src.spectator ? tr('cf.chat.message_spectateur') : tr('cf.chat.votre_message')} enterKeyHint="send" aria-label={tr('cf.chat.votre_message_2')} />
          <button className="btn primary small" disabled={!text.trim()}>{tr('cf.chat.envoyer')}</button>
        </form>
      </section>
      {report && <ReportDialog pa={pa} target={report} onClose={() => setReport(null)} />}
    </>
  );
}

/** Bouton du tchat (barre du haut du plateau), avec compteur de messages non lus. */
export function CfChatButton({ controller, pa }: { controller: CfController; pa: ProfileApi }) {
  const c = controller as ChatCtrl;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const muted = readMute();
  const visible = (c.chat ?? []).filter((m) => !(m.account && pa.isBlocked(m.account)));
  useEffect(() => { if (open) setSeen(visible.length); }, [open, visible.length]);
  if (!c.sendChat) return null;
  const unread = muted ? 0 : Math.max(0, visible.length - seen);
  const mine = (m: CfChatMsg) => m.account === pa.session?.username;
  const last = visible[visible.length - 1];
  return (
    <>
      <button className="cf-ib cf-chat-btn" onClick={() => setOpen((o) => !o)} aria-label={unread ? tr('cf.chat.tchat_nouveaux_messages', { unread: unread }) : tr('cf.chat.tchat_et_reactions')}>
        <Icon name="chat" size={18} />{unread > 0 && <i className="bell-badge">{unread > 9 ? '9+' : unread}</i>}
      </button>
      {!open && !muted && last && Date.now() - last.at < 6000 && !mine(last) && (
        <div className="cf-chat-peek" key={last.id}><b>{last.name}</b>{last.spectator ? tr('cf.chat.spectateur') : ''} {last.text}</div>
      )}
      {open && <CfChatPanel pa={pa} onClose={() => setOpen(false)} src={{ chat: c.chat ?? [], send: (t) => c.sendChat!(t), sendEmote: c.sendEmote, spectator: c.spectator }} />}
    </>
  );
}
