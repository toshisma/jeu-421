import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { trackFirstRoll } from '../visit';
import { FloatingPop } from './FloatingPop';
import { askConfirm } from './confirm';
import { appBottom, appView, useNavGuard } from './navGuard';
import { Icon } from './Icon';
import { flyTokens } from './flyTokens';
import { isSuddenDeath } from '../../../shared/config';
import { albumKey, botTableRules, finalPlace, settledPlace } from '../../../shared/progress/profile';
import { setPresence } from '../presence';
import { fxDef } from '../../../shared/progress/dice-collection';
import { Celebration } from './Celebration';
import { currentPlayerId, roundStatus, standings, type GameState } from '../../../shared/engine';
import { Avatar } from './Avatar';
import { evaluate } from '../../../shared/combos';
import type { GameController, GameEvent, MetaPlayer } from '../game/controller';
import { reaction, type Persona } from '../game/personas';
import { sound } from '../audio/sound';
import type { Settings } from '../settings';
import type { Insets } from '../three/TrayScene';
import { DiceTray, type DiceTrayHandle } from './DiceTray';
import { DiceRow, MiniDie } from './MiniDie';
import { PlayerCard } from './PlayerCard';
import { useGuestInviteAtEnd } from './guestInvite';
import { EndOverlay } from './EndOverlay';
import { VolumeControl } from './VolumeControl';
import { RoundTracker, WhatIf } from './RoundTracker';
import { RulesContent } from './Screens';
import { ProfileView } from './ProfileView';
import type { ProfileApi } from '../account/useProfile';
import { EMOTES, PHRASES } from '../../../shared/protocol';
import type { ThrowGesture } from '../../../shared/gesture';
import { requestMotionPermission, needsMotionPermission, useShakeToThrow } from '../game/shake';
import { useTurnAlert } from '../turnAlert';
import { PartyController } from '../game/party';
import type { Appearance } from '../../../shared/progress/catalog';
import type { RewardContext } from '../../../shared/progress/profile';
import type { ComboKind } from '../../../shared/combos';

export type { EndReward } from '../account/useProfile';
import type { EndReward } from '../account/useProfile';
import { tr, trServer } from '../i18n/lang';
import { botName, ord, trCombo, trLine, trn, trPhrase } from '../i18n/g421';

interface Props {
  controller: GameController;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onExit: () => void;
  personas?: Record<string, Persona>;
  appearance: Appearance;
  /** Appelé une seule fois quand une partie se termine : calcule et enregistre la récompense. */
  onGameEnd?: (state: GameState, ctx: RewardContext) => EndReward | null | Promise<EndReward | null>;
  /** Une nouvelle partie commence (premier affichage ou revanche). */
  onGameStart?: () => void;
  pa?: ProfileApi;
  /** Table de tournoi : sortir ramène au tableau (sans quitter le tournoi), avec une note de fin. */
  tableExit?: { label: string; note?: (state: GameState) => string };
  /** Partie contre le patron de la semaine. */
  bossId?: string;
  /**
   * Sorti avant la fin (place définitive) : récompense tout de suite, puis « Empocher et quitter »
   * ou « Continuer à regarder ». `false` : désactivé (partie guidée). Une fonction adapte le
   * bandeau (tournoi : qualifié, éliminé, finale).
   */
  early?: false | ((state: GameState, place: number) => EarlyOptions);
  /**
   * Invitation à créer un compte à l'écran de fin (invités seulement, voir guestInvite.ts).
   * `false` : jamais (spectateur, partie entre amis sur un appareil) ; une fonction : selon le résultat
   * (tournoi : seulement quand le tournoi est fini pour le joueur).
   */
  guestInvite?: false | ((state: GameState) => boolean);
  /** Encart en plus à l'écran de fin et au bandeau « sorti avant la fin » (Tournée des comptoirs : étoiles). */
  endExtra?: React.ReactNode;
}

export interface EarlyOptions {
  title?: string;
  note?: string;
  /** Bouton principal pour partir (null : pas proposé, par exemple qualifié pour le tour suivant). */
  quit?: { label: string; run: () => void } | null;
  /** Bouton secondaire (tournoi : voir le tableau). */
  alt?: { label: string; run: () => void };
}

const placeLabel = (n: number) => ord(n);

const NO_KEEP = [false, false, false];
const MEDALS = ['🥇', '🥈', '🥉'];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function GameScreen({ controller, settings, onSettings, onExit, personas, appearance, onGameEnd, onGameStart, pa, tableExit, bossId, early, guestInvite, endExtra }: Props) {
  const tray = useRef<DiceTrayHandle>(null);
  const [shown, setShown] = useState<GameState | null>(null);
  const shownRef = useRef<GameState | null>(null);
  const [meta, setMeta] = useState<MetaPlayer[]>(controller.getMeta());
  const [thinking, setThinking] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [keep, setKeep] = useState<boolean[]>(NO_KEEP);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const [speech, setSpeech] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [profileOf, setProfileOf] = useState<{ username: string | null } | null>(null);
  const [emotes, setEmotes] = useState<Record<string, { e: string; k: number }>>({});
  const [emoteOpen, setEmoteOpen] = useState(false);
  const emoteRef = useRef<HTMLDivElement>(null);
  const closeEmote = useCallback(() => setEmoteOpen(false), []);
  const cardEls = useRef<Record<string, HTMLDivElement | null>>({});
  const sayRef = useRef<(id: string, text: string | null) => void>(() => {});
  // Joueurs bloqués : photo et réactions masquées.
  const blockedRef = useRef(pa?.isBlocked);
  blockedRef.current = pa?.isBlocked;
  useEffect(() => controller.subscribeEmotes((pid, e) => {
    if (blockedRef.current?.(controller.getMeta().find((m) => m.id === pid)?.account)) return;
    // Phrase rapide : une bulle au-dessus du joueur ; émoji : il s'envole.
    if (PHRASES.includes(e)) { sayRef.current(pid, trPhrase(e)); sound.click(); return; }
    const k = Date.now() + Math.random();
    setEmotes((m) => ({ ...m, [pid]: { e, k } }));
    sound.click();
    setTimeout(() => setEmotes((m) => { if (m[pid]?.k !== k) return m; const n = { ...m }; delete n[pid]; return n; }), 2200);
  }), [controller]);
  const [bigShot, setBigShot] = useState<{ text: string; who: string; id: number; fete?: string } | null>(null);
  useEffect(() => { if (!bigShot) return; const t = setTimeout(() => setBigShot(null), 2400); return () => clearTimeout(t); }, [bigShot]);
  const [now, setNow] = useState(Date.now());
  const [endReward, setEndReward] = useState<EndReward | null>(null);
  /**
   * Récompense de la partie : pas encore demandée, en calcul, connue (endReward, éventuellement null :
   * aucune), ou déjà comptée avant l'ouverture de l'écran (retour dans une partie où l'on était sorti).
   */
  const [rewardStatus, setRewardStatus] = useState<'none' | 'pending' | 'done' | 'earlier'>('none');
  /** Sorti avant la fin : le joueur a choisi de continuer à regarder (bandeau réduit). */
  const [watching, setWatching] = useState(false);
  /** La récompense de cette partie a déjà été demandée (à la sortie du joueur) : jamais une deuxième fois. */
  const rewardAsked = useRef(false);
  const earlyOk = early !== false && !controller.spectator && !(controller instanceof PartyController);
  const earlyOkRef = useRef(earlyOk);
  earlyOkRef.current = earlyOk;
  const count421 = useRef(0);
  const startedAt = useRef(Date.now());
  const albumKeys = useRef<string[]>([]);
  const bestRoll = useRef<{ label: string; rank: number } | null>(null);
  // Statistiques de la partie pour les défis du jour.
  const combos = useRef<Partial<Record<ComboKind, number>>>({});
  const gestureThrows = useRef(0);
  const roundsLost = useRef(0);
  const maxTokens = useRef(0);
  const onGameStartRef = useRef(onGameStart);
  onGameStartRef.current = onGameStart;
  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;
  const queue = useRef<GameEvent[]>([]);
  /** Retour sur l'onglet avec des événements en attente : on les passe sans animation. */
  const catchingUp = useRef(false);
  const busy = useRef(false);

  const metaOf = useCallback((id: string) => {
    const m = meta.find((x) => x.id === id);
    return m && m.photo && pa?.isBlocked(m.account) ? { ...m, photo: null } : m;
  }, [meta, pa]);
  const nameOf = (id: string) => botName(metaOf(id)?.name ?? shown?.players.find((p) => p.id === id)?.name ?? '?');
  // Dés de chaque joueur : quand quelqu'un lance, le bac montre ses dés à lui.
  const metaRef = useRef(meta);
  const anyRoll = useRef(false);
  metaRef.current = meta;
  const skinOf = (id: string | null): string | null =>
    !id || id === controller.meId ? null : metaRef.current.find((m) => m.id === id)?.dice ?? null;
  const fxRef = useRef(pa?.profile.fx);
  fxRef.current = pa?.profile.fx;
  /** Effets de lancer d'un joueur (les miens : mon profil ; les autres : ce qu'annonce la table). */
  const fxOf = (id: string, kind: 'trail' | 'fete'): string | undefined =>
    id === controller.meId ? fxRef.current?.[kind === 'trail' ? 'trainee' : 'fete'] : metaRef.current.find((m) => m.id === id)?.[kind];

  const say = useCallback((id: string, text: string | null) => {
    if (!text) return;
    setSpeech((s) => ({ ...s, [id]: text }));
    setTimeout(() => setSpeech((s) => { const n = { ...s }; if (n[id] === text) delete n[id]; return n; }), 2600);
  }, []);
  sayRef.current = say;

  // Les habitués se souviennent : en début de partie, l'un d'eux rappelle le score entre vous.
  useEffect(() => {
    if (controller.mode !== 'solo' || !pa) return;
    const rec = pa.profile.vsAi ?? {};
    const known = controller.getMeta().filter((m) => m.isBot && (rec[m.name]?.w ?? 0) + (rec[m.name]?.l ?? 0) >= 2);
    if (!known.length) return;
    const m = known[Math.floor(Math.random() * known.length)];
    const { w, l } = rec[m.name];
    const line = l > w ? tr('g421.vs.ahead', { l, w }) : w > l ? tr('g421.vs.behind', { l, w }) : tr('g421.vs.tied', { w });
    const t = setTimeout(() => say(m.id, line), 1400);
    return () => clearTimeout(t);
  }, [controller]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Calcule et enregistre la récompense de la partie (une seule fois), à la fin ou à la sortie du joueur. */
  const askReward = (state: GameState) => {
    const me = controller.meId;
    const bots = controller.getMeta().filter((m) => m.isBot);
    // En ligne avec des ordinateurs : mêmes règles que le serveur (barème du solo, hors classement).
    const botRules = controller.mode === 'online' ? botTableRules(controller.getMeta().length - bots.length, bots.map((b) => b.difficulty ?? 'normal')) : { mode: controller.mode };
    setRewardStatus('pending');
    void Promise.resolve(onGameEndRef.current?.(state, {
      ...botRules,
      opponents: state.players.length - 1,
      difficulty: bots[0]?.difficulty,
      count421: count421.current,
      combos: { ...combos.current },
      gestureThrows: gestureThrows.current,
      rounds: state.round,
      roundsLost: state.config.variant === 'manches' ? undefined : roundsLost.current,
      maxTokens: maxTokens.current,
      suddenDeath: isSuddenDeath(state.config),
      comboKeys: [...albumKeys.current],
      best: bestRoll.current ?? undefined,
      opponentNames: controller.getMeta().filter((m) => m.id !== me).map((m) => m.name),
      hour: new Date().getHours(),
      boss: bossId,
      place: finalPlace(state, me),
      minutes: (Date.now() - startedAt.current) / 60000,
      now: Date.now(),
    })).then((r) => { setEndReward(r ?? null); setRewardStatus('done'); }, () => setRewardStatus('done'));
  };
  const askRewardRef = useRef(askReward);
  askRewardRef.current = askReward;

  // ------------------------------------------------------------------------------------------
  // File d'événements : chaque lancer est animé jusqu'au bout avant d'afficher le nouvel état.
  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAnimating(true);
    while (queue.current.length) {
      const ev = queue.current.shift()!;
      const prev = shownRef.current;
      // Nouvelle partie (revanche) : on remet les compteurs à zéro.
      if (prev && (ev.state.version < prev.version || (prev.phase === 'fini' && ev.state.phase !== 'fini'))) {
        count421.current = 0;
        startedAt.current = Date.now();
        combos.current = {};
        gestureThrows.current = 0;
        albumKeys.current = [];
        bestRoll.current = null;
        roundsLost.current = 0;
        maxTokens.current = 0;
        onGameStartRef.current?.();
        setEndReward(null);
        setRewardStatus('none');
        setWatching(false);
        rewardAsked.current = false;
      }
      if (!prev) onGameStartRef.current?.(); // première partie
      if (ev.type === 'roll' && ev.roll.playerId === controller.meId) {
        if (ev.roll.combo.kind === '421' && !ev.roll.rolloff) count421.current++;
        combos.current[ev.roll.combo.kind] = (combos.current[ev.roll.combo.kind] ?? 0) + 1;
        if (ev.gesture) gestureThrows.current++;
        const k = albumKey(ev.roll.dice);
        if (k && !albumKeys.current.includes(k)) albumKeys.current.push(k);
        if (!bestRoll.current || ev.roll.combo.rank > bestRoll.current.rank) bestRoll.current = { label: ev.roll.combo.label, rank: ev.roll.combo.rank };
      }
      // En ligne, onglet caché ou retour sur l'onglet : pas d'animation en différé, on rattrape l'état
      // officiel tout de suite (sinon le joueur voit d'anciens lancers pendant que son temps court).
      const catchUp = controller.mode === 'online' && (document.hidden || catchingUp.current);
      if (ev.type === 'roll' && catchUp) {
        tray.current?.showValues(ev.roll.dice);
      } else if (ev.type === 'roll') {
        tray.current?.setInteractive(false);
        const big = ev.roll.combo.kind === '421' || ev.roll.combo.kind === '111';
        anyRoll.current = true;
        tray.current?.setDiceSkin(skinOf(ev.roll.playerId));
        tray.current?.setTrail(fxOf(ev.roll.playerId, 'trail') ?? null);
        await tray.current?.roll(ev.roll.dice, ev.roll.kept, ev.seed, ev.gesture, big);
        if (big) {
          sound.jackpot();
          const fete = fxOf(ev.roll.playerId, 'fete');
          // Le texte, le son et la célébration dans le bac partent ensemble.
          tray.current?.celebrate(fxDef(fete)?.kind === 'fete' ? fete! : null);
          setBigShot({ text: tr(ev.roll.combo.kind === '421' ? 'g421.big.421' : 'g421.big.111'), who: ev.roll.playerId, id: ev.roll.seq, fete });
          await wait(900);
        }
        const p = personas?.[ev.roll.playerId];
        if (p) say(ev.roll.playerId, trLine(reaction(p, ev.roll.combo, ev.roll.throwIndex >= ev.roll.throwLimit)));
      } else if (ev.state.dice.some((d) => d > 0)) {
        tray.current?.showValues(ev.state.dice);
      }
      // Validation d'un tour (sans nouveau lancer)
      if (ev.type === 'state' && prev && ev.state.version > prev.version) {
        sound.validate();
        const who = currentPlayerId(prev);
        const p = who ? personas?.[who] : undefined;
        if (p && who && ev.state.results[who]) say(who, trLine(reaction(p, ev.state.results[who].combo, true)));
      }
      // Suivi pour les succès : manches perdues, maximum de jetons détenus.
      const meP = ev.state.players.find((x) => x.id === controller.meId);
      if (meP) maxTokens.current = Math.max(maxTokens.current, meP.tokens);
      const sm = ev.state.lastSummary;
      if (prev && sm && sm.seq !== prev.lastSummary?.seq && !sm.barrage && sm.loserId === controller.meId) roundsLost.current++;
      shownRef.current = ev.state;
      setShown(ev.state);
      const sum = ev.state.lastSummary;
      if (prev && sum && sum.seq !== prev.lastSummary?.seq) {
        setToast({ text: trServer(sum.text), kind: sum.barrage ? 'barrage' : 'round', id: sum.seq });
        if (!sum.barrage && sum.amount > 0) sound.chips(sum.amount);
        // Les jetons passent du pot (charge) ou du gagnant (décharge) au perdant.
        if (!sum.barrage && sum.amount > 0 && sum.loserId && ev.state.config.variant !== 'manches') {
          const from = sum.phase === 'charge' ? document.querySelector('.tracker') : sum.winnerId ? cardEls.current[sum.winnerId] : null;
          flyTokens(from, cardEls.current[sum.loserId], sum.amount);
        }
        if (!catchUp) await wait(ev.state.phase === 'fini' ? 600 : 1500);
      }
      const me = controller.meId;
      // Joueur sorti avant la fin : sa place est définitive, sa récompense est calculée tout de suite
      // (le serveur fait de même pour les comptes en ligne). Il pourra partir ou regarder la fin.
      const outNow = earlyOkRef.current && settledPlace(ev.state, me) != null;
      if (outNow && !rewardAsked.current) {
        rewardAsked.current = true;
        if (prev && settledPlace(prev, me) == null) {
          if (settledPlace(ev.state, me) === 1) sound.win();
          askRewardRef.current(ev.state);
        } else setRewardStatus('earlier'); // déjà sorti en arrivant sur l'écran (reconnexion) : déjà compté
      }
      if (prev && prev.phase !== 'fini' && ev.state.phase === 'fini') {
        if (onGameStartRef.current) setPresence('menu'); // partie solo terminée : plus « en cours »
        if (ev.state.tiedWinners?.includes(me)) sound.validate(); // égalité : ni fanfare ni défaite
        else if (ev.state.ranking[0] === me) sound.win();
        else if (ev.state.loserId === me || ev.state.ranking[ev.state.ranking.length - 1] === me) sound.lose();
        else sound.win();
        if (!rewardAsked.current) { rewardAsked.current = true; askRewardRef.current(ev.state); }
      }
    }
    catchingUp.current = false;
    busy.current = false;
    setAnimating(false);
    controller.notifyIdle();
  }, [controller, personas, say]);

  useEffect(() => {
    const offE = controller.subscribeEvents((e) => { queue.current.push(e); void pump(); });
    const offM = controller.subscribeMeta(() => { setMeta([...controller.getMeta()]); setThinking(controller.thinkingId()); });
    return () => { offE(); offM(); };
  }, [controller, pump]);

  // Retour sur l'onglet : les lancers accumulés ne sont pas rejoués un par un.
  useEffect(() => {
    if (controller.mode !== 'online') return;
    const onVis = () => { if (!document.hidden && queue.current.length) catchingUp.current = true; };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [controller]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Onglet en arrière-plan : « À vous de jouer » (titre, icône, son, notification). Pas en spectateur ni à plusieurs sur un appareil.
  useTurnAlert(controller, settings.turnAlert !== false && !controller.spectator && !(controller instanceof PartyController), settings.vibrate);

  // Téléphone : l'écran ne se met pas en veille pendant la partie (si le navigateur le permet).
  useEffect(() => {
    type Lock = { release(): Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Lock> } }).wakeLock;
    if (!wl) return;
    let lock: Lock | null = null;
    let alive = true;
    const take = () => { if (document.visibilityState === 'visible') wl.request('screen').then((l) => { if (alive) lock = l; else void l.release(); }).catch(() => {}); };
    take();
    document.addEventListener('visibilitychange', take);
    return () => { alive = false; document.removeEventListener('visibilitychange', take); void lock?.release().catch(() => {}); };
  }, []);

  // Horloge du compte à rebours : seulement quand un délai de tour existe (en ligne), pour ne pas
  // redessiner toute l'interface chaque seconde pendant les lancers.
  const hasDeadline = controller.turnDeadline() != null;
  useEffect(() => {
    if (!hasDeadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [hasDeadline]);

  // ------------------------------------------------------------------------------------------
  const s = shown;
  const currentId = s ? currentPlayerId(s) : null;
  const myTurn = !!s && currentId === controller.meId && !animating;
  const canKeepNow = myTurn && !!s && s.throwsUsed > 0 && s.throwsUsed < s.throwLimit;

  // La sélection reste d'un lancer à l'autre (on peut toujours décocher) ;
  // elle repart à zéro seulement quand le tour change.
  const turnKey = s ? `${s.round}|${currentId}|${s.isRolloff}|${s.throwsUsed === 0 ? 'new' : 'on'}` : '';
  useEffect(() => { setKeep(NO_KEEP); }, [turnKey]);
  // Au repos, le bac montre les dés du joueur dont c'est le tour.
  // Les dés du joueur précédent restent sur le tapis avec leur apparence jusqu'au lancer suivant :
  // on ne change d'apparence que si le bac est vide (le lancer suivant applique la sienne).
  const trayEmpty = !s || s.dice.every((d) => d === 0);
  // Les dés restent ceux du dernier joueur qui a lancé, jusqu'à ce que le suivant lance les siens
  // (le changement se fait au lancer, plus haut). Seule exception : avant le tout premier lancer.
  useEffect(() => { if (!animating && trayEmpty && !anyRoll.current) tray.current?.setDiceSkin(skinOf(currentId)); }, [currentId, animating, meta, trayEmpty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (animating) return;
    tray.current?.setKept(canKeepNow ? keep : NO_KEEP);
    tray.current?.setInteractive(canKeepNow);
  }, [keep, canKeepNow, animating]);
  useEffect(() => { if (myTurn && s?.throwsUsed === 0) sound.turn(); }, [myTurn, s?.throwsUsed]);

  const toggleDie = useCallback((i: number) => {
    if (!canKeepNow) return;
    sound.click();
    setKeep((k) => k.map((v, j) => (j === i ? !v : v)));
  }, [canKeepNow]);

  const act = useCallback(async (kind: 'roll' | 'stop', gesture?: ThrowGesture) => {
    if (!s || pending || !myTurn) return;
    sound.unlock();
    setPending(true);
    if (kind === 'roll') trackFirstRoll();
    const err = kind === 'roll' ? await controller.roll(s.throwsUsed === 0 ? NO_KEEP : keep, s.version, gesture) : await controller.stop(s.version);
    setPending(false);
    if (err) setToast({ text: trServer(err), kind: 'error', id: Date.now() });
  }, [s, pending, myTurn, controller, keep]);

  const rerollCount = keep.filter((k) => !k).length;
  // Lancer au geste (glisser sur le bac) ou en secouant le téléphone, quand un lancer est possible.
  const canThrowNow = myTurn && !pending && !!s && (s.throwsUsed === 0 || (canKeepNow && rerollCount > 0));
  useEffect(() => { tray.current?.setSwipeEnabled(canThrowNow); }, [canThrowNow]);
  const onGestureThrow = useCallback((g: ThrowGesture) => { if (canThrowNow) void act('roll', g); }, [canThrowNow, act]);
  useShakeToThrow(settings.shake && canThrowNow, onGestureThrow);
  // Raccourcis clavier : Espace = lancer/relancer, Entrée = valider.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea,button')) return;
      if (e.code === 'Space') { e.preventDefault(); if (s && (s.throwsUsed === 0 || (canKeepNow && rerollCount > 0))) void act('roll'); }
      if (e.code === 'Enter' && s && myTurn && s.throwsUsed > 0) void act('stop');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, s, canKeepNow, rerollCount, myTurn]);

  // ------------------------------------------------------------------------------------------
  // Mise en page : le bac est cadré dans l'espace laissé libre par les panneaux.
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      // Panneaux pas encore remplis (cartes des joueurs) : on attend, le bac choisit son orientation sur la vraie zone libre.
      if (!shownRef.current) return;
      const side = sideRef.current;
      const sideVisible = !!side && getComputedStyle(side).position !== 'fixed';
      setInsets({
        top: (topRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
        bottom: appBottom() - (bottomRef.current?.getBoundingClientRect().top ?? appBottom()) + 4,
        right: sideVisible ? side!.getBoundingClientRect().width + 12 : 0,
        left: 0,
        // La barre d'action grandit à son propre tour (boutons, dés à garder) : l'orientation du bac en tient compte dès le départ.
        orientBottom: Math.round(appBottom() * 0.22),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    [topRef, bottomRef, sideRef].forEach((r) => r.current && ro.observe(r.current));
    // La barre du bas change de hauteur (compacte en partie) : la zone d'affichage aussi.
    const view = appView(); if (view) ro.observe(view);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [shown != null]);

  const st = useMemo(() => (s ? standings(s) : { leader: null, struggling: null }), [s]);
  const feed = useMemo(() => {
    if (!s) return [];
    const items = [
      ...s.history.map((h) => ({ seq: h.seq, kind: 'roll' as const, h })),
      ...s.log.map((l) => ({ seq: l.seq, kind: 'log' as const, l })),
    ];
    return items.sort((a, b) => b.seq - a.seq).slice(0, 50);
  }, [s]);

  const deadline = controller.turnDeadline();
  const turnSecs = controller.turnSeconds();
  // Le serveur ajoute un petit délai pour l'animation : on n'affiche jamais plus que le temps prévu.
  const secondsLeft = deadline ? Math.min(turnSecs || 999, Math.max(0, Math.ceil((deadline - now) / 1000))) : null;
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (secondsLeft != null && secondsLeft <= 5 && secondsLeft > 0 && myTurn && lastTick.current !== secondsLeft) {
      lastTick.current = secondsLeft;
      sound.tick();
    }
  }, [secondsLeft, myTurn]);

  const spectator = !!controller.spectator;
  const watchers = controller.spectatorCount?.() ?? 0;
  // Sorti avant la fin : sa place est acquise, partir n'est pas un abandon (pas de confirmation).
  const myPlace = s && earlyOk ? settledPlace(s, controller.meId) : null;
  /** Confirmation avant de quitter (bouton Quitter, ou barre du bas). */
  const okToLeave = async () => !(s && s.phase !== 'fini' && !tableExit && myPlace == null && !(await askConfirm(tr(controller.mode === 'online' ? 'g421.leaveOnline' : 'g421.leave'), tr('g421.quit'))));
  const leave = async () => {
    if (!(await okToLeave())) return;
    controller.leave();
    onExit();
  };
  // Barre du bas : compacte pendant la partie ; la quitter par la barre = même règle que « Quitter ».
  useNavGuard({ game: true, ask: okToLeave, leave: () => controller.leave() });
  // Écran de fin affiché : invitation à créer un compte (invités ; App décide).
  useGuestInviteAtEnd('421', !!s && s.phase === 'fini' && !animating && guestInvite !== false && (!guestInvite || guestInvite(s)));

  const phaseLabel = !s ? '' : s.phase === 'fini' ? tr('g421.over') : s.isRolloff ? tr('g421.barrage')
    : s.phase === 'charge' ? trn('g421.phase.charge', s.pot)
      : s.phase === 'decharge' ? tr('g421.decharge')
        : s.phase === 'manche' ? tr('g421.phase.manche', { n: s.round, total: s.config.rounds }) : tr('g421.over');
  const phaseShort = s?.phase === 'charge' && !s.isRolloff ? tr('g421.phase.chargeShort', { n: s.pot }) : phaseLabel;
  const currentCombo = s && s.throwsUsed > 0 ? evaluate(s.dice, s.config.values) : null;
  // Ce que le joueur actif doit battre (la plus mauvaise main de la manche), ou le meilleur coup aux points.
  const target = useMemo(() => {
    if (!s || s.phase === 'fini' || !currentId) return null;
    const rs = roundStatus(s);
    if (rs.points) return rs.best ? tr('g421.target.best', { c: trCombo(rs.best.combo.label) }) : null;
    if (rs.worst && !rs.worst.ids.includes(currentId)) return tr('g421.target.beat', { c: rs.addition ? tr('g421.totalN', { n: rs.worst.combo.dice.reduce((x, y) => x + y, 0) }) : trCombo(rs.worst.combo.label) });
    return null;
  }, [s, currentId]);

  return (
    <div className="game" onPointerDown={() => { sound.unlock(); if (settings.shake && needsMotionPermission()) void requestMotionPermission(); }}>
      <DiceTray ref={tray} appearance={appearance} quality={settings.quality} insets={insets} onDieClick={toggleDie} onSwipe={onGestureThrow} cup={settings.cup} />
      <div className="vignette" />

      <div className="top" ref={topRef}>
        <div className="topbar">
          <button className="icon-btn" onClick={leave} aria-label={tr('g421.leaveAria')}><Icon name="back" /></button>
          <div className="phase">
            <span className={`logo-mini${bigShot ? " neon" : ""}`}>421</span>
            <span className="ph-long">{phaseLabel}</span><span className="ph-short">{phaseShort}</span>
            {s && s.phase !== 'manche' && s.phase !== 'fini' && <span className="muted">{tr('g421.mancheN', { n: s.round })}</span>}
          </div>
          <div className="top-actions">
            <button className="icon-btn hide-desktop" onClick={() => setHistoryOpen((o) => !o)} aria-label={tr('g421.history')}><Icon name="history" /></button>
            {!spectator && <div className="emote-wrap" ref={emoteRef}>
              <button className="icon-btn" aria-label={tr('g421.react')} onClick={() => setEmoteOpen((o) => !o)}><Icon name="react" /></button>
              {emoteOpen && (
                <FloatingPop anchor={emoteRef} onClose={closeEmote} className="emote-pop" label={tr('g421.reactions')}>
                  <div className="emote-grid">
                    {EMOTES.map((e) => <button key={e} onClick={() => { controller.sendEmote(e); setEmoteOpen(false); }}>{e}</button>)}
                  </div>
                  <div className="phrase-list">
                    {PHRASES.map((p) => <button key={p} onClick={() => { controller.sendEmote(p); setEmoteOpen(false); }}>{trPhrase(p)}</button>)}
                  </div>
                </FloatingPop>
              )}
            </div>}
            <button className="icon-btn" onClick={() => setRulesOpen(true)} aria-label={tr('g421.rules')}><Icon name="rules" /></button>
            <VolumeControl settings={settings} onSettings={onSettings} />
          </div>
        </div>
        {spectator ? (
          <div className="spectate-banner" role="status">
            <span>👁 {tr('g421.watching')}{watchers > 1 ? ` ${tr('g421.watchersN', { n: watchers })}` : ''}</span>
            {controller.watchLink && <button className="icon-btn small" aria-label={tr('g421.copyWatch')} title={tr('g421.copyWatch')}
              onClick={() => { const l = controller.watchLink!(); navigator.clipboard?.writeText(l).then(() => setToast({ text: tr('g421.linkCopied'), kind: 'round', id: Date.now() }), () => window.prompt(tr('g421.copyPrompt'), l)); }}>
              <Icon name="share" size={18} /></button>}
            <button className="btn small primary" onClick={leave}>{tr('g421.quit')}</button>
          </div>
        ) : watchers > 0 && (
          <div className="spectators-count" aria-label={trn('g421.spec', watchers)}>👁 {trn('g421.spec', watchers)}</div>
        )}
        {s && (
          <PlayersRow count={s.players.length} activeIndex={s.players.findIndex((p) => p.id === currentId)}>
            {s.players.map((p) => (
              <PlayerCard key={p.id} p={p} meta={metaOf(p.id)} state={s}
                active={p.id === currentId}
                thinking={thinking === p.id}
                leader={st.leader === p.id} struggling={st.struggling === p.id}
                cardRef={(el) => { cardEls.current[p.id] = el; }}
                onOpen={pa && (metaOf(p.id)?.isMe || metaOf(p.id)?.account) ? () => setProfileOf({ username: metaOf(p.id)?.isMe ? null : metaOf(p.id)!.account! }) : undefined}
                order={s.roundOrder.includes(p.id) ? s.roundOrder.indexOf(p.id) + 1 : null} />
            ))}
          </PlayersRow>
        )}
        {s && <RoundTracker s={s} nameOf={nameOf} colorOf={(id) => metaOf(id)?.color} />}
      </div>

      <aside className={`side${historyOpen ? ' open' : ''}`} ref={sideRef}>
        <div className="side-head">
          <h3>{tr('g421.history')}</h3>
          <button className="icon-btn hide-desktop" onClick={() => setHistoryOpen(false)} aria-label={tr('common.close')}><Icon name="close" /></button>
        </div>
        <ol className="feed">
          {feed.map((it) => it.kind === 'roll' ? (
            <li key={it.seq} className="f-roll">
              <span className="f-name" style={{ color: metaOf(it.h.playerId)?.color }}>{nameOf(it.h.playerId)}</span>
              <span className="f-meta">{it.h.rolloff ? tr('g421.barrageLow') : `${it.h.throwIndex}/${it.h.throwLimit}`}</span>
              <DiceRow dice={it.h.dice} size={15} kept={it.h.kept} />
              <span className="f-combo">{trCombo(it.h.combo.label)}</span>
            </li>
          ) : (
            <li key={it.seq} className={`f-log ${it.l.kind}`}>{trServer(it.l.text)}</li>
          ))}
        </ol>
      </aside>

      {toast && <div key={toast.id} className={`toast ${toast.kind}`}>{toast.text}</div>}

      <div className={`actionbar v2${s && s.phase !== 'fini' ? (myTurn ? ' mine' : ' other') : ' idle'}`} ref={bottomRef}
        style={{ ['--pc' as string]: metaOf(currentId ?? '')?.color ?? '#8db4ff' }}>
        {s && s.phase !== 'fini' && (myTurn ? (
          <>
            <div className="ab-head">
              <span className="ab-who">
                <small className="your-turn">{tr('g421.yourTurn')}</small>
                {currentCombo && !animating
                  ? <b className="combo-label">{trCombo(currentCombo.label)}<span>{trn(s.config.variant === 'manches' ? 'g421.worthPts' : 'g421.worthTok', currentCombo.value)}</span></b>
                  : <b className="combo-label">{tr(animating ? 'g421.rolling' : 'g421.rollDice')}</b>}
              </span>
              <ThrowPips used={s.throwsUsed} limit={s.throwLimit} mine />
              {secondsLeft != null && turnSecs > 0 && (
                <span className={`ab-clock${secondsLeft <= 10 ? ' low' : ''}`} title={tr('g421.timeToPlay')}
                  style={{ ['--p' as string]: `${(100 * secondsLeft) / turnSecs}%` }}><span>{secondsLeft} s</span></span>
              )}
            </div>
            {currentCombo && !animating && (
              <div className="result">
                <div className="keep-row">
                  {s.dice.map((d, i) => (
                    <button key={i} className={`keep-die${keep[i] && canKeepNow ? ' on' : ''}`} disabled={!canKeepNow}
                      onClick={() => toggleDie(i)} title={canKeepNow ? tr(keep[i] ? 'g421.keptClick' : 'g421.clickKeep') : ''}>
                      <MiniDie value={d} size={40} />
                      {canKeepNow && <small>{tr(keep[i] ? 'g421.kept' : 'g421.rerolled')}</small>}
                    </button>
                  ))}
                </div>
                <WhatIf s={s} meId={controller.meId} />
              </div>
            )}
            <div className="buttons">
              {s.throwsUsed === 0 && (
                <button className="btn primary big ab-roll" disabled={pending} onClick={() => act('roll')}><Icon name="dice" /> {tr('g421.rollBtn')}</button>
              )}
              {s.throwsUsed > 0 && s.throwsUsed < s.throwLimit && (
                <button className="btn primary ab-roll" disabled={pending || rerollCount === 0} onClick={() => act('roll')}>
                  {rerollCount === 0 ? tr('g421.allKept') : rerollCount === 3 ? tr('g421.rerollAll') : tr('g421.reroll', { list: s.dice.filter((_, i) => !keep[i]).map((v) => tr('g421.rerollItem', { v })).join(` ${tr('g421.and')} `) })}
                </button>
              )}
              {s.throwsUsed > 0 && (
                <button className="btn ab-keep" disabled={pending} onClick={() => act('stop')}>✓ {s.throwsUsed < s.throwLimit ? <>{tr('g421.keep')}<span className="sr-only"> {tr('g421.validateSr')}</span></> : tr('g421.validate')}</button>
              )}
              {canThrowNow && <p className="hint">{canKeepNow ? tr('g421.hintKeep') : ''}{tr(settings.shake ? 'g421.hintSwipeShake' : 'g421.hintSwipe')}</p>}
            </div>
          </>
        ) : (
          <>
            <div className="ab-head">
              {currentId && <span className="ab-avatar"><Avatar photo={metaOf(currentId)?.photo} emoji={metaOf(currentId)?.avatar ?? '🎲'} size={50} color={metaOf(currentId)?.color} /></span>}
              <span className="ab-who">
                <small>{tr('g421.turnOf')}</small>
                <b>{nameOf(currentId ?? '')}</b>
                <span className="ab-line">{animating ? tr('g421.rollingLow') : thinking === currentId ? tr('g421.thinking') : currentCombo ? tr('g421.soFar', { c: trCombo(currentCombo.label) }) : tr('g421.willRoll')}{target ? ` · ${target}` : ''}</span>
              </span>
              <ThrowPips used={s.throwsUsed} limit={s.throwLimit} />
            </div>
            {secondsLeft != null && turnSecs > 0 && (
              <div className={`ab-timebar${secondsLeft <= 10 ? ' low' : ''}`} title={tr('g421.timeToPlay')}><i style={{ width: `${(100 * secondsLeft) / turnSecs}%` }} /><small>{secondsLeft} s</small></div>
            )}
          </>
        ))}
      </div>

      {s && myPlace != null && (() => {
        const o = (typeof early === 'function' ? early(s, myPlace) : null) ?? {};
        const quit = o.quit === undefined ? { label: tr('g421.cashOut'), run: () => { controller.leave(); onExit(); } } : o.quit;
        const title = o.title ?? tr('g421.finished', { p: placeLabel(myPlace) });
        const r = endReward?.reward;
        const gain = rewardStatus === 'pending' || rewardStatus === 'none' ? tr('g421.reward.pending')
          : rewardStatus === 'earlier' ? tr('g421.reward.earlier')
            : r && (r.xp || r.coins) ? `+${r.xp} XP · ${trn('g421.plusCoins', r.coins)}${endReward?.applied.bagsFound ? tr('g421.bagBonus') : ''}`
              : tr('g421.reward.none');
        const skip = controller.canSkipToEnd?.() ? <button className="btn small" onClick={() => controller.skipToEnd?.()} aria-label={tr('g421.seeResult')}>⏩ {tr('g421.result')}</button> : null;
        if (watching) return (
          <div className="skip-end early-mini" role="status">
            <span><b>{placeLabel(myPlace)}</b> · {gain}</span>
            {skip}
            {quit && <button className="btn primary small" onClick={quit.run}>{tr('g421.quit')}</button>}
          </div>
        );
        return (
          <div className="early-done" role="dialog" aria-label={title}>
            <div className="ed-head">
              <span className="ed-medal" aria-hidden>{myPlace <= 3 ? MEDALS[myPlace - 1] : '🎲'}</span>
              <div><b>{title}</b><small>{o.note ?? tr('g421.earlyNote')}</small></div>
            </div>
            <p className={`ed-gain${rewardStatus === 'done' && r && (r.xp || r.coins) ? ' ok' : ''}`}>{gain}</p>
            {endExtra}
            <div className="ed-buttons">
              {quit && <button className="btn primary" onClick={quit.run}>{quit.label}</button>}
              {o.alt && <button className="btn" onClick={o.alt.run}>{o.alt.label}</button>}
              <button className="btn" onClick={() => setWatching(true)}>{tr('g421.keepWatching')}</button>
            </div>
          </div>
        );
      })()}
      {s && s.phase !== 'fini' && myPlace == null && s.players.find((p) => p.id === controller.meId)?.out && controller.canSkipToEnd?.() && (
        <div className="skip-end">
          <span>{tr('g421.outOthers')}</span>
          <button className="btn primary small" onClick={() => controller.skipToEnd?.()}>⏩ {tr('g421.seeResult')}</button>
        </div>
      )}
      {s && s.phase === 'fini' && !animating && (
        <EndOverlay reward={endReward} state={s} meta={meta} meId={controller.meId} canRematch={controller.canRematch()}
          online={controller.mode === 'online'} onRematch={() => controller.rematch()} onExit={leave}
          exitLabel={tableExit?.label} note={tableExit?.note?.(s)} referral={pa?.isAccount ? pa.user?.username : undefined} extra={endExtra} />
      )}
      {/* Bulles et réactions : calque au-dessus de tout, à l'aplomb de la carte du joueur. */}
      <div className="float-layer" aria-live="polite">
        {Object.entries(speech).map(([id, text]) => {
          const r = cardEls.current[id]?.getBoundingClientRect();
          return r ? <div key={`s${id}${text}`} className="bubble" style={{ left: r.left + r.width / 2, top: r.top + 6 }}>{text}</div> : null;
        })}
        {Object.entries(emotes).map(([id, em]) => {
          const r = cardEls.current[id]?.getBoundingClientRect();
          return r ? <div key={em.k} className="emote-float" aria-label={tr('g421.reactionLow')} style={{ left: r.left + r.width / 2, top: r.bottom - 6 }}>{em.e}</div> : null;
        })}
      </div>
      {bigShot && (
        <div key={bigShot.id} className="bigshot" aria-live="assertive">
          {bigShot.fete && <Celebration id={bigShot.fete} />}
          <div className="bs-rays" />
          <div className="bs-text">{bigShot.text}</div>
          <div className="bs-who" style={{ color: metaOf(bigShot.who)?.color }}>{nameOf(bigShot.who)}</div>
        </div>
      )}
      {!s && <div className="loading">{tr('g421.preparing')}</div>}
      {profileOf && pa && <ProfileView pa={pa} username={profileOf.username} displayName={settings.name} avatar={settings.avatar} onClose={() => setProfileOf(null)} />}
      {rulesOpen && (
        <div className="modal" role="dialog" aria-label={tr('g421.rules')} onClick={(e) => { if (e.target === e.currentTarget) setRulesOpen(false); }}>
          <div className="modal-card">
            <header className="panel-head">
              <h2>{tr('g421.rules')}</h2>
              <button className="icon-btn" onClick={() => setRulesOpen(false)} aria-label={tr('common.close')}><Icon name="close" /></button>
            </header>
            <div className="modal-body"><RulesContent current={s?.config} /></div>
            <p className="muted small modal-foot">{tr(controller.turnDeadline() || s?.config.turnSeconds ? 'g421.keepOnTime' : 'g421.keepOn')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lancers du tour : un petit dé par lancer, blanc s'il reste à jouer. */
function ThrowPips({ used, limit, mine }: { used: number; limit: number; mine?: boolean }) {
  const left = limit - used;
  return (
    <span className="ab-throws throws" title={tr('g421.throws')}>
      <span>{Array.from({ length: limit }, (_, i) => <i key={i} className={i < used ? 'used' : ''} />)}</span>
      <small>{used === 0 ? trn('g421.nThrows', limit) : left > 0 ? trn(mine ? 'g421.nRerolls' : 'g421.nThrows', left) : tr('g421.lastThrow')}</small>
    </span>
  );
}

/** Rangée des joueurs : défile au doigt s'il y en a plus de trois, avec un indicateur de position. */
function PlayersRow({ count, activeIndex, children }: { count: number; activeIndex: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ pages: 1, at: 0 });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pages = Math.max(1, Math.ceil((el.scrollWidth - 2) / Math.max(1, el.clientWidth)));
    const max = el.scrollWidth - el.clientWidth;
    const at = max > 0 ? Math.round((el.scrollLeft / max) * (pages - 1)) : 0;
    setPos((p) => (p.pages === pages && p.at === at ? p : { pages, at }));
  }, []);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure, count]);
  // La carte du joueur actif reste visible : on fait défiler la rangée jusqu'à elle.
  useEffect(() => {
    const el = ref.current;
    const card = el?.children[activeIndex] as HTMLElement | undefined;
    if (!el || !card || el.scrollWidth <= el.clientWidth) return;
    const l = card.offsetLeft - el.offsetLeft, r = l + card.offsetWidth;
    if (l < el.scrollLeft) el.scrollTo({ left: l - 8, behavior: 'smooth' });
    else if (r > el.scrollLeft + el.clientWidth) el.scrollTo({ left: r - el.clientWidth + 8, behavior: 'smooth' });
  }, [activeIndex]);
  return (
    <>
      <div className={`players v2${count > 3 ? ' many' : ''}`} ref={ref} onScroll={measure}>{children}</div>
      {pos.pages > 1 && (
        <div className="players-dots" aria-hidden>
          {Array.from({ length: pos.pages }, (_, i) => <i key={i} className={i === pos.at ? 'on' : ''} />)}
        </div>
      )}
    </>
  );
}
