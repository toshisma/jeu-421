/**
 * Le Courtisan (le jeu de dés traditionnel du Dix mille, ou Farkle) : réglages, parties contre
 * l'ordinateur (gratuites sur l'appareil, ou avec mise jouées par le serveur), tables en ligne de
 * 2 à 6 joueurs, et les Groschen, la monnaie du mode. Le moteur est dans shared/dixmille.
 *
 * Un seul écran de partie (`DmBoard`) sert au solo, au jeu en ligne et aux spectateurs ; le
 * « joueur d'animations » (`useDmAnimator`) rejoue chaque action dans le bac 3D, pour tout le monde
 * de la même façon (graine d'animation partagée en ligne).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { act, currentPlayer, diceAfter, inPlay, newGame, pickPoints, ranking, validSelections, DM_LEVELS, DM_TARGETS, DM_VALUES, type DmAction, type DmEvent, type DmLevel, type DmState } from '../../../shared/dixmille/engine';
import { decide } from '../../../shared/dixmille/ai';
import { usePresenceLayer } from '../presence';
import { DM_TABLE_MAX, type DmPublicMember, type DmPublicTable } from '../../../shared/dixmille/protocol';
import { GROSCHEN_DAILY, GROSCHEN_MAX_STAKE } from '../../../shared/dixmille/groschen';
import { AVATARS, EMOTES, PHRASES } from '../../../shared/protocol';
import type { Appearance } from '../../../shared/progress/catalog';
import { fxDef } from '../../../shared/progress/dice-collection';
import { type Profile, type Reward } from '../../../shared/progress/profile';
import { BagIcon } from '../ui/BagIcon';
import type { ProfileApi } from '../account/useProfile';
import { api } from '../account/api';
import type { Settings } from '../settings';
import type { Insets } from '../three/TrayScene';
import type { ThrowGesture } from '../physics/diceSim';
import { PERSONAS, PERSONA_DICE, type Persona } from '../game/personas';
import { DiceTray, type DiceTrayHandle } from '../ui/DiceTray';
import { BigAction, Choices, Section, Sheet, Shell } from '../ui/kit';
import { DieCube } from '../ui/DiceCollection';
import { MiniDie } from '../ui/MiniDie';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { ModeBar, ModeChip } from '../ui/ModeBar';
import { VolumeControl } from '../ui/VolumeControl';
import { Chat } from '../ui/Chat';
import { askConfirm } from '../ui/confirm';
import { sound } from '../audio/sound';
import { publicUrl } from '../platform';
import { trackEvent } from '../visit';
import { useMyTurnAlert } from '../turnAlert';
import { DmSession, loadDmSession, saveDmSession } from './online';

const fmt = (n: number) => n.toLocaleString('fr-BE');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SETUP_KEY = '421.dixmille';
const COLORS = ['#f1cc7d', '#e2694f', '#4f9fd1', '#a477d6', '#57b07a', '#e0609a'];
export const MODE_NAME = 'Le Courtisan';
/** Version sans serveur (fichier unique) : pas de jeu en ligne ni de Groschen. */
const NO_SERVER = typeof __STANDALONE__ !== 'undefined' && __STANDALONE__;

export interface DmSetup { opponents: number; level: DmLevel; target: number; stake: number }
function loadSetup(): DmSetup {
  try {
    const v = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null');
    if (v && [1, 2, 3].includes(v.opponents) && DM_LEVELS.some((l) => l.v === v.level) && (DM_TARGETS as readonly number[]).includes(v.target)) return { ...v, stake: Number.isInteger(v.stake) && v.stake >= 0 ? v.stake : 0 };
  } catch { /* */ }
  return { opponents: 1, level: 'habitue', target: 4000, stake: 0 };
}
function saveSetup(s: DmSetup) { try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch { /* */ } }

// ---------------------------------------------------------------------------------------------
// Les Groschen

/** Le Groschen : une pièce de bronze percée d'un carré, au liseré d'or (dessin original). */
export function GroschenIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="groschen-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <radialGradient id="gr-fill" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#ffd9a0" /><stop offset=".55" stopColor="#c9813e" /><stop offset="1" stopColor="#7a4518" /></radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#gr-fill)" stroke="#f3cf7a" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="#5b2f0e" strokeOpacity=".45" strokeWidth=".9" strokeDasharray="1.4 1.2" />
      <rect x="9.4" y="9.4" width="5.2" height="5.2" rx=".6" fill="#2a1606" stroke="#ffe3a8" strokeOpacity=".6" strokeWidth=".7" transform="rotate(45 12 12)" />
    </svg>
  );
}
export function Groschen({ n, size = 16, sign }: { n: number; size?: number; sign?: boolean }) {
  return <span className="groschen"><GroschenIcon size={size} /><b>{sign && n > 0 ? '+' : ''}{fmt(n)}</b></span>;
}

/** Un mouvement de Groschen (journal du serveur). */
export interface GrMove { delta: number; balance: number; reason: string; ref: string | null; at: number }
/** Solde de Groschen (comptes) : lu sur le serveur, qui verse le cadeau du jour à la première ouverture. */
export function useGroschen(pa: ProfileApi) {
  const [w, setW] = useState<{ balance: number; gift: number; history: GrMove[]; giftToday: boolean } | null>(null);
  const reload = useCallback(() => {
    if (!pa.token) { setW(null); return; }
    api<{ balance: number; gift: number; day: string; history: GrMove[] }>('/dixmille/wallet', { token: pa.token })
      .then((r) => setW((prev) => ({ balance: r.balance, gift: r.gift || prev?.gift || 0, history: r.history ?? [], giftToday: r.gift > 0 || (r.history ?? []).some((m) => m.reason === 'cadeau' && m.ref === r.day) || !!prev?.giftToday })))
      .catch(() => {});
  }, [pa.token]);
  useEffect(() => { reload(); }, [reload]);
  return {
    balance: w?.balance ?? null, gift: w?.gift ?? 0, history: w?.history ?? null, giftToday: !!w?.giftToday,
    dismissGift: () => setW((x) => (x ? { ...x, gift: 0 } : x)), reload,
    setBalance: (b: number) => setW((x) => ({ gift: x?.gift ?? 0, history: x?.history ?? [], giftToday: !!x?.giftToday, balance: b })),
  };
}

function GiftBurst({ amount, onClose }: { amount: number; onClose: () => void }) {
  useEffect(() => { sound.chips(5); const t = setTimeout(onClose, 3800); return () => clearTimeout(t); }, [onClose]);
  return (
    <button className="gr-gift" onClick={onClose} aria-label={`Cadeau du jour : ${amount} Groschen`}>
      <span className="gr-gift-coins" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ ['--i' as string]: i }}><GroschenIcon size={34} /></i>)}</span>
      <b>+{amount} Groschen</b>
      <small>Cadeau du jour du Courtisan</small>
    </button>
  );
}

/** Choix de la mise : gratuit, boutons rapides, ou montant tapé (entier, au plus le solde). */
function StakePicker({ value, onChange, balance, disabled, note }: { value: number; onChange: (v: number) => void; balance: number | null; disabled?: boolean; note?: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => { setText(value ? String(value) : ''); }, [value]);
  const max = Math.min(GROSCHEN_MAX_STAKE, balance ?? 0);
  const quick = [5, 10, 20, 50].filter((n) => n <= max);
  const typed = Number(text);
  const bad = text !== '' && (!Number.isInteger(typed) || typed < 1 || typed > max);
  const commit = (t: string) => {
    setText(t);
    const n = Number(t);
    if (t === '') onChange(0);
    else if (Number.isInteger(n) && n >= 1 && n <= max) onChange(n);
  };
  if (balance == null) return <p className="muted small dm-stake-note">{note ?? 'Les mises en Groschen demandent un compte (gratuit). Vous jouez gratuitement.'}</p>;
  return (
    <div className={`dm-stake${disabled ? ' off' : ''}`}>
      <div className="dm-stake-row">
        <button className={value === 0 ? 'on' : ''} disabled={disabled} onClick={() => commit('')}>Gratuit</button>
        {quick.map((n) => <button key={n} className={value === n ? 'on' : ''} disabled={disabled} onClick={() => commit(String(n))}>{n}</button>)}
      </div>
      <label className={`dm-stake-input${bad ? ' bad' : ''}`}>
        <GroschenIcon size={18} />
        <input inputMode="numeric" pattern="[0-9]*" value={text} disabled={disabled || max < 1} placeholder={max < 1 ? 'Solde vide' : `Mise au choix (1 à ${fmt(max)})`}
          onChange={(e) => commit(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))} aria-label="Mise en Groschen" />
        <small>Solde : {fmt(balance)}</small>
      </label>
      {bad && <p className="error small">{typed > max ? `Vous avez ${fmt(balance)} Groschen.` : 'Un nombre entier, au moins 1.'}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Règles et valeurs

export function DmValues() {
  return (
    <table className="dm-values">
      <tbody>
        {DM_VALUES.map((v) => (
          <tr key={v.label}>
            <td><span className="dm-vdice">{v.dice.map((d, i) => <MiniDie key={i} value={d} size={17} />)}</span></td>
            <td>{v.label}</td>
            <td className="val">{fmt(v.points)}</td>
          </tr>
        ))}
        <tr><td colSpan={3} className="dm-vnote">Quatre dés identiques : le double de trois (quatre 2 = 400). Cinq : encore le double (800), six : encore le double (1 600).</td></tr>
      </tbody>
    </table>
  );
}

export function DmRules({ target }: { target?: number }) {
  return (
    <div className="rules dm-rules">
      <p><b>Le Courtisan</b>, c'est le jeu de dés traditionnel du <b>Dix mille</b> (aussi appelé Farkle), de 2 à 6 joueurs. On joue avec <b>6 dés</b>. Le but : être le premier à atteindre <b>{target ? fmt(target) : 'le score choisi'}</b> points.</p>
      <ol>
        <li>À votre tour, lancez les 6 dés.</li>
        <li><b>Touchez les dés qui rapportent</b> pour les mettre de côté (au moins un). Chaque dé mis de côté doit rapporter : un 1, un 5, ou une combinaison.</li>
        <li>Puis choisissez : <b>Relancer</b> les dés restants pour gagner plus, ou <b>Encaisser</b> les points du tour.</li>
        <li>Si un lancer ne contient <b>aucun dé qui rapporte</b> : <b>Raté !</b> Les points du tour sont perdus, la main passe.</li>
        <li><b>Main pleine :</b> les 6 dés ont été mis de côté en rapportant ? Vous pouvez relancer les 6 et continuer à accumuler.</li>
        <li>Une combinaison compte seulement si ses dés sortent <b>dans le même lancer</b>.</li>
        <li>Le premier qui atteint le score à atteindre en encaissant <b>gagne aussitôt</b> : la partie s'arrête.</li>
      </ol>
      <h3>Valeurs</h3>
      <DmValues />
      <h3>Les Groschen</h3>
      <p>La monnaie du Courtisan (avec un compte gratuit) : <b>+{GROSCHEN_DAILY} Groschen</b> à votre première visite de chaque jour. Jouez gratuitement, ou misez la somme de votre choix : chaque joueur (ordinateurs compris) mise autant, <b>le gagnant emporte tout le pot</b>. Quitter une partie avec mise, c'est perdre sa mise. Monnaie de jeu uniquement, sans argent réel.</p>
      <p className="muted small">Astuce : avec beaucoup de dés, on rate rarement (1 fois sur 32 avec 6 dés) ; avec 1 seul dé, 2 fois sur 3. Parfois, mieux vaut ne garder qu'un 1 et relancer plus de dés.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Joueur d'animations : rejoue chaque action dans le bac (lancer, dés mis de côté, raté, main pleine)

interface Seat { id: string; name: string; avatar: string; color: string; photo?: string | null; persona?: Persona; isMe: boolean; bot?: boolean; away?: boolean; left?: boolean; quit?: boolean; dice?: string; trail?: string }
type Flash = { kind: 'rate'; lost: number; name: string; id: number } | { kind: 'pleine'; id: number } | { kind: 'gain'; points: number; seat: string; id: number };
interface Step { state: DmState; events: DmEvent[]; action: DmAction | null; by: string; animSeed: number; gesture?: ThrowGesture }

function useDmAnimator(tray: React.RefObject<DiceTrayHandle>, initial: DmState, seatsRef: React.MutableRefObject<Seat[]>, fx: { trail?: string | null; fete?: string | null }) {
  const [s, setS] = useState<DmState>(initial);
  const sRef = useRef(s);
  sRef.current = s;
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [say, setSay] = useState<{ seat: string; text: string; id: number } | null>(null);
  const [pick, setPick] = useState<number[]>([]);
  const [sel, setSel] = useState<number[]>([]);
  const queue = useRef<Step[]>([]);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const seatOf = (id: string) => seatsRef.current.find((x) => x.id === id);
  const name = (id: string) => { const x = seatOf(id); return x?.isMe ? 'Vous' : x?.name ?? '?'; };

  const playStep = async (st: Step) => {
    const a = st.action;
    const by = seatOf(st.by);
    if (a && a.type !== 'lancer') {
      if (!by?.isMe) {
        // Les autres voient d'abord les dés mis de côté.
        setPick(a.pick);
        tray.current?.setKept(sRef.current.dice.map((_, i) => a.pick.includes(i)));
        sound.click();
        await wait(600);
        if (!alive.current) return;
        if (a.type === 'encaisser' && by?.persona && sRef.current.turnPoints + (pickPoints(sRef.current, a.pick) ?? 0) >= 1000) setSay({ seat: by.id, text: by.persona.lines.good[0], id: Date.now() });
      }
      const pts = pickPoints(sRef.current, a.pick) ?? 0;
      setS((p) => ({ ...p, turnPoints: p.turnPoints + pts, setAside: [...p.setAside, { dice: a.pick.map((i) => p.dice[i]), points: pts }] }));
    }
    setFlash((f) => (f?.kind === 'gain' ? f : null));
    for (const e of st.events) {
      if (!alive.current) return;
      if (e.kind === 'main-pleine') {
        sound.chips(6); sound.validate();
        setFlash({ kind: 'pleine', id: Date.now() });
        tray.current?.setKept(Array(6).fill(false));
        tray.current?.setHidden(Array(6).fill(false));
        await wait(1100);
      } else if (e.kind === 'lancer') {
        const seat = seatOf(e.playerId);
        tray.current?.setDiceSkin(seat?.isMe ? null : seat?.persona ? PERSONA_DICE[seat.id] ?? null : seat?.dice ?? null);
        tray.current?.setTrail(seat?.isMe ? fx.trail ?? null : seat?.trail ?? null);
        tray.current?.setHidden(e.rolled.map((r) => !r));
        tray.current?.setKept(Array(6).fill(false));
        setS((p) => ({ ...p, out: e.rolled.map((r) => !r), phase: p.phase === 'fini' ? p.phase : 'choisir', rolled: Array(6).fill(false) }));
        await tray.current?.roll(e.dice, e.rolled.map((r) => !r), st.animSeed, st.gesture);
      } else if (e.kind === 'rate') {
        const seat = seatOf(e.playerId);
        sound.lose();
        setFlash({ kind: 'rate', lost: e.lost, name: name(e.playerId), id: Date.now() });
        if (seat?.persona) setSay({ seat: seat.id, text: seat.persona.lines.bad[0], id: Date.now() });
        await wait(1700);
      } else if (e.kind === 'encaisse') {
        sound.chips(Math.min(8, 2 + Math.floor(e.points / 300)));
        setFlash({ kind: 'gain', points: e.points, seat: e.playerId, id: Date.now() });
        await wait(700);
      } else if (e.kind === 'gagne') {
        if (seatOf(e.playerId)?.isMe) { sound.win(); tray.current?.celebrate(fx.fete && fxDef(fx.fete)?.kind === 'fete' ? fx.fete : null); } else sound.lose();
      }
    }
    if (!alive.current) return;
    setS(st.state);
    setSel([]);
    setPick([]);
    tray.current?.setKept(Array(6).fill(false));
  };

  const pump = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    while (queue.current.length && alive.current) await playStep(queue.current.shift()!);
    running.current = false;
    if (alive.current) setBusy(false);
  };
  const push = useCallback((st: Step) => { queue.current.push(st); void pump(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** État reçu tel quel (reprise, spectateur) : pas d'animation. */
  const reset = useCallback((st: DmState) => {
    queue.current = [];
    setS(st);
    setSel([]);
    setPick([]);
    tray.current?.showValues(st.dice);
    tray.current?.setHidden(st.phase === 'choisir' ? st.out : Array(6).fill(false));
    tray.current?.setKept(Array(6).fill(false));
  }, [tray]);

  useEffect(() => { if (!say) return; const t = setTimeout(() => setSay(null), 2400); return () => clearTimeout(t); }, [say]);
  useEffect(() => { if (!flash || flash.kind === 'rate') return; const t = setTimeout(() => setFlash(null), 1500); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { if (flash?.kind !== 'rate') return; const t = setTimeout(() => setFlash(null), 1900); return () => clearTimeout(t); }, [flash]);
  return { s, sRef, busy, flash, say, setSay, pick, sel, setSel, push, reset };
}

// ---------------------------------------------------------------------------------------------
// Écran de partie (solo, en ligne, spectateur)

interface BoardProps {
  tray: React.RefObject<DiceTrayHandle>;
  anim: ReturnType<typeof useDmAnimator>;
  seats: Seat[];
  /** C'est à moi d'agir (et l'écran n'anime rien). */
  canAct: boolean;
  settings: Settings; onSettings: (s: Settings) => void; appearance: Appearance;
  onAction: (a: DmAction, g?: ThrowGesture) => void;
  onLeave: () => void;
  /** En ligne : mise, pot, chrono, réactions, spectateurs. */
  pot?: number; deadline?: number | null; spectator?: boolean; offline?: boolean;
  onEmote?: (e: string) => void;
  end?: React.ReactNode;
  waitText?: string;
}

function useCountdown(deadline: number | null | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!deadline) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

function DmBoard({ tray, anim, seats, canAct, settings, onSettings, appearance, onAction, onLeave, pot, deadline, spectator, offline, onEmote, end, waitText }: BoardProps) {
  const { s, busy, flash, say, pick, sel, setSel } = anim;
  const [sheet, setSheet] = useState<'regles' | 'valeurs' | null>(null);
  const [emotes, setEmotes] = useState(false);
  const cur = currentPlayer(s);
  const curSeat = seats.find((x) => x.id === cur.id) ?? seats[0];
  const myTurn = canAct && curSeat.isMe && s.phase !== 'fini' && !busy;
  const live = s.phase === 'choisir' ? inPlay(s) : [];
  const selPoints = sel.length ? pickPoints(s, sel) : null;
  const secs = useCountdown(s.phase === 'fini' || curSeat.bot ? null : deadline);

  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const bottom = window.innerHeight - (bottomRef.current?.getBoundingClientRect().top ?? window.innerHeight) + 2;
      setInsets({ top: (topRef.current?.getBoundingClientRect().bottom ?? 0) + 2, bottom, left: 0, right: 0 });
      // Tchat et messages de la table : juste au-dessus du panneau du bas.
      document.documentElement.style.setProperty('--dm-bottom', `${Math.round(bottom)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    [topRef, bottomRef].forEach((r) => r.current && ro.observe(r.current));
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); document.documentElement.style.removeProperty('--dm-bottom'); };
  }, []);

  useEffect(() => { tray.current?.setInteractive(myTurn && s.phase === 'choisir'); tray.current?.setSwipeEnabled(myTurn); }, [myTurn, s.phase, tray]);
  useEffect(() => { if (myTurn) sound.turn(); }, [myTurn, s.turns]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (i: number) => {
    if (!myTurn || s.phase !== 'choisir' || !live.includes(i)) return;
    sound.click();
    setSel((prev) => {
      const n = prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i];
      tray.current?.setKept(s.dice.map((_, k) => n.includes(k)));
      return n;
    });
  };
  const pickAll = () => {
    const best = validSelections(live.map((i) => s.dice[i]))[0];
    if (!best) return;
    const used = best.idx.map((k) => live[k]);
    sound.click();
    setSel(used);
    tray.current?.setKept(s.dice.map((_, k) => used.includes(k)));
  };
  const doRoll = (g?: ThrowGesture) => {
    if (!myTurn) return;
    sound.unlock();
    if (s.phase === 'debut') onAction({ type: 'lancer' }, g);
    else if (selPoints !== null) onAction({ type: 'relancer', pick: sel }, g);
  };
  const doBank = () => { if (myTurn && selPoints !== null) onAction({ type: 'encaisser', pick: sel }); };

  const rerollN = sel.length && selPoints !== null ? diceAfter(s, sel) : 0;
  const turnTotal = s.turnPoints + (selPoints ?? 0);
  const wouldWin = myTurn && selPoints !== null && cur.score + turnTotal >= s.target;
  const deadSel = sel.length > 0 && selPoints === null;
  const lead = Math.max(...s.players.map((p) => p.score));
  const n = seats.length;
  const curName = curSeat.isMe ? 'Vous' : curSeat.name;

  const hint = (() => {
    if (s.phase === 'fini') return '';
    if (!curSeat.isMe || !canAct) {
      if (busy) return '';
      if (spectator) return `${curName} joue…`;
      if (curSeat.left) return `${curName} est parti : le serveur joue à sa place.`;
      if (curSeat.away) return `${curName} est déconnecté…`;
      return waitText ?? `${curName} réfléchit…`;
    }
    if (busy) return '';
    if (s.phase === 'debut') return s.turns === 0 ? 'À vous de commencer : lancez les 6 dés.' : 'À vous : lancez les 6 dés (ou glissez le doigt sur le bac).';
    if (deadSel) return 'Un dé choisi ne rapporte rien.';
    if (!sel.length) return 'Touchez les dés qui rapportent pour les mettre de côté.';
    return wouldWin ? 'Encaissez pour gagner la partie !' : '';
  })();

  return (
    <div className={`game dm-game n${n}`} onPointerDown={() => sound.unlock()}>
      <DiceTray ref={tray} diceCount={6} appearance={appearance} quality={settings.quality} insets={insets} onDieClick={toggle} onSwipe={(g) => doRoll(g)} cup={settings.cup} />
      <div className="vignette" />

      <div className="dm-top" ref={topRef}>
        <div className="topbar">
          <button className="icon-btn" onClick={onLeave} aria-label={spectator ? 'Arrêter de regarder' : 'Quitter la partie'}><Icon name="back" /></button>
          <div className="phase dm-phase">
            <span className="dm-logo" title="Score à atteindre" aria-label={`Objectif : ${fmt(s.target)} points`}>{fmt(s.target)}</span>
            {pot ? <span className="dm-pot" title="Pot de la partie : le gagnant emporte tout"><Groschen n={pot} size={14} /></span> : null}
          </div>
          <div className="top-actions">
            <button className="icon-btn dm-values-btn" onClick={() => setSheet('valeurs')} aria-label="Valeurs des dés"><span>Valeurs</span></button>
            <button className="icon-btn" onClick={() => setSheet('regles')} aria-label="Règles du Courtisan"><Icon name="rules" /></button>
            <VolumeControl settings={settings} onSettings={onSettings} />
          </div>
        </div>
        {spectator && <div className="dm-banner">Vous regardez la partie</div>}
        {offline && <div className="dm-banner warn">Connexion perdue, reconnexion…</div>}
        <div className={`dm-players n${n}`}>
          {seats.map((seat) => {
            const p = s.players.find((x) => x.id === seat.id);
            if (!p) return null;
            const active = p.id === cur.id && s.phase !== 'fini';
            return (
              <div key={seat.id} className={`dm-seat${active ? ' on' : ''}${s.winner === seat.id ? ' won' : ''}${seat.left || seat.away ? ' away' : ''}`} style={{ ['--pc' as string]: seat.color }}>
                <Avatar photo={seat.photo ?? null} emoji={seat.avatar} size={n > 4 ? 22 : 30} />
                <span className="dm-seat-text">
                  <b>{seat.isMe ? 'Vous' : seat.name}</b>
                  <em>{fmt(p.score)}{p.score === lead && lead > 0 && <i className="dm-crown" aria-label="en tête">★</i>}</em>
                </span>
                {(seat.left || seat.away) && <span className="dm-off">{seat.left ? 'parti' : 'absent'}</span>}
                <span className="dm-bar" aria-hidden><i style={{ width: `${Math.min(100, (100 * p.score) / s.target)}%` }} /></span>
                {flash?.kind === 'gain' && flash.seat === seat.id && <span key={flash.id} className="dm-gain">+{fmt(flash.points)}</span>}
                {say?.seat === seat.id && <span key={say.id} className="dm-say">{say.text}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {flash?.kind === 'rate' && (
        <div key={flash.id} className="dm-flash rate" role="status">
          <b>Raté !</b>
          <small>{flash.lost > 0 ? `${flash.name === 'Vous' ? 'Vous perdez' : `${flash.name} perd`} ${fmt(flash.lost)} points` : `${flash.name === 'Vous' ? 'Aucun dé ne rapporte' : `${flash.name} : aucun dé ne rapporte`}`}</small>
        </div>
      )}
      {flash?.kind === 'pleine' && (
        <div key={flash.id} className="dm-flash pleine" role="status"><b>Main pleine !</b><small>Les 6 dés repartent</small></div>
      )}

      <div className={`dm-bottom${curSeat.isMe && canAct ? ' mine' : ' other'}`} ref={bottomRef} style={{ ['--pc' as string]: curSeat.color, ...(end ? { visibility: 'hidden' } : {}) }}>
        <div className="dm-turn">
          <span className="dm-who"><Avatar photo={curSeat.photo ?? null} emoji={curSeat.avatar} size={22} />{curSeat.isMe ? 'Votre tour' : curSeat.name}</span>
          <span className="dm-aside" aria-label="Dés mis de côté ce tour">
            {s.setAside.length === 0 && <small className="muted">Rien de côté</small>}
            {s.setAside.map((g, k) => (
              <span key={k} className="dm-group">{g.dice.map((d, j) => <MiniDie key={j} value={d} size={16} />)}</span>
            ))}
          </span>
          {secs != null && s.phase !== 'fini' && !busy && <span className={`dm-clock${secs <= 10 ? ' low' : ''}`} aria-label={`${secs} secondes`}>{secs}</span>}
          <span className="dm-total"><small>Tour</small><b>{fmt(turnTotal)}</b></span>
        </div>
        {myTurn && s.phase === 'choisir' ? (
          <>
            <div className={`dm-sel${deadSel ? ' bad' : sel.length ? ' ok' : ''}`}>
              {sel.length ? (
                <>
                  <span className="dm-sel-dice">{sel.map((i) => <MiniDie key={i} value={s.dice[i]} size={22} kept={selPoints !== null} />)}</span>
                  <b>{selPoints !== null ? `+${fmt(selPoints)}` : '0'}</b>
                </>
              ) : <button className="dm-pickall" onClick={pickAll}>Tout ce qui rapporte</button>}
              {hint && <small>{hint}</small>}
            </div>
            <div className="dm-btns">
              <button className="btn dm-roll" onClick={() => doRoll()} disabled={selPoints === null}>
                <Icon name="dice" size={20} />{rerollN === 6 && sel.length ? 'Main pleine : relancer 6' : `Relancer${rerollN ? ` (${rerollN} dé${rerollN > 1 ? 's' : ''})` : ''}`}
              </button>
              <button className={`btn dm-bank${wouldWin ? ' win' : ''}`} onClick={doBank} disabled={selPoints === null}>
                Encaisser{selPoints !== null ? ` +${fmt(turnTotal)}` : ''}
              </button>
            </div>
          </>
        ) : myTurn && s.phase === 'debut' ? (
          <>
            {hint && <p className="dm-hint">{hint}</p>}
            <div className="dm-btns"><button className="btn dm-roll big" onClick={() => doRoll()}><Icon name="dice" size={22} />Lancer les 6 dés</button></div>
          </>
        ) : (
          <p className="dm-hint wait">{hint || (pick.length ? `${curName} met de côté ${pick.length} dé${pick.length > 1 ? 's' : ''}` : ' ')}</p>
        )}
      </div>

      {onEmote && !spectator && <button className="dm-emote-fab" style={{ bottom: `${insets.bottom + 10}px` }} onClick={() => setEmotes((x) => !x)} aria-label="Réactions rapides"><span aria-hidden>😀</span></button>}
      {emotes && onEmote && (
        <div className="dm-emotes" role="menu" style={{ bottom: `${insets.bottom + 64}px` }}>
          <div>{EMOTES.map((e) => <button key={e} onClick={() => { onEmote(e); setEmotes(false); }}>{e}</button>)}</div>
          <div className="dm-phrases">{PHRASES.filter((p) => !p.includes('4-2-1')).map((p) => <button key={p} onClick={() => { onEmote(p); setEmotes(false); }}>{p}</button>)}</div>
        </div>
      )}
      {sheet && (
        <Sheet title={sheet === 'regles' ? 'Règles du Courtisan' : 'Valeurs des dés'} onClose={() => setSheet(null)}>
          {sheet === 'regles' ? <DmRules target={s.target} /> : <DmValues />}
        </Sheet>
      )}
      {end}
    </div>
  );
}

/** Fin de partie : classement, récompenses, Groschen gagnés ou perdus. */
function EndDialog({ s, seats, reward, groschen, buttons, waiting, bags = 0, quests = [], onBags, isAccount }: {
  s: DmState; seats: Seat[]; reward: Reward | null | undefined; groschen?: { delta: number; pot: number } | null; buttons: React.ReactNode; waiting?: string;
  /** Sacs de dés trouvés (tirés par le serveur pour un compte), défis du jour accomplis. */
  bags?: number; quests?: string[]; onBags?: () => void; isAccount?: boolean;
}) {
  useEffect(() => { if (bags > 0) sound.chips(3); }, [bags]);
  const me = seats.find((x) => x.isMe);
  const w = seats.find((x) => x.id === s.winner);
  return (
    <div className="dm-end-back">
      <div className={`dm-end${s.players.length > 4 ? ' many' : ''}`} role="dialog" aria-label="Fin de partie">
        <h2>{me && s.winner === me.id ? 'Gagné !' : `${w?.name ?? '?'} gagne`}</h2>
        <ol className="dm-rank">
          {ranking(s).map((p, k) => {
            const seat = seats.find((x) => x.id === p.id);
            if (!seat) return null;
            return (
              <li key={p.id} className={seat.isMe ? 'me' : ''} style={{ ['--pc' as string]: seat.color }}>
                <span className="dm-place">{k + 1}</span>
                <Avatar photo={seat.photo ?? null} emoji={seat.avatar} size={28} />
                <b>{seat.isMe ? 'Vous' : seat.name}</b>
                <em>{fmt(p.score)}</em>
                <small>meilleur tour {fmt(p.best)} · {p.misses} raté{p.misses > 1 ? 's' : ''}{seat.left ? ' · parti' : ''}</small>
              </li>
            );
          })}
        </ol>
        {groschen && groschen.pot > 0 && (
          <div className={`dm-gr-result${groschen.delta > 0 ? ' up' : ' down'}`}>
            {groschen.delta > 0 ? <>Vous emportez le pot : <Groschen n={groschen.pot} size={18} /></> : <>Mise perdue : <Groschen n={groschen.delta} size={18} /></>}
          </div>
        )}
        <div className="dm-reward">
          {reward === undefined ? <span className="muted">…</span>
            : reward && (reward.coins || reward.xp) ? <>
              {reward.coins > 0 && <span className="dm-coins"><i aria-hidden />+{reward.coins} pièce{reward.coins > 1 ? 's' : ''}</span>}
              {reward.xp > 0 && <span className="dm-xp">+{reward.xp} XP</span>}
            </> : <span className="muted small">Pas de pièces ni d’XP pour cette partie (trop courte, plafond du jour, invité ou partie quittée).</span>}
        </div>
        {bags > 0 && (
          <div className="dm-bag-won" role="status">
            <span className="dm-bag-ico" aria-hidden><BagIcon size={44} /></span>
            <span className="dm-bag-text"><b>{bags > 1 ? `${bags} sacs de dés trouvés !` : 'Sac de dés trouvé !'}</b>
              <small>{isAccount ? 'Un dé ou un effet au hasard, pour les trois jeux.' : 'Gardé pour vous : un compte gratuit permet de l’ouvrir.'}</small></span>
            {onBags && <button className="btn small primary" onClick={onBags}>{isAccount ? 'Ouvrir' : 'Voir'}</button>}
          </div>
        )}
        {quests.length > 0 && <ul className="dm-quests">{quests.map((q) => <li key={q}><Icon name="check" size={14} /> Défi du jour accompli : {q}</li>)}</ul>}
        {waiting && <p className="muted small">{waiting}</p>}
        <div className="dm-end-btns">{buttons}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Partie gratuite contre l'ordinateur (jouée sur l'appareil)

export function DixMilleGame({ setup, opponents, pa, settings, onSettings, appearance, me, onExit, onReplay, onBags }: {
  setup: DmSetup; opponents: Persona[]; pa: ProfileApi; settings: Settings; onSettings: (s: Settings) => void; appearance: Appearance;
  me: { name: string; avatar: string; photo: string | null }; onExit: () => void; onReplay: () => void; onBags?: () => void;
}) {
  const seats = useMemo<Seat[]>(() => [
    { id: 'moi', name: me.name || 'Vous', avatar: me.avatar, color: COLORS[0], photo: me.photo, isMe: true },
    ...opponents.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, persona: p, isMe: false, bot: true })),
  ], []); // eslint-disable-line react-hooks/exhaustive-deps
  const seatsRef = useRef(seats);
  const tray = useRef<DiceTrayHandle>(null);
  const initial = useMemo(() => newGame(seats.map((x) => ({ id: x.id, name: x.name, bot: x.isMe ? undefined : setup.level })), setup.target, crypto.getRandomValues(new Uint32Array(1))[0]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const anim = useDmAnimator(tray, initial, seatsRef, { trail: pa.profile.fx?.trainee, fete: pa.profile.fx?.fete });
  // État officiel (moteur local), en avance sur l'écran pendant les animations.
  const truth = useRef(initial);
  const [end, setEnd] = useState<{ reward: Reward | null; bags: number; quests: string[] } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; pa.onDixMilleStart(); return () => { alive.current = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback((a: DmAction, gesture?: ThrowGesture) => {
    const r = act(truth.current, a);
    if ('error' in r) return;
    const by = currentPlayer(truth.current).id;
    truth.current = r.state;
    anim.push({ state: r.state, events: r.state.events, action: a, by, animSeed: (r.state.seed ^ (r.state.draws * 2654435761)) >>> 0, gesture });
  }, [anim.push]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tour des ordinateurs.
  const s = anim.s;
  const cur = seats.find((x) => x.id === currentPlayer(s).id)!;
  useEffect(() => {
    if (anim.busy || s.phase === 'fini' || cur.isMe) return;
    const p = cur.persona!;
    const t = setTimeout(() => { if (alive.current) run(decide(truth.current, setup.level)); }, s.phase === 'debut' ? 700 + p.tempo * 0.4 : 500 + p.tempo * 0.5);
    return () => clearTimeout(t);
  }, [s, anim.busy, cur, setup.level, run]);

  // Fin de partie : récompense (une seule fois).
  const ended = useRef(false);
  useEffect(() => {
    if (s.phase !== 'fini' || anim.busy || ended.current) return;
    ended.current = true;
    tray.current?.setInteractive(false);
    const place = ranking(s).findIndex((p) => p.id === 'moi') + 1;
    void (async () => {
      const bestTurn = s.players.find((p) => p.id === 'moi')?.best ?? 0;
      const [r] = await Promise.all([pa.onDixMilleEnd({ won: s.winner === 'moi', place, opponents: opponents.length, level: setup.level, bestTurn }), wait(1400)]);
      if (alive.current) setEnd({ reward: r?.reward ?? null, bags: r?.bags ?? 0, quests: r?.quests ?? [] });
    })();
  }, [s, anim.busy, pa, opponents.length, setup.level]);

  const leave = async () => {
    if (s.phase !== 'fini' && !(await askConfirm('Quitter la partie du Courtisan en cours ?', 'Quitter'))) return;
    onExit();
  };

  return (
    <DmBoard tray={tray} anim={anim} seats={seats} canAct settings={settings} onSettings={onSettings} appearance={appearance}
      onAction={(a, g) => run(a, g)} onLeave={leave}
      end={end && <EndDialog s={s} seats={seats} reward={end.reward} bags={end.bags} quests={end.quests} isAccount={pa.isAccount} onBags={onBags} buttons={<>
        <button className="btn secondary" onClick={onExit}>Retour</button>
        <button className="btn primary" onClick={onReplay}><Icon name="resume" size={18} /> Rejouer</button>
      </>} />} />
  );
}

// ---------------------------------------------------------------------------------------------
// Partie en ligne (et contre l'ordinateur avec mise : jouée par le serveur)

function useDm(session: DmSession) {
  return useSyncExternalStore((cb) => session.subscribe(cb), () => session.tick);
}

function seatsOf(session: DmSession, state: DmState | null, personas?: Persona[]): Seat[] {
  const t = session.table;
  const ids = state?.players.map((p) => p.id) ?? t?.members.map((m) => m.id) ?? [];
  let botN = 0;
  return ids.map((id, i) => {
    const m = t?.members.find((x) => x.id === id);
    const persona = m?.bot && t?.solo && personas ? personas.find((p) => p.name === m.name) ?? personas[botN++ % personas.length] : undefined;
    return {
      id, name: m?.name ?? state?.players.find((p) => p.id === id)?.name ?? '?', avatar: m?.avatar ?? '🎲', color: persona?.color ?? COLORS[i % COLORS.length],
      photo: m?.photo ?? null, isMe: id === session.playerId, bot: !!m?.bot, persona, dice: m?.dice, trail: m?.trail,
      away: !!m && !m.bot && !m.connected && !m.left, left: !!m?.left, quit: !!m?.quit,
    };
  });
}

function DmOnlineGame({ session, pa, settings, onSettings, appearance, onExit, onReplay, personas, groschen, onBags }: {
  session: DmSession; pa: ProfileApi; settings: Settings; onSettings: (s: Settings) => void; appearance: Appearance;
  onExit: () => void; onReplay?: () => void; personas?: Persona[]; groschen: ReturnType<typeof useGroschen>; onBags?: () => void;
}) {
  useDm(session);
  // Récompense du serveur (pièces, XP, sac de dés) : le profil affiché suit aussitôt.
  const rewardMsg = session.reward;
  useEffect(() => { if (rewardMsg?.profile) pa.onServerProfile(rewardMsg.profile as Profile); }, [rewardMsg]); // eslint-disable-line react-hooks/exhaustive-deps
  const tray = useRef<DiceTrayHandle>(null);
  const seats = seatsOf(session, session.state, personas);
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const anim = useDmAnimator(tray, session.state!, seatsRef, { trail: pa.profile.fx?.trainee, fete: pa.profile.fx?.fete });
  const shown = useRef(session.version);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => session.subscribeUpdates((u) => {
    if ('snapshot' in u) { if (u.version !== shown.current) { shown.current = u.version; anim.reset(u.state); } return; }
    shown.current = u.version;
    setSending(false);
    anim.push({ state: u.state, events: u.events, action: u.action, by: u.by, animSeed: u.animSeed, gesture: u.gesture });
  }), [session]); // eslint-disable-line react-hooks/exhaustive-deps
  // Arrivée en cours de partie (reprise, spectateur) : le bac montre l'état actuel.
  useEffect(() => { const t = setTimeout(() => anim.reset(session.state!), 50); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!err) return; const t = setTimeout(() => setErr(null), 2500); return () => clearTimeout(t); }, [err]);
  // Réactions rapides : bulle au-dessus du joueur.
  useEffect(() => { const cb = (pid: string, e: string) => { anim.setSay({ seat: pid, text: e, id: Date.now() }); sound.click(); }; session.emoteL.add(cb); return () => { session.emoteL.delete(cb); }; }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const official = session.state!;
  const mineNow = !session.spectating && official.phase !== 'fini' && currentPlayer(official).id === session.playerId;
  useMyTurnAlert(mineNow, settings.turnAlert !== false, settings.vibrate);
  const canAct = !session.spectating && !sending && session.connected && anim.s === anim.sRef.current && shown.current === session.version;
  const onAction = async (a: DmAction, g?: ThrowGesture) => {
    setSending(true);
    const e = await session.act(a, g);
    if (e) { setSending(false); setErr(e); }
  };
  const t = session.table;
  const s = anim.s;
  const finished = s.phase === 'fini' && !anim.busy && official.phase === 'fini';
  // Solde à jour en fin de partie (pot versé par le serveur).
  useEffect(() => { if (finished && session.balance != null) groschen.setBalance(session.balance); }, [finished, session.balance]); // eslint-disable-line react-hooks/exhaustive-deps
  const [endShown, setEndShown] = useState(false);
  useEffect(() => { if (!finished) { setEndShown(false); return; } const x = setTimeout(() => setEndShown(true), 1400); return () => clearTimeout(x); }, [finished]);

  const leave = async () => {
    if (!session.spectating && official.phase !== 'fini') {
      const stake = t?.stake ?? 0;
      const ok = await askConfirm(stake > 0
        ? `Quitter la partie ? Le serveur jouera à votre place et vous perdez votre mise (${stake} Groschen) : vous ne pourrez rien gagner, même en revenant.`
        : 'Quitter la partie ? Le serveur jouera à votre place ; vous pourrez revenir depuis l’accueil tant qu’elle n’est pas finie.', 'Quitter');
      if (!ok) return;
    }
    session.leave();
    onExit();
  };
  const meSeat = seats.find((x) => x.isMe);
  const stake = t?.stake ?? 0;
  const pot = t?.pot ?? 0;
  const won = !!meSeat && s.winner === meSeat.id;
  const grDelta = pot > 0 && meSeat ? (won && !meSeat.quit ? pot - stake : -stake) : 0;
  const isHost = session.isHost && !t?.solo;
  return (
    <>
      <DmBoard tray={tray} anim={anim} seats={seats} canAct={canAct} settings={settings} onSettings={onSettings} appearance={appearance}
        onAction={onAction} onLeave={leave} pot={pot} deadline={t?.deadline} spectator={session.spectating} offline={!session.connected}
        onEmote={t?.solo ? undefined : (e) => session.sendEmote(e)}
        waitText={sending ? 'Envoi…' : undefined}
        end={endShown && <EndDialog s={s} seats={seats} reward={session.spectating ? null : session.reward?.reward ?? (pa.isAccount ? undefined : null)}
          bags={session.spectating ? 0 : session.reward?.bags ?? 0} quests={session.spectating ? [] : session.reward?.quests ?? []} isAccount={pa.isAccount}
          onBags={onBags && (() => { session.leave(); onBags(); })}
          groschen={!session.spectating && pot > 0 ? { delta: grDelta, pot } : null}
          waiting={!t?.solo && !isHost && !session.spectating ? 'L’hôte peut proposer une revanche : restez à la table.' : undefined}
          buttons={<>
            <button className="btn secondary" onClick={() => { session.leave(); onExit(); }}>{session.spectating ? 'Fermer' : 'Quitter'}</button>
            {t?.solo && onReplay && <button className="btn primary" onClick={() => { session.leave(); onReplay(); }}><Icon name="resume" size={18} /> Rejouer</button>}
            {isHost && <button className="btn primary" onClick={() => void session.rematch()}><Icon name="resume" size={18} /> Revanche</button>}
          </>} />} />
      {err && <div className="notices"><div className="notice warning">{err}</div></div>}
      <DmNotices session={session} />
      {!t?.solo && <Chat session={session} pa={pa} />}
    </>
  );
}

function DmNotices({ session }: { session: DmSession }) {
  useDm(session);
  const [now, setNow] = useState(Date.now());
  const live = session.notices.filter((x) => now - x.at < 5000);
  useEffect(() => { if (!live.length) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [live.length]);
  useEffect(() => { setNow(Date.now()); }, [session.notices]);
  return <div className="notices">{live.slice(-2).map((x) => <div key={x.id} className={`notice ${x.kind}`}>{x.text}</div>)}</div>;
}

// ---------------------------------------------------------------------------------------------
// Salon d'une table en ligne

function DmLobby({ session, pa, onExit, groschen }: { session: DmSession; pa: ProfileApi; onExit: () => void; groschen: ReturnType<typeof useGroschen> }) {
  useDm(session);
  const t = session.table!;
  const me = t.members.find((m) => m.id === session.playerId);
  const isHost = session.isHost;
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [level, setLevel] = useState<DmLevel>('habitue');
  const link = `${publicUrl()}/?courtisan=${t.code}`;
  const canShare = typeof navigator.share === 'function';
  const share = async () => { try { await navigator.share({ title: MODE_NAME, text: `Viens jouer au Courtisan avec moi ! Code : ${t.code}`, url: link }); trackEvent('invite'); } catch { /* annulé */ } };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); trackEvent('invite'); } catch { window.prompt('Copiez :', text); }
  };
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => { setErr(null); const a = await p; if (!a.ok) setErr(a.error ?? 'Action impossible'); };
  const count = t.members.length;
  const allReady = t.members.every((m) => m.ready || m.bot);
  return (
    <Shell title={t.title} onBack={() => { session.leave(); onExit(); }} wide icon="dice" sub={`${MODE_NAME} · ${count}/${DM_TABLE_MAX} joueurs`}
      foot={isHost ? <BigAction icon="dice" disabled={count < 2 || !allReady} onClick={() => void run(session.start())}
        label={count < 2 ? 'En attente de joueurs…' : !allReady ? 'En attente des joueurs prêts…' : 'Lancer la partie'}
        sub={t.stake > 0 ? `Mise ${t.stake} Groschen chacun · pot ${t.stake * count}` : 'Partie gratuite'} />
        : me && !t.quick ? <BigAction icon="check" tone={me.ready ? undefined : 'gold'} label={me.ready ? 'Je ne suis plus prêt' : 'Je suis prêt'}
          sub={t.stake > 0 ? `Mise : ${t.stake} Groschen` : 'Partie gratuite'} onClick={() => void run(session.setReady(!me.ready))} /> : undefined}>
      <div className="dm-lobby-code">
        <span>{t.visibility === 'public' ? 'Table publique' : 'Sur invitation'} · code <b>{t.code}</b></span>
        <button className="btn small" onClick={() => void copy(t.code, 'code')}><Icon name="copy" size={16} />{copied === 'code' ? 'Copié' : 'Code'}</button>
        {canShare ? <button className="btn small" onClick={() => void share()}><Icon name="share" size={16} />Inviter</button>
          : <button className="btn small" onClick={() => void copy(link, 'lien')}><Icon name="share" size={16} />{copied === 'lien' ? 'Copié' : 'Lien'}</button>}
      </div>
      {t.quick && <QuickInfo quick={t.quick} />}
      <ul className="dm-lobby-seats">
        {t.members.map((m: DmPublicMember, i) => {
          const mine = m.id === session.playerId;
          return (
            <li key={m.id} className={`dm-ls${mine ? ' dm-ls-me' : ''}${m.ready || m.bot ? ' ready' : ''}`} style={{ ['--pc' as string]: COLORS[i % COLORS.length] }}>
              <Avatar photo={m.photo ?? null} emoji={m.avatar} size={34} accessory={m.accessory} />
              <span className="dm-ls-text"><b>{m.name}{mine ? ' (vous)' : ''}{m.isHost && <i className="dm-host" title="Hôte"> ★</i>}</b>
                <small>{m.filler ? 'Ordinateur · cède sa place' : m.bot ? `Ordinateur · ${DM_LEVELS.find((l) => l.v === m.bot)?.label}` : !m.connected ? 'hors ligne' : m.ready ? 'prêt' : 'pas prêt'}</small></span>
              {(m.ready || m.bot) && <Icon name="check" size={16} />}
              {isHost && !mine && <button className="btn ghost small" onClick={() => void run(m.bot ? session.removeBot(m.id) : session.kick(m.id))}>{m.bot ? 'Retirer' : 'Exclure'}</button>}
            </li>
          );
        })}
        {count < DM_TABLE_MAX && <li className="dm-ls empty"><button onClick={() => (canShare ? void share() : void copy(link, 'lien'))}><Icon name="plus" size={18} />
          {DM_TABLE_MAX - count} place{DM_TABLE_MAX - count > 1 ? 's' : ''} libre{DM_TABLE_MAX - count > 1 ? 's' : ''} : inviter</button></li>}
      </ul>
      {isHost && count < DM_TABLE_MAX && (
        <Section title="Ordinateurs">
          <Choices value={level} onChange={setLevel} options={DM_LEVELS.map((l) => ({ v: l.v, label: l.label }))} />
          <div className="dm-lobby-bots">
            <button className="btn small" onClick={() => void run(session.addBot(level))}><Icon name="plus" size={16} />Ajouter un ordinateur</button>
            {!t.quick && <button className="btn small" onClick={() => void run(session.fill(level))}><Icon name="people" size={16} />Compléter</button>}
          </div>
        </Section>
      )}
      {pa.isAccount && count < DM_TABLE_MAX && <DmInviteFriends pa={pa} inTable={t.members.map((m) => m.account ?? m.name)} />}
      <Section title="Réglages">
        {isHost && !t.quick ? (
          <>
            <Choices value={t.target} onChange={(v) => void run(session.config({ target: v }))} options={[
              { v: 2000, label: '2 000', hint: 'Rapide' }, { v: 4000, label: '4 000', hint: 'Normal' }, { v: 10000, label: '10 000', hint: 'Le vrai' },
            ]} />
            <Choices value={t.visibility} onChange={(v) => void run(session.config({ visibility: v }))} options={[
              { v: 'private', label: 'Sur invitation', hint: 'Code ou lien', icon: 'key' }, { v: 'public', label: 'Tout le monde', hint: 'Partie rapide', icon: 'people' },
            ]} />
            <h3 className="dm-sub">Mise par joueur</h3>
            <StakePicker value={t.stake} balance={groschen.balance} onChange={(v) => void run(session.config({ stake: v }))}
              note="Les mises demandent un compte : votre table est gratuite." />
          </>
        ) : (
          <ul className="muted dm-lobby-rules">
            <li>Score à atteindre : {fmt(t.target)}</li>
            <li>{t.stake > 0 ? <>Mise : <Groschen n={t.stake} size={14} /> par joueur, le gagnant emporte tout</> : 'Partie gratuite'}</li>
            {groschen.balance != null && t.stake > 0 && <li>Votre solde : {fmt(groschen.balance)} Groschen</li>}
          </ul>
        )}
      </Section>
      {!session.connected && <p className="error">Connexion perdue, reconnexion en cours…</p>}
      {err && <p className="error">{err}</p>}
    </Shell>
  );
}

function QuickInfo({ quick }: { quick: NonNullable<DmPublicTable['quick']> }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const secs = (at: number) => Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <div className="quick-banner" role="status">
      <span className="quick-clock" aria-hidden>{quick.startAt ? secs(quick.startAt) : quick.fillAt ? secs(quick.fillAt) : '…'}</span>
      <div>{quick.startAt ? <><b>Départ dans {secs(quick.startAt)} s</b><small>Un joueur qui arrive d’ici là prend la place d’un ordinateur.</small></>
        : quick.fillAt ? <><b>On cherche des joueurs…</b><small>Sans renfort, des ordinateurs complètent la table dans {secs(quick.fillAt)} s.</small></>
          : <><b>Partie rapide</b><small>En attente de joueurs.</small></>}</div>
    </div>
  );
}

/** Inviter ses amis à la table (notification et bandeau chez eux). */
function DmInviteFriends({ pa, inTable }: { pa: ProfileApi; inTable: string[] }) {
  const [friends, setFriends] = useState<{ username: string; online: boolean; me?: boolean }[]>([]);
  const [sent, setSent] = useState<Record<string, string>>({});
  useEffect(() => {
    const load = () => api<{ friends: typeof friends }>('/friends', { token: pa.token! }).then((r) => setFriends(r.friends.filter((f) => !f.me))).catch(() => {});
    load(); const t = setInterval(load, 20_000); return () => clearInterval(t);
  }, [pa.token]);
  const list = friends.filter((f) => !inTable.includes(f.username)).sort((a, b) => Number(b.online) - Number(a.online));
  if (!list.length) return null;
  return (
    <Section title="Inviter des amis">
      <ul className="dm-invite">
        {list.slice(0, 8).map((f) => (
          <li key={f.username}>
            <i className={`fr-dot ${f.online ? 'on' : ''}`} aria-hidden /><b>{f.username}</b>
            {sent[f.username] ? <small className="muted">{sent[f.username]}</small> : (
              <button className="btn small" onClick={async () => {
                try { await api('/invites', { token: pa.token!, body: { username: f.username } }); setSent((x) => ({ ...x, [f.username]: 'Invitation envoyée' })); }
                catch (e) { setSent((x) => ({ ...x, [f.username]: (e as Error).message })); }
              }}>Inviter</button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------
// Connexion : créer, rejoindre, partie rapide, reprendre, regarder, solo avec mise

export type DmOnlineMode =
  | { kind: 'create'; target: number; stake: number; visibility: 'private' | 'public' }
  | { kind: 'join'; code: string } | { kind: 'quick' } | { kind: 'resume' } | { kind: 'watch'; code: string }
  | { kind: 'solo'; setup: DmSetup; opponents: Persona[] };

function DmOnlineFlow({ mode, pa, settings, onSettings, me, onExit, onReplay, groschen, onBags }: {
  mode: DmOnlineMode; pa: ProfileApi; settings: Settings; onSettings: (s: Settings) => void; me: { name: string; avatar: string };
  onExit: () => void; onReplay?: () => void; groschen: ReturnType<typeof useGroschen>; onBags?: () => void;
}) {
  const [session, setSession] = useState<DmSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const s = new DmSession(pa.token, { name: me.name || pa.session?.username || 'Joueur', avatar: me.avatar, dice: pa.profile.equipped.dice });
    let off = false;
    void (async () => {
      try {
        if (mode.kind === 'create') await s.create(mode);
        else if (mode.kind === 'join') await s.join(mode.code);
        else if (mode.kind === 'quick') await s.quick();
        else if (mode.kind === 'watch') await s.watch(mode.code, me.name || 'Spectateur');
        else if (mode.kind === 'solo') await s.solo({ target: mode.setup.target, stake: mode.setup.stake, opponents: mode.setup.opponents, level: mode.setup.level, bots: mode.opponents.map((p) => ({ name: p.name, avatar: p.avatar })) });
        else { const saved = loadDmSession(); if (!saved) throw new Error('Aucune partie à reprendre.'); await s.resume(saved); }
        if (!off) setSession(s);
        if (mode.kind === 'solo' || mode.kind === 'create') groschen.reload();
      } catch (e) { s.socket.disconnect(); if (!off) setError((e as Error).message); }
    })();
    return () => { off = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useDm(session ?? DUMMY);
  // Présence (administration) : salon, partie ou spectateur, avec le code de la table.
  const dt = session?.table;
  usePresenceLayer(dt ? (session!.spectating ? { view: 'spectateur', code: dt.code, state: 'menu' }
    : dt.status === 'playing' ? { view: dt.solo ? 'partie-solo' : 'partie', code: dt.code, state: dt.solo ? 'solo' : 'online' }
      : { view: 'salon', code: dt.code, state: 'online' }) : null);
  // Fermer l'onglet ou changer d'écran sans « Quitter » : la place est gardée (reprise).
  useEffect(() => () => { if (session && !session.closed) { session.closed = true; session.socket.disconnect(); } }, [session]);

  if (error || session?.kicked || session?.watchClosed) {
    return <Shell title={MODE_NAME} onBack={onExit} icon="dice"><div className="k-wait"><p className="error">{error ?? session?.kicked ?? session?.watchClosed}</p><button className="btn" onClick={onExit}>Retour</button></div></Shell>;
  }
  if (!session || !session.table) {
    return <Shell title={MODE_NAME} onBack={() => { session?.leave(); onExit(); }} icon="dice"><div className="k-wait"><span className="k-spinner" aria-hidden /><p>{mode.kind === 'quick' ? 'Recherche d’une table…' : mode.kind === 'resume' ? 'Reconnexion à la table…' : 'Connexion…'}</p></div></Shell>;
  }
  if (session.table.status === 'playing' && session.state) {
    return <DmOnlineGame key={`${session.table.code}:${session.state.turns === 0 && session.version <= 1 ? session.version : 'g'}`} session={session} pa={pa} settings={settings} onSettings={onSettings}
      appearance={pa.profile.equipped} onExit={onExit} onReplay={onReplay} groschen={groschen} onBags={onBags}
      personas={mode.kind === 'solo' ? mode.opponents : undefined} />;
  }
  if (session.spectating) return <Shell title={MODE_NAME} onBack={() => { session.leave(); onExit(); }} icon="eye"><div className="k-wait"><p>La partie n’a pas encore commencé.</p></div></Shell>;
  return <><DmLobby session={session} pa={pa} onExit={onExit} groschen={groschen} /><DmNotices session={session} /><Chat session={session} pa={pa} /></>;
}
const DUMMY = { subscribe: () => () => {}, tick: 0, version: 0, table: null, chat: [], notices: [], reward: null, connected: false } as unknown as DmSession;

// ---------------------------------------------------------------------------------------------
// Accueil du mode : contre l'ordinateur, en ligne, Groschen

export function DixMilleSetup({ onBack, onStart, onRules, onOnline, pa, groschen, onAccount, initialTab }: {
  onBack: () => void; onStart: (s: DmSetup, opponents: Persona[]) => void; onRules: () => void;
  onOnline: (m: DmOnlineMode) => void; pa: ProfileApi; groschen: ReturnType<typeof useGroschen>; onAccount?: () => void;
  /** Onglet ouvert d'abord (choisi dans le menu du mode). */
  initialTab?: 'solo' | 'ligne';
}) {
  const [setup, setSetup] = useState<DmSetup>(loadSetup);
  const [roster, setRoster] = useState(() => [...PERSONAS].sort(() => Math.random() - 0.5));
  const [tab, setTab] = useState<'solo' | 'ligne'>(() => (NO_SERVER ? 'solo' : initialTab ?? (loadDmSession() ? 'ligne' : 'solo')));
  const [code, setCode] = useState('');
  const [table, setTable] = useState<{ target: number; stake: number; visibility: 'private' | 'public' }>({ target: 4000, stake: 0, visibility: 'private' });
  const chosen = roster.slice(0, setup.opponents);
  const set = (p: Partial<DmSetup>) => setSetup((s) => { const n = { ...s, ...p }; saveSetup(n); return n; });
  const level = DM_LEVELS.find((l) => l.v === setup.level)!;
  const bal = groschen.balance;
  // Une mise retenue d'une autre fois mais plus couverte par le solde : retour au gratuit.
  const stake = bal != null && setup.stake <= bal ? setup.stake : 0;
  const pot = stake * (setup.opponents + 1);
  const saved = loadDmSession();
  const right = (
    <>
      {bal != null && <span className="dm-wallet" aria-label={`${bal} Groschen`}><GroschenIcon size={18} /><b>{fmt(bal)}</b></span>}
      <button className="icon-btn" onClick={onRules} aria-label="Règles du Courtisan"><Icon name="rules" /></button>
    </>
  );
  return (
    <Shell title={MODE_NAME} onBack={onBack} icon="dice" wide sub="Dix mille · 2 à 6 joueurs" right={right}
      foot={tab === 'solo'
        ? <BigAction icon="dice" label={stake > 0 ? `Miser ${fmt(stake)} et jouer` : 'S’asseoir à la table'}
          sub={`${setup.opponents} adversaire${setup.opponents > 1 ? 's' : ''} · ${level.label} · ${fmt(setup.target)} points${stake > 0 ? ` · pot ${fmt(pot)}` : ' · gratuit'}`}
          onClick={() => (stake > 0 ? onOnline({ kind: 'solo', setup: { ...setup, stake }, opponents: chosen }) : onStart({ ...setup, stake: 0 }, chosen))} />
        : <BigAction icon="dice" tone="gold" label="Partie rapide" sub="Rejoindre une table ouverte (gratuite), ou en ouvrir une" onClick={() => onOnline({ kind: 'quick' })} />}>
      <div className="dm-intro">
        <span className="dm-intro-dice" aria-hidden>{[1, 5, 5, 1].map((v, i) => <MiniDie key={i} value={v} size={18} />)}</span>
        <p>Mettez de côté les dés qui rapportent, relancez les autres… ou encaissez avant de tout perdre. <button className="link" onClick={onRules}>Lire les règles</button></p>
      </div>
      {!pa.isAccount && onAccount && !NO_SERVER && <button className="dm-gr-cta" onClick={onAccount}><GroschenIcon size={22} /><span><b>Les Groschen, monnaie du Courtisan</b><small>Avec un compte gratuit : +{GROSCHEN_DAILY} chaque jour, et des mises</small></span></button>}
      {!NO_SERVER && <div className="seg dm-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'solo'} className={tab === 'solo' ? 'on' : ''} onClick={() => setTab('solo')}>Contre l’ordinateur</button>
        <button role="tab" aria-selected={tab === 'ligne'} className={tab === 'ligne' ? 'on' : ''} onClick={() => setTab('ligne')}>En ligne (2 à 6)</button>
      </div>}
      {tab === 'solo' ? (
        <>
          <Section title="Adversaires" aside={<button className="btn ghost small" onClick={() => setRoster([...PERSONAS].sort(() => Math.random() - 0.5))}><Icon name="resume" size={18} /> Changer</button>}>
            <div className="k-pills big" role="radiogroup" aria-label="Nombre d'adversaires">
              {[1, 2, 3].map((n) => <button key={n} role="radio" aria-checked={n === setup.opponents} className={n === setup.opponents ? 'on' : ''} onClick={() => set({ opponents: n })}>{n}</button>)}
            </div>
            <ul className="solo-roster">
              {chosen.map((p) => (
                <li key={p.id} style={{ ['--pc' as string]: p.color }}>
                  <span className="avatar"><span>{p.avatar}</span></span>
                  <b>{p.name}</b><small>{p.tagline}</small>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Niveau"><Choices value={setup.level} onChange={(v) => set({ level: v })} options={DM_LEVELS} /></Section>
          <Section title="Score à atteindre">
            <Choices value={setup.target} onChange={(v) => set({ target: v })} options={[
              { v: 2000, label: '2 000', hint: 'Rapide' }, { v: 4000, label: '4 000', hint: 'Normal' }, { v: 10000, label: '10 000', hint: 'Le vrai' },
            ]} />
          </Section>
          <Section title="Mise">
            <StakePicker value={stake} balance={bal} onChange={(v) => set({ stake: v })} />
            {stake > 0 && <p className="k-hint">Chaque ordinateur mise aussi {fmt(stake)} : gagnez et vous emportez <b>{fmt(pot)} Groschen</b>. Si un ordinateur gagne, vous perdez votre mise. Partie jouée par le serveur.</p>}
          </Section>
        </>
      ) : (
        <>
          {saved && <button className="home-banner resume dm-resume" onClick={() => onOnline({ kind: 'resume' })}><Icon name="resume" size={20} /><span><b>Reprendre la partie</b><small>Table {saved.code}</small></span></button>}
          <Section title="Rejoindre avec un code">
            <form className="hub-code" onSubmit={(e) => { e.preventDefault(); if (code.length === 5) onOnline({ kind: 'join', code }); }}>
              <Icon name="key" size={20} />
              <input value={code} maxLength={5} placeholder="CODE" aria-label="Code de la table" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn small primary" disabled={code.length !== 5}>Rejoindre</button>
            </form>
          </Section>
          <Section title="Ouvrir une table">
            <Choices value={table.target} onChange={(v) => setTable((t) => ({ ...t, target: v }))} options={[
              { v: 2000, label: '2 000', hint: 'Rapide' }, { v: 4000, label: '4 000', hint: 'Normal' }, { v: 10000, label: '10 000', hint: 'Le vrai' },
            ]} />
            <Choices value={table.visibility} onChange={(v) => setTable((t) => ({ ...t, visibility: v }))} options={[
              { v: 'private', label: 'Sur invitation', hint: 'Code ou lien', icon: 'key' }, { v: 'public', label: 'Tout le monde', hint: 'Partie rapide', icon: 'people' },
            ]} />
            <StakePicker value={bal != null && table.stake <= bal ? table.stake : 0} balance={bal} onChange={(v) => setTable((t) => ({ ...t, stake: v }))} note="Les mises demandent un compte : votre table sera gratuite." />
            <button className="btn primary wide dm-open" onClick={() => onOnline({ kind: 'create', ...table, stake: bal != null && table.stake <= bal ? table.stake : 0 })}><Icon name="plus" size={18} />Ouvrir la table</button>
            <p className="muted small">2 à 6 joueurs ; vous pourrez inviter vos amis et ajouter des ordinateurs.</p>
          </Section>
        </>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------
// Mode complet

export type DmPending = { join?: string; watch?: string; resume?: boolean };

export function DixMilleMode({ pa, settings, onSettings, onHome, displayName, avatar, pending, onAccount, onCollection }: {
  pa: ProfileApi; settings: Settings; onSettings: (s: Settings) => void;
  /** Retour au menu principal. */
  onHome: () => void; displayName: string; avatar: string;
  pending?: DmPending; onAccount?: () => void;
  /** Collection de dés commune aux trois jeux (`open` : ouvrir un sac tout de suite). */
  onCollection?: (open?: boolean) => void;
}) {
  type Route = { r: 'menu' } | { r: 'setup'; tab: 'solo' | 'ligne' } | { r: 'game'; setup: DmSetup; opponents: Persona[]; key: number } | { r: 'online'; mode: DmOnlineMode; key: number; from: 'menu' | 'setup' };
  const [route, setRoute] = useState<Route>(() => pending?.join ? { r: 'online', mode: { kind: 'join', code: pending.join }, key: 1, from: 'menu' }
    : pending?.watch ? { r: 'online', mode: { kind: 'watch', code: pending.watch }, key: 1, from: 'menu' }
      : pending?.resume ? { r: 'online', mode: { kind: 'resume' }, key: 1, from: 'menu' } : { r: 'menu' });
  const [rules, setRules] = useState(false);
  // Présence : menu du Courtisan (pas « en partie »), partie solo, ou en ligne (précisé par la table).
  usePresenceLayer(route.r === 'game' ? { view: 'partie-solo', state: 'solo', depth: 1 } : route.r === 'online' ? { view: 'attente', state: 'online', depth: 1 } : { view: route.r === 'setup' ? 'preparation' : 'menu', state: 'menu', depth: 1 });
  const groschen = useGroschen(pa);
  const me = { name: pa.session?.username ?? displayName ?? 'Vous', avatar, photo: pa.photo };
  const toMenu = () => { groschen.reload(); setRoute({ r: 'menu' }); };
  const back = () => { groschen.reload(); setRoute({ r: 'setup', tab: 'solo' }); };
  const bags = onCollection && (() => onCollection(true));
  const gift = groschen.gift > 0 && <GiftBurst amount={groschen.gift} onClose={groschen.dismissGift} />;
  const online = (mode: DmOnlineMode, from: 'menu' | 'setup') => { sound.unlock(); setRoute({ r: 'online', mode, key: Date.now(), from }); };
  if (route.r === 'game') {
    return <>{gift}<DixMilleGame key={route.key} setup={route.setup} opponents={route.opponents} pa={pa} settings={settings} onSettings={onSettings}
      appearance={pa.profile.equipped} me={me} onExit={back} onBags={bags}
      onReplay={() => setRoute({ ...route, key: route.key + 1 })} /></>;
  }
  if (route.r === 'online') {
    // Venu d'un lien direct (invitation, reprise, regarder) : retour au menu du mode.
    const exit = route.from === 'setup' ? () => { groschen.reload(); setRoute({ r: 'setup', tab: route.mode.kind === 'solo' ? 'solo' : 'ligne' }); } : toMenu;
    return <>{gift}<DmOnlineFlow key={route.key} mode={route.mode} pa={pa} settings={settings} onSettings={onSettings} me={{ name: me.name, avatar }} groschen={groschen}
      onExit={exit} onReplay={route.mode.kind === 'solo' ? back : undefined} onBags={bags} /></>;
  }
  return (
    <>
      {route.r === 'setup'
        ? <DixMilleSetup key={route.tab} initialTab={route.tab} onBack={toMenu} onRules={() => setRules(true)} pa={pa} groschen={groschen} onAccount={onAccount}
          onStart={(setup, opponents) => { sound.unlock(); setRoute({ r: 'game', setup, opponents, key: Date.now() }); }}
          onOnline={(mode) => online(mode, 'setup')} />
        : <DmMenu pa={pa} groschen={groschen} onHome={onHome} onAccount={onAccount}
          onRules={() => setRules(true)} onSetup={(tab) => setRoute({ r: 'setup', tab })} onOnline={(mode) => online(mode, 'menu')}
          onCollection={onCollection} />}
      {rules && <Sheet title="Règles du Courtisan" onClose={() => setRules(false)}><DmRules /></Sheet>}
      {gift}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Menu du mode : Groschen, jouer, sacs de dés, collection, statistiques, règles, réglages, aide

const HELP_PAGES = [
  { path: '/dix-mille-en-ligne', label: 'Jouer au Dix mille en ligne' },
  { path: '/regles-du-dix-mille', label: 'Règles du Dix mille' },
  { path: '/strategie-dix-mille', label: 'Stratégie' },
];
/** Adresse d'une page d'aide : sur le site, ou sur 421online.com (fichier unique, application). */
const helpUrl = (path: string) => (NO_SERVER || !/^https?:$/.test(location.protocol) ? `https://421online.com${path}` : path);

const GR_REASON: Record<string, string> = { cadeau: 'Cadeau du jour', mise: 'Mise', gain: 'Pot emporté', remboursement: 'Mise rendue', admin: 'Ajustement' };
const fmtWhen = (t: number) => new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));

function DmMenu({ pa, groschen, onHome, onAccount, onRules, onSetup, onOnline, onCollection }: {
  pa: ProfileApi; groschen: ReturnType<typeof useGroschen>;
  onHome: () => void; onAccount?: () => void;
  onRules: () => void; onSetup: (tab: 'solo' | 'ligne') => void; onOnline: (m: DmOnlineMode) => void;
  onCollection?: (open?: boolean) => void;
}) {
  const p = pa.profile;
  const acc = pa.isAccount;
  const [code, setCode] = useState('');
  const [sheet, setSheet] = useState<'stats' | 'history' | null>(null);
  const bal = groschen.balance;
  const bags = p.bags ?? 0;
  const saved = NO_SERVER ? null : loadDmSession();
  const st = p.dm;
  return (
    <div className="dm-menu">
      <ModeBar tone="dixmille" title="Le Courtisan" onBack={onHome}>
        {acc && bal != null ? <ModeChip onClick={() => setSheet('history')} label={`${bal} Groschen : historique`}><GroschenIcon size={18} /><b>{fmt(bal)}</b></ModeChip>
          : null}
        <button className="icon-btn mode-rules" onClick={onRules} aria-label="Règles du Courtisan"><Icon name="rules" size={20} /></button>
      </ModeBar>
      <main className="dm-menu-main">
        {saved && <button className="home-banner resume dm-resume" onClick={() => onOnline({ kind: 'resume' })}><Icon name="resume" size={20} /><span><b>Reprendre la partie</b><small>Table {saved.code}</small></span></button>}
        {/* Sacs de dés gagnés ici : accès direct (la collection est commune aux trois jeux, dans le menu principal). */}
        {bags > 0 && onCollection && <button className="home-banner gift dm-bags" onClick={() => onCollection(acc)}><BagIcon size={26} /><span><b>{bags > 1 ? `${bags} sacs de dés` : 'Un sac de dés'} {acc ? 'à ouvrir' : 'gardé'}</b><small>{acc ? 'Gagnés en jouant, ouvrez-les !' : 'Créez un compte pour les ouvrir'}</small></span><em>Ouvrir</em></button>}

        <section className="dm-hero">
          <span className="dm-hero-dice" aria-hidden>
            <DieCube id={p.equipped.dice} size={46} />
            <span className="dm-hero-mini">{[1, 5, 5, 1, 1].map((v, i) => <MiniDie key={i} value={v} size={16} />)}</span>
          </span>
          <span className="dm-hero-text">
            <h1>Le Courtisan</h1>
            <p>Le Dix mille à 6 dés : gardez les 1, les 5 et les combinaisons… et encaissez avant le raté.</p>
          </span>
        </section>

        {!NO_SERVER && (acc ? (
          <button className="dm-purse" onClick={() => setSheet('history')}>
            <GroschenIcon size={34} />
            <span className="dm-purse-text">
              <b>{bal == null ? '…' : fmt(bal)} Groschen</b>
              <small>{groschen.giftToday ? `Cadeau du jour reçu : +${GROSCHEN_DAILY}. Le prochain demain.` : `Cadeau du jour : +${GROSCHEN_DAILY} à chaque visite quotidienne.`}</small>
            </span>
            <em>Historique</em>
          </button>
        ) : onAccount && (
          <button className="dm-gr-cta" onClick={onAccount}><GroschenIcon size={22} /><span><b>Les Groschen, monnaie du Courtisan</b><small>Avec un compte gratuit : +{GROSCHEN_DAILY} chaque jour et des mises</small></span></button>
        ))}

        <div className="dm-plays">
          <button className="dm-play solo" onClick={() => onSetup('solo')}>
            <span className="dm-play-ic" aria-hidden><Icon name="dice" size={26} /></span>
            <span className="dm-play-text"><b>Contre l’ordinateur</b><small>1 à 3 adversaires · gratuit ou avec mise</small></span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </button>
          {!NO_SERVER && <>
            <div className="dm-play-row">
              <button className="dm-play quick" onClick={() => onOnline({ kind: 'quick' })}><span className="dm-play-text"><b>Partie rapide</b><small>Une table ouverte, en ligne</small></span></button>
              <button className="dm-play table" onClick={() => onSetup('ligne')}><span className="dm-play-text"><b>Ouvrir une table</b><small>Entre amis, 2 à 6</small></span></button>
            </div>
            <form className="hub-code dm-code" onSubmit={(e) => { e.preventDefault(); if (code.length === 5) onOnline({ kind: 'join', code }); }}>
              <Icon name="key" size={20} />
              <input value={code} maxLength={5} placeholder="CODE" aria-label="Code de la table" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn small primary" disabled={code.length !== 5}>Rejoindre</button>
            </form>
          </>}
        </div>

        <div className="dm-tiles">
          <button className="dm-tile" onClick={() => setSheet('stats')}>
            <span className="dm-tile-art" aria-hidden><Icon name="chart" size={28} /></span>
            <b>Statistiques</b><small>{st?.games ? `${st.games} partie${st.games > 1 ? 's' : ''}` : 'Vos parties'}</small>
          </button>
          <button className="dm-tile" onClick={onRules}>
            <span className="dm-tile-art" aria-hidden><Icon name="rules" size={28} /></span>
            <b>Règles</b><small>Et valeurs</small>
          </button>
          {acc && !NO_SERVER ? <button className="dm-tile" onClick={() => setSheet('history')}>
            <span className="dm-tile-art" aria-hidden><GroschenIcon size={30} /></span>
            <b>Groschen</b><small>Historique</small>
          </button> : onCollection && <button className="dm-tile bags" onClick={() => onCollection()}>
            <span className="dm-tile-art" aria-hidden><BagIcon size={34} /></span>
            <b>Sacs de dés</b><small>À gagner en jouant</small>
          </button>}
        </div>

        <nav className="dm-help" aria-label="Pages d’aide">
          <span>Pages d’aide</span>
          {HELP_PAGES.map((h) => <a key={h.path} href={helpUrl(h.path)} target="_blank" rel="noopener">{h.label}</a>)}
        </nav>
      </main>

      {sheet === 'stats' && (
        <Sheet title="Vos statistiques du Courtisan" onClose={() => setSheet(null)}>
          <div className="dm-stats">
            <div><b>{fmt(st?.games ?? 0)}</b><small>Parties terminées</small></div>
            <div><b>{fmt(st?.wins ?? 0)}</b><small>Victoires{st?.games ? ` (${Math.round(((st.wins ?? 0) / st.games) * 100)} %)` : ''}</small></div>
            <div><b>{fmt(st?.bestTurn ?? 0)}</b><small>Meilleur tour</small></div>
            <div><b>{acc ? fmt(st?.bestPot ?? 0) : '—'}</b><small>Plus gros pot (Groschen)</small></div>
          </div>
          <p className="muted small">Parties contre l’ordinateur et en ligne{acc ? '' : ' (sur cet appareil ; avec un compte, elles vous suivent partout)'}. Chaque partie rapporte aussi des pièces (la monnaie de la boutique) et parfois un sac de dés, comme au 421 et à Coups Fourrés.</p>
        </Sheet>
      )}
      {sheet === 'history' && (
        <Sheet title="Mouvements de Groschen" onClose={() => setSheet(null)}>
          {!groschen.history?.length ? <p className="muted">Aucun mouvement pour l’instant.</p> : (
            <ul className="dm-ledger">
              {groschen.history.map((m, i) => (
                <li key={i}>
                  <span><b>{GR_REASON[m.reason] ?? m.reason}</b><small>{fmtWhen(m.at)}</small></span>
                  <em className={m.delta > 0 ? 'up' : 'down'}>{m.delta > 0 ? '+' : '−'}{fmt(Math.abs(m.delta))}</em>
                  <small className="dm-ledger-bal">solde {fmt(m.balance)}</small>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Les 20 derniers mouvements. Monnaie de jeu, sans argent réel.</p>
        </Sheet>
      )}
    </div>
  );
}

/** Avatars proposés (ré-export pratique pour d'éventuels écrans du mode). */
export { AVATARS };
/** Effacer la reprise mémorisée (partie terminée ailleurs). */
export const forgetDmSession = () => saveDmSession(null);
