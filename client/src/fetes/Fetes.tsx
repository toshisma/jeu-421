/**
 * Saint-Nicolas et fêtes de fin d'année, côté écran : bandeau de l'accueil (annonce, compte à rebours,
 * case du jour), feuille des fêtes (calendrier de l'avent, défis d'événement, adversaire spécial),
 * carte de l'adversaire spécial (menu du 421) et libellés de fin de partie. Logique : shared/progress/fetes.ts.
 */
import { useState } from 'react';
import './fetes.css';
import type { MessageKey } from '../../../shared/i18n';
import type { Profile } from '../../../shared/progress/profile';
import { getItem } from '../../../shared/progress/catalog';
import { today } from '../../../shared/progress/quests';
import {
  ADVENT_LAST, FETE_BOSS_COINS, FETE_CHALLENGES, FETE_DIE, adventCell, adventDay, adventReward, challengeProgress,
  feteBoss, feteMoment, feteOf, feteState, type FeteBoss, type FeteMoment,
} from '../../../shared/progress/fetes';
import type { ProfileApi } from '../account/useProfile';
import { sound } from '../audio/sound';
import { shortDateL, titleL } from '../i18n/data';
import { tr, useLang } from '../i18n/lang';
import { DieCube } from '../ui/DiceCollection';
import { Sheet } from '../ui/kit';
import { feteAvatar } from './personas';

const k = (s: string) => s as MessageKey;
const plural = (base: string, n: number) => tr(k(`${base}.${n === 1 ? 'one' : 'many'}`), { n });

/** Titre du moment (« Saint-Nicolas passe dans 3 jours », « Joyeux Noël ! »…). */
export function momentTitle(m: FeteMoment): string {
  return 'n' in m ? plural(`fet.m.${m.kind}`, m.n) : tr(k(`fet.m.${m.kind}`));
}
const momentIcon = (m: FeteMoment) =>
  m.kind.startsWith('sn') ? '🍊' : m.kind === 'advent' ? '🎁' : m.kind.startsWith('ny') ? '🥂' : m.kind === 'fe-soon' ? '❄️' : '🎄';

/** Le bandeau des fêtes est-il à montrer ? 'box' : la case du jour attend (prioritaire), 'show' : annonce ou événement. */
export function fetesBannerDue(p: Profile, day = today()): 'box' | 'show' | null {
  const m = feteMoment(day);
  const d = adventDay(day);
  if (d && adventCell(p, day, d) === 'today') return 'box';
  return m ? 'show' : null;
}

/** Bandeau de l'accueil : un toucher ouvre la feuille des fêtes. */
export function FetesBanner({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  useLang();
  const day = today();
  const m = feteMoment(day);
  const box = fetesBannerDue(profile, day) === 'box';
  if (!m && !box) return null;
  const f = feteOf(day);
  const title = m ? momentTitle(m) : tr('fet.m.advent');
  const sub = box ? tr('fet.sub.box') : f ? tr('fet.sub.event') : m && (m.kind === 'sn-soon' || m.kind === 'fe-soon') ? tr('fet.sub.soon') : tr('fet.sub.boxDone');
  const tone = f?.id === 'fetes' || m?.kind === 'fe-soon' ? 'fe' : 'sn';
  return (
    <button className={`home-banner fet-banner ${tone}${box ? ' box' : ''}`} onClick={onOpen}>
      <i className="fet-banner-ico" aria-hidden>{box ? '🎁' : m ? momentIcon(m) : '🎁'}</i>
      <span><b>{title}</b><small>{sub}</small></span>
      <em>{box ? tr('fet.open') : tr('fet.see')}</em>
    </button>
  );
}

/** Feuille des fêtes : calendrier de l'avent, défis d'événement, adversaire spécial, boutique. */
export function FetesSheet({ pa, onClose, onShop, onBoss }: { pa: ProfileApi; onClose: () => void; onShop?: () => void; onBoss?: () => void }) {
  useLang();
  const day = today();
  const f = feteOf(day);
  const m = feteMoment(day);
  const title = f?.id === 'saint-nicolas' || m?.kind === 'sn-soon' ? tr('fet.title.sn') : f || m?.kind === 'fe-soon' ? tr('fet.title.fe') : tr('fet.title.advent');
  const boss = feteBoss(day);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="fet-sheet">
        {m && <p className="fet-lead"><span aria-hidden>{momentIcon(m)}</span> <b>{momentTitle(m)}</b>
          {m.kind === 'sn-soon' && <small>{tr('fet.when.sn')} · {tr('fet.sub.soon')}</small>}
          {m.kind === 'fe-soon' && <small>{tr('fet.when.fe')} · {tr('fet.sub.soon')}</small>}
        </p>}
        <Advent pa={pa} />
        {boss && <FeteBossCard pa={pa} boss={boss} onPlay={onBoss ? () => { onClose(); onBoss(); } : undefined} />}
        {f && <Challenges profile={pa.profile} />}
        {f && onShop && <button className="btn secondary wide" onClick={() => { onClose(); onShop(); }}>{tr('fet.shop')}</button>}
      </div>
    </Sheet>
  );
}

function Advent({ pa }: { pa: ProfileApi }) {
  const day = today();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [popped, setPopped] = useState<number | null>(null);
  const month = day.slice(5, 7);
  if (month !== '12') return month === '11' ? <section className="fet-sec"><h3>{tr('fet.title.advent')}</h3><p className="fet-note">{tr('fet.advent.notYet')}</p></section> : null;
  if (!adventDay(day)) return <section className="fet-sec"><h3>{tr('fet.title.advent')}</h3><p className="fet-note">{tr('fet.advent.over')}</p></section>;
  const open = async (d: number) => {
    if (busy) return;
    setBusy(true); sound.unlock(); sound.rattle();
    const err = await pa.openAdventBox();
    setBusy(false);
    if (err) { setMsg(err); return; }
    const r = adventReward(d);
    setPopped(d);
    if (r.bag) sound.treasure(); else sound.chips(3);
    setMsg(r.bag ? tr('fet.advent.gotBag', { n: r.coins }) : tr('fet.advent.got', { n: r.coins }));
  };
  return (
    <section className="fet-sec">
      <h3>{tr('fet.title.advent')}</h3>
      <p className="fet-note">{tr('fet.advent.hint')}</p>
      <ol className="fet-advent" aria-label={tr('fet.title.advent')}>
        {Array.from({ length: ADVENT_LAST }, (_, i) => i + 1).map((d) => {
          const st = adventCell(pa.profile, day, d);
          const r = adventReward(d);
          const label = `${tr('fet.advent.day', { d })} · ${st === 'today' ? tr('fet.open') : tr(k(`fet.advent.${st === 'open' ? 'done' : st}`))}`;
          return (
            <li key={d}>
              <button className={`fet-cell ${st}${r.bag ? ' big' : ''}${popped === d ? ' pop' : ''}`} disabled={st !== 'today' || busy} onClick={() => open(d)} aria-label={label} title={label}>
                <b>{d}</b>
                {st === 'open' ? <i aria-hidden>{r.bag ? '🎒' : '✓'}</i> : st === 'today' ? <i aria-hidden>🎁</i> : r.bag && st === 'later' ? <i aria-hidden>✨</i> : null}
              </button>
            </li>
          );
        })}
      </ol>
      {msg && <p className="fet-msg" role="status">{msg}</p>}
    </section>
  );
}

function Challenges({ profile }: { profile: Profile }) {
  const day = today();
  const f = feteOf(day);
  const st = feteState(profile, day);
  if (!f || !st) return null;
  const die = FETE_DIE[f.id];
  const dieName = getItem(die)?.name ?? '';
  const won = profile.owned.includes(die);
  return (
    <section className="fet-sec">
      <h3>{tr('fet.ch.title')}</h3>
      <div className="fet-die">
        <DieCube id={die} size={40} spin={won} />
        <p className="fet-note">{won ? <b>{tr('fet.ch.dieWon', { die: dieName })}</b> : tr('fet.ch.hint', { date: shortDateL(f.end).replace(/\.$/, ''), die: dieName })}<br /><small>{tr('fet.games')}</small></p>
      </div>
      <ul className="fet-ch">
        {FETE_CHALLENGES[f.id].map((c) => {
          const n = challengeProgress(st, c);
          const done = st.done.includes(c.id);
          return (
            <li key={c.id} className={done ? 'done' : ''}>
              <span><b>{tr(k(`fet.c.${c.id}`))}</b><span className="tile-bar"><i style={{ width: `${(100 * n) / c.target}%` }} /></span></span>
              <em>{done ? `✓ ${tr('fet.ch.done')}` : `${n}/${c.target} · ${tr('fet.ch.coins', { n: c.coins })}`}</em>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Carte de l'adversaire spécial (feuille des fêtes, menu du 421). */
export function FeteBossCard({ pa, boss, onPlay }: { pa: ProfileApi; boss: FeteBoss; onPlay?: () => void }) {
  useLang();
  const st = feteState(pa.profile, today());
  const beaten = !!st?.boss;
  const id = boss.def.id;
  const withWho = boss.cast.length > 1 ? tr(k(`fet.boss.${id}.with`)) : '';
  return (
    <section className="boss-card fet-boss">
      <span className="boss-face" aria-hidden>{boss.cast.map((c) => <i key={c}>{feteAvatar(c)}</i>)}</span>
      <div>
        <small>{tr('fet.boss.label')}</small>
        <b>{tr(k(`fet.boss.${id}`))}{withWho ? ` ${withWho}` : ''}</b>
        <span>{tr(k(`fet.boss.${id}.t`))}</span>
        <q className="fet-quote">{tr(k(`fet.boss.${id}.q`))}</q>
        <span className="boss-prize">{beaten ? tr('fet.boss.beaten') : tr('fet.boss.prize', { n: FETE_BOSS_COINS, title: titleL(boss.title) ?? '', acc: getItem(boss.accessory)?.name ?? '' })}</span>
        {!onPlay && <small>{tr('fet.boss.only421')}</small>}
      </div>
      {onPlay && <button className={`btn ${beaten ? '' : 'primary'}`} onClick={onPlay}>{tr('fet.boss.play')}</button>}
    </section>
  );
}

/** Libellé d'une ligne de fin de partie venant des fêtes (sinon null : libellé d'origine). */
export function trFeteDone(x: { id: string; name: string }): string | null {
  if (!x.id.startsWith('fet-')) return null;
  const id = x.id.slice(4);
  if (id.startsWith('die-')) { const f = id.slice(4) as keyof typeof FETE_DIE; return tr('fet.done.die', { die: getItem(FETE_DIE[f])?.name ?? '' }); }
  if (id.startsWith('boss-')) { const b = id.slice(5) === 'fetes' ? 'ev-noel' : 'ev-saint-nicolas'; return tr('fet.done.boss', { name: tr(k(`fet.boss.${b}`)) }); }
  return tr('fet.done.challenge', { text: tr(k(`fet.c.${id}`)) });
}
