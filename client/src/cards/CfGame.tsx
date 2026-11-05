/**
 * Coups Fourrés : le plateau de partie (prototype CFPlateau validé par Sam).
 * Ne dépend que de CfController : la même interface sert contre l'ordinateur (local.ts) et en ligne.
 *
 * Haut : adversaire(s) (jetons, Tournées, dos des cartes, pièges posés, Habitués) ; centre : le bac 3D
 * du jeu de base (DiceTray), qui rejoue les lancers annoncés par les événements ; bas : ma main en
 * éventail (avec les illustrations), mes jetons, mes Tournées sur 6, mes Habitués, l'ardoise, les actions.
 * Les événements sont animés un par un (carte qui vole au centre, piège révélé, jetons qui passent).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CARD_BY_ID, CF_RULES, FAMILY_LABEL, TYPE_LABEL } from '../../../shared/cards/catalog';
import type { CfAction, CfEvent, CfPlayerView, CfView, PlayParams } from '../../../shared/cards/engine';
import type { ProfileApi } from '../account/useProfile';
import type { Settings } from '../settings';
import { sound } from '../audio/sound';
import { setPresence } from '../presence';
import { askConfirm } from '../ui/confirm';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { VolumeControl } from '../ui/VolumeControl';
import { DiceTray, type DiceTrayHandle } from '../ui/DiceTray';
import { flyTokens } from '../ui/flyTokens';
import { Sheet } from '../ui/kit';
import type { CfController, CfSeat, CfSnapshot } from './controller';
import type { CfOnline } from './online';
import { CfChatButton } from './CfChat';
import { CapsuleIcon, CardBack, CardView, HandFan, MiniCard, TrapBack } from './components';
import { FAMILY_SHORT } from './meta';
import { Pip } from './cfui';
import {
  comboOf, costNow, decisionLine, describeNow, eventTone, isBigShot, isHeadline, meOf, nameIn, nextParam,
  paramQuestion, phaseLine, playOptions, playableUids, plural, rerollLabel, resolveOption, valuesFor, whyNot, type ParamKey,
} from './describe';
import { RulesContent } from './CfInfo';

/** Largeur de l'écran (360 hors navigateur, pour le rendu serveur des tests). */
const vw = () => (typeof window !== 'undefined' ? window.innerWidth : 360);

interface Props {
  controller: CfController;
  /** Mode affiché en haut : « contre Dédé », « classée », « entre amis ». */
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
const def = (id: string | null | undefined) => (id ? CARD_BY_ID[id] : undefined);
let rollSeed = 1;
const nextSeed = () => (rollSeed = (Math.imul(rollSeed, 1664525) + 1013904223) >>> 0);

interface Fly { key: number; ms: number; cardId: string | null; kind: 'card' | 'trap' | 'reveal'; dx: number; dy: number; tx: number; ty: number; who: string; label?: string }
interface Headline { key: number; text: string; tone: string }
interface LogLine { key: number; text: string; tone: string; round: number }

export function CfGame({ controller, mode, settings, onSettings, pa, onExit, onAgain, onAccount, online }: Props) {
  const tray = useRef<DiceTrayHandle>(null);
  const [snap, setSnap] = useState<CfSnapshot | null>(null);
  const spectator = !!(controller as { spectator?: boolean }).spectator;
  // Spectateur : on regarde la partie du point de vue du premier joueur (sans voir sa main).
  const me = snap && !snap.view.players.some((p) => p.id === controller.me) ? snap.view.players[0]?.id ?? controller.me : controller.me;
  const snapRef = useRef<CfSnapshot | null>(null);
  const [animating, setAnimating] = useState(false);
  const queue = useRef<{ snap: CfSnapshot; events: CfEvent[] }[]>([]);
  const busy = useRef(false);
  const alive = useRef(true);
  const [sel, setSel] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PlayParams>({});
  const [josiane, setJosiane] = useState(false);
  const [keep, setKeep] = useState<boolean[]>(NO_KEEP);
  const [pending, setPending] = useState(false);
  const [fly, setFly] = useState<Fly | null>(null);
  const [headline, setHeadline] = useState<Headline | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [bigShot, setBigShot] = useState<{ text: string; who: string; key: number } | null>(null);
  const [zoom, setZoom] = useState<{ id: string; owner?: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const panels = useRef<Record<string, HTMLElement | null>>({});
  const trayZone = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const trayDice = useRef<{ owner: string | null; dice: number[] }>({ owner: null, dice: [0, 0, 0] });
  const logKey = useRef(0);

  useEffect(() => {
    alive.current = true;
    setPresence(controller.kind === 'bot' ? 'solo' : 'online');
    return () => { alive.current = false; setPresence('menu'); };
  }, [controller]);
  // Message de départ du contrôleur (partie d'essai, non récompensée…).
  useEffect(() => {
    const n = (controller as { notice?: string | null }).notice;
    if (n) setTimeout(() => { if (alive.current) setHeadline({ key: Date.now(), text: n, tone: 'info' }); }, 400);
  }, [controller]);
  // Avis du serveur (joueur déconnecté, action automatique…) et réactions.
  const seenNotices = useRef(0);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!online) return;
    return online.onChange(() => {
      const n = (controller as { notices?: string[] }).notices ?? [];
      if (n.length > seenNotices.current) { setHeadline({ key: Date.now(), text: n[n.length - 1], tone: 'info' }); }
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
  useEffect(() => { if (!headline) return; const t = setTimeout(() => setHeadline((h) => (h?.key === headline.key ? null : h)), 2600); return () => clearTimeout(t); }, [headline]);
  useEffect(() => { if (!bigShot) return; const t = setTimeout(() => setBigShot(null), 2300); return () => clearTimeout(t); }, [bigShot]);

  // ----------------------------------------------------------------------------------------------
  // File d'événements : chaque événement est joué (dés, carte qui vole…) avant d'afficher l'état suivant.
  const centerOf = (el: Element | null | undefined) => { const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };

  const playFly = useCallback(async (f: Omit<Fly, 'key' | 'ms' | 'dx' | 'dy' | 'tx' | 'ty'>, fromId: string, toId?: string, ms = 1200) => {
    if (reduced()) { await wait(Math.min(ms, 600)); return; }
    const from = fromId === me ? centerOf(handRef.current) : centerOf(panels.current[fromId]);
    const target = toId ? centerOf(panels.current[toId]) : centerOf(trayZone.current);
    if (!from || !target) { await wait(400); return; }
    setFly({ ...f, ms, key: Date.now() + Math.random(), dx: from.x - target.x, dy: from.y - target.y, tx: target.x, ty: target.y });
    await wait(ms);
    if (alive.current) setFly(null);
  }, [me]);

  const rollTray = useCallback(async (player: string, dice: number[], keepMask: boolean[], prev: number[]) => {
    const t = tray.current;
    if (!t) return;
    t.setInteractive(false);
    t.setKept(NO_KEEP);
    // Le bac montre les dés de ce joueur avant de relancer ceux qui bougent.
    if (trayDice.current.owner !== player && prev.some((x) => x > 0) && keepMask.some(Boolean)) t.showValues(prev);
    const big = isBigShot(dice) && !keepMask.every(Boolean) ? isBigShot(dice) : null;
    await t.roll(dice, keepMask, nextSeed(), undefined, !!big);
    trayDice.current = { owner: player, dice: [...dice] };
    if (big) {
      sound.jackpot();
      t.celebrate(null);
      setBigShot({ text: big === '421' ? '4-2-1 !' : 'Trois as !', who: player, key: Date.now() });
      await wait(900);
    }
  }, []);

  const pushLog = useCallback((e: CfEvent, round: number) => {
    setLog((l) => [{ key: ++logKey.current, text: e.text, tone: eventTone(e), round }, ...l].slice(0, 220));
  }, []);

  const playEvent = useCallback(async (e: CfEvent, prev: CfSnapshot | null, next: CfSnapshot) => {
    const round = next.view.round;
    pushLog(e, round);
    const prevDice = (id: string) => prev?.view.players.find((p) => p.id === id)?.r.dice ?? [0, 0, 0];
    const tone = eventTone(e);
    switch (e.kind) {
      case 'lancer':
        if (e.player && e.dice) await rollTray(e.player, e.dice, e.kept ?? NO_KEEP, prevDice(e.player));
        return;
      case 'carte': {
        if (!e.player || !e.card) break;
        sound.party('pop', 0.5);
        await playFly({ cardId: e.card, kind: 'card', who: e.player }, e.player, undefined, e.player === me ? 850 : 1350);
        return;
      }
      case 'pose':
        if (!e.player) break;
        sound.click();
        {
          const others = next.view.players.filter((p) => p.id !== me);
          const to = others.length === 1 ? (e.player === me ? others[0].id : me) : undefined;
          await playFly({ cardId: null, kind: 'trap', who: e.player }, e.player, to, 900);
        }
        if (e.player === me) setHeadline({ key: Date.now(), text: e.text, tone });
        return;
      case 'piege-revele':
        if (!e.player || !e.card) break;
        sound.party('thunder', 0.7);
        setHeadline({ key: Date.now(), text: e.text, tone: 'piege' });
        await playFly({ cardId: e.card, kind: 'reveal', who: e.player, label: 'Piège !' }, e.player, undefined, 1500);
        return;
      case 'comptes': {
        const lr = next.view.lastRound;
        setHeadline({ key: Date.now(), text: e.text, tone: 'comptes' });
        if (lr && lr.amount > 0 && lr.winner && lr.loser) {
          sound.chips(Math.min(8, lr.amount));
          flyTokens(panels.current[lr.reversed ? lr.loser : lr.winner], panels.current[lr.reversed ? lr.winner : lr.loser], lr.amount);
          await wait(1400);
        } else await wait(1100);
        return;
      }
      case 'manche':
        setHeadline({ key: Date.now(), text: e.text, tone: 'manche' });
        await wait(700);
        return;
      case 'fin':
        if (next.view.winner === me) sound.win(); else sound.lose();
        await wait(500);
        return;
    }
    // Dés modifiés par une carte (Josiane, Tête qui tourne, Coup de pouce, Dé sous la table…).
    if (e.dice && e.player) {
      const before = prevDice(e.player);
      const moved = e.rolled ?? e.dice.map((x, i) => (x !== before[i] ? i : -1)).filter((i) => i >= 0);
      if (moved.length) {
        if (isHeadline(e)) setHeadline({ key: Date.now(), text: e.text, tone });
        await rollTray(e.player, e.dice, [0, 1, 2].map((i) => !moved.includes(i)), before);
        return;
      }
    }
    if (isHeadline(e) && tone !== 'prive' && e.kind !== 'pioche') {
      setHeadline({ key: Date.now(), text: e.text, tone });
      await wait(tone === 'piege' || tone === 'annule' ? 1000 : 650);
    }
  }, [me, playFly, pushLog, rollTray]);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAnimating(true);
    while (queue.current.length && alive.current) {
      const item = queue.current.shift()!;
      const prev = snapRef.current;
      for (const e of item.events) {
        if (!alive.current) break;
        await playEvent(e, prev, item.snap);
      }
      snapRef.current = item.snap;
      setSnap(item.snap);
    }
    busy.current = false;
    if (alive.current) setAnimating(false);
  }, [playEvent]);

  useEffect(() => controller.subscribe((s, events) => { queue.current.push({ snap: s, events }); void pump(); }), [controller, pump]);

  // ----------------------------------------------------------------------------------------------
  const v = snap?.view ?? null;
  const legal = useMemo(() => (snap && !animating ? snap.legal : []), [snap, animating]);
  const mine = legal.length > 0 && !pending && !spectator;
  const meP = v ? v.players.find((p) => p.id === me) ?? null : null;
  const decision = v?.decision ?? null;
  const myTurn = mine && decision === 'turn';
  const canKeep = myTurn && !!meP && meP.r.throwsUsed > 0 && legal.some((a) => a.type === 'roll');
  const turnKey = v ? `${v.round}|${v.order[v.turn]}|${meP?.r.throwsUsed === 0 ? 'neuf' : 'en-cours'}|${v.phase}` : '';
  useEffect(() => { setKeep(NO_KEEP); }, [turnKey]);
  // La sélection d'une carte disparaît si la carte n'est plus en main.
  useEffect(() => { if (sel && !meP?.hand?.some((k) => k.uid === sel)) { setSel(null); setChosen({}); } }, [meP, sel]);
  useEffect(() => { if (!mine) setJosiane(false); }, [mine]);
  useEffect(() => { if (mine && (decision === 'turn' && meP?.r.throwsUsed === 0 || decision === 'respond' || decision === 'lastword')) sound.turn(); }, [mine, decision]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fenêtre de réponse sans aucune carte jouable (en ligne, toutes les fenêtres durent pareil) : on passe tout seul.
  const onlyPass = mine && (decision === 'respond' || decision === 'lastword') && legal.length === 1 && legal[0].type === 'pass';
  useEffect(() => { if (onlyPass) { const t = setTimeout(() => void controller.act({ type: 'pass' }), 350); return () => clearTimeout(t); } }, [onlyPass, controller, snap]);
  const selCard = sel ? meP?.hand?.find((k) => k.uid === sel) ?? null : null;
  const selOpts = useMemo(() => (sel ? playOptions(legal, sel) : []), [legal, sel]);
  const nextKey: ParamKey | null = selOpts.length ? nextParam(selOpts, chosen) : null;
  const dieChooser = josiane || nextKey === 'die' && (selCard?.id !== 'de-sous-table');
  // Bac : garder des dés au toucher, ou choisir un dé pour une carte.
  useEffect(() => {
    if (animating) return;
    const t = tray.current;
    if (!t) return;
    const showMine = !!meP && meP.r.throwsUsed > 0 && v?.order[v.turn] === me && v?.phase === 'turn';
    if (showMine && trayDice.current.owner !== me) { t.showValues(meP!.r.dice); trayDice.current = { owner: me, dice: [...meP!.r.dice] }; }
    t.setKept(canKeep && !dieChooser ? keep : NO_KEEP);
    t.setInteractive((canKeep || dieChooser) && showMine);
  }, [keep, canKeep, animating, dieChooser, meP, v, me]);

  const act = useCallback(async (a: CfAction) => {
    if (pending) return;
    sound.unlock();
    setPending(true);
    const err = await controller.act(a);
    if (!alive.current) return;
    setPending(false);
    setSel(null); setChosen({}); setJosiane(false);
    if (err) setToast({ text: err, key: Date.now() });
  }, [controller, pending]);

  const onDie = useCallback((i: number) => {
    if (josiane) {
      const j = legal.find((a) => a.type === 'josiane' && a.die === i);
      if (j) void act(j);
      return;
    }
    if (dieChooser) { setChosen((c) => ({ ...c, die: i })); sound.click(); return; }
    if (!canKeep) return;
    sound.click();
    setKeep((k) => k.map((x, j) => (j === i ? !x : x)));
  }, [josiane, legal, act, dieChooser, canKeep]);

  const roll = () => {
    if (!meP) return;
    const k = meP.r.throwsUsed === 0 ? NO_KEEP : keep;
    const a = legal.find((x) => x.type === 'roll' && x.keep.every((b, i) => b === k[i]));
    if (a) void act(a);
  };

  // Minuteur de décision et réserve.
  const deadline = snap?.deadline ?? null;
  const rwUntil = snap?.responseWindow?.until ?? null;
  useEffect(() => { if (!deadline && !rwUntil) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [deadline, rwUntil]);
  const reserve = snap?.reserve?.[me] ?? 0;
  // `deadline` = fin des 30 s de la décision ; ensuite la réserve de la partie s'écoule.
  const left = deadline ? (deadline - now) / 1000 : null;
  const inReserve = left !== null && left <= 0;
  const reserveLeft = left !== null ? Math.max(0, reserve + Math.min(0, left)) : 0;
  const clock = left === null || !mine ? null : inReserve
    ? { text: `Réserve ${Math.ceil(reserveLeft)} s`, low: true, pct: (100 * reserveLeft) / Math.max(1, CF_RULES.reserveSeconds) }
    : { text: `${Math.min(CF_RULES.decisionSeconds, Math.ceil(left))} s`, low: left <= 8, pct: (100 * left) / CF_RULES.decisionSeconds };
  const tickSec = clock ? Math.ceil(inReserve ? reserveLeft : left!) : 0;
  const lastTick = useRef(0);
  useEffect(() => { if (clock && tickSec <= 5 && tickSec > 0 && lastTick.current !== tickSec) { lastTick.current = tickSec; sound.tick(); } }, [clock, tickSec]);

  const leave = async () => {
    const over = !!snap?.finished || v?.phase === 'over';
    if (!over && !(await askConfirm(controller.ranked ? 'Quitter ? La partie classée compte comme une défaite.' : 'Abandonner la partie en cours ?', 'Quitter'))) return;
    const c = controller as { close?: () => void };
    if (over && c.close) c.close(); else controller.leave();
    onExit();
  };

  // --- mise en page : hauteur de l'éventail ----------------------------------------------------
  const boardRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const m = () => setCompact(window.innerHeight < 690);
    m(); window.addEventListener('resize', m); return () => window.removeEventListener('resize', m);
  }, []);

  if (!snap || !v || !meP) {
    return <div className="cf-board"><div className="cf-board-loading" role="status"><span className="cf-wait-spin" aria-hidden><i /><i /><i /></span>Préparation de la table…</div></div>;
  }

  const opps = v.players.filter((p) => p.id !== me);
  const playable = playableUids(legal);
  const hand = meP.hand ?? [];
  const turnId = v.phase === 'turn' ? v.order[v.turn] : null;
  const turnP = turnId ? v.players.find((p) => p.id === turnId) ?? null : null;
  const myCombo = comboOf(v, meP);
  const discardMode = mine && decision === 'discard';
  const lastwordMine = mine && decision === 'lastword' && !onlyPass;
  const respondMine = mine && decision === 'respond';
  const choiceMine = mine && decision === 'choice';
  const mulliganMine = mine && decision === 'mulligan';
  const ardoise = legal.find((a) => a.type === 'ardoise');
  const josianeAct = legal.some((a) => a.type === 'josiane');
  const stopAct = legal.find((a) => a.type === 'stop');
  const canRollAgain = myTurn && meP.r.throwsUsed > 0 && legal.some((a) => a.type === 'roll');
  const allKept = keep.every(Boolean);
  const seat = (id: string) => snap.seats.find((s) => s.id === id);
  const throwsLeft = meP.throwLimit !== null ? meP.throwLimit - meP.r.throwsUsed : null;

  // Bulle de la carte choisie : ce qu'elle fait maintenant + paramètres + Jouer.
  const selDef = selCard ? def(selCard.id) : undefined;
  const ready = selOpts.length ? resolveOption(selOpts, chosen) : null;
  const preview = selCard && selDef ? (
    <div className={`cf-bubble ${selDef.family}`} role="dialog" aria-label={selDef.name}>
      <div className="cf-bubble-head">
        <b>{selDef.name} · {plural(costNow(v, selCard.id), 'Tournée')}</b>
        <button className="cf-bubble-x" onClick={() => setZoom({ id: selCard.id })} aria-label="Voir la carte en grand"><Icon name="search" size={16} /></button>
        <button className="cf-bubble-x" onClick={() => { setSel(null); setChosen({}); }} aria-label="Fermer"><Icon name="close" size={16} /></button>
      </div>
      {discardMode ? <p>Défausser cette carte pour revenir à {v.rules.handMax} cartes en main.</p>
        : selOpts.length ? <p>{describeNow(v, selCard.id, chosen, selOpts)}</p>
          : <p className="cf-why">{whyNot(v, selCard.id, snap.legal, selCard.uid)} <span>{selDef.text}</span></p>}
      {!discardMode && nextKey && <ParamChooser k={nextKey} v={v} cardId={selCard.id === 'grand-enchainement' ? meP.r.lastCoup ?? selCard.id : selCard.id} opts={selOpts} chosen={chosen} onPick={(k, x) => { sound.click(); setChosen((c) => ({ ...c, [k]: x })); }} />}
      <div className="cf-bubble-btns">
        {Object.keys(chosen).length > 0 && <button className="cf-btn ghost small" onClick={() => setChosen({})}>Changer</button>}
        {discardMode
          ? <button className="cf-btn red" disabled={pending} onClick={() => void act({ type: 'discard', card: selCard.uid })}>Défausser</button>
          : selOpts.length > 0 && <button className="cf-btn red" disabled={!ready || pending} onClick={() => ready && void act({ type: 'play', card: selCard.uid, ...ready })}>{selDef.type === 'piege' ? 'Poser le piège' : selDef.type === 'habitue' ? 'Installer' : 'Jouer'}</button>}
      </div>
      <i className="cf-bubble-tip" aria-hidden />
    </div>
  ) : null;

  const oppCombo = opps.map((o) => ({ o, c: comboOf(v, o) })).filter((x) => x.c && x.o.id !== turnId && x.c.done);
  const strip = headline ? <div key={headline.key} className={`cf-headline ${headline.tone}`} role="status">{headline.text}</div>
    : oppCombo.length ? (
      <div className="cf-strip">
        {oppCombo.slice(0, 2).map(({ o, c }) => (
          <span key={o.id} className="cf-strip-item"><span>{o.name} : <b>{c!.label}</b></span><span className="cf-strip-dice">{c!.dice.map((d, i) => <Pip key={i} v={d} size={18} />)}</span></span>
        ))}
      </div>
    ) : null;

  return (
    <div className={`cf-board${compact ? ' compact' : ''}${opps.length > 1 ? ' multi' : ''}`} ref={boardRef} onPointerDown={() => sound.unlock()}>
      <div className="cf-topbar">
        <button className="cf-ib" onClick={leave} aria-label="Quitter la partie"><Icon name="close" size={18} /></button>
        <div className="cf-phase"><b>CF</b><span>{phaseLine(v, mode)}</span></div>
        <button className="cf-ib" onClick={() => setLogOpen(true)} aria-label="Journal de la manche"><Icon name="history" size={18} /></button>
        {online && <CfChatButton controller={controller} pa={pa} />}
        <button className="cf-ib" onClick={() => setRulesOpen(true)} aria-label="Règles"><Icon name="rules" size={18} /></button>
        <VolumeControl settings={settings} onSettings={onSettings} />
      </div>

      <div className={`cf-opps n${opps.length}`}>
        {opps.map((o) => (
          <OppPanel key={o.id} p={o} v={v} seat={seat(o.id)} emote={emotes[o.id]?.e} active={turnId === o.id || v.waiting.includes(o.id)} compact={opps.length > 1}
            refEl={(el) => { panels.current[o.id] = el; }} onHabitue={(id) => setZoom({ id, owner: o.id })} />
        ))}
      </div>

      <div className="cf-trayzone" ref={trayZone}>
        <DiceTray ref={tray} appearance={pa.profile.equipped} quality={settings.quality} onDieClick={onDie} cup={settings.cup} />
        {strip}
        {lastwordMine && <div className="cf-lastword-tag">Dernier mot</div>}
        {snap.responseWindow && snap.responseWindow.player !== me && snap.responseWindow.until > now && !headline && (
          <div className="cf-respwin" role="status">{snap.responseWindow.kind === 'lastword' ? 'Dernier mot possible' : 'Réponse possible'} : {nameIn(v, snap.responseWindow.player)}… <b>{Math.ceil((snap.responseWindow.until - now) / 1000)} s</b></div>
        )}
        <div className="cf-tray-chip">
          {turnP && turnP.id !== me ? <span><b>{turnP.name}</b>{turnP.r.throwsUsed ? ` : ${comboOf(v, turnP)?.label ?? ''}` : ' va lancer'}</span>
            : myCombo ? <span>Vous : <b>{myCombo.label}</b>{myTurn && throwsLeft !== null ? ` · ${throwsLeft > 0 ? `encore ${plural(throwsLeft, 'lancer')}` : 'plus de lancer'}` : ` · vaut ${myCombo.value}`}</span>
              : <span>{decisionLine(v)}</span>}
        </div>
        {(josiane || (dieChooser && selCard)) && <div className="cf-tray-hint">Touchez un dé {josiane ? 'à faire relancer par Josiane' : 'dans le bac ou ci-dessous'}</div>}
      </div>

      <div className="cf-hand-zone" ref={handRef}>
        {preview}
        {mine && (discardMode || lastwordMine) && !selCard && <div className="cf-hand-tip">{discardMode ? `Main pleine : touchez une carte à défausser (${hand.length}/${v.rules.handMax}).` : 'Dernier mot : jouez une carte « Dernier mot » ou passez.'}</div>}
        {spectator ? (
          <div className="cf-spect-hand"><span className="cf-backs">{Array.from({ length: Math.min(meP.handCount, 8) }, (_, i) => <CardBack key={i} width={30} />)}</span><small>Vous regardez la partie · main de {meP.name} cachée</small></div>
        ) : hand.length > 0 ? (
          <HandFan className="cf-hand">
            {hand.map((k) => (
              <MiniCard key={k.uid} id={k.id} playable={playable.has(k.uid)} disabled={!playable.has(k.uid) && !discardMode && mine && decision !== 'mulligan'} selected={sel === k.uid}
                onClick={() => { sound.click(); setChosen({}); setJosiane(false); setSel((s) => (s === k.uid ? null : k.uid)); }} />
            ))}
          </HandFan>
        ) : <div className="cf-hand-empty">Aucune carte en main</div>}
      </div>

      <div className={`cf-me-panel${mine ? ' mine' : ''}`} ref={(el) => { panels.current[me] = el; }}>
        <div className="cf-me-row">
          <span className="cf-tokens" aria-label={`${meP.tokens} jetons`}><i aria-hidden />{meP.tokens}</span>
          <Glasses n={meP.tournees} max={v.rules.tourneesMax} />
          <span className="cf-me-hab">
            {meP.habitues.map((h) => <button key={h.uid} className={`cf-hab-chip ${def(h.id)?.family}`} onClick={() => setZoom({ id: h.id })}>{shortName(h.id)}</button>)}
            {v.traps.filter((t) => t.owner === me).map((t) => <button key={t.uid} className="cf-mytrap" onClick={() => t.id && setZoom({ id: t.id })} aria-label={`Votre piège posé : ${def(t.id)?.name ?? ''}`}><TrapBack width={18} /></button>)}
          </span>
          {clock && <span className={`cf-clock${clock.low ? ' low' : ''}`} style={{ ['--p' as string]: `${Math.max(0, Math.min(100, clock.pct))}%` }}>{clock.text}</span>}
          {ardoise ? <button className="cf-ardoise" disabled={pending} onClick={async () => { if (await askConfirm(`L’ardoise (une fois par partie) : +${v.rules.ardoiseLoan} Tournées tout de suite, mais rien à la prochaine manche.`, 'Prendre l’ardoise')) void act(ardoise); }}>Ardoise</button>
            : meP.ardoiseUsed ? <span className="cf-ardoise used">Ardoise prise</span> : null}
        </div>
        <div className="cf-actions">
          {myTurn && meP.r.throwsUsed === 0 && <button className="cf-act roll" disabled={pending} onClick={roll}><Icon name="dice" size={20} />Lancer les dés</button>}
          {canRollAgain && <button className="cf-act blue" disabled={pending || allKept} onClick={roll}>{rerollLabel(meP.r.dice, keep)}</button>}
          {myTurn && josianeAct && !josiane && <button className="cf-act ghost" onClick={() => { setSel(null); setJosiane(true); }}>Josiane</button>}
          {josiane && <button className="cf-act ghost" onClick={() => setJosiane(false)}>Annuler</button>}
          {stopAct && <button className="cf-act ghost" disabled={pending} onClick={() => void act(stopAct)}>M’arrêter</button>}
          {lastwordMine && <button className="cf-act ghost" disabled={pending} onClick={() => void act({ type: 'pass' })}>Passer</button>}
          {!mine && v.phase !== 'over' && <div className="cf-wait-line">{animating ? '…' : decisionLine(v)}</div>}
        </div>
      </div>

      {fly && <FlyLayer f={fly} />}
      {bigShot && (
        <div key={bigShot.key} className="bigshot cf-bigshot" aria-live="assertive">
          <div className="bs-rays" />
          <div className="bs-text">{bigShot.text}</div>
          <div className="bs-who">{nameIn(v, bigShot.who)}</div>
        </div>
      )}
      {toast && <div key={toast.key} className="cf-toast is-err" role="alert">{toast.text}</div>}

      {mulliganMine && <Mulligan v={v} legal={legal} pending={pending} onAct={act} clock={clock?.text} />}
      {respondMine && !onlyPass && <RespondWindow v={v} legal={legal} pending={pending} onAct={act} clock={clock?.text} />}
      {choiceMine && <ChoiceWindow v={v} legal={legal} pending={pending} onAct={act} />}
      {(snap.finished || v.phase === 'over') && !animating && <EndScreen snap={snap} v={v} me={me} onExit={() => { const c = controller as { close?: () => void }; if (c.close) c.close(); else controller.leave(); onExit(); }} onAgain={onAgain} onAccount={onAccount}
        bot={controller.kind === 'bot'} guest={!pa.isAccount} ranked={controller.ranked} spectator={spectator} rewarded={(controller as { rewarded?: boolean }).rewarded ?? controller.kind === 'online'} />}

      {zoom && (
        <div className="cf-zoom" role="dialog" aria-modal="true" aria-label={def(zoom.id)?.name} onClick={() => setZoom(null)}>
          <CardView id={zoom.id} width={Math.min(260, vw() - 60)} />
          <p>{zoom.owner ? `En jeu chez ${nameIn(v, zoom.owner)}` : `${TYPE_LABEL[def(zoom.id)!.type]} · ${FAMILY_LABEL[def(zoom.id)!.family]}`}</p>
          <button className="cf-btn ghost">Fermer</button>
        </div>
      )}
      {logOpen && <Sheet title={`Journal · manche ${v.round}`} onClose={() => setLogOpen(false)}>
        <ol className="cf-log">{log.map((l) => <li key={l.key} className={l.tone}><small>M{l.round}</small>{l.text}</li>)}</ol>
      </Sheet>}
      {rulesOpen && <Sheet title="Règles de Coups Fourrés" onClose={() => setRulesOpen(false)}><RulesContent short /></Sheet>}
    </div>
  );
}

const shortName = (id: string) => (def(id)?.name ?? id).replace(/^(Le |La |Les |L’)/, '').split(',')[0];

/** Tournées : petits verres pleins / vides, sur 6. */
function Glasses({ n, max, small }: { n: number; max: number; small?: boolean }) {
  return (
    <span className={`cf-glasses${small ? ' small' : ''}`} aria-label={`${n} Tournée${n > 1 ? 's' : ''} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

function OppPanel({ p, v, seat, active, compact, refEl, onHabitue, emote }: { p: CfPlayerView; v: CfView; seat?: CfSeat & { away?: boolean; left?: boolean }; active: boolean; compact: boolean; refEl: (el: HTMLElement | null) => void; onHabitue: (id: string) => void; emote?: string }) {
  const traps = v.traps.filter((t) => t.owner === p.id);
  const c = comboOf(v, p);
  const fams = p.families.map((f) => FAMILY_SHORT[f]).join(' / ');
  return (
    <section className={`cf-opp${active ? ' active' : ''}${p.out ? ' out' : ''}`} ref={refEl} aria-label={`${p.name} : ${p.tokens} jetons, ${p.tournees} Tournées, ${p.handCount} cartes en main, ${traps.length} pièges posés`}>
      <div className="cf-opp-row">
        <Avatar photo={seat?.photo} emoji={seat?.avatar ?? '🎲'} size={compact ? 30 : 40} />
        <span className="cf-opp-name"><b>{p.name}</b>{seat?.left ? <small className="away">A quitté la partie</small> : seat?.away ? <small className="away">Déconnecté : 60 s pour revenir</small> : !compact && <small>{[seat?.label, fams].filter(Boolean).join(' · ')}</small>}</span>
        {emote && <span className="cf-emote" aria-label={`Réaction : ${emote}`}>{emote}</span>}
        <span className="cf-tokens" aria-hidden><i />{p.tokens}</span>
      </div>
      <div className="cf-opp-row">
        {compact ? <span className="cf-mini-stat" aria-hidden>🍺 {p.tournees}</span> : <Glasses n={p.tournees} max={v.rules.tourneesMax} small />}
        <span className="cf-backs" aria-hidden>{compact ? <><CardBack width={14} /><em>{p.handCount}</em></> : Array.from({ length: Math.min(p.handCount, 8) }, (_, i) => <CardBack key={i} width={18} />)}</span>
        <span className="cf-grow" />
        {traps.length > 0 && <span className="cf-opp-traps" aria-hidden>{traps.map((t) => t.id ? <span key={t.uid} className="cf-seen-trap" title={def(t.id)?.name}>{shortName(t.id).slice(0, 7)}</span> : <TrapBack key={t.uid} width={compact ? 16 : 24} />)}</span>}
        {p.habitues.map((h) => <button key={h.uid} className={`cf-hab-chip ${def(h.id)?.family}`} onClick={() => onHabitue(h.id)}>{shortName(h.id)}</button>)}
      </div>
      {compact && c && <div className="cf-opp-combo">{c.dice.map((d, i) => <Pip key={i} v={d} size={14} />)}<small>{c.label}</small></div>}
    </section>
  );
}

function ParamChooser({ k, v, cardId, opts, chosen, onPick }: { k: ParamKey; v: CfView; cardId: string; opts: PlayParams[]; chosen: PlayParams; onPick: (k: ParamKey, x: string | number) => void }) {
  const vals = valuesFor(opts, chosen, k);
  const me = meOf(v);
  const target = chosen.target ? v.players.find((p) => p.id === chosen.target) : undefined;
  const diceOf = cardId === 'de-sous-table' && target ? target.r.dice : me.r.dice;
  return (
    <div className="cf-param">
      <small>{paramQuestion(k, cardId)}</small>
      <div className="cf-param-row">
        {vals.map((x) => {
          switch (k) {
            case 'target': return <button key={x} onClick={() => onPick(k, x)}>{nameIn(v, String(x))}</button>;
            case 'die': return <button key={x} className="die" onClick={() => onPick(k, x)} aria-label={`Dé ${Number(x) + 1} : ${diceOf[Number(x)]}`}><Pip v={diceOf[Number(x)]} size={30} /></button>;
            case 'delta': return <button key={x} onClick={() => onPick(k, x)}>{Number(x) > 0 ? '+1' : '−1'} <small>({me.r.dice[chosen.die ?? 0]} → {me.r.dice[chosen.die ?? 0] + Number(x)})</small></button>;
            case 'face': return <button key={x} className="die" onClick={() => onPick(k, x)} aria-label={`Face ${x}`}><Pip v={Number(x)} size={28} /></button>;
            case 'trap': {
              const t = v.traps.find((y) => y.uid === x);
              return <button key={x} className="trap" onClick={() => onPick(k, x)}><TrapBack width={20} /><small>de {nameIn(v, t?.owner)}{t ? `, manche ${t.posedRound}` : ''}</small></button>;
            }
            case 'habitue': {
              const owner = v.players.find((p) => p.habitues.some((h) => h.uid === x));
              const h = owner?.habitues.find((y) => y.uid === x);
              return <button key={x} onClick={() => onPick(k, x)}>{def(h?.id)?.name ?? '?'} <small>({owner?.name})</small></button>;
            }
          }
          return null;
        })}
      </div>
    </div>
  );
}

function FlyLayer({ f }: { f: Fly }) {
  const style = { left: f.tx, top: f.ty, animationDuration: `${f.ms}ms`, ['--dx' as string]: `${f.dx}px`, ['--dy' as string]: `${f.dy}px` } as React.CSSProperties;
  return (
    <div className={`cf-fly ${f.kind}`} style={style} aria-hidden>
      {f.label && <span className="cf-fly-label">{f.label}</span>}
      {f.cardId ? <CardView id={f.cardId} width={f.kind === 'reveal' ? 170 : 150} /> : <TrapBack width={50} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Fenêtres de décision

export function Mulligan({ v, legal, pending, onAct, clock }: { v: CfView; legal: CfAction[]; pending: boolean; onAct: (a: CfAction) => void; clock?: string }) {
  const [back, setBack] = useState<string[]>([]);
  const hand = meOf(v).hand ?? [];
  const max = v.rules.mulligan;
  const action = legal.find((a) => a.type === 'mulligan' && [...a.cards].sort().join() === [...back].sort().join());
  return (
    <div className="cf-modal" role="dialog" aria-modal="true" aria-label="Main de départ">
      <div className="cf-modal-card">
        <h3>Votre main de départ</h3>
        <p>Touchez jusqu’à {max} cartes à renvoyer sous le deck : vous en repiocherez autant. Une seule fois.{clock ? ` · ${clock}` : ''}</p>
        <div className="cf-mull-grid">
          {hand.map((k) => {
            const on = back.includes(k.uid);
            return (
              <button key={k.uid} className={`cf-mull${on ? ' out' : ''}`} onClick={() => setBack((b) => (on ? b.filter((x) => x !== k.uid) : b.length < max ? [...b, k.uid] : b))} aria-pressed={on}>
                <CardView id={k.id} width={Math.min(140, (vw() - 72) / 2)} dimmed={on} />
                {on && <span className="cf-mull-tag">Renvoyée</span>}
              </button>
            );
          })}
        </div>
        <button className="cf-btn gold big" disabled={pending || !action} onClick={() => action && onAct(action)}>{back.length ? `Échanger ${plural(back.length, 'carte')}` : 'Garder ma main'}</button>
      </div>
    </div>
  );
}

export function RespondWindow({ v, legal, pending, onAct, clock }: { v: CfView; legal: CfAction[]; pending: boolean; onAct: (a: CfAction) => void; clock?: string }) {
  const top = v.stack[v.stack.length - 1];
  const who = top ? nameIn(v, top.owner) : 'L’adversaire';
  const me = meOf(v);
  const plays = legal.filter((a): a is Extract<CfAction, { type: 'play' }> => a.type === 'play');
  const [pick, setPick] = useState<string | null>(plays[0]?.card ?? null);
  const card = me.hand?.find((k) => k.uid === pick);
  const action = plays.find((a) => a.card === pick);
  const what = !top ? 'agit' : top.kind === 'keep' ? `garde ${plural(top.keep.filter(Boolean).length, 'dé')}` : top.cardId ? `joue ${def(top.cardId)?.name}` : 'pose un piège';
  return (
    <div className="cf-modal respond" role="dialog" aria-modal="true" aria-label="Riposte">
      <div className="cf-modal-card">
        <div className="cf-resp-head"><h3>{who} {what} : répondre ?</h3>{clock && <span className="cf-clock low">{clock}</span>}</div>
        <div className="cf-resp-body">
          <div className="cf-resp-their">
            {top?.kind === 'card' && top.cardId ? <CardView id={top.cardId} width={118} /> : top?.kind === 'card' ? <TrapBack width={60} />
              : top?.kind === 'keep' ? <span className="cf-resp-keep">{v.players.find((p) => p.id === top.owner)?.r.dice.map((d, i) => <Pip key={i} v={d} size={28} on={top.keep[i]} />)}</span> : null}
          </div>
          <div className="cf-resp-mine">
            <div className="cf-resp-cards">{[...new Set(plays.map((a) => a.card))].map((uid) => {
              const k = me.hand?.find((x) => x.uid === uid);
              return k ? <MiniCard key={uid} id={k.id} width={64} selected={pick === uid} playable onClick={() => setPick(uid)} /> : null;
            })}</div>
            {card && <p>{describeNow(v, card.id)}</p>}
          </div>
        </div>
        <div className="cf-modal-btns">
          <button className="cf-btn ghost" disabled={pending} onClick={() => onAct({ type: 'pass' })}>Laisser passer</button>
          <button className="cf-btn red" disabled={pending || !action} onClick={() => action && onAct(action)}>{card ? `Jouer ${def(card.id)?.name}` : 'Répondre'}</button>
        </div>
      </div>
    </div>
  );
}

export function ChoiceWindow({ v, legal, pending, onAct }: { v: CfView; legal: CfAction[]; pending: boolean; onAct: (a: CfAction) => void }) {
  const ch = v.choice;
  if (!ch) return null;
  const has = (i: number) => legal.some((a) => a.type === 'choose' && a.index === i);
  const me = meOf(v);
  if (ch.kind === 'calcul' && 'cards' in ch) {
    return (
      <div className="cf-modal" role="dialog" aria-modal="true" aria-label="Calcul mental">
        <div className="cf-modal-card">
          <h3>Calcul mental</h3>
          <p>Gardez une carte ; les autres repartent sous votre deck.</p>
          <div className="cf-choice-row">
            {ch.cards.map((k, i) => <button key={k.uid} className="cf-choice-card" disabled={pending || !has(i)} onClick={() => onAct({ type: 'choose', index: i })}><CardView id={k.id} width={Math.min(104, (vw() - 80) / 3)} /><span>Garder</span></button>)}
          </div>
        </div>
      </div>
    );
  }
  if (ch.kind === 'fouine' && 'cardId' in ch) {
    return (
      <div className="cf-modal" role="dialog" aria-modal="true" aria-label="Fouine">
        <div className="cf-modal-card">
          <h3>La Fouine a trouvé…</h3>
          <div className="cf-choice-row"><CardView id={ch.cardId} width={150} /></div>
          <p>Payer 1 Tournée pour défausser ce piège ? (vous en avez {me.tournees})</p>
          <div className="cf-modal-btns">
            <button className="cf-btn ghost" disabled={pending} onClick={() => onAct({ type: 'choose', index: 0 })}>Le laisser</button>
            <button className="cf-btn red" disabled={pending || !has(1)} onClick={() => onAct({ type: 'choose', index: 1 })}>Défausser · 1 Tournée</button>
          </div>
        </div>
      </div>
    );
  }
  if (ch.kind === 'tournee-generale') {
    return (
      <div className="cf-modal" role="dialog" aria-modal="true" aria-label="Tournée générale">
        <div className="cf-modal-card">
          <h3>Tournée générale</h3>
          <p>Vous pouvez encore relancer un de vos dés : {comboOf(v, me)?.label}.</p>
          <div className="cf-param-row center">{me.r.dice.map((d, i) => <button key={i} className="die" disabled={pending || !has(i)} onClick={() => onAct({ type: 'choose', index: i })} aria-label={`Relancer le ${d}`}><Pip v={d} size={44} /></button>)}</div>
          <button className="cf-btn ghost" disabled={pending} onClick={() => onAct({ type: 'choose', index: -1 })}>Garder mes dés</button>
        </div>
      </div>
    );
  }
  return null;
}

export function EndScreen({ snap, v, me, onExit, onAgain, onAccount, bot, guest, rewarded, ranked, spectator }: { snap: CfSnapshot; v: CfView; me: string; onExit: () => void; onAgain?: () => void; onAccount: () => void; bot: boolean; guest: boolean; rewarded: boolean; ranked: boolean; spectator: boolean }) {
  const standings = snap.finished?.standings ?? v.ranking;
  const won = standings[0] === me;
  const abandon = (snap.finished as { abandon?: string | null } | null)?.abandon;
  const reward = (snap.finished?.reward ?? null) as Record<string, unknown> | null;
  const num = (k: string) => (reward && typeof reward[k] === 'number' ? (reward[k] as number) : null);
  const capsules = num('capsules');
  const points = ranked ? num('points') : null;
  const boosters = num('boosters') ?? (reward?.booster === true ? 1 : null);
  const missions = Array.isArray(reward?.missions) ? (reward!.missions as string[]).length : 0;
  const error = reward && typeof reward.error === 'string' ? reward.error : null;
  const note = reward && typeof reward.note === 'string' ? reward.note : null;
  return (
    <div className="cf-modal end" role="dialog" aria-modal="true" aria-label={won ? 'Victoire' : 'Défaite'}>
      <div className={`cf-modal-card cf-end${won ? ' win' : ''}`}>
        <span className="cf-end-rays" aria-hidden />
        {spectator ? <h2>{nameIn(v, standings[0])} gagne</h2> : <h2>{won ? 'Victoire !' : standings.length > 2 && standings.indexOf(me) > 0 ? `${standings.indexOf(me) + 1}e place` : 'Défaite'}</h2>}
        {abandon && <p>{abandon}</p>}
        <p>{won ? 'Plus un seul jeton : le comptoir est à vous.' : `${nameIn(v, standings[0])} s’est déchargé le premier.`} {v.round} manche{v.round > 1 ? 's' : ''}.</p>
        <ol className="cf-standings">
          {standings.map((id, i) => <li key={id} className={id === me ? 'me' : ''}><span>{i + 1}</span><b>{nameIn(v, id)}</b><small>{plural(v.players.find((p) => p.id === id)?.tokens ?? 0, 'jeton')}</small></li>)}
        </ol>
        <div className="cf-gains">
          {capsules !== null && <span className="cf-gain"><b>+{capsules}</b><CapsuleIcon size={22} /> <small>capsule{capsules > 1 ? 's' : ''}</small></span>}
          {points !== null && <span className="cf-gain"><b>{points > 0 ? `+${points}` : points}</b> <small>points de ligue</small></span>}
          {boosters ? <span className="cf-gain"><b>+{boosters}</b> <small>booster{boosters > 1 ? 's' : ''}{won ? ' (première victoire du jour)' : ''}</small></span> : null}
          {missions > 0 && <span className="cf-gain"><b>✓ {missions}</b> <small>mission{missions > 1 ? 's' : ''} du jour</small></span>}
          {note && <small className="cf-gain-note">{note}</small>}
          {error && <small className="cf-gain-note">{error}</small>}
          {!reward && rewarded && !spectator && <small className="cf-gain-note">Calcul des gains…</small>}
          {!reward && !rewarded && bot && <small className="cf-gain-note">{guest ? 'Partie d’essai : aucun gain.' : 'Partie d’entraînement : pas de capsules cette fois.'}</small>}
        </div>
        {guest && bot && <button className="cf-link" onClick={onAccount}>Créer un compte gratuit pour gagner des capsules</button>}
        <div className="cf-modal-btns">
          <button className="cf-btn ghost" onClick={onExit}>Menu du mode</button>
          {onAgain && <button className="cf-btn gold" onClick={onAgain}>Rejouer</button>}
        </div>
      </div>
    </div>
  );
}
