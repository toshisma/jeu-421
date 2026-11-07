/**
 * Le Dix mille : réglages de la partie (adversaires, niveau, score à atteindre) et partie contre
 * l'ordinateur dans le bac 3D (6 dés). Le moteur est dans shared/dixmille.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { act, currentPlayer, diceAfter, inPlay, newGame, pickPoints, ranking, scoreParts, DM_LEVELS, DM_TARGETS, DM_VALUES, type DmAction, type DmEvent, type DmLevel, type DmState } from '../../../shared/dixmille/engine';
import { decide } from '../../../shared/dixmille/ai';
import type { Appearance } from '../../../shared/progress/catalog';
import type { Reward } from '../../../shared/progress/profile';
import type { ProfileApi } from '../account/useProfile';
import type { Settings } from '../settings';
import type { Insets } from '../three/TrayScene';
import type { ThrowGesture } from '../physics/diceSim';
import { PERSONAS, PERSONA_DICE, type Persona } from '../game/personas';
import { DiceTray, type DiceTrayHandle } from '../ui/DiceTray';
import { BigAction, Choices, Section, Sheet, Shell } from '../ui/kit';
import { MiniDie } from '../ui/MiniDie';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { ModeSwitch } from '../ui/ModeSwitch';
import { VolumeControl } from '../ui/VolumeControl';
import { askConfirm } from '../ui/confirm';
import { sound } from '../audio/sound';

const fmt = (n: number) => n.toLocaleString('fr-BE');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SETUP_KEY = '421.dixmille';

export interface DmSetup { opponents: number; level: DmLevel; target: number }
function loadSetup(): DmSetup {
  try {
    const v = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null');
    if (v && [1, 2, 3].includes(v.opponents) && DM_LEVELS.some((l) => l.v === v.level) && (DM_TARGETS as readonly number[]).includes(v.target)) return v;
  } catch { /* */ }
  return { opponents: 1, level: 'habitue', target: 4000 };
}
function saveSetup(s: DmSetup) { try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch { /* */ } }

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
      <p>On joue avec <b>6 dés</b>. Le but : être le premier à atteindre <b>{target ? fmt(target) : 'le score choisi'}</b> points.</p>
      <ol>
        <li>À votre tour, lancez les 6 dés.</li>
        <li><b>Touchez les dés qui rapportent</b> pour les mettre de côté (au moins un). Chaque dé mis de côté doit rapporter : un 1, un 5, ou une combinaison.</li>
        <li>Puis choisissez : <b>Relancer</b> les dés restants pour gagner plus, ou <b>Encaisser</b> les points du tour.</li>
        <li>Si un lancer ne contient <b>aucun dé qui rapporte</b> : <b>Raté !</b> Les points du tour sont perdus, la main passe.</li>
        <li><b>Main pleine :</b> les 6 dés ont été mis de côté en rapportant ? Vous pouvez relancer les 6 et continuer à accumuler.</li>
        <li>Une combinaison compte seulement si ses dés sortent <b>dans le même lancer</b>.</li>
        <li>Le premier qui atteint le score à atteindre en encaissant <b>gagne aussitôt</b>.</li>
      </ol>
      <h3>Valeurs</h3>
      <DmValues />
      <p className="muted small">Astuce : avec beaucoup de dés, on rate rarement (1 fois sur 40 avec 6 dés) ; avec 1 seul dé, 2 fois sur 3. Parfois, mieux vaut ne garder qu'un 1 et relancer plus de dés.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Réglages de la partie

export function DixMilleSetup({ onBack, onStart, onClassic, onCards, onRules }: {
  onBack: () => void; onStart: (s: DmSetup, opponents: Persona[]) => void; onClassic: () => void; onCards?: () => void; onRules: () => void;
}) {
  const [setup, setSetup] = useState<DmSetup>(loadSetup);
  const [roster, setRoster] = useState(() => [...PERSONAS].sort(() => Math.random() - 0.5));
  const chosen = roster.slice(0, setup.opponents);
  const set = (p: Partial<DmSetup>) => setSetup((s) => { const n = { ...s, ...p }; saveSetup(n); return n; });
  const level = DM_LEVELS.find((l) => l.v === setup.level)!;
  return (
    <Shell title="Le Dix mille" onBack={onBack} icon="dice" wide sub="Jeu de dés à 6 dés"
      right={<button className="icon-btn" onClick={onRules} aria-label="Règles du Dix mille"><Icon name="rules" /></button>}
      foot={<BigAction icon="dice" label="S'asseoir à la table" sub={`${setup.opponents} adversaire${setup.opponents > 1 ? 's' : ''} · ${level.label} · ${fmt(setup.target)} points`}
        onClick={() => onStart(setup, chosen)} />}>
      {onCards && <ModeSwitch active="dixmille" onClassic={onClassic} onCards={onCards} onDixMille={() => {}} />}
      <div className="dm-intro">
        <span className="dm-intro-dice" aria-hidden>{[1, 5, 5, 1, 1, 1].map((v, i) => <MiniDie key={i} value={v} size={22} />)}</span>
        <p>Mettez de côté les dés qui rapportent, relancez les autres… ou encaissez avant de tout perdre.</p>
        <button className="btn ghost small" onClick={onRules}><Icon name="rules" size={18} /> Règles</button>
      </div>
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
      <Section title="Niveau">
        <Choices value={setup.level} onChange={(v) => set({ level: v })} options={DM_LEVELS} />
      </Section>
      <Section title="Score à atteindre">
        <Choices value={setup.target} onChange={(v) => set({ target: v })} options={[
          { v: 2000, label: '2 000', hint: 'Rapide' }, { v: 4000, label: '4 000', hint: 'Normal' }, { v: 10000, label: '10 000', hint: 'Le vrai' },
        ]} />
      </Section>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------
// Partie

interface Seat { id: string; name: string; avatar: string; color: string; photo?: string | null; persona?: Persona; isMe: boolean }
type Flash = { kind: 'rate'; lost: number; name: string; id: number } | { kind: 'pleine'; id: number } | { kind: 'gain'; points: number; seat: string; id: number };

export function DixMilleGame({ setup, opponents, pa, settings, onSettings, appearance, me, onExit, onReplay }: {
  setup: DmSetup; opponents: Persona[]; pa: ProfileApi; settings: Settings; onSettings: (s: Settings) => void; appearance: Appearance;
  me: { name: string; avatar: string; photo: string | null }; onExit: () => void; onReplay: () => void;
}) {
  const seats = useMemo<Seat[]>(() => [
    { id: 'moi', name: me.name || 'Vous', avatar: me.avatar, color: '#f1cc7d', photo: me.photo, isMe: true },
    ...opponents.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, persona: p, isMe: false })),
  ], []); // eslint-disable-line react-hooks/exhaustive-deps
  const [s, setS] = useState<DmState>(() => newGame(
    seats.map((x) => ({ id: x.id, name: x.name, bot: x.isMe ? undefined : setup.level })),
    setup.target, crypto.getRandomValues(new Uint32Array(1))[0]));
  const sRef = useRef(s);
  sRef.current = s;
  const [sel, setSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [sheet, setSheet] = useState<'regles' | 'valeurs' | null>(null);
  const [botPick, setBotPick] = useState<number[]>([]);
  const [say, setSay] = useState<{ seat: string; text: string } | null>(null);
  const [end, setEnd] = useState<{ reward: Reward | null; done: boolean } | null>(null);
  const tray = useRef<DiceTrayHandle>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; pa.onDixMilleStart(); return () => { alive.current = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = currentPlayer(s);
  const curSeat = seats.find((x) => x.id === cur.id)!;
  const myTurn = curSeat.isMe && s.phase !== 'fini';
  const live = s.phase === 'choisir' ? inPlay(s) : [];
  const selPoints = sel.length ? pickPoints(s, sel) : null;

  // Mise en page : le bac est cadré entre le haut (joueurs) et le bas (actions).
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  useLayoutEffect(() => {
    const measure = () => setInsets({
      top: (topRef.current?.getBoundingClientRect().bottom ?? 0) + 2,
      bottom: window.innerHeight - (bottomRef.current?.getBoundingClientRect().top ?? window.innerHeight) + 2,
      left: 0, right: 0,
    });
    measure();
    const ro = new ResizeObserver(measure);
    [topRef, bottomRef].forEach((r) => r.current && ro.observe(r.current));
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  /** Joue les événements d'une action dans le bac (lancers, raté, main pleine), puis l'état final. */
  const play = useCallback(async (events: DmEvent[], next: DmState, gesture?: ThrowGesture) => {
    for (const e of events) {
      if (!alive.current) return;
      if (e.kind === 'main-pleine') {
        sound.chips(6); sound.validate();
        setFlash({ kind: 'pleine', id: Date.now() });
        tray.current?.setHidden(Array(6).fill(false));
        await wait(900);
      } else if (e.kind === 'lancer') {
        const seat = seats.find((x) => x.id === e.playerId)!;
        tray.current?.setDiceSkin(seat.isMe ? null : PERSONA_DICE[seat.id] ?? null);
        tray.current?.setKept(Array(6).fill(false));
        tray.current?.setHidden(e.rolled.map((r) => !r));
        // Les dés mis de côté quittent le bac : l'affichage passe à l'état « en cours » pendant le lancer.
        setS((p) => ({ ...p, out: e.rolled.map((r) => !r), phase: p.phase === 'fini' ? p.phase : 'choisir', rolled: Array(6).fill(false) }));
        const seed = (next.seed ^ (next.draws * 2654435761)) >>> 0;
        await tray.current?.roll(e.dice, e.rolled.map((r) => !r), seed, gesture);
        gesture = undefined;
      } else if (e.kind === 'rate') {
        const seat = seats.find((x) => x.id === e.playerId)!;
        sound.lose();
        setFlash({ kind: 'rate', lost: e.lost, name: seat.isMe ? 'Vous' : seat.name, id: Date.now() });
        if (!seat.isMe && seat.persona) setSay({ seat: seat.id, text: seat.persona.lines.bad[0] });
        await wait(1700);
      } else if (e.kind === 'encaisse') {
        sound.chips(Math.min(8, 2 + Math.floor(e.points / 300)));
        setFlash({ kind: 'gain', points: e.points, seat: e.playerId, id: Date.now() });
        await wait(700);
      } else if (e.kind === 'gagne') {
        const seat = seats.find((x) => x.id === e.playerId)!;
        if (seat.isMe) { sound.win(); tray.current?.celebrate(null); } else sound.lose();
      }
    }
    if (!alive.current) return;
    setS(next);
    setSel([]);
    setBotPick([]);
    tray.current?.setKept(Array(6).fill(false));
  }, [seats]);

  const run = useCallback(async (a: DmAction, gesture?: ThrowGesture) => {
    const r = act(sRef.current, a);
    if ('error' in r) return r.error;
    setBusy(true);
    setFlash((f) => (f?.kind === 'gain' ? f : null));
    // Le joueur en cours garde ses points du tour affichés pendant les animations.
    if (a.type !== 'lancer') {
      setS((p) => ({ ...p, turnPoints: p.turnPoints + (pickPoints(p, a.pick) ?? 0), setAside: [...p.setAside, { dice: a.pick.map((i) => p.dice[i]), points: pickPoints(p, a.pick) ?? 0 }] }));
    }
    await play(r.state.events, r.state, gesture);
    if (alive.current) setBusy(false);
    return null;
  }, [play]);

  // Tour des ordinateurs.
  useEffect(() => {
    if (busy || s.phase === 'fini' || curSeat.isMe) return;
    let cancelled = false;
    const p = curSeat.persona!;
    void (async () => {
      await wait(s.phase === 'debut' ? 700 + p.tempo * 0.4 : 500 + p.tempo * 0.5);
      if (cancelled || !alive.current) return;
      const a = decide(sRef.current, setup.level);
      if (a.type !== 'lancer') {
        // On montre d'abord ce qu'il met de côté.
        setBotPick(a.pick);
        tray.current?.setKept(sRef.current.dice.map((_, i) => a.pick.includes(i)));
        sound.click();
        await wait(650 + p.tempo * 0.3);
        if (cancelled || !alive.current) return;
        if (a.type === 'encaisser' && sRef.current.turnPoints + (pickPoints(sRef.current, a.pick) ?? 0) >= 1000) setSay({ seat: p.id, text: p.lines.good[0] });
      }
      await run(a);
    })();
    return () => { cancelled = true; };
  }, [s, busy, curSeat, setup.level, run]);

  useEffect(() => { if (!say) return; const t = setTimeout(() => setSay(null), 2200); return () => clearTimeout(t); }, [say]);
  useEffect(() => { if (!flash || flash.kind === 'rate') return; const t = setTimeout(() => setFlash(null), 1500); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { if (flash?.kind !== 'rate') return; const t = setTimeout(() => setFlash(null), 1900); return () => clearTimeout(t); }, [flash]);

  // Le tour du joueur : les dés en jeu se touchent.
  useEffect(() => { tray.current?.setInteractive(myTurn && s.phase === 'choisir' && !busy); tray.current?.setSwipeEnabled(myTurn && !busy); }, [myTurn, s.phase, busy]);
  useEffect(() => { if (myTurn && !busy) sound.turn(); }, [myTurn, busy, s.turns]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fin de partie : récompense (une seule fois).
  useEffect(() => {
    if (s.phase !== 'fini' || end) return;
    setEnd({ reward: null, done: false });
    const place = ranking(s).findIndex((p) => p.id === 'moi') + 1;
    void (async () => {
      const [r] = await Promise.all([pa.onDixMilleEnd({ won: s.winner === 'moi', place, opponents: opponents.length, level: setup.level }), wait(1400)]);
      if (alive.current) setEnd({ reward: r?.reward ?? null, done: true });
    })();
  }, [s, end, pa, opponents.length, setup.level]);

  const toggle = (i: number) => {
    if (!myTurn || busy || s.phase !== 'choisir' || !live.includes(i)) return;
    sound.click();
    setSel((prev) => {
      const n = prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i];
      tray.current?.setKept(s.dice.map((_, k) => n.includes(k)));
      return n;
    });
  };
  /** Sélectionne tous les dés qui rapportent (raccourci). */
  const pickAll = () => {
    const vals = live.map((i) => s.dice[i]);
    // Meilleure lecture du lancer : on retrouve les indices des dés utilisés.
    const best = scoreParts(vals);
    if (!best) return;
    const used: number[] = [];
    const pool = [...live];
    for (const part of best.parts) for (const v of part.dice) { const k = pool.findIndex((i) => s.dice[i] === v); used.push(pool[k]); pool.splice(k, 1); }
    sound.click();
    setSel(used);
    tray.current?.setKept(s.dice.map((_, k) => used.includes(k)));
  };

  const doRoll = (g?: ThrowGesture) => {
    if (!myTurn || busy) return;
    sound.unlock();
    if (s.phase === 'debut') void run({ type: 'lancer' }, g);
    else if (selPoints !== null) void run({ type: 'relancer', pick: sel }, g);
  };
  const doBank = () => { if (myTurn && !busy && selPoints !== null) void run({ type: 'encaisser', pick: sel }); };

  const leave = async () => {
    if (s.phase !== 'fini' && !(await askConfirm('Quitter la partie de Dix mille en cours ?', 'Quitter'))) return;
    onExit();
  };

  const rerollN = sel.length && selPoints !== null ? diceAfter(s, sel) : 0;
  const turnTotal = s.turnPoints + (selPoints ?? 0);
  const wouldWin = myTurn && selPoints !== null && cur.score + turnTotal >= s.target;
  const deadSel = sel.length > 0 && selPoints === null;
  const lead = Math.max(...s.players.map((p) => p.score));

  const hint = (() => {
    if (s.phase === 'fini') return '';
    if (!myTurn) return busy ? '' : `${curSeat.name} réfléchit…`;
    if (busy) return '';
    if (s.phase === 'debut') return s.turns === 0 ? 'À vous de commencer : lancez les 6 dés.' : 'À vous : lancez les 6 dés (ou glissez le doigt sur le bac).';
    if (deadSel) return 'Un dé choisi ne rapporte rien.';
    if (!sel.length) return 'Touchez les dés qui rapportent pour les mettre de côté.';
    return wouldWin ? 'Encaissez pour gagner la partie !' : '';
  })();

  return (
    <div className="game dm-game" data-phase={s.phase} data-live={live.join(",")} data-rolled={s.rolled.map(Number).join("")} data-out={s.out.map(Number).join("")} data-busy={String(busy)} onPointerDown={() => sound.unlock()}>
      <DiceTray ref={tray} diceCount={6} appearance={appearance} quality={settings.quality} insets={insets} onDieClick={toggle} onSwipe={(g) => doRoll(g)} cup={settings.cup} />
      <div className="vignette" />

      <div className="dm-top" ref={topRef}>
        <div className="topbar">
          <button className="icon-btn" onClick={leave} aria-label="Quitter la partie"><Icon name="back" /></button>
          <div className="phase dm-phase"><span className="dm-logo">{fmt(s.target)}</span><span className="dm-goal">points à atteindre</span></div>
          <div className="top-actions">
            <button className="icon-btn dm-values-btn" onClick={() => setSheet('valeurs')} aria-label="Valeurs des dés"><span>Valeurs</span></button>
            <button className="icon-btn" onClick={() => setSheet('regles')} aria-label="Règles du Dix mille"><Icon name="rules" /></button>
            <VolumeControl settings={settings} onSettings={onSettings} />
          </div>
        </div>
        <div className={`dm-players n${seats.length}`}>
          {seats.map((seat) => {
            const p = s.players.find((x) => x.id === seat.id)!;
            const active = p.id === cur.id && s.phase !== 'fini';
            return (
              <div key={seat.id} className={`dm-seat${active ? ' on' : ''}${s.winner === seat.id ? ' won' : ''}`} style={{ ['--pc' as string]: seat.color }}>
                <Avatar photo={seat.isMe ? seat.photo ?? null : null} emoji={seat.avatar} size={30} />
                <span className="dm-seat-text">
                  <b>{seat.isMe ? 'Vous' : seat.name}</b>
                  <em>{fmt(p.score)}{p.score === lead && lead > 0 && <i className="dm-crown" aria-label="en tête">★</i>}</em>
                </span>
                <span className="dm-bar" aria-hidden><i style={{ width: `${Math.min(100, (100 * p.score) / s.target)}%` }} /></span>
                {flash?.kind === 'gain' && flash.seat === seat.id && <span key={flash.id} className="dm-gain">+{fmt(flash.points)}</span>}
                {say?.seat === seat.id && <span className="dm-say">{say.text}</span>}
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

      <div className={`dm-bottom${myTurn ? ' mine' : ' other'}`} ref={bottomRef} style={{ ['--pc' as string]: curSeat.color }}>
        <div className="dm-turn">
          <span className="dm-who"><Avatar photo={curSeat.isMe ? curSeat.photo ?? null : null} emoji={curSeat.avatar} size={22} />{curSeat.isMe ? 'Votre tour' : curSeat.name}</span>
          <span className="dm-aside" aria-label="Dés mis de côté ce tour">
            {s.setAside.length === 0 && <small className="muted">Rien de côté</small>}
            {s.setAside.map((g, k) => (
              <span key={k} className="dm-group">{g.dice.map((d, j) => <MiniDie key={j} value={d} size={16} />)}</span>
            ))}
          </span>
          <span className="dm-total"><small>Tour</small><b>{fmt(turnTotal)}</b></span>
        </div>
        {myTurn && s.phase === 'choisir' && !busy ? (
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
        ) : myTurn && s.phase === 'debut' && !busy ? (
          <>
            {hint && <p className="dm-hint">{hint}</p>}
            <div className="dm-btns"><button className="btn dm-roll big" onClick={() => doRoll()}><Icon name="dice" size={22} />Lancer les 6 dés</button></div>
          </>
        ) : (
          <p className="dm-hint wait">{hint || (botPick.length ? `${curSeat.name} met de côté ${botPick.length} dé${botPick.length > 1 ? 's' : ''}` : ' ')}</p>
        )}
      </div>

      {sheet && (
        <Sheet title={sheet === 'regles' ? 'Règles du Dix mille' : 'Valeurs des dés'} onClose={() => setSheet(null)}>
          {sheet === 'regles' ? <DmRules target={s.target} /> : <DmValues />}
        </Sheet>
      )}

      {end && (
        <div className="dm-end-back">
          <div className="dm-end" role="dialog" aria-label="Fin de partie">
            <h2>{s.winner === 'moi' ? 'Gagné !' : `${seats.find((x) => x.id === s.winner)?.name} gagne`}</h2>
            <ol className="dm-rank">
              {ranking(s).map((p, k) => {
                const seat = seats.find((x) => x.id === p.id)!;
                return (
                  <li key={p.id} className={seat.isMe ? 'me' : ''} style={{ ['--pc' as string]: seat.color }}>
                    <span className="dm-place">{k + 1}</span>
                    <Avatar photo={seat.isMe ? seat.photo ?? null : null} emoji={seat.avatar} size={28} />
                    <b>{seat.isMe ? 'Vous' : seat.name}</b>
                    <em>{fmt(p.score)}</em>
                    <small>meilleur tour {fmt(p.best)} · {p.misses} raté{p.misses > 1 ? 's' : ''}</small>
                  </li>
                );
              })}
            </ol>
            <div className="dm-reward">
              {!end.done ? <span className="muted">…</span>
                : end.reward && (end.reward.coins || end.reward.xp) ? <>
                  {end.reward.coins > 0 && <span className="dm-coins"><i aria-hidden />+{end.reward.coins} pièce{end.reward.coins > 1 ? 's' : ''}</span>}
                  {end.reward.xp > 0 && <span className="dm-xp">+{end.reward.xp} XP</span>}
                </> : <span className="muted small">Pas de récompense pour cette partie (trop courte ou plafond du jour atteint).</span>}
            </div>
            <div className="dm-end-btns">
              <button className="btn secondary" onClick={onExit}>Accueil</button>
              <button className="btn primary" onClick={onReplay}><Icon name="resume" size={18} /> Rejouer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Mode complet (réglages → partie)

export function DixMilleMode({ pa, settings, onSettings, onHome, onCards, displayName, avatar }: {
  pa: ProfileApi; settings: Settings; onSettings: (s: Settings) => void; onHome: () => void; onCards?: () => void; displayName: string; avatar: string;
}) {
  const [route, setRoute] = useState<{ r: 'setup' } | { r: 'game'; setup: DmSetup; opponents: Persona[]; key: number }>({ r: 'setup' });
  const [rules, setRules] = useState(false);
  const me = { name: pa.session?.username ?? displayName ?? 'Vous', avatar, photo: pa.photo };
  if (route.r === 'game') {
    return <DixMilleGame key={route.key} setup={route.setup} opponents={route.opponents} pa={pa} settings={settings} onSettings={onSettings}
      appearance={pa.profile.equipped} me={me} onExit={() => setRoute({ r: 'setup' })}
      onReplay={() => setRoute({ ...route, key: route.key + 1 })} />;
  }
  return (
    <>
      <DixMilleSetup onBack={onHome} onClassic={onHome} onCards={onCards} onRules={() => setRules(true)}
        onStart={(setup, opponents) => { sound.unlock(); setRoute({ r: 'game', setup, opponents, key: Date.now() }); }} />
      {rules && <Sheet title="Règles du Dix mille" onClose={() => setRules(false)}><DmRules /></Sheet>}
    </>
  );
}
