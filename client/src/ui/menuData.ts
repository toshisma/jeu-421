/**
 * Données vivantes des menus (menu principal et menu du 421) : salons ouverts, tournois programmés,
 * parties en cours, joueurs en ligne, et un aperçu léger des deux autres modes (Coups Fourrés,
 * Le Courtisan) pour leurs grandes entrées du menu principal. Rien de lourd n'est importé ici.
 */
import { useEffect, useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import type { ProgrammeView } from '../../../shared/scheduled';
import type { CfState } from '../../../shared/cards/progress';
import { STANDALONE } from './Screens';

/** Prochain tournoi programmé (11 h et 21 h, heure de Bruxelles) : heure affichée et minutes restantes. */
export function nextTournamentSlot(now = Date.now()): { label: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0), m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const cur = h * 60 + m;
  for (const slot of [11 * 60, 21 * 60]) if (cur < slot + 5) return { label: `${String(slot / 60).padStart(2, '0')}:00`, minutes: slot - cur };
  return { label: '11:00', minutes: 24 * 60 - cur + 11 * 60 };
}
export const inTime = (min: number) => (min <= 0 ? 'salon ouvert !' : min < 60 ? `dans ${min} min` : `dans ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);

/** Prochain tournoi programmé vu par le serveur (sinon l'horaire calculé ici). */
export function tournamentInfo(prog: ProgrammeView | null, now: number) {
  const sv = prog?.slots.find((x) => x.status === 'salon' || x.status === 'a-venir') ?? null;
  const slot = nextTournamentSlot(now);
  return {
    sv, open: sv?.status === 'salon', registered: !!sv?.registered,
    label: sv ? `${String(sv.hour).padStart(2, '0')}:00` : slot.label,
    minutes: sv ? Math.ceil((sv.startsAt - now) / 60000) : slot.minutes,
    count: sv?.count ?? null,
  };
}

/** Salons publics qui attendent des joueurs (affichés seulement s'il y en a). */
export function useOpenLobbies() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (STANDALONE) return;
    const load = () => api<{ lobbies: unknown[] }>('/lobbies').then((r) => setN(r.lobbies.length)).catch(() => {});
    load(); const t = setInterval(load, 10_000); return () => clearInterval(t);
  }, []);
  return n;
}

/** Programme des tournois de 11 h et 21 h. */
export function useProgramme(token: string | null) {
  const [p, setP] = useState<ProgrammeView | null>(null);
  useEffect(() => {
    if (STANDALONE) return;
    const load = () => api<ProgrammeView>('/tournois/programme', { token }).then(setP).catch(() => {});
    load(); const t = setInterval(load, 30_000); return () => clearInterval(t);
  }, [token]);
  return p;
}

/** Parties en cours (pour montrer qui joue en ce moment sur la carte « Jouer en ligne »). */
export function useLiveTables() {
  const [v, setV] = useState<{ games: number; faces: { avatar: string }[] }>({ games: 0, faces: [] });
  useEffect(() => {
    if (STANDALONE) return;
    const load = () => api<{ games: { players: { avatar: string; bot?: boolean }[] }[] }>('/live').then((r) => setV({
      games: r.games.length,
      faces: r.games.flatMap((g) => g.players.filter((x) => !x.bot)).slice(0, 8),
    })).catch(() => {});
    load(); const t = setInterval(load, 20_000); return () => clearInterval(t);
  }, []);
  return v;
}

export function useOnlineCount() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (STANDALONE) return;
    const load = () => api<{ live: { online: number } }>('/stats').then((r) => setN(r.live.online)).catch(() => {});
    load(); const t = setInterval(load, 20_000); return () => clearInterval(t);
  }, []);
  return n;
}

/** Noms des divisions de la ligue de Coups Fourrés (sans charger tout le catalogue du mode). */
const CF_DIV_NAMES: Record<string, string> = { comptoir: 'Comptoir', bistrot: 'Bistrot', brasserie: 'Brasserie', cabaret: 'Cabaret', 'grand-cafe': 'Grand Café' };

/** Aperçu de Coups Fourrés pour le menu principal (comptes) : boosters à ouvrir, division, missions. */
export function useCfPeek(pa: ProfileApi) {
  const [v, setV] = useState<{ discovered: boolean; boosters: number; division: string | null; missionsDone: number; missions: number; capsules: number } | null>(null);
  useEffect(() => {
    if (STANDALONE || !pa.token) { setV(null); return; }
    api<{ state: CfState }>('/cf/me', { token: pa.token }).then(({ state: s }) => setV({
      discovered: !!s.discovered, boosters: s.boosters ?? 0, capsules: s.capsules ?? 0,
      division: s.league ? CF_DIV_NAMES[s.league.division] ?? null : null,
      missionsDone: s.missions?.filter((m) => m.done).length ?? 0, missions: s.missions?.length ?? 0,
    })).catch(() => {});
  }, [pa.token]);
  return v;
}

/** Aperçu des Groschen (comptes) : solde et cadeau du jour à recevoir, sans le verser (il l'est à l'ouverture du mode). */
export function useGroschenPeek(pa: ProfileApi) {
  const [v, setV] = useState<{ balance: number; giftReady: boolean } | null>(null);
  useEffect(() => {
    if (STANDALONE || !pa.token) { setV(null); return; }
    api<{ balance: number; giftReady: boolean }>('/dixmille/wallet?peek=1', { token: pa.token }).then((r) => setV({ balance: r.balance, giftReady: !!r.giftReady })).catch(() => {});
  }, [pa.token]);
  return v;
}
