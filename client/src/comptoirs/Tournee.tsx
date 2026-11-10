/**
 * Tournée des comptoirs : carte des quartiers (bistrots à battre, étoiles, réputation), fiche d'un bistrot
 * (patron, règles maison, étoiles à gagner) et bilan des étoiles en fin de partie.
 * Données et règles : shared/progress/comptoirs.ts. Textes : clés `tdc.`.
 */
import { useState } from 'react';
import { DEFAULT_CONFIG, type GameConfig } from '../../../shared/config';
import {
  TDC_BISTROS, TDC_MAX_STARS, TDC_QUARTERS, TDC_STAR_COINS, bistroUnlocked, bistrosOf, quarterDone, quarterUnlocked, reputation, starCount, tdcConfig, tdcQuarter, tdcTitleFr,
  type TdcBistro, type TdcProgress, type TdcStar,
} from '../../../shared/progress/comptoirs';
import { getItem } from '../../../shared/progress/catalog';
import type { MessageKey } from '../../../shared/i18n';
import type { ProfileApi } from '../account/useProfile';
import { tr, trServer } from '../i18n/lang';
import { botName } from '../i18n/g421';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/kit';
import { ModeBar, ModeChip } from '../ui/ModeBar';
import { tdcPersona } from './controller';

const k = (s: string) => s as MessageKey;
export const bistroName = (id: string) => tr(k(`tdc.b.${id}`));
export const quarterName = (id: string) => tr(k(`tdc.q.${id}`));

/** Couleurs d'un bistrot (enseigne, tapis, rebord) tirées de son ambiance 3D. */
export function bistroColors(b: TdcBistro) {
  const decor = getItem(b.look.decor) as { accent?: string } | undefined;
  const felt = getItem(b.look.felt) as { color?: string } | undefined;
  const rim = getItem(b.look.rim) as { base?: string } | undefined;
  return { accent: decor?.accent ?? '#e0b15a', felt: felt?.color ?? '#174a30', rim: rim?.base ?? '#8a5a2e' };
}

/** Règles maison expliquées simplement (écart aux règles habituelles du 421). */
export function houseRules(c: GameConfig): string[] {
  const d = DEFAULT_CONFIG;
  const out: string[] = [];
  if (c.variant === 'decharge') out.push(tr('tdc.rule.decharge', { n: c.startTokens }));
  else if (c.variant === 'manches') out.push(tr('tdc.rule.manches', { n: c.rounds }));
  else if (c.totalTokens !== d.totalTokens) out.push(tr('tdc.rule.pot', { n: c.totalTokens }));
  if (c.maxThrows !== d.maxThrows) out.push(tr('tdc.rule.throws', { n: c.maxThrows }));
  if (c.variant === 'classique' && c.chargeThrows !== d.chargeThrows) out.push(tr('tdc.rule.charge', { n: c.chargeThrows }));
  if (c.values.v421 !== d.values.v421) out.push(tr('tdc.rule.v421', { n: c.values.v421 }));
  if (c.values.v111 !== d.values.v111) out.push(tr('tdc.rule.v111', { n: c.values.v111 }));
  if (c.values.suite !== d.values.suite) out.push(tr('tdc.rule.suite', { n: c.values.suite }));
  if (c.fewerThrowsWins) out.push(tr('tdc.rule.fewer'));
  if (c.direction === 'antihoraire') out.push(tr('tdc.rule.anti'));
  if (c.tieRule === 'premierPerd') out.push(tr('tdc.rule.firstLoses'));
  if (c.turnSeconds !== d.turnSeconds) out.push(tr('tdc.rule.time', { n: c.turnSeconds }));
  if (!out.length) out.push(tr('tdc.rule.none'));
  return out;
}

export function starText(s: TdcStar | 'win'): string {
  if (s === 'win') return tr('tdc.star.win');
  if (s.k === 'lost') return tr('tdc.star.lost', { n: s.n });
  if (s.k === 'fast') return tr('tdc.star.fast', { n: s.min });
  return tr(k(`tdc.star.${s.k}`));
}

/** Rangée de trois étoiles (masque), les nouvelles brillent. */
export function Stars({ mask, fresh = 0, size }: { mask: number; fresh?: number; size?: number }) {
  return (
    <span className="tdc-stars" style={size ? { fontSize: size } : undefined} aria-label={tr('tdc.starsAria', { n: starCount(mask) })}>
      {[0, 1, 2].map((i) => <i key={i} className={`${mask & (1 << i) ? 'on' : ''}${fresh & (1 << i) ? ' new' : ''}`} style={{ animationDelay: `${0.25 + i * 0.35}s` }} aria-hidden>★</i>)}
    </span>
  );
}

/** Façade d'un bistrot sur la carte. */
function Storefront({ b, mask, open, onOpen }: { b: TdcBistro; mask: number; open: boolean; onOpen: () => void }) {
  const col = bistroColors(b);
  const patron = tdcPersona(b.patron);
  return (
    <button className={`tdc-shop${open ? '' : ' locked'}${mask & 1 ? ' won' : ''}`} onClick={onOpen} style={{ ['--acc' as string]: col.accent, ['--felt' as string]: col.felt }}>
      <span className="tdc-awning" aria-hidden />
      <span className="tdc-shop-face" aria-hidden>{open ? patron.avatar : <Icon name="lock" size={22} />}</span>
      <b className="tdc-shop-name">{bistroName(b.id)}</b>
      {open ? <Stars mask={mask} /> : <small className="tdc-shop-lock">{tr('tdc.locked')}</small>}
    </button>
  );
}

export function TourneeScreen({ pa, onBack, onPlay }: { pa: ProfileApi; onBack: () => void; onPlay: (b: TdcBistro) => void }) {
  const prog: TdcProgress = pa.profile.tdc ?? {};
  const rep = reputation(prog);
  const [open, setOpen] = useState<TdcBistro | null>(null);
  const done = TDC_BISTROS.filter((b) => (prog[b.id] ?? 0) & 1).length;
  return (
    <div className="home2 v2 tdc-screen">
      <ModeBar tone="classique" title={tr('tdc.title')} onBack={onBack}>
        <ModeChip label={tr('tdc.repAria', { n: rep })}><span className="tdc-star-ic" aria-hidden>★</span>{rep}<small className="tdc-chip-max">/{TDC_MAX_STARS}</small></ModeChip>
      </ModeBar>
      <main className="tdc-main">
        <header className="tdc-head">
          <h1>{tr('tdc.title')}</h1>
          <p>{tr('tdc.sub')}</p>
          <div className="tdc-rep">
            <span className="tdc-rep-n"><span aria-hidden>★</span> {rep}</span>
            <span className="tdc-rep-text"><b>{tr('tdc.rep')}</b><small>{tr('tdc.repSub', { b: done, t: TDC_BISTROS.length })}</small></span>
            <span className="tile-bar"><i style={{ width: `${(100 * rep) / TDC_MAX_STARS}%` }} /></span>
          </div>
          {!pa.isAccount && <p className="tdc-guest">{tr('tdc.guestNote')}</p>}
        </header>
        {TDC_QUARTERS.map((q, qi) => {
          const qOpen = quarterUnlocked(prog, q.id);
          const qDone = quarterDone(prog, q.id);
          const qStars = bistrosOf(q.id).reduce((n, b) => n + starCount(prog[b.id] ?? 0), 0);
          const prize = [q.title ? tr('tdc.prizeTitle', { t: trServer(tdcTitleFr(q.id) ?? '') }) : null, q.felt ? tr('tdc.prizeFelt', { t: getItem(q.felt)?.name ?? '' }) : null].filter(Boolean).join(' + ');
          return (
            <section key={q.id} className={`tdc-quarter${qOpen ? '' : ' locked'}${qDone ? ' done' : ''}`} style={{ ['--q' as string]: q.color }} aria-label={quarterName(q.id)}>
              <header className="tdc-q-head">
                <span className="tdc-q-num" aria-hidden>{qi + 1}</span>
                <span className="tdc-q-text"><b>{quarterName(q.id)}</b><small>{qOpen ? tr(k(`tdc.q.${q.id}.d`)) : tr('tdc.needRep', { n: q.need })}</small></span>
                <span className="tdc-q-stars">{qOpen ? <>{qStars}<small>/9</small> ★</> : <Icon name="lock" size={18} />}</span>
              </header>
              <div className="tdc-street">
                {bistrosOf(q.id).map((b) => <Storefront key={b.id} b={b} mask={prog[b.id] ?? 0} open={bistroUnlocked(prog, b.id)} onOpen={() => setOpen(b)} />)}
              </div>
              <p className={`tdc-prize${qDone ? ' got' : ''}`}>{qDone ? <Icon name="check" size={14} /> : <Icon name="gift" size={14} />} {qDone ? tr('tdc.prizeGot', { p: prize }) : tr('tdc.prize', { p: prize })}</p>
            </section>
          );
        })}
        <p className="tdc-foot muted small">{tr('tdc.foot', { n: TDC_STAR_COINS })}</p>
      </main>
      {open && <BistroSheet b={open} prog={prog} onClose={() => setOpen(null)} onPlay={() => { const b = open; setOpen(null); onPlay(b); }} />}
    </div>
  );
}

function BistroSheet({ b, prog, onClose, onPlay }: { b: TdcBistro; prog: TdcProgress; onClose: () => void; onPlay: () => void }) {
  const mask = prog[b.id] ?? 0;
  const open = bistroUnlocked(prog, b.id);
  const col = bistroColors(b);
  const patron = tdcPersona(b.patron);
  const list = bistrosOf(b.quarter);
  const prev = list[list.indexOf(b) - 1];
  const why = open ? null : !quarterUnlocked(prog, b.quarter) ? tr('tdc.needRep', { n: tdcQuarter(b.quarter).need }) : prev ? tr('tdc.needPrev', { name: bistroName(prev.id) }) : null;
  const stars: (TdcStar | 'win')[] = ['win', ...b.stars];
  return (
    <Sheet title={bistroName(b.id)} onClose={onClose}>
      <div className="tdc-fiche" style={{ ['--acc' as string]: col.accent, ['--felt' as string]: col.felt, ['--rim' as string]: col.rim }}>
        <div className="tdc-fiche-top">
          <span className="tdc-fiche-table" aria-hidden><span>{patron.avatar}</span></span>
          <div>
            <p className="tdc-fiche-q">{quarterName(b.quarter)}</p>
            <p className="tdc-fiche-patron"><b>{patron.name}</b> · {patron.tagline}</p>
            <p className="tdc-fiche-amb">{tr(k(`tdc.b.${b.id}.d`))}</p>
          </div>
        </div>
        <h3>{tr('tdc.houseRules')}</h3>
        <ul className="tdc-rules">{houseRules(tdcConfig(b)).map((r) => <li key={r}>{r}</li>)}</ul>
        <h3>{tr('tdc.atTable')}</h3>
        <ul className="tdc-opps">
          {b.opponents.map((o, i) => { const p = tdcPersona(o.persona); return <li key={i}><span aria-hidden>{p.avatar}</span><b>{botName(p.name)}</b><small>{tr(k(`g421.ai.${o.difficulty}`))}</small></li>; })}
        </ul>
        <h3>{tr('tdc.stars')}</h3>
        <ul className="tdc-goals">
          {stars.map((s, i) => <li key={i} className={mask & (1 << i) ? 'got' : ''}><span className="tdc-goal-star" aria-hidden>★</span>{starText(s)}{mask & (1 << i) ? <Icon name="check" size={16} /> : null}</li>)}
        </ul>
        {why ? <p className="tdc-why"><Icon name="lock" size={16} /> {why}</p>
          : <button className="btn primary wide tdc-sit" onClick={onPlay}><Icon name="dice" size={20} /> {tr(mask & 1 ? 'tdc.sitAgain' : 'tdc.sit')}</button>}
      </div>
    </Sheet>
  );
}

/** Bilan des étoiles d'une partie (écran de fin) : `before` = progression au début de la partie. */
export function TdcEndPanel({ b, before, now, pending }: { b: TdcBistro; before: TdcProgress; now: TdcProgress; pending: boolean }) {
  const was = before[b.id] ?? 0, is = now[b.id] ?? 0;
  const fresh = is & ~was;
  const n = starCount(fresh);
  const q = tdcQuarter(b.quarter);
  const quarterJust = !quarterDone(before, q.id) && quarterDone(now, q.id);
  const next = TDC_BISTROS.find((x) => !bistroUnlocked(before, x.id) && bistroUnlocked(now, x.id));
  return (
    <div className="tdc-end" role="status">
      <p className="tdc-end-name">{bistroName(b.id)}</p>
      <Stars mask={is} fresh={fresh} size={30} />
      <p className={`tdc-end-msg${n ? ' ok' : ''}`}>{pending ? tr('tdc.end.pending') : n ? `${tr(n > 1 ? 'tdc.end.newN' : 'tdc.end.new1', { n })} +${n * TDC_STAR_COINS} ${tr('tdc.end.coins')}` : tr('tdc.end.none')}</p>
      {quarterJust && <p className="tdc-end-q">🏆 {tr('tdc.end.quarter', { q: quarterName(q.id) })}</p>}
      {next && <p className="tdc-end-next">🔓 {tr('tdc.end.next', { name: bistroName(next.id) })}</p>}
    </div>
  );
}
