import { plural } from './i18n';
import { cfText } from './i18n';
import { tr } from '../i18n/lang';
/**
 * Coups Fourrés : ouverture des boosters (prototype CFBooster) et collection de toutes les cartes
 * (possédées / manquantes, filtres, détail, éclats de verre, fabrication, recyclage).
 * Le serveur fait foi : chaque action renvoie l'état complet du joueur, affiché tel quel.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { appHeight } from '../ui/navGuard';
import { SHARDS, type CardFamily, type CardRarity, type CardType } from '../../../shared/cards/catalog';
import { CARDS, FAMILY_LABEL, RARITY_LABEL, TYPE_LABEL, cardDef } from './i18n';
import { cfMaxUseful, type CfOpenedCard } from '../../../shared/cards/progress';
import { ApiError } from '../account/api';
import { sound } from '../audio/sound';
import { askConfirm } from '../ui/confirm';
import { Icon } from '../ui/Icon';
import { cfCraft, cfOpenBooster, cfRecycle, cfRecycleExtras, type CfState } from './api';
import { BoosterPack, CardBack, CardView } from './components';
import { CfShell, useCfToast } from './cfui';

type Tok = string | null;
const RARITY_TIER: Record<CardRarity, number> = { commune: 0, rare: 1, epique: 2, legendaire: 3 };

/** Éclat de verre (monnaie de fabrication). */
export function ShardIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="cf-shard">
      <path d="M12 2 L19 9 L15 22 L6 16 L4 7Z" fill="#9fd6e8" stroke="#e8f8ff" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12 2 L13 12 L19 9 M13 12 L15 22 M13 12 L6 16 M13 12 L4 7" fill="none" stroke="#ffffff" strokeOpacity=".6" strokeWidth=".9" />
    </svg>
  );
}
export const Shards = ({ n }: { n: number }) => <span className="cf-caps shards" aria-label={tr('cf.collection.eclats_de_verre', { n: n })}><ShardIcon />{n.toLocaleString('fr-BE')}</span>;

// ------------------------------------------------------------------------------------------------
// Ouverture d'un booster

export function BoosterOpening({ token, state, onState, onDone, onCollection, onAutoDeck }: {
  token: Tok; state: CfState; onState: (s: CfState) => void; onDone: () => void; onCollection: () => void; onAutoDeck?: () => void;
}) {
  const [cards, setCards] = useState<CfOpenedCard[] | null>(null);
  const [shown, setShown] = useState<boolean[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const [tearing, setTearing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const left = state.boosters;

  const open = async () => {
    if (tearing) return;
    sound.unlock();
    setErr(null);
    setTearing(true);
    sound.bagBuild(0.7);
    try {
      const [r] = await Promise.all([cfOpenBooster(token), new Promise((ok) => setTimeout(ok, 750))]);
      onState(r.state);
      setCards(r.cards);
      setShown(r.cards.map(() => false));
      setFocus(null);
    } catch (e) {
      setErr(e instanceof Error ? cfText(e.message) : tr('cf.collection.ouverture_impossible'));
    } finally { setTearing(false); }
  };

  const reveal = (i: number) => {
    if (!cards || shown[i]) { setFocus(i); return; }
    const c = cards[i];
    setShown((s) => s.map((x, j) => (j === i ? true : x)));
    setFocus(i);
    if (c.rarity === 'commune') sound.validate(); else sound.bagReveal(RARITY_TIER[c.rarity] === 1 ? 0 : RARITY_TIER[c.rarity] === 2 ? 1 : 3);
  };
  const revealAll = () => {
    if (!cards) return;
    let n = 0; // délai compté pour CE booster (avant : il s'allongeait à chaque booster ouvert)
    cards.forEach((_, i) => { if (!shown[i]) timers.current.push(setTimeout(() => reveal(i), 380 * n++)); });
  };
  const allShown = !!cards && shown.every(Boolean);
  const big = cards && focus !== null ? cards[focus] : null;
  const hidden = cards ? cards.map((c, i) => (!shown[i] ? c.rarity : null)) : [];
  const hint = hidden.includes('legendaire') ? tr('cf.collection.une_carte_brille_d_or_une') : hidden.includes('epique') ? tr('cf.collection.une_carte_brille_en_violet_une') : null;
  const count = cards ? shown.filter(Boolean).length : 0;
  const bigW = Math.min(210, Math.round(appHeight() * 0.32));

  return (
    <div className="cf-booster">
      <span className="cf-booster-glow" aria-hidden />
      <header className="cf-booster-head">
        <span><b>{tr('cf.collection.booster_premier_set')}</b><small>{cards ? tr('cf.collection.carte_sur', { a: Math.max(1, count), length: cards.length }) : tr('cf.collection.booster_a_ouvrir', { left: left, s: left > 1 ? 's' : '' })}</small></span>
        {cards && !allShown ? <button className="cf-pill" onClick={revealAll}>{tr('cf.collection.tout_retourner')}</button> : <button className="cf-pill" onClick={onDone}>{tr('cf.boardparts.fermer')}</button>}
      </header>

      {!cards ? (
        <div className="cf-pack-stage">
          {left > 0 ? (
            <>
              <button className={`cf-pack-btn${tearing ? ' tearing' : ''}`} onClick={() => void open()} aria-label={tr('cf.collection.ouvrir_le_booster')}>
                <BoosterPack width={168} />
              </button>
              <p>{tr('cf.collection.touchez_le_booster_pour_l_ouvrir')}</p>
            </>
          ) : <p>{tr('cf.collection.plus_aucun_booster_a_ouvrir_achetez')}</p>}
          {err && <p className="cf-err">{err}</p>}
        </div>
      ) : (
        <>
          <div className="cf-reveal" style={{ height: Math.round(bigW * 322 / 230) + 26 }}>
            {big ? (
              <div key={focus} className={`cf-reveal-card r-${big.rarity}`}>
                {big.rarity === 'legendaire' && <span className="cf-rays" aria-hidden />}
                {(big.rarity === 'legendaire' || big.rarity === 'epique') && <span className={`cf-rar-tag ${big.rarity}`}>{RARITY_LABEL[big.rarity]} !</span>}
                <CardView id={big.id} width={bigW} shiny={big.shiny} isNew={big.isNew} />
              </div>
            ) : <div className="cf-reveal-wait"><CardBack width={bigW * 0.62} /><p>{tr('cf.collection.touchez_une_carte_pour_la_retourner')}</p></div>}
          </div>
          <div className="cf-reveal-row">
            {cards.map((c, i) => (
              <button key={i} className={`cf-flip${shown[i] ? ' up' : ''}${!shown[i] && c.rarity === 'epique' ? ' pre-epique' : ''}${!shown[i] && c.rarity === 'legendaire' ? ' pre-legendaire' : ''}${focus === i ? ' focus' : ''}`}
                onClick={() => reveal(i)} aria-label={shown[i] ? `${cardDef(c.id)?.name}${c.isNew ? tr('cf.collection.nouvelle') : ''}` : tr('cf.collection.carte_face_cachee', { a: i + 1 })}>
                <span className="cf-flip-in">
                  <span className="cf-flip-back"><CardBack width={58} /></span>
                  <span className="cf-flip-front"><CardView id={c.id} width={58} shiny={c.shiny} zoom="press" />{c.isNew && <em className="cf-new">{tr('cf.collection.nouvelle_2')}</em>}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="cf-reveal-hint">{hint ?? (allShown ? tr('cf.collection.un_doublon_de_trop_il_se') : tr('cf.collection.touchez_les_cartes_pour_les_retourne'))}</p>
          {allShown && (
            <div className="cf-booster-btns">
              {left > 0 ? <button className="cf-btn gold big" onClick={() => { setCards(null); void open(); }}>{tr('cf.collection.ouvrir_le_suivant')}{left})</button>
                : onAutoDeck && <button className="cf-btn gold big" onClick={onAutoDeck}>{tr('cf.collection.mes_decks')}</button>}
              <button className="cf-btn ghost big" onClick={onCollection}>{tr('cf.collection.voir_ma_collection')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Collection

type Own = 'toutes' | 'possedees' | 'manquantes';
const FAMS: CardFamily[] = ['habitues', 'ivresse', 'pieges', 'chaines'];
const TYPES: CardType[] = ['coup', 'piege', 'riposte', 'dernier-mot', 'habitue'];
const RARS: CardRarity[] = ['commune', 'rare', 'epique', 'legendaire'];

/** Exemplaires en trop (au-delà du maximum utile en deck) et éclats qu'ils rapporteraient. */
export function extrasOf(collection: CfState['collection']): { cards: number; copies: number; shards: number } {
  let cards = 0, copies = 0, shards = 0;
  for (const [id, o] of Object.entries(collection)) {
    const d = cardDef(id);
    if (!d) continue;
    const extra = Math.max(0, o.count - cfMaxUseful(id));
    if (extra > 0) { cards++; copies += extra; shards += extra * SHARDS[d.rarity].recycle; }
  }
  return { cards, copies, shards };
}

export function CollectionScreen({ token, state, onState, onBack, onAccount }: { token: Tok; state: CfState | null; onState: (s: CfState) => void; onBack: () => void; onAccount: () => void }) {
  const [own, setOwn] = useState<Own>('toutes');
  const [fam, setFam] = useState<CardFamily | ''>('');
  const [type, setType] = useState<CardType | ''>('');
  const [rar, setRar] = useState<CardRarity | ''>('');
  const [cost, setCost] = useState<number | -1>(-1);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, show] = useCfToast();
  const col = state?.collection ?? {};
  const count = (id: string) => col[id]?.count ?? 0;
  const list = useMemo(() => CARDS.filter((c) => (!fam || c.family === fam) && (!type || c.type === type) && (!rar || c.rarity === rar) && (cost < 0 || (cost >= 4 ? c.cost >= 4 : c.cost === cost))
    && (own === 'toutes' || (own === 'possedees' ? count(c.id) > 0 : count(c.id) === 0))), [fam, type, rar, cost, own, col]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownedN = CARDS.filter((c) => count(c.id) > 0).length;
  const shinyN = Object.values(col).reduce((a, o) => a + (o.shiny > 0 ? 1 : 0), 0);
  const extras = extrasOf(col);
  const w = Math.floor((Math.min(560, typeof window !== 'undefined' ? window.innerWidth : 360) - 32 - 20) / 3);

  const recycleAll = async () => {
    if (!token || !extras.copies) return;
    if (!(await askConfirm(tr('cf.collection.recycler_exemplaire_en_trop_carte_co', { copies: extras.copies, s: extras.copies > 1 ? 's' : '', cards: extras.cards, shards: extras.shards }), tr('cf.collection.recycler')))) return;
    setBusy(true);
    try { const r = await cfRecycleExtras(token); onState(r.state); sound.chips(3); show(tr('cf.collection.eclats_de_verre_2', { gained: r.gained })); }
    catch (e) { show(e instanceof Error ? cfText(e.message) : tr('cf.collection.recyclage_impossible'), 'err'); }
    finally { setBusy(false); }
  };

  return (
    <CfShell title={tr('cf.collection.collection')} sub={state ? tr('cf.collection.cartes', { ownedN: ownedN, length: CARDS.length, a: shinyN ? tr('cf.collection.brillante', { shinyN: shinyN, s: shinyN > 1 ? 's' : '' }) : '' }) : tr('cf.collection.les_cartes_du_jeu', { length: CARDS.length })} onBack={onBack}
      right={state ? <Shards n={state.shards} /> : undefined}>
      {!state && <button className="cf-guest-card" onClick={onAccount}><b>{tr('cf.collection.collectionnez_les_cartes')}</b><small>{tr('cf.collection.avec_un_compte_gratuit_2_decks')}</small><em>{tr('cf.collection.creer_un_compte')}</em></button>}
      {state && extras.copies > 0 && (
        <button className="cf-recycle-all" disabled={busy} onClick={() => void recycleAll()}>
          <ShardIcon size={22} /><span><b>{tr('cf.collection.recycler_tous_les_doublons_en_trop')}</b><small>{extras.copies}{tr('cf.collection.exemplaire')}{extras.copies > 1 ? 's' : ''} · +{extras.shards}{tr('cf.collection.eclats')}</small></span>
        </button>
      )}
      <div className="cf-filters">
        <div className="cf-seg" role="radiogroup" aria-label={tr('cf.collection.possession')}>
          {(['toutes', 'possedees', 'manquantes'] as Own[]).map((o) => <button key={o} role="radio" aria-checked={own === o} className={own === o ? 'on' : ''} onClick={() => setOwn(o)} disabled={!state && o !== 'toutes'}>{o === 'toutes' ? tr('cf.collection.toutes') : o === 'possedees' ? tr('cf.collection.possedees') : tr('cf.collection.manquantes')}</button>)}
        </div>
        <div className="cf-selects">
          <select value={fam} onChange={(e) => setFam(e.target.value as CardFamily | '')} aria-label={tr('cf.collection.famille')}><option value="">{tr('cf.collection.famille')}</option>{FAMS.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value as CardType | '')} aria-label={tr('cf.collection.type')}><option value="">{tr('cf.collection.type')}</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
          <select value={rar} onChange={(e) => setRar(e.target.value as CardRarity | '')} aria-label={tr('cf.collection.rarete')}><option value="">{tr('cf.collection.rarete')}</option>{RARS.map((r) => <option key={r} value={r}>{RARITY_LABEL[r]}</option>)}</select>
          <select value={cost} onChange={(e) => setCost(Number(e.target.value))} aria-label={tr('cf.collection.cout')}><option value={-1}>{tr('cf.collection.cout')}</option>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 4 ? tr('cf.collection.4_et') : n}</option>)}</select>
        </div>
      </div>
      {list.length ? (
        <div className="cf-grid" style={{ ['--w' as string]: `${w}px` }}>
          {list.map((c) => {
            const n = count(c.id);
            return <CardView key={c.id} id={c.id} width={w} zoom="press" dimmed={!!state && n === 0} count={n} shiny={(col[c.id]?.shiny ?? 0) > 0} onClick={() => setOpen(c.id)} />;
          })}
        </div>
      ) : <p className="cf-empty">{tr('cf.collection.aucune_carte_avec_ces_filtres')}</p>}
      {open && <CardDetail id={open} token={token} state={state} onState={onState} onClose={() => setOpen(null)} show={show}
        onNav={(d) => { const i = list.findIndex((c) => c.id === open); const n = list[(i + d + list.length) % list.length]; if (n) setOpen(n.id); }} />}
      {toast}
    </CfShell>
  );
}

function CardDetail({ id, token, state, onState, onClose, show, onNav }: { id: string; token: Tok; state: CfState | null; onState: (s: CfState) => void; onClose: () => void; show: (t: string, k?: 'ok' | 'err') => void; onNav: (d: number) => void }) {
  const d = cardDef(id)!;
  const own = state?.collection[id];
  const n = own?.count ?? 0;
  const max = cfMaxUseful(id);
  const extra = Math.max(0, n - max);
  const craft = SHARDS[d.rarity].craft;
  const recycle = SHARDS[d.rarity].recycle;
  const [busy, setBusy] = useState(false);
  const inDecks = state?.decks.filter((x) => (x.cards[id] ?? 0) > 0).map((x) => x.name) ?? [];
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') onNav(-1); if (e.key === 'ArrowRight') onNav(1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose, onNav]);

  const doCraft = async () => {
    if (!token) return;
    if (!(await askConfirm(tr('cf.collection.fabriquer_pour_eclats_de_verre', { name: d.name, craft: craft }), tr('cf.collection.fabriquer')))) return;
    setBusy(true);
    try { const r = await cfCraft(token, id); onState(r.state); sound.bagReveal(Math.min(3, RARITY_TIER[d.rarity])); show(tr('cf.collection.ajoutee_a_votre_collection', { name: d.name })); }
    catch (e) { show(e instanceof Error ? cfText(e.message) : tr('cf.collection.fabrication_impossible'), 'err'); }
    finally { setBusy(false); }
  };
  const doRecycle = async () => {
    if (!token) return;
    setBusy(true);
    try {
      let r;
      try { r = await cfRecycle(token, id, 1, false); }
      catch (e) {
        // 409 « Confirmez » : l'exemplaire est utile en deck, on demande d'abord.
        if (e instanceof ApiError && e.status === 409 && /Confirmez/.test(e.message)) {
          const ok = await askConfirm(tr('cf.collection.recycler_quand_meme_un_exemplaire_de', { a: cfText(e.message.replace(/ Confirmez.*$/, '')), name: d.name, recycle: recycle }), tr('cf.collection.recycler_quand_meme'));
          if (!ok) return;
          r = await cfRecycle(token, id, 1, true);
        } else throw e;
      }
      onState(r.state); sound.chips(2); show(tr('cf.collection.eclats_de_verre_2', { gained: r.gained }));
    } catch (e) { show(e instanceof Error ? cfText(e.message) : tr('cf.collection.recyclage_impossible'), 'err'); }
    finally { setBusy(false); }
  };

  const w = Math.min(250, (typeof window !== 'undefined' ? window.innerWidth : 360) - 96, Math.round(appHeight() * 0.42));
  return (
    <div className="cf-detail" role="dialog" aria-modal="true" aria-label={d.name} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="cf-ib cf-detail-x" onClick={onClose} aria-label={tr('cf.boardparts.fermer')}><Icon name="close" size={20} /></button>
      <div className="cf-detail-card">
        <button className="cf-nav" onClick={() => onNav(-1)} aria-label={tr('cf.collection.carte_precedente')}><Icon name="back" size={22} /></button>
        <CardView id={id} width={w} shiny={(own?.shiny ?? 0) > 0} dimmed={!!state && n === 0} />
        <button className="cf-nav next" onClick={() => onNav(1)} aria-label={tr('cf.collection.carte_suivante')}><Icon name="back" size={22} /></button>
      </div>
      <div className="cf-detail-info">
        {state ? (
          <>
            <p><b>{n === 0 ? tr('cf.collection.pas_encore_dans_votre_collection') : plural(n, 'exemplaire')}</b>{own?.shiny ? tr('cf.collection.dont_brillante', { shiny: own.shiny, s: own.shiny > 1 ? 's' : '' }) : ''}</p>
            <small>{max}{tr('cf.collection.au_plus_par_deck')}{extra > 0 ? tr('cf.collection.en_trop', { extra: extra }) : ''}{inDecks.length ? tr('cf.collection.dans', { a: inDecks.map((x) => `« ${x} »`).join(', ') }) : ''}</small>
            <div className="cf-detail-btns">
              <button className="cf-btn violet" disabled={busy || n >= max || state.shards < craft} onClick={() => void doCraft()}>{tr('cf.collection.fabriquer_2')}{craft} <ShardIcon size={16} /></button>
              <button className="cf-btn ghost" disabled={busy || n === 0} onClick={() => void doRecycle()}>{tr('cf.collection.recycler_2')}{recycle} <ShardIcon size={16} /></button>
            </div>
            {n < max && state.shards < craft && <small className="cf-muted">{tr('cf.collection.il_vous_manque')}{craft - state.shards}{tr('cf.collection.eclats_pour_la_fabriquer')}</small>}
          </>
        ) : <p>{TYPE_LABEL[d.type]} · {RARITY_LABEL[d.rarity]} · {FAMILY_LABEL[d.family]}</p>}
      </div>
    </div>
  );
}
