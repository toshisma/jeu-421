import { useEffect, useRef, useState } from 'react';
import { CHALLENGE_THROWS, CHALLENGE_TURNS, nextDice } from '../../../shared/challenge';
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

interface Board { top: { username: string; points: number; throws: number }[]; total: number; mine: { points: number; throws: number; rank: number; total: number } | null }
const NO_KEEP = [false, false, false];

/** Défi du jour : 5 coups, les mêmes dés pour tous ; un seul essai classé par jour. */
export function ChallengeScreen({ pa, settings, appearance, onBack }: { pa: ProfileApi; settings: Settings; appearance: Appearance; onBack: () => void }) {
  const day = today();
  const already = loadChallengeDone()?.day === day;
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

  const loadBoard = () => { if (pa.token) api<Board>('/challenge/board', { token: pa.token }).then(setBoard).catch(() => {}); };
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
    setKeep(NO_KEEP);
    tray.current?.setKept(NO_KEEP);
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
      setDice([0, 0, 0]);
      setDecisions((d) => [...d, []]);
      return;
    }
    setBusy(true);
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
  return (
    <div className="game challenge">
      <DiceTray ref={tray} appearance={appearance} quality={settings.quality} cup={settings.cup}
        insets={{ top: 150, bottom: 150, left: 0, right: 0 }} onDieClick={toggle} />
      <div className="vignette" />
      <div className="top">
        <div className="topbar">
          <button className="icon-btn" onClick={onBack} aria-label="Retour"><Icon name="back" /></button>
          <div className="phase"><span className="logo-mini">421</span> Défi du jour <span className="muted">mêmes dés pour tout le monde</span></div>
        </div>
        <div className="tracker">
          <div className="tr-main">
            <span>Coup {Math.min(turn + 1, CHALLENGE_TURNS)} sur {CHALLENGE_TURNS}</span>
            <b className="worst">{total} pt{total > 1 ? 's' : ''}</b>
          </div>
          <div className="tr-sub">{scores.map((s, i) => <span key={i} className="ch-chip">{s.label} : {s.value}</span>)}</div>
        </div>
      </div>

      {!done ? (
        <div className="actionbar">
          <div className="status">
            <div className="turn-line"><span className="your-turn">{already && !pa.isAccount ? 'Entraînement' : 'À vous'}</span></div>
            <div className="throws">{Array.from({ length: CHALLENGE_THROWS }, (_, i) => <i key={i} className={i < throwIdx ? 'used' : ''} />)}<span>{throwsLeft} lancer{throwsLeft > 1 ? 's' : ''} restant{throwsLeft > 1 ? 's' : ''}</span></div>
          </div>
          <div className="result">
            {dice[0] > 0 && (
              <div className="keep-row">
                {dice.map((d, i) => (
                  <button key={i} className={`keep-die${keep[i] && canKeep ? ' on' : ''}`} disabled={!canKeep} onClick={() => toggle(i)}
                    aria-label={`Dé ${d} : ${keep[i] ? 'gardé' : 'relancé'}`}>
                    <MiniDie value={d} size={30} kept={keep[i] && canKeep} />
                    {canKeep && <small>{keep[i] ? 'gardé' : 'relancé'}</small>}
                  </button>
                ))}
              </div>
            )}
            {combo && <div className="combo-label">{combo.label}<span>{combo.value} point{combo.value > 1 ? 's' : ''}</span></div>}
            {throwIdx > 0 && throwsLeft > 0 && <p className="hint center">Touchez les dés à garder, puis relancez, ou gardez ce coup.</p>}
          </div>
          <div className="buttons">
            {throwsLeft > 0 && <button className={`btn ${throwIdx === 0 ? 'primary' : ''} big`} disabled={busy} onClick={roll}><Icon name="dice" /> {throwIdx === 0 ? 'Lancer' : 'Relancer'}</button>}
            {throwIdx > 0 && <button className={`btn ${throwsLeft === 0 ? 'primary' : 'secondary'} big`} disabled={busy} onClick={bank}>Garder ce coup</button>}
          </div>
        </div>
      ) : (
        <div className="end-overlay">
          <div className="end-card">
            <h2>{done.points} points</h2>
            <p className="muted">
              {done.rank ? `Vous êtes ${done.rank === 1 ? '1er' : `${done.rank}e`} sur ${done.total} joueur${(done.total ?? 0) > 1 ? 's' : ''} aujourd'hui.`
                : done.error ?? (pa.isAccount ? '' : 'Créez un compte pour figurer au classement du défi.')}
            </p>
            <ol className="ranking">
              {scores.map((s, i) => (
                <li key={i}><span className="rk">{i + 1}</span><span className="nm"><DiceRow dice={s.dice} size={18} /> {s.label}</span><span className="sc">{s.value} pt{s.value > 1 ? 's' : ''}</span></li>
              ))}
            </ol>
            {done.reward ? <p className="ok">+{done.reward.coins} pièces et +{done.reward.xp} XP</p>
              : <p className="muted small">Récompense déjà reçue aujourd'hui : ce coup était pour l'entraînement.</p>}
            {board && board.top.length > 0 && (
              <>
                <h3>Meilleurs scores du jour</h3>
                <ol className="board">
                  {board.top.slice(0, 10).map((r, i) => (
                    <li key={r.username} className={r.username === pa.session?.username ? 'me' : ''}>
                      <span className="b-rank">{i + 1}</span><span className="b-name">{r.username}<small>{r.throws} lancers</small></span><span className="b-wins"><b>{r.points}</b> <small>pts</small></span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <div className="end-buttons"><button className="btn primary" onClick={onBack}>Accueil</button></div>
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
        <b>Défi du jour</b>
        <span>{played ? `Votre score : ${done!.points} points. Rejouez pour vous entraîner.` : '5 coups, les mêmes dés pour tout le monde. Un seul essai compte.'}</span>
      </span>
      <Icon name="back" size={20} />
    </button>
  );
}
