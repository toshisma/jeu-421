/**
 * Fenêtre de confirmation du jeu (remplace window.confirm, bloqué dans certains aperçus
 * intégrés et peu lisible sur téléphone). Renvoie true si le joueur confirme.
 */
import { tr } from '../i18n/lang';

export function askConfirm(message: string, ok = tr('common.confirm'), cancel = tr('common.cancel')): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal confirm-modal';
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-modal', 'true');
    const card = document.createElement('div');
    card.className = 'modal-card confirm-card';
    const p = document.createElement('p');
    p.textContent = message;
    const row = document.createElement('div');
    row.className = 'row';
    const no = document.createElement('button');
    no.className = 'btn';
    no.textContent = cancel;
    const yes = document.createElement('button');
    yes.className = 'btn primary';
    yes.textContent = ok;
    row.append(no, yes);
    card.append(p, row);
    wrap.append(card);
    const done = (v: boolean) => { document.removeEventListener('keydown', onKey); wrap.remove(); resolve(v); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    no.onclick = () => done(false);
    yes.onclick = () => done(true);
    wrap.onclick = (e) => { if (e.target === wrap) done(false); };
    document.addEventListener('keydown', onKey);
    document.body.append(wrap);
    yes.focus();
  });
}
