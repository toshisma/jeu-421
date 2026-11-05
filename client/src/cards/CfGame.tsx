/**
 * Coups Fourrés : l'écran de partie (refait le 5 novembre d'après les prototypes CFN validés par Sam :
 * CFNTourAdverse, CFNVotreTour, CFNRiposte, CFNPiege, CFNFiche).
 *
 * Haut : quitter, titre, journal, tchat (en ligne), aide, son ; la frise de la manche ; l'adversaire
 * (jetons, Tournées, cartes en main, pièges cachés bien visibles, Habitués touchables).
 * Centre : le bandeau d'instruction et le bac 3D du jeu de base (dés animés, garder au toucher).
 * Bas : « N cartes jouables maintenant », la main (cartes jouables dorées, avec leur raison), mes
 * jetons, Tournées, Habitués et pièges, l'ardoise, les actions.
 * Chaque action adverse est annoncée en grand au centre, une par une (touchez pour passer) ; les
 * pièges et annulations qui vous frappent demandent « Compris ».
 *
 * Ne dépend que de CfController : contre l'ordinateur (local.ts), en ligne (online.ts) et la partie
 * guidée (tutorial.ts) passent par le même écran.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CARD_BY_ID, CF_RULES } from '../../../shared/cards/catalog';
import type { CfAction, CfEvent } from '../../../shared/cards/engine';
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
import { comboOf, isBigShot, nameIn, plural, rerollLabel } from './describe';
import { RulesContent } from './CfInfo';
import { TypeIcon } from './cardTypes';
import { decisionBanner, friseSteps, handHints, planEvents, shortCombo, type Announce } from './board';
import {
  AnnounceView, ChoiceWindow, EndScreen, Fiche, Frise, Glasses, Hand, HelpSheet, Journal, Mulligan, OppPanel, RespondPanel, Tokens,
  TrapSheet, shortName, type FicheTarget, type LogLine,
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
  const annDone = useRef<(() => void) | null>(null);
  const annTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [strip, setStrip] = useState<Announce | null>(null);
  const [stage, setStage] = useState<'comptes' | null>(null);
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
  useEffect(() => { if (!bigShot) return; const t = setTimeout(() => setBigShot(null), 2300); return () => clearTimeout(t); }, [bigShot]);

  // ----------------------------------------------------------------------------------------------
  // File d'annonces : chaque mise à jour est jouée (dés, annonces une par une) avant d'afficher l'état suivant.
  const showAnn = useCallback((a: Announce) => new Promise<void>((resolve) => {
    if (!alive.current) { resolve(); return; }
    annDone.current = () => { annDone.current = null; if (annTimer.current) clearTimeout(annTimer.current); if (alive.current) setAnn(null); resolve(); };
    setAnn(a);
    if (!a.block || spectator) annTimer.current = setTimeout(() => annDone.current?.(), reduced() ? Math.min(a.ms, 2000) : a.ms);
  }), [spectator]);
  const skipAnn = useCallback(() => annDone.current?.(), []);

  const rollTray = useCallback(async (player: string, dice: number[], keepMask: boolean[], prev: number[]) => {
    const t = tray.current;
    if (!t) return;
    t.setInteractive(false);
    t.setKept(NO_KEEP);
    if (trayDice.current.owner !== player && prev.some((x) => x > 0) && keepMask.some(Boolean)) t.showValues(prev);
    const big = isBigShot(dice) && !keepMask.every(Boolean) ? isBigShot(dice) : null;
    await t.roll(dice, keepMask, nextSeed(), undefined, !!big);
    trayDice.current = { owner: player, dice: [...dice] };
    if (big) {
      sound.jackpot();
      t.celebrate(null);
      setBigShot({ text: big === '421' ? '4-2-1 !' : 'Trois as !', who: player, key: Date.now() });
      await wait(1300);
    }
  }, []);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAnimating(true);
    while (queue.current.length && alive.current) {
      const item = queue.current.shift()!;
      const prev = snapRef.current;
      const viewer = spectator ? '' : meRef.current;
      if (logRound.current === null) logRound.current = prev?.view.round ?? item.snap.view.round;
      const lines: LogLine[] = [];
      for (const e of item.events) {
        if (e.kind === 'manche') logRound.current = (logRound.current ?? 0) + 1;
        if (e.kind !== 'tour' && e.kind !== 'pioche') lines.push({ key: ++logKey.current, round: Math.max(1, logRound.current ?? 1), ev: e });
      }
      if (lines.length) setLog((l) => [...l, ...lines].slice(-300));
      const steps = planEvents(item.events, viewer, item.snap.view, prev?.view ?? null);
      for (const st of steps) {
        if (!alive.current) break;
        if (st.kind === 'dice') {
          const e = st.ev;
          const before = prev?.view.players.find((p) => p.id === e.player)?.r.dice ?? [0, 0, 0];
          const moved = e.kind === 'lancer' ? [0, 1, 2].filter((i) => !e.kept?.[i]) : e.rolled ?? e.dice!.map((x, i) => (x !== before[i] ? i : -1)).filter((i) => i >= 0);
          const keepMask = [0, 1, 2].map((i) => !moved.includes(i));
          if (st.strip) setStrip(st.strip);
          const t0 = Date.now();
          if (moved.length) await rollTray(e.player!, e.dice!, keepMask, trayDice.current.owner === e.player ? trayDice.current.dice : before);
          if (st.strip) { await wait(Math.max(0, Math.min(st.strip.ms, 1400) - (Date.now() - t0))); if (alive.current) setStrip(null); }
          continue;
        }
        const a = st.ann;
        if (a.style === 'strip') {
          setStrip(a);
          await wait(reduced() ? Math.min(a.ms, 900) : a.ms);
          if (alive.current) setStrip(null);
          continue;
        }
        if (a.style === 'comptes') {
          setStage('comptes');
          const lr = item.snap.view.lastRound;
          if (lr && lr.amount > 0 && lr.winner && lr.loser) {
            sound.chips(Math.min(8, lr.amount));
            const [from, to] = lr.reversed ? [lr.loser, lr.winner] : [lr.winner, lr.loser];
            setTimeout(() => flyTokens(tokRefs.current[from], tokRefs.current[to], lr.amount), 350);
          }
          await showAnn(a);
          if (alive.current) setStage(null);
          continue;
        }
        if (a.style === 'reveal') sound.party('thunder', 0.7);
        else if (a.style === 'trap') sound.click();
        else sound.party('pop', 0.5);
        await showAnn(a);
      }
      snapRef.current = item.snap;
      setSnap(item.snap);
    }
    busy.current = false;
    if (alive.current) setAnimating(false);
  }, [rollTray, showAnn, spectator]);

  useEffect(() => controller.subscribe((s, events) => { queue.current.push({ snap: s, events }); void pump(); }), [controller, pump]);

  // ----------------------------------------------------------------------------------------------
  const v = snap?.view ?? null;
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
  const turnKey = v ? `${v.round}|${v.order[v.turn]}|${meP?.r.throwsUsed ?? 0}|${v.phase}` : '';
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
  const { hints, playable } = handHints(v, legal, discardMode);
  const turnId = v.phase === 'turn' ? v.order[v.turn] : null;
  const turnP = turnId ? v.players.find((p) => p.id === turnId) ?? null : null;
  const myCombo = comboOf(v, meP);
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
    : `Manche ${v.round}${mode ? ` · ${mode}` : ''} · ${turnP ? (turnP.id === me ? 'à vous' : `${turnP.name} joue`) : v.phase === 'lastword' ? 'Dernier mot' : 'comptes'}`;
  const myTraps = v.traps.filter((t) => t.owner === me);
  const respWin = snap.responseWindow && snap.responseWindow.player !== me && snap.responseWindow.until > now ? snap.responseWindow : null;
  const overlayOpen = !!ann || animating;

  let trayLabel = '';
  if (turnP && turnP.id !== me) {
    const c = comboOf(v, turnP);
    trayLabel = c ? `${turnP.name} : ${shortCombo(c.label)} en ${plural(turnP.r.throwsUsed, 'lancer')}` : `${turnP.name} va lancer`;
  } else if (myCombo && turnP?.id === me) trayLabel = `Vous : ${shortCombo(myCombo.label)}${canKeep ? ' · touchez un dé pour le garder' : ''}`;
  else if (myCombo) trayLabel = `Vous : ${shortCombo(myCombo.label)} · vaut ${myCombo.value}`;

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

      <div className={`cfn-banner ${banner.mine ? banner.tone : 'wait'}`} role="status">
        {banner.mine ? <><b>{banner.title}</b><span>{banner.text}</span></> : <span>{animating && !banner.text ? '…' : banner.text}</span>}
        {clock && <em className={`cfn-clock${clock.low ? ' low' : ''}`}>{clock.text}</em>}
      </div>

      <div className={`cfn-trayzone${fx('tray')}`}>
        <DiceTray ref={tray} appearance={pa.profile.equipped} quality={settings.quality} onDieClick={onDie} cup={settings.cup} />
        {strip && <div key={`${strip.title}`} className={`cfn-strip t-${strip.tone}`} role="status">{strip.tone in TONE_ICON && <TypeIcon type={TONE_ICON[strip.tone]!} size={14} />}{strip.title}</div>}
        {!strip && notice && <div key={notice.key} className="cfn-strip t-info" role="status">{notice.text}</div>}
        {respWin && !ann && (
          <div className="cfn-respwin" role="status">{respWin.kind === 'lastword' ? 'Dernier mot possible' : 'Réponse possible'} : {nameIn(v, respWin.player)}… <b>{Math.ceil((respWin.until - now) / 1000)} s</b></div>
        )}
        {trayLabel && <span className="cfn-traylabel">{trayLabel}</span>}
        {josiane && <div className="cfn-strip t-habitue">Touchez le dé que Josiane doit relancer</div>}
      </div>

      <div className="cfn-me">
        <div className="cfn-count-row">
          {mine && playable > 0 && !discardMode && <span className="cfn-count"><i aria-hidden />{plural(playable, 'carte')} jouable{playable > 1 ? 's' : ''} maintenant</span>}
          {discardMode && <span className="cfn-count violet">Touchez une carte à défausser ({hand.length}/{v.rules.handMax})</span>}
          {(meP.habitues.length > 0 || myTraps.length > 0) && (
            <span className="cfn-inplay-mine">
              {meP.habitues.map((h) => <button key={h.uid} className="cfn-hab" onClick={() => setFiche({ id: h.id, owner: me, uid: h.uid })}><TypeIcon type="habitue" size={12} />{shortName(h.id)}</button>)}
              {myTraps.map((t) => <button key={t.uid} className="cfn-hab trap" onClick={() => t.id && setFiche({ id: t.id, trapUid: t.uid })} aria-label={`Votre piège posé : ${t.id ? CARD_BY_ID[t.id]?.name : ''}`}><TypeIcon type="piege" size={12} />{t.id ? shortName(t.id) : 'Piège'}</button>)}
            </span>
          )}
        </div>
        {spectator ? (
          <div className="cfn-spect"><span className="cfn-backs">{Array.from({ length: Math.min(meP.handCount, 7) }, (_, i) => <i key={i} className="cfn-bk" />)}</span><small>Vous regardez la partie · main de {meP.name} cachée</small></div>
        ) : hand.length > 0 ? (
          <Hand cards={hand} hints={hints} sel={fiche?.uid ?? null} focus={focus === 'hand'}
            onPick={(uid) => { sound.click(); setJosiane(false); const k = hand.find((x) => x.uid === uid); if (k) setFiche({ uid, id: k.id }); }} />
        ) : <div className="cfn-hand-empty">Aucune carte en main</div>}
        <div className={`cfn-bar${fx('me')}`}>
          <Tokens n={meP.tokens} refEl={(el) => { tokRefs.current[me] = el; }} />
          <Glasses n={meP.tournees} max={v.rules.tourneesMax} />
          <span className="cfn-grow" />
          {ardoise ? <button className={`cfn-ardoise${fx('ardoise')}`} disabled={pending}
            onClick={async () => { if (isTuto || await askConfirm(`L’ardoise (une fois par partie) : +${v.rules.ardoiseLoan} Tournées tout de suite, mais rien à la prochaine manche.`, 'Prendre l’ardoise')) void act(ardoise); }}>Ardoise</button>
            : meP.ardoiseUsed ? <span className="cfn-ardoise used">Ardoise prise</span> : null}
        </div>
        <div className="cfn-actions">
          {myTurn && meP.r.throwsUsed === 0 && <button className={`cfn-act roll${fx('roll')}`} disabled={pending} onClick={roll}><Icon name="dice" size={20} />Lancer les dés</button>}
          {canRollAgain && <button className={`cfn-act roll${fx('tray')}`} disabled={pending || allKept} onClick={roll}>{rerollLabel(meP.r.dice, keep)}</button>}
          {myTurn && josianeAct && !josiane && <button className="cfn-act ghost slim" onClick={() => setJosiane(true)}>Josiane</button>}
          {josiane && <button className="cfn-act ghost slim" onClick={() => setJosiane(false)}>Annuler</button>}
          {stopAct && <button className={`cfn-act ghost${canRollAgain ? ' slim' : ''}${fx('stop')}`} disabled={pending} onClick={() => void act(stopAct)}>M’arrêter</button>}
          {lastwordMine && <button className="cfn-act ghost" disabled={pending || !legal.some((a) => a.type === 'pass')} onClick={() => void act({ type: 'pass' })}>Passer</button>}
          {!myTurn && !lastwordMine && v.phase !== 'over' && <div className="cfn-wait">{spectator ? 'Vous regardez la partie' : discardMode ? 'Défaussez une carte' : animating ? 'Patientez…' : 'Attendez votre tour…'}</div>}
        </div>
      </div>

      {bigShot && (
        <div key={bigShot.key} className="bigshot cfn-bigshot" aria-live="assertive">
          <div className="bs-rays" />
          <div className="bs-text">{bigShot.text}</div>
          <div className="bs-who">{nameIn(v, bigShot.who)}</div>
        </div>
      )}
      {ann && <AnnounceView a={ann} onDone={skipAnn} spectator={spectator} me={spectator ? '' : me} v={snapRef.current?.view ?? v} />}
      {toast && <div key={toast.key} className="cf-toast is-err" role="alert">{toast.text}</div>}

      {!overlayOpen && mulliganMine && <Mulligan v={v} legal={legal} pending={pending} onAct={act} clock={clock?.text} />}
      {!overlayOpen && respondMine && <RespondPanel v={v} legal={legal} pending={pending} onAct={act} deadline={deadline} focus={focus === 'respond'} />}
      {!overlayOpen && choiceMine && <ChoiceWindow v={v} legal={legal} pending={pending} onAct={act} focus={focus === 'choice'} />}
      {(snap.finished || v.phase === 'over') && !animating && <EndScreen snap={snap} v={v} me={me} onExit={close} onAgain={onAgain} onAccount={onAccount}
        bot={controller.kind === 'bot'} guest={!pa.isAccount} ranked={controller.ranked} spectator={spectator} rewarded={(controller as { rewarded?: boolean }).rewarded ?? controller.kind === 'online'} />}

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
      {guide && !snap.finished && !overlayOpen && !fiche && (respondMine || choiceMine) && <div className="cfn-tuto at-top slim" role="status"><p>{guide.text}</p></div>}
    </div>
  );
}

const TONE_ICON: Partial<Record<string, 'coup' | 'piege' | 'riposte' | 'dernier-mot' | 'habitue'>> = { coup: 'coup', piege: 'piege', riposte: 'riposte', 'dernier-mot': 'dernier-mot', habitue: 'habitue' };

/** Bulle de la partie guidée : texte court, une seule action attendue, « Passer le tutoriel ». */
function TutoBubble({ g, onNext, onSkip }: { g: NonNullable<CfSnapshot['guide']>; onNext: () => void; onSkip: () => void }) {
  return (
    <div className={`cfn-tuto at-${g.focus === 'opp' || g.focus === 'tray' ? 'bottom' : 'top'}`} role="dialog" aria-live="polite" aria-label="Partie guidée">
      <div className="cfn-tuto-head"><b>{g.title ?? 'Partie guidée'}</b><small>{g.index}/{g.total}</small><button className="cfn-tuto-skip" onClick={onSkip}>Passer le tutoriel</button></div>
      <p>{g.text}</p>
      {g.next && <button className="cfn-act gold full" onClick={onNext} autoFocus>{g.next}</button>}
    </div>
  );
}
