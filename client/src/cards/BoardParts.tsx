/**
 * Coups Fourrés : les pièces du plateau de partie (prototypes CFN validés par Sam le 5 novembre :
 * tour adverse, votre tour, riposte, piège déclenché, fiche de carte).
 * Styles : bloc « Coups Fourrés : nouveau plateau » à la fin de styles.css (classes cfn-*).
 */
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CARD_BY_ID, cardDef, type CardType } from '../../../shared/cards/catalog';
import type { CfAction, CfEvent, CfPlayerView, CfView, PlayParams } from '../../../shared/cards/engine';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { CardArt } from './art';
import { CapsuleIcon, CardView } from './components';
import { FAMILY_STYLE, splitEmphasis } from './meta';
import { Pip } from './cfui';
import { TYPE_META, TypeIcon, TypeLegend } from './cardTypes';
import type { CfSeat, CfSnapshot } from './controller';
import {
  comboOf, costNow, describeNow, meOf, nameIn, nextParam, paramQuestion, playOptions, plural, resolveOption, valuesFor, whyNot, type ParamKey,
} from './describe';
import { cardName, familiesLabel, shortCombo, threatLine, trapPossibilities, type Announce, type CardHint, type FriseStep } from './board';
import './fonts';

const def = (id: string | null | undefined) => (id ? CARD_BY_ID[id] : undefined);
const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const vw = () => (typeof window !== 'undefined' ? window.innerWidth : 360);

// ------------------------------------------------------------------ petites pièces

/** Tournées : petits verres pleins / vides. */
export function Glasses({ n, max }: { n: number; max: number }) {
  return (
    <span className="cfn-glasses" role="img" aria-label={`${plural(n, 'Tournée')} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? '' : 'off'} />)}
    </span>
  );
}

/** Jetons (pastille dorée). */
export const Tokens = ({ n, refEl }: { n: number; refEl?: (el: HTMLElement | null) => void }) => (
  <span className="cfn-chip" ref={refEl} aria-label={plural(n, 'jeton')}><i className="cfn-tok" aria-hidden />{n}</span>
);

/** Piège face cachée (rayures violettes, mâchoire). */
export const TrapCard = ({ big, style }: { big?: boolean; style?: CSSProperties }) => (
  <span className={`cfn-trapc${big ? ' big' : ''}`} style={style} aria-hidden><TypeIcon type="piege" size={big ? 30 : 16} /></span>
);

/** Grande carte lisible (prototype « big ») : coût, nom, illustration, type et moment, texte. */
export function BigCard({ id, width = 250, extra, className }: { id: string; width?: number; extra?: ReactNode; className?: string }) {
  const d = cardDef(id);
  if (!d) return null;
  const fs = FAMILY_STYLE[d.family];
  const [b, bold, a] = splitEmphasis(id, d.text);
  const m = TYPE_META[d.type];
  return (
    <div className={`cfn-big${d.rarity === 'legendaire' ? ' leg' : ''}${className ? ` ${className}` : ''}`} style={{ width, background: `linear-gradient(160deg, ${fs.c1}, ${fs.c2})`, ['--e' as string]: fs.edge }}
      role="img" aria-label={`${d.name}, ${m.label}, coût ${d.cost} : ${d.text}`}>
      <div className="cfn-big-hd"><span className="cfn-coin">{d.cost}</span><h3>{d.name}</h3></div>
      <span className="cfn-big-art"><CardArt id={id} /></span>
      <span className="cfn-big-tl" style={{ color: m.color }}><TypeIcon type={d.type} size={13} />{m.label} · {m.moment}</span>
      <div className="cfn-big-tx">{b}{bold && <b>{bold}</b>}{a}{extra && <span className="cfn-big-here">{extra}</span>}</div>
    </div>
  );
}

/** Carte en main (prototype « hc ») : coût, illustration, nom, type. */
export function HandCard({ id, ok, off, sel, focus, style, onClick, small }: { id: string; ok?: boolean; off?: boolean; sel?: boolean; focus?: boolean; small?: boolean; style?: CSSProperties; onClick?: () => void }) {
  const d = cardDef(id);
  if (!d) return null;
  const fs = FAMILY_STYLE[d.family];
  const m = TYPE_META[d.type];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`cfn-hc${ok ? ' ok' : ''}${off ? ' off' : ''}${sel ? ' sel' : ''}${focus ? ' cfn-focus' : ''}${small ? ' small' : ''}`} style={{ background: `linear-gradient(160deg, ${fs.c1}, ${fs.c2})`, ...style }}
      onClick={onClick} aria-label={onClick ? `${d.name}, ${m.label}, coût ${d.cost}` : undefined} type={onClick ? 'button' : undefined}>
      <span className="c">{d.cost}</span>
      <span className="a"><CardArt id={id} /></span>
      <b>{d.name}</b>
      <span className="ty" style={{ color: m.color }}><TypeIcon type={d.type} size={11} />{m.label}</span>
    </Tag>
  );
}

const PILL_BG: Record<string, string> = { ok: '#f1cc7d', cost: 'rgba(255,255,255,.78)', wait: 'rgba(255,255,255,.5)' };

/**
 * Main en éventail : cartes jouables soulevées et dorées, étiquette de raison sous chaque carte.
 * `quiet` (ce n'est pas à vous) : main grisée, sans étiquettes (la raison reste dans la fiche de la carte).
 * Mémorisée : le minuteur et les animations ne la redessinent pas.
 */
export const Hand = memo(function Hand({ cards, hints, onPick, sel, focus, quiet }: {
  cards: { uid: string; id: string }[]; hints: Record<string, CardHint>; onPick: (uid: string) => void; sel?: string | null; focus?: boolean; quiet?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  const [small, setSmall] = useState(false);
  useIsoLayout(() => {
    const m = () => { if (ref.current) setW(ref.current.clientWidth); setSmall(window.innerHeight < 700); };
    m(); window.addEventListener('resize', m); return () => window.removeEventListener('resize', m);
  }, []);
  const n = cards.length;
  const cw = small ? 82 : 96;
  // Inclinaison par carte, et marge pour que les cartes inclinées du bord ne sortent pas de l'écran.
  const per = n <= 4 ? 6 : Math.min(5, 20 / (n - 1));
  const edge = (per * (n - 1)) / 2;
  const pad = Math.ceil(Math.sin((edge * Math.PI) / 180) * 1.2 * (small ? 115 : 134) * 0.9) + 4;
  const step = n > 1 ? Math.min(cw - 24, (w - cw - 2 * pad) / (n - 1)) : 0;
  const start = (w - (cw + step * (n - 1))) / 2;
  const crowded = step < 74;
  const lift = small ? 12 : 16;
  return (
    <div className={`cfn-hand${small ? ' small' : ''}${crowded ? ' crowded' : ''}${focus ? ' cfn-focus-zone' : ''}`} ref={ref}>
      {cards.map((k, i) => {
        const h = hints[k.uid];
        const off = i - (n - 1) / 2;
        const rot = off * per;
        const ok = !!h?.playable;
        return (
          <HandCard key={k.uid} id={k.id} ok={ok} off={!ok} sel={sel === k.uid} focus={focus && ok} small={small}
            style={{ left: start + i * step, bottom: (ok ? lift : 0) + 14, transform: `rotate(${rot.toFixed(1)}deg)`, zIndex: i + 1 }}
            onClick={() => onPick(k.uid)} />
        );
      })}
      {!quiet && cards.map((k, i) => {
        const h = hints[k.uid];
        if (!h) return null;
        const ok = h.playable;
        const bg = h.tone === 'moment' ? TYPE_META[h.type].color : PILL_BG[h.tone];
        const low = crowded && i % 2 === 1;
        return (
          <span key={`p${k.uid}`} className={`cfn-why${ok ? ' ok' : ''}`} aria-hidden
            style={{ left: start + i * step + cw / 2, bottom: (ok ? lift : 0) + 12 - (low ? 14 : 0), background: bg, zIndex: 40 + i, maxWidth: crowded ? Math.max(64, step * 2 - 6) : undefined }}>
            {h.label}
          </span>
        );
      })}
    </div>
  );
});

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
      {compact ? <b>{n}</b> : <span>{plural(n, 'piège')} caché{n > 1 ? 's' : ''}<br /><small>{seen.length ? `Vu : ${seen.join(', ')}` : sub}</small></span>}
    </button>
  );
}

/**
 * Pastille discrète d'un Habitué (vert) ou d'un de mes pièges (violet), dans la barre du joueur :
 * la petite illustration de la carte ; toucher ouvre sa fiche.
 */
export function HabPin({ id, trap, onClick }: { id: string | null; trap?: boolean; onClick: () => void }) {
  const name = id ? def(id)?.name ?? '' : 'Piège';
  return (
    <button className={`cfn-pin${trap ? ' trap' : ''}`} onClick={onClick} aria-label={trap ? `Votre piège posé : ${name}` : `Habitué : ${name}`} title={name}>
      {id ? <CardArt id={id} /> : <TypeIcon type="piege" size={12} />}
      <i aria-hidden><TypeIcon type={trap ? 'piege' : 'habitue'} size={8} /></i>
    </button>
  );
}

/** Panneau d'un adversaire (prototype : avatar, nom, deck, jetons, Tournées, cartes en main, pièges, Habitués). */
export function OppPanel({ p, v, seat, active, compact, refEl, tokRef, onTrap, onCard, emote, focus }: {
  p: CfPlayerView; v: CfView; seat?: CfSeat & { away?: boolean; left?: boolean }; active: boolean; compact: boolean; focus?: boolean;
  refEl: (el: HTMLElement | null) => void; tokRef?: (el: HTMLElement | null) => void; onTrap: () => void; onCard: (id: string, owner?: string) => void; emote?: string;
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
        <Tokens n={p.tokens} refEl={tokRef} />
      </div>
      <div className="cfn-row">
        {compact ? <span className="cfn-mini-stat" aria-hidden>🍺 {p.tournees}</span> : <Glasses n={p.tournees} max={v.rules.tourneesMax} />}
        <span className="cfn-backs" aria-hidden>{compact ? <><i className="cfn-bk" /><em>{p.handCount}</em></> : Array.from({ length: Math.min(p.handCount, 7) }, (_, i) => <i key={i} className="cfn-bk" />)}</span>
        {p.habitues.length > 0 && <span className="cfn-pins">{p.habitues.map((h) => <HabPin key={h.uid} id={h.id} onClick={() => onCard(h.id, p.id)} />)}</span>}
        <span className="cfn-grow" />
        <TrapBox n={traps.length} seen={seen} sub={fresh ? 'Posé à l’instant' : 'Touchez pour les possibilités'} onClick={onTrap} compact={compact || p.habitues.length > 0} />
      </div>
    </section>
  );
}
export const shortName = (id: string) => (def(id)?.name ?? id).replace(/^(Le |La |Les |L’)/, '').split(',')[0];

// ------------------------------------------------------------------ annonces au centre

export function AnnounceView({ a, onDone, spectator, me, v }: { a: Announce; onDone: () => void; spectator: boolean; me: string; v: CfView }) {
  const block = a.block && !spectator;
  const bar = !block ? <i className="cfn-ann-bar" style={{ animationDuration: `${a.ms}ms` }} aria-hidden /> : null;
  if (a.style === 'reveal') {
    const blue = a.tone === 'riposte';
    return (
      <div className={`cfn-reveal${blue ? ' blue' : ''}`} role="alertdialog" aria-modal="true" aria-label={a.title} onClick={block ? undefined : onDone}>
        <div className="cfn-reveal-in">
          <small className="cfn-reveal-pill"><TypeIcon type={blue ? 'riposte' : 'piege'} size={14} /> {a.title}</small>
          {a.card ? <BigCard id={a.card} width={Math.min(250, vw() - 80)} /> : <TrapCard big />}
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
          {bar}
        </div>
      </div>
    );
  }
  // Carte jouée, Habitué installé, piège révélé chez l'adversaire…
  const color = a.tone in TYPE_META ? TYPE_META[a.tone as CardType].color : '#f1cc7d';
  return (
    <div className="cfn-ann-wrap dim" onClick={onDone} role="status" aria-live="polite">
      <div className="cfn-ann-big">
        {a.kicker && <small style={{ color }}>{a.tone in TYPE_META && <TypeIcon type={a.tone as CardType} size={14} />} {a.kicker}</small>}
        <b>{a.title}</b>
        {a.card ? <BigCard id={a.card} width={Math.min(230, vw() - 90)} /> : a.text ? <span className="cfn-ann-text">{a.text}</span> : null}
        {a.card && a.text && a.text !== def(a.card)?.text && <span className="cfn-ann-text">{a.text}</span>}
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
        {top?.kind === 'card' && top.cardId ? <BigCard id={top.cardId} width={Math.min(250, vw() - 70)} extra={threatLine(v)} />
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
  return (
    <div className="cfn-fiche-back" onClick={onClose}>
      <div className="cfn-fiche" role="dialog" aria-modal="true" aria-label={d.name} onClick={(e) => e.stopPropagation()}>
        <div className="cfn-fiche-top"><i className="cfn-grip" aria-hidden /><button className="cfn-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button></div>
        {tuto && <p className="cfn-tuto-inline">{tuto}</p>}
        <BigCard id={t.id} width={Math.min(250, vw() - 60)} />
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

function ParamChooser({ k, v, cardId, opts, chosen, onPick }: { k: ParamKey; v: CfView; cardId: string; opts: PlayParams[]; chosen: PlayParams; onPick: (k: ParamKey, x: string | number) => void }) {
  const vals = valuesFor(opts, chosen, k);
  const me = meOf(v);
  const target = chosen.target ? v.players.find((p) => p.id === chosen.target) : undefined;
  const diceOf = cardId === 'de-sous-table' && target ? target.r.dice : me.r.dice;
  const off = (_x: string | number) => false;
  const on = (_x: string | number) => vals.length === 1;
  return (
    <div className="cfn-param">
      <b>{paramQuestion(k, cardId)}</b>
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
              return <button key={x} className={cls} disabled={off(x)} onClick={() => onPick(k, x)}>{def(h?.id)?.name ?? '?'} <small>({owner?.name})</small></button>;
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
        <p className="cfn-tip">Astuce : la <b>Fouine</b> regarde un piège adverse (et peut le défausser pour 1 Tournée) ; le <b>Videur</b> annule le premier piège de chaque manche.</p>
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

export function HelpSheet({ v, onClose, onRules }: { v: CfView; onClose: () => void; onRules: () => void }) {
  return (
    <div className="cfn-fiche-back" onClick={onClose}>
      <div className="cfn-fiche cfn-journal" role="dialog" aria-modal="true" aria-label="Aide" onClick={(e) => e.stopPropagation()}>
        <div className="cfn-sheet-head"><h2>Aide</h2><button className="cfn-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button></div>
        <TypeLegend />
        <section className="cfn-help">
          <b className="cfn-legend-title">Une manche (la frise en haut)</b>
          <ol>
            <li><b>Service</b> : chacun pioche 1 carte et reçoit {v.rules.tourneesPerRound} Tournées (les verres), {v.rules.tourneesPerRound + v.rules.tourneesLoserBonus} pour le perdant de la manche d’avant.</li>
            <li><b>Le meneur</b> lance les dés jusqu’à {v.rules.maxThrows} fois. Son nombre de lancers fixe le maximum des autres.</li>
            <li><b>Les autres</b> jouent ensuite, en voyant la combinaison à battre.</li>
            <li><b>Dernier mot</b> : les combinaisons sont posées ; les cartes « Dernier mot » peuvent encore tout changer.</li>
            <li><b>Comptes</b> : le gagnant DONNE au perdant autant de jetons que vaut sa combinaison. Le premier à 0 jeton gagne la partie.</li>
          </ol>
          <p>Quand c’est à vous, les cartes qui <b className="cfn-gold">brillent</b> sont jouables maintenant ; l’étiquette dit pourquoi. Les autres disent quand elles se jouent ou ce qui manque. Pendant le tour adverse, la main est grisée. Touchez une carte pour la lire en grand. Le bandeau sous l’adversaire dit toujours ce qui se passe ; les pastilles rondes sont les Habitués en jeu (touchez-les).</p>
          <p><b>L’ardoise</b> (une fois par partie) : {v.rules.ardoiseLoan} Tournées tout de suite, rien à la manche suivante.</p>
        </section>
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

export function ChoiceWindow({ v, legal, pending, onAct, focus, tuto }: { v: CfView; legal: CfAction[]; pending: boolean; onAct: (a: CfAction) => void; focus?: boolean; tuto?: string | null }) {
  const ch = v.choice;
  if (!ch) return null;
  const has = (i: number) => legal.some((a) => a.type === 'choose' && a.index === i);
  const me = meOf(v);
  const lock = (i: number) => !has(i);
  if (ch.kind === 'calcul' && 'cards' in ch) {
    return (
      <div className="cf-modal" role="dialog" aria-modal="true" aria-label="Calcul mental">
        <div className="cf-modal-card">
          <h3>Calcul mental</h3>
          <p>Gardez une carte ; les autres repartent sous votre deck.</p>
          <div className="cf-choice-row">
            {ch.cards.map((k, i) => <button key={k.uid} className="cf-choice-card" disabled={pending || !has(i)} onClick={() => onAct({ type: 'choose', index: i })}><CardView id={k.id} width={Math.min(104, (vw() - 80) / 3)} /><span>Garder</span></button>)}
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

export function EndScreen({ snap, v, me, onExit, onAgain, onAccount, bot, guest, rewarded, ranked, spectator, onShare, sharing, againLabel }: { againLabel?: string; snap: CfSnapshot; v: CfView; me: string; onExit: () => void; onAgain?: () => void; onAccount: () => void; bot: boolean; guest: boolean; rewarded: boolean; ranked: boolean; spectator: boolean; onShare?: () => void; sharing?: boolean }) {
  const standings = snap.finished?.standings ?? v.ranking;
  const won = standings[0] === me;
  const abandon = (snap.finished as { abandon?: string | null } | null)?.abandon;
  const reward = (snap.finished?.reward ?? null) as Record<string, unknown> | null;
  const num = (k: string) => (reward && typeof reward[k] === 'number' ? (reward[k] as number) : null);
  const capsules = num('capsules');
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
          {points !== null && <span className="cf-gain"><b>{points > 0 ? `+${points}` : points}</b> <small>points de ligue</small></span>}
          {boosters ? <span className="cf-gain"><b>+{boosters}</b> <small>booster{boosters > 1 ? 's' : ''}{won ? ' (première victoire du jour)' : ''}</small></span> : null}
          {missions > 0 && <span className="cf-gain"><b>✓ {missions}</b> <small>mission{missions > 1 ? 's' : ''} du jour</small></span>}
          {note && <small className="cf-gain-note">{note}</small>}
          {error && <small className="cf-gain-note">{error}</small>}
          {!reward && rewarded && !spectator && <small className="cf-gain-note">Calcul des gains…</small>}
          {!reward && !rewarded && bot && <small className="cf-gain-note">{guest ? 'Partie d’essai : aucun gain.' : 'Partie d’entraînement : pas de capsules cette fois.'}</small>}
        </div>
        {guest && bot && <button className="cf-link" onClick={onAccount}>Créer un compte gratuit pour gagner des capsules</button>}
        {onShare && <button className="cf-btn violet" disabled={sharing} onClick={onShare}><Icon name="share" size={18} />Partager mon plus beau coup</button>}
        <div className="cf-modal-btns">
          <button className="cf-btn ghost" onClick={onExit}>Menu du mode</button>
          {onAgain && <button className="cf-btn gold" onClick={onAgain}>{againLabel ?? 'Rejouer'}</button>}
        </div>
      </div>
    </div>
  );
}
