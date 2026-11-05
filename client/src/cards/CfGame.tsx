/**
 * Coups Fourrés : l'écran de partie (refait le 5 novembre d'après les prototypes CFN validés par Sam :
 * CFNTourAdverse, CFNVotreTour, CFNRiposte, CFNPiege, CFNFiche).
 *
 * Haut : quitter, titre, journal, tchat (en ligne), aide, son ; la frise de la manche ; l'adversaire
 * (jetons, Tournées, cartes en main, pièges cachés bien visibles, Habitués touchables).
 * Centre : LE bandeau (une seule voix : ce qui se passe maintenant, ou ce que vous devez faire) et le
 * bac 3D du jeu de base (dés animés, garder au toucher). Le bandeau change en même temps que les dés :
 * « Bébert garde 1-4 et relance 1 dé » pendant le lancer, « Bébert : 4-2-1 en 2 lancers » une fois
 * les dés posés. Rien d'autre n'est écrit sur le bac (la mise en scène du 4-2-1 passe seule).
 * Bas : « N cartes jouables maintenant », la main (cartes jouables dorées, avec leur raison ; grisée
 * et sans étiquettes pendant le tour adverse), ma barre (jetons, Tournées, pastilles d'Habitués et de
 * pièges, ardoise), les actions (seulement quand c'est à moi).
 * Les grandes actions adverses (carte jouée, piège posé ou déclenché) sont annoncées au centre, une par
 * une (touchez pour passer) ; les pièges et annulations qui vous frappent demandent « Compris ».
 *
 * Ne dépend que de CfController : contre l'ordinateur (local.ts), en ligne (online.ts) et la partie
 * guidée (tutorial.ts) passent par le même écran.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CF_RULES } from '../../../shared/cards/catalog';
import type { CfAction, CfEvent, CfView } from '../../../shared/cards/engine';
import type { ProfileApi } from '../account/useProfile';
import type { Settings } from '../settings';
import { sound } from '../audio/sound';
import { setPresence } from '../presence';
import { askConfirm } from '../ui/confirm';
import { Icon } from '../ui/Icon';
import { VolumeControl } from '../ui/VolumeControl';
import { DiceTray, type DiceTrayHandle } from '../ui/DiceTray';
import { flyTokens } from '../ui/flyTokens';
import { Sheet } from '../ui/kit';
import type { CfController, CfSnapshot } from './controller';
import type { CfOnline } from './online';
import { CfChatButton } from './CfChat';
import { isBigShot, nameIn, plural, rerollLabel } from './describe';
import { RulesContent } from './CfInfo';
import { Pip } from './cfui';
import { MomentTracker, makeShareImage, shareImage, type ShareMoment } from './share';
import { TypeIcon } from './cardTypes';
import { decisionBanner, friseSteps, handHints, keepAfter, planEvents, type Announce } from './board';
import {
  AnnounceView, ChoiceWindow, EndScreen, Fiche, Frise, Glasses, HabPin, Hand, HelpSheet, Journal, Mulligan, OppPanel, RespondPanel, Tokens,
  TrapSheet, type FicheTarget, type LogLine,
} from './BoardParts';

export { EndScreen, Mulligan, ChoiceWindow, RespondPanel } from './BoardParts';

interface Props {
  controller: CfController;
  /** Mode affiché en haut : « classée », « entre amis »… */
  mode: string;
  settings: Settings;
  onSettings: (s: Settings) => void;
  pa: ProfileApi;
  onExit: () => void;
  onAgain?: () => void;
  onAccount: () => void;
  /** Session en ligne (tchat de table, réactions), pour une partie en ligne. */
  online?: CfOnline | null;
}

const NO_KEEP = [false, false, false];
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let rollSeed = 1;
const nextSeed = () => (rollSeed = (Math.imul(rollSeed, 1664525) + 1013904223) >>> 0);

export function CfGame({ controller, mode, settings, onSettings, pa, onExit, onAgain, onAccount, online }: Props) {
  const tray = useRef<DiceTrayHandle>(null);
  const [snap, setSnap] = useState<CfSnapshot | null>(null);
  const spectator = !!(controller as { spectator?: boolean }).spectator;
  // Spectateur : on regarde la partie du point de vue du premier joueur (sans voir sa main).
  const me = snap && !snap.view.players.some((p) => p.id === controller.me) ? snap.view.players[0]?.id ?? controller.me : controller.me;
  const meRef = useRef(me);
  meRef.current = me;
  const snapRef = useRef<CfSnapshot | null>(null);
  const [animating, setAnimating] = useState(false);
  const queue = useRef<{ snap: CfSnapshot; events: CfEvent[] }[]>([]);
  const busy = useRef(false);
  const alive = useRef(true);
  const [keep, setKeep] = useState<boolean[]>(NO_KEEP);
  const [pending, setPending] = useState(false);
  const [ann, setAnn] = useState<Announce | null>(null);
  const annView = useRef<CfView | null>(null);
  const annDone = useRef<(() => void) | null>(null);
  const annTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** La voix du bandeau pendant les animations (null : l'état de la partie parle). */
  const [voice, setVoice] = useState<Announce | null>(null);
  const [stage, setStage] = useState<'comptes' | null>(null);
  // Jetons affichés : mis à jour dès que les jetons arrivent sur la pile (aux comptes), sans attendre le tour suivant.
  const [tokNow, setTokNow] = useState<Record<string, number> | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const logKey = useRef(0);
  const logRound = useRef<number | null>(null);
  const [fiche, setFiche] = useState<FicheTarget | null>(null);
  const [trapOf, setTrapOf] = useState<string | null>(null);
  const [journal, setJournal] = useState(false);
  const [help, setHelp] = useState(false);
  const [rules, setRules] = useState(false);
  const [josiane, setJosiane] = useState(false);
  const [bigShot, setBigShot] = useState<{ text: string; who: string; key: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const tokRefs = useRef<Record<string, HTMLElement | null>>({});
  const trayDice = useRef<{ owner: string | null; dice: number[] }>({ owner: null, dice: [0, 0, 0] });
  // Moments forts à partager (4-2-1, retournement de veste, nénette, riposte décisive, victoire).
  const moments = useRef(new MomentTracker(controller.me));
  const [moment, setMoment] = useState<ShareMoment | null>(null);
  const [sharing, setSharing] = useState(false);
  const share = useCallback(async (m: ShareMoment) => {
    if (sharing) return;
    setSharing(true);
    try { const r = await shareImage(await makeShareImage(m), m.text); if (r === 'telechargement') setNotice({ key: Date.now(), text: 'Image enregistrée : partagez-la où vous voulez !' }); }
    catch (e) { setToast({ text: e instanceof Error ? e.message : 'Partage impossible.', key: Date.now() }); }
    finally { setSharing(false); }
  }, [sharing]);
  useEffect(() => { if (!moment) return; const t = setTimeout(() => setMoment(null), 12000); return () => clearTimeout(t); }, [moment]);

  useEffect(() => {
    alive.current = true;
    setPresence(controller.kind === 'bot' ? 'solo' : 'online');
    return () => { alive.current = false; annDone.current?.(); setPresence('menu'); };
  }, [controller]);
  // Message de départ du contrôleur (partie d'essai, non récompensée…).
  useEffect(() => {
    const n = (controller as { notice?: string | null }).notice;
    if (n) setTimeout(() => { if (alive.current) setNotice({ key: Date.now(), text: n }); }, 600);
  }, [controller]);
  // Avis du serveur (joueur déconnecté, action automatique…) et réactions.
  const seenNotices = useRef(0);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!online) return;
    return online.onChange(() => {
      const n = (controller as { notices?: string[] }).notices ?? [];
      if (n.length > seenNotices.current) setNotice({ key: Date.now(), text: n[n.length - 1] });
      seenNotices.current = n.length;
      bump((x) => x + 1);
    });
  }, [online, controller]);
  const [emotes, setEmotes] = useState<Record<string, { e: string; k: number }>>({});
  useEffect(() => {
    const c = controller as { onEmote?: (cb: (pid: string, e: string) => void) => () => void };
    if (!c.onEmote) return;
    return c.onEmote((pid, e) => {
      const k = Date.now() + Math.random();
      setEmotes((m) => ({ ...m, [pid]: { e, k } }));
      sound.click();
      setTimeout(() => setEmotes((m) => { if (m[pid]?.k !== k) return m; const n = { ...m }; delete n[pid]; return n; }), 2600);
    });
  }, [controller]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 3600); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { if (!bigShot) return; const t = setTimeout(() => setBigShot(null), 2300); return () => clearTimeout(t); }, [bigShot]); // filet : la file l'efface elle-même

  // ----------------------------------------------------------------------------------------------
  // File d'annonces : chaque mise à jour est jouée (dés, annonces une par une) avant d'afficher l'état suivant.
  const showAnn = useCallback((a: Announce, view: CfView) => new Promise<void>((resolve) => {
    if (!alive.current) { resolve(); return; }
    annView.current = view;
    annDone.current = () => { annDone.current = null; if (annTimer.current) clearTimeout(annTimer.current); if (alive.current) setAnn(null); resolve(); };
    setAnn(a);
    if (!a.block || spectator) annTimer.current = setTimeout(() => annDone.current?.(), reduced() ? Math.min(a.ms, 2000) : a.ms);
  }), [spectator]);
  const skipAnn = useCallback(() => annDone.current?.(), []);

  const rollTray = useCallback(async (player: string, dice: number[], keepMask: boolean[], prev: number[]) => {
    const t = tray.current;
    if (!t) return;
    t.setInteractive(false);
    // Pas de setKept(NO_KEEP) ici : les dés gardés sont déjà au bord, le lancer part tout de suite
    // (les ramener au centre puis les reposer au bord coûtait jusqu'à 0,5 s avant chaque relance).
    if (trayDice.current.owner !== player && prev.some((x) => x > 0) && keepMask.some(Boolean)) t.showValues(prev);
    const big = isBigShot(dice) && !keepMask.every(Boolean) ? isBigShot(dice) : null;
    await t.roll(dice, keepMask, nextSeed(), undefined, !!big);
    trayDice.current = { owner: player, dice: [...dice] };
    if (big) {
      sound.jackpot();
      t.celebrate(null);
      // La plaque passe seule : le bandeau se tait pendant ce temps (aucun texte dessous).
      setBigShot({ text: big === '421' ? '4-2-1 !' : 'Trois as !', who: player, key: Date.now() });
      await wait(1600);
      if (alive.current) setBigShot(null);
    }
  }, []);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAnimating(true);
    controller.screen?.(true);
    while (queue.current.length && alive.current) {
      const item = queue.current.shift()!;
      const prev = snapRef.current;
      const viewer = spectator ? '' : meRef.current;
      if (logRound.current === null) logRound.current = prev?.view.round ?? item.snap.view.round;
      const lines: LogLine[] = [];
      for (const e of item.events) {
        if (e.kind === 'manche') logRound.current = (logRound.current ?? 0) + 1;
        if (e.kind !== 'tour' && e.kind !== 'pioche') lines.push({ key: ++logKey.current, round: Math.max(1, logRound.current ?? 1), ev: e });
        if (!spectator && !(controller as { tutorial?: boolean }).tutorial) {
          const m = moments.current.feed(e, item.snap.view);
          if (m && m.kind !== 'victoire') setMoment(m);
        }
      }
      if (lines.length) setLog((l) => [...l, ...lines].slice(-300));
      let steps = planEvents(item.events, viewer, item.snap.view, prev?.view ?? null);
      // En ligne, c'est à moi de riposter et le temps est compté : la fenêtre de riposte montre déjà la carte
      // adverse en grand, donc pas de grande annonce avant (elle mangeait la moitié du temps de réponse).
      const w = item.snap.responseWindow;
      if (!spectator && w && w.player === controller.me && item.snap.legal.some((a) => a.type === 'play')) {
        const last = steps[steps.length - 1];
        if (last && last.kind === 'ann' && last.ann.style !== 'comptes') steps = steps.slice(0, -1);
      }
      for (const [si, st] of steps.entries()) {
        if (!alive.current) break;
        // Dernière annonce de la mise à jour : l'état nouveau s'affiche derrière (le piège posé apparaît devant l'adversaire).
        if (si === steps.length - 1 && st.kind === 'ann' && st.ann.style !== 'strip') { snapRef.current = item.snap; setSnap(item.snap); }
        if (st.kind === 'dice') {
          const e = st.ev;
          const before = prev?.view.players.find((p) => p.id === e.player)?.r.dice ?? [0, 0, 0];
          const moved = e.kind === 'lancer' ? [0, 1, 2].filter((i) => !e.kept?.[i]) : e.rolled ?? e.dice!.map((x, i) => (x !== before[i] ? i : -1)).filter((i) => i >= 0);
          const keepMask = [0, 1, 2].map((i) => !moved.includes(i));
          // Mes dés gardés : la sélection suit le moteur (Croche-patte libère un dé, Les yeux qui piquent
          // les libère tous) ; un dé relancé par une carte n'est plus gardé.
          if (!spectator) setKeep((k) => keepAfter(k, e, meRef.current));
          if (st.strip) setVoice(st.strip);
          const t0 = Date.now();
          if (moved.length) await rollTray(e.player!, e.dice!, keepMask, trayDice.current.owner === e.player ? trayDice.current.dice : before);
          if (st.strip?.ms) await wait(Math.max(0, Math.min(st.strip.ms, 1400) - (Date.now() - t0)));
          if (!alive.current) break;
          // Le résultat ne s'écrit qu'une fois les dés posés (vraies valeurs). S'il reste des étapes,
          // on le laisse lire un instant ; sinon il reste affiché jusqu'au coup suivant.
          if (st.after) {
            setVoice(st.after);
            if (si < steps.length - 1 || queue.current.length) await wait(reduced() ? 500 : st.after.ms);
          }
          continue;
        }
        const a = st.ann;
        if (a.style === 'strip') {
          setVoice(a);
          await wait(reduced() ? Math.min(a.ms, 900) : a.ms);
          continue;
        }
        // Grande annonce au centre : le bandeau revient à l'état de la partie (pas deux voix).
        setVoice(null);
        if (a.style === 'comptes') {
          setStage('comptes');
          const lr = item.snap.view.lastRound;
          if (lr && lr.amount > 0 && lr.winner && lr.loser) {
            sound.chips(Math.min(8, lr.amount));
            const [from, to] = lr.reversed ? [lr.loser, lr.winner] : [lr.winner, lr.loser];
            setTimeout(() => flyTokens(tokRefs.current[from], tokRefs.current[to], lr.amount), 350);
          }
          // Les piles gardent l'ancien compte pendant le vol, puis passent au nouveau à l'atterrissage.
          if (prev) setTokNow(Object.fromEntries(prev.view.players.map((p) => [p.id, p.tokens])));
          const after = Object.fromEntries(item.snap.view.players.map((p) => [p.id, p.tokens]));
          const flyMs = lr && lr.amount > 0 ? 350 + 820 + Math.min(12, lr.amount) * 75 : 0;
          setTimeout(() => { if (alive.current) setTokNow(after); }, reduced() ? 0 : flyMs);
          await showAnn(a, item.snap.view);
          continue;
        }
        if (a.style === 'reveal') sound.party('thunder', 0.7);
        else if (a.style === 'trap') sound.click();
        else sound.party('pop', 0.5);
        await showAnn(a, item.snap.view);
      }
      snapRef.current = item.snap;
      setSnap(item.snap);
      setTokNow(null);
      setStage(null);
    }
    busy.current = false;
    if (alive.current) { setAnimating(false); setVoice(null); }
    controller.screen?.(false);
  }, [rollTray, showAnn, spectator, controller]);

  useEffect(() => controller.subscribe((s, events) => { queue.current.push({ snap: s, events }); void pump(); }), [controller, pump]);

  // ----------------------------------------------------------------------------------------------
  const v = useMemo(() => {
    const raw = snap?.view ?? null;
    if (!raw || !tokNow) return raw;
    return { ...raw, players: raw.players.map((p) => (p.id in tokNow ? { ...p, tokens: tokNow[p.id] } : p)) };
  }, [snap, tokNow]);
  const legal = useMemo(() => (snap && !animating ? snap.legal : []), [snap, animating]);
  const mine = legal.length > 0 && !pending && !spectator;
  const meP = v ? v.players.find((p) => p.id === me) ?? null : null;
  const decision = v?.decision ?? null;
  // Partie guidée : bulle de l'étape (après les animations) et zone mise en avant. Les actions possibles
  // sont déjà réduites à celle attendue par le contrôleur.
  const guide = !animating ? snap?.guide ?? null : null;
  const isTuto = !!(controller as { tutorial?: boolean }).tutorial;
  const focus = guide?.focus ?? null;
  const fx = (k: string) => (focus === k ? ' cfn-focus' : '');
  const myTurn = mine && decision === 'turn';
  const canKeep = myTurn && !!meP && meP.r.throwsUsed > 0 && legal.some((a) => a.type === 'roll');
  // Comme au 421 classique : les dés gardés le restent d'un lancer à l'autre (on peut toujours les
  // relâcher) ; la sélection repart à zéro seulement quand le tour change.
  const turnKey = v ? `${v.round}|${v.order[v.turn]}|${(meP?.r.throwsUsed ?? 0) === 0 ? 'new' : 'on'}|${v.phase}` : '';
  useEffect(() => { setKeep(NO_KEEP); }, [turnKey]);
  useEffect(() => { if (!mine) setJosiane(false); }, [mine]);
  useEffect(() => { if (mine && ((decision === 'turn' && meP?.r.throwsUsed === 0) || decision === 'respond' || decision === 'lastword')) sound.turn(); }, [mine, decision]); // eslint-disable-line react-hooks/exhaustive-deps
  // L'écran a fini d'animer : le minuteur de la décision peut partir.
  useEffect(() => { if (!animating && snap && snap.legal.length) controller.ready?.(); }, [animating, snap, controller]);
  // La fiche d'une carte de la main se ferme si la carte n'y est plus.
  useEffect(() => { if (fiche?.uid && !fiche.owner && !fiche.trapUid && !meP?.hand?.some((k) => k.uid === fiche.uid)) setFiche(null); }, [meP, fiche]);

  // Fenêtre de réponse sans aucune carte jouable (en ligne, toutes les fenêtres durent pareil) : on passe tout seul.
  const onlyPass = mine && (decision === 'respond' || decision === 'lastword') && legal.length === 1 && legal[0].type === 'pass';
  useEffect(() => { if (onlyPass) { const t = setTimeout(() => void controller.act({ type: 'pass' }), 350); return () => clearTimeout(t); } }, [onlyPass, controller, snap]);

  // Bac : montrer mes dés pendant mon tour, garder au toucher.
  useEffect(() => {
    if (animating) return;
    const t = tray.current;
    if (!t || !v || !meP) return;
    const turnId = v.phase === 'turn' ? v.order[v.turn] : null;
    const shown = turnId ? v.players.find((p) => p.id === turnId) : null;
    if (shown && shown.r.throwsUsed > 0 && trayDice.current.owner !== shown.id) { t.showValues(shown.r.dice); trayDice.current = { owner: shown.id, dice: [...shown.r.dice] }; }
    t.setKept(canKeep ? keep : NO_KEEP);
    t.setInteractive((canKeep || josiane) && turnId === me);
  }, [keep, canKeep, animating, josiane, meP, v, me]);

  const act = useCallback(async (a: CfAction) => {
    if (pending) return;
    sound.unlock();
    setPending(true);
    const err = await controller.act(a);
    if (!alive.current) return;
    setPending(false);
    setFiche(null); setJosiane(false);
    if (err) setToast({ text: err, key: Date.now() });
  }, [controller, pending]);

  const onDie = useCallback((i: number) => {
    if (josiane) {
      const j = legal.find((a) => a.type === 'josiane' && a.die === i);
      if (j) void act(j);
      return;
    }
    if (!canKeep) return;
    sound.click();
    setKeep((k) => k.map((x, j) => (j === i ? !x : x)));
  }, [josiane, legal, act, canKeep]);

  const roll = () => {
    if (!meP) return;
    const k = meP.r.throwsUsed === 0 ? NO_KEEP : keep;
    const a = legal.find((x) => x.type === 'roll' && x.keep.every((b, i) => b === k[i]));
    if (a) void act(a);
    else if (isTuto) setToast({ text: 'Gardez exactement les dés indiqués dans la bulle.', key: Date.now() });
  };

  const discardNow = mine && decision === 'discard';
  const hand_ = useMemo(() => (v ? handHints(v, legal, discardNow, isTuto) : { hints: {}, playable: 0 }), [v, legal, discardNow, isTuto]);
  const pickCard = useCallback((uid: string) => {
    sound.click(); setJosiane(false);
    const k = meP?.hand?.find((x) => x.uid === uid);
    if (k) setFiche({ uid, id: k.id });
  }, [meP]);

  // Minuteur de décision et réserve.
  const deadline = snap?.deadline ?? null;
  const rwUntil = snap?.responseWindow?.until ?? null;
  useEffect(() => { if (!deadline && !rwUntil) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [deadline, rwUntil]);
  const reserve = snap?.reserve?.[me] ?? 0;
  const left = deadline ? (deadline - now) / 1000 : null;
  const inReserve = left !== null && left <= 0;
  const reserveLeft = left !== null ? Math.max(0, reserve + Math.min(0, left)) : 0;
  const clock = left === null || !mine ? null : inReserve
    ? { text: `Réserve ${Math.ceil(reserveLeft)} s`, low: true }
    : { text: `${Math.min(CF_RULES.decisionSeconds, Math.ceil(left))} s`, low: left <= 8 };
  const tickSec = clock ? Math.ceil(inReserve ? reserveLeft : left!) : 0;
  const lastTick = useRef(0);
  useEffect(() => { if (clock && tickSec <= 5 && tickSec > 0 && lastTick.current !== tickSec) { lastTick.current = tickSec; sound.tick(); } }, [clock, tickSec]);

  const close = () => { const c = controller as { close?: () => void }; if (c.close) c.close(); else controller.leave(); onExit(); };
  const leave = async () => {
    const over = !!snap?.finished || v?.phase === 'over';
    if (!over && !(await askConfirm(isTuto ? 'Quitter la partie guidée ? Vous pourrez la relancer depuis le menu.' : controller.ranked ? 'Quitter ? La partie classée compte comme une défaite.' : 'Abandonner la partie en cours ?', 'Quitter'))) return;
    if (over) close(); else { controller.leave(); onExit(); }
  };

  if (!snap || !v || !meP) {
    return <div className="cfn-board"><div className="cfn-loading" role="status"><span className="cf-wait-spin" aria-hidden><i /><i /><i /></span>Préparation de la table…</div></div>;
  }

  const opps = v.players.filter((p) => p.id !== me);
  const hand = meP.hand ?? [];
  const discardMode = mine && decision === 'discard';
  const { hints, playable } = hand_;
  const turnId = v.phase === 'turn' ? v.order[v.turn] : null;
  const turnP = turnId ? v.players.find((p) => p.id === turnId) ?? null : null;
  const lastwordMine = mine && decision === 'lastword' && !onlyPass;
  const respondMine = mine && decision === 'respond' && !onlyPass;
  const choiceMine = mine && decision === 'choice';
  const mulliganMine = mine && decision === 'mulligan';
  const ardoise = legal.find((a) => a.type === 'ardoise');
  const josianeAct = legal.some((a) => a.type === 'josiane');
  const stopAct = legal.find((a) => a.type === 'stop');
  const canRollAgain = myTurn && meP.r.throwsUsed > 0 && legal.some((a) => a.type === 'roll');
  const allKept = keep.every(Boolean);
  const seat = (id: string) => snap.seats.find((s) => s.id === id);
  const banner = decisionBanner(v, legal, spectator);
  const steps = friseSteps(v, spectator ? null : me, stage);
  const title = v.phase === 'mulligan' ? 'Main de départ' : v.phase === 'over' ? 'Partie terminée'
    : `Manche ${v.round}${mode ? ` · ${mode}` : ''} · ${turnP ? (turnP.id === me && !spectator ? 'à vous' : `${turnP.name} joue`) : v.phase === 'lastword' ? 'Dernier mot' : 'comptes'}`;
  const myTraps = v.traps.filter((t) => t.owner === me);
  const respWin = snap.responseWindow && snap.responseWindow.player !== me && snap.responseWindow.until > now ? snap.responseWindow : null;
  const overlayOpen = !!ann || animating;

  // Une seule voix : ce que fait l'écran en ce moment (dés, petite annonce), sinon les fenêtres en
  // cours (réponse adverse, Josiane), un avis, et enfin l'état de la partie (à vous / l'adversaire).
  type Say = { tone: string; title?: string; text: string; icon?: string | null };
  let say: Say;
  if (voice) say = { tone: `voice t-${voice.tone}`, text: voice.title, icon: voice.tone in TONE_ICON ? voice.tone : null };
  else if (josiane) say = { tone: 'gold', title: 'Josiane', text: 'Touchez le dé qu’elle doit relancer' };
  else if (respWin && !ann) say = { tone: 'wait', text: `${respWin.kind === 'lastword' ? 'Dernier mot possible' : 'Réponse possible'} : ${nameIn(v, respWin.player)}… ${Math.max(0, Math.ceil((respWin.until - now) / 1000))} s` };
  else if (notice) say = { tone: 'voice t-info', text: notice.text };
  else if (onlyPass) {
    // Fenêtre de réponse où je n'ai rien à jouer (on passe tout seul) : on dit ce que fait l'adversaire.
    const top = v.stack[v.stack.length - 1];
    const o = top ? v.players.find((p) => p.id === top.owner) : null;
    const kept = top?.kind === 'keep' && o ? o.r.dice.filter((_, i) => top.keep[i]) : [];
    say = { tone: 'wait', text: o && kept.length ? `${o.name} garde ${kept.join('-')} et relance ${plural(3 - kept.length, 'dé')}` : `${o?.name ?? 'L’adversaire'} joue…` };
  }
  else if (banner.mine) say = { tone: banner.tone, title: banner.title, text: banner.text };
  else say = { tone: 'wait', text: banner.text || '…' };
  const sayKey = `${say.title ?? ''}|${say.text}`;

  return (
    <div className={`cfn-board${opps.length > 1 ? ' multi' : ''}${isTuto ? ' tuto' : ''}`} onPointerDown={() => sound.unlock()}>
      <div className="cfn-top">
        <button className="cfn-ib" onClick={leave} aria-label="Quitter la partie"><Icon name="close" size={18} /></button>
        <div className="cfn-ttl"><b>CF</b><span>{title}</span></div>
        <button className="cfn-ib" onClick={() => setJournal(true)} aria-label="Journal de la manche">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        </button>
        {online && <CfChatButton controller={controller} pa={pa} />}
        <button className="cfn-ib" onClick={() => setHelp(true)} aria-label="Aide"><b>?</b></button>
        <VolumeControl settings={settings} onSettings={onSettings} />
      </div>
      <Frise steps={steps} />

      <div className={`cfn-opps n${opps.length}`}>
        {opps.map((o) => (
          <OppPanel key={o.id} p={o} v={v} seat={seat(o.id)} emote={emotes[o.id]?.e} compact={opps.length > 1}
            active={turnId === o.id || v.waiting.includes(o.id)} refEl={() => {}} focus={focus === 'opp'} tokRef={(el) => { tokRefs.current[o.id] = el; }}
            onTrap={() => setTrapOf(o.id)} onCard={(id, owner) => setFiche({ id, owner })} />
        ))}
      </div>

      <div className={`cfn-banner ${say.tone}${bigShot ? ' hush' : ''}`} role="status" aria-live="polite">
        <span key={sayKey} className="cfn-say">
          {say.icon && <TypeIcon type={TONE_ICON[say.icon]!} size={14} />}
          {say.title && <b>{say.title}</b>}<span>{say.text}</span>
        </span>
        {clock && !voice && <em className={`cfn-clock${clock.low ? ' low' : ''}`}>{clock.text}</em>}
      </div>

      <div className={`cfn-trayzone${fx('tray')}`}>
        <DiceTray ref={tray} appearance={pa.profile.equipped} quality={settings.quality} onDieClick={onDie} cup={settings.cup} />
        {canKeep && !josiane && (
          <span className="cfn-keep" role="group" aria-label="Dés à garder">
            <em>Garder :</em>
            {meP.r.dice.map((d, i) => <button key={i} className={keep[i] ? 'on' : ''} aria-pressed={keep[i]} aria-label={`Garder le ${d}`} onClick={() => onDie(i)}><Pip v={d} size={24} on={keep[i]} /></button>)}
          </span>
        )}
        {bigShot && (
          <div key={bigShot.key} className="bigshot cfn-bigshot" aria-live="assertive" aria-label={`${bigShot.text} ${nameIn(v, bigShot.who)}`}>
            <div className="bs-text">{bigShot.text}</div>
          </div>
        )}
      </div>

      <div className="cfn-me">
        <div className="cfn-count-row">
          {mine && playable > 0 && !discardMode && <span className="cfn-count"><i aria-hidden />{plural(playable, 'carte')} jouable{playable > 1 ? 's' : ''} maintenant</span>}
          {discardMode && <span className="cfn-count violet">Touchez une carte à défausser ({hand.length}/{v.rules.handMax})</span>}
          {moment && !mine && <button className="cfn-share" disabled={sharing} onClick={() => void share(moment)}><Icon name="share" size={14} />Partager ce coup</button>}
        </div>
        {spectator ? (
          <div className="cfn-spect"><span className="cfn-backs">{Array.from({ length: Math.min(meP.handCount, 7) }, (_, i) => <i key={i} className="cfn-bk" />)}</span><small>Vous regardez la partie · main de {meP.name} cachée</small></div>
        ) : hand.length > 0 ? (
          <Hand cards={hand} hints={hints} sel={fiche?.uid ?? null} focus={focus === 'hand'} quiet={!mine} onPick={pickCard} />
        ) : <div className="cfn-hand-empty">Aucune carte en main</div>}
        <div className={`cfn-bar${fx('me')}`}>
          <Tokens n={meP.tokens} refEl={(el) => { tokRefs.current[me] = el; }} />
          <Glasses n={meP.tournees} max={v.rules.tourneesMax} />
          <span className="cfn-pins">
            {meP.habitues.map((h) => <HabPin key={h.uid} id={h.id} rounds={h.rounds} onClick={() => setFiche({ id: h.id, owner: me, uid: h.uid })} />)}
            {myTraps.map((t) => <HabPin key={t.uid} id={t.id} trap onClick={() => t.id && setFiche({ id: t.id, trapUid: t.uid })} />)}
          </span>
          <span className="cfn-grow" />
          {ardoise ? <button className={`cfn-ardoise${fx('ardoise')}`} disabled={pending}
            onClick={async () => { if (isTuto || await askConfirm(`L’ardoise (une fois par partie) : +${v.rules.ardoiseLoan} Tournées tout de suite, mais rien à la prochaine manche.`, 'Prendre l’ardoise')) void act(ardoise); }}>Ardoise</button>
            : meP.ardoiseUsed ? <span className="cfn-ardoise used">Ardoise prise</span> : null}
        </div>
        <div className="cfn-actions">
          {myTurn && meP.r.throwsUsed === 0 && <button className={`cfn-act roll${fx('roll')}`} disabled={pending || !legal.some((a) => a.type === 'roll')} onClick={roll}><Icon name="dice" size={20} />Lancer les dés</button>}
          {canRollAgain && <button className={`cfn-act roll${fx('tray')}`} disabled={pending || allKept} onClick={roll}>{rerollLabel(meP.r.dice, keep)}</button>}
          {myTurn && josianeAct && !josiane && <button className="cfn-act ghost slim" onClick={() => setJosiane(true)}>Josiane</button>}
          {josiane && <button className="cfn-act ghost slim" onClick={() => setJosiane(false)}>Annuler</button>}
          {stopAct && <button className={`cfn-act ghost${canRollAgain ? ' slim' : ''}${fx('stop')}`} disabled={pending} onClick={() => void act(stopAct)}>M’arrêter</button>}
          {lastwordMine && <button className="cfn-act ghost" disabled={pending || !legal.some((a) => a.type === 'pass')} onClick={() => void act({ type: 'pass' })}>Passer</button>}
          {myTurn && !stopAct && !legal.some((a) => a.type === 'roll') && <div className="cfn-wait">Jouez une carte</div>}
          {/* Hors de mon tour : rien ici (le bandeau dit ce qui se passe, la main est grisée). La place reste
              réservée pour que le bac 3D ne change pas de taille à chaque tour. */}
        </div>
      </div>

      {ann && <AnnounceView a={ann} onDone={skipAnn} spectator={spectator} me={spectator ? '' : me} v={annView.current ?? v} />}
      {toast && <div key={toast.key} className="cf-toast is-err" role="alert">{toast.text}</div>}

      {!overlayOpen && mulliganMine && <Mulligan v={v} legal={legal} pending={pending} onAct={act} clock={clock?.text} />}
      {!overlayOpen && respondMine && <RespondPanel v={v} legal={legal} pending={pending} onAct={act} deadline={deadline} focus={focus === 'respond'} tuto={guide?.text ?? null} />}
      {!overlayOpen && choiceMine && <ChoiceWindow v={v} legal={legal} pending={pending} onAct={act} focus={focus === 'choice'} tuto={guide?.text ?? null} />}
      {(snap.finished || v.phase === 'over') && !animating && <EndScreen snap={snap} v={v} me={me} onExit={close} onAgain={onAgain} onAccount={onAccount}
        bot={controller.kind === 'bot'} guest={!pa.isAccount} ranked={controller.ranked} spectator={spectator} rewarded={(controller as { rewarded?: boolean }).rewarded ?? controller.kind === 'online'}
        againLabel={isTuto ? 'Contre l’ordinateur' : undefined}
        onShare={spectator || isTuto || !moments.current.best() ? undefined : () => { const m = moments.current.best(); if (m) void share(m); }} sharing={sharing} />}

      {fiche && <Fiche key={`${fiche.uid ?? fiche.id}`} t={fiche} v={v} legal={legal} snapLegal={snap.legal} pending={pending} discard={discardMode} onAct={act} onClose={() => setFiche(null)}
        tuto={isTuto && guide ? guide.text : null} />}
      {trapOf && v.players.find((p) => p.id === trapOf) && <TrapSheet owner={v.players.find((p) => p.id === trapOf)!} v={v} onClose={() => setTrapOf(null)} onCard={(id) => { setTrapOf(null); setFiche({ id, owner: trapOf }); }} />}
      {journal && <Journal log={log} v={v} me={me} onCard={(id, owner) => setFiche({ id, owner: owner ?? 'journal' })} onClose={() => setJournal(false)} />}
      {help && <HelpSheet v={v} onClose={() => setHelp(false)} onRules={() => { setHelp(false); setRules(true); }} />}
      {rules && <Sheet title="Règles de Coups Fourrés" onClose={() => setRules(false)}><RulesContent short /></Sheet>}

      {guide && !snap.finished && !overlayOpen && !fiche && !(respondMine || choiceMine) && (
        <TutoBubble g={guide} onNext={() => { sound.click(); (controller as { guideNext?: () => void }).guideNext?.(); }}
          onSkip={async () => { if (await askConfirm('Passer la partie guidée ? Vous pourrez la refaire quand vous voulez depuis le menu du mode.', 'Passer')) { controller.leave(); onExit(); } }} />
      )}
    </div>
  );
}

const TONE_ICON: Partial<Record<string, 'coup' | 'piege' | 'riposte' | 'dernier-mot' | 'habitue'>> = { coup: 'coup', piege: 'piege', riposte: 'riposte', 'dernier-mot': 'dernier-mot', habitue: 'habitue' };

/** Bulle de la partie guidée : texte court, une seule action attendue, « Passer le tutoriel ». */
function TutoBubble({ g, onNext, onSkip }: { g: NonNullable<CfSnapshot['guide']>; onNext: () => void; onSkip: () => void }) {
  return (
    <div className={`cfn-tuto at-${g.focus === 'opp' ? 'bottom' : 'top'}`} role="dialog" aria-live="polite" aria-label="Partie guidée">
      <div className="cfn-tuto-head"><b>{g.title ?? 'Partie guidée'}</b><small>{g.index}/{g.total}</small><button className="cfn-tuto-skip" onClick={onSkip}>Passer le tutoriel</button></div>
      <p>{g.text}</p>
      {g.next && <button className="cfn-act gold full" onClick={onNext} autoFocus>{g.next}</button>}
    </div>
  );
}
