import { useMemo } from 'react';
import { BagIcon } from './BagIcon';
import type { GameState } from '../../../shared/engine';
import type { MetaPlayer } from '../game/controller';
import { levelInfo } from '../../../shared/progress/profile';
import type { EndReward } from './GameScreen';
import { CopyReferral } from './Referral';
import { VictoryBurst } from './illustrations';
import { tr, trServer } from '../i18n/lang';
import { botName, rich, trn } from '../i18n/g421';

interface Props {
  reward: EndReward | null;
  state: GameState;
  meta: MetaPlayer[];
  meId: string;
  canRematch: boolean;
  online: boolean;
  onRematch: () => void;
  onExit: () => void;
  exitLabel?: string;
  note?: string;
  /** Pseudo du joueur connecté : propose de partager son lien de parrainage après une victoire. */
  referral?: string;
  /** Encart propre au mode (Tournée des comptoirs : étoiles gagnées). */
  extra?: React.ReactNode;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Écran de fin : classement animé et confettis. */
export function EndOverlay({ reward, state, meta, meId, canRematch, online, onRematch, onExit, exitLabel, note, referral, extra }: Props) {
  const points = state.config.variant === 'manches';
  const winner = state.ranking[0];
  // Vrais ex æquo (départagés ni par les points, ni par la combinaison) : même place, pas de vainqueur seul.
  const place = (i: number): number => {
    const g = state.tieGroups?.find((x) => x.includes(state.ranking[i]));
    return g ? Math.min(...g.map((id) => state.ranking.indexOf(id))) : i;
  };
  const coWinners = state.tiedWinners?.length ? state.tiedWinners : [winner];
  const tie = coWinners.length > 1;
  const inTie = tie && coWinners.includes(meId);
  const iWon = !tie && winner === meId;
  const iLost = state.loserId === meId;
  const confetti = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 2.5, dur: 3 + Math.random() * 3,
    color: ['#e0b15a', '#f4ead5', '#c0583a', '#3f8f5a', '#3d8fb5'][i % 5], rot: Math.random() * 360,
  })), []);
  const m = (id: string) => meta.find((x) => x.id === id);

  return (
    <div className="end-overlay">
      <div className="confetti" aria-hidden>
        {confetti.map((c, i) => (
          <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, transform: `rotate(${c.rot}deg)` }} />
        ))}
      </div>
      <div className={`end-card${iWon ? ' won' : ''}`}>
        {iWon && <VictoryBurst />}
        <h2>{tr(inTie ? 'g421.end.tie' : iWon ? 'g421.end.win' : iLost ? 'g421.end.lost' : 'g421.over')}</h2>
        <p className="muted">
          {tie && <>{rich(tr('g421.end.tied', { names: coWinners.map((id) => botName(m(id)?.name ?? '')).join(` ${tr('g421.and')} `) }))}{state.loserId ? '. ' : '.'}</>}
          {state.loserId ? rich(tr(state.config.variant === 'classique' ? 'g421.end.loserRound' : 'g421.end.loser', { name: botName(m(state.loserId)?.name ?? '') }))
            : tie ? null : iWon ? tr('g421.end.youWin') : rich(tr('g421.end.winner', { name: botName(m(winner)?.name ?? '') }))}
        </p>
        <ol className="ranking">
          {state.ranking.map((id, i) => {
            const p = state.players.find((x) => x.id === id)!;
            const last = id === state.loserId;
            return (
              <li key={id} className={`${id === meId ? 'me' : ''}${last ? ' last' : ''}`} style={{ animationDelay: `${0.15 * i}s` }}>
                <span className="rk">{last ? '🍺' : MEDALS[place(i)] ?? `${place(i) + 1}.`}</span>
                <span className="av">{m(id)?.avatar}</span>
                <span className="nm">{botName(m(id)?.name ?? p.name)}</span>
                <span className="sc">{points ? trn('g421.pt', p.score) : last || !p.out ? trn('g421.tok', p.tokens) : tr('g421.pc.outLow')}</span>
              </li>
            );
          })}
        </ol>
        {note && <p className="end-note">{note}</p>}
        {extra}
        {reward && <RewardBox r={reward} />}
        {iWon && referral && (
          <div className="end-share">
            <p className="small">{tr('g421.end.referral')}</p>
            <CopyReferral code={referral} />
          </div>
        )}
        <div className="end-buttons">
          {canRematch && <button className="btn primary" onClick={onRematch}>{tr(online ? 'g421.end.rematch' : 'g421.end.replay')}</button>}
          {!canRematch && online && !exitLabel && <p className="muted small">{tr('g421.end.hostRematch')}</p>}
          <button className={`btn${exitLabel ? ' primary' : ''}`} onClick={onExit}>{exitLabel ?? tr('g421.home')}</button>
        </div>
      </div>
    </div>
  );
}

/** Gains de la partie : lignes de récompense, barre d'XP animée, passage de niveau. */
function RewardBox({ r }: { r: EndReward }) {
  const { reward, applied } = r;
  const after = levelInfo(applied.profile.xp);
  const before = levelInfo(applied.profile.xp - reward.xp);
  const leveled = applied.levelAfter > applied.levelBefore;
  const from = leveled ? 0 : (100 * before.into) / before.need;
  const to = (100 * after.into) / after.need;
  return (
    <div className="reward">
      <ul>
        {reward.lines.map((l) => (
          <li key={l.label}><span>{trServer(l.label)}</span><span>{l.xp > 0 && <b>+{l.xp} XP</b>}{l.coins > 0 && <b className="c">{trn('g421.plusCoins', l.coins)}</b>}</span></li>
        ))}
        {!!applied.bagsFound && <li className="lvlup bag-found"><span><BagIcon size="1em" /> {applied.bagsFound > 1 ? tr('g421.bagsFound', { n: applied.bagsFound }) : tr('g421.bagFound')}</span><span className="muted small">{tr('g421.openInColl')}</span></li>}
        {applied.achievementsDone?.map((x) => <li key={x.id} className="lvlup"><span>{x.icon} {tr('g421.achievement')} {x.name}</span><span><b className="c">{trn('g421.plusCoins', x.coins)}</b></span></li>)}
        {applied.questsDone?.map((q) => <li key={q.id} className="lvlup"><span>🎯 {tr('g421.quest')} {q.text}</span><span className="muted small">{tr('g421.toCollect')}</span></li>)}
        {leveled && <li className="lvlup"><span>{tr('g421.levelUp', { n: applied.levelAfter })}</span><span><b className="c">{trn('g421.plusCoins', applied.levelBonusCoins)}</b></span></li>}
      </ul>
      <div className="reward-bar">
        <span>{tr('g421.lvl', { n: after.level })}</span>
        <span className="xpbar big"><i style={{ ['--from' as string]: `${from}%`, ['--to' as string]: `${to}%` }} /></span>
        <span className="muted small">{after.into}/{after.need} XP</span>
      </div>
      <div className="muted small">{tr('g421.balance', { n: applied.profile.coins })}</div>
    </div>
  );
}
