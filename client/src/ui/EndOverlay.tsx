import { useMemo } from 'react';
import { BagIcon } from './BagIcon';
import type { GameState } from '../../../shared/engine';
import type { MetaPlayer } from '../game/controller';
import { levelInfo } from '../../../shared/progress/profile';
import type { EndReward } from './GameScreen';
import { CopyReferral } from './Referral';
import { VictoryBurst } from './illustrations';

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
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Écran de fin : classement animé et confettis. */
export function EndOverlay({ reward, state, meta, meId, canRematch, online, onRematch, onExit, exitLabel, note, referral }: Props) {
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
        <h2>{inTie ? 'Égalité !' : iWon ? 'Victoire !' : iLost ? 'Perdu…' : 'Partie terminée'}</h2>
        <p className="muted">
          {tie && <>Ex æquo : <b>{coWinners.map((id) => m(id)?.name).join(' et ')}</b>{state.loserId ? '. ' : '.'}</>}
          {state.loserId ? <>C'est <b>{m(state.loserId)?.name}</b> qui garde les jetons{state.config.variant === 'classique' ? ' et paie la tournée' : ''}.</>
            : tie ? null : iWon ? <>Vous l'emportez !</> : <>Victoire de <b>{m(winner)?.name}</b>.</>}
        </p>
        <ol className="ranking">
          {state.ranking.map((id, i) => {
            const p = state.players.find((x) => x.id === id)!;
            const last = id === state.loserId;
            return (
              <li key={id} className={`${id === meId ? 'me' : ''}${last ? ' last' : ''}`} style={{ animationDelay: `${0.15 * i}s` }}>
                <span className="rk">{last ? '🍺' : MEDALS[place(i)] ?? `${place(i) + 1}.`}</span>
                <span className="av">{m(id)?.avatar}</span>
                <span className="nm">{m(id)?.name ?? p.name}</span>
                <span className="sc">{points ? `${p.score} pts` : last || !p.out ? `${p.tokens} jetons` : 'sorti'}</span>
              </li>
            );
          })}
        </ol>
        {note && <p className="end-note">{note}</p>}
        {reward && <RewardBox r={reward} />}
        {iWon && referral && (
          <div className="end-share">
            <p className="small">Défiez un ami : s'il s'inscrit avec votre lien et joue 10 parties, vous gagnez un sac de dés.</p>
            <CopyReferral code={referral} />
          </div>
        )}
        <div className="end-buttons">
          {canRematch && <button className="btn primary" onClick={onRematch}>{online ? 'Revanche (retour au salon)' : 'Rejouer'}</button>}
          {!canRematch && online && !exitLabel && <p className="muted small">L'hôte peut proposer une revanche.</p>}
          <button className={`btn${exitLabel ? ' primary' : ''}`} onClick={onExit}>{exitLabel ?? 'Accueil'}</button>
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
          <li key={l.label}><span>{l.label}</span><span>{l.xp > 0 && <b>+{l.xp} XP</b>}{l.coins > 0 && <b className="c">+{l.coins} pièces</b>}</span></li>
        ))}
        {!!applied.bagsFound && <li className="lvlup bag-found"><span><BagIcon size="1em" /> {applied.bagsFound > 1 ? `${applied.bagsFound} sacs de dés trouvés !` : 'Sac de dés trouvé !'}</span><span className="muted small">à ouvrir dans Collection</span></li>}
        {applied.achievementsDone?.map((x) => <li key={x.id} className="lvlup"><span>{x.icon} Succès : {x.name}</span><span><b className="c">+{x.coins} pièces</b></span></li>)}
        {applied.questsDone?.map((q) => <li key={q.id} className="lvlup"><span>🎯 Défi accompli : {q.text}</span><span className="muted small">à récupérer</span></li>)}
        {leveled && <li className="lvlup"><span>Niveau {applied.levelAfter} atteint !</span><span><b className="c">+{applied.levelBonusCoins} pièces</b></span></li>}
      </ul>
      <div className="reward-bar">
        <span>Niv. {after.level}</span>
        <span className="xpbar big"><i style={{ ['--from' as string]: `${from}%`, ['--to' as string]: `${to}%` }} /></span>
        <span className="muted small">{after.into}/{after.need} XP</span>
      </div>
      <div className="muted small">Solde : {applied.profile.coins} pièces</div>
    </div>
  );
}
