/**
 * « Les Arrière-salles » : campagne solo du Poker menteur. Carte des quatre endroits (douze tables),
 * fiche d'une table (hôte, style de bluff de chacun, règles de la table, étoiles à gagner), partie
 * (le même écran que contre l'ordinateur, avec l'ambiance 3D de l'endroit) et bilan des étoiles.
 * Données et règles : shared/campaigns/pm.ts ; textes : clés `cpm.` (zone camppm).
 * Les étoiles d'un compte viennent du serveur (rejeu) ; un invité les garde sur l'appareil.
 */
import { useState } from 'react';
import {
  CPM_CHAPTERS, CPM_MAX_STARS, CPM_STAGES, CPM_STAR_COINS, chapterDone, chapterUnlocked, cpmChapter, cpmChar, cpmSetup, cpmStars, cpmTitleFr,
  stageUnlocked, stagesOf, starCount, type CpmProgress, type CpmResult, type CpmStage, type CpmStar,
} from '../../../shared/campaigns/pm';
import { PM_PERSONAS, type PmPersona } from '../../../shared/pokermenteur/personas';
import type { MessageKey } from '../../../shared/i18n';
import type { ProfileApi } from '../account/useProfile';
import type { Settings } from '../settings';
import { tr, trServer, useLang } from '../i18n/lang';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/kit';
import { ModeBar, ModeChip } from '../ui/ModeBar';
import { usePresenceLayer } from '../presence';
import { sound } from '../audio/sound';
import { PmSoloGame } from '../pokermenteur/PokerMenteur';

const k = (s: string) => s as MessageKey;
export const stageName = (id: string) => tr(k(`cpm.s.${id}`));
export const chapterName = (id: string) => tr(k(`cpm.ch.${id}`));
const short = (id: string) => id.replace(/^cpm-/, '');

/** Personnage d'une table : de la campagne (répliques `cpm.c.<id>`) ou habitué du Poker menteur. */
export function cpmPersona(id: string): PmPersona {
  const c = cpmChar(id);
  if (c) return { id: c.id, name: c.name, avatar: c.avatar, color: c.color, tempo: c.tempo, lines: `cpm.c.${short(c.id)}` };
  return PM_PERSONAS.find((p) => p.id === id) ?? PM_PERSONAS[0];
}
const tagline = (id: string) => (cpmChar(id) ? tr(k(`cpm.c.${short(id)}`)) : tr(k(`pm.p.${id}.tag`)));

export function cpmStarText(s: CpmStar | 'win'): string {
  if (s === 'win') return tr('cpm.star.win');
  return tr(k(`cpm.star.${s.k}${s.n > 1 ? 'N' : '1'}`), { n: s.n });
}

/** Rangée de trois étoiles (masque), les nouvelles brillent (styles de la Tournée des comptoirs). */
function Stars({ mask, fresh = 0, size }: { mask: number; fresh?: number; size?: number }) {
  return (
    <span className="tdc-stars" style={size ? { fontSize: size } : undefined} aria-label={tr('cpm.starsAria', { n: starCount(mask) })}>
      {[0, 1, 2].map((i) => <i key={i} className={`${mask & (1 << i) ? 'on' : ''}${fresh & (1 << i) ? ' new' : ''}`} style={{ animationDelay: `${0.25 + i * 0.35}s` }} aria-hidden>★</i>)}
    </span>
  );
}

/** Règles de la table, en mots simples. */
function tableRules(st: CpmStage): string[] {
  const n = st.opponents.length;
  return [
    tr(n > 1 ? 'cpm.rule.oppN' : 'cpm.rule.opp1', { n }),
    tr('cpm.rule.lives', { n: st.lives }),
    tr(st.noStraights ? 'cpm.rule.noStraights' : 'cpm.rule.straights'),
  ];
}

/** Une table dans la salle : petite table ronde sous sa lampe, hôte assis, étoiles. */
function TableSpot({ st, mask, open, onOpen }: { st: CpmStage; mask: number; open: boolean; onOpen: () => void }) {
  const host = cpmPersona(st.host);
  return (
    <button className={`cpm-spot${open ? '' : ' locked'}${mask & 1 ? ' won' : ''}`} onClick={onOpen}
      style={{ ['--felt' as string]: st.look.felt, ['--lamp' as string]: st.look.lamp, ['--rim' as string]: st.look.rim }}>
      <span className="cpm-lamp" aria-hidden />
      <span className="cpm-table" aria-hidden>{open ? <span className="cpm-host">{host.avatar}</span> : <Icon name="lock" size={20} />}</span>
      <b className="cpm-spot-name">{stageName(st.id)}</b>
      {open ? <Stars mask={mask} /> : <small className="cpm-spot-lock">{tr('cpm.locked')}</small>}
    </button>
  );
}

export function CpmMap({ pa, onBack, onPlay }: { pa: ProfileApi; onBack: () => void; onPlay: (st: CpmStage) => void }) {
  useLang();
  const prog: CpmProgress = pa.profile.cpm ?? {};
  const stars = cpmStars(prog);
  const [open, setOpen] = useState<CpmStage | null>(null);
  const won = CPM_STAGES.filter((s) => (prog[s.id] ?? 0) & 1).length;
  return (
    <div className="home2 v2 cpm-screen">
      <ModeBar tone="poker" title={tr('cpm.name')} onBack={onBack}>
        <ModeChip label={tr('cpm.starsTotalAria', { n: stars })}><span className="tdc-star-ic" aria-hidden>★</span>{stars}<small className="tdc-chip-max">/{CPM_MAX_STARS}</small></ModeChip>
      </ModeBar>
      <main className="cpm-main">
        <header className="cpm-head">
          <h1>{tr('cpm.name')}</h1>
          <p>{tr('cpm.sub')}</p>
          <div className="cpm-prog">
            <span className="cpm-prog-n"><span aria-hidden>★</span> {stars}</span>
            <span className="cpm-prog-text"><b>{tr('cpm.progress')}</b><small>{tr('cpm.progressSub', { b: won, t: CPM_STAGES.length })}</small></span>
            <span className="tile-bar"><i style={{ width: `${(100 * stars) / CPM_MAX_STARS}%` }} /></span>
          </div>
          {!pa.isAccount && <p className="cpm-guest">{tr('cpm.guestNote')}</p>}
        </header>
        {CPM_CHAPTERS.map((c, ci) => {
          const cOpen = chapterUnlocked(prog, c.id);
          const cDone = chapterDone(prog, c.id);
          const cStars = stagesOf(c.id).reduce((n, s) => n + starCount(prog[s.id] ?? 0), 0);
          const title = trServer(cpmTitleFr(c.id) ?? '');
          return (
            <section key={c.id} className={`cpm-chapter${cOpen ? '' : ' locked'}${cDone ? ' done' : ''}`} style={{ ['--q' as string]: c.color }} aria-label={chapterName(c.id)}>
              <header className="cpm-ch-head">
                <span className="cpm-ch-num" aria-hidden>{ci + 1}</span>
                <span className="cpm-ch-text"><b>{c.icon} {chapterName(c.id)}</b><small>{cOpen ? tr(k(`cpm.ch.${c.id}.d`)) : tr('cpm.needStars', { n: c.need })}</small></span>
                <span className="cpm-ch-stars">{cOpen ? <>{cStars}<small>/9</small> ★</> : <Icon name="lock" size={18} />}</span>
              </header>
              <div className="cpm-room">
                {stagesOf(c.id).map((s) => <TableSpot key={s.id} st={s} mask={prog[s.id] ?? 0} open={stageUnlocked(prog, s.id)} onOpen={() => setOpen(s)} />)}
              </div>
              <p className={`cpm-prize${cDone ? ' got' : ''}`}>{cDone ? <Icon name="check" size={14} /> : <Icon name="gift" size={14} />} {tr(cDone ? 'cpm.prizeGot' : 'cpm.prize', { t: title })}</p>
            </section>
          );
        })}
        <p className="cpm-foot muted small">{tr('cpm.foot', { n: CPM_STAR_COINS })}</p>
      </main>
      {open && <StageSheet st={open} prog={prog} onClose={() => setOpen(null)} onPlay={() => { const s = open; setOpen(null); onPlay(s); }} />}
    </div>
  );
}

function StageSheet({ st, prog, onClose, onPlay }: { st: CpmStage; prog: CpmProgress; onClose: () => void; onPlay: () => void }) {
  const mask = prog[st.id] ?? 0;
  const open = stageUnlocked(prog, st.id);
  const host = cpmPersona(st.host);
  const list = stagesOf(st.chapter);
  const prev = list[list.indexOf(st) - 1];
  const why = open ? null : !chapterUnlocked(prog, st.chapter) ? tr('cpm.needStars', { n: cpmChapter(st.chapter).need }) : prev ? tr('cpm.needPrev', { name: stageName(prev.id) }) : null;
  const goals: (CpmStar | 'win')[] = ['win', ...st.stars];
  return (
    <Sheet title={stageName(st.id)} onClose={onClose}>
      <div className="tdc-fiche cpm-fiche" style={{ ['--acc' as string]: st.look.lamp, ['--felt' as string]: st.look.felt, ['--rim' as string]: st.look.rim }}>
        <div className="tdc-fiche-top">
          <span className="tdc-fiche-table" aria-hidden><span>{host.avatar}</span></span>
          <div>
            <p className="tdc-fiche-q">{chapterName(st.chapter)}</p>
            <p className="tdc-fiche-patron"><b>{host.name}</b> · {tagline(st.host)}</p>
            <p className="tdc-fiche-amb">{tr(k(`cpm.s.${st.id}.d`))}</p>
          </div>
        </div>
        <h3>{tr('cpm.tableRules')}</h3>
        <ul className="tdc-rules cpm-rules">{tableRules(st).map((r) => <li key={r}>{r}</li>)}</ul>
        <h3>{tr('cpm.atTable')}</h3>
        <ul className="cpm-opps">
          {st.opponents.map((o) => {
            const p = cpmPersona(o.id);
            return (
              <li key={o.id}>
                <span className="cpm-opp-av" aria-hidden style={{ background: p.color }}>{p.avatar}</span>
                <span className="cpm-opp-t"><b>{p.name}</b><small>{tr(k(`pm.lv.${o.level}`))}{o.style ? ` · ${tr(k(`cpm.style.${o.style}`))}` : ''}</small></span>
              </li>
            );
          })}
        </ul>
        <h3>{tr('cpm.stars')}</h3>
        <ul className="tdc-goals">
          {goals.map((g, i) => <li key={i} className={mask & (1 << i) ? 'got' : ''}><span className="tdc-goal-star" aria-hidden>★</span>{cpmStarText(g)}{mask & (1 << i) ? <Icon name="check" size={16} /> : null}</li>)}
        </ul>
        {why ? <p className="tdc-why"><Icon name="lock" size={16} /> {why}</p>
          : <button className="btn primary wide tdc-sit" onClick={onPlay}><Icon name="dice" size={20} /> {tr(mask & 1 ? 'cpm.sitAgain' : 'cpm.sit')}</button>}
      </div>
    </Sheet>
  );
}

/** Bilan des étoiles d'une partie (dans la fenêtre de fin). `before` : progression au début de la partie. */
export function CpmEndPanel({ st, before, result, isAccount }: { st: CpmStage; before: CpmProgress; result: CpmResult | null; isAccount: boolean }) {
  const was = before[st.id] ?? 0;
  const is = result ? result.after : was;
  const fresh = is & ~was;
  const n = starCount(fresh);
  const after: CpmProgress = { ...before, ...(is ? { [st.id]: is } : {}) };
  const next = CPM_STAGES.find((x) => !stageUnlocked(before, x.id) && stageUnlocked(after, x.id));
  return (
    <div className="tdc-end cpm-end" role="status">
      <p className="tdc-end-name">{stageName(st.id)}</p>
      <Stars mask={is} fresh={fresh} size={28} />
      <p className={`tdc-end-msg${n ? ' ok' : ''}`}>{n ? `${tr(n > 1 ? 'cpm.end.newN' : 'cpm.end.new1', { n })} +${n * CPM_STAR_COINS} ${tr('cpm.end.coins')}` : result || !isAccount ? tr('cpm.end.none') : tr('cpm.end.unverified')}</p>
      {result?.title && <p className="tdc-end-q">🏆 {tr('cpm.end.chapter', { t: trServer(cpmTitleFr(result.chapter ?? '') ?? '') })}</p>}
      {next && <p className="tdc-end-next">🔓 {tr('cpm.end.next', { name: stageName(next.id) })}</p>}
    </div>
  );
}

/**
 * Écran complet de la campagne (carte + parties) : ouvert depuis le menu du Poker menteur ou par l'écran
 * `camp-pm` de l'application.
 */
export function PmCampaign({ pa, settings, me, onBack, onBags }: {
  pa: ProfileApi; settings: Settings; me: { name: string; avatar: string; photo: string | null }; onBack: () => void; onBags?: () => void;
}) {
  useLang();
  const [play, setPlay] = useState<{ st: CpmStage; key: number; before: CpmProgress } | null>(null);
  usePresenceLayer(play ? null : { view: 'campagne', state: 'menu', depth: 1 });
  if (play) {
    const st = play.st;
    const opponents = st.opponents.map((o) => cpmPersona(o.id));
    const table = cpmSetup(st, 0);
    return (
      <PmSoloGame key={play.key} pa={pa} settings={settings} me={me} onBags={onBags}
        setup={{ opponents: opponents.length, level: table.level, lives: st.lives, noStraights: st.noStraights }} opponents={opponents}
        onExit={() => setPlay(null)}
        onReplay={() => setPlay({ st, key: play.key + 1, before: pa.profile.cpm ?? {} })}
        camp={{
          id: st.id, setup: (start) => cpmSetup(st, start), look: st.look, backLabel: tr('cpm.backMap'),
          panel: ({ result }) => <CpmEndPanel st={st} before={play.before} result={result} isAccount={pa.isAccount} />,
        }} />
    );
  }
  return <CpmMap pa={pa} onBack={onBack} onPlay={(st) => { sound.unlock(); setPlay({ st, key: Date.now(), before: pa.profile.cpm ?? {} }); }} />;
}

/** Bouton d'entrée dans le menu du Poker menteur (au-dessus de « Contre l'ordinateur »). */
export function CpmMenuCard({ pa, onOpen }: { pa: ProfileApi; onOpen: () => void }) {
  const prog = pa.profile.cpm;
  const stars = cpmStars(prog);
  const next = CPM_STAGES.find((s) => stageUnlocked(prog, s.id) && !((prog?.[s.id] ?? 0) & 1));
  return (
    <button className="cpm-entry" onClick={onOpen}>
      <span className="cpm-entry-art" aria-hidden><span className="cpm-entry-lamp" /><span className="cpm-entry-door">🕯️</span></span>
      <span className="cpm-entry-text">
        <b>{tr('cpm.name')}</b>
        <small>{next ? tr('cpm.menuNext', { name: stageName(next.id) }) : tr('cpm.menuDone')}</small>
      </span>
      {stars ? <em className="cpm-entry-n"><span aria-hidden>★</span>{stars}<small>/{CPM_MAX_STARS}</small></em> : <em className="cpm-entry-new">{tr('cpm.menuNew')}</em>}
    </button>
  );
}
