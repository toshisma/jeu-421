/**
 * Signaler un joueur ou l'un de ses messages : choix de la raison, commentaire facultatif.
 * Pour un message, seul son identifiant part au serveur : il retrouve et fige lui-même le texte.
 */
import { trServer, tr } from '../i18n/lang';
import { useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { REPORT_COMMENT_MAX, REPORT_REASONS, REPORT_SENT_TEXT, type MessagePlace, type ReportReason } from '../../../shared/moderation';
import { Icon } from './Icon';

export interface ReportTarget {
  /** Pseudo du joueur signalé (affiché). */
  username: string;
  /** Message signalé : lieu, identifiant donné par le serveur, aperçu. */
  message?: { place: MessagePlace; id: string | number; text: string };
}

export function ReportDialog({ pa, target, onClose }: { pa: ProfileApi; target: ReportTarget; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const send = async () => {
    if (!reason || busy) return;
    setBusy(true); setErr(null);
    try {
      await api('/moderation/report', {
        token: pa.token,
        body: target.message ? { message: { place: target.message.place, id: target.message.id }, reason, comment } : { username: target.username, reason, comment },
      });
      setDone(true);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const title = target.message ? tr('app.signaler_un_message') : tr('app.signaler_2', { username: target.username });
  return (
    <div className="sheet-back report-back" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet report-sheet">
        <div className="sheet-grip" aria-hidden />
        <header className="sheet-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label={tr('app.fermer')}><Icon name="close" /></button></header>
        <div className="sheet-body">
          {!pa.isAccount ? (
            <>
              <p>{tr('app.pour_signaler_un_joueur_ou_un_messag')}</p>
              <button className="btn primary" onClick={onClose}>{tr('app.compris')}</button>
            </>
          ) : done ? (
            <>
              <p className="report-done"><Icon name="check" size={22} /> {trServer(REPORT_SENT_TEXT)}</p>
              <p className="k-hint">{tr('app.si_une_sanction_est_prise_vous_serez')}</p>
              <button className="btn primary" onClick={onClose}>{tr('app.fermer')}</button>
            </>
          ) : (
            <>
              {target.message && (
                <blockquote className="report-quote"><b>{target.username}</b><span>{target.message.text}</span></blockquote>
              )}
              <div className="k-field">
                <span className="k-label">{tr('app.pourquoi')}</span>
                <div className="report-reasons" role="radiogroup" aria-label={tr('app.raison_du_signalement')}>
                  {REPORT_REASONS.map((r) => (
                    <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className={reason === r.id ? 'on' : ''} onClick={() => setReason(r.id)}>{r.label}</button>
                  ))}
                </div>
              </div>
              <label className="k-field">
                <span className="k-label">{tr('app.precisions')} <small>{tr('app.facultatif')}</small></span>
                <textarea className="report-comment" value={comment} maxLength={REPORT_COMMENT_MAX} rows={3} onChange={(e) => setComment(e.target.value)}
                  placeholder={tr('app.ce_qui_s_est_passe_en_quelques')} />
                <small className="k-hint">{REPORT_COMMENT_MAX - comment.length} {tr('app.caracteres_restants')}</small>
              </label>
              {err && <p className="error small">{err}</p>}
              <button className="btn primary" disabled={!reason || busy} onClick={() => void send()}><Icon name="flag" size={18} /> {tr('app.envoyer_le_signalement')}</button>
              <p className="k-hint">{tr('app.l_equipe_de_moderation_verra_votre_s')}{target.message ? tr('app.et_une_copie_du_message') : ''}{tr('app.le_joueur_signale_ne_saura_pas_que')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Petit bouton « ⋯ » à côté d'un message d'un autre joueur. */
export function ReportMsgButton({ onClick, name }: { onClick: () => void; name: string }) {
  return <button type="button" className="msg-more" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={tr('app.signaler_ce_message_de', { name })} title={tr('app.signaler')}>⋯</button>;
}
