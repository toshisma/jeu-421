/**
 * Poker menteur : l'écran de partie (commun au solo et à l'en ligne). Mobile d'abord :
 *  - en haut, les adversaires (vies, gobelet, tour, chrono) ;
 *  - au milieu, la table 3D (gobelet qui glisse, se secoue, se soulève ; dés touchés pour la relance),
 *    l'annonce en cours en gros, « Menteur ! » et la révélation par-dessus ;
 *  - l'historique des annonces de la manche ;
 *  - en bas, moi et mes boutons : « Je crois » / « Menteur ! », relance, annonce (bouton principal = la
 *    main immédiatement supérieure, « Autre annonce » pour monter plus haut).
 * L'animateur rejoue chaque action reçue (événements du moteur) avant d'afficher l'état suivant.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cat, catsOf, claimOptions, evaluate, isTop, nextHigher, rankOf, canon, CAT_PICKS } from '../../../shared/pokermenteur/hands';
import { canBelieve, lastClaim, type PmAction, type PmEvent, type PmState } from '../../../shared/pokermenteur/engine';
import { PM_FACE_INK } from '../../../shared/pokermenteur/look';
import type { PmPersona } from '../../../shared/pokermenteur/personas';
import { PmScene } from './PmScene';
import { catName, faceLetter, faceLetters, handFull, handName } from './labels';
import { Avatar } from '../ui/Avatar';
import { RepBadge } from '../ui/RepBadge';
import type { RepInfo } from '../../../shared/progress/repu';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/kit';
import { sound } from '../audio/sound';
import { getLang, tr, useLang } from '../i18n/lang';
import type { Settings } from '../settings';

export interface Seat { id: string; name: string; avatar: string; color: string; photo?: string | null; isMe: boolean; bot?: boolean; persona?: PmPersona; away?: boolean; left?: boolean; rep?: RepInfo }
export interface Step { state: PmState; events: PmEvent[]; by: string; snapshot?: boolean }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Petit dé de poker en 2D (historique, règles, sélecteur). */
export function PmDie({ v, size = 22, dim }: { v: number; size?: number; dim?: boolean }) {
  return <span className={`pk-die${dim ? ' dim' : ''}`} style={{ width: size, height: size, fontSize: size * (faceLetter(v).length > 1 ? 0.5 : 0.62), color: PM_FACE_INK[v] }} aria-hidden>{faceLetter(v)}</span>;
}
export function PmDice({ dice, size = 20 }: { dice: readonly number[]; size?: number }) {
  return <span className="pk-dice" aria-label={dice.map(faceLetter).join(' ')}>{canon(dice).map((v, i) => <PmDie key={i} v={v} size={size} />)}</span>;
}

// ---------------------------------------------------------------------------------------------
// Animateur

export interface Flash { kind: 'menteur' | 'reveal' | 'say'; id: number; who?: string; text?: string; reveal?: PmState['lastReveal']; top?: boolean }

export function usePmAnimator(initial: PmState, meId: string | null, onEvent?: (e: PmEvent, s: PmState) => void) {
  const [shown, setShown] = useState<PmState>(initial);
  const [busy, setBusy] = useState(true);
  const [flash, setFlash] = useState<Flash[]>([]);
  const [lastAnn, setLastAnn] = useState<{ by: string; id: number } | null>(null);
  const queue = useRef<Step[]>([]);
  const running = useRef(false);
  const scene = useRef<PmScene | null>(null);
  const shownRef = useRef(initial);
  const evRef = useRef(onEvent);
  evRef.current = onEvent;
  const fid = useRef(0);
  const show = (s: PmState) => { shownRef.current = s; setShown(s); };
  const seatIndex = (s: PmState, id: string) => Math.max(0, s.players.findIndex((p) => p.id === id));
  const addFlash = (f: Omit<Flash, 'id'>, ms: number) => {
    const id = ++fid.current;
    setFlash((l) => [...l.filter((x) => x.kind !== f.kind || f.kind === 'say'), { ...f, id }]);
    setTimeout(() => setFlash((l) => l.filter((x) => x.id !== id)), ms);
  };

  const place = useCallback((s: PmState) => {
    const sc = scene.current;
    if (!sc) return;
    sc.setSeats(s.players.length, meId ? Math.max(0, s.players.findIndex((p) => p.id === meId)) : null);
    void sc.cupTo(s.holder, false);
    if (s.dice && s.phase !== 'fini') void sc.peek(s.dice, false);
  }, [meId]);

  const play = useCallback(async (st: Step) => {
    const sc = scene.current;
    const s = st.state;
    if (st.snapshot || !sc) { show(s); place(s); return; }
    let revealed = false;
    for (const e of st.events) {
      evRef.current?.(e, s);
      switch (e.kind) {
        case 'manche':
          if (revealed) { await wait(1500); await sc.collect(seatIndex(s, e.playerId)); revealed = false; }
          else await sc.cupTo(seatIndex(s, e.playerId));
          break;
        case 'secoue':
          sound.rattle();
          await sc.shake(650);
          if (s.dice && meId === e.playerId) { await sc.peek(s.dice); sound.click(); }
          break;
        case 'annonce':
          sound.turn();
          // Mes dés repassent sous le gobelet avant l'annonce.
          if (meId === e.playerId) await sc.cupTo(seatIndex(s, e.playerId));
          show({ ...shownRef.current, claims: [...shownRef.current.claims, { hand: e.hand, by: e.playerId, rerolled: 0 }] });
          setLastAnn({ by: e.playerId, id: ++fid.current });
          await wait(650);
          break;
        case 'croit':
          sound.click();
          await sc.cupTo(seatIndex(s, e.playerId));
          if (s.dice && meId === e.playerId) await sc.peek(s.dice);
          break;
        case 'relance':
          if (meId === e.playerId && s.dice) { if (e.positions.length) { sound.rattle(); await sc.reroll(e.positions, s.dice); } }
          else if (e.positions.length) { sound.rattle(); await sc.shake(500); }
          addFlash({ kind: 'say', who: e.playerId, text: e.positions.length ? tr(e.positions.length > 1 ? 'pm.rerollN' : 'pm.reroll1', { n: e.positions.length }) : tr('pm.keepAll') }, 1800);
          break;
        case 'menteur':
          sound.party('boom', 0.6);
          addFlash({ kind: 'menteur', who: e.playerId }, 1300);
          await wait(900);
          break;
        case 'revelation': {
          const top = e.reveal.truth && isTop(e.reveal.dice);
          await sc.reveal(e.reveal.dice, top);
          addFlash({ kind: 'reveal', reveal: e.reveal, top }, 3200);
          if (e.reveal.loser === meId) sound.lose(); else if (meId) sound.chips(2);
          revealed = true;
          await wait(900);
          break;
        }
        case 'vie':
          show({ ...shownRef.current, players: shownRef.current.players.map((p) => (p.id === e.playerId ? { ...p, lives: e.lives } : p)) });
          await wait(450);
          break;
        case 'elimine':
          await wait(500);
          break;
        case 'fin':
          if (revealed) await wait(1200);
          if (meId) (s.winner === meId ? sound.win() : sound.lose());
          break;
      }
    }
    show(s);
    if (s.phase !== 'fini' && sc.holderSeat !== s.holder) await sc.cupTo(s.holder);
  }, [meId, place]);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    while (queue.current.length) {
      const st = queue.current.shift()!;
      try { await play(st); } catch { show(st.state); }
    }
    running.current = false;
    setBusy(false);
  }, [play]);
  const push = useCallback((st: Step) => { queue.current.push(st); void pump(); }, [pump]);
  const attach = useCallback((sc: PmScene | null) => { scene.current = sc; if (sc) { place(shownRef.current); } }, [place]);
  return { shown, busy, flash, lastAnn, push, attach, scene };
}

// ---------------------------------------------------------------------------------------------
// Écran

function Lives({ n, max, big }: { n: number; max: number; big?: boolean }) {
  return <span className={`pk-lives${big ? ' big' : ''}`} aria-label={tr('pm.livesN', { n })}>{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}
function useCountdown(deadline: number | null | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!deadline) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

export interface BoardProps {
  anim: ReturnType<typeof usePmAnimator>;
  seats: Seat[];
  meId: string | null;
  /** Je peux jouer (pas spectateur, connexion ok). */
  canAct: boolean;
  onAct: (a: PmAction) => Promise<string | null> | string | null | void;
  onLeave: () => void;
  settings: Settings;
  deadline?: number | null;
  end?: React.ReactNode;
  /** Bandeau (connexion perdue, spectateur…). */
  banner?: React.ReactNode;
  extra?: React.ReactNode;
  /** Par-dessus la table (répliques des habitués). */
  overlay?: React.ReactNode;
  onRules: () => void;
}

export function PmBoard({ anim, seats, meId, canAct, onAct, onLeave, settings, deadline, end, banner, extra, overlay, onRules }: BoardProps) {
  useLang();
  const s = anim.shown;
  const ns = s.options.noStraights;
  const host = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState([false, false, false, false, false]);
  const [picker, setPicker] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const seatOf = (id: string | undefined) => seats.find((x) => x.id === id);
  const nameOf = (id: string | undefined) => { const x = seatOf(id); return x ? (x.isMe ? tr('pm.you') : x.name) : '?'; };
  const cur = s.players[s.current];
  const mine = !!meId && cur?.id === meId && s.phase !== 'fini' && canAct;
  const ready = mine && !anim.busy && !sending;
  const last = lastClaim(s);
  const secs = useCountdown(deadline);

  // Scène 3D : créée une fois, lettres suivant la langue.
  const lang = getLang();
  useEffect(() => {
    if (!host.current) return;
    let sc: PmScene | null = null;
    try { sc = new PmScene(host.current, faceLetters(), { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, quality: settings.quality === 'haute' ? 'haute' : 'normale' }); }
    catch { sc = null; }
    anim.attach(sc);
    return () => { anim.attach(null); sc?.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { anim.scene.current?.setLabels(faceLetters()); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Relance : toucher les dés.
  const relance = ready && s.phase === 'relance';
  useEffect(() => {
    const sc = anim.scene.current;
    if (!sc) return;
    if (relance) sc.setPicking(true, (i) => { sound.click(); setSel((v) => { const n = [...v]; n[i] = !n[i]; sc.setSelected(n); return n; }); });
    else { sc.setPicking(false); setSel([false, false, false, false, false]); }
  }, [relance, anim.scene]);

  const send = async (a: PmAction) => {
    if (!ready) return;
    setSending(true); setErr(null);
    sound.unlock();
    const r = await onAct(a);
    setSending(false);
    if (typeof r === 'string') setErr(r);
    setPicker(false);
  };
  const toggle = (i: number) => { setSel((v) => { const n = [...v]; n[i] = !n[i]; anim.scene.current?.setSelected(n); return n; }); };

  // Annonce par défaut : la main immédiatement supérieure (ma vraie main au premier coup de la manche).
  const myHand = s.dice && meId && s.players[s.holder]?.id === meId ? s.dice : null;
  const suggest = s.phase === 'annonce' ? (last ? nextHigher(last.hand, ns) : myHand ? canon(myHand) : nextHigher(null, ns)) : null;
  const truthful = (h: readonly number[] | null) => !!h && !!myHand && rankOf(myHand, ns) >= rankOf(h, ns);
  const meSeat = seats.find((x) => x.isMe);
  const mePlayer = meId ? s.players.find((p) => p.id === meId) : undefined;
  const others = useMemo(() => {
    const i = meId ? s.players.findIndex((p) => p.id === meId) : -1;
    const n = s.players.length;
    return Array.from({ length: n }, (_, k) => s.players[(i + 1 + k + n) % n]).filter((p) => p.id !== meId);
  }, [s.players, meId]);
  const reveal = anim.flash.find((f) => f.kind === 'reveal');
  const stamp = anim.flash.find((f) => f.kind === 'menteur');
  const nSel = sel.filter(Boolean).length;
  const status = s.phase === 'fini' ? '' : mine ? '' : s.phase === 'decision' ? tr('pm.st.decide', { name: nameOf(cur?.id) })
    : s.phase === 'relance' ? tr('pm.st.reroll', { name: nameOf(cur?.id) }) : tr('pm.st.announce', { name: nameOf(cur?.id) });

  return (
    <div className="pk-board">
      <header className="pk-top">
        <button className="pk-quit" onClick={onLeave} aria-label={tr('pm.quit')}><Icon name="back" size={18} /><span>{tr('pm.quit')}</span></button>
        <b className="pk-round">{tr('pm.round', { n: Math.max(1, s.round) })}{ns && <small> · {tr('pm.noStraightsShort')}</small>}</b>
        <button className="icon-btn" onClick={onRules} aria-label={tr('pm.rules')}><Icon name="rules" size={20} /></button>
      </header>
      {banner}
      <ul className="pk-seats" style={{ ['--n' as string]: others.length }}>
        {others.map((p) => {
          const st = seatOf(p.id);
          const say = anim.flash.filter((f) => f.kind === 'say' && f.who === p.id).pop();
          return (
            <li key={p.id} className={`pk-seat${cur?.id === p.id && s.phase !== 'fini' ? ' turn' : ''}${p.out ? ' out' : ''}${st?.away || st?.left ? ' away' : ''}`} style={{ ['--pc' as string]: st?.color ?? '#999' }}>
              <span className="pk-seat-av"><Avatar photo={st?.photo ?? null} emoji={st?.avatar} size={36}><RepBadge rep={st?.rep} className="rep-on-av" /></Avatar>{s.players[s.holder]?.id === p.id && s.phase !== 'fini' && <i className="pk-cupmark" aria-label={tr('pm.holds')} />}</span>
              <b>{st?.name ?? p.name}</b>
              {p.out ? <small className="pk-outlbl">{tr('pm.out')}</small> : <Lives n={p.lives} max={s.options.lives} />}
              {cur?.id === p.id && secs != null && s.phase !== 'fini' && <em className="pk-secs">{secs}</em>}
              {say && <span className="pk-say" key={say.id}>{say.text}</span>}
            </li>
          );
        })}
      </ul>

      <div className="pk-stage">
        <div className="pk-host" ref={host} />
        {last && s.phase !== 'fini' && !reveal && (
          <div className={`pk-claim${anim.lastAnn ? ' pop' : ''}`} key={anim.lastAnn?.id ?? 0} aria-live="polite">
            <small>{last.by === meId ? tr('pm.claimByYou') : tr('pm.claimBy', { name: nameOf(last.by) })}</small>
            <b>{handName(last.hand, ns)}</b>
            <PmDice dice={last.hand} size={18} />
          </div>
        )}
        {stamp && <div className="pk-stamp" key={stamp.id}><span>{tr('pm.liar')}</span><small>{nameOf(stamp.who)}</small></div>}
        {reveal?.reveal && (
          <div className={`pk-reveal${reveal.reveal.truth ? ' truth' : ' lie'}${reveal.top ? ' top' : ''}`} key={reveal.id} role="status">
            <small>{reveal.reveal.by === meId ? tr('pm.rv.claimedYou') : tr('pm.rv.claimed', { name: nameOf(reveal.reveal.by) })}</small>
            <b>{handName(reveal.reveal.claim, ns)}</b>
            <small>{tr('pm.rv.under')}</small>
            <b>{handFull(reveal.reveal.dice, ns)}</b>
            <strong>{reveal.reveal.truth ? tr('pm.rv.truth') : tr('pm.rv.lie')}</strong>
            <em>{reveal.reveal.loser === meId ? tr('pm.rv.youLose') : tr('pm.rv.loses', { name: nameOf(reveal.reveal.loser) })}</em>
          </div>
        )}
        {relance && <div className="pk-pickhint">{tr('pm.tapDice')}</div>}
        {overlay}
      </div>

      {s.claims.length > 0 && s.phase !== 'fini' && (
        <ol className="pk-hist" aria-label={tr('pm.history')}>
          {s.claims.map((c, i) => <li key={i} className={i === s.claims.length - 1 ? 'last' : ''}><span>{nameOf(c.by)}</span> {handFull(c.hand, ns)}</li>)}
        </ol>
      )}

      <section className={`pk-mine${mine ? ' turn' : ''}`}>
        <div className="pk-me">
          {meSeat ? <Avatar photo={meSeat.photo ?? null} emoji={meSeat.avatar} size={32} /> : <Icon name="user" size={22} />}
          <span className="pk-me-txt">
            <b>{meSeat ? tr('pm.you') : tr('pm.spectator')}</b>
            {mePlayer && (mePlayer.out ? <small className="pk-outlbl">{tr('pm.out')}</small> : <Lives n={mePlayer.lives} max={s.options.lives} big />)}
          </span>
          {myHand && s.phase !== 'decision' && <span className="pk-myhand"><small>{tr('pm.myHand')}</small><b>{handName(myHand, ns)}</b></span>}
          {mine && secs != null && <em className="pk-secs me">{secs}</em>}
        </div>
        {err && <p className="pk-err" role="alert">{err}</p>}
        <div className="pk-actions">
          {!mine && s.phase !== 'fini' && <p className="pk-wait">{anim.busy ? '…' : status}</p>}
          {mine && s.phase === 'decision' && <>
            {canBelieve(s)
              ? <button className="btn pk-believe" disabled={!ready} onClick={() => void send({ type: 'croire' })}><b>{tr('pm.believe')}</b><small>{tr('pm.believeSub')}</small></button>
              : <p className="pk-hint">{tr('pm.topOnly')}</p>}
            <button className="btn pk-liar" disabled={!ready} onClick={() => void send({ type: 'menteur' })}>{tr('pm.liar')}</button>
          </>}
          {mine && s.phase === 'relance' && <>
            <div className="pk-sel" role="group" aria-label={tr('pm.tapDice')}>
              {myHand?.map((v, i) => <button key={i} className={sel[i] ? 'on' : ''} aria-pressed={sel[i]} onClick={() => toggle(i)}><PmDie v={v} size={30} /></button>)}
            </div>
            <button className="btn primary pk-go" disabled={!ready} onClick={() => void send({ type: 'relancer', pick: sel.flatMap((x, i) => (x ? [i] : [])) })}>
              {nSel ? tr(nSel > 1 ? 'pm.rerollBtnN' : 'pm.rerollBtn1', { n: nSel }) : tr('pm.keepBtn')}
            </button>
          </>}
          {mine && s.phase === 'annonce' && suggest && <>
            <button className="btn primary pk-go pk-announce" disabled={!ready} onClick={() => void send({ type: 'annoncer', hand: suggest })}>
              <small>{last ? tr('pm.announceNext') : tr('pm.announceMine')}</small>
              <b>{handFull(suggest, ns)}</b>
              {myHand && <em className={truthful(suggest) ? 'true' : 'bluff'}>{truthful(suggest) ? tr('pm.true') : tr('pm.bluff')}</em>}
            </button>
            <button className="btn secondary pk-more" disabled={!ready} onClick={() => setPicker(true)}>{tr('pm.other')}</button>
          </>}
        </div>
      </section>
      {extra}
      {picker && s.phase === 'annonce' && <ClaimPicker above={last?.hand ?? null} mine={myHand} ns={ns} onClose={() => setPicker(false)} onPick={(h) => void send({ type: 'annoncer', hand: h })} />}
      {end}
    </div>
  );
}

/** Choisir une annonce plus haute : catégorie, puis valeurs. */
function ClaimPicker({ above, mine, ns, onClose, onPick }: { above: number[] | null; mine: number[] | null; ns: boolean; onClose: () => void; onPick: (h: number[]) => void }) {
  const cats = catsOf(ns).filter((c) => claimOptions(c, above, ns).length > 0);
  const [cat, setCat] = useState<Cat>(() => (cats.includes(evaluate(mine ?? [0, 1, 2, 3, 5], ns).cat) ? evaluate(mine ?? [0, 1, 2, 3, 5], ns).cat : cats[0]));
  const [pick, setPick] = useState<number[] | null>(null);
  const opts = claimOptions(cat, above, ns);
  const myRank = mine ? rankOf(mine, ns) : -1;
  return (
    <Sheet title={tr('pm.pickTitle')} onClose={onClose}>
      <div className="pk-cats" role="tablist">
        {catsOf(ns).map((c) => {
          const ok = cats.includes(c);
          return <button key={c} role="tab" aria-selected={c === cat} disabled={!ok} className={c === cat ? 'on' : ''} onClick={() => { setCat(c); setPick(null); }}>{catName(c)}</button>;
        })}
      </div>
      <p className="muted small">{CAT_PICKS[cat] ? tr('pm.pickHint') : tr('pm.pickHint0')}</p>
      <ul className="pk-opts">
        {opts.map((o) => {
          const on = pick && pick.join() === o.dice.join();
          const isMine = myRank >= 0 && rankOf(o.dice, ns) <= myRank;
          return (
            <li key={o.dice.join()}>
              <button className={on ? 'on' : ''} onClick={() => setPick(o.dice)}>
                <span><b>{handName(o.dice, ns)}</b><PmDice dice={o.dice} size={16} /></span>
                {mine && <em className={isMine ? 'true' : 'bluff'}>{isMine ? tr('pm.true') : tr('pm.bluff')}</em>}
              </button>
            </li>
          );
        })}
      </ul>
      <button className="btn primary wide" disabled={!pick} onClick={() => pick && onPick(pick)}>{pick ? tr('pm.announceX', { h: handFull(pick, ns) }) : tr('pm.pickOne')}</button>
    </Sheet>
  );
}

/** Mains de la plus faible à la plus forte, avec un exemple (aide intégrée et règles). */
export function PmHandsHelp({ ns }: { ns?: boolean }) {
  useLang();
  const ex: [Cat, number[]][] = [
    [Cat.Rien, [5, 4, 3, 1, 0]], [Cat.Paire, [3, 3, 5, 2, 0]], [Cat.DoublePaire, [4, 4, 1, 1, 5]], [Cat.Brelan, [2, 2, 2, 5, 0]],
    [Cat.PetiteSuite, [0, 1, 2, 3, 4]], [Cat.GrandeSuite, [1, 2, 3, 4, 5]], [Cat.Full, [4, 4, 4, 1, 1]], [Cat.Carre, [3, 3, 3, 3, 5]], [Cat.Poker, [5, 5, 5, 5, 5]],
  ];
  return (
    <ol className="pk-help">
      {ex.filter(([c]) => !ns || (c !== Cat.PetiteSuite && c !== Cat.GrandeSuite)).reverse().map(([c, d]) => (
        <li key={c}><span><b>{catName(c)}</b><small>{handName(d, !!ns)}</small></span><PmDice dice={d} size={20} /></li>
      ))}
    </ol>
  );
}
