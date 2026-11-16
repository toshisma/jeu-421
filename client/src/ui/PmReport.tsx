/**
 * Signaler une conversation privée : motif, précisions, blocage en un geste, numéros d'aide.
 * Le serveur fige lui-même une copie des derniers messages (rien de ce qui part d'ici n'est cru).
 */
import { useState } from 'react';
import { tr } from '../i18n/lang';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { REPORT_COMMENT_MAX } from '../../../shared/moderation';
import { PM_REPORT_REASONS, type PmReportReason } from '../../../shared/pm-safety';
import type { MessageKey } from '../../../shared/i18n';
import { Icon } from './Icon';

export function PmReportDialog({ pa, username, onClose, onBlocked }: { pa: ProfileApi; username: string; onClose: () => void; onBlocked: () => void }) {
  const [reason, setReason] = useState<PmReportReason | null>(null);
  const [comment, setComment] = useState('');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ blocked: boolean } | null>(null);
  const send = async () => {
    if (!reason || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ blocked: boolean }>('/pm-mod/report', { token: pa.token, body: { username, reason, comment, block } });
      setDone({ blocked: r.blocked });
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const close = () => { if (done?.blocked) onBlocked(); else onClose(); };
  return (
    <div className="sheet-back report-back" role="dialog" aria-modal="true" aria-label={tr('mpm.title')} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="sheet report-sheet pmr-sheet">
        <div className="sheet-grip" aria-hidden />
        <header className="sheet-head"><h2>{tr('mpm.title')}</h2><button className="icon-btn" onClick={close} aria-label={tr('mpm.close')}><Icon name="close" /></button></header>
        <div className="sheet-body">
          {done ? (
            <>
              <p className="report-done"><Icon name="check" size={22} /> {tr('mpm.done')}</p>
              {done.blocked && <p>{tr('mpm.doneBlocked', { username })}</p>}
              <p className="k-hint">{tr('mpm.doneHint')}</p>
              <button className="btn primary" onClick={close}>{tr('mpm.close')}</button>
            </>
          ) : (
            <>
              <p className="k-hint">{tr('mpm.lead', { username })}</p>
              <div className="k-field">
                <span className="k-label">{tr('mpm.why')}</span>
                <div className="report-reasons" role="radiogroup" aria-label={tr('mpm.reasonsAria')}>
                  {PM_REPORT_REASONS.map((r) => (
                    <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className={reason === r.id ? 'on' : ''} onClick={() => setReason(r.id)}>
                      {tr(`mpm.reason.${r.id}` as MessageKey)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="k-field">
                <span className="k-label">{tr('mpm.comment')}</span>
                <textarea className="report-comment" value={comment} maxLength={REPORT_COMMENT_MAX} rows={2} onChange={(e) => setComment(e.target.value)} placeholder={tr('mpm.commentPh')} />
              </label>
              <label className="pmr-block"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> <span>{tr('mpm.block', { username })}</span></label>
              {err && <p className="error small">{err}</p>}
              <button className="btn primary" disabled={!reason || busy} onClick={() => void send()}><Icon name="flag" size={18} /> {tr('mpm.send')}</button>
            </>
          )}
          <aside className="pmr-help" aria-label={tr('mpm.help.title')}>
            <b>{tr('mpm.help.title')}</b>
            <span>{tr('mpm.help.be')} · <a href="https://childfocus.be" target="_blank" rel="noopener noreferrer">childfocus.be</a></span>
            <span>{tr('mpm.help.fr')}</span>
            <span>{tr('mpm.help.now')}</span>
          </aside>
        </div>
      </div>
    </div>
  );
}
