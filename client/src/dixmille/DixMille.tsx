/**
 * Le Courtisan (le jeu de dés traditionnel du Dix mille, ou Farkle) : réglages, parties contre
 * l'ordinateur (gratuites sur l'appareil, ou avec mise jouées par le serveur), tables en ligne de
 * 2 à 6 joueurs, et les Groschen, la monnaie du mode. Le moteur est dans shared/dixmille.
 *
 * Un seul écran de partie (`DmBoard`) sert au solo, au jeu en ligne et aux spectateurs ; le
 * « joueur d'animations » (`useDmAnimator`) rejoue chaque action dans le bac 3D, pour tout le monde
 * de la même façon (graine d'animation partagée en ligne).
 */
import { useGuestInviteAtEnd } from '../ui/guestInvite';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { act, currentPlayer, diceAfter, inPlay, newGame, pickPoints, ranking, validSelections, DM_LEVELS, DM_TARGETS, DM_VALUES, type DmAction, type DmEvent, type DmLevel, type DmState } from '../../../shared/dixmille/engine';
import { decide } from '../../../shared/dixmille/ai';
import { usePresenceLayer } from '../presence';
import { DM_TABLE_MAX, type DmPublicMember, type DmPublicTable } from '../../../shared/dixmille/protocol';
import { DM_BOT_GAIN_DAILY, DM_NO_STAKE_LEVEL, GROSCHEN_DAILY, GROSCHEN_MAX_STAKE, GROSCHEN_WELCOME } from '../../../shared/dixmille/groschen';
import { ACHIEVEMENTS } from '../../../shared/progress/achievements';
import { DmAchievements, DmAchToast } from './Achievements';
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
import { appBottom, appView, useNavGuard } from '../ui/navGuard';
import { sound } from '../audio/sound';
import { publicUrl } from '../platform';
import { trackEvent } from '../visit';
import { useMyTurnAlert } from '../turnAlert';
import { DmSession, loadDmSession, saveDmSession } from './online';
import { fmtNum, getLang, tr, trServer, useLang } from '../i18n/lang';
import { BARON, DM_RULES, DM_VALUE_LABELS, PERSONA_LABELS, PHRASE_LABELS, type Foreign } from '../../../shared/i18n/courtisan';
import { LangSwitch, FrenchOnlyNote } from '../i18n/LangSwitch';

const fmt = fmtNum;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SETUP_KEY = '421.dixmille';
const COLORS = ['#f1cc7d', '#e2694f', '#4f9fd1', '#a477d6', '#57b07a', '#e0609a'];
export const MODE_NAME = 'Le Courtisan';
const modeName = () => tr('dm.name');
const diceWord = (n: number) => tr(n > 1 ? 'dm.dice' : 'dm.die');
const plural = (n: number) => (n > 1 ? 's' : '');
const levelLabel = (v: DmLevel) => tr(`dm.lv.${v}`);
/** Noms affichés des ordinateurs : Le Baron garde son article en français seulement. */
const botName = (name: string) => (name === 'Le Baron' ? BARON[getLang()] : name);
const foreign = (): Foreign | null => { const l = getLang(); return l === 'fr' ? null : l; };
const personaOf = (p: Persona) => { const l = foreign(); return l ? PERSONA_LABELS[l][p.id] : undefined; };
const personaGood = (p: Persona) => personaOf(p)?.good ?? p.lines.good[0];
const personaBad = (p: Persona) => personaOf(p)?.bad ?? p.lines.bad[0];
const phraseText = (p: string) => { const l = foreign(); return l ? PHRASE_LABELS[l][p] ?? p : p; };
const TARGET_OPTS = () => [
  { v: 2000, label: fmt(2000), hint: tr('t.quick') }, { v: 4000, label: fmt(4000), hint: tr('t.normal') }, { v: 10000, label: fmt(10000), hint: tr('t.real') },
];
const VIS_OPTS = () => [
  { v: 'private' as const, label: tr('vis.invite'), hint: tr('vis.inviteHint'), icon: 'key' as const }, { v: 'public' as const, label: tr('vis.public'), hint: tr('vis.publicHint'), icon: 'people' as const },
];
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
  // welcome (0.53) : bonus de bienvenue versé à cette visite (une seule fois par compte, décidé par le serveur).
  const [w, setW] = useState<{ balance: number; gift: number; welcome: number; newcomer: boolean; history: GrMove[]; giftToday: boolean } | null>(null);
  const reload = useCallback(() => {
    if (!pa.token) { setW(null); return; }
    api<{ balance: number; gift: number; welcome?: number; newcomer?: boolean; day: string; history: GrMove[] }>('/dixmille/wallet', { token: pa.token })
      .then((r) => setW((prev) => ({
        balance: r.balance, gift: r.gift || prev?.gift || 0, welcome: r.welcome || prev?.welcome || 0, newcomer: r.welcome ? !!r.newcomer : !!prev?.newcomer,
        history: r.history ?? [], giftToday: r.gift > 0 || (r.history ?? []).some((m) => m.reason === 'cadeau' && m.ref === r.day) || !!prev?.giftToday,
      })))
      .catch(() => {});
  }, [pa.token]);
  useEffect(() => { reload(); }, [reload]);
  return {
    balance: w?.balance ?? null, gift: w?.gift ?? 0, welcome: w?.welcome ?? 0, newcomer: !!w?.newcomer, history: w?.history ?? null, giftToday: !!w?.giftToday,
    dismissGift: () => setW((x) => (x ? { ...x, gift: 0, welcome: 0 } : x)), reload,
    setBalance: (b: number) => setW((x) => ({ gift: x?.gift ?? 0, welcome: x?.welcome ?? 0, newcomer: !!x?.newcomer, history: x?.history ?? [], giftToday: !!x?.giftToday, balance: b })),
  };
}

function GiftBurst({ amount, onClose, sub }: { amount: number; onClose: () => void; sub?: string }) {
  useEffect(() => { sound.chips(5); const t = setTimeout(onClose, sub ? 5200 : 3800); return () => clearTimeout(t); }, [onClose, sub]);
  return (
    <button className="gr-gift" onClick={onClose} aria-label={tr('dm.gift.aria', { n: amount })}>
      <span className="gr-gift-coins" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ ['--i' as string]: i }}><GroschenIcon size={34} /></i>)}</span>
      <b>+{amount} Groschen</b>
      <small>{sub ?? tr('dm.gift.sub')}</small>
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
  if (balance == null) return <p className="muted small dm-stake-note">{note ?? tr('dm.stake.note')}</p>;
  return (
    <div className={`dm-stake${disabled ? ' off' : ''}`}>
      <div className="dm-stake-row">
        <button className={value === 0 ? 'on' : ''} disabled={disabled} onClick={() => commit('')}>{tr('dm.free')}</button>
        {quick.map((n) => <button key={n} className={value === n ? 'on' : ''} disabled={disabled} onClick={() => commit(String(n))}>{n}</button>)}
      </div>
      <label className={`dm-stake-input${bad ? ' bad' : ''}`}>
        <GroschenIcon size={18} />
        <input inputMode="numeric" pattern="[0-9]*" value={text} disabled={disabled || max < 1} placeholder={max < 1 ? tr('dm.stake.empty') : tr('dm.stake.ph', { max: fmt(max) })}
          onChange={(e) => commit(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))} aria-label={tr('dm.stake.aria')} />
        <small>{tr('dm.stake.bal', { n: fmt(balance) })}</small>
      </label>
      {bad && <p className="error small">{typed > max ? tr('dm.stake.have', { n: fmt(balance) }) : tr('dm.stake.int')}</p>}
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
            <td>{(() => { const l = foreign(); return l ? DM_VALUE_LABELS[l][v.label] ?? v.label : v.label; })()}</td>
            <td className="val">{fmt(v.points)}</td>
          </tr>
        ))}
        <tr><td colSpan={3} className="dm-vnote">{tr('dm.valuesNote')}</td></tr>
      </tbody>
    </table>
  );
}

/** Texte avec **gras**. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/).map((x, i) => (i % 2 ? <b key={i}>{x}</b> : x))}</>;
}
function DmRulesLoc({ lang, target }: { lang: Foreign; target?: number }) {
  const r = DM_RULES[lang];
  const v = (s: string) => s.replace('{target}', target ? fmt(target) : r.anyTarget).replace('{daily}', String(GROSCHEN_DAILY));
  return (
    <div className="rules dm-rules">
      <p><Rich text={v(r.intro)} /></p>
      <ol>{r.steps.map((s) => <li key={s}><Rich text={v(s)} /></li>)}</ol>
      <h3>{r.scoring}</h3>
      <DmValues />
      <h3>{r.groschenTitle}</h3>
      <p><Rich text={v(r.groschen)} /></p>
      <p>{tr('dm2.rules', { w: GROSCHEN_WELCOME, n: DM_BOT_GAIN_DAILY })}</p>
      <p className="muted small">{r.tip}</p>
    </div>
  );
}

export function DmRules({ target }: { target?: number }) {
  const lf = foreign();
  if (lf) return <DmRulesLoc lang={lf} target={target} />;
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
      <p>{tr('dm2.rules', { w: GROSCHEN_WELCOME, n: DM_BOT_GAIN_DAILY })}</p>
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
  const name = (id: string) => { const x = seatOf(id); return x?.isMe ? tr('dm.you') : botName(x?.name ?? '?'); };

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
        if (a.type === 'encaisser' && by?.persona && sRef.current.turnPoints + (pickPoints(sRef.current, a.pick) ?? 0) >= 1000) setSay({ seat: by.id, text: personaGood(by.persona), id: Date.now() });
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
        if (seat?.persona) setSay({ seat: seat.id, text: personaBad(seat.persona), id: Date.now() });
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
      const bottom = appBottom() - (bottomRef.current?.getBoundingClientRect().top ?? appBottom()) + 2;
      setInsets({ top: (topRef.current?.getBoundingClientRect().bottom ?? 0) + 2, bottom, left: 0, right: 0 });
      // Tchat et messages de la table : juste au-dessus du panneau du bas.
      document.documentElement.style.setProperty('--dm-bottom', `${Math.round(bottom)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    [topRef, bottomRef].forEach((r) => r.current && ro.observe(r.current));
    const view = appView(); if (view) ro.observe(view);
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
  const curName = curSeat.isMe ? tr('dm.you') : botName(curSeat.name);

  const hint = (() => {
    if (s.phase === 'fini') return '';
    if (!curSeat.isMe || !canAct) {
      if (busy) return '';
      if (spectator) return tr('dm.hint.playing', { name: curName });
      if (curSeat.left) return tr('dm.hint.left', { name: curName });
      if (curSeat.away) return tr('dm.hint.away', { name: curName });
      return waitText ?? (curSeat.isMe ? tr('dm.hint.youThink') : tr('dm.hint.think', { name: curName }));
    }
    if (busy) return '';
    if (s.phase === 'debut') return tr(s.turns === 0 ? 'dm.hint.first' : 'dm.hint.turn');
    if (deadSel) return tr('dm.hint.deadSel');
    if (!sel.length) return tr('dm.hint.tap');
    return wouldWin ? tr('dm.hint.winBank') : '';
  })();

  return (
    <div className={`game dm-game n${n}`} onPointerDown={() => sound.unlock()}>
      <DiceTray ref={tray} diceCount={6} appearance={appearance} quality={settings.quality} insets={insets} onDieClick={toggle} onSwipe={(g) => doRoll(g)} cup={settings.cup} />
      <div className="vignette" />

      <div className="dm-top" ref={topRef}>
        <div className="topbar">
          <button className="icon-btn" onClick={onLeave} aria-label={tr(spectator ? 'dm.stopWatch' : 'dm.leaveGame')}><Icon name="back" /></button>
          <div className="phase dm-phase">
            <span className="dm-logo" title={tr('dm.goal')} aria-label={tr('dm.goalAria', { n: fmt(s.target) })}>{fmt(s.target)}</span>
            {pot ? <span className="dm-pot" title={tr('dm.pot')}><Groschen n={pot} size={14} /></span> : null}
          </div>
          <div className="top-actions">
            <button className="icon-btn dm-values-btn" onClick={() => setSheet('valeurs')} aria-label={tr('dm.valuesTitle')}><span>{tr('dm.values')}</span></button>
            <button className="icon-btn" onClick={() => setSheet('regles')} aria-label={tr('dm.rulesTitle')}><Icon name="rules" /></button>
            <VolumeControl settings={settings} onSettings={onSettings} />
          </div>
        </div>
        {spectator && <div className="dm-banner">{tr('dm.watching')}</div>}
        {offline && <div className="dm-banner warn">{tr('dm.lost')}</div>}
        <div className={`dm-players n${n}`}>
          {seats.map((seat) => {
            const p = s.players.find((x) => x.id === seat.id);
            if (!p) return null;
            const active = p.id === cur.id && s.phase !== 'fini';
            return (
              <div key={seat.id} className={`dm-seat${active ? ' on' : ''}${s.winner === seat.id ? ' won' : ''}${seat.left || seat.away ? ' away' : ''}`} style={{ ['--pc' as string]: seat.color }}>
                <Avatar photo={seat.photo ?? null} emoji={seat.avatar} size={n > 4 ? 22 : 30} />
                <span className="dm-seat-text">
                  <b>{seat.isMe ? tr('dm.you') : botName(seat.name)}</b>
                  <em>{fmt(p.score)}{p.score === lead && lead > 0 && <i className="dm-crown" aria-label={tr('dm.lead')}>★</i>}</em>
                </span>
                {(seat.left || seat.away) && <span className="dm-off">{tr(seat.left ? 'dm.off.left' : 'dm.off.away')}</span>}
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
          <b>{tr('dm.farkle')}</b>
          <small>{flash.lost > 0 ? (flash.name === tr('dm.you') ? tr('dm.farkle.youLose', { n: fmt(flash.lost) }) : tr('dm.farkle.loses', { name: flash.name, n: fmt(flash.lost) })) : (flash.name === tr('dm.you') ? tr('dm.farkle.noneYou') : tr('dm.farkle.none', { name: flash.name }))}</small>
        </div>
      )}
      {flash?.kind === 'pleine' && (
        <div key={flash.id} className="dm-flash pleine" role="status"><b>{tr('dm.hot')}</b><small>{tr('dm.hotSub')}</small></div>
      )}

      <div className={`dm-bottom${curSeat.isMe && canAct ? ' mine' : ' other'}`} ref={bottomRef} style={{ ['--pc' as string]: curSeat.color, ...(end ? { visibility: 'hidden' } : {}) }}>
        <div className="dm-turn">
          <span className="dm-who"><Avatar photo={curSeat.photo ?? null} emoji={curSeat.avatar} size={22} />{curSeat.isMe ? tr('dm.yourTurn') : botName(curSeat.name)}</span>
          <span className="dm-aside" aria-label={tr('dm.asideAria')}>
            {s.setAside.length === 0 && <small className="muted">{tr('dm.nothingAside')}</small>}
            {s.setAside.map((g, k) => (
              <span key={k} className="dm-group">{g.dice.map((d, j) => <MiniDie key={j} value={d} size={16} />)}</span>
            ))}
          </span>
          {secs != null && s.phase !== 'fini' && !busy && <span className={`dm-clock${secs <= 10 ? ' low' : ''}`} aria-label={tr('dm.secs', { n: secs })}>{secs}</span>}
          <span className="dm-total"><small>{tr('dm.turn')}</small><b>{fmt(turnTotal)}</b></span>
        </div>
        {myTurn && s.phase === 'choisir' ? (
          <>
            <div className={`dm-sel${deadSel ? ' bad' : sel.length ? ' ok' : ''}`}>
              {sel.length ? (
                <>
                  <span className="dm-sel-dice">{sel.map((i) => <MiniDie key={i} value={s.dice[i]} size={22} kept={selPoints !== null} />)}</span>
                  <b>{selPoints !== null ? `+${fmt(selPoints)}` : '0'}</b>
                </>
              ) : <button className="dm-pickall" onClick={pickAll}>{tr('dm.pickAll')}</button>}
              {hint && <small>{hint}</small>}
            </div>
            <div className="dm-btns">
              <button className="btn dm-roll" onClick={() => doRoll()} disabled={selPoints === null}>
                <Icon name="dice" size={20} />{rerollN === 6 && sel.length ? tr('dm.hotRoll') : rerollN ? tr('dm.rerollN', { n: rerollN, dice: diceWord(rerollN) }) : tr('dm.reroll')}
              </button>
              <button className={`btn dm-bank${wouldWin ? ' win' : ''}`} onClick={doBank} disabled={selPoints === null}>
                {tr('dm.bank')}{selPoints !== null ? ` +${fmt(turnTotal)}` : ''}
              </button>
            </div>
          </>
        ) : myTurn && s.phase === 'debut' ? (
          <>
            {hint && <p className="dm-hint">{hint}</p>}
            <div className="dm-btns"><button className="btn dm-roll big" onClick={() => doRoll()}><Icon name="dice" size={22} />{tr('dm.rollAll')}</button></div>
          </>
        ) : (
          <p className="dm-hint wait">{hint || (pick.length ? tr('dm.setAside', { name: curName, n: pick.length, dice: diceWord(pick.length) }) : ' ')}</p>
        )}
      </div>

      {onEmote && !spectator && <button className="dm-emote-fab" style={{ bottom: `${insets.bottom + 10}px` }} onClick={() => setEmotes((x) => !x)} aria-label={tr('dm.emotes')}><span aria-hidden>😀</span></button>}
      {emotes && onEmote && (
        <div className="dm-emotes" role="menu" style={{ bottom: `${insets.bottom + 64}px` }}>
          <div>{EMOTES.map((e) => <button key={e} onClick={() => { onEmote(e); setEmotes(false); }}>{e}</button>)}</div>
          <div className="dm-phrases">{PHRASES.filter((p) => !p.includes('4-2-1')).map((p) => <button key={p} onClick={() => { onEmote(p); setEmotes(false); }}>{phraseText(p)}</button>)}</div>
        </div>
      )}
      {sheet && (
        <Sheet title={tr(sheet === 'regles' ? 'dm.rulesTitle' : 'dm.valuesTitle')} onClose={() => setSheet(null)}>
          {sheet === 'regles' ? <DmRules target={s.target} /> : <DmValues />}
        </Sheet>
      )}
      {end}
    </div>
  );
}

/** Fin de partie : classement, récompenses, Groschen gagnés ou perdus. */
function EndDialog({ s, seats, reward, groschen, buttons, waiting, bags = 0, quests = [], onBags, isAccount, achievements = [] }: {
  s: DmState; seats: Seat[]; reward: Reward | null | undefined; groschen?: { delta: number; pot: number } | null; buttons: React.ReactNode; waiting?: string;
  /** Sacs de dés trouvés (tirés par le serveur pour un compte), défis du jour accomplis. */
  bags?: number; quests?: string[]; onBags?: () => void; isAccount?: boolean;
  /** Succès débloqués par cette partie (identifiants). */
  achievements?: string[];
}) {
  useEffect(() => { if (bags > 0) sound.chips(3); }, [bags]);
  const me = seats.find((x) => x.isMe);
  const w = seats.find((x) => x.id === s.winner);
  return (
    <div className="dm-end-back">
      <div className={`dm-end${s.players.length > 4 ? ' many' : ''}`} role="dialog" aria-label={tr('dm.end')}>
        <h2>{me && s.winner === me.id ? tr('dm.won') : tr('dm.wins', { name: botName(w?.name ?? '?') })}</h2>
        <ol className="dm-rank">
          {ranking(s).map((p, k) => {
            const seat = seats.find((x) => x.id === p.id);
            if (!seat) return null;
            return (
              <li key={p.id} className={seat.isMe ? 'me' : ''} style={{ ['--pc' as string]: seat.color }}>
                <span className="dm-place">{k + 1}</span>
                <Avatar photo={seat.photo ?? null} emoji={seat.avatar} size={28} />
                <b>{seat.isMe ? tr('dm.you') : botName(seat.name)}</b>
                <em>{fmt(p.score)}</em>
                <small>{tr('dm.rankLine', { best: fmt(p.best), n: p.misses, s: plural(p.misses), left: seat.left ? tr('dm.rankLeft') : '' })}</small>
              </li>
            );
          })}
        </ol>
        {groschen && groschen.pot > 0 && (
          <div className={`dm-gr-result${groschen.delta > 0 ? ' up' : ' down'}`}>
            {groschen.delta > 0 ? <>{tr('dm.potWon')}<Groschen n={groschen.pot} size={18} /></> : <>{tr('dm.potLost')}<Groschen n={groschen.delta} size={18} /></>}
          </div>
        )}
        <div className="dm-reward">
          {reward === undefined ? <span className="muted">…</span>
            : reward && (reward.coins || reward.xp) ? <>
              {reward.coins > 0 && <span className="dm-coins"><i aria-hidden />{tr('dm.coins', { n: reward.coins, s: plural(reward.coins) })}</span>}
              {reward.xp > 0 && <span className="dm-xp">+{reward.xp} XP</span>}
            </> : <span className="muted small">{tr('dm.noReward')}</span>}
        </div>
        {bags > 0 && (
          <div className="dm-bag-won" role="status">
            <span className="dm-bag-ico" aria-hidden><BagIcon size={44} /></span>
            <span className="dm-bag-text"><b>{bags > 1 ? tr('dm.bagsFound', { n: bags }) : tr('dm.bagFound')}</b>
              <small>{tr(isAccount ? 'dm.bag.acc' : 'dm.bag.guest')}</small></span>
            {onBags && <button className="btn small primary" onClick={onBags}>{tr(isAccount ? 'dm.open' : 'dm.see')}</button>}
          </div>
        )}
        {achievements.length > 0 && <ul className="dm-quests dm2-ach-won">{achievements.map((id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); return a && <li key={id}><span aria-hidden>{a.icon}</span> {tr('dm2.ach.unlocked')} : <b>{a.name}</b> <em>{tr('dm2.ach.coins', { n: a.coins })}</em></li>; })}</ul>}
        {quests.length > 0 && <ul className="dm-quests">{quests.map((q) => <li key={q}><Icon name="check" size={14} /> {tr('dm.quest', { q: trServer(q) })}</li>)}</ul>}
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
    { id: 'moi', name: me.name || tr('dm.you'), avatar: me.avatar, color: COLORS[0], photo: me.photo, isMe: true },
    ...opponents.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, persona: p, isMe: false, bot: true })),
  ], []); // eslint-disable-line react-hooks/exhaustive-deps
  const seatsRef = useRef(seats);
  const tray = useRef<DiceTrayHandle>(null);
  const initial = useMemo(() => newGame(seats.map((x) => ({ id: x.id, name: x.name, bot: x.isMe ? undefined : setup.level })), setup.target, crypto.getRandomValues(new Uint32Array(1))[0]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const anim = useDmAnimator(tray, initial, seatsRef, { trail: pa.profile.fx?.trainee, fete: pa.profile.fx?.fete });
  // État officiel (moteur local), en avance sur l'écran pendant les animations.
  const truth = useRef(initial);
  const [end, setEnd] = useState<{ reward: Reward | null; bags: number; quests: string[]; achievements: string[] } | null>(null);
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
      if (alive.current) setEnd({ reward: r?.reward ?? null, bags: r?.bags ?? 0, quests: r?.quests ?? [], achievements: r?.achievements ?? [] });
    })();
  }, [s, anim.busy, pa, opponents.length, setup.level]);

  const okToLeave = async () => s.phase === 'fini' || askConfirm(tr('dm.quitAsk'), tr('dm.leave'));
  const leave = async () => {
    if (!(await okToLeave())) return;
    onExit();
  };
  // Barre du bas : compacte pendant la partie, même confirmation que « Quitter ».
  useNavGuard({ game: true, ask: okToLeave });
  // Écran de fin affiché : invitation à créer un compte (invités ; App décide).
  useGuestInviteAtEnd('courtisan', !!end);

  return (
    <DmBoard tray={tray} anim={anim} seats={seats} canAct settings={settings} onSettings={onSettings} appearance={appearance}
      onAction={(a, g) => run(a, g)} onLeave={leave}
      end={end && <><DmAchToast ids={end.achievements} /><EndDialog s={s} seats={seats} reward={end.reward} bags={end.bags} quests={end.quests} achievements={end.achievements} isAccount={pa.isAccount} onBags={onBags} buttons={<>
        <button className="btn secondary" onClick={onExit}>{tr('dm.back')}</button>
        <button className="btn primary" onClick={onReplay}><Icon name="resume" size={18} /> {tr('dm.replay')}</button>
      </>} /></>} />
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
  useEffect(() => { const cb = (pid: string, e: string) => { anim.setSay({ seat: pid, text: phraseText(e), id: Date.now() }); sound.click(); }; session.emoteL.add(cb); return () => { session.emoteL.delete(cb); }; }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const official = session.state!;
  const mineNow = !session.spectating && official.phase !== 'fini' && currentPlayer(official).id === session.playerId;
  useMyTurnAlert(mineNow, settings.turnAlert !== false, settings.vibrate);
  const canAct = !session.spectating && !sending && session.connected && anim.s === anim.sRef.current && shown.current === session.version;
  const onAction = async (a: DmAction, g?: ThrowGesture) => {
    setSending(true);
    const e = await session.act(a, g);
    if (e) { setSending(false); setErr(trServer(e)); }
  };
  const t = session.table;
  const s = anim.s;
  const finished = s.phase === 'fini' && !anim.busy && official.phase === 'fini';
  // Solde à jour en fin de partie (pot versé par le serveur).
  useEffect(() => { if (finished && session.balance != null) groschen.setBalance(session.balance); }, [finished, session.balance]); // eslint-disable-line react-hooks/exhaustive-deps
  const [endShown, setEndShown] = useState(false);
  useEffect(() => { if (!finished) { setEndShown(false); return; } const x = setTimeout(() => setEndShown(true), 1400); return () => clearTimeout(x); }, [finished]);

  /** Confirmation avant de quitter (bouton Quitter, ou barre du bas) : rappel de la mise perdue. */
  const okToLeave = async () => {
    if (session.spectating || session.state?.phase === 'fini') return true;
    const stake = session.table?.stake ?? 0;
    return askConfirm(stake > 0
      ? tr('dm.quitStake', { n: stake })
      : tr('dm.quitFree'), tr('dm.leave'));
  };
  const leave = async () => {
    if (!(await okToLeave())) return;
    session.leave();
    onExit();
  };
  useNavGuard({ game: true, ask: okToLeave, leave: () => session.leave() });
  useGuestInviteAtEnd('courtisan', endShown && !session.spectating);
  const meSeat = seats.find((x) => x.isMe);
  const stake = t?.stake ?? 0;
  const pot = t?.pot ?? 0;
  const won = !!meSeat && s.winner === meSeat.id;
  // Gain réel : le serveur peut plafonner la part des ordinateurs (potPaid).
  const paid = session.reward?.potPaid ?? pot;
  const grDelta = pot > 0 && meSeat ? (won && !meSeat.quit ? paid - stake : -stake) : 0;
  const isHost = session.isHost && !t?.solo;
  return (
    <>
      <DmBoard tray={tray} anim={anim} seats={seats} canAct={canAct} settings={settings} onSettings={onSettings} appearance={appearance}
        onAction={onAction} onLeave={leave} pot={pot} deadline={t?.deadline} spectator={session.spectating} offline={!session.connected}
        onEmote={t?.solo ? undefined : (e) => session.sendEmote(e)}
        waitText={sending ? tr('dm.sending') : undefined}
        end={endShown && <EndDialog s={s} seats={seats} reward={session.spectating ? null : session.reward?.reward ?? (pa.isAccount ? undefined : null)}
          bags={session.spectating ? 0 : session.reward?.bags ?? 0} quests={session.spectating ? [] : session.reward?.quests ?? []} isAccount={pa.isAccount}
          achievements={session.spectating ? [] : session.reward?.achievements ?? []}
          onBags={onBags && (() => { session.leave(); onBags(); })}
          groschen={!session.spectating && pot > 0 ? { delta: grDelta, pot: won && !meSeat?.quit ? paid : pot } : null}
          waiting={!t?.solo && !isHost && !session.spectating ? tr('dm.hostRematch') : undefined}
          buttons={<>
            <button className="btn secondary" onClick={() => { session.leave(); onExit(); }}>{session.spectating ? tr('common.close') : tr('dm.leave')}</button>
            {t?.solo && onReplay && <button className="btn primary" onClick={() => { session.leave(); onReplay(); }}><Icon name="resume" size={18} /> {tr('dm.replay')}</button>}
            {isHost && <button className="btn primary" onClick={() => void session.rematch()}><Icon name="resume" size={18} /> {tr('dm.rematch')}</button>}
          </>} />} />
      {err && <div className="notices"><div className="notice warning">{err}</div></div>}
      {!session.spectating && <DmAchToast ids={session.reward?.achievements ?? []} />}
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
  return <div className="notices">{live.slice(-2).map((x) => <div key={x.id} className={`notice ${x.kind}`}>{trServer(x.text)}</div>)}</div>;
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
  const link = `${publicUrl()}/?courtisan=${t.code}${getLang() === 'fr' ? '' : `&lang=${getLang()}`}`;
  const canShare = typeof navigator.share === 'function';
  const share = async () => { try { await navigator.share({ title: modeName(), text: tr('dm.share', { code: t.code }), url: link }); trackEvent('invite'); } catch { /* annulé */ } };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); trackEvent('invite'); } catch { window.prompt(tr('dm.copyPrompt'), text); }
  };
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => { setErr(null); const a = await p; if (!a.ok) setErr(a.error ? trServer(a.error) : tr('dm.cantDo')); };
  const count = t.members.length;
  const allReady = t.members.every((m) => m.ready || m.bot);
  return (
    <Shell title={trServer(t.title)} onBack={() => { session.leave(); onExit(); }} wide icon="dice" sub={tr('dm.players', { name: modeName(), n: count, max: DM_TABLE_MAX })}
      foot={isHost ? <BigAction icon="dice" disabled={count < 2 || !allReady} onClick={() => void run(session.start())}
        label={count < 2 ? tr('dm.waitPlayers') : !allReady ? tr('dm.waitReady') : tr('dm.start')}
        sub={t.stake > 0 ? tr('dm.stakeEach', { n: t.stake, pot: t.stake * count }) : tr('dm.free.game')} />
        : me && !t.quick ? <BigAction icon="check" tone={me.ready ? undefined : 'gold'} label={tr(me.ready ? 'dm.notReadyAny' : 'dm.ready')}
          sub={t.stake > 0 ? tr('dm.stakeLine', { n: t.stake }) : tr('dm.free.game')} onClick={() => void run(session.setReady(!me.ready))} /> : undefined}>
      <div className="dm-lobby-code">
        <span>{tr(t.visibility === 'public' ? 'dm.public' : 'dm.invite')}{tr('dm.codeWord')}<b>{t.code}</b></span>
        <button className="btn small" onClick={() => void copy(t.code, 'code')}><Icon name="copy" size={16} />{tr(copied === 'code' ? 'dm.copied' : 'dm.codeBtn')}</button>
        {canShare ? <button className="btn small" onClick={() => void share()}><Icon name="share" size={16} />{tr('dm.inviteBtn')}</button>
          : <button className="btn small" onClick={() => void copy(link, 'lien')}><Icon name="share" size={16} />{tr(copied === 'lien' ? 'dm.copied' : 'dm.linkBtn')}</button>}
      </div>
      {t.quick && <QuickInfo quick={t.quick} />}
      <ul className="dm-lobby-seats">
        {t.members.map((m: DmPublicMember, i) => {
          const mine = m.id === session.playerId;
          return (
            <li key={m.id} className={`dm-ls${mine ? ' dm-ls-me' : ''}${m.ready || m.bot ? ' ready' : ''}`} style={{ ['--pc' as string]: COLORS[i % COLORS.length] }}>
              <Avatar photo={m.photo ?? null} emoji={m.avatar} size={34} accessory={m.accessory} />
              <span className="dm-ls-text"><b>{botName(m.name)}{mine ? tr('dm.me') : ''}{m.isHost && <i className="dm-host" title={tr('dm.host')}> ★</i>}</b>
                <small>{m.filler ? tr('dm.fillerBot') : m.bot ? tr('dm.botLevel', { level: levelLabel(m.bot) }) : tr(!m.connected ? 'dm.offline' : m.ready ? 'dm.isReady' : 'dm.notReady')}</small></span>
              {(m.ready || m.bot) && <Icon name="check" size={16} />}
              {isHost && !mine && <button className="btn ghost small" onClick={() => void run(m.bot ? session.removeBot(m.id) : session.kick(m.id))}>{tr(m.bot ? 'dm.remove' : 'dm.kick')}</button>}
            </li>
          );
        })}
        {count < DM_TABLE_MAX && <li className="dm-ls empty"><button onClick={() => (canShare ? void share() : void copy(link, 'lien'))}><Icon name="plus" size={18} />
          {tr('dm.freeSeats', { n: DM_TABLE_MAX - count, s: plural(DM_TABLE_MAX - count) })}</button></li>}
      </ul>
      {isHost && count < DM_TABLE_MAX && (
        <Section title={tr('dm.bots')}>
          <Choices value={level} onChange={setLevel} options={DM_LEVELS.map((l) => ({ v: l.v, label: levelLabel(l.v) }))} />
          {t.stake > 0 && <p className="k-hint">{level === DM_NO_STAKE_LEVEL ? <span className="dm2-nostake">{tr('dm2.noStake')}</span> : tr('dm2.botCap', { n: DM_BOT_GAIN_DAILY })}</p>}
          <div className="dm-lobby-bots">
            <button className="btn small" onClick={() => void run(session.addBot(level))}><Icon name="plus" size={16} />{tr('dm.addBot')}</button>
            {!t.quick && <button className="btn small" onClick={() => void run(session.fill(level))}><Icon name="people" size={16} />{tr('dm.fill')}</button>}
          </div>
        </Section>
      )}
      {pa.isAccount && count < DM_TABLE_MAX && <DmInviteFriends pa={pa} inTable={t.members.map((m) => m.account ?? m.name)} />}
      <Section title={tr('dm.settings')}>
        {isHost && !t.quick ? (
          <>
            <Choices value={t.target} onChange={(v) => void run(session.config({ target: v }))} options={TARGET_OPTS()} />
            <Choices value={t.visibility} onChange={(v) => void run(session.config({ visibility: v }))} options={VIS_OPTS()} />
            <h3 className="dm-sub">{tr('dm.stakePerPlayer')}</h3>
            <StakePicker value={t.stake} balance={groschen.balance} onChange={(v) => void run(session.config({ stake: v }))}
              note={tr('dm.needAccount')} />
          </>
        ) : (
          <ul className="muted dm-lobby-rules">
            <li>{tr('dm.target', { n: fmt(t.target) })}</li>
            <li>{t.stake > 0 ? <>{tr('dm.stakeRule1')}<Groschen n={t.stake} size={14} />{tr('dm.stakeRule2')}</> : tr('dm.free.game')}</li>
            {groschen.balance != null && t.stake > 0 && <li>{tr('dm.yourBal', { n: fmt(groschen.balance) })}</li>}
          </ul>
        )}
      </Section>
      {!session.connected && <p className="error">{tr('dm.reconnect')}</p>}
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
      <div>{quick.startAt ? <><b>{tr('dm.startIn', { n: secs(quick.startAt) })}</b><small>{tr('dm.startInSub')}</small></>
        : quick.fillAt ? <><b>{tr('dm.seeking')}</b><small>{tr('dm.seekingSub', { n: secs(quick.fillAt) })}</small></>
          : <><b>{tr('dm.quick')}</b><small>{tr('dm.quickWait')}</small></>}</div>
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
    <Section title={tr('dm.inviteFriends')}>
      <ul className="dm-invite">
        {list.slice(0, 8).map((f) => (
          <li key={f.username}>
            <i className={`fr-dot ${f.online ? 'on' : ''}`} aria-hidden /><b>{f.username}</b>
            {sent[f.username] ? <small className="muted">{sent[f.username]}</small> : (
              <button className="btn small" onClick={async () => {
                try { await api('/invites', { token: pa.token!, body: { username: f.username } }); setSent((x) => ({ ...x, [f.username]: tr('dm.inviteSent') })); }
                catch (e) { setSent((x) => ({ ...x, [f.username]: trServer((e as Error).message) })); }
              }}>{tr('dm.inviteBtn')}</button>
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
    const s = new DmSession(pa.token, { name: me.name || pa.session?.username || tr('dm.player'), avatar: me.avatar, dice: pa.profile.equipped.dice });
    let off = false;
    void (async () => {
      try {
        if (mode.kind === 'create') await s.create(mode);
        else if (mode.kind === 'join') await s.join(mode.code);
        else if (mode.kind === 'quick') await s.quick();
        else if (mode.kind === 'watch') await s.watch(mode.code, me.name || tr('dm.spectator'));
        else if (mode.kind === 'solo') await s.solo({ target: mode.setup.target, stake: mode.setup.stake, opponents: mode.setup.opponents, level: mode.setup.level, bots: mode.opponents.map((p) => ({ name: p.name, avatar: p.avatar })) });
        else { const saved = loadDmSession(); if (!saved) throw new Error('Aucune partie à reprendre.'); await s.resume(saved); }
        if (!off) setSession(s);
        if (mode.kind === 'solo' || mode.kind === 'create') groschen.reload();
      } catch (e) { s.socket.disconnect(); if (!off) setError(trServer((e as Error).message)); }
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
  // Partir par la barre du bas (salon, attente) : comme la flèche retour ; en partie, l'écran de jeu confirme d'abord.
  useNavGuard(session ? { leave: () => session.leave() } : null);

  if (error || session?.kicked || session?.watchClosed) {
    return <Shell title={modeName()} onBack={onExit} icon="dice"><div className="k-wait"><p className="error">{error ?? trServer(session?.kicked ?? session?.watchClosed ?? '')}</p><button className="btn" onClick={onExit}>{tr('dm.back')}</button></div></Shell>;
  }
  if (!session || !session.table) {
    return <Shell title={modeName()} onBack={() => { session?.leave(); onExit(); }} icon="dice"><div className="k-wait"><span className="k-spinner" aria-hidden /><p>{tr(mode.kind === 'quick' ? 'dm.findTable' : mode.kind === 'resume' ? 'dm.reconnectTable' : 'dm.connecting')}</p></div></Shell>;
  }
  if (session.table.status === 'playing' && session.state) {
    return <DmOnlineGame key={`${session.table.code}:${session.state.turns === 0 && session.version <= 1 ? session.version : 'g'}`} session={session} pa={pa} settings={settings} onSettings={onSettings}
      appearance={pa.profile.equipped} onExit={onExit} onReplay={onReplay} groschen={groschen} onBags={onBags}
      personas={mode.kind === 'solo' ? mode.opponents : undefined} />;
  }
  if (session.spectating) return <Shell title={modeName()} onBack={() => { session.leave(); onExit(); }} icon="eye"><div className="k-wait"><p>{tr('dm.notStarted')}</p></div></Shell>;
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
  // Pas de mise contre le niveau Débutant (0.53 : Groschen trop faciles à gagner) ; le serveur refuse de toute façon.
  const noStake = setup.level === DM_NO_STAKE_LEVEL;
  const stake = bal != null && setup.stake <= bal && !noStake ? setup.stake : 0;
  const pot = stake * (setup.opponents + 1);
  const saved = loadDmSession();
  const right = (
    <>
      {bal != null && <span className="dm-wallet" aria-label={`${bal} Groschen`}><GroschenIcon size={18} /><b>{fmt(bal)}</b></span>}
      <button className="icon-btn" onClick={onRules} aria-label={tr('dm.rulesTitle')}><Icon name="rules" /></button>
    </>
  );
  return (
    <Shell title={modeName()} onBack={onBack} icon="dice" wide sub={tr('dm.subTitle')} right={right}
      foot={tab === 'solo'
        ? <BigAction icon="dice" label={stake > 0 ? tr('dm.stakePlay', { n: fmt(stake) }) : tr('dm.sit')}
          sub={`${tr('dm.opp', { n: setup.opponents, s: plural(setup.opponents) })} · ${levelLabel(level.v)} · ${tr('dm.pointsW', { n: fmt(setup.target) })}${stake > 0 ? tr('dm.potW', { n: fmt(pot) }) : tr('dm.freeW')}`}
          onClick={() => (stake > 0 ? onOnline({ kind: 'solo', setup: { ...setup, stake }, opponents: chosen }) : onStart({ ...setup, stake: 0 }, chosen))} />
        : <BigAction icon="dice" tone="gold" label={tr('dm.quick')} sub={tr('dm.quickSub')} onClick={() => onOnline({ kind: 'quick' })} />}>
      <div className="dm-intro">
        <span className="dm-intro-dice" aria-hidden>{[1, 5, 5, 1].map((v, i) => <MiniDie key={i} value={v} size={18} />)}</span>
        <p>{tr('dm.intro')}<button className="link" onClick={onRules}>{tr('dm.readRules')}</button></p>
      </div>
      {!pa.isAccount && onAccount && !NO_SERVER && <button className="dm-gr-cta" onClick={onAccount}><GroschenIcon size={22} /><span><b>{tr('dm.groschenCta')}</b><small>{tr('dm2.cta', { n: GROSCHEN_DAILY })}</small></span></button>}
      {!NO_SERVER && <div className="seg dm-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'solo'} className={tab === 'solo' ? 'on' : ''} onClick={() => setTab('solo')}>{tr('dm.vsCpu')}</button>
        <button role="tab" aria-selected={tab === 'ligne'} className={tab === 'ligne' ? 'on' : ''} onClick={() => setTab('ligne')}>{tr('dm.online26')}</button>
      </div>}
      {tab === 'solo' ? (
        <>
          <Section title={tr('dm.opponents')} aside={<button className="btn ghost small" onClick={() => setRoster([...PERSONAS].sort(() => Math.random() - 0.5))}><Icon name="resume" size={18} /> {tr('dm.change')}</button>}>
            <div className="k-pills big" role="radiogroup" aria-label={tr('dm.oppCount')}>
              {[1, 2, 3].map((n) => <button key={n} role="radio" aria-checked={n === setup.opponents} className={n === setup.opponents ? 'on' : ''} onClick={() => set({ opponents: n })}>{n}</button>)}
            </div>
            <ul className="solo-roster">
              {chosen.map((p) => (
                <li key={p.id} style={{ ['--pc' as string]: p.color }}>
                  <span className="avatar"><span>{p.avatar}</span></span>
                  <b>{botName(p.name)}</b><small>{personaOf(p)?.tagline ?? p.tagline}</small>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={tr('dm.level')}><Choices value={setup.level} onChange={(v) => set({ level: v })} options={DM_LEVELS.map((l) => ({ v: l.v, label: levelLabel(l.v), hint: tr(`dm.lh.${l.v}`) }))} /></Section>
          <Section title={tr('dm.targetTitle')}>
            <Choices value={setup.target} onChange={(v) => set({ target: v })} options={TARGET_OPTS()} />
          </Section>
          <Section title={tr('dm.stakeTitle')}>
            <StakePicker value={stake} balance={bal} disabled={noStake} onChange={(v) => set({ stake: v })} />
            {noStake && bal != null && <p className="k-hint dm2-nostake">{tr('dm2.noStake')}</p>}
            {stake > 0 && <p className="k-hint">{tr('dm.soloStake1', { n: fmt(stake) })}<b>{tr('dm.soloStake2', { n: fmt(pot) })}</b>{tr('dm.soloStake3')} {tr('dm2.botCap', { n: DM_BOT_GAIN_DAILY })}</p>}
          </Section>
        </>
      ) : (
        <>
          {saved && <button className="home-banner resume dm-resume" onClick={() => onOnline({ kind: 'resume' })}><Icon name="resume" size={20} /><span><b>{tr('dm.resume')}</b><small>{tr('dm.tableN', { code: saved.code })}</small></span></button>}
          <Section title={tr('dm.joinCode')}>
            <form className="hub-code" onSubmit={(e) => { e.preventDefault(); if (code.length === 5) onOnline({ kind: 'join', code }); }}>
              <Icon name="key" size={20} />
              <input value={code} maxLength={5} placeholder="CODE" aria-label={tr('dm.code')} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn small primary" disabled={code.length !== 5}>{tr('dm.join')}</button>
            </form>
          </Section>
          <Section title={tr('dm.openTable')}>
            <Choices value={table.target} onChange={(v) => setTable((t) => ({ ...t, target: v }))} options={TARGET_OPTS()} />
            <Choices value={table.visibility} onChange={(v) => setTable((t) => ({ ...t, visibility: v }))} options={VIS_OPTS()} />
            <StakePicker value={bal != null && table.stake <= bal ? table.stake : 0} balance={bal} onChange={(v) => setTable((t) => ({ ...t, stake: v }))} note={tr('dm.needAccount2')} />
            <button className="btn primary wide dm-open" onClick={() => onOnline({ kind: 'create', ...table, stake: bal != null && table.stake <= bal ? table.stake : 0 })}><Icon name="plus" size={18} />{tr('dm.open2')}</button>
            <p className="muted small">{tr('dm.openSub')}</p>
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
  useLang();
  const groschen = useGroschen(pa);
  const me = { name: pa.session?.username ?? displayName ?? tr('dm.you'), avatar, photo: pa.photo };
  const toMenu = () => { groschen.reload(); setRoute({ r: 'menu' }); };
  const back = () => { groschen.reload(); setRoute({ r: 'setup', tab: 'solo' }); };
  const bags = onCollection && (() => onCollection(true));
  const gift = (groschen.gift > 0 || groschen.welcome > 0) && <GiftBurst amount={groschen.gift + groschen.welcome} onClose={groschen.dismissGift}
    sub={groschen.welcome > 0 ? tr(groschen.newcomer ? 'dm2.welcome.new' : 'dm2.welcome.old') : undefined} />;
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
      {rules && <Sheet title={tr('dm.rulesTitle')} onClose={() => setRules(false)}><DmRules /></Sheet>}
      {gift}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Menu du mode : Groschen, jouer, sacs de dés, collection, statistiques, règles, réglages, aide

const HELP_PAGES = () => (getLang() !== 'fr' ? [
  { path: '/play-farkle-online', label: tr('dm.help1') },
  { path: '/farkle-rules', label: tr('dm.help2') },
  { path: '/kingdom-come-deliverance-2-dice-game', label: tr('dm.help3') },
] : [
  { path: '/dix-mille-en-ligne', label: tr('dm.help1') },
  { path: '/regles-du-dix-mille', label: tr('dm.help2') },
  { path: '/strategie-dix-mille', label: tr('dm.help3') },
]);
/** Adresse d'une page d'aide : sur le site, ou sur 421online.com (fichier unique, application). */
const helpUrl = (path: string) => (NO_SERVER || !/^https?:$/.test(location.protocol) ? `https://421online.com${path}` : path);

const grReason = (r: string) => (r === 'cadeau' || r === 'mise' || r === 'gain' || r === 'remboursement' || r === 'admin' ? tr(`gr.${r}`)
  : r === 'bienvenue' ? tr('dm2.gr.bienvenue') : r === 'gain-ordi' ? tr('dm2.gr.gainOrdi') : r);
const fmtWhen = (t: number) => { const fr = getLang() === 'fr'; const d = new Intl.DateTimeFormat(fr ? 'fr-BE' : getLang() === 'en' ? 'en-GB' : `${getLang()}-${getLang().toUpperCase()}`, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t)); return !fr ? d : d.replace(/(\d{1,2}):(\d{2})/, '$1 h $2'); };

function DmMenu({ pa, groschen, onHome, onAccount, onRules, onSetup, onOnline, onCollection }: {
  pa: ProfileApi; groschen: ReturnType<typeof useGroschen>;
  onHome: () => void; onAccount?: () => void;
  onRules: () => void; onSetup: (tab: 'solo' | 'ligne') => void; onOnline: (m: DmOnlineMode) => void;
  onCollection?: (open?: boolean) => void;
}) {
  const p = pa.profile;
  const acc = pa.isAccount;
  const [code, setCode] = useState('');
  const [sheet, setSheet] = useState<'stats' | 'history' | 'succes' | null>(null);
  const bal = groschen.balance;
  const bags = p.bags ?? 0;
  const saved = NO_SERVER ? null : loadDmSession();
  const st = p.dm;
  return (
    <div className="dm-menu">
      <ModeBar tone="dixmille" title={modeName()} onBack={onHome}>
        <LangSwitch />
        {acc && bal != null ? <ModeChip onClick={() => setSheet('history')} label={tr('dm.grHistory', { n: bal })}><GroschenIcon size={18} /><b>{fmt(bal)}</b></ModeChip>
          : null}
        <button className="icon-btn mode-rules" onClick={onRules} aria-label={tr('dm.rulesTitle')}><Icon name="rules" size={20} /></button>
      </ModeBar>
      <main className="dm-menu-main">
        {saved && <button className="home-banner resume dm-resume" onClick={() => onOnline({ kind: 'resume' })}><Icon name="resume" size={20} /><span><b>{tr('dm.resume')}</b><small>{tr('dm.tableN', { code: saved.code })}</small></span></button>}
        {/* Sacs de dés gagnés ici : accès direct (la collection est commune aux trois jeux, dans le menu principal). */}
        {bags > 0 && onCollection && <button className="home-banner gift dm-bags" onClick={() => onCollection(acc)}><BagIcon size={26} /><span><b>{bags > 1 ? tr('dm.bagsN', { n: bags }) : tr('dm.bag1')}{tr(acc ? 'dm.toOpen' : 'dm.kept')}</b><small>{tr(acc ? 'dm.bagsWon' : 'dm.bagsAcc')}</small></span><em>{tr('dm.open')}</em></button>}

        <section className="dm-hero">
          <span className="dm-hero-dice" aria-hidden>
            <DieCube id={p.equipped.dice} size={46} />
            <span className="dm-hero-mini">{[1, 5, 5, 1, 1].map((v, i) => <MiniDie key={i} value={v} size={16} />)}</span>
          </span>
          <span className="dm-hero-text">
            <h1>{modeName()}</h1>
            <p>{tr('dm.hero')}</p>
          </span>
        </section>

        {!NO_SERVER && (acc ? (
          <button className="dm-purse" onClick={() => setSheet('history')}>
            <GroschenIcon size={34} />
            <span className="dm-purse-text">
              <b>{bal == null ? '…' : tr('dm.purse', { n: fmt(bal) })}</b>
              <small>{tr(groschen.giftToday ? 'dm.giftGot' : 'dm.giftNext', { n: GROSCHEN_DAILY })}</small>
            </span>
            <em>{tr('dm.history')}</em>
          </button>
        ) : onAccount && (
          <button className="dm-gr-cta" onClick={onAccount}><GroschenIcon size={22} /><span><b>{tr('dm.groschenCta')}</b><small>{tr('dm2.cta', { n: GROSCHEN_DAILY })}</small></span></button>
        ))}

        <div className="dm-plays">
          <button className="dm-play solo" onClick={() => onSetup('solo')}>
            <span className="dm-play-ic" aria-hidden><Icon name="dice" size={26} /></span>
            <span className="dm-play-text"><b>{tr('dm.vsCpu')}</b><small>{tr('dm.vsSub')}</small></span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </button>
          {!NO_SERVER && <>
            <div className="dm-play-row">
              <button className="dm-play quick" onClick={() => onOnline({ kind: 'quick' })}><span className="dm-play-text"><b>{tr('dm.quick')}</b><small>{tr('dm.quickSub2')}</small></span></button>
              <button className="dm-play table" onClick={() => onSetup('ligne')}><span className="dm-play-text"><b>{tr('dm.openTable')}</b><small>{tr('dm.tableSub')}</small></span></button>
            </div>
            <form className="hub-code dm-code" onSubmit={(e) => { e.preventDefault(); if (code.length === 5) onOnline({ kind: 'join', code }); }}>
              <Icon name="key" size={20} />
              <input value={code} maxLength={5} placeholder="CODE" aria-label={tr('dm.code')} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn small primary" disabled={code.length !== 5}>{tr('dm.join')}</button>
            </form>
          </>}
        </div>

        <div className="dm-tiles">
          <button className="dm-tile" onClick={() => setSheet('stats')}>
            <span className="dm-tile-art" aria-hidden><Icon name="chart" size={28} /></span>
            <b>{tr('dm.stats')}</b><small>{st?.games ? tr('dm.gamesN', { n: st.games, s: plural(st.games) }) : tr('dm.yourGames')}</small>
          </button>
          <button className="dm-tile" onClick={onRules}>
            <span className="dm-tile-art" aria-hidden><Icon name="rules" size={28} /></span>
            <b>{tr('dm.rules')}</b><small>{tr('dm.andValues')}</small>
          </button>
          {acc && !NO_SERVER ? <button className="dm-tile" onClick={() => setSheet('history')}>
            <span className="dm-tile-art" aria-hidden><GroschenIcon size={30} /></span>
            <b>Groschen</b><small>{tr('dm.history')}</small>
          </button> : onCollection && <button className="dm-tile bags" onClick={() => onCollection()}>
            <span className="dm-tile-art" aria-hidden><BagIcon size={34} /></span>
            <b>{tr('dm.bagsTile')}</b><small>{tr('dm.bagsSub')}</small>
          </button>}
        </div>

        <DmAchievements profile={p} compact onOpen={() => setSheet('succes')} />

        <nav className="dm-help" aria-label={tr('dm.helpAria')}>
          <span>{tr('dm.help')}</span>
          {HELP_PAGES().map((h) => <a key={h.path} href={helpUrl(h.path)} target="_blank" rel="noopener">{h.label}</a>)}
        </nav>
        <FrenchOnlyNote />
      </main>

      {sheet === 'stats' && (
        <Sheet title={tr('dm.statsTitle')} onClose={() => setSheet(null)}>
          <div className="dm-stats">
            <div><b>{fmt(st?.games ?? 0)}</b><small>{tr('dm.st.games')}</small></div>
            <div><b>{fmt(st?.wins ?? 0)}</b><small>{tr('dm.st.wins')}{st?.games ? ` (${Math.round(((st.wins ?? 0) / st.games) * 100)} %)` : ''}</small></div>
            <div><b>{fmt(st?.bestTurn ?? 0)}</b><small>{tr('dm.st.best')}</small></div>
            <div><b>{acc ? fmt(st?.bestPot ?? 0) : '—'}</b><small>{tr('dm.st.pot')}</small></div>
          </div>
          <p className="muted small">{tr('dm.st.note1')}{acc ? '' : tr('dm.st.note2')}{tr('dm.st.note3')}</p>
        </Sheet>
      )}
      {sheet === 'succes' && (
        <Sheet title={tr('dm2.ach.title')} onClose={() => setSheet(null)}>
          <DmAchievements profile={p} />
        </Sheet>
      )}
      {sheet === 'history' && (
        <Sheet title={tr('dm.moves')} onClose={() => setSheet(null)}>
          {!groschen.history?.length ? <p className="muted">{tr('dm.noMoves')}</p> : (
            <ul className="dm-ledger">
              {groschen.history.map((m, i) => (
                <li key={i}>
                  <span><b>{grReason(m.reason)}</b><small>{fmtWhen(m.at)}</small></span>
                  <em className={m.delta > 0 ? 'up' : 'down'}>{m.delta > 0 ? '+' : '−'}{fmt(Math.abs(m.delta))}</em>
                  <small className="dm-ledger-bal">{tr('dm.moveBal', { n: fmt(m.balance) })}</small>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">{tr('dm.moves20')}</p>
        </Sheet>
      )}
    </div>
  );
}

/** Avatars proposés (ré-export pratique pour d'éventuels écrans du mode). */
export { AVATARS };
/** Effacer la reprise mémorisée (partie terminée ailleurs). */
export const forgetDmSession = () => saveDmSession(null);
