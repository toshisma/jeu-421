import type { GameState, PlayerState } from '../../../shared/engine';
import type { MetaPlayer } from '../game/controller';
import type { CSSProperties } from 'react';
import { DiceRow, MiniDie } from './MiniDie';
import { getItem, type DiceItem } from '../../../shared/progress/catalog';
import { RARITY_COLOR, RARITY_LABEL } from '../../../shared/progress/dice-collection';
import { Avatar } from './Avatar';

const DIFF_LABEL = { facile: 'IA facile', normal: 'IA normale', difficile: 'IA difficile' };

interface Props {
  p: PlayerState;
  meta: MetaPlayer | undefined;
  state: GameState;
  active: boolean;
  thinking: boolean;
  leader: boolean;
  struggling: boolean;
  onOpen?: () => void;
  /** Élément de la carte (les bulles et réactions s'affichent au-dessus, dans un calque à part). */
  cardRef?: (el: HTMLDivElement | null) => void;
  order: number | null;
}

export function PlayerCard({ p, meta, state, active, thinking, leader, struggling, order, onOpen, cardRef }: Props) {
  const points = state.config.variant === 'manches';
  const roundResult = state.results[p.id];
  // Seulement la main du tour en cours : celles des tours précédents ne s'affichent plus.
  const shown = roundResult;
  // Dés de collection du joueur (rare et au-delà, ou brillants) : on les signale.
  const di = meta?.dice ? getItem(meta.dice) : undefined;
  const rare = di && di.category === 'dice' && di.rarity && (di.rarity !== 'commun' || di.shiny) ? (di as DiceItem) : null;
  return (
    <div className={`pcard${active ? ' active' : ''}${p.out ? ' out' : ''}${meta?.isMe ? ' me' : ''}${onOpen ? ' clickable' : ''}`}
      ref={cardRef} onClick={onOpen} title={onOpen ? 'Voir le profil' : undefined}
      style={{ ['--pc' as string]: meta?.color ?? '#999' }}>
      <div className="pc-top">
        <Avatar photo={meta?.photo} emoji={meta?.avatar ?? '🎲'} size={36} color={meta?.color} accessory={meta?.accessory}>
          <i className={`dot ${meta?.connected === false ? 'off' : 'on'}`} title={meta?.connected === false ? 'Déconnecté' : 'Connecté'} />
        </Avatar>
        <div className="pc-id">
          <div className="pc-name">
            {meta?.name ?? p.name}{meta?.prestige ? <span className="prestige" title={`Prestige ${meta.prestige}`}>★{meta.prestige}</span> : null}{meta?.isMe && (meta.name !== 'Vous') && <em> (vous)</em>}
          </div>
          <div className="pc-sub">
            {order != null && !p.out && <span className="order">#{order}</span>}
            {meta?.title && <span className="pc-title">{meta.title}</span>}
            {rare && <span className="pc-dice" style={{ '--rc': RARITY_COLOR[rare.rarity!] } as CSSProperties} title={`Ses dés : ${rare.name} (${RARITY_LABEL[rare.rarity!].toLowerCase()})`}>
              <MiniDie value={5} size={14} body={rare.body} pip={rare.pip} />{rare.shiny ? '✦' : ''}</span>}
            {meta?.isBot && meta.difficulty && <span className="diff">{DIFF_LABEL[meta.difficulty]}</span>}
            {meta?.isHost && <span>Hôte</span>}
            {meta?.connected === false && <span className="warn">hors ligne</span>}
          </div>
        </div>
        <div className="pc-score" title={points ? 'Points' : 'Jetons'}>
          {p.out ? <span className="done">Sorti ✓</span> : <><b>{points ? p.score : p.tokens}</b><small>{points ? 'pts' : 'jetons'}</small></>}
        </div>
      </div>
      <div className="pc-bottom">
        {thinking ? <span className="thinking">réfléchit<span>.</span><span>.</span><span>.</span></span>
          : shown ? <><DiceRow dice={shown.dice} size={16} /><span className="pc-combo">{shown.combo.label}</span></>
            : <span className="muted">—</span>}
        {leader && <span className="badge lead" title="En tête">👑</span>}
        {struggling && <span className="badge low" title="En difficulté">⚠</span>}
      </div>
    </div>
  );
}
