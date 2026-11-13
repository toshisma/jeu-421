import type { GameState, PlayerState } from '../../../shared/engine';
import type { MetaPlayer } from '../game/controller';
import type { CSSProperties } from 'react';
import { DiceRow, MiniDie } from './MiniDie';
import { getItem, type DiceItem } from '../../../shared/progress/catalog';
import { RARITY_COLOR, RARITY_LABEL } from '../../../shared/progress/dice-collection';
import { Avatar } from './Avatar';
import { RepBadge } from './RepBadge';
import { tr } from '../i18n/lang';
import { botName, ord, trCombo } from '../i18n/g421';

const DIFF_LABEL = { facile: 'g421.ai.facile', normal: 'g421.ai.normal', difficile: 'g421.ai.difficile' } as const;

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

/** Place actuelle du joueur : les sortis ont gagné ; ensuite le moins de jetons (ou le plus de points). */
function placeOf(state: GameState, p: PlayerState): number {
  const points = state.config.variant === 'manches';
  if (points) return 1 + state.players.filter((x) => x.score > p.score).length;
  const out = state.players.filter((x) => x.out).length;
  if (p.out) return p.finishPos ?? 1;
  return out + 1 + state.players.filter((x) => !x.out && x.tokens < p.tokens).length;
}

export function PlayerCard({ p, meta, state, active, thinking, leader, struggling, order, onOpen, cardRef }: Props) {
  const points = state.config.variant === 'manches';
  const roundResult = state.results[p.id];
  // Seulement la main du tour en cours : celles des tours précédents ne s'affichent plus.
  const shown = roundResult;
  // Dés de collection du joueur (rare et au-delà, ou brillants) : on les signale.
  const di = meta?.dice ? getItem(meta.dice) : undefined;
  const rare = di && di.category === 'dice' && di.rarity && (di.rarity !== 'commun' || di.shiny) ? (di as DiceItem) : null;
  const place = placeOf(state, p);
  // Étiquette au-dessus de la carte : à qui c'est, sorti, ou la place actuelle.
  const val = (x: PlayerState) => (points ? x.score : x.tokens);
  const allTied = state.players.filter((x) => !x.out).every((x) => val(x) === val(p));
  const tag = active ? tr(meta?.isMe ? 'g421.pc.you' : 'g421.pc.playing') : p.out ? tr('g421.pc.out') : allTied ? null : ord(place);
  return (
    <div className={`pcard v2${active ? ' active' : ''}${p.out ? ' out' : ''}${meta?.isMe ? ' me' : ''}${onOpen ? ' clickable' : ''}`}
      ref={cardRef} onClick={onOpen} title={onOpen ? tr('g421.pc.profile') : undefined}
      style={{ ['--pc' as string]: meta?.color ?? '#999' }}>
      {tag && <span className="pc-rank" title={active || p.out ? undefined : tr('g421.pc.place')}>{tag}</span>}
      {leader && <span className="badge lead" title={tr('g421.pc.lead')}>👑</span>}
      {struggling && <span className="badge low" title={tr('g421.pc.low')}>⚠</span>}
      <div className="pc-top">
        <Avatar photo={meta?.photo} emoji={meta?.avatar ?? '🎲'} size={36} color={meta?.color} accessory={meta?.accessory}>
          <RepBadge rep={meta?.rep} className="rep-on-av" />
          <i className={`dot ${meta?.connected === false ? 'off' : 'on'}`} title={tr(meta?.connected === false ? 'g421.pc.disc' : 'g421.pc.conn')} />
        </Avatar>
        <div className="pc-score" title={tr(points ? 'g421.points' : 'g421.tokens')}>
          {p.out ? <><b className="done">✓</b><small>{tr('g421.pc.outLow')}</small></> : <><b>{points ? p.score : p.tokens}</b><small>{points ? tr('g421.pointsLow') : tr(p.tokens > 1 ? 'g421.tokensLow' : 'g421.tokenLow')}</small></>}
        </div>
      </div>
      <div className="pc-name">
        {botName(meta?.name ?? p.name)}{meta?.prestige ? <span className="prestige" title={`Prestige ${meta.prestige}`}>★{meta.prestige}</span> : null}{meta?.isMe && (meta.name !== 'Vous') && <em> {tr('g421.youParen')}</em>}
      </div>
      <div className="pc-sub">
        {order != null && !p.out && <span className="order" title={tr('g421.pc.order')}>#{order}</span>}
        {meta?.title && <span className="pc-title">{meta.title}</span>}
        {rare && <span className="pc-dice" style={{ '--rc': RARITY_COLOR[rare.rarity!] } as CSSProperties} title={tr('g421.pc.dice', { name: rare.name, r: RARITY_LABEL[rare.rarity!].toLowerCase() })}>
          <MiniDie value={5} size={14} body={rare.body} pip={rare.pip} />{rare.shiny ? '✦' : ''}</span>}
        {meta?.isBot && meta.difficulty && <span className="diff">{tr(DIFF_LABEL[meta.difficulty])}</span>}
        {meta?.botTag && <span className="pc-bot" title={tr('g421.pc.botTitle')}>{tr('g421.pc.bot')}</span>}
        {meta?.isHost && <span>{tr('g421.host')}</span>}
        {meta?.connected === false && <span className="warn">{tr('g421.offline')}</span>}
      </div>
      <div className="pc-bottom">
        {thinking ? <span className="thinking"><i /><i /><i />{tr('g421.pc.thinking')}</span>
          : shown ? <><DiceRow dice={shown.dice} size={15} /><span className="pc-combo">{trCombo(shown.combo.label)}</span></>
            : <span className="muted">{p.out ? '' : active ? tr('g421.pc.playingLow') : '—'}</span>}
      </div>
    </div>
  );
}
