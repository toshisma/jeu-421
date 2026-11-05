/**
 * Signaler un joueur ou l'un de ses messages : choix de la raison, commentaire facultatif.
 * Pour un message, seul son identifiant part au serveur : il retrouve et fige lui-même le texte.
 */
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
  const title = target.message ? 'Signaler un message' : `Signaler ${target.username}`;
  return (
    <div className="sheet-back report-back" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet report-sheet">
        <div className="sheet-grip" aria-hidden />
        <header className="sheet-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button></header>
        <div className="sheet-body">
          {!pa.isAccount ? (
            <>
              <p>Pour signaler un joueur ou un message, créez un compte (gratuit, sans adresse e-mail) ou connectez-vous.</p>
              <button className="btn primary" onClick={onClose}>Compris</button>
            </>
          ) : done ? (
            <>
              <p className="report-done"><Icon name="check" size={22} /> {REPORT_SENT_TEXT}</p>
              <p className="k-hint">Si une sanction est prise, vous serez prévenu dans vos notifications. Vous pouvez aussi bloquer ce joueur depuis son profil.</p>
              <button className="btn primary" onClick={onClose}>Fermer</button>
            </>
          ) : (
            <>
              {target.message && (
                <blockquote className="report-quote"><b>{target.username}</b><span>{target.message.text}</span></blockquote>
              )}
              <div className="k-field">
                <span className="k-label">Pourquoi ?</span>
                <div className="report-reasons" role="radiogroup" aria-label="Raison du signalement">
                  {REPORT_REASONS.map((r) => (
                    <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className={reason === r.id ? 'on' : ''} onClick={() => setReason(r.id)}>{r.label}</button>
                  ))}
                </div>
              </div>
              <label className="k-field">
                <span className="k-label">Précisions <small>facultatif</small></span>
                <textarea className="report-comment" value={comment} maxLength={REPORT_COMMENT_MAX} rows={3} onChange={(e) => setComment(e.target.value)}
                  placeholder="Ce qui s’est passé, en quelques mots" />
                <small className="k-hint">{REPORT_COMMENT_MAX - comment.length} caractères restants</small>
              </label>
              {err && <p className="error small">{err}</p>}
              <button className="btn primary" disabled={!reason || busy} onClick={() => void send()}><Icon name="flag" size={18} /> Envoyer le signalement</button>
              <p className="k-hint">L’équipe de modération verra votre signalement{target.message ? ' et une copie du message' : ''}. Le joueur signalé ne saura pas que c’est vous.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Petit bouton « ⋯ » à côté d'un message d'un autre joueur. */
export function ReportMsgButton({ onClick, name }: { onClick: () => void; name: string }) {
  return <button type="button" className="msg-more" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={`Signaler ce message de ${name}`} title="Signaler">⋯</button>;
}
