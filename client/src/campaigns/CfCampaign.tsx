/**
 * Coups Fourrés : campagne solo « Les Comptoirs rivaux » (écran d'entrée = carte des quartiers et des comptoirs).
 *  - `CfCampaignEntry` : grande carte du menu du mode (au-dessus des parties) ;
 *  - `CfCampaignScreen` : carte des quatre quartiers, façades des comptoirs, étoiles, réputation ;
 *  - fiche d'un comptoir : patron et amis (avatar, niveau, FAMILLES de leur deck imposé), table (duel / 3-4,
 *    jetons), étoiles à gagner, choix de SON deck (DeckPicker) puis « S'asseoir » ;
 *  - `CcfEndPanel` : étoiles gagnées, sur l'écran de fin de partie.
 * Données et règles : shared/campaigns/cf.ts (le serveur calcule les étoiles en rejouant la partie).
 * Textes : clés `ccf.` (shared/i18n/zones/campcf.*.ts). Styles : ./cf-campaign.css.
 */
import { useMemo, useState } from 'react';
import {
  CCF_CHAPTERS, CCF_MAX_STARS, CCF_STAGES, CCF_STAR_COINS, ccfChapter, ccfHost, ccfPlayers, ccfReputation, ccfRival, ccfTitleFr, chapterDone, chapterUnlocked,
  deckFamilies, stageUnlocked, stagesOf, starCount, type CcfProgress, type CcfResult, type CcfStage, type CcfStar,
} from '../../../shared/campaigns/cf';
import { CF_RULES, STARTER_DECKS } from '../../../shared/cards/catalog';
import { CF_LEVEL_LABEL } from '../../../shared/cards/ai';
import type { MessageKey } from '../../../shared/i18n';
import type { Profile } from '../../../shared/progress/profile';
import { tr, trServer, useLang } from '../i18n/lang';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/kit';
import { ModeBar, ModeChip } from '../ui/ModeBar';
import { FAMILY_LABEL, cfText } from '../cards/i18n';
import { FAMILY_STYLE } from '../cards/meta';
import { DeckPicker, type DeckOption } from '../cards/DeckPicker';
import type { CfState } from '../cards/api';
import type { CfSnapshot } from '../cards/controller';
import './cf-campaign.css';

const k = (s: string) => s as MessageKey;
export const ccfStageName = (id: string) => tr(k(`ccf.s.${id}`));
export const ccfChapterName = (id: string) => tr(k(`ccf.c.${id}`));
const titleOf = (chapter: string) => trServer(ccfTitleFr(chapter) ?? '');

export function ccfStarText(s: CcfStar | 'win'): string {
  if (s === 'win') return tr('ccf.star.win');
  switch (s.k) {
    case 'rounds': return tr('ccf.star.rounds', { n: s.n });
    case 'lead': return tr('ccf.star.lead', { n: s.n });
    case 'traps': return s.n === 1 ? tr('ccf.star.traps1') : tr('ccf.star.traps', { n: s.n });
    case 'lost': return s.n === 0 ? tr('ccf.star.lost0') : s.n === 1 ? tr('ccf.star.lost1') : tr('ccf.star.lost', { n: s.n });
    case 'combo': return tr('ccf.star.combo', { n: s.n });
    default: return tr(k(`ccf.star.${s.k}`));
  }
}

/** Rangée de trois étoiles (masque) ; les nouvelles brillent. */
export function CcfStars({ mask, fresh = 0, size }: { mask: number; fresh?: number; size?: number }) {
  return (
    <span className="ccf-stars" style={size ? { fontSize: size } : undefined} aria-label={tr('ccf.starsAria', { n: starCount(mask) })}>
      {[0, 1, 2].map((i) => <i key={i} className={`${mask & (1 << i) ? 'on' : ''}${fresh & (1 << i) ? ' new' : ''}`} style={{ animationDelay: `${0.25 + i * 0.35}s` }} aria-hidden>★</i>)}
    </span>
  );
}

/** Couleurs d'un comptoir : celles de la famille principale du deck de son patron. */
function stageColors(s: CcfStage) {
  const f = deckFamilies(ccfHost(s).deck)[0] ?? 'habitues';
  return { c1: FAMILY_STYLE[f].c1, c2: FAMILY_STYLE[f].c2, edge: FAMILY_STYLE[f].edge };
}

/** Pastilles des familles d'un deck (couleur + nom). */
function FamilyTags({ cards }: { cards: Record<string, number> }) {
  return (
    <span className="ccf-fams">
      {deckFamilies(cards).map((f) => <em key={f} style={{ ['--f1' as string]: FAMILY_STYLE[f].c1, ['--f2' as string]: FAMILY_STYLE[f].c2 }}>{FAMILY_LABEL[f]}</em>)}
    </span>
  );
}

// ------------------------------------------------------------------------------------------------
// Entrée du menu du mode

export function CfCampaignEntry({ profile, onOpen, tile }: { profile: Profile; onOpen: () => void; tile?: boolean }) {
  useLang();
  const prog = profile.ccf;
  const rep = ccfReputation(prog);
  const won = CCF_STAGES.filter((s) => (prog?.[s.id] ?? 0) & 1).length;
  const next = CCF_STAGES.find((s) => !((prog?.[s.id] ?? 0) & 1) && stageUnlocked(prog, s.id));
  if (tile) return (
    <button className="cf-tile" onClick={onOpen} title={next ? tr('ccf.menuNext', { name: ccfStageName(next.id) }) : undefined}>
      <span className="cf-tile-art" aria-hidden><span className="ccf-tile-sign">{next ? ccfHost(next).avatar : '👑'}</span></span>
      <b>{tr('cf.mode.t_campagne')}</b><small>★ {rep}/{CCF_MAX_STARS}</small>
    </button>
  );
  return (
    <button className="ccf-entry" onClick={onOpen}>
      <span className="ccf-entry-art" aria-hidden>
        <span className="ccf-entry-sign">{next ? ccfHost(next).avatar : '👑'}</span>
        <i className="cf-hab" /><i className="cf-ivr" /><i className="cf-pie" /><i className="cf-cha" />
      </span>
      <span className="ccf-entry-text">
        <small className="ccf-entry-kicker">{tr('ccf.kicker')}</small>
        <b>{tr('ccf.title')}</b>
        <small>{next ? tr('ccf.menuNext', { name: ccfStageName(next.id) }) : won === CCF_STAGES.length ? tr('ccf.menuDone') : tr('ccf.menuSub', { b: won, t: CCF_STAGES.length })}</small>
      </span>
      <em className="ccf-entry-rep"><span aria-hidden>★</span>{rep}<small>/{CCF_MAX_STARS}</small></em>
    </button>
  );
}

// ------------------------------------------------------------------------------------------------
// Carte des comptoirs

function Storefront({ s, mask, open, onOpen }: { s: CcfStage; mask: number; open: boolean; onOpen: () => void }) {
  const col = stageColors(s);
  const host = ccfHost(s);
  return (
    <button className={`ccf-shop${open ? '' : ' locked'}${mask & 1 ? ' won' : ''}`} onClick={onOpen}
      style={{ ['--c1' as string]: col.c1, ['--c2' as string]: col.c2, ['--edge' as string]: col.edge }}>
      <span className="ccf-awning" aria-hidden />
      <span className="ccf-shop-face" aria-hidden>{open ? host.avatar : <Icon name="lock" size={22} />}</span>
      {s.rivals.length > 1 && open && <span className="ccf-shop-n" aria-hidden>×{s.rivals.length}</span>}
      <b className="ccf-shop-name">{ccfStageName(s.id)}</b>
      {open ? <CcfStars mask={mask} /> : <small className="ccf-shop-lock">{tr('ccf.locked')}</small>}
    </button>
  );
}

export interface CfCampaignProps {
  profile: Profile;
  acc: boolean;
  st: CfState | null;
  starting: boolean;
  /** Parcours débutant pas encore fini sur cet appareil : on le conseille avant la campagne (sans l'imposer). */
  parcours: { next: number; total: number } | null;
  onParcours: () => void;
  onBack: () => void;
  onPlay: (stage: CcfStage, deckId: string) => void;
  onDecks: () => void;
}

export function CfCampaignScreen(p: CfCampaignProps) {
  useLang();
  const prog: CcfProgress = p.profile.ccf ?? {};
  const rep = ccfReputation(prog);
  const [open, setOpen] = useState<CcfStage | null>(null);
  const done = CCF_STAGES.filter((s) => (prog[s.id] ?? 0) & 1).length;
  return (
    <div className="cf-menu ccf-screen">
      <span className="cf-stars" aria-hidden />
      <ModeBar tone="cartes" title={tr('ccf.title')} onBack={p.onBack}>
        <ModeChip label={tr('ccf.repAria', { n: rep })}><span className="ccf-star-ic" aria-hidden>★</span>{rep}<small className="ccf-chip-max">/{CCF_MAX_STARS}</small></ModeChip>
      </ModeBar>
      <main className="ccf-main">
        <header className="ccf-head">
          <h1>{tr('ccf.title')}</h1>
          <p>{tr('ccf.sub')}</p>
          <div className="ccf-rep">
            <span className="ccf-rep-n"><span aria-hidden>★</span> {rep}</span>
            <span className="ccf-rep-text"><b>{tr('ccf.rep')}</b><small>{tr('ccf.repSub', { b: done, t: CCF_STAGES.length })}</small></span>
            <span className="ccf-bar"><i style={{ width: `${(100 * rep) / CCF_MAX_STARS}%` }} /></span>
          </div>
          {p.parcours && (
            <div className="ccf-parcours">
              <span>{tr('ccf.parcours', { n: p.parcours.next - 1, t: p.parcours.total })}</span>
              <button className="cf-btn small violet" onClick={p.onParcours}>{tr('ccf.parcoursGo')}</button>
            </div>
          )}
          {!p.acc && <p className="ccf-guest">{tr('ccf.guestNote')}</p>}
        </header>
        {CCF_CHAPTERS.map((c, ci) => {
          const cOpen = chapterUnlocked(prog, c.id);
          const cDone = chapterDone(prog, c.id);
          const cStars = stagesOf(c.id).reduce((n, s) => n + starCount(prog[s.id] ?? 0), 0);
          const prize = p.acc ? tr('ccf.prize', { t: titleOf(c.id), c: c.capsules }) : tr('ccf.prizeGuest', { t: titleOf(c.id) });
          return (
            <section key={c.id} className={`ccf-chapter${cOpen ? '' : ' locked'}${cDone ? ' done' : ''}`} style={{ ['--q' as string]: c.color }} aria-label={ccfChapterName(c.id)}>
              <header className="ccf-c-head">
                <span className="ccf-c-num" aria-hidden>{ci + 1}</span>
                <span className="ccf-c-text"><b>{ccfChapterName(c.id)}</b><small>{cOpen ? tr(k(`ccf.c.${c.id}.d`)) : tr('ccf.needRep', { n: c.need })}</small></span>
                <span className="ccf-c-stars">{cOpen ? <>{cStars}<small>/9</small> ★</> : <Icon name="lock" size={18} />}</span>
              </header>
              <div className="ccf-street">
                {stagesOf(c.id).map((s) => <Storefront key={s.id} s={s} mask={prog[s.id] ?? 0} open={stageUnlocked(prog, s.id)} onOpen={() => setOpen(s)} />)}
              </div>
              <p className={`ccf-prize${cDone ? ' got' : ''}`}>{cDone ? <Icon name="check" size={14} /> : <Icon name="gift" size={14} />} {cDone ? tr('ccf.prizeGot', { t: titleOf(c.id) }) : prize}</p>
            </section>
          );
        })}
        <p className="ccf-foot">{tr('ccf.foot', { n: CCF_STAR_COINS })}</p>
      </main>
      {open && <StageSheet s={open} prog={prog} acc={p.acc} st={p.st} starting={p.starting} onClose={() => setOpen(null)} onDecks={p.onDecks}
        onPlay={(deckId) => { const s = open; setOpen(null); p.onPlay(s, deckId); }} />}
    </div>
  );
}

function StageSheet({ s, prog, acc, st, starting, onClose, onPlay, onDecks }: {
  s: CcfStage; prog: CcfProgress; acc: boolean; st: CfState | null; starting: boolean; onClose: () => void; onPlay: (deckId: string) => void; onDecks: () => void;
}) {
  const mask = prog[s.id] ?? 0;
  const open = stageUnlocked(prog, s.id);
  const col = stageColors(s);
  const list = stagesOf(s.chapter);
  const prev = list[list.indexOf(s) - 1];
  const why = open ? null : !chapterUnlocked(prog, s.chapter) ? tr('ccf.needRep', { n: ccfChapter(s.chapter).need }) : prev ? tr('ccf.needPrev', { name: ccfStageName(prev.id) }) : null;
  const stars: (CcfStar | 'win')[] = ['win', ...s.stars];
  const n = ccfPlayers(s);
  // Comptes : leurs decks (les injouables grisés) ; invités : les decks de départ.
  const decks = useMemo<DeckOption[]>(() => (acc && st ? st.decks : STARTER_DECKS.map((d) => ({ id: d.id, name: d.name, cards: d.cards, valid: true, problems: [] }))), [acc, st]);
  const [deckId, setDeckId] = useState<string | null>(() => (acc && st ? st.activeDeck : STARTER_DECKS[0].id));
  const chosen = decks.find((d) => d.id === deckId && d.valid) ?? decks.find((d) => d.valid) ?? null;
  return (
    <Sheet title={ccfStageName(s.id)} onClose={onClose}>
      <div className="ccf-fiche" style={{ ['--c1' as string]: col.c1, ['--c2' as string]: col.c2, ['--edge' as string]: col.edge }}>
        <div className="ccf-fiche-top">
          <span className="ccf-fiche-sign" aria-hidden><span>{ccfHost(s).avatar}</span></span>
          <div>
            <p className="ccf-fiche-q">{ccfChapterName(s.chapter)}</p>
            <p className="ccf-fiche-amb">{tr(k(`ccf.s.${s.id}.d`))}</p>
            <p className="ccf-fiche-table">{n === 2 ? tr('ccf.tableDuel', { t: CF_RULES.startTokens }) : tr('ccf.tableMulti', { n, t: CF_RULES.startTokensMulti })}</p>
          </div>
        </div>
        <h3>{tr('ccf.atTable')}</h3>
        <ul className="ccf-opps">
          {s.rivals.map((id) => {
            const r = ccfRival(id);
            return (
              <li key={id}>
                <span className="ccf-opp-av" aria-hidden style={{ background: r.color }}>{r.avatar}</span>
                <span className="ccf-opp-tx">
                  <b>{r.name}<small> · {cfText(CF_LEVEL_LABEL[r.level])}</small></b>
                  <small className="ccf-opp-line">« {tr(k(`ccf.r.${id}`))} »</small>
                  <span className="ccf-opp-deck">{tr('ccf.theirDeck')} <FamilyTags cards={r.deck} /></span>
                </span>
              </li>
            );
          })}
        </ul>
        <h3>{tr('ccf.stars')}</h3>
        <ul className="ccf-goals">
          {stars.map((x, i) => <li key={i} className={mask & (1 << i) ? 'got' : ''}><span className="ccf-goal-star" aria-hidden>★</span>{ccfStarText(x)}{mask & (1 << i) ? <Icon name="check" size={16} /> : null}</li>)}
        </ul>
        {why ? <p className="ccf-why"><Icon name="lock" size={16} /> {why}</p> : (
          <>
            <h3>{tr('ccf.yourDeck')}</h3>
            <DeckPicker decks={decks} value={chosen?.id ?? null} active={acc && st ? st.activeDeck : null} onChange={setDeckId} />
            {acc && <button className="cf-link" onClick={onDecks}>{tr('cf.deckpicker.modifier_mes_decks')}</button>}
            <button className="cf-btn gold big ccf-sit" disabled={starting || !chosen} onClick={() => chosen && onPlay(chosen.id)}>
              {starting ? tr('cf.mode.preparation') : chosen ? tr('ccf.sit', { name: chosen.name }) : tr('cf.deckpicker.choisissez_un_deck_jouable')}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------
// Écran de fin

/** Étoiles d'une partie de la campagne, d'après le résultat du serveur (compte) ou de l'appareil (invité). */
export function CcfEndPanel({ stage, snap, before }: { stage: CcfStage; snap: CfSnapshot; before: CcfProgress }) {
  useLang();
  const reward = (snap.finished?.reward ?? null) as { campaign?: CcfResult | null; error?: string } | null;
  const res = reward?.campaign ?? null;
  const pending = !reward;
  const was = res?.before ?? before[stage.id] ?? 0;
  const is = res?.after ?? was;
  const fresh = is & ~was;
  const n = starCount(fresh);
  const after: CcfProgress = { ...before, ...(is ? { [stage.id]: is } : {}) };
  const next = res ? CCF_STAGES.find((x) => !stageUnlocked(before, x.id) && stageUnlocked(after, x.id)) : undefined;
  return (
    <div className="ccf-end" role="status">
      <p className="ccf-end-name">{ccfStageName(stage.id)}</p>
      <CcfStars mask={is} fresh={fresh} size={30} />
      <p className={`ccf-end-msg${n ? ' ok' : ''}`}>{pending ? tr('ccf.end.pending') : !res ? tr('ccf.end.none') : n ? `${tr(n > 1 ? 'ccf.end.newN' : 'ccf.end.new1', { n })} +${res.coins} ${tr('ccf.end.coins')}` : tr('ccf.end.none')}</p>
      {res?.chapter && <p className="ccf-end-q">🏆 {tr('ccf.end.chapter', { q: ccfChapterName(res.chapter), t: titleOf(res.chapter) })}{res.capsules && reward && 'capsules' in reward ? ` · ${tr('ccf.end.caps', { n: res.capsules })}` : ''}</p>}
      {next && <p className="ccf-end-next">🔓 {tr('ccf.end.next', { name: ccfStageName(next.id) })}</p>}
    </div>
  );
}
