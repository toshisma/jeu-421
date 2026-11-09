import { useEffect, useRef, useState } from 'react';
import { useNavGuard } from './navGuard';
import { CHALLENGE_THROWS, CHALLENGE_TURNS, challengeShareText, nextDice } from '../../../shared/challenge';
import { evaluate } from '../../../shared/combos';
import { DEFAULT_CONFIG } from '../../../shared/config';
import { today } from '../../../shared/progress/quests';
import type { Appearance } from '../../../shared/progress/catalog';
import { api } from '../account/api';
import { loadChallengeDone, type ProfileApi } from '../account/useProfile';
import { sound } from '../audio/sound';
import type { Settings } from '../settings';
import { DiceTray, type DiceTrayHandle } from './DiceTray';
import { Icon } from './Icon';
import { DiceRow, MiniDie } from './MiniDie';
import { tr, trServer } from '../i18n/lang';
import { ord, trCombo, trn } from '../i18n/g421';

interface Board { top: { username: string; points: number; throws: number }[]; total: number; mine: { points: number; throws: number; rank: number; total: number } | null }
const NO_KEEP = [false, false, false];

/** Défi du jour : 5 coups, les mêmes dés pour tous ; un seul essai classé par jour. */
export interface DuelPlay { id: string; opponent: string; stake: number }
interface DuelOutcome { status: string; mine: { points: number; throws: number }; theirs: { points: number; throws: number } | null; winner: string | null; pot: number }

export function ChallengeScreen({ pa, settings, appearance, onBack, duel }: { pa: ProfileApi; settings: Settings; appearance: Appearance; onBack: () => void; duel?: DuelPlay }) {
  // Défi entre amis : mêmes règles, mais les dés sont tirés d'une suite propre à ce défi.
  const day = duel ? `duel-${duel.id}` : today();
  const [outcome, setOutcome] = useState<DuelOutcome | null>(null);
  const already = loadChallengeDone()?.day === day;
  // Plateau : barre du bas compacte (pas de confirmation, comme la flèche retour).
  useNavGuard({ game: true });
  const tray = useRef<DiceTrayHandle>(null);
  const [turn, setTurn] = useState(0);
  const [throwIdx, setThrowIdx] = useState(0); // lancers faits dans le coup
  const [dice, setDice] = useState<number[]>([0, 0, 0]);
  const [keep, setKeep] = useState<boolean[]>(NO_KEEP);
  const [decisions, setDecisions] = useState<boolean[][][]>([[]]);
  const [scores, setScores] = useState<{ dice: number[]; value: number; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { points: number; reward: { coins: number; xp: number } | null; rank?: number; total?: number; error?: string }>(null);
  const [board, setBoard] = useState<Board | null>(null);

  const loadBoard = () => { if (pa.token && !duel) api<Board>('/challenge/board', { token: pa.token }).then(setBoard).catch(() => {}); };
  useEffect(loadBoard, []); // eslint-disable-line react-hooks/exhaustive-deps

  const combo = dice[0] ? evaluate(dice, DEFAULT_CONFIG.values) : null;
  const throwsLeft = CHALLENGE_THROWS - throwIdx;

  const roll = async () => {
    if (busy || throwsLeft <= 0) return;
    sound.unlock();
    setBusy(true);
    const k = throwIdx === 0 ? NO_KEEP : keep;
    const next = nextDice(day, turn, throwIdx, dice, k);
    if (throwIdx > 0) setDecisions((d) => d.map((x, i) => (i === turn ? [...x, [...k]] : x)));
    tray.current?.setKept(throwIdx === 0 ? NO_KEEP : k);
    await tray.current?.roll(next, k, crypto.getRandomValues(new Uint32Array(1))[0] >>> 1, undefined, evaluate(next, DEFAULT_CONFIG.values).kind === '421');
    setDice(next);
    setThrowIdx((n) => n + 1);
    // Les dés gardés restent gardés pour le lancer suivant (on peut les décocher).
    tray.current?.setKept(throwIdx + 1 < CHALLENGE_THROWS ? k : NO_KEEP);
    setBusy(false);
  };
  const toggle = (i: number) => {
    if (busy || throwIdx === 0 || throwsLeft <= 0) return;
    const k = keep.map((x, j) => (j === i ? !x : x));
    if (k.every(Boolean)) return;
    sound.click();
    setKeep(k);
    tray.current?.setKept(k);
  };
  const bank = async () => {
    if (!combo) return;
    sound.validate();
    const sc = [...scores, { dice, value: combo.value, label: combo.label }];
    setScores(sc);
    if (turn + 1 < CHALLENGE_TURNS) {
      setTurn(turn + 1);
      setThrowIdx(0);
      setKeep(NO_KEEP);
      tray.current?.setKept(NO_KEEP);
      setDice([0, 0, 0]);
      setDecisions((d) => [...d, []]);
      return;
    }
    setBusy(true);
    if (duel) {
      try {
        const r = await api<{ duel: DuelOutcome; profile?: unknown }>(`/duels/${duel.id}/play`, { body: { decisions }, token: pa.token });
        setOutcome(r.duel);
        setDone({ points: r.duel.mine.points, reward: null });
        if (r.duel.winner === pa.session?.username) sound.win();
        pa.refresh();
      } catch (e) { setDone({ points: sc.reduce((a, x) => a + x.value, 0), reward: null, error: (e as Error).message }); }
      setBusy(false);
      return;
    }
    const r = await pa.submitChallenge(decisions);
    setDone({ points: r.result.points, reward: r.reward, rank: r.rank, total: r.total, error: r.error });
    if (r.reward) sound.chips(5);
    loadBoard();
    setBusy(false);
  };

  // Les dés se touchent sur le bac (ou dans la barre du bas) entre deux lancers.
  const canKeep = !busy && !done && throwIdx > 0 && throwsLeft > 0;
  useEffect(() => { tray.current?.setInteractive(canKeep); }, [canKeep]);

  const total = scores.reduce((a, s) => a + s.value, 0);
  // Partage façon Wordle : lancers et couleurs, sans dévoiler les dés.
  const [shared, setShared] = useState<string | null>(null);
  const share = async () => {
    const text = challengeShareText(day, scores.map((s, i) => ({ points: s.value, throws: (decisions[i]?.length ?? 0) + 1 })));
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ text }); setShared(tr('g421.ch.shared')); return; }
      catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); setShared(tr('g421.ch.copied')); }
    catch { window.prompt(tr('g421.ch.copyPrompt'), text); }
  };
  useEffect(() => { if (!shared) return; const t = setTimeout(() => setShared(null), 3000); return () => clearTimeout(t); }, [shared]);
  return (
    <div className="game challenge">
      <DiceTray ref={tray} appearance={appearance} quality={settings.quality} cup={settings.cup}
        insets={{ top: 150, bottom: 150, left: 0, right: 0 }} onDieClick={toggle} />
      <div className="vignette" />
      <div className="top">
        <div className="topbar">
          <button className="icon-btn" onClick={onBack} aria-label={tr('common.back')}><Icon name="back" /></button>
          <div className="phase"><span className="logo-mini">421</span> {duel ? <>{tr('g421.ch.vs', { o: duel.opponent })} <span className="muted">{tr('g421.ch.sameTwo')}</span></> : <>{tr('g421.menu.defi')} <span className="muted">{tr('g421.ch.sameAll')}</span></>}</div>
        </div>
        <div className="tracker">
          <div className="tr-main">
            <span>{tr('g421.ch.turn', { a: Math.min(turn + 1, CHALLENGE_TURNS), b: CHALLENGE_TURNS })}</span>
            <b className="worst">{trn('g421.pt', total)}</b>
          </div>
          <div className="tr-sub">{scores.map((s, i) => <span key={i} className="ch-chip">{tr('g421.ch.chip', { c: trCombo(s.label), v: s.value })}</span>)}</div>
        </div>
      </div>

      {!done ? (
        <div className="actionbar">
          <div className="status">
            <div className="turn-line"><span className="your-turn">{tr(already && !pa.isAccount && !duel ? 'g421.ch.training' : 'g421.pc.you')}</span></div>
            <div className="throws">{Array.from({ length: CHALLENGE_THROWS }, (_, i) => <i key={i} className={i < throwIdx ? 'used' : ''} />)}<span>{trn('g421.ch.left', throwsLeft)}</span></div>
          </div>
          <div className="result">
            {dice[0] > 0 && (
              <div className="keep-row">
                {dice.map((d, i) => (
                  <button key={i} className={`keep-die${keep[i] && canKeep ? ' on' : ''}`} disabled={!canKeep} onClick={() => toggle(i)}
                    aria-label={tr('g421.pa.dieV', { n: d, v: tr(keep[i] ? 'g421.kept' : 'g421.rerolled') })}>
                    <MiniDie value={d} size={30} kept={keep[i] && canKeep} />
                    {canKeep && <small>{tr(keep[i] ? 'g421.kept' : 'g421.rerolled')}</small>}
                  </button>
                ))}
              </div>
            )}
            {combo && <div className="combo-label">{trCombo(combo.label)}<span>{trn('g421.ptLong', combo.value)}</span></div>}
            {throwIdx > 0 && throwsLeft > 0 && <p className="hint center">{tr('g421.ch.hint')}</p>}
          </div>
          <div className="buttons">
            {throwsLeft > 0 && <button className={`btn ${throwIdx === 0 ? 'primary' : ''} big`} disabled={busy} onClick={roll}><Icon name="dice" /> {tr(throwIdx === 0 ? 'g421.ch.roll' : 'g421.ch.reroll')}</button>}
            {throwIdx > 0 && <button className={`btn ${throwsLeft === 0 ? 'primary' : 'secondary'} big`} disabled={busy} onClick={bank}>{tr('g421.ch.keepHand')}</button>}
          </div>
        </div>
      ) : (
        <div className="end-overlay">
          <div className="end-card">
            <h2>{trn('g421.ptLong', done.points)}</h2>
            {duel && (
              <p className={outcome?.winner === pa.session?.username ? 'ok' : 'muted'}>
                {!outcome ? (done.error && trServer(done.error))
                  : !outcome.theirs ? tr('g421.ch.notYet', { o: duel.opponent })
                    : outcome.winner === null ? tr('g421.ch.tie', { o: duel.opponent, n: outcome.theirs.points })
                      : outcome.winner === pa.session?.username ? `${tr('g421.ch.won', { o: duel.opponent, n: outcome.theirs.points })}${outcome.pot ? ` ${tr('g421.ch.pot', { n: outcome.pot })}` : ''}`
                        : tr('g421.ch.lost', { o: duel.opponent, n: outcome.theirs.points })}
              </p>
            )}
            {!duel && <p className="muted">
              {done.rank ? trn('g421.ch.rank', done.total ?? 0, { p: ord(done.rank) })
                : (done.error ? trServer(done.error) : pa.isAccount ? '' : tr('g421.ch.account'))}
            </p>}
            <ol className="ranking">
              {scores.map((s, i) => (
                <li key={i}><span className="rk">{i + 1}</span><span className="nm"><DiceRow dice={s.dice} size={18} /> {trCombo(s.label)}</span><span className="sc">{trn('g421.pt', s.value)}</span></li>
              ))}
            </ol>
            {!duel && (done.reward ? <p className="ok">{tr('g421.ch.reward', { c: done.reward.coins, x: done.reward.xp })}</p>
              : <p className="muted small">{tr('g421.ch.already')}</p>)}
            {board && board.top.length > 0 && (
              <>
                <h3>{tr('g421.ch.best')}</h3>
                <ol className="board">
                  {board.top.slice(0, 10).map((r, i) => (
                    <li key={r.username} className={r.username === pa.session?.username ? 'me' : ''}>
                      <span className="b-rank">{i + 1}</span><span className="b-name">{r.username}<small>{trn('g421.nThrows', r.throws)}</small></span><span className="b-wins"><b>{r.points}</b> <small>{tr('g421.ch.pts')}</small></span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {!duel && shared && <p className="ok ch-shared" role="status">{shared}</p>}
            <div className="end-buttons">
              {!duel && <button className="btn ch-share" onClick={() => void share()}><Icon name="share" size={18} />{tr('g421.ch.share')}</button>}
              <button className="btn primary" onClick={onBack}>{tr('g421.home')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Carte du défi sur l'accueil. */
export function ChallengeCard({ onOpen }: { onOpen: () => void }) {
  const done = loadChallengeDone();
  const played = done?.day === today();
  return (
    <button className="challenge-card" onClick={onOpen}>
      <span className="cc-icon"><Icon name="target" size={26} /></span>
      <span className="cc-text">
        <b>{tr('g421.menu.defi')}</b>
        <span>{played ? tr('g421.ch.playedInfo', { n: done!.points }) : tr('g421.ch.info')}</span>
      </span>
      <Icon name="back" size={20} />
    </button>
  );
}
