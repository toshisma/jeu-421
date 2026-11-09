/**
 * Coups Fourrés : ouverture des boosters (prototype CFBooster) et collection de toutes les cartes
 * (possédées / manquantes, filtres, détail, éclats de verre, fabrication, recyclage).
 * Le serveur fait foi : chaque action renvoie l'état complet du joueur, affiché tel quel.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { appHeight } from '../ui/navGuard';
import { CARDS, FAMILY_LABEL, RARITY_LABEL, SHARDS, TYPE_LABEL, cardDef, type CardFamily, type CardRarity, type CardType } from '../../../shared/cards/catalog';
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
export const Shards = ({ n }: { n: number }) => <span className="cf-caps shards" aria-label={`${n} éclats de verre`}><ShardIcon />{n.toLocaleString('fr-BE')}</span>;

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
      setErr(e instanceof Error ? e.message : 'Ouverture impossible.');
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
  const hint = hidden.includes('legendaire') ? 'Une carte brille d’or : une légendaire vous attend !' : hidden.includes('epique') ? 'Une carte brille en violet : une épique vous attend.' : null;
  const count = cards ? shown.filter(Boolean).length : 0;
  const bigW = Math.min(210, Math.round(appHeight() * 0.32));

  return (
    <div className="cf-booster">
      <span className="cf-booster-glow" aria-hidden />
      <header className="cf-booster-head">
        <span><b>Booster · premier set</b><small>{cards ? `Carte ${Math.max(1, count)} sur ${cards.length}` : `${left} booster${left > 1 ? 's' : ''} à ouvrir`}</small></span>
        {cards && !allShown ? <button className="cf-pill" onClick={revealAll}>Tout retourner</button> : <button className="cf-pill" onClick={onDone}>Fermer</button>}
      </header>

      {!cards ? (
        <div className="cf-pack-stage">
          {left > 0 ? (
            <>
              <button className={`cf-pack-btn${tearing ? ' tearing' : ''}`} onClick={() => void open()} aria-label="Ouvrir le booster">
                <BoosterPack width={168} />
              </button>
              <p>Touchez le booster pour l’ouvrir.</p>
            </>
          ) : <p>Plus aucun booster à ouvrir. Achetez-en avec vos capsules, ou gagnez-en en partie.</p>}
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
            ) : <div className="cf-reveal-wait"><CardBack width={bigW * 0.62} /><p>Touchez une carte pour la retourner.</p></div>}
          </div>
          <div className="cf-reveal-row">
            {cards.map((c, i) => (
              <button key={i} className={`cf-flip${shown[i] ? ' up' : ''}${!shown[i] && c.rarity === 'epique' ? ' pre-epique' : ''}${!shown[i] && c.rarity === 'legendaire' ? ' pre-legendaire' : ''}${focus === i ? ' focus' : ''}`}
                onClick={() => reveal(i)} aria-label={shown[i] ? `${cardDef(c.id)?.name}${c.isNew ? ', nouvelle' : ''}` : `Carte ${i + 1}, face cachée`}>
                <span className="cf-flip-in">
                  <span className="cf-flip-back"><CardBack width={58} /></span>
                  <span className="cf-flip-front"><CardView id={c.id} width={58} shiny={c.shiny} zoom="press" />{c.isNew && <em className="cf-new">Nouvelle</em>}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="cf-reveal-hint">{hint ?? (allShown ? 'Un doublon de trop ? Il se recycle en éclats de verre pour fabriquer la carte de votre choix.' : 'Touchez les cartes pour les retourner.')}</p>
          {allShown && (
            <div className="cf-booster-btns">
              {left > 0 ? <button className="cf-btn gold big" onClick={() => { setCards(null); void open(); }}>Ouvrir le suivant ({left})</button>
                : onAutoDeck && <button className="cf-btn gold big" onClick={onAutoDeck}>Mes decks</button>}
              <button className="cf-btn ghost big" onClick={onCollection}>Voir ma collection</button>
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
    if (!(await askConfirm(`Recycler ${extras.copies} exemplaire${extras.copies > 1 ? 's' : ''} en trop (${extras.cards} carte${extras.cards > 1 ? 's' : ''}) contre ${extras.shards} éclats de verre ? Vous gardez le maximum utile de chaque carte.`, 'Recycler'))) return;
    setBusy(true);
    try { const r = await cfRecycleExtras(token); onState(r.state); sound.chips(3); show(`+${r.gained} éclats de verre`); }
    catch (e) { show(e instanceof Error ? e.message : 'Recyclage impossible.', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <CfShell title="Collection" sub={state ? `${ownedN}/${CARDS.length} cartes${shinyN ? ` · ${shinyN} brillante${shinyN > 1 ? 's' : ''}` : ''}` : `Les ${CARDS.length} cartes du jeu`} onBack={onBack}
      right={state ? <Shards n={state.shards} /> : undefined}>
      {!state && <button className="cf-guest-card" onClick={onAccount}><b>Collectionnez les cartes</b><small>Avec un compte gratuit : 2 decks de départ, 3 boosters offerts, et vos cartes gardées pour toujours.</small><em>Créer un compte</em></button>}
      {state && extras.copies > 0 && (
        <button className="cf-recycle-all" disabled={busy} onClick={() => void recycleAll()}>
          <ShardIcon size={22} /><span><b>Recycler tous les doublons en trop</b><small>{extras.copies} exemplaire{extras.copies > 1 ? 's' : ''} · +{extras.shards} éclats</small></span>
        </button>
      )}
      <div className="cf-filters">
        <div className="cf-seg" role="radiogroup" aria-label="Possession">
          {(['toutes', 'possedees', 'manquantes'] as Own[]).map((o) => <button key={o} role="radio" aria-checked={own === o} className={own === o ? 'on' : ''} onClick={() => setOwn(o)} disabled={!state && o !== 'toutes'}>{o === 'toutes' ? 'Toutes' : o === 'possedees' ? 'Possédées' : 'Manquantes'}</button>)}
        </div>
        <div className="cf-selects">
          <select value={fam} onChange={(e) => setFam(e.target.value as CardFamily | '')} aria-label="Famille"><option value="">Famille</option>{FAMS.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value as CardType | '')} aria-label="Type"><option value="">Type</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
          <select value={rar} onChange={(e) => setRar(e.target.value as CardRarity | '')} aria-label="Rareté"><option value="">Rareté</option>{RARS.map((r) => <option key={r} value={r}>{RARITY_LABEL[r]}</option>)}</select>
          <select value={cost} onChange={(e) => setCost(Number(e.target.value))} aria-label="Coût"><option value={-1}>Coût</option>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 4 ? '4 et +' : n}</option>)}</select>
        </div>
      </div>
      {list.length ? (
        <div className="cf-grid" style={{ ['--w' as string]: `${w}px` }}>
          {list.map((c) => {
            const n = count(c.id);
            return <CardView key={c.id} id={c.id} width={w} zoom="press" dimmed={!!state && n === 0} count={n} shiny={(col[c.id]?.shiny ?? 0) > 0} onClick={() => setOpen(c.id)} />;
          })}
        </div>
      ) : <p className="cf-empty">Aucune carte avec ces filtres.</p>}
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
    if (!(await askConfirm(`Fabriquer « ${d.name} » pour ${craft} éclats de verre ?`, 'Fabriquer'))) return;
    setBusy(true);
    try { const r = await cfCraft(token, id); onState(r.state); sound.bagReveal(Math.min(3, RARITY_TIER[d.rarity])); show(`« ${d.name} » ajoutée à votre collection.`); }
    catch (e) { show(e instanceof Error ? e.message : 'Fabrication impossible.', 'err'); }
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
          const ok = await askConfirm(`${e.message.replace(/ Confirmez.*$/, '')} Recycler quand même un exemplaire de « ${d.name} » (+${recycle} éclats) ?`, 'Recycler quand même');
          if (!ok) return;
          r = await cfRecycle(token, id, 1, true);
        } else throw e;
      }
      onState(r.state); sound.chips(2); show(`+${r.gained} éclats de verre`);
    } catch (e) { show(e instanceof Error ? e.message : 'Recyclage impossible.', 'err'); }
    finally { setBusy(false); }
  };

  const w = Math.min(250, (typeof window !== 'undefined' ? window.innerWidth : 360) - 96, Math.round(appHeight() * 0.42));
  return (
    <div className="cf-detail" role="dialog" aria-modal="true" aria-label={d.name} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="cf-ib cf-detail-x" onClick={onClose} aria-label="Fermer"><Icon name="close" size={20} /></button>
      <div className="cf-detail-card">
        <button className="cf-nav" onClick={() => onNav(-1)} aria-label="Carte précédente"><Icon name="back" size={22} /></button>
        <CardView id={id} width={w} shiny={(own?.shiny ?? 0) > 0} dimmed={!!state && n === 0} />
        <button className="cf-nav next" onClick={() => onNav(1)} aria-label="Carte suivante"><Icon name="back" size={22} /></button>
      </div>
      <div className="cf-detail-info">
        {state ? (
          <>
            <p><b>{n === 0 ? 'Pas encore dans votre collection' : `${n} exemplaire${n > 1 ? 's' : ''}`}</b>{own?.shiny ? ` · dont ${own.shiny} brillante${own.shiny > 1 ? 's' : ''}` : ''}</p>
            <small>{max} au plus par deck{extra > 0 ? ` · ${extra} en trop` : ''}{inDecks.length ? ` · dans ${inDecks.map((x) => `« ${x} »`).join(', ')}` : ''}</small>
            <div className="cf-detail-btns">
              <button className="cf-btn violet" disabled={busy || n >= max || state.shards < craft} onClick={() => void doCraft()}>Fabriquer · {craft} <ShardIcon size={16} /></button>
              <button className="cf-btn ghost" disabled={busy || n === 0} onClick={() => void doRecycle()}>Recycler · +{recycle} <ShardIcon size={16} /></button>
            </div>
            {n < max && state.shards < craft && <small className="cf-muted">Il vous manque {craft - state.shards} éclats pour la fabriquer.</small>}
          </>
        ) : <p>{TYPE_LABEL[d.type]} · {RARITY_LABEL[d.rarity]} · {FAMILY_LABEL[d.family]}</p>}
      </div>
    </div>
  );
}
