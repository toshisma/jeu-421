/**
 * Coups Fourrés : les pièces du plateau de partie (prototypes CFN validés par Sam le 5 novembre :
 * tour adverse, votre tour, riposte, piège déclenché, fiche de carte).
 * Styles : bloc « Coups Fourrés : nouveau plateau » à la fin de styles.css (classes cfn-*).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CARD_BY_ID, cardDef, type CardType } from '../../../shared/cards/catalog';
import { commandeOf, petiteSoeurOk, type CfAction, type CfEvent, type CfPlayerView, type CfView, type PlayParams } from '../../../shared/cards/engine';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { CoinArt } from '../ui/illustrations';
import { BagIcon } from '../ui/BagIcon';
import { Sheet } from '../ui/kit';
import { CardArt } from './art';
import { CapsuleIcon, CardView } from './components';
import { FAMILY_STYLE, splitEmphasis } from './meta';
import { activeEffects, CARD_GIST, type ActiveEffect } from './effects';
import { GlossText } from './Gloss';
import { useLongPress, zoomCard, ZoomBtn } from './zoom';

/** Étiquettes qui ne disent pas ce que fait la carte : on écrit plutôt son effet. */
const GENERIC_LABEL = new Set(['Installer', 'Poser face cachée', 'Jouer', 'Jouable']);
import { Pip } from './cfui';
import { TYPE_META, TypeIcon, TypeLegend } from './cardTypes';
import type { CfSeat, CfSnapshot } from './controller';
import {
  comboOf, costNow, describeNow, meOf, nameIn, filterOptions, nextParam, paramQuestion, playOptions, plural, resolveOption, valuesFor, whyNot, type ParamKey,
} from './describe';
import { cardName, familiesLabel, shortCombo, threatLine, trapPossibilities, type Announce, type CardHint, type FriseStep } from './board';
import './fonts';

const def = (id: string | null | undefined) => (id ? CARD_BY_ID[id] : undefined);
const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const vw = () => (typeof window !== 'undefined' ? window.innerWidth : 360);

// ------------------------------------------------------------------ petites pièces

/** Tournées : petits verres pleins / vides. */
export function Glasses({ n, max, label }: { n: number; max: number; label?: boolean }) {
  return (
    <span className="cfn-glasses" role="img" aria-label={`${plural(n, 'Tournée')} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? '' : 'off'} />)}
      {/* Écrit en toutes lettres (0.39) : on ne devine plus ce que sont les petits verres. */}
      {label && <small className="cfn-res-l" aria-hidden>{n} Tournée{n > 1 ? 's' : ''}</small>}
    </span>
  );
}

/** Jetons (pastille dorée). */
export const Tokens = ({ n, refEl, label }: { n: number; refEl?: (el: HTMLElement | null) => void; label?: boolean }) => (
  <span className={`cfn-chip${label ? ' lab' : ''}`} ref={refEl} aria-label={plural(n, 'jeton')}><i className="cfn-tok" aria-hidden />{n}{label && <small aria-hidden>jeton{n > 1 ? 's' : ''}</small>}</span>
);

/** Effets en attente d'un joueur cette manche (Double tournée, Note salée, Gueule de bois…), écrits en clair. */
export function EffectChips({ list, onCard }: { list: ActiveEffect[]; onCard: (id: string) => void }) {
  if (!list.length) return null;
  return (
    <span className="cfn-fx-row">
      {list.map((e) => (
        <button key={e.card + e.text} className={`cfn-fx ${e.tone}`} onClick={() => onCard(e.card)} style={{ ['--tc' as string]: TYPE_META[e.type].color }}>
          <TypeIcon type={e.type} size={11} />{e.text}
        </button>
      ))}
    </span>
  );
}

/** Piège face cachée (rayures violettes, mâchoire). */
export const TrapCard = ({ big, style }: { big?: boolean; style?: CSSProperties }) => (
  <span className={`cfn-trapc${big ? ' big' : ''}`} style={style} aria-hidden><TypeIcon type="piege" size={big ? 30 : 16} /></span>
);

/** Grande carte lisible (prototype « big ») : coût, nom, illustration, type et moment, texte. */
export function BigCard({ id, width = 250, extra, className, zoom }: { id: string; width?: number; extra?: ReactNode; className?: string; zoom?: boolean }) {
  const d = cardDef(id);
  if (!d) return null;
  const fs = FAMILY_STYLE[d.family];
  const [, bold] = splitEmphasis(id, d.text);
  const m = TYPE_META[d.type];
  return (
    <div className={`cfn-big${d.rarity === 'legendaire' ? ' leg' : ''}${className ? ` ${className}` : ''}`} style={{ width, background: `linear-gradient(160deg, ${fs.c1}, ${fs.c2})`, ['--e' as string]: fs.edge }}
      role="group" aria-label={`${d.name}, ${m.label}, coût ${d.cost}`}>
      <div className="cfn-big-hd"><span className="cfn-coin">{d.cost}</span><h3>{d.name}</h3></div>
      <span className="cfn-big-art"><CardArt id={id} /></span>
      <span className="cfn-big-tl" style={{ color: m.color }}><TypeIcon type={d.type} size={13} />{m.label} · {m.moment}</span>
      <div className="cfn-big-tx"><GlossText text={d.text} bold={bold || undefined} />{extra && <span className="cfn-big-here">{extra}</span>}</div>
      {zoom && <ZoomBtn id={id} />}
    </div>
  );
}

/** Ce que fait une carte, en quelques mots (le passage en gras de son texte, sinon le début du texte). */
export function cardGist(id: string): string {
  if (CARD_GIST[id]) return CARD_GIST[id];
  const d = cardDef(id);
  if (!d) return '';
  const [, bold] = splitEmphasis(id, d.text);
  const g = (bold || d.text).replace(/[.!]\s*$/, '');
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/** Carte en main (prototype « hc ») : coût, illustration, nom, type ; `fx` = ce qu'elle fait (ligne sous le nom). */
export function HandCard({ id, ok, off, sel, focus, style, onClick, small, fx }: { id: string; ok?: boolean; off?: boolean; sel?: boolean; focus?: boolean; small?: boolean; style?: CSSProperties; onClick?: () => void; fx?: string }) {
  const d = cardDef(id);
  // Toucher long : la carte en grand, sans l'ouvrir pour la jouer.
  const press = useLongPress(d ? () => zoomCard(id) : null);
  if (!d) return null;
  const fs = FAMILY_STYLE[d.family];
  const m = TYPE_META[d.type];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`cfn-hc${ok ? ' ok' : ''}${off ? ' off' : ''}${sel ? ' sel' : ''}${focus ? ' cfn-focus' : ''}${small ? ' small' : ''}`} style={{ background: `linear-gradient(160deg, ${fs.c1}, ${fs.c2})`, ...style }}
      onClick={onClick} aria-label={onClick ? `${d.name}, ${m.label}, coût ${d.cost}` : undefined} type={onClick ? 'button' : undefined} {...press}>
      <span className="c">{d.cost}</span>
      <span className="a"><CardArt id={id} /></span>
      <b>{d.name}</b>
      {fx && <span className="fx">{fx}</span>}
      <span className="ty" style={{ color: m.color }}><TypeIcon type={d.type} size={11} />{m.label}</span>
    </Tag>
  );
}

/**
 * Main en rangée (0.39, « plus accessible ») : cartes côte à côte sans chevauchement, nom entier et
 * ce que fait la carte écrit dessous ; les jouables d'abord, dorées. `quiet` (ce n'est pas à vous) :
 * main grisée, l'effet de chaque carte reste écrit. Mémorisée : le minuteur ne la redessine pas.
 *
 * Grande main (demande de Sam, novembre : « on ne voit pas toutes les cartes ») : la rangée glisse au
 * doigt (aimantée carte par carte, avec l'élan du doigt), à la molette sur ordinateur, et des flèches
 * ‹ › apparaissent de chaque côté dès qu'il y a des cartes cachées, avec leur nombre. Toucher une
 * flèche fait défiler d'une « page » de cartes. Aucune carte n'est inaccessible, même avec 12+ cartes.
 */
export const Hand = memo(function Hand({ cards, hints, onPick, sel, focus, quiet }: {
  cards: { uid: string; id: string }[]; hints: Record<string, CardHint>; onPick: (uid: string) => void; sel?: string | null; focus?: boolean; quiet?: boolean;
}) {
  const [small, setSmall] = useState(false);
  useIsoLayout(() => {
    const m = () => setSmall(window.innerHeight < 700);
    m(); window.addEventListener('resize', m); return () => window.removeEventListener('resize', m);
  }, []);
  // Jouables d'abord (ordre stable sinon) : elles restent visibles même quand la main défile.
  const sorted = quiet ? cards : [...cards].sort((a, b) => Number(!!hints[b.uid]?.playable) - Number(!!hints[a.uid]?.playable));
  const ref = useRef<HTMLDivElement>(null);
  const order = sorted.map((k) => k.uid).join(',');
  // Cartes cachées à gauche / à droite (plus de la moitié hors de la rangée).
  const [hid, setHid] = useState<[number, number]>([0, 0]);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    let l = 0, r = 0;
    for (const c of Array.from(el.children) as HTMLElement[]) {
      const b = c.getBoundingClientRect();
      const mid = b.left + b.width / 2;
      if (mid < box.left + 4) l++;
      else if (mid > box.right - 4) r++;
    }
    setHid((h) => (h[0] === l && h[1] === r ? h : [l, r]));
  }, []);
  // Quand l'ordre change (nouvelles cartes jouables), on revient au début de la main.
  useIsoLayout(() => { if (ref.current) ref.current.scrollLeft = 0; measure(); }, [order, small, measure]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    // Molette verticale (souris d'ordinateur) : fait défiler la main de côté.
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 2 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', onScroll); el.removeEventListener('wheel', onWheel); window.removeEventListener('resize', onScroll); };
  }, [measure]);
  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 90;
    const step = Math.max(card + 8, el.clientWidth - card - 16);
    el.scrollBy({ left: dir * step, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  return (
    <div className={`cfn-hand-wrap${hid[0] ? ' more-l' : ''}${hid[1] ? ' more-r' : ''}`}>
      <div ref={ref} className={`cfn-hand${small ? ' small' : ''}${focus ? ' cfn-focus-zone' : ''}`} role="list" aria-label={`Votre main : ${plural(cards.length, 'carte')}`}>
        {sorted.map((k) => {
          const h = hints[k.uid];
          const ok = !quiet && !!h?.playable;
          // Jouable : ce qu'elle ferait ici quand c'est parlant (« 6 → 1 : 4-2-1 ! ») ; sinon ce qu'elle fait.
          const fx = ok && h?.label && !GENERIC_LABEL.has(h.label) ? h.label : cardGist(k.id);
          return (
            <span key={k.uid} role="listitem" className="cfn-hand-slot">
              <HandCard id={k.id} ok={ok} off={!ok} sel={sel === k.uid} focus={focus && ok} small={small} fx={fx} onClick={() => onPick(k.uid)} />
            </span>
          );
        })}
      </div>
      {hid[0] > 0 && (
        <button type="button" className="cfn-hand-arrow l" onClick={() => page(-1)} aria-label={`${plural(hid[0], 'carte')} cachée${hid[0] > 1 ? 's' : ''} à gauche : faire défiler`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg><b>{hid[0]}</b>
        </button>
      )}
      {hid[1] > 0 && (
        <button type="button" className="cfn-hand-arrow r" onClick={() => page(1)} aria-label={`${plural(hid[1], 'carte')} cachée${hid[1] > 1 ? 's' : ''} à droite : faire défiler`}>
          <b>{hid[1]}</b><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
    </div>
  );
});

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Frise de la manche (étape en cours en surbrillance dorée). */
export function Frise({ steps }: { steps: FriseStep[] }) {
  const on = steps.find((s) => s.state === 'on');
  return (
    <div className="cfn-frise" role="list" aria-label={`Étapes de la manche${on ? ` : ${on.label} en cours` : ''}`}>
      {steps.map((s) => <span key={s.key} role="listitem" className={`cfn-st ${s.state}`}><i />{s.label}</span>)}
    </div>
  );
}

/** Encadré violet « N piège(s) caché(s) » devant un joueur (toucher : explication). */
export function TrapBox({ n, seen, sub, onClick, compact }: { n: number; seen: string[]; sub: string; onClick: () => void; compact?: boolean }) {
  if (n <= 0) return null;
  return (
    <button className={`cfn-trap${compact ? ' compact' : ''}`} onClick={onClick} aria-label={`${n} piège${n > 1 ? 's' : ''} caché${n > 1 ? 's' : ''} : touchez pour les possibilités`}>
      <TrapCard />
      {compact ? <b>{n}</b> : <span>{plural(n, 'piège')}<br /><small>{seen.length ? `Vu : ${seen.join(', ')}` : 'caché' + (n > 1 ? 's' : '')}</small></span>}
    </button>
  );
}

/**
 * Pastille discrète d'un Habitué (vert) ou d'un de mes pièges (violet), dans la barre du joueur :
 * la petite illustration de la carte ; toucher ouvre sa fiche.
 */
export function HabPin({ id, trap, rounds, onClick }: { id: string | null; trap?: boolean; rounds?: number; onClick: () => void }) {
  const name = id ? def(id)?.name ?? '' : 'Piège';
  const left = rounds != null ? `, encore ${rounds} manche${rounds > 1 ? 's' : ''}` : '';
  return (
    <button className={`cfn-pin${trap ? ' trap' : ''}`} onClick={onClick} aria-label={trap ? `Votre piège posé : ${name}` : `Habitué : ${name}${left}`} title={`${name}${left}`}>
      {id ? <CardArt id={id} /> : <TypeIcon type="piege" size={12} />}
      {/* Habitué : manches qui lui restent (il rentre chez lui au bout de 3 manches). */}
      {rounds != null ? <b className="cfn-pin-left" aria-hidden>{rounds}</b> : <i aria-hidden><TypeIcon type={trap ? 'piege' : 'habitue'} size={8} /></i>}
    </button>
  );
}

/** Panneau d'un adversaire (prototype : avatar, nom, deck, jetons, Tournées, cartes en main, pièges, Habitués). */
export function OppPanel({ p, v, seat, active, compact, refEl, tokRef, onTrap, onCard, emote, focus, last, onLast }: {
  p: CfPlayerView; v: CfView; seat?: CfSeat & { away?: boolean; left?: boolean }; active: boolean; compact: boolean; focus?: boolean;
  refEl: (el: HTMLElement | null) => void; tokRef?: (el: HTMLElement | null) => void; onTrap: () => void; onCard: (id: string, owner?: string) => void; emote?: string;
  /** Sa dernière action (reste affichée jusqu'à la suivante) ; toucher ouvre le journal. */
  last?: string | null; onLast?: () => void;
}) {
  const traps = v.traps.filter((t) => t.owner === p.id);
  const seen = traps.filter((t) => t.id).map((t) => cardName(t.id));
  const fresh = traps.some((t) => t.posedRound === v.round) && v.order[v.turn] === p.id && v.phase === 'turn';
  // Sous-titre court : niveau de l'ordinateur et familles du deck en abrégé (le détail des pièges
  // possibles est dans l'encadré des pièges).
  const sub = [seat?.label ? (seat.bot ? `Ordinateur ${seat.label}` : seat.label) : null, p.families.length ? familiesLabel(p.families).replace(/ \/ /g, '/') : null].filter(Boolean).join(' · ');
  return (
    <section className={`cfn-opp${active ? ' active' : ''}${p.out ? ' out' : ''}${compact ? ' compact' : ''}${focus ? ' cfn-focus-zone' : ''}`} ref={refEl}
      aria-label={`${p.name} : ${plural(p.tokens, 'jeton')}, ${plural(p.tournees, 'Tournée')}, ${plural(p.handCount, 'carte')} en main, ${plural(traps.length, 'piège')} posé${traps.length > 1 ? 's' : ''}`}>
      <div className="cfn-row">
        <Avatar photo={seat?.photo} emoji={seat?.avatar ?? '🎲'} size={compact ? 28 : 38} />
        <span className="cfn-opp-name"><b>{p.name}</b>
          {seat?.left ? <small className="away">A quitté la partie</small> : seat?.away ? <small className="away">Déconnecté : 60 s pour revenir</small> : !compact && sub ? <small>{sub}</small> : null}
        </span>
        {emote && <span className="cfn-emote" aria-label={`Réaction : ${emote}`}>{emote}</span>}
        <Tokens n={p.tokens} refEl={tokRef} label={!compact} />
      </div>
      <div className="cfn-row">
        {compact ? <span className="cfn-mini-stat" aria-hidden>🍺 {p.tournees}</span> : <Glasses n={p.tournees} max={v.rules.tourneesMax} label />}
        <span className="cfn-backs" aria-hidden><i className="cfn-bk" /><em>{p.handCount}{compact ? '' : ` carte${p.handCount > 1 ? 's' : ''}`}</em></span>
        {p.habitues.length > 0 && <span className="cfn-pins">{p.habitues.map((h) => <HabPin key={h.uid} id={h.id} rounds={h.rounds} onClick={() => onCard(h.id, p.id)} />)}</span>}
        <span className="cfn-grow" />
        <TrapBox n={traps.length} seen={seen} sub={fresh ? 'Posé à l’instant' : 'Touchez pour les possibilités'} onClick={onTrap} compact={compact || p.habitues.length > 0} />
      </div>
      <EffectChips list={activeEffects(v, p, false)} onCard={(id) => onCard(id, p.id)} />
      {last && !compact && <button className="cfn-last" onClick={onLast}><em>Dernier coup</em> {last}</button>}
    </section>
  );
}
/**
 * Mini-carte posée devant un joueur : Habitué (illustration + manches restantes, liseré vert) ou piège
 * (dos violet rayé avec la mâchoire ; illustration si on le connaît). Toucher : sa fiche.
 */
export function FrontCard({ id, trap, rounds, onClick, title }: { id: string | null; trap?: boolean; rounds?: number; onClick: () => void; title: string }) {
  const press = useLongPress(id ? () => zoomCard(id) : null);
  return (
    <button type="button" className={`cfn-mc${trap ? ' trap' : ' hab'}${id ? '' : ' back'}`} onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={title} title={title} {...press}>
      {id ? <span className="art"><CardArt id={id} /></span> : <TypeIcon type="piege" size={14} />}
      {rounds != null && <b className="left" aria-hidden>{rounds}</b>}
      {trap && id && <i className="tag" aria-hidden><TypeIcon type="piege" size={8} /></i>}
    </button>
  );
}

/** Ce qu'un joueur a devant lui : Habitués puis pièges posés, en mini-cartes (« +N » au-delà de `max`). */
export function FrontRow({ p, v, max, onCard, onTrap, onMore }: { p: CfPlayerView; v: CfView; max: number; onCard: (id: string) => void; onTrap: () => void; onMore: () => void }) {
  const traps = v.traps.filter((t) => t.owner === p.id);
  const items = [
    ...p.habitues.map((h) => ({ key: h.uid, el: <FrontCard key={h.uid} id={h.id} rounds={h.rounds} onClick={() => onCard(h.id)} title={`Habitué : ${cardName(h.id)}, encore ${plural(h.rounds ?? 1, 'manche')}`} /> })),
    ...traps.map((t) => ({ key: t.uid, el: <FrontCard key={t.uid} id={t.id} trap onClick={onTrap} title={t.id ? `Piège posé : ${cardName(t.id)}` : 'Piège posé face cachée : touchez pour les possibilités'} /> })),
  ];
  if (!items.length) return null;
  const shown = items.length > max ? items.slice(0, max - 1) : items;
  return (
    <span className="cfn-front" role="group" aria-label={`Devant ${p.name} : ${plural(p.habitues.length, 'Habitué')}, ${plural(traps.length, 'piège')}`}>
      {shown.map((x) => x.el)}
      {shown.length < items.length && <button type="button" className="cfn-mc plus" onClick={(e) => { e.stopPropagation(); onMore(); }} aria-label="Tout voir">+{items.length - shown.length}</button>}
    </span>
  );
}

/**
 * Case d'un adversaire (écran sobre, 0.39 « version C ») : nom, jetons en gros, Tournées et cartes en
 * main en petits chiffres, et devant lui ses Habitués et pièges posés en mini-cartes illustrées
 * (touchables : fiche de l'Habitué, possibilités du piège). Toucher le reste : sa fiche complète.
 * En duel (`wide`), on écrit aussi ses effets en cours et son dernier coup.
 */
export function PlayerBox({ p, v, seat, active, wide, tokRef, onOpen, onCard, onTrap, emote, focus, last }: {
  p: CfPlayerView; v: CfView; seat?: CfSeat & { away?: boolean; left?: boolean }; active: boolean; wide: boolean; focus?: boolean;
  tokRef?: (el: HTMLElement | null) => void; onOpen: () => void; onCard: (id: string) => void; onTrap: () => void; emote?: string; last?: string | null;
}) {
  const traps = v.traps.filter((t) => t.owner === p.id).length;
  const fx = wide ? activeEffects(v, p, false) : [];
  const n = v.players.length - 1;
  return (
    <div className={`cfn-pbox${active ? ' on' : ''}${p.out ? ' out' : ''}${wide ? ' wide' : ''}${focus ? ' cfn-focus-zone' : ''}`}>
      <button type="button" className="cfn-pbox-main" onClick={onOpen}
        aria-label={`${p.name} : ${plural(p.tokens, 'jeton')}, ${plural(p.tournees, 'Tournée')}, ${plural(p.handCount, 'carte')} en main, ${plural(traps, 'piège')} posé${traps > 1 ? 's' : ''}, ${plural(p.habitues.length, 'Habitué')}. Touchez pour le détail.`}>
        <span className="nm">
          {wide && <Avatar photo={seat?.photo} emoji={seat?.avatar ?? '🎲'} size={32} />}
          <b>{p.name}</b>
          {emote && <span className="cfn-emote" aria-hidden>{emote}</span>}
          {seat?.left ? <small className="away">parti</small> : seat?.away ? <small className="away">déconnecté</small> : null}
        </span>
        <span className="tk" ref={tokRef}><i className="cfn-tok" aria-hidden />{p.tokens}<small>jeton{p.tokens > 1 ? 's' : ''}</small></span>
        <span className="mini" aria-hidden>
          <span title="Tournées">🍺 {p.tournees}</span>
          <span title="Cartes en main"><i className="cfn-bk mini" />{p.handCount}</span>
          {wide && <em>{plural(p.handCount, 'carte')} · touchez pour le détail</em>}
        </span>
        {fx.length > 0 && <span className="cfn-fx-row">{fx.map((e) => <span key={e.card + e.text} className={`cfn-fx ${e.tone}`} style={{ ['--tc' as string]: TYPE_META[e.type].color }}><TypeIcon type={e.type} size={11} />{e.text}</span>)}</span>}
        {wide && last && <span className="cfn-last"><em>Dernier coup</em> {last}</span>}
        <i className="more" aria-hidden>›</i>
      </button>
      <FrontRow p={p} v={v} max={wide ? 6 : n >= 3 ? 3 : 4} onCard={onCard} onTrap={onTrap} onMore={onOpen} />
    </div>
  );
}

/** Fiche d'un joueur : toutes ses informations en clair (et liens vers ses Habitués, ses pièges). */
export function PlayerSheet({ p, v, seat, me, last, onClose, onCard, onTraps }: {
  p: CfPlayerView; v: CfView; seat?: CfSeat; me: boolean; last?: string | null; onClose: () => void; onCard: (id: string) => void; onTraps: () => void;
}) {
  const traps = v.traps.filter((t) => t.owner === p.id);
  const onMe = traps.filter((t) => t.target !== p.id);
  const fx = activeEffects(v, p, me);
  const label = seat?.label ? (seat.bot ? `Ordinateur ${seat.label}` : seat.label) : null;
  return (
    <Sheet title={me ? 'Vous' : p.name} onClose={onClose}>
      <dl className="cfn-kv">
        {label && <><dt>Joueur</dt><dd>{label}</dd></>}
        <dt>Jetons</dt><dd><b>{p.tokens}</b> · le premier à 0 gagne</dd>
        <dt>Tournées</dt><dd><b>{p.tournees}</b> sur {v.rules.tourneesMax} · elles paient les cartes ({v.rules.tourneesPerRound} de plus à chaque manche)</dd>
        <dt>Cartes en main</dt><dd><b>{p.handCount}</b>{me ? '' : ', cachées'} · {plural(p.deckCount, 'carte')} dans son deck</dd>
        <dt>Habitués</dt><dd>{p.habitues.length ? p.habitues.map((h) => <button key={h.uid} className="cfn-kv-link" onClick={() => onCard(h.id)}>{cardName(h.id)} · encore {plural(h.rounds ?? 1, 'manche')}</button>) : 'aucun'}</dd>
        <dt>Pièges posés</dt><dd>{traps.length ? <button className="cfn-kv-link" onClick={onTraps}>{plural(traps.length, 'piège')}{me ? '' : ' caché' + (traps.length > 1 ? 's' : '')}{v.players.length > 2 && onMe.length ? ` (sur ${[...new Set(onMe.map((t) => nameIn(v, t.target)))].join(', ')})` : ''} · voir</button> : 'aucun'}</dd>
        <dt>En cours</dt><dd>{fx.length ? fx.map((e) => <button key={e.card + e.text} className="cfn-kv-link" onClick={() => onCard(e.card)}>{e.text}</button>) : 'rien'}</dd>
        {p.r.throwsUsed > 0 && <><dt>Ses dés</dt><dd>{p.r.dice.join('-')} · {plural(p.r.throwsUsed, 'lancer')}</dd></>}
        {last && <><dt>Dernier coup</dt><dd>{last}</dd></>}
        {p.families.length > 0 && <><dt>Son deck</dt><dd>{familiesLabel(p.families)}</dd></>}
        <dt>Défausse</dt><dd>{p.discard.length ? (
          <span className="cfn-discard" aria-label={`${plural(p.discard.length, 'carte')} défaussée${p.discard.length > 1 ? 's' : ''}, la plus récente d’abord`}>
            {[...p.discard].reverse().slice(0, 12).map((k) => (
              <button key={k.uid} type="button" className="cfn-dc" onClick={() => zoomCard(k.id)} aria-label={`${cardName(k.id)} : lire en grand`}>
                <span className="art" aria-hidden><CardArt id={k.id} /></span><small>{shortName(k.id)}</small>
              </button>
            ))}
            {p.discard.length > 12 && <em>et {plural(p.discard.length - 12, 'autre')}</em>}
          </span>
        ) : 'vide'}</dd>
      </dl>
    </Sheet>
  );
}

export const shortName = (id: string) => (def(id)?.name ?? id).replace(/^(Le |La |Les |L’)/, '').split(',')[0];

// ------------------------------------------------------------------ annonces au centre

export function AnnounceView({ a, onDone, spectator, me, v, leaving }: { a: Announce; onDone: () => void; spectator: boolean; me: string; v: CfView; leaving?: boolean }) {
  const block = a.block && !spectator;
  const bar = !block ? <i className="cfn-ann-bar" style={{ animationDuration: `${a.ms}ms` }} aria-hidden /> : null;
  if (a.style === 'reveal') {
    const blue = a.tone === 'riposte';
    return (
      <div className={`cfn-reveal${blue ? ' blue' : ''}`} role="alertdialog" aria-modal="true" aria-label={a.title} onClick={block ? undefined : onDone}>
        <div className="cfn-reveal-in">
          <small className="cfn-reveal-pill"><TypeIcon type={blue ? 'riposte' : 'piege'} size={14} /> {a.title}</small>
          {a.card ? <BigCard id={a.card} width={Math.min(250, vw() - 80)} zoom={block} /> : <TrapCard big />}
          <div className="cfn-reveal-box">
            {a.conseq && <b>{a.conseq}</b>}
            {a.hint && <span>{a.hint}</span>}
          </div>
          {block ? <button className="cfn-act violet full" onClick={onDone} autoFocus>Compris</button> : bar}
        </div>
      </div>
    );
  }
  if (a.style === 'trap') {
    return (
      <div className="cfn-ann-wrap" onClick={onDone} role="status" aria-live="polite">
        <div className="cfn-ann-trap">
          <TrapCard big style={{ transform: 'rotate(-6deg)' }} />
          <span className="cfn-ann-trap-tx">
            <small><TypeIcon type="piege" size={14} /> {a.kicker}</small>
            <b>{a.title}</b>
            <span>{a.text}</span>
          </span>
          {bar}
        </div>
      </div>
    );
  }
  if (a.style === 'comptes') {
    const lr = v.lastRound;
    return (
      <div className="cfn-ann-wrap" onClick={onDone} role="status" aria-live="polite">
        <div className="cfn-ann-comptes">
          <small>{a.kicker}</small>
          <b>{a.title}</b>
          {lr && <div className="cfn-comptes-rows">{Object.entries(lr.combos).map(([id, c]) => (
            <span key={id} className={`cfn-comptes-row${lr.winner === id ? ' win' : ''}`}>
              <em>{id === me ? 'Vous' : nameIn(v, id)}</em>
              <span className="cfn-dice">{c.dice.map((d, i) => <Pip key={i} v={d} size={20} />)}</span>
              <small>{shortCombo(c.label)} · vaut {c.value}</small>
            </span>
          ))}</div>}
          <span>{a.text}</span>
          {a.recap && a.recap.length > 0 && <ul className="cfn-recap" aria-label="La manche en bref">{a.recap.map((r) => <li key={r}>{r}</li>)}</ul>}
          {bar}
        </div>
      </div>
    );
  }
  // Carte jouée, Habitué installé, piège révélé chez l'adversaire… La carte arrive de la case du joueur,
  // reste lisible au centre (illustration, nom, en clair ce qu'elle fait), puis part à la défausse.
  const color = a.tone in TYPE_META ? TYPE_META[a.tone as CardType].color : '#f1cc7d';
  const gist = a.card ? cardGist(a.card) : null;
  const fromTop = !!a.from && a.from !== me;
  return (
    <div className={`cfn-ann-wrap dim${leaving ? ' out' : ''}`} onClick={onDone} role="status" aria-live="polite">
      <div className={`cfn-ann-big${a.card ? ' has-card' : ''}${fromTop ? ' from-top' : ''}`}>
        {a.kicker && <small style={{ color }}>{a.tone in TYPE_META && <TypeIcon type={a.tone as CardType} size={14} />} {a.kicker}</small>}
        <b>{a.title}</b>
        {a.card ? <BigCard id={a.card} width={Math.min(240, vw() - 80)} className="cfn-ann-card" /> : a.text ? <span className="cfn-ann-text">{a.text}</span> : null}
        {a.card && gist && <span className="cfn-ann-gist" style={{ ['--tc' as string]: color }}>{gist}</span>}
        {a.card && a.text && a.text !== def(a.card)?.text && <span className="cfn-ann-text">{a.text}</span>}
        {a.hint && <span className="cfn-ann-hint">{a.hint}</span>}
        {bar}
        <em className="cfn-skip">Touchez pour passer</em>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ fenêtre de riposte (à moi)

export function RespondPanel({ v, legal, pending, onAct, deadline, focus, tuto }: { v: CfView; legal: CfAction[]; pending: boolean; onAct: (a: CfAction) => void; deadline?: number | null; focus?: boolean; tuto?: string | null }) {
  const top = v.stack[v.stack.length - 1];
  const me = meOf(v);
  const plays = legal.filter((a): a is Extract<CfAction, { type: 'play' }> => a.type === 'play');
  const uids = [...new Set(plays.map((a) => a.card))];
  const [pick, setPick] = useState<string | null>(uids[0] ?? null);
  const action = plays.find((a) => a.card === pick);
  const who = top ? nameIn(v, top.owner) : 'L’adversaire';
  const [now, setNow] = useState(Date.now());
  const [start] = useState(Date.now());
  useEffect(() => { if (!deadline) return; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [deadline]);
  const pct = deadline ? Math.max(0, Math.min(100, (100 * (deadline - now)) / Math.max(1, deadline - start))) : 100;
  const kicker = !top ? `${who} agit` : top.kind === 'keep' ? `${who} garde des dés` : top.cardId ? `${who} joue une carte contre vous` : `${who} pose un piège`;
  return (
    <div className="cfn-resp" role="dialog" aria-modal="true" aria-label="Fenêtre de riposte">
      <div className="cfn-resp-in">
        {tuto && <p className="cfn-tuto-inline">{tuto}</p>}
        <small className="cfn-resp-kicker">{kicker}</small>
        {top?.kind === 'card' && top.cardId ? <BigCard id={top.cardId} width={Math.min(250, vw() - 70)} extra={threatLine(v)} zoom />
          : top?.kind === 'card' ? <div className="cfn-resp-trap"><TrapCard big /><span>{threatLine(v)}</span></div>
            : top?.kind === 'keep' ? <div className="cfn-resp-trap"><span className="cfn-dice">{v.players.find((p) => p.id === top.owner)?.r.dice.map((d, i) => <Pip key={i} v={d} size={30} on={top.keep[i]} />)}</span><span>{threatLine(v)}</span></div> : null}
        {uids.map((uid) => {
          const k = me.hand?.find((x) => x.uid === uid);
          if (!k) return null;
          const cost = costNow(v, k.id);
          return (
            <button key={uid} className={`cfn-resp-mine${pick === uid ? ' on' : ''}`} onClick={() => setPick(uid)} aria-pressed={pick === uid}>
              <HandCard id={k.id} ok small={vw() < 380} />
              <span className="cfn-resp-tx">
                <small><TypeIcon type="riposte" size={13} /> Vous pouvez riposter</small>
                <b>{def(k.id)?.name} : {describeNow(v, k.id)}</b>
                <span>Coût : {plural(cost, 'Tournée')} (il vous en reste {me.tournees})</span>
              </span>
            </button>
          );
        })}
        {deadline ? <div className="cfn-timebar" aria-hidden><i style={{ width: `${pct}%` }} /></div> : null}
        <div className="cfn-acts">
          <button className="cfn-act ghost" disabled={pending || !legal.some((a) => a.type === 'pass')} onClick={() => onAct({ type: 'pass' })}>Laisser faire</button>
          <button className={`cfn-act riposte${focus ? ' cfn-focus' : ''}`} disabled={pending || !action} onClick={() => action && onAct(action)}>Riposter</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ fiche de carte

export interface FicheTarget { uid?: string; id: string; owner?: string | null; trapUid?: string }

/** Fiche d'une carte (prototype 5) : carte en grand, « Maintenant : … », Jouer, choix des paramètres. */
export function Fiche({ t, v, legal, snapLegal, pending, discard, onAct, onClose, tuto }: {
  t: FicheTarget; v: CfView; legal: CfAction[]; snapLegal: CfAction[]; pending: boolean; discard: boolean;
  onAct: (a: CfAction) => void; onClose: () => void; tuto?: string | null;
}) {
  const d = def(t.id)!;
  const opts = t.uid ? playOptions(legal, t.uid) : [];
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<PlayParams>({});
  const me = meOf(v);
  const mineInHand = !!t.uid && !!me.hand?.some((k) => k.uid === t.uid);
  const ready = opts.length ? resolveOption(opts, chosen) : null;
  const next: ParamKey | null = opts.length ? nextParam(opts, chosen) : null;
  const cost = costNow(v, t.id);
  const opps = v.players.filter((p) => p.id !== me.id && !p.out);
  const trapsAgainst = v.traps.filter((x) => x.target === me.id && x.owner !== me.id).length;
  const verb = d.type === 'piege' ? 'Poser le piège' : d.type === 'habitue' ? 'Installer' : 'Jouer';
  let now: ReactNode;
  if (t.owner && t.owner !== me.id) now = <><b>En jeu chez {nameIn(v, t.owner)}.</b> {d.type === 'habitue' ? 'Il reste devant lui et agit à chaque manche. « Fermeture ! » peut le renvoyer dans sa main.' : ''}</>;
  else if (t.trapUid) now = <><b>Votre piège, posé face cachée.</b> Il se déclenchera tout seul quand sa condition arrivera chez {opps.length === 1 ? opps[0].name : 'sa cible'}.</>;
  else if (!mineInHand) now = null;
  else if (discard) now = <><b>Main pleine :</b> défaussez cette carte pour revenir à {v.rules.handMax} cartes.</>;
  else if (opts.length) now = <><b>Maintenant :</b> {describeNow(v, t.id, ready ?? chosen, opts)}{trapsAgainst > 0 && !choosing ? ` ${opps.length === 1 ? opps[0].name : 'Un adversaire'} a ${plural(trapsAgainst, 'piège')} caché${trapsAgainst > 1 ? 's' : ''}.` : ''}</>;
  else now = <><b>Pas maintenant :</b> {tuto ? 'pas à cette étape de la partie guidée.' : whyNot(v, t.id, snapLegal, t.uid!)}</>;
  const playable = mineInHand && opts.length > 0 && !discard;
  // Carte liée, lisible elle aussi : le Coup que rejouerait le grand enchaînement, celui que reprendrait la petite sœur.
  const related = !mineInHand ? null : t.id === 'grand-enchainement' ? (me.r.lastCoup ? { id: me.r.lastCoup, label: 'Rejouerait' } : null)
    : t.id === 'petite-soeur' ? (() => { const k = [...(me.discard ?? [])].reverse().find(petiteSoeurOk); return k ? { id: k.id, label: 'Reprendrait' } : null; })() : null;
  return (
    <div className="cfn-fiche-back" onClick={onClose}>
      <div className="cfn-fiche" role="dialog" aria-modal="true" aria-label={d.name} onClick={(e) => e.stopPropagation()}>
        <div className="cfn-fiche-top"><i className="cfn-grip" aria-hidden /><button className="cfn-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button></div>
        {tuto && <p className="cfn-tuto-inline">{tuto}</p>}
        <BigCard id={t.id} width={Math.min(250, vw() - 60)} zoom />
        {related && <RelatedCard id={related.id} label={related.label} />}
        {now && <div className={`cfn-now${playable || discard ? '' : ' no'}`}>{now}</div>}
        {playable && choosing && next && (
          <ParamChooser k={next} v={v} cardId={t.id === 'grand-enchainement' ? me.r.lastCoup ?? t.id : t.id} opts={opts} chosen={chosen}
            onPick={(k, x) => setChosen((c) => ({ ...c, [k]: x }))} />
        )}
        {discard && mineInHand && <button className="cfn-act violet full" disabled={pending} onClick={() => onAct({ type: 'discard', card: t.uid! })}>Défausser</button>}
        {playable && (
          <div className="cfn-acts">
            {choosing && Object.keys(chosen).length > 0 && <button className="cfn-act ghost" onClick={() => setChosen({})}>Changer</button>}
            <button className={`cfn-act play${tuto ? ' cfn-focus' : ''}`} style={{ background: `linear-gradient(180deg, ${FAMILY_STYLE[d.family].c1}, ${FAMILY_STYLE[d.family].c2})` }}
              disabled={pending || (choosing && !ready)}
              onClick={() => {
                if (ready) onAct({ type: 'play', card: t.uid!, ...ready });
                else setChoosing(true);
              }}>
              {choosing && !ready ? 'Choisissez ci-dessus' : `${verb} · ${plural(cost, 'Tournée')}`}
            </button>
          </div>
        )}
        <TypeLegend highlight={d.type} />
      </div>
    </div>
  );
}

/** Petite ligne « carte liée » (illustration + nom) : toucher la montre en grand. */
export function RelatedCard({ id, label }: { id: string; label: string }) {
  const d = def(id);
  if (!d) return null;
  return (
    <button className="cfn-related" onClick={() => zoomCard(id)} aria-label={`${label} : ${d.name}, lire en grand`}>
      <span className="cfn-related-art" aria-hidden><CardArt id={id} /></span>
      <span><small>{label}</small><b>{d.name}</b></span>
      <Icon name="search" size={16} />
    </button>
  );
}

function ParamChooser({ k, v, cardId, opts, chosen, onPick }: { k: ParamKey; v: CfView; cardId: string; opts: PlayParams[]; chosen: PlayParams; onPick: (k: ParamKey, x: string | number) => void }) {
  const vals = valuesFor(opts, chosen, k);
  const me = meOf(v);
  // Cible choisie, ou seule cible possible (en duel, elle n'est pas demandée) : c'est SES dés qu'on montre.
  const targetIds = [...new Set(filterOptions(opts, chosen).map((o) => o.target).filter(Boolean))];
  const targetId = chosen.target ?? (targetIds.length === 1 ? targetIds[0] : undefined);
  const target = targetId ? v.players.find((p) => p.id === targetId) : undefined;
  const diceOf = cardId === 'de-sous-table' && target ? target.r.dice : me.r.dice;
  const question = k === 'die' && cardId === 'de-sous-table' && target
    ? (target.id === me.id ? 'Quel de vos dés relancer ?' : `Quel dé de ${target.name} relancer ?`)
    : paramQuestion(k, cardId);
  const off = (_x: string | number) => false;
  const on = (_x: string | number) => vals.length === 1;
  return (
    <div className="cfn-param">
      <b>{question}</b>
      <div className="cfn-param-row">
        {vals.map((x) => {
          const cls = `${on(x) ? 'cfn-focus' : ''}`;
          switch (k) {
            case 'target': return <button key={x} className={cls} disabled={off(x)} onClick={() => onPick(k, x)}>{nameIn(v, String(x))}</button>;
            case 'die': return <button key={x} className={`die ${cls}`} disabled={off(x)} onClick={() => onPick(k, x)} aria-label={`Dé ${Number(x) + 1} : ${diceOf[Number(x)]}`}><Pip v={diceOf[Number(x)]} size={36} /></button>;
            case 'delta': return <button key={x} className={cls} disabled={off(x)} onClick={() => onPick(k, x)}>{Number(x) > 0 ? '+1' : '−1'} <small>({me.r.dice[chosen.die ?? 0]} → {me.r.dice[chosen.die ?? 0] + Number(x)})</small></button>;
            case 'face': return <button key={x} className={`die ${cls}`} disabled={off(x)} onClick={() => onPick(k, x)} aria-label={`Face ${x}`}><Pip v={Number(x)} size={32} /></button>;
            case 'trap': {
              const t = v.traps.find((y) => y.uid === x);
              return <button key={x} className={`trap ${cls}`} disabled={off(x)} onClick={() => onPick(k, x)}><TrapCard /><small>de {nameIn(v, t?.owner)}{t ? `, manche ${t.posedRound}` : ''}</small></button>;
            }
            case 'habitue': {
              const owner = v.players.find((p) => p.habitues.some((h) => h.uid === x));
              const h = owner?.habitues.find((y) => y.uid === x);
              return (
                <button key={x} className={`hab ${cls}`} disabled={off(x)} onClick={() => onPick(k, x)}>
                  {h && <span className="hab-art" aria-hidden><CardArt id={h.id} /></span>}
                  <span className="hab-tx">{def(h?.id)?.name ?? '?'} <small>({owner?.id === me.id ? 'vous' : owner?.name}{h?.rounds != null ? ` · encore ${plural(h.rounds, 'manche')}` : ''})</small></span>
                  {h && <ZoomBtn id={h.id} className="inline" />}
                </button>
              );
            }
          }
          return null;
        })}
      </div>
    </div>
  );
}

/** Explication d'un encadré de pièges adverses. */
export function TrapSheet({ owner, v, onClose, onCard }: { owner: CfPlayerView; v: CfView; onClose: () => void; onCard: (id: string) => void }) {
  const traps = v.traps.filter((t) => t.owner === owner.id);
  const list = trapPossibilities(owner.families);
  const ids = [...new Set(list.map((n) => Object.values(CARD_BY_ID).find((c) => c.name === n)!.id))];
  return (
    <div className="cfn-fiche-back" onClick={onClose}>
      <div className="cfn-fiche" role="dialog" aria-modal="true" aria-label="Pièges cachés" onClick={(e) => e.stopPropagation()}>
        <div className="cfn-fiche-top"><i className="cfn-grip" aria-hidden /><button className="cfn-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button></div>
        <div className="cfn-trapsheet-head"><TrapCard big /><span><b>{plural(traps.length, 'piège')} caché{traps.length > 1 ? 's' : ''} chez {owner.name}</b><small>Posé{traps.length > 1 ? 's' : ''} face cachée. Un piège se déclenche tout seul quand sa condition arrive chez sa cible, puis il est défaussé. Non déclenché en {v.rules.trapReturnRounds} manches, il revient dans la main de son poseur.</small></span></div>
        {traps.some((t) => t.id) && <p className="cfn-muted">Vous avez vu : {traps.filter((t) => t.id).map((t) => cardName(t.id)).join(', ')}.</p>}
        <b className="cfn-legend-title">D’après son deck ({familiesLabel(owner.families)}), ça peut être :</b>
        {ids.length ? (
          <div className="cfn-trap-list">
            {ids.map((id) => <button key={id} className="cfn-trap-item" onClick={() => onCard(id)}><TypeIcon type="piege" size={16} /><span><b>{def(id)!.name}</b><small>{def(id)!.text}</small></span></button>)}
          </div>
        ) : <p className="cfn-muted">Aucun piège dans ses familles de cartes.</p>}
        <p className="cfn-tip">Astuce : la <b>Fouine</b> défausse un piège adverse de votre choix ; le <b>Videur</b> annule le premier piège de chaque manche.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ journal et aide

export interface LogLine { key: number; round: number; ev: CfEvent }

function LogText({ ev, onCard }: { ev: CfEvent; onCard: (id: string) => void }) {
  const d = def(ev.card);
  if (!d) return <span>{ev.text}</span>;
  const i = ev.text.indexOf(d.name);
  const btn = <button className="cfn-log-card" style={{ color: TYPE_META[d.type].color }} onClick={() => onCard(d.id)}>{d.name}</button>;
  if (i < 0) return <span>{ev.text} {btn}</span>;
  return <span>{ev.text.slice(0, i)}{btn}{ev.text.slice(i + d.name.length)}</span>;
}

const LOG_GLYPH: Record<string, string> = { lancer: '🎲', 'fin-tour': '🎲', comptes: '🪙', manche: '★', tirage: '★', ardoise: '🍺', sortie: '🏁', fin: '🏁', pioche: '＋', 'pioche-privee': '＋' };

export function Journal({ log, v, me, onCard, onClose }: { log: LogLine[]; v: CfView; me: string; onCard: (id: string, owner?: string) => void; onClose: () => void }) {
  const rounds = [...new Set(log.map((l) => l.round))].sort((a, b) => b - a);
  const inPlay = v.players.filter((p) => p.habitues.length || v.traps.some((t) => t.owner === p.id));
  return (
    <div className="cfn-fiche-back" onClick={onClose}>
      <div className="cfn-fiche cfn-journal" role="dialog" aria-modal="true" aria-label="Journal de la manche" onClick={(e) => e.stopPropagation()}>
        <div className="cfn-sheet-head"><h2>Journal</h2><button className="cfn-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button></div>
        {inPlay.length > 0 && (
          <section className="cfn-inplay">
            <b className="cfn-legend-title">En jeu</b>
            {inPlay.map((p) => (
              <div key={p.id} className="cfn-inplay-row">
                <em>{p.id === me ? 'Vous' : p.name}</em>
                {p.habitues.map((h) => <button key={h.uid} className="cfn-hab" onClick={() => onCard(h.id, p.id)}><TypeIcon type="habitue" size={12} />{shortName(h.id)}</button>)}
                {v.traps.filter((t) => t.owner === p.id).map((t) => t.id
                  ? <button key={t.uid} className="cfn-hab trap" onClick={() => onCard(t.id!, p.id)}><TypeIcon type="piege" size={12} />{shortName(t.id)}</button>
                  : <span key={t.uid} className="cfn-hab trap"><TypeIcon type="piege" size={12} />Piège caché</span>)}
              </div>
            ))}
          </section>
        )}
        {rounds.length === 0 && <p className="cfn-muted">Rien pour l’instant.</p>}
        {rounds.map((r) => (
          <section key={r} className="cfn-log-round">
            <b className="cfn-legend-title">Manche {r}</b>
            <ol className="cfn-log">
              {log.filter((l) => l.round === r).map((l) => {
                const d = def(l.ev.card);
                return (
                  <li key={l.key}>
                    <span className="cfn-log-ic">{d ? <TypeIcon type={d.type} size={14} /> : <i>{LOG_GLYPH[l.ev.kind] ?? '·'}</i>}</span>
                    <LogText ev={l.ev} onCard={(id) => onCard(id)} />
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

export function HelpSheet({ v, onClose, onRules, onTour }: { v: CfView; onClose: () => void; onRules: () => void; onTour?: () => void }) {
  return (
    <div className="cfn-fiche-back" onClick={onClose}>
      <div className="cfn-fiche cfn-journal" role="dialog" aria-modal="true" aria-label="Aide" onClick={(e) => e.stopPropagation()}>
        <div className="cfn-sheet-head"><h2>Aide</h2><button className="cfn-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button></div>
        <section className="cfn-help">
          {commandeOf(v.commande) && <p className="cfn-help-cmd"><b>Commande du comptoir</b> (cette manche, pour tout le monde) : {commandeOf(v.commande)!.text}</p>}
          <b className="cfn-legend-title">Ce que vous voyez à l’écran</b>
          <dl className="cfn-kv">
            <dt>En haut</dt><dd>Une case par adversaire. Le gros chiffre : ses <b>jetons</b> (le premier à 0 gagne). Puis 🍺 ses <b>Tournées</b> (elles paient les cartes), <i className="cfn-bk mini" /> ses <b>cartes en main</b>, <TypeIcon type="piege" size={12} /> ses <b>pièges posés</b>, <TypeIcon type="habitue" size={12} /> ses <b>Habitués</b>. Celui qui joue est encadré en doré. <b>Touchez une case</b> pour tout voir en clair.</dd>
            <dt>Le bandeau</dt><dd>À qui de jouer et quoi faire ; à plusieurs, la petite ligne dit le dernier coup joué.</dd>
            <dt>Le bac</dt><dd>Les dés de celui qui joue. À votre tour, touchez un dé pour le garder avant de relancer.</dd>
            <dt>Vos cartes</dt><dd>Sous chaque nom, ce que fait la carte ; le chiffre dans le petit verre est son coût en Tournées (pas en jetons). Les cartes <b className="cfn-gold">dorées</b> sont jouables maintenant. Touchez une carte pour la lire en grand.</dd>
            <dt>« Vous »</dt><dd>Vos jetons, vos Tournées, vos Habitués (le chiffre : manches restantes) et vos pièges posés. Touchez « Vous » pour votre fiche.</dd>
            <dt>Journal</dt><dd>Tout ce qui s’est passé, coup par coup.</dd>
            <dt>À côté de la manche</dt><dd>La <b>commande du comptoir</b> : une règle bonus tirée à chaque manche, la même pour tous (touchez-la pour la relire).</dd>
          </dl>
          <b className="cfn-legend-title">Une manche</b>
          <ol>
            <li>Chacun pioche 1 carte et reçoit {v.rules.tourneesPerRound} Tournée{v.rules.tourneesPerRound > 1 ? 's' : ''} ({v.rules.tourneesPerRound + v.rules.tourneesLoserBonus} pour le perdant de la manche d’avant) : jouer une carte est un choix, économisez pour enchaîner.</li>
            <li><b>Le meneur</b> lance les dés jusqu’à {v.rules.maxThrows} fois ; son nombre de lancers fixe le maximum des autres. Les autres jouent ensuite, en voyant la combinaison à battre.</li>
            <li><b>Dernier mot</b> : avant les comptes, les cartes « Dernier mot » peuvent encore tout changer.</li>
            <li><b>Comptes</b> : le gagnant DONNE au perdant autant de jetons que vaut sa combinaison.</li>
          </ol>
        </section>
        <TypeLegend />
        {onTour && <button className="cfn-act gold full" onClick={onTour}>Visite guidée de l’écran</button>}
        <button className="cfn-act ghost full" onClick={onRules}>Règles complètes</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ fenêtres de décision

export function Mulligan({ v, legal, pending, onAct, clock }: { v: CfView; legal: CfAction[]; pending: boolean; onAct: (a: CfAction) => void; clock?: string }) {
  const [back, setBack] = useState<string[]>([]);
  const hand = meOf(v).hand ?? [];
  const max = v.rules.mulligan;
  const action = legal.find((a) => a.type === 'mulligan' && [...a.cards].sort().join() === [...back].sort().join());
  return (
    <div className="cf-modal" role="dialog" aria-modal="true" aria-label="Main de départ">
      <div className="cf-modal-card">
        <h3>Votre main de départ</h3>
        <p>Choisissez jusqu’à {max} cartes à changer : elles repartent sous le deck et vous en repiochez autant. Une seule fois.{clock ? ` · ${clock}` : ''}</p>
        <div className="cf-mull-grid">
          {hand.map((k) => {
            const on = back.includes(k.uid);
            return (
              <button key={k.uid} className={`cf-mull${on ? ' out' : ''}`} onClick={() => setBack((b) => (on ? b.filter((x) => x !== k.uid) : b.length < max ? [...b, k.uid] : b))} aria-pressed={on}>
                <CardView id={k.id} width={Math.min(140, (vw() - 72) / 2)} dimmed={on} />
                {on && <span className="cf-mull-tag">À changer</span>}
              </button>
            );
          })}
        </div>
        <button className="cf-btn gold big" disabled={pending || !action} onClick={() => action && onAct(action)}>{back.length ? `Changer ${plural(back.length, 'carte')}` : 'Garder ma main'}</button>
      </div>
    </div>
  );
}

/**
 * Une carte à choisir parmi plusieurs (Calcul mental…) : la carte en petit (toucher = en grand), son
 * nom, son type et son texte ENTIER à côté, et le bouton qui la choisit.
 */
export function PickRow({ id, label, onPick, disabled, focus, sub }: { id: string; label: string; onPick: () => void; disabled?: boolean; focus?: boolean; sub?: ReactNode }) {
  const d = cardDef(id);
  if (!d) return null;
  const m = TYPE_META[d.type];
  const [, bold] = splitEmphasis(id, d.text);
  return (
    <div className="cf-pick-row">
      <span className="cf-pick-card" role="button" tabIndex={0} aria-label={`Lire « ${d.name} » en grand`} onClick={() => zoomCard(id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoomCard(id); } }}>
        <HandCard id={id} small />
        <ZoomBtn id={id} />
      </span>
      <span className="cf-pick-tx">
        <b>{d.name}</b>
        <small style={{ color: m.color }}><TypeIcon type={d.type} size={11} />{m.label} · coût {d.cost}</small>
        <span className="cf-pick-text"><GlossText text={d.text} bold={bold || undefined} /></span>
        {sub}
        <button className={`cfn-act gold slim${focus ? ' cfn-focus' : ''}`} disabled={disabled} onClick={onPick}>{label}</button>
      </span>
    </div>
  );
}

export function ChoiceWindow({ v, legal, pending, onAct, focus, tuto }: { v: CfView; legal: CfAction[]; pending: boolean; onAct: (a: CfAction) => void; focus?: boolean; tuto?: string | null }) {
  const ch = v.choice;
  if (!ch) return null;
  const has = (i: number) => legal.some((a) => a.type === 'choose' && a.index === i);
  const me = meOf(v);
  const lock = (i: number) => !has(i);
  if (ch.kind === 'calcul' && 'cards' in ch) {
    // Lisible d'emblée (Sam : « le choix parmi 3 cartes est illisible ») : une ligne par carte, texte
    // entier ; toucher l'image (ou la loupe) la montre en grand, seul « Garder » choisit.
    return (
      <div className="cf-modal" role="dialog" aria-modal="true" aria-label="Calcul mental">
        <div className="cf-modal-card cf-calc">
          {tuto && <p className="cfn-tuto-inline">{tuto}</p>}
          <h3>Calcul mental</h3>
          <p>Gardez une carte ; les autres repartent sous votre deck.</p>
          <div className="cf-calc-list">
            {ch.cards.map((k, i) => <PickRow key={k.uid} id={k.id} label="Garder" disabled={pending || !has(i)} focus={focus && i === 0} onPick={() => onAct({ type: 'choose', index: i })} />)}
          </div>
        </div>
      </div>
    );
  }
  if (ch.kind === 'fouine' && 'cardId' in ch) {
    return (
      <div className="cfn-reveal" role="dialog" aria-modal="true" aria-label="La Fouine a trouvé un piège">
        <div className="cfn-reveal-in">
          {tuto && <p className="cfn-tuto-inline">{tuto}</p>}
          <small className="cfn-reveal-pill"><TypeIcon type="piege" size={14} /> La Fouine vous montre le piège</small>
          <BigCard id={ch.cardId} width={Math.min(250, vw() - 80)} />
          <div className="cfn-reveal-box"><b>Payer 1 Tournée pour le défausser ?</b><span>Vous en avez {me.tournees}. Sinon, il reste posé : au moins, vous savez ce qui vous attend.</span></div>
          <div className="cfn-acts">
            <button className="cfn-act ghost" disabled={pending || lock(0)} onClick={() => onAct({ type: 'choose', index: 0 })}>Le laisser</button>
            <button className={`cfn-act violet${focus && has(1) ? ' cfn-focus' : ''}`} disabled={pending || !has(1) || lock(1)} onClick={() => onAct({ type: 'choose', index: 1 })}>Défausser · 1 Tournée</button>
          </div>
        </div>
      </div>
    );
  }
  if (ch.kind === 'tournee-generale') {
    return (
      <div className="cf-modal" role="dialog" aria-modal="true" aria-label="Tournée générale">
        <div className="cf-modal-card">
          <h3>Tournée générale</h3>
          <p>Vous pouvez encore relancer un de vos dés : {comboOf(v, me)?.label}.</p>
          <div className="cfn-param-row center">{me.r.dice.map((d, i) => <button key={i} className="die" disabled={pending || !has(i)} onClick={() => onAct({ type: 'choose', index: i })} aria-label={`Relancer le ${d}`}><Pip v={d} size={44} /></button>)}</div>
          <button className="cf-btn ghost" disabled={pending} onClick={() => onAct({ type: 'choose', index: -1 })}>Garder mes dés</button>
        </div>
      </div>
    );
  }
  return null;
}

export function EndScreen({ snap, v, me, onExit, onAgain, onAccount, onBags, bot, guest, rewarded, ranked, spectator, onShare, sharing, againLabel }: { againLabel?: string; onBags?: () => void; snap: CfSnapshot; v: CfView; me: string; onExit: () => void; onAgain?: () => void; onAccount: () => void; bot: boolean; guest: boolean; rewarded: boolean; ranked: boolean; spectator: boolean; onShare?: () => void; sharing?: boolean }) {
  const standings = snap.finished?.standings ?? v.ranking;
  const won = standings[0] === me;
  const abandon = (snap.finished as { abandon?: string | null } | null)?.abandon;
  const reward = (snap.finished?.reward ?? null) as Record<string, unknown> | null;
  const num = (k: string) => (reward && typeof reward[k] === 'number' ? (reward[k] as number) : null);
  const capsules = num('capsules');
  const coins = num('coins');
  const bags = num('bags') ?? 0;
  const points = ranked ? num('points') : null;
  const boosters = num('boosters') ?? (reward?.booster === true ? 1 : null);
  const missions = Array.isArray(reward?.missions) ? (reward!.missions as string[]).length : 0;
  const error = reward && typeof reward.error === 'string' ? reward.error : null;
  const note = reward && typeof reward.note === 'string' ? reward.note : null;
  return (
    <div className="cf-modal end" role="dialog" aria-modal="true" aria-label={won ? 'Victoire' : 'Défaite'}>
      <div className={`cf-modal-card cf-end${won ? ' win' : ''}`}>
        <span className="cf-end-rays" aria-hidden />
        {spectator ? <h2>{nameIn(v, standings[0])} gagne</h2> : <h2>{won ? 'Victoire !' : standings.length > 2 && standings.indexOf(me) > 0 ? `${standings.indexOf(me) + 1}e place` : 'Défaite'}</h2>}
        {abandon && <p>{abandon}</p>}
        <p>{won ? 'Plus un seul jeton : le comptoir est à vous.' : `${nameIn(v, standings[0])} s’est déchargé le premier.`} {v.round} manche{v.round > 1 ? 's' : ''}.</p>
        <ol className="cf-standings">
          {standings.map((id, i) => <li key={id} className={id === me ? 'me' : ''}><span>{i + 1}</span><b>{nameIn(v, id)}</b><small>{plural(v.players.find((p) => p.id === id)?.tokens ?? 0, 'jeton')}</small></li>)}
        </ol>
        <div className="cf-gains">
          {capsules !== null && <span className="cf-gain"><b>+{capsules}</b><CapsuleIcon size={22} /> <small>capsule{capsules > 1 ? 's' : ''}</small></span>}
          {coins !== null && coins > 0 && <span className="cf-gain coins"><b>+{coins}</b><CoinArt size={22} /> <small>pièce{coins > 1 ? 's' : ''}</small></span>}
          {bags > 0 && <span className="cf-gain bag"><b>+{bags}</b><BagIcon size={26} /> <small>sac de dés{bags > 1 ? ' (×' + bags + ')' : ''}</small>{onBags && <button className="cf-btn small gold" onClick={onBags}>Ouvrir</button>}</span>}
          {points !== null && <span className="cf-gain"><b>{points > 0 ? `+${points}` : points}</b> <small>points de ligue</small></span>}
          {boosters ? <span className="cf-gain"><b>+{boosters}</b> <small>booster{boosters > 1 ? 's' : ''}{won ? ' (première victoire du jour)' : ''}</small></span> : null}
          {missions > 0 && <span className="cf-gain"><b>✓ {missions}</b> <small>mission{missions > 1 ? 's' : ''} du jour</small></span>}
          {note && <small className="cf-gain-note">{note}</small>}
          {error && <small className="cf-gain-note">{error}</small>}
          {!reward && rewarded && !spectator && <small className="cf-gain-note">Calcul des gains…</small>}
          {!reward && !rewarded && bot && <small className="cf-gain-note">{guest ? 'Partie d’essai : aucun gain.' : 'Partie d’entraînement : pas de capsules cette fois.'}</small>}
        </div>
        {guest && bot && <button className="cf-link" onClick={onAccount}>Créer un compte gratuit pour gagner des capsules et des pièces</button>}
        {onShare && <button className="cf-btn violet" disabled={sharing} onClick={onShare}><Icon name="share" size={18} />Partager mon plus beau coup</button>}
        <div className="cf-modal-btns">
          <button className="cf-btn ghost" onClick={onExit}>Menu du mode</button>
          {onAgain && <button className="cf-btn gold" onClick={onAgain}>{againLabel ?? 'Rejouer'}</button>}
        </div>
      </div>
    </div>
  );
}
