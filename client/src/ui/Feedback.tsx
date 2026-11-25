/**
 * Boîte à idées / signaler un souci : ouverte depuis le menu « Plus » (« Une idée ? Un souci ? »).
 * Formulaire court (type, texte, « me prévenir » pour les comptes) et, pour les comptes, « Mes envois »
 * avec le statut et la réponse éventuelle. Le contexte joint (non personnel) est montré au joueur.
 * Serveur : server/feedback.ts. Absent de la version hors ligne (entrée masquée par STANDALONE).
 */
import { useEffect, useState } from 'react';
import { CURRENT_VERSION } from '../../../shared/changelog';
import { FB_KINDS, FB_MAX, FB_MIN, type FbContext, type FbKind, type FbStatus } from '../../../shared/feedback';
import { LANG_LOCALE, LANG_NAMES, type MessageKey } from '../../../shared/i18n';
import { api, ApiError } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { getLang, tr, useLang } from '../i18n/lang';
import { Icon } from './Icon';
import { Sheet, Tabs } from './kit';

export interface MyFeedback { id: number; kind: FbKind; text: string; status: FbStatus; reply: string | null; at: number; updatedAt: number; fresh: boolean }

/** Erreur du serveur traduite (code `fb.err.*`), sinon son texte. */
const errText = (e: unknown) => {
  const code = e instanceof ApiError ? e.data.code : null;
  return typeof code === 'string' && code.startsWith('fb.err.') ? tr(code as MessageKey) : (e as Error).message;
};
const fmtDate = (t: number) => new Date(t).toLocaleDateString(LANG_LOCALE[getLang()], { day: 'numeric', month: 'short' });

export function feedbackContext(screen: string): FbContext {
  return {
    version: CURRENT_VERSION,
    lang: getLang(),
    viewport: `${Math.round(window.innerWidth)}×${Math.round(window.innerHeight)}`,
    screen: /^[a-z0-9-]{1,24}$/.test(screen) ? screen : 'autre',
  };
}

export function FeedbackSheet({ pa, screen, initialTab = 'write', onClose, onAccount }: {
  pa: ProfileApi; screen: string; initialTab?: 'write' | 'mine'; onClose: () => void; onAccount: () => void;
}) {
  useLang();
  const acc = pa.isAccount && !!pa.token;
  const [tab, setTab] = useState<'write' | 'mine'>(acc ? initialTab : 'write');
  const [kind, setKind] = useState<FbKind>('idee');
  const [text, setText] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState<MyFeedback[] | null>(null);
  const ctx = feedbackContext(screen);
  const len = text.trim().length;

  useEffect(() => {
    if (!acc || tab !== 'mine') return;
    let alive = true;
    api<{ items: MyFeedback[] }>('/feedback/mine', { token: pa.token }).then((r) => {
      if (!alive) return;
      setMine(r.items);
      const fresh = r.items.filter((x) => x.fresh).map((x) => x.id);
      if (fresh.length) void api('/feedback/seen', { token: pa.token, body: { ids: fresh } }).catch(() => {});
    }).catch((e) => { if (alive) setErr(errText(e)); });
    return () => { alive = false; };
  }, [acc, tab, pa.token]);

  const send = async () => {
    if (busy || len < FB_MIN) return;
    setBusy(true); setErr(null);
    try {
      await api('/feedback', { token: acc ? pa.token : null, body: { kind, text, notify: acc && notify, context: ctx } });
      setDone(true); setText(''); setMine(null);
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const freshCount = mine?.filter((x) => x.fresh).length ?? 0;

  return (
    <Sheet title={tr('fb.title')} onClose={onClose}>
      <div className="fb">
        {acc && <Tabs value={tab} onChange={(v) => { setTab(v); setErr(null); }} label={tr('fb.title')}
          options={[{ v: 'write', label: tr('fb.tab.write'), icon: 'chat' }, { v: 'mine', label: tr('fb.tab.mine'), icon: 'check', badge: freshCount }]} />}
        {tab === 'write' && (done ? (
          <div className="fb-done">
            <p className="fb-thanks"><Icon name="check" size={22} /> {tr('fb.thanks')}</p>
            <p className="k-hint">{tr(acc ? 'fb.thanksAcc' : 'fb.thanksGuest')}</p>
            <div className="fb-actions">
              {acc && <button className="btn" onClick={() => { setDone(false); setTab('mine'); }}>{tr('fb.tab.mine')}</button>}
              <button className="btn ghost" onClick={() => setDone(false)}>{tr('fb.another')}</button>
              <button className="btn primary" onClick={onClose}>{tr('fb.close')}</button>
            </div>
          </div>
        ) : (
          <>
            <p className="fb-lead">{tr('fb.lead')}</p>
            <div className="fb-kinds" role="radiogroup" aria-label={tr('fb.kindLabel')}>
              {FB_KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{tr(`fb.kind.${k}`)}</button>
              ))}
            </div>
            <label className="k-field fb-field">
              <span className="sr-only">{tr('fb.textLabel')}</span>
              <textarea className="report-comment fb-text" value={text} maxLength={FB_MAX} rows={4} onChange={(e) => setText(e.target.value)}
                placeholder={tr(`fb.ph.${kind}`)} aria-label={tr('fb.textLabel')} />
              <small className="fb-count">{len < FB_MIN ? tr('fb.min', { n: FB_MIN - len, s: FB_MIN - len > 1 ? 's' : '' }) : tr('fb.left', { n: FB_MAX - text.length, s: FB_MAX - text.length > 1 ? 's' : '' })}</small>
            </label>
            {acc ? (
              <label className="fb-notify"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> <span>{tr('fb.notify')}</span></label>
            ) : (
              <p className="fb-guest">{tr('fb.guest')} <button type="button" className="link small-link" onClick={onAccount}>{tr('fb.createAccount')}</button></p>
            )}
            {err && <p className="error small">{err}</p>}
            <button className="btn primary fb-send" disabled={busy || len < FB_MIN} onClick={() => void send()}>
              <Icon name="send" size={18} /> {busy ? tr('fb.sending') : tr('fb.send')}
            </button>
            <p className="fb-ctx">{tr('fb.attached', { v: ctx.version, lang: LANG_NAMES[ctx.lang as keyof typeof LANG_NAMES] ?? ctx.lang, vp: ctx.viewport, screen: ctx.screen })}</p>
          </>
        ))}
        {tab === 'mine' && (
          !mine ? (err ? <p className="error small">{err}</p> : <p className="muted">{tr('fb.loading')}</p>)
            : !mine.length ? <p className="empty">{tr('fb.mine.empty')}</p>
              : (
                <ul className="fb-mine">
                  {mine.map((m) => (
                    <li key={m.id} className={m.fresh ? 'fresh' : undefined}>
                      <div className="fb-mine-top">
                        <span className="fb-kind">{tr(`fb.kind.${m.kind}`)}</span>
                        <span className={`fb-st st-${m.status}`}>{tr(`fb.st.${m.status}`)}</span>
                        {m.fresh && <i className="fb-new">{tr('fb.new')}</i>}
                        <small>{fmtDate(m.at)}</small>
                      </div>
                      <p className="fb-mine-text">{m.text}</p>
                      {m.reply && <p className="fb-reply"><b>{tr('fb.reply')}</b> {m.reply}</p>}
                    </li>
                  ))}
                </ul>
              )
        )}
      </div>
    </Sheet>
  );
}
