/**
 * Profil du joueur, en mode invité (enregistré sur l'appareil) ou connecté à un compte
 * (enregistré sur le serveur, qui fait foi). L'interface utilise les mêmes actions dans les deux cas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from '../../../shared/engine';
import {
  applyGameEnd, buy, claimDaily, claimPassTier, claimQuest, completeTutorial, computeReward, didWin, equip, loadProfile, saveProfile, sanitizeProfile, setTitle, addSeasonPoints, doPrestige,
  craftDie, setShowcase, equipFx,
  type Applied, type BagResult, type Profile, type Reward, type RewardContext, openChest } from '../../../shared/progress/profile';
import { api, ApiError, loadSession, saveAccountSession, type Session } from './api';
import { challengeReward, playChallenge, type ChallengeResult } from '../../../shared/challenge';
import { today } from '../../../shared/progress/quests';
import { loadGuestPhoto, photoToDataUrl, saveGuestPhoto } from './photo';
import { deviceId, setPresence } from '../presence';
import { trackEvent } from '../visit';
import type { FxKind } from '../../../shared/progress/dice-collection';

export interface EndReward { reward: Reward; applied: Applied }

/** Défi du jour déjà joué sur cet appareil (affichage et récompense des invités). */
const DEFI = '421.defi';
export function loadChallengeDone(): { day: string; points: number; throws: number } | null {
  try { const r = localStorage.getItem(DEFI); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveChallengeDone(day: string, r: ChallengeResult) {
  try { localStorage.setItem(DEFI, JSON.stringify({ day, points: r.points, throws: r.throws })); } catch { /* */ }
}
export interface PublicUser { id: string; username: string; onlineGames: number; onlineWins: number; createdAt: number; photo: string | null }

const CACHE = '421.profil.compte';
const loadCache = (): Profile | null => { try { const r = localStorage.getItem(CACHE); return r ? sanitizeProfile(JSON.parse(r)) : null; } catch { return null; } };
const saveCache = (p: Profile | null) => { try { if (p) localStorage.setItem(CACHE, JSON.stringify(p)); else localStorage.removeItem(CACHE); } catch { /* */ } };

export function useProfile(enabled: boolean) {
  const [session, setSession] = useState<Session | null>(() => (enabled ? loadSession() : null));
  const [user, setUser] = useState<PublicUser | null>(null);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const [guestPhoto, setGuestPhoto] = useState<string | null>(loadGuestPhoto);
  const [profile, setProfileState] = useState<Profile>(() => (enabled && loadSession() ? loadCache() ?? loadProfile() : loadProfile()));
  const ref = useRef({ profile, session });
  ref.current = { profile, session };

  const setProfile = useCallback((p: Profile) => {
    ref.current.profile = p;
    setProfileState(p);
    if (ref.current.session) saveCache(p); else saveProfile(p);
  }, []);

  /** Déconnexion locale (jeton expiré, compte supprimé…) : retour au profil invité de l'appareil. */
  const dropSession = useCallback(() => {
    saveAccountSession(null);
    saveCache(null);
    ref.current.session = null;
    setSession(null);
    setUser(null);
    setProfileState(loadProfile());
  }, []);

  // Au démarrage (et à la demande) : rafraîchir le profil du compte depuis le serveur.
  const refresh = useCallback(() => {
    const s = ref.current.session;
    if (!s) return;
    api<{ user: PublicUser; profile: Profile; welcomeBack?: boolean }>('/me', { token: s.token })
      .then((r) => { setUser(r.user); setProfile(sanitizeProfile(r.profile)); if (r.welcomeBack) setWelcomeBack(true); })
      .catch((e) => { if (e instanceof ApiError && e.status === 401) dropSession(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session) refresh(); }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback((r: { token: string; user: PublicUser; profile: Profile }) => {
    const s = { token: r.token, username: r.user.username };
    saveAccountSession(s);
    ref.current.session = s;
    setSession(s);
    setUser(r.user);
    setProfile(sanitizeProfile(r.profile));
  }, [setProfile]);

  const register = useCallback(async (username: string, password: string, importGuest: boolean, referrer?: string) => {
    const r = await api<{ token: string; user: PublicUser; profile: Profile; recoveryCode: string }>('/register', {
      body: { username, password, guestProfile: importGuest ? loadProfile() : undefined, referrer: referrer?.trim() || undefined },
    });
    signIn(r);
    return r.recoveryCode;
  }, [signIn]);
  const login = useCallback(async (username: string, password: string) => {
    signIn(await api('/login', { body: { username, password } }));
  }, [signIn]);
  const recover = useCallback(async (username: string, recoveryCode: string, newPassword: string) => {
    const r = await api<{ token: string; user: PublicUser; profile: Profile; recoveryCode: string }>('/recover', { body: { username, recoveryCode, newPassword } });
    signIn(r);
    return r.recoveryCode;
  }, [signIn]);
  const logout = useCallback(async () => {
    const t = ref.current.session?.token;
    dropSession();
    if (t) await api('/logout', { body: {}, token: t }).catch(() => {});
  }, [dropSession]);
  const deleteAccount = useCallback(async (password: string) => {
    await api('/me', { method: 'DELETE', body: { password }, token: ref.current.session?.token });
    dropSession();
  }, [dropSession]);

  /** Applique une action de boutique / défi : localement (invité) ou via le serveur (compte). */
  const act = useCallback(async (path: string, id: string, local: (p: Profile) => Profile | null): Promise<string | null> => {
    const s = ref.current.session;
    if (!s) {
      const next = local(ref.current.profile);
      if (!next) return 'Action impossible';
      setProfile(next);
      return null;
    }
    try {
      const r = await api<{ profile: Profile }>(path, { body: { id }, token: s.token });
      setProfile(sanitizeProfile(r.profile));
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) dropSession();
      return (e as Error).message;
    }
  }, [setProfile, dropSession]);

  // --- Dés de collection : les sacs s'ouvrent sur le serveur (comptes uniquement) ---
  const openBag = useCallback(async (): Promise<{ result?: BagResult; error?: string }> => {
    const s = ref.current.session;
    if (!s) return { error: 'compte' };
    try {
      const r = await api<{ profile: Profile; result: BagResult }>('/bags/open', { body: {}, token: s.token });
      setProfile(sanitizeProfile(r.profile));
      return { result: r.result };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) dropSession();
      return { error: (e as Error).message };
    }
  }, [setProfile, dropSession]);
  const craft = useCallback((id: string) => act('/collection/craft', id, (p) => craftDie(p, id)), [act]);
  const equipFxAction = useCallback(async (kind: FxKind, id: string | null): Promise<string | null> => {
    const s = ref.current.session;
    if (!s) { const n = equipFx(ref.current.profile, kind, id); if (!n) return 'Effet non possédé'; setProfile(n); return null; }
    try {
      const r = await api<{ profile: Profile }>('/collection/fx', { body: { kind, id }, token: s.token });
      setProfile(sanitizeProfile(r.profile));
      return null;
    } catch (e) { return (e as Error).message; }
  }, [setProfile]);
  const setVitrine = useCallback(async (ids: string[]): Promise<string | null> => {
    const s = ref.current.session;
    if (!s) { const n = setShowcase(ref.current.profile, ids); if (!n) return 'Vitrine invalide'; setProfile(n); return null; }
    try {
      const r = await api<{ profile: Profile }>('/collection/showcase', { body: { ids }, token: s.token });
      setProfile(sanitizeProfile(r.profile));
      return null;
    } catch (e) { return (e as Error).message; }
  }, [setProfile]);

  // --- Joueurs bloqués (comptes) ---
  const [blocked, setBlocked] = useState<string[]>([]);
  useEffect(() => {
    if (!session) { setBlocked([]); return; }
    api<{ blocked: string[] }>('/blocks', { token: session.token }).then((r) => setBlocked(r.blocked)).catch(() => {});
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  const block = useCallback(async (username: string, on: boolean): Promise<string | null> => {
    const t = ref.current.session?.token;
    if (!t) return 'Créez un compte pour bloquer des joueurs.';
    try {
      const r = on
        ? await api<{ blocked: string[] }>('/blocks', { body: { username }, token: t })
        : await api<{ blocked: string[] }>(`/blocks/${encodeURIComponent(username)}`, { method: 'DELETE', token: t });
      setBlocked(r.blocked);
      return null;
    } catch (e) { return (e as Error).message; }
  }, []);
  const isBlocked = useCallback((username?: string | null) => !!username && blocked.some((b) => b.toLowerCase() === username.toLowerCase()), [blocked]);

  /** Variante d'« act » avec un corps de requête libre. */
  const act2 = useCallback(async (path: string, body: object, local: (p: Profile) => Profile | null): Promise<string | null> => {
    const s = ref.current.session;
    if (!s) {
      const next = local(ref.current.profile);
      if (!next) return 'Action impossible';
      setProfile(next);
      return null;
    }
    try {
      const r = await api<{ profile: Profile }>(path, { body, token: s.token });
      setProfile(sanitizeProfile(r.profile));
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) dropSession();
      return (e as Error).message;
    }
  }, [setProfile, dropSession]);
  /** Coffre du soir : pièces au hasard, parfois un sac de dés. */
  const openEveningChest = useCallback(async (): Promise<{ coins: number; bag: boolean } | { error: string }> => {
    const s = ref.current.session;
    if (!s) {
      const r = openChest(ref.current.profile);
      if (!r) return { error: 'Le coffre se recharge 24 h après chaque ouverture.' };
      setProfile(r.profile);
      return { coins: r.coins, bag: r.bag };
    }
    try {
      const r = await api<{ profile: Profile; coins: number; bag: boolean }>('/chest/open', { body: {}, token: s.token });
      setProfile(sanitizeProfile(r.profile));
      return { coins: r.coins, bag: r.bag };
    } catch (e) { return { error: (e as Error).message }; }
  }, []);
  const claimDailyReward = useCallback(() => act2('/daily/claim', {}, (p) => claimDaily(p)?.profile ?? null), [act2]);
  const claimPass = useCallback((tier: number) => act2('/season/claim', { tier }, (p) => claimPassTier(p, tier)?.profile ?? null), [act2]);
  const chooseTitle = useCallback((id: string | null) => act2('/title', { id }, (p) => setTitle(p, id)), [act2]);
  const finishTutorial = useCallback(() => act2('/tutorial/done', {}, (p) => completeTutorial(p)), [act2]);
  const prestige = useCallback(() => act2('/prestige', {}, (p) => doPrestige(p)), [act2]);

  // --- Défi du jour ---
  /** Résultat officiel (compte) ou local (invité) ; la récompense n'est versée qu'une fois par jour. */
  const submitChallenge = useCallback(async (decisions: boolean[][][]): Promise<{ result: ChallengeResult; reward: { coins: number; xp: number } | null; rank?: number; total?: number; error?: string }> => {
    const day = today();
    const local = playChallenge(day, decisions)!;
    const s = ref.current.session;
    if (s) {
      try {
        const r = await api<{ result: ChallengeResult; reward: { coins: number; xp: number }; profile: Profile; rank: number; total: number }>('/challenge/submit', { body: { decisions }, token: s.token });
        setProfile(sanitizeProfile(r.profile));
        saveChallengeDone(day, r.result);
        return { result: r.result, reward: r.reward, rank: r.rank, total: r.total };
      } catch (e) {
        return { result: local, reward: null, error: (e as Error).message };
      }
    }
    if (loadChallengeDone()?.day === day) return { result: local, reward: null };
    const r = challengeReward(local.points);
    const p = ref.current.profile;
    setProfile(addSeasonPoints({ ...p, xp: p.xp + r.xp, coins: p.coins + r.coins }, r.xp, day));
    saveChallengeDone(day, local);
    return { result: local, reward: r };
  }, [setProfile]);

  const buyItem = useCallback((id: string) => act('/shop/buy', id, (p) => { const b = buy(p, id); return b ? equip(b, id) : null; }), [act]);
  const equipItem = useCallback((id: string) => act('/shop/equip', id, (p) => equip(p, id)), [act]);
  const claim = useCallback((id: string) => act('/quests/claim', id, (p) => claimQuest(p, id)?.profile ?? null), [act]);

  // --- Fin de partie ---------------------------------------------------------------------------
  const soloToken = useRef<string | null>(null);
  /** Début d'une partie solo : avec un compte, le serveur délivre un jeton de partie. */
  // Invités : un jeton de partie pour les statistiques publiques (aucune donnée personnelle).
  const statToken = useRef<string | null>(null);
  const onSoloStart = useCallback(() => {
    soloToken.current = null;
    statToken.current = null;
    if (!enabled) return;
    setPresence('solo');
    trackEvent('solo');
    const s = ref.current.session;
    if (s) api<{ gameToken: string }>('/solo/start', { body: {}, token: s.token }).then((r) => { soloToken.current = r.gameToken; }).catch(() => {});
    else api<{ token: string }>('/stats/solo/start', { body: {} }).then((r) => { statToken.current = r.token; }).catch(() => {});
  }, [enabled]);

  /** Récompenses en ligne envoyées par le serveur (comptes) : on les attend un court instant. */
  const pendingOnline = useRef<EndReward | null>(null);
  const waiters = useRef<((r: EndReward) => void)[]>([]);
  const onServerReward = useCallback((r: EndReward) => {
    setProfile(sanitizeProfile(r.applied.profile));
    pendingOnline.current = r;
    for (const w of waiters.current) w(r);
    waiters.current = [];
  }, [setProfile]);

  /** Solde mis à jour par le serveur (mise prélevée, cagnotte, gain de tournoi). */
  const onServerProfile = useCallback((p: Profile) => {
    if (ref.current.session) setProfile(sanitizeProfile(p));
  }, [setProfile]);

  const onGameEnd = useCallback(async (state: GameState, meId: string, ctx: RewardContext): Promise<EndReward | null> => {
    const s = ref.current.session;
    if (!s) {
      const st = statToken.current;
      statToken.current = null;
      if (st && ctx.mode === 'solo') {
        api('/stats/solo/end', { body: { token: st, won: didWin(state, meId), opponents: ctx.opponents, device: deviceId() } }).catch(() => {});
      }
      const reward = computeReward(state, meId, ctx);
      if (!reward.xp && !reward.coins) return null;
      const applied = applyGameEnd(ref.current.profile, reward, ctx);
      setProfile(applied.profile);
      return { reward, applied };
    }
    // Partie en ligne (y compris avec des ordinateurs, comptée « solo » s'il n'y a pas d'autre humain) : récompense du serveur.
    if (ctx.mode === 'online' || ctx.botLevel) {
      if (pendingOnline.current) { const r = pendingOnline.current; pendingOnline.current = null; return r; }
      return new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), 4000);
        waiters.current.push((r) => { clearTimeout(t); pendingOnline.current = null; resolve(r); });
      });
    }
    const token = soloToken.current;
    soloToken.current = null;
    if (!token) return null;
    // Aussi pour un joueur sorti avant la fin (place définitive) : voir settledPlace.
    const won = didWin(state, meId);
    try {
      const r = await api<EndReward>('/solo/end', {
        token: s.token,
        body: { gameToken: token, won, rounds: state.round, opponents: ctx.opponents, difficulty: ctx.difficulty, count421: ctx.count421, combos: ctx.combos, gestureThrows: ctx.gestureThrows, roundsLost: ctx.roundsLost, maxTokens: ctx.maxTokens, suddenDeath: ctx.suddenDeath, comboKeys: ctx.comboKeys, best: ctx.best, opponentNames: ctx.opponentNames, boss: ctx.boss, place: ctx.place },
      });
      setProfile(sanitizeProfile(r.applied.profile));
      return r;
    } catch {
      return null; // partie trop courte, plafond atteint ou hors connexion : pas de récompense
    }
  }, [setProfile]);

  /** Photo de profil : envoyée au serveur (compte) ou gardée sur l'appareil (invité). */
  const setPhoto = useCallback(async (file: File): Promise<string | null> => {
    try {
      const dataUrl = await photoToDataUrl(file);
      const s = ref.current.session;
      if (!s) { saveGuestPhoto(dataUrl); setGuestPhoto(dataUrl); return null; }
      const r = await api<{ photo: string }>('/me/photo', { body: { dataUrl }, token: s.token });
      setUser((u) => (u ? { ...u, photo: r.photo } : u));
      return null;
    } catch (e) { return (e as Error).message; }
  }, []);
  const removePhoto = useCallback(async () => {
    const s = ref.current.session;
    if (!s) { saveGuestPhoto(null); setGuestPhoto(null); return; }
    await api('/me/photo', { method: 'DELETE', token: s.token }).catch(() => {});
    setUser((u) => (u ? { ...u, photo: null } : u));
  }, []);
  const photo = session ? user?.photo ?? null : guestPhoto;

  return {
    profile, session, user, isAccount: !!session, welcomeBack, dismissWelcome: () => setWelcomeBack(false), photo, setPhoto, removePhoto,
    register, login, recover, logout, deleteAccount,
    submitChallenge,
    buyItem, equipItem, claim, blocked, block, isBlocked, claimDailyReward, openEveningChest, claimPass, chooseTitle, finishTutorial, prestige,
    onSoloStart, onGameEnd, onServerReward, onServerProfile, openBag, craft, setVitrine, equipFx: equipFxAction, refresh,
    token: session?.token ?? null,
  };
}
export type ProfileApi = ReturnType<typeof useProfile>;
