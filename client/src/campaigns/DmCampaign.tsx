/**
 * La Route des Auberges (campagne solo du Courtisan) : carte de la route (chapitres, auberges, étoiles),
 * fiche d'une auberge (aubergiste, règles de la maison, étoiles à gagner), entrée du menu du mode et bilan
 * des étoiles en fin de partie. Données et règles : shared/campaigns/dm.ts. Textes : clés `cdm.`.
 * Ouvert par l'écran App `camp-dm` (ou depuis le menu du Courtisan) : la partie elle-même est jouée par
 * DixMilleGame (client/src/dixmille/DixMille.tsx) avec la table imposée de l'étape.
 */
import { useState } from 'react';
import './dm-campaign.css';
import {
  CDM_CHAPTERS, CDM_CHAPTER_GROSCHEN, CDM_MAX_STARS, CDM_STAGES, CDM_STAR_COINS, campaignSummary, cdmChapter, cdmFolk, cdmStage, cdmStarCount, cdmStars,
  cdmTitleFr, chapterDone, chapterUnlocked, stageUnlocked, stagesOf, type CdmProgress, type CdmResult, type CdmStage, type CdmStar,
} from '../../../shared/campaigns/dm';
import { getItem } from '../../../shared/progress/catalog';
import type { Profile } from '../../../shared/progress/profile';
import type { MessageKey } from '../../../shared/i18n';
import type { ProfileApi } from '../account/useProfile';
import type { Persona } from '../game/personas';
import { fmtNum, tr, trServer } from '../i18n/lang';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/kit';
import { ModeBar, ModeChip } from '../ui/ModeBar';
import { DieCube } from '../ui/DiceCollection';

const k = (s: string) => s as MessageKey;
export const stageName = (id: string) => tr(k(`cdm.s.${id}`));
export const chapterName = (id: string) => tr(k(`cdm.c.${id}`));
const folkName = (id: string) => tr(k(`cdm.p.${id}.name`));

/** Personnage d'un joueur de la route (nom et phrases dans la langue du joueur). */
export function cdmPersona(id: string): Persona {
  const f = cdmFolk(id);
  const t = (s: string) => tr(k(`cdm.p.${id}.${s}`));
  return {
    id, name: f ? folkName(id) : id, avatar: f?.avatar ?? '🎲', color: f?.color ?? '#8a6d2a', tempo: f?.tempo ?? 1100, style: { caution: 0 }, dice: f?.dice,
    tagline: tr(k(`cdm.p.${id}`)), lines: { big: [t('good')], good: [t('good')], bad: [t('bad')], think: ['…'] },
  };
}

/** Ambiance de la table d'une étape (tapis, rebord, décor) : couleurs pour la carte et la fiche. */
function stageColors(st: CdmStage) {
  const decor = getItem(st.look.decor) as { accent?: string } | undefined;
  const felt = getItem(st.look.felt) as { color?: string } | undefined;
  const rim = getItem(st.look.rim) as { base?: string } | undefined;
  return { accent: decor?.accent ?? '#e0b15a', felt: felt?.color ?? '#174a30', rim: rim?.base ?? '#8a5a2e' };
}

/** Règles de la maison expliquées simplement. */
export function cdmRules(st: CdmStage): string[] {
  const out = [tr('cdm.rule.target', { n: fmtNum(st.target) })];
  if (st.entry) out.push(tr('cdm.rule.entry', { n: fmtNum(st.entry) }));
  out.push(st.opponents.length > 1 ? tr('cdm.rule.oppN', { n: st.opponents.length }) : tr('cdm.rule.opp1'));
  out.push(tr('cdm.rule.noStake'));
  return out;
}

export function cdmStarText(s: CdmStar | 'win'): string {
  if (s === 'win') return tr('cdm.star.win');
  switch (s.k) {
    case 'misses': return s.n === 0 ? tr('cdm.star.misses0') : tr('cdm.star.misses', { n: s.n });
    case 'turn': return tr('cdm.star.turn', { n: fmtNum(s.n) });
    case 'turns': return tr('cdm.star.turns', { n: s.n });
    case 'hot': return tr('cdm.star.hot');
    case 'shut': return tr('cdm.star.shut', { n: fmtNum(s.n) });
  }
}

/** Rangée de trois étoiles (masque), les nouvelles brillent. */
export function CdmStars({ mask, fresh = 0, size }: { mask: number; fresh?: number; size?: number }) {
  return (
    <span className="cdm-stars" style={size ? { fontSize: size } : undefined} aria-label={tr('cdm.starsAria', { n: cdmStarCount(mask) })}>
      {[0, 1, 2].map((i) => <i key={i} className={`${mask & (1 << i) ? 'on' : ''}${fresh & (1 << i) ? ' new' : ''}`} style={{ animationDelay: `${0.25 + i * 0.35}s` }} aria-hidden>★</i>)}
    </span>
  );
}

/** Entrée du menu du Courtisan : grand bouton, au-dessus de « Contre l'ordinateur ». */
export function CdmMenuCard({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  const sum = campaignSummary(profile);
  return (
    <button className="cdm-entry" onClick={onOpen}>
      <span className="cdm-entry-sign" aria-hidden><span className="cdm-entry-chain" /><span className="cdm-entry-board">🏰</span></span>
      <span className="cdm-entry-text">
        <b>{tr('cdm.title')}</b>
        <small>{sum.stars === 0 ? tr('cdm.menuSub', { n: CDM_MAX_STARS }) : sum.done && !sum.next ? tr('cdm.menuDone') : tr('cdm.menuNext', { n: sum.stars, name: sum.next ? stageName(sum.next.id) : '' })}</small>
      </span>
      {sum.stars ? <em className="cdm-entry-n"><span aria-hidden>★</span>{sum.stars}<small>/{CDM_MAX_STARS}</small></em> : <em className="cdm-entry-new">{tr('cdm.menuNew')}</em>}
    </button>
  );
}

/** Enseigne d'une auberge sur la route. */
function Signboard({ st, mask, open, side, next, onOpen }: { st: CdmStage; mask: number; open: boolean; side: 'l' | 'r'; next: boolean; onOpen: () => void }) {
  const col = stageColors(st);
  const host = cdmPersona(st.host);
  return (
    <li className={`cdm-stop ${side}`}>
      <span className="cdm-milestone" aria-hidden>{mask & 1 ? '✓' : open ? '•' : ''}</span>
      <button className={`cdm-sign${open ? '' : ' locked'}${mask & 1 ? ' won' : ''}${next ? ' next' : ''}`} onClick={onOpen} style={{ ['--acc' as string]: col.accent, ['--felt' as string]: col.felt, ['--rim' as string]: col.rim }}>
        <span className="cdm-sign-face" aria-hidden>{open ? host.avatar : <Icon name="lock" size={20} />}</span>
        <span className="cdm-sign-text">
          <b>{stageName(st.id)}</b>
          <small>{open ? `${fmtNum(st.target)} · ${st.opponents.length > 1 ? tr('cdm.rule.oppN', { n: st.opponents.length }).replace(/\.$/, '') : host.name}` : tr('cdm.locked')}</small>
        </span>
        {open && <CdmStars mask={mask} />}
      </button>
    </li>
  );
}

export function DmCampaign({ pa, onBack, onPlay }: { pa: ProfileApi; onBack: () => void; onPlay: (st: CdmStage) => void }) {
  const prog: CdmProgress = pa.profile.campDm ?? {};
  const stars = cdmStars(prog);
  const [open, setOpen] = useState<CdmStage | null>(null);
  const won = CDM_STAGES.filter((s) => (prog[s.id] ?? 0) & 1).length;
  const next = campaignSummary(pa.profile).next?.id;
  return (
    <div className="home2 v2 cdm-screen">
      <ModeBar tone="dixmille" title={tr('cdm.title')} onBack={onBack}>
        <ModeChip label={tr('cdm.chipAria', { n: stars })}><span className="cdm-star-ic" aria-hidden>★</span>{stars}<small className="cdm-chip-max">/{CDM_MAX_STARS}</small></ModeChip>
      </ModeBar>
      <main className="cdm-main">
        <header className="cdm-head">
          <h1>{tr('cdm.title')}</h1>
          <p>{tr('cdm.sub')}</p>
          <div className="cdm-progress">
            <span className="cdm-progress-n"><span aria-hidden>★</span> {stars}</span>
            <small>{tr('cdm.progress', { b: won, t: CDM_STAGES.length })}</small>
            <span className="cdm-bar" aria-hidden><i style={{ width: `${(100 * stars) / CDM_MAX_STARS}%` }} /></span>
          </div>
          {!pa.isAccount && <p className="cdm-guest">{tr('cdm.guestNote')}</p>}
        </header>
        {CDM_CHAPTERS.map((c, ci) => {
          const cOpen = chapterUnlocked(prog, c.id);
          const cDone = chapterDone(prog, c.id);
          const cStars = stagesOf(c.id).reduce((n, s) => n + cdmStarCount(prog[s.id] ?? 0), 0);
          const prize = [tr('cdm.prizeTitle', { t: trServer(cdmTitleFr(c.id) ?? '') }), tr('cdm.prizeGr', { n: CDM_CHAPTER_GROSCHEN })].join(' + ');
          return (
            <section key={c.id} className={`cdm-chapter${cOpen ? '' : ' locked'}${cDone ? ' done' : ''}`} style={{ ['--c' as string]: c.color }} aria-label={chapterName(c.id)}>
              <header className="cdm-c-head">
                <span className="cdm-c-icon" aria-hidden>{c.icon}</span>
                <span className="cdm-c-text"><small>{tr('cdm.chapterN', { n: ci + 1 })}</small><b>{chapterName(c.id)}</b></span>
                <span className="cdm-c-stars">{cOpen ? <>{cStars}<small>/9</small> ★</> : <Icon name="lock" size={18} />}</span>
              </header>
              <p className="cdm-c-desc">{cOpen ? tr(k(`cdm.c.${c.id}.d`)) : tr('cdm.needStars', { n: c.need })}</p>
              <ol className="cdm-road">
                {stagesOf(c.id).map((st, i) => (
                  <Signboard key={st.id} st={st} mask={prog[st.id] ?? 0} open={stageUnlocked(prog, st.id)} side={i % 2 ? 'r' : 'l'} next={st.id === next} onOpen={() => setOpen(st)} />
                ))}
              </ol>
              <p className={`cdm-prize${cDone ? ' got' : ''}`}>{cDone ? <Icon name="check" size={14} /> : <Icon name="gift" size={14} />} {cDone ? tr('cdm.prizeGot', { p: prize }) : tr('cdm.prize', { p: prize })}</p>
            </section>
          );
        })}
        <p className="cdm-foot">{tr('cdm.foot', { n: CDM_STAR_COINS })}</p>
      </main>
      {open && <StageSheet st={open} prog={prog} onClose={() => setOpen(null)} onPlay={() => { const st = open; setOpen(null); onPlay(st); }} />}
    </div>
  );
}

function StageSheet({ st, prog, onClose, onPlay }: { st: CdmStage; prog: CdmProgress; onClose: () => void; onPlay: () => void }) {
  const mask = prog[st.id] ?? 0;
  const open = stageUnlocked(prog, st.id);
  const col = stageColors(st);
  const host = cdmPersona(st.host);
  const list = stagesOf(st.chapter);
  const prev = list[list.indexOf(st) - 1];
  const why = open ? null : !chapterUnlocked(prog, st.chapter) ? tr('cdm.needStars', { n: cdmChapter(st.chapter).need }) : prev ? tr('cdm.needPrev', { name: stageName(prev.id) }) : null;
  const stars: (CdmStar | 'win')[] = ['win', ...st.stars];
  return (
    <Sheet title={stageName(st.id)} onClose={onClose}>
      <div className="cdm-fiche" style={{ ['--acc' as string]: col.accent, ['--felt' as string]: col.felt, ['--rim' as string]: col.rim }}>
        <div className="cdm-fiche-top">
          <span className="cdm-fiche-table" aria-hidden>
            <span className="cdm-fiche-host">{host.avatar}</span>
            {host.dice && <span className="cdm-fiche-die"><DieCube id={host.dice} size={26} /></span>}
          </span>
          <div>
            <p className="cdm-fiche-c">{chapterName(st.chapter)}</p>
            <p className="cdm-fiche-host-name"><b>{host.name}</b> · {tr('cdm.host')}</p>
            <p className="cdm-fiche-amb">{tr(k(`cdm.s.${st.id}.d`))}</p>
          </div>
        </div>
        <h3>{tr('cdm.houseRules')}</h3>
        <ul className="cdm-rules">{cdmRules(st).map((r) => <li key={r}>{r}</li>)}</ul>
        <h3>{tr('cdm.atTable')}</h3>
        <ul className="cdm-opps">
          {st.opponents.map((o) => { const p = cdmPersona(o.folk); return <li key={o.folk}><span aria-hidden>{p.avatar}</span><span className="cdm-opp-t"><b>{p.name}</b><small>{p.tagline}</small></span><em>{tr(k(`dm.lv.${o.level}`))}</em></li>; })}
        </ul>
        <h3>{tr('cdm.starsToWin')}</h3>
        <ul className="cdm-goals">
          {stars.map((s, i) => <li key={i} className={mask & (1 << i) ? 'got' : ''}><span className="cdm-goal-star" aria-hidden>★</span><span>{cdmStarText(s)}</span>{mask & (1 << i) ? <Icon name="check" size={16} /> : null}</li>)}
        </ul>
        {why ? <p className="cdm-why"><Icon name="lock" size={16} /> {why}</p>
          : <button className="btn primary wide cdm-sit" onClick={onPlay}><Icon name="dice" size={20} /> {tr(mask & 1 ? 'cdm.sitAgain' : 'cdm.sit')}</button>}
      </div>
    </Sheet>
  );
}

/**
 * Bilan des étoiles d'une partie (écran de fin) : `before` = progression au début de la partie, `result` =
 * étoiles données (par le serveur pour un compte), null si la partie n'a pas pu être vérifiée.
 */
export function CdmEndPanel({ stage, before, result }: { stage: string; before: CdmProgress; result: CdmResult | null }) {
  const st = cdmStage(stage)!;
  const was = before[st.id] ?? 0;
  const is = result ? result.after : was;
  const fresh = is & ~was;
  const n = cdmStarCount(fresh);
  const now: CdmProgress = { ...before, ...(is ? { [st.id]: is } : {}) };
  const next = CDM_STAGES.find((x) => !stageUnlocked(before, x.id) && stageUnlocked(now, x.id));
  return (
    <div className="cdm-end" role="status">
      <p className="cdm-end-name">{stageName(st.id)}</p>
      <CdmStars mask={is} fresh={fresh} size={28} />
      <p className={`cdm-end-msg${n ? ' ok' : ''}`}>{!result ? tr('cdm.end.unverified') : n ? `${tr(n > 1 ? 'cdm.end.newN' : 'cdm.end.new1', { n })} ${tr('cdm.end.coins', { n: result.coins })}` : tr('cdm.end.none')}</p>
      {result?.chapter && <p className="cdm-end-c">🏆 {tr('cdm.end.chapter', { c: chapterName(result.chapter) })}</p>}
      {result?.groschen ? <p className="cdm-end-gr">{tr('cdm.end.groschen', { n: result.groschen })}</p> : null}
      {next && <p className="cdm-end-next">🔓 {tr('cdm.end.next', { name: stageName(next.id) })}</p>}
    </div>
  );
}
