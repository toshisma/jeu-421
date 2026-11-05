import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FloatingPop } from './FloatingPop';
import { askConfirm } from './confirm';
import { Icon } from './Icon';
import { flyTokens } from './flyTokens';
import { isSuddenDeath } from '../../../shared/config';
import { albumKey, botTableRules, finalPlace } from '../../../shared/progress/profile';
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
}

const NO_KEEP = [false, false, false];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function GameScreen({ controller, settings, onSettings, onExit, personas, appearance, onGameEnd, onGameStart, pa, tableExit, bossId }: Props) {
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
    if (PHRASES.includes(e)) { sayRef.current(pid, e); sound.click(); return; }
    const k = Date.now() + Math.random();
    setEmotes((m) => ({ ...m, [pid]: { e, k } }));
    sound.click();
    setTimeout(() => setEmotes((m) => { if (m[pid]?.k !== k) return m; const n = { ...m }; delete n[pid]; return n; }), 2200);
  }), [controller]);
  const [bigShot, setBigShot] = useState<{ text: string; who: string; id: number; fete?: string } | null>(null);
  useEffect(() => { if (!bigShot) return; const t = setTimeout(() => setBigShot(null), 2400); return () => clearTimeout(t); }, [bigShot]);
  const [now, setNow] = useState(Date.now());
  const [endReward, setEndReward] = useState<EndReward | null>(null);
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
  const busy = useRef(false);

  const metaOf = useCallback((id: string) => {
    const m = meta.find((x) => x.id === id);
    return m && m.photo && pa?.isBlocked(m.account) ? { ...m, photo: null } : m;
  }, [meta, pa]);
  const nameOf = (id: string) => metaOf(id)?.name ?? shown?.players.find((p) => p.id === id)?.name ?? '?';
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
    const line = l > w ? `Encore toi ? ${l} à ${w} pour moi, je te rappelle.`
      : w > l ? `${w} à ${l} pour toi… mais ce soir, c'est ma tournée !`
        : `${w} partout entre nous. On se départage ?`;
    const t = setTimeout(() => say(m.id, line), 1400);
    return () => clearTimeout(t);
  }, [controller]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (ev.type === 'roll') {
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
          setBigShot({ text: ev.roll.combo.kind === '421' ? '4-2-1 !' : 'Trois as !', who: ev.roll.playerId, id: ev.roll.seq, fete });
          await wait(900);
        }
        const p = personas?.[ev.roll.playerId];
        if (p) say(ev.roll.playerId, reaction(p, ev.roll.combo, ev.roll.throwIndex >= ev.roll.throwLimit));
      } else if (ev.state.dice.some((d) => d > 0)) {
        tray.current?.showValues(ev.state.dice);
      }
      // Validation d'un tour (sans nouveau lancer)
      if (ev.type === 'state' && prev && ev.state.version > prev.version) {
        sound.validate();
        const who = currentPlayerId(prev);
        const p = who ? personas?.[who] : undefined;
        if (p && who && ev.state.results[who]) say(who, reaction(p, ev.state.results[who].combo, true));
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
        setToast({ text: sum.text, kind: sum.barrage ? 'barrage' : 'round', id: sum.seq });
        if (!sum.barrage && sum.amount > 0) sound.chips(sum.amount);
        // Les jetons passent du pot (charge) ou du gagnant (décharge) au perdant.
        if (!sum.barrage && sum.amount > 0 && sum.loserId && ev.state.config.variant !== 'manches') {
          const from = sum.phase === 'charge' ? document.querySelector('.tracker') : sum.winnerId ? cardEls.current[sum.winnerId] : null;
          flyTokens(from, cardEls.current[sum.loserId], sum.amount);
        }
        await wait(ev.state.phase === 'fini' ? 600 : 1500);
      }
      if (prev && prev.phase !== 'fini' && ev.state.phase === 'fini') {
        const me = controller.meId;
        if (onGameStartRef.current) setPresence('menu'); // partie solo terminée : plus « en cours »
        if (ev.state.ranking[0] === me) sound.win();
        else if (ev.state.loserId === me || ev.state.ranking[ev.state.ranking.length - 1] === me) sound.lose();
        else sound.win();
        const bots = controller.getMeta().filter((m) => m.isBot);
        // En ligne avec des ordinateurs : mêmes règles que le serveur (barème du solo, hors classement).
        const botRules = controller.mode === 'online' ? botTableRules(controller.getMeta().length - bots.length, bots.map((b) => b.difficulty ?? 'normal')) : { mode: controller.mode };
        void Promise.resolve(onGameEndRef.current?.(ev.state, {
          ...botRules,
          opponents: ev.state.players.length - 1,
          difficulty: bots[0]?.difficulty,
          count421: count421.current,
          combos: { ...combos.current },
          gestureThrows: gestureThrows.current,
          rounds: ev.state.round,
          roundsLost: ev.state.config.variant === 'manches' ? undefined : roundsLost.current,
          maxTokens: maxTokens.current,
          suddenDeath: isSuddenDeath(ev.state.config),
          comboKeys: [...albumKeys.current],
          best: bestRoll.current ?? undefined,
          opponentNames: controller.getMeta().filter((m) => m.id !== controller.meId).map((m) => m.name),
          hour: new Date().getHours(),
          boss: bossId,
          place: finalPlace(ev.state, me),
          minutes: (Date.now() - startedAt.current) / 60000,
          now: Date.now(),
        })).then((r) => setEndReward(r ?? null));
      }
    }
    busy.current = false;
    setAnimating(false);
    controller.notifyIdle();
  }, [controller, personas, say]);

  useEffect(() => {
    const offE = controller.subscribeEvents((e) => { queue.current.push(e); void pump(); });
    const offM = controller.subscribeMeta(() => { setMeta([...controller.getMeta()]); setThinking(controller.thinkingId()); });
    return () => { offE(); offM(); };
  }, [controller, pump]);

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
    const err = kind === 'roll' ? await controller.roll(s.throwsUsed === 0 ? NO_KEEP : keep, s.version, gesture) : await controller.stop(s.version);
    setPending(false);
    if (err) setToast({ text: err, kind: 'error', id: Date.now() });
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
      const side = sideRef.current;
      const sideVisible = !!side && getComputedStyle(side).position !== 'fixed';
      setInsets({
        top: (topRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
        bottom: window.innerHeight - (bottomRef.current?.getBoundingClientRect().top ?? window.innerHeight) + 4,
        right: sideVisible ? side!.getBoundingClientRect().width + 12 : 0,
        left: 0,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    [topRef, bottomRef, sideRef].forEach((r) => r.current && ro.observe(r.current));
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
  const leave = async () => {
    if (s && s.phase !== 'fini' && !tableExit && !(await askConfirm('Quitter la partie en cours ?', 'Quitter'))) return;
    controller.leave();
    onExit();
  };

  const phaseLabel = !s ? '' : s.isRolloff ? 'Barrage'
    : s.phase === 'charge' ? `Charge, ${s.pot} jeton${s.pot > 1 ? 's' : ''} au pot`
      : s.phase === 'decharge' ? 'Décharge'
        : s.phase === 'manche' ? `Manche ${s.round}/${s.config.rounds}` : 'Partie terminée';
  const currentCombo = s && s.throwsUsed > 0 ? evaluate(s.dice, s.config.values) : null;
  // Ce que le joueur actif doit battre (la plus mauvaise main de la manche), ou le meilleur coup aux points.
  const target = useMemo(() => {
    if (!s || s.phase === 'fini' || !currentId) return null;
    const rs = roundStatus(s);
    if (rs.points) return rs.best ? `meilleur : ${rs.best.combo.label}` : null;
    if (rs.worst && !rs.worst.ids.includes(currentId)) return `doit battre ${rs.addition ? `total ${rs.worst.combo.dice.reduce((x, y) => x + y, 0)}` : rs.worst.combo.label}`;
    return null;
  }, [s, currentId]);

  return (
    <div className="game" onPointerDown={() => { sound.unlock(); if (settings.shake && needsMotionPermission()) void requestMotionPermission(); }}>
      <DiceTray ref={tray} appearance={appearance} quality={settings.quality} insets={insets} onDieClick={toggleDie} onSwipe={onGestureThrow} cup={settings.cup} />
      <div className="vignette" />

      <div className="top" ref={topRef}>
        <div className="topbar">
          <button className="icon-btn" onClick={leave} aria-label="Quitter la partie"><Icon name="back" /></button>
          <div className="phase">
            <span className={`logo-mini${bigShot ? " neon" : ""}`}>421</span>
            <span>{phaseLabel}</span>
            {s && s.phase !== 'manche' && s.phase !== 'fini' && <span className="muted">manche {s.round}</span>}
          </div>
          <div className="top-actions">
            <button className="icon-btn hide-desktop" onClick={() => setHistoryOpen((o) => !o)} aria-label="Historique"><Icon name="history" /></button>
            {!spectator && <div className="emote-wrap" ref={emoteRef}>
              <button className="icon-btn" aria-label="Réagir" onClick={() => setEmoteOpen((o) => !o)}><Icon name="react" /></button>
              {emoteOpen && (
                <FloatingPop anchor={emoteRef} onClose={closeEmote} className="emote-pop" label="Réactions">
                  <div className="emote-grid">
                    {EMOTES.map((e) => <button key={e} onClick={() => { controller.sendEmote(e); setEmoteOpen(false); }}>{e}</button>)}
                  </div>
                  <div className="phrase-list">
                    {PHRASES.map((p) => <button key={p} onClick={() => { controller.sendEmote(p); setEmoteOpen(false); }}>{p}</button>)}
                  </div>
                </FloatingPop>
              )}
            </div>}
            <button className="icon-btn" onClick={() => setRulesOpen(true)} aria-label="Règles du jeu"><Icon name="rules" /></button>
            <VolumeControl settings={settings} onSettings={onSettings} />
          </div>
        </div>
        {spectator ? (
          <div className="spectate-banner" role="status">
            <span>👁 Vous regardez la partie{watchers > 1 ? ` (${watchers} spectateurs)` : ''}</span>
            {controller.watchLink && <button className="icon-btn small" aria-label="Copier le lien pour regarder" title="Copier le lien pour regarder"
              onClick={() => { const l = controller.watchLink!(); navigator.clipboard?.writeText(l).then(() => setToast({ text: 'Lien copié : envoyez-le pour faire regarder la partie.', kind: 'round', id: Date.now() }), () => window.prompt('Copiez :', l)); }}>
              <Icon name="share" size={18} /></button>}
            <button className="btn small primary" onClick={leave}>Quitter</button>
          </div>
        ) : watchers > 0 && (
          <div className="spectators-count" aria-label={`${watchers} spectateur${watchers > 1 ? 's' : ''}`}>👁 {watchers} spectateur{watchers > 1 ? 's' : ''}</div>
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
          <h3>Historique</h3>
          <button className="icon-btn hide-desktop" onClick={() => setHistoryOpen(false)} aria-label="Fermer"><Icon name="close" /></button>
        </div>
        <ol className="feed">
          {feed.map((it) => it.kind === 'roll' ? (
            <li key={it.seq} className="f-roll">
              <span className="f-name" style={{ color: metaOf(it.h.playerId)?.color }}>{nameOf(it.h.playerId)}</span>
              <span className="f-meta">{it.h.rolloff ? 'barrage' : `${it.h.throwIndex}/${it.h.throwLimit}`}</span>
              <DiceRow dice={it.h.dice} size={15} kept={it.h.kept} />
              <span className="f-combo">{it.h.combo.label}</span>
            </li>
          ) : (
            <li key={it.seq} className={`f-log ${it.l.kind}`}>{it.l.text}</li>
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
                <small className="your-turn">À vous de jouer</small>
                {currentCombo && !animating
                  ? <b className="combo-label">{currentCombo.label}<span>vaut {currentCombo.value} {s.config.variant === 'manches' ? 'point' : 'jeton'}{currentCombo.value > 1 ? 's' : ''}</span></b>
                  : <b className="combo-label">{animating ? 'Les dés roulent…' : 'Lancez les dés !'}</b>}
              </span>
              <ThrowPips used={s.throwsUsed} limit={s.throwLimit} mine />
              {secondsLeft != null && turnSecs > 0 && (
                <span className={`ab-clock${secondsLeft <= 10 ? ' low' : ''}`} title="Temps pour jouer"
                  style={{ ['--p' as string]: `${(100 * secondsLeft) / turnSecs}%` }}><span>{secondsLeft} s</span></span>
              )}
            </div>
            {currentCombo && !animating && (
              <div className="result">
                <div className="keep-row">
                  {s.dice.map((d, i) => (
                    <button key={i} className={`keep-die${keep[i] && canKeepNow ? ' on' : ''}`} disabled={!canKeepNow}
                      onClick={() => toggleDie(i)} title={canKeepNow ? (keep[i] ? 'Conservé : cliquer pour relancer' : 'Cliquer pour conserver') : ''}>
                      <MiniDie value={d} size={40} />
                      {canKeepNow && <small>{keep[i] ? 'gardé' : 'relancé'}</small>}
                    </button>
                  ))}
                </div>
                <WhatIf s={s} meId={controller.meId} />
              </div>
            )}
            <div className="buttons">
              {s.throwsUsed === 0 && (
                <button className="btn primary big ab-roll" disabled={pending} onClick={() => act('roll')}><Icon name="dice" /> Lancer les dés</button>
              )}
              {s.throwsUsed > 0 && s.throwsUsed < s.throwLimit && (
                <button className="btn primary ab-roll" disabled={pending || rerollCount === 0} onClick={() => act('roll')}>
                  {rerollCount === 0 ? 'Tout est gardé' : rerollCount === 3 ? 'Relancer les dés (3)' : `Relancer ${s.dice.filter((_, i) => !keep[i]).map((v) => `le ${v}`).join(' et ')}`}
                </button>
              )}
              {s.throwsUsed > 0 && (
                <button className="btn ab-keep" disabled={pending} onClick={() => act('stop')}>✓ {s.throwsUsed < s.throwLimit ? <>Garder<span className="sr-only"> : valider mon tour</span></> : 'Valider mon tour'}</button>
              )}
              {canThrowNow && <p className="hint">{canKeepNow ? 'Touchez un dé pour le garder · ' : ''}Glissez sur le bac{settings.shake ? ' ou secouez le téléphone' : ''} pour lancer</p>}
            </div>
          </>
        ) : (
          <>
            <div className="ab-head">
              {currentId && <span className="ab-avatar"><Avatar photo={metaOf(currentId)?.photo} emoji={metaOf(currentId)?.avatar ?? '🎲'} size={50} color={metaOf(currentId)?.color} /></span>}
              <span className="ab-who">
                <small>Au tour de</small>
                <b>{nameOf(currentId ?? '')}</b>
                <span className="ab-line">{animating ? 'les dés roulent…' : thinking === currentId ? 'réfléchit…' : currentCombo ? `${currentCombo.label} pour l'instant` : 'va lancer'}{target ? ` · ${target}` : ''}</span>
              </span>
              <ThrowPips used={s.throwsUsed} limit={s.throwLimit} />
            </div>
            {secondsLeft != null && turnSecs > 0 && (
              <div className={`ab-timebar${secondsLeft <= 10 ? ' low' : ''}`} title="Temps pour jouer"><i style={{ width: `${(100 * secondsLeft) / turnSecs}%` }} /><small>{secondsLeft} s</small></div>
            )}
          </>
        ))}
      </div>

      {s && s.phase !== 'fini' && s.players.find((p) => p.id === controller.meId)?.out && controller.canSkipToEnd?.() && (
        <div className="skip-end">
          <span>Vous êtes sorti : les autres finissent la partie.</span>
          <button className="btn primary small" onClick={() => controller.skipToEnd?.()}>⏩ Voir le résultat</button>
        </div>
      )}
      {s && s.phase === 'fini' && !animating && (
        <EndOverlay reward={endReward} state={s} meta={meta} meId={controller.meId} canRematch={controller.canRematch()}
          online={controller.mode === 'online'} onRematch={() => controller.rematch()} onExit={leave}
          exitLabel={tableExit?.label} note={tableExit?.note?.(s)} referral={pa?.isAccount ? pa.user?.username : undefined} />
      )}
      {/* Bulles et réactions : calque au-dessus de tout, à l'aplomb de la carte du joueur. */}
      <div className="float-layer" aria-live="polite">
        {Object.entries(speech).map(([id, text]) => {
          const r = cardEls.current[id]?.getBoundingClientRect();
          return r ? <div key={`s${id}${text}`} className="bubble" style={{ left: r.left + r.width / 2, top: r.bottom + 8 }}>{text}</div> : null;
        })}
        {Object.entries(emotes).map(([id, em]) => {
          const r = cardEls.current[id]?.getBoundingClientRect();
          return r ? <div key={em.k} className="emote-float" aria-label="réaction" style={{ left: r.left + r.width / 2, top: r.bottom - 6 }}>{em.e}</div> : null;
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
      {!s && <div className="loading">Préparation de la table…</div>}
      {profileOf && pa && <ProfileView pa={pa} username={profileOf.username} displayName={settings.name} avatar={settings.avatar} onClose={() => setProfileOf(null)} />}
      {rulesOpen && (
        <div className="modal" role="dialog" aria-label="Règles du jeu" onClick={(e) => { if (e.target === e.currentTarget) setRulesOpen(false); }}>
          <div className="modal-card">
            <header className="panel-head">
              <h2>Règles du jeu</h2>
              <button className="icon-btn" onClick={() => setRulesOpen(false)} aria-label="Fermer"><Icon name="close" /></button>
            </header>
            <div className="modal-body"><RulesContent current={s?.config} /></div>
            <p className="muted small modal-foot">La partie continue pendant la lecture{controller.turnDeadline() || s?.config.turnSeconds ? ' : surveillez le temps de jeu' : ''}.</p>
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
    <span className="ab-throws throws" title="Lancers">
      <span>{Array.from({ length: limit }, (_, i) => <i key={i} className={i < used ? 'used' : ''} />)}</span>
      <small>{used === 0 ? `${limit} lancer${limit > 1 ? 's' : ''}` : left > 0 ? `${left} ${mine ? 'relance' : 'lancer'}${left > 1 ? 's' : ''}` : 'dernier lancer'}</small>
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
