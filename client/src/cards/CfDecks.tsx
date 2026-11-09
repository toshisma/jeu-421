import { cfText } from './i18n';
import { tr } from '../i18n/lang';
/**
 * Coups Fourrés : mes decks (5 au plus, deck actif, créer / renommer / supprimer, construire
 * automatiquement) et l'éditeur de deck (ajout / retrait au toucher, compteur 20, courbe des coûts,
 * répartition par famille et par type, conseils).
 */
import { useMemo, useState } from 'react';
import { CF_RULES, DECK_RULES, STARTER_DECKS, deckProblems, deckRuleText, type CardFamily, type CardType } from '../../../shared/cards/catalog';
import { CARDS, FAMILY_LABEL, TYPE_LABEL, cardDef } from './i18n';
import { buildAutoDeck, usableCount } from '../../../shared/cards/autodeck';
import { CF_DECK_NAME_MAX, CF_MAX_DECKS, cfMaxUseful, type CfDeck } from '../../../shared/cards/progress';
import { api, ApiError } from '../account/api';
import { sound } from '../audio/sound';
import { askConfirm } from '../ui/confirm';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/kit';
import { cfCreateDeck, cfDeleteDeck, cfRenameDeck, cfSetActiveDeck, cfUpdateDeck, type CfState } from './api';
import { CardView, CostBadge } from './components';
import { FAMILY_STYLE, FAMILY_SHORT } from './meta';
import { CfShell, useCfToast } from './cfui';
import { deckAlerts, deckStats } from './describe';

/** Largeur de l'écran (360 hors navigateur, pour le rendu serveur des tests). */
const vw = () => (typeof window !== 'undefined' ? window.innerWidth : 360);

type Tok = string | null;
const FAMS: CardFamily[] = ['habitues', 'ivresse', 'pieges', 'chaines'];
const TYPES: CardType[] = ['coup', 'piege', 'riposte', 'dernier-mot', 'habitue'];
const ownedCounts = (st: CfState) => Object.fromEntries(Object.entries(st.collection).map(([id, o]) => [id, o.count]));

/** Petite barre des familles d'un deck (proportions). */
function FamilyBar({ cards }: { cards: Record<string, number> }) {
  const s = deckStats(cards);
  return (
    <span className="cf-fambar" aria-label={FAMS.filter((f) => s.families[f]).map((f) => `${FAMILY_SHORT[f]} ${s.families[f]}`).join(', ')}>
      {FAMS.map((f) => s.families[f] ? <i key={f} style={{ flex: s.families[f], background: `linear-gradient(90deg, ${FAMILY_STYLE[f].c1}, ${FAMILY_STYLE[f].c2})` }} /> : null)}
    </span>
  );
}

/** Courbe des coûts (0, 1, 2, 3, 4+). */
function Curve({ cards }: { cards: Record<string, number> }) {
  const s = deckStats(cards);
  const max = Math.max(4, ...s.curve);
  return (
    <div className="cf-curve" aria-label={tr('cf.decks.courbe_des_couts', { a: s.curve.map((n, i) => tr('cf.decks.a', { n: n, a: i === 4 ? tr('cf.decks.4_et_plus') : i })).join(', ') })}>
      {s.curve.map((n, i) => (
        <span key={i} className="cf-curve-col"><em>{n || ''}</em><i style={{ height: `${(100 * n) / max}%` }} /><small>{i === 4 ? '4+' : i}</small></span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

export function DecksScreen({ token, state, onState, onBack, onAccount, onEdit }: {
  token: Tok; state: CfState | null; onState: (s: CfState) => void; onBack: () => void; onAccount: () => void;
  onEdit: (id: string | null, cards?: Record<string, number>, name?: string) => void;
}) {
  const [toast, show] = useCfToast();
  const [rename, setRename] = useState<CfDeck | null>(null);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const decks = state?.decks ?? [];
  const run = async (f: () => Promise<{ state: CfState }>, ok?: string) => {
    setBusy(true);
    try { const r = await f(); onState(r.state); if (ok) show(ok); } catch (e) { show(e instanceof Error ? cfText(e.message) : tr('cf.decks.action_impossible'), 'err'); } finally { setBusy(false); }
  };
  if (!state) {
    return (
      <CfShell title={tr('cf.collection.mes_decks')} sub={tr('cf.decks.decks_de_depart')} onBack={onBack}>
        <button className="cf-guest-card" onClick={onAccount}><b>{tr('cf.decks.vos_propres_decks')}</b><small>{tr('cf.decks.avec_un_compte_gratuit_jusqu_a')}</small><em>{tr('cf.collection.creer_un_compte')}</em></button>
        {STARTER_DECKS.map((d) => <DeckRow key={d.id} name={d.name} cards={d.cards} />)}
      </CfShell>
    );
  }
  const full = decks.length >= CF_MAX_DECKS;
  return (
    <CfShell title={tr('cf.collection.mes_decks')} sub={tr('cf.decks.decks_20_cartes_chacun', { length: decks.length, CF_MAX_DECKS: CF_MAX_DECKS })} onBack={onBack}
      foot={<div className="cf-foot-row">
        <button className="cf-btn violet" disabled={full || busy} onClick={() => onEdit(null)}><Icon name="plus" size={18} />{tr('cf.decks.nouveau_deck')}</button>
        <button className="cf-btn gold" disabled={full || busy} onClick={() => setAuto(true)}>{tr('cf.decks.construire_automatiquement')}</button>
      </div>}>
      {full && <p className="cf-muted center">{tr('cf.decks.5_decks_au_plus_supprimez_en')}</p>}
      {decks.map((d) => (
        <DeckRow key={d.id} name={d.name} cards={d.cards} active={state.activeDeck === d.id} problems={d.valid ? [] : d.problems}
          actions={<>
            {state.activeDeck !== d.id && d.valid && <button className="cf-btn small violet" disabled={busy} onClick={() => void run(() => cfSetActiveDeck(token, d.id), tr('cf.decks.est_votre_deck_actif', { name: d.name }))}>{tr('cf.decks.activer')}</button>}
            <button className="cf-btn small ghost" onClick={() => onEdit(d.id, d.cards, d.name)}>{tr('cf.decks.modifier')}</button>
            <button className="cf-btn small ghost" onClick={() => setRename(d)}>{tr('cf.decks.renommer')}</button>
            <button className="cf-btn small ghost danger" disabled={busy} onClick={async () => { if (await askConfirm(tr('cf.decks.supprimer_le_deck_vos_cartes_restent', { name: d.name }), tr('cf.decks.supprimer'))) void run(() => cfDeleteDeck(token, d.id), tr('cf.decks.deck_supprime')); }}>{tr('cf.decks.supprimer')}</button>
          </>} />
      ))}
      {!decks.length && <p className="cf-empty">{tr('cf.decks.aucun_deck_pour_l_instant_creez')}</p>}
      {rename && <RenameSheet deck={rename} onClose={() => setRename(null)} onSave={(n) => { setRename(null); void run(() => cfRenameDeck(token, rename.id, n), tr('cf.decks.deck_renomme')); }} />}
      {auto && <AutoDeckSheet token={token} state={state} onClose={() => setAuto(false)} onState={onState} show={show} onEdit={onEdit} />}
      {toast}
    </CfShell>
  );
}

function DeckRow({ name, cards, active, problems, actions }: { name: string; cards: Record<string, number>; active?: boolean; problems?: string[]; actions?: React.ReactNode }) {
  const s = deckStats(cards);
  const [open, setOpen] = useState(false);
  return (
    <section className={`cf-deck${active ? ' active' : ''}`}>
      <button className="cf-deck-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="cf-deck-name"><b>{name}</b>{active && <em>{tr('cf.decks.actif')}</em>}</span>
        <small>{s.total}{tr('cf.decks.cartes')}{FAMS.filter((f) => s.families[f]).map((f) => FAMILY_SHORT[f]).join(' / ')}{tr('cf.decks.cout_moyen')}{s.avgCost.toFixed(1).replace('.', ',')}</small>
        <FamilyBar cards={cards} />
      </button>
      {problems && problems.length > 0 && <p className="cf-deck-warn">{tr('cf.decks.pas_jouable')}{cfText(problems.join(' '))}</p>}
      {open && (
        <ul className="cf-deck-list">
          {Object.entries(cards).sort(([a], [b]) => (cardDef(a)!.cost - cardDef(b)!.cost) || a.localeCompare(b)).map(([id, n]) => {
            const d = cardDef(id)!;
            return <li key={id} className={FAMILY_STYLE[d.family].cls}><CostBadge cost={d.cost} size={20} /><span>{d.name}</span><small>{TYPE_LABEL[d.type]}</small><b>×{n}</b></li>;
          })}
        </ul>
      )}
      {actions && <div className="cf-deck-actions">{actions}</div>}
    </section>
  );
}

function RenameSheet({ deck, onClose, onSave }: { deck: CfDeck; onClose: () => void; onSave: (n: string) => void }) {
  const [n, setN] = useState(deck.name);
  return (
    <Sheet title={tr('cf.decks.renommer_le_deck')} onClose={onClose}>
      <form className="cf-code" onSubmit={(e) => { e.preventDefault(); if (n.trim()) onSave(n.trim()); }}>
        <input value={n} maxLength={CF_DECK_NAME_MAX} onChange={(e) => setN(e.target.value)} aria-label={tr('cf.decks.nom_du_deck')} autoFocus />
        <button className="cf-btn gold" disabled={!n.trim()}>{tr('cf.decks.enregistrer')}</button>
      </form>
    </Sheet>
  );
}

/** « Construire automatiquement » : aperçu calculé ici, création par le serveur (route /cf/decks/auto). */
function AutoDeckSheet({ token, state, onClose, onState, show, onEdit }: { token: Tok; state: CfState; onClose: () => void; onState: (s: CfState) => void; show: (t: string, k?: 'ok' | 'err') => void; onEdit: (id: string | null, cards?: Record<string, number>, name?: string) => void }) {
  const owned = ownedCounts(state);
  const preview = useMemo(() => buildAutoDeck(owned), [state.collection]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const name = (() => { for (let i = 1; ; i++) { const n = i === 1 ? tr('cf.decks.deck_automatique') : tr('cf.decks.deck_automatique_2', { i: i }); if (!state.decks.some((d) => d.name === n)) return n; } })();
  const create = async () => {
    setBusy(true);
    try {
      try {
        const r = await api<{ ok: true; state: CfState }>('/cf/decks/auto', { token, body: { name } });
        onState(r.state);
      } catch (e) {
        // Route pas encore en ligne : on enregistre le même deck, construit ici.
        if (!(e instanceof ApiError && e.status === 404) || !preview) throw e;
        const r = await cfCreateDeck(token, name, preview);
        onState(r.state);
      }
      sound.validate();
      show(tr('cf.decks.cree', { name: name }));
      onClose();
    } catch (e) { show(e instanceof Error ? cfText(e.message) : tr('cf.decks.construction_impossible'), 'err'); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title={tr('cf.decks.construire_automatiquement')} onClose={onClose}>
      {preview ? (
        <>
          <p className="cf-sheet-note">{tr('cf.decks.le_jeu_choisit_vos_deux_familles')}</p>
          <div className="cf-auto-stats"><Curve cards={preview} /><FamilyBar cards={preview} /></div>
          <ul className="cf-deck-list compact">
            {Object.entries(preview).sort(([a], [b]) => cardDef(a)!.cost - cardDef(b)!.cost).map(([id, n]) => { const d = cardDef(id)!; return <li key={id} className={FAMILY_STYLE[d.family].cls}><CostBadge cost={d.cost} size={18} /><span>{d.name}</span><b>×{n}</b></li>; })}
          </ul>
          <div className="cf-foot-row">
            <button className="cf-btn ghost" onClick={() => { onClose(); onEdit(null, preview, name); }}>{tr('cf.decks.retoucher_d_abord')}</button>
            <button className="cf-btn gold" disabled={busy} onClick={() => void create()}>{tr('cf.decks.creer_ce_deck')}</button>
          </div>
        </>
      ) : <p className="cf-sheet-note">{tr('cf.decks.il_vous_faut_au_moins')}{CF_RULES.deckSize}{tr('cf.decks.cartes_utilisables_vous_en_avez')}{usableCount(owned)}{tr('cf.decks.ouvrez_des_boosters_ou_fabriquez_des')}</p>}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------
// Éditeur

export function DeckEditor({ token, state, onState, deckId, initial, initialName, onBack }: {
  token: Tok; state: CfState; onState: (s: CfState) => void; deckId: string | null; initial?: Record<string, number>; initialName?: string; onBack: () => void;
}) {
  const [cards, setCards] = useState<Record<string, number>>(() => ({ ...(initial ?? {}) }));
  const [name, setName] = useState(initialName ?? (() => { for (let i = 1; ; i++) { const n = tr('cf.decks.mon_deck', { i: i }); if (!state.decks.some((d) => d.name === n)) return n; } })());
  const [fam, setFam] = useState<CardFamily | ''>('');
  const [type, setType] = useState<CardType | ''>('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [toast, show] = useCfToast();
  const owned = ownedCounts(state);
  const stats = deckStats(cards);
  const alerts = deckAlerts(cards, CF_RULES.deckSize);
  const problems = deckProblems(cards, owned);
  const dirty = JSON.stringify(cards) !== JSON.stringify(initial ?? {}) || name !== (initialName ?? '');
  const pool = CARDS.filter((c) => (owned[c.id] ?? 0) > 0 && (!fam || c.family === fam) && (!type || c.type === type));
  const limit = (id: string) => Math.min(owned[id] ?? 0, cfMaxUseful(id));
  const add = (id: string) => {
    const n = cards[id] ?? 0;
    if (stats.total >= CF_RULES.deckSize) { show(tr('cf.decks.le_deck_est_complet_cartes_retirez', { deckSize: CF_RULES.deckSize }), 'err'); return; }
    if (n >= limit(id)) { show(n >= cfMaxUseful(id) ? tr('cf.decks.exemplaire_au_plus', { a: (cardDef(id)?.name)!, b: cfMaxUseful(id), s: cfMaxUseful(id) > 1 ? 's' : '' }) : tr('cf.decks.vous_n_avez_que_exemplaire', { a: owned[id], s: (owned[id] ?? 0) > 1 ? 's' : '' }), 'err'); return; }
    // Règle de construction (0.40) : 2 familles au plus, une seule légendaire.
    const d = cardDef(id)!;
    const inDeck = Object.keys(cards).filter((x) => (cards[x] ?? 0) > 0).map((x) => cardDef(x)!);
    const fams = [...new Set(inDeck.map((c) => c.family))];
    if (!fams.includes(d.family) && fams.length >= DECK_RULES.maxFamilies) {
      show(tr('cf.decks.familles_au_plus_par_deck_vous', { maxFamilies: DECK_RULES.maxFamilies, a: fams.map((f) => FAMILY_LABEL[f]).join(' et '), b: FAMILY_LABEL[d.family] }), 'err');
      return;
    }
    const legends = inDeck.filter((c) => c.rarity === 'legendaire');
    if (d.rarity === 'legendaire' && !n && legends.length >= DECK_RULES.maxLegendaries) {
      show(tr('cf.decks.une_seule_legendaire_par_deck_retire', { a: legends.map((c) => c.name).join(', ') }), 'err');
      return;
    }
    sound.click();
    setCards((c) => ({ ...c, [id]: n + 1 }));
  };
  const remove = (id: string) => {
    sound.click();
    setCards((c) => { const n = (c[id] ?? 0) - 1; const o = { ...c }; if (n > 0) o[id] = n; else delete o[id]; return o; });
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = deckId ? await cfUpdateDeck(token, deckId, { name: name.trim(), cards }) : await cfCreateDeck(token, name.trim(), cards);
      onState(r.state);
      sound.validate();
      onBack();
    } catch (e) { show(e instanceof Error ? cfText(e.message) : tr('cf.decks.enregistrement_impossible'), 'err'); }
    finally { setBusy(false); }
  };
  const back = async () => { if (!dirty || await askConfirm(tr('cf.decks.quitter_sans_enregistrer_ce_deck'), tr('cf.decks.quitter'))) onBack(); };
  const w = Math.floor((Math.min(560, typeof window !== 'undefined' ? window.innerWidth : 360) - 32 - 20) / 3);
  const complete = stats.total === CF_RULES.deckSize && problems.length === 0;

  return (
    <CfShell title={deckId ? tr('cf.decks.modifier_le_deck') : tr('cf.decks.nouveau_deck')} onBack={() => void back()} className="cf-editor"
      right={<span className={`cf-counter${stats.total === CF_RULES.deckSize ? ' full' : stats.total > CF_RULES.deckSize ? ' over' : ''}`} aria-label={tr('cf.decks.cartes_sur', { total: stats.total, deckSize: CF_RULES.deckSize })}>{stats.total}/{CF_RULES.deckSize}</span>}
      foot={<button className="cf-btn gold big" disabled={busy || !complete || !name.trim()} onClick={() => void save()}>{complete ? tr('cf.decks.enregistrer_le_deck') : tr('cf.decks.encore_carte', { a: Math.max(0, CF_RULES.deckSize - stats.total), s: CF_RULES.deckSize - stats.total > 1 ? 's' : '' })}</button>}>
      <input className="cf-name-input" value={name} maxLength={CF_DECK_NAME_MAX} onChange={(e) => setName(e.target.value)} aria-label={tr('cf.decks.nom_du_deck')} />
      <div className="cf-ed-stats">
        <Curve cards={cards} />
        <div className="cf-ed-dist">
          <FamilyBar cards={cards} />
          <span className="cf-ed-types">{TYPES.filter((t) => stats.types[t]).map((t) => <small key={t}>{TYPE_LABEL[t]} {stats.types[t]}</small>)}{!stats.total && <small>{tr('cf.decks.touchez_une_carte_pour_l_ajouter')}</small>}</span>
        </div>
      </div>
      <p className="cf-deck-rule">{tr('cf.decks.regle')}{cfText(deckRuleText())}.</p>
      {alerts.length > 0 && <ul className="cf-alerts">{alerts.map((a, i) => <li key={i} className={a.level}>{a.text}</li>)}</ul>}
      {problems.filter((p) => !/exactement/.test(p)).map((p, i) => <p key={i} className="cf-deck-warn">{cfText(p)}</p>)}

      {stats.total > 0 && (
        <ul className="cf-deck-list editable">
          {Object.entries(cards).sort(([a], [b]) => (cardDef(a)!.cost - cardDef(b)!.cost) || a.localeCompare(b)).map(([id, n]) => {
            const d = cardDef(id)!;
            return (
              <li key={id} className={FAMILY_STYLE[d.family].cls}>
                <CostBadge cost={d.cost} size={20} /><span>{d.name}</span><b>×{n}</b>
                <button onClick={() => remove(id)} aria-label={tr('cf.decks.retirer', { name: d.name })}>−</button>
                <button onClick={() => add(id)} aria-label={tr('cf.decks.ajouter', { name: d.name })} disabled={n >= limit(id) || stats.total >= CF_RULES.deckSize}>+</button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="cf-filters">
        <div className="cf-selects two">
          <select value={fam} onChange={(e) => setFam(e.target.value as CardFamily | '')} aria-label={tr('cf.collection.famille')}><option value="">{tr('cf.decks.toutes_les_familles')}</option>{FAMS.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value as CardType | '')} aria-label={tr('cf.collection.type')}><option value="">{tr('cf.decks.tous_les_types')}</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
        </div>
      </div>
      <div className="cf-grid" style={{ ['--w' as string]: `${w}px` }}>
        {pool.map((c) => {
          const n = cards[c.id] ?? 0;
          return (
            <div key={c.id} className={`cf-pool${n ? ' in' : ''}`}>
              <CardView id={c.id} width={w} selected={n > 0} onClick={() => add(c.id)} zoom="press" />
              <div className="cf-pool-bar">
                <button onClick={() => remove(c.id)} disabled={!n} aria-label={tr('cf.decks.retirer', { name: c.name })}>−</button>
                <span>{n}/{limit(c.id)}</span>
                <button onClick={() => setZoom(c.id)} aria-label={tr('cf.decks.voir_en_grand', { name: c.name })}><Icon name="search" size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {zoom && <div className="cf-zoom" role="dialog" aria-modal="true" onClick={() => setZoom(null)}><CardView id={zoom} width={Math.min(260, vw() - 60)} /><button className="cf-btn ghost">{tr('cf.boardparts.fermer')}</button></div>}
      {toast}
    </CfShell>
  );
}
