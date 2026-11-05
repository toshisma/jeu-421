/**
 * Serveur Discord du jeu : lien d'invitation et sac de dés offert (une fois par compte) une fois
 * l'adhésion vérifiée par le serveur (connexion Discord). Rien ne s'affiche tant que le serveur
 * n'a pas de lien d'invitation configuré.
 */
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

export const DISCORD_RESULTS: Record<string, string> = {
  ok: 'Merci d’avoir rejoint le Discord ! Votre sac de dés vous attend dans la Collection.',
  absent: 'Nous ne vous trouvons pas encore sur le serveur Discord. Rejoignez-le d’abord, puis vérifiez à nouveau.',
  deja: 'Vous avez déjà reçu votre sac Discord.',
  autre: 'Ce compte Discord a déjà servi à un autre compte du jeu.',
  plein: 'Votre réserve de sacs est pleine : ouvrez-en un puis vérifiez à nouveau.',
  annule: 'Vérification annulée.',
  expire: 'La vérification a expiré : recommencez.',
  erreur: 'Discord ne répond pas pour le moment. Réessayez dans un instant.',
};

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
        <p><b>Le comptoir sur Discord</b>Discutez avec les autres joueurs, trouvez des partenaires pour une partie, suivez les tournois et les nouveautés, proposez vos idées.</p>
      </div>
      {state.invite && <a className="btn primary big discord-join" href={state.invite} target="_blank" rel="noopener noreferrer">1. Rejoindre le Discord</a>}
      {state.claimed ? <p className="discord-done">✓ Sac de dés reçu. Merci !</p>
        : !pa.isAccount ? <>
          <p className="discord-hint">Un sac de dés est offert aux joueurs avec un compte qui rejoignent le Discord.</p>
          <button className="btn big" onClick={onAccount}>Créer un compte gratuit</button>
        </>
        : state.verify ? <>
          <button className="btn big discord-verify" disabled={busy} onClick={verify}>{busy ? 'Ouverture de Discord…' : <>2. Vérifier et recevoir mon sac <BagIcon size="1em" /></>}</button>
          <p className="discord-hint">Discord vous demande d’autoriser le jeu à voir votre pseudo et la liste de vos serveurs, seulement pour vérifier que vous avez rejoint. Une fois par compte.</p>
        </> : null}
      {err && <p className="discord-err">{err}</p>}
    </div>
  );
}
