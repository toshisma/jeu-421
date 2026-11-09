/**
 * Serveur Discord du jeu : lien d'invitation et sac de dés offert (une fois par compte) une fois
 * l'adhésion vérifiée par le serveur (connexion Discord). Rien ne s'affiche tant que le serveur
 * n'a pas de lien d'invitation configuré.
 */
import { tr } from '../i18n/lang';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { BagIcon } from './BagIcon';

export interface DiscordState { invite: string | null; verify: boolean; claimed: boolean }

export function useDiscord(pa: ProfileApi) {
  const [d, setD] = useState<DiscordState | null>(null);
  const load = useCallback(() => { api<DiscordState>('/discord', { token: pa.token }).then(setD).catch(() => {}); }, [pa.token]);
  useEffect(load, [load]);
  return { discord: d, reload: load };
}

/** Résultat du retour de Discord (/?discord=…), lu une seule fois puis retiré de l'adresse. */
export function takeDiscordReturn(): string | null {
  try {
    const u = new URL(location.href);
    const r = u.searchParams.get('discord');
    if (!r) return null;
    u.searchParams.delete('discord');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    return r;
  } catch { return null; }
}

export const DISCORD_RESULTS = (): Record<string, string> => ({
  ok: tr('app.merci_d_avoir_rejoint_le_discord_vot'),
  absent: tr('app.nous_ne_vous_trouvons_pas_encore_sur'),
  deja: tr('app.vous_avez_deja_recu_votre_sac_discor'),
  autre: tr('app.ce_compte_discord_a_deja_servi_a'),
  plein: tr('app.votre_reserve_de_sacs_est_pleine_ouv'),
  annule: tr('app.verification_annulee'),
  expire: tr('app.la_verification_a_expire_recommencez'),
  erreur: tr('app.discord_ne_repond_pas_pour_le_moment'),
});

export function DiscordCard({ pa, state, onAccount }: { pa: ProfileApi; state: DiscordState; onAccount: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const verify = async () => {
    setBusy(true); setErr(null);
    try { const r = await api<{ url: string }>('/discord/start', { token: pa.token, body: {} }); location.href = r.url; }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="discord-card">
      <div className="discord-head">
        <span className="discord-bag"><BagIcon size={46} color="bleu" /></span>
        <p><b>{tr('app.le_comptoir_sur_discord')}</b>{tr('app.discutez_avec_les_autres_joueurs_tro')}</p>
      </div>
      {state.invite && <a className="btn primary big discord-join" href={state.invite} target="_blank" rel="noopener noreferrer">{tr('app.1_rejoindre_le_discord')}</a>}
      {state.claimed ? <p className="discord-done">{tr('app.sac_de_des_recu_merci')}</p>
        : !pa.isAccount ? <>
          <p className="discord-hint">{tr('app.un_sac_de_des_est_offert_aux')}</p>
          <button className="btn big" onClick={onAccount}>{tr('app.creer_un_compte_gratuit')}</button>
        </>
        : state.verify ? <>
          <button className="btn big discord-verify" disabled={busy} onClick={verify}>{busy ? tr('app.ouverture_de_discord') : <>{tr('app.2_verifier_et_recevoir_mon_sac')} <BagIcon size="1em" /></>}</button>
          <p className="discord-hint">{tr('app.discord_vous_demande_d_autoriser_le_')}</p>
        </> : null}
      {err && <p className="discord-err">{err}</p>}
    </div>
  );
}
