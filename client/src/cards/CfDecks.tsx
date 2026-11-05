/**
 * Coups Fourrés : mes decks (5 au plus, deck actif, créer / renommer / supprimer, construire
 * automatiquement) et l'éditeur de deck (ajout / retrait au toucher, compteur 20, courbe des coûts,
 * répartition par famille et par type, conseils).
 */
import { useMemo, useState } from 'react';
import { CARDS, CF_RULES, FAMILY_LABEL, STARTER_DECKS, TYPE_LABEL, cardDef, deckProblems, type CardFamily, type CardType } from '../../../shared/cards/catalog';
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
    <div className="cf-curve" aria-label={`Courbe des coûts : ${s.curve.map((n, i) => `${n} à ${i === 4 ? '4 et plus' : i}`).join(', ')}`}>
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
    try { const r = await f(); onState(r.state); if (ok) show(ok); } catch (e) { show(e instanceof Error ? e.message : 'Action impossible.', 'err'); } finally { setBusy(false); }
  };
  if (!state) {
    return (
      <CfShell title="Mes decks" sub="Decks de départ" onBack={onBack}>
        <button className="cf-guest-card" onClick={onAccount}><b>Vos propres decks</b><small>Avec un compte gratuit : jusqu’à 5 decks, construits avec vos cartes.</small><em>Créer un compte</em></button>
        {STARTER_DECKS.map((d) => <DeckRow key={d.id} name={d.name} cards={d.cards} />)}
      </CfShell>
    );
  }
  const full = decks.length >= CF_MAX_DECKS;
  return (
    <CfShell title="Mes decks" sub={`${decks.length}/${CF_MAX_DECKS} decks · 20 cartes chacun`} onBack={onBack}
      foot={<div className="cf-foot-row">
        <button className="cf-btn violet" disabled={full || busy} onClick={() => onEdit(null)}><Icon name="plus" size={18} />Nouveau deck</button>
        <button className="cf-btn gold" disabled={full || busy} onClick={() => setAuto(true)}>Construire automatiquement</button>
      </div>}>
      {full && <p className="cf-muted center">5 decks au plus : supprimez-en un pour en créer un autre.</p>}
      {decks.map((d) => (
        <DeckRow key={d.id} name={d.name} cards={d.cards} active={state.activeDeck === d.id} problems={d.valid ? [] : d.problems}
          actions={<>
            {state.activeDeck !== d.id && d.valid && <button className="cf-btn small violet" disabled={busy} onClick={() => void run(() => cfSetActiveDeck(token, d.id), `« ${d.name} » est votre deck actif.`)}>Activer</button>}
            <button className="cf-btn small ghost" onClick={() => onEdit(d.id, d.cards, d.name)}>Modifier</button>
            <button className="cf-btn small ghost" onClick={() => setRename(d)}>Renommer</button>
            <button className="cf-btn small ghost danger" disabled={busy} onClick={async () => { if (await askConfirm(`Supprimer le deck « ${d.name} » ? Vos cartes restent dans la collection.`, 'Supprimer')) void run(() => cfDeleteDeck(token, d.id), 'Deck supprimé.'); }}>Supprimer</button>
          </>} />
      ))}
      {!decks.length && <p className="cf-empty">Aucun deck pour l’instant : créez-en un, ou laissez le jeu le construire avec vos cartes.</p>}
      {rename && <RenameSheet deck={rename} onClose={() => setRename(null)} onSave={(n) => { setRename(null); void run(() => cfRenameDeck(token, rename.id, n), 'Deck renommé.'); }} />}
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
        <span className="cf-deck-name"><b>{name}</b>{active && <em>Actif</em>}</span>
        <small>{s.total} cartes · {FAMS.filter((f) => s.families[f]).map((f) => FAMILY_SHORT[f]).join(' / ')} · coût moyen {s.avgCost.toFixed(1).replace('.', ',')}</small>
        <FamilyBar cards={cards} />
      </button>
      {problems && problems.length > 0 && <p className="cf-deck-warn">Pas jouable : {problems.join(' ')}</p>}
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
    <Sheet title="Renommer le deck" onClose={onClose}>
      <form className="cf-code" onSubmit={(e) => { e.preventDefault(); if (n.trim()) onSave(n.trim()); }}>
        <input value={n} maxLength={CF_DECK_NAME_MAX} onChange={(e) => setN(e.target.value)} aria-label="Nom du deck" autoFocus />
        <button className="cf-btn gold" disabled={!n.trim()}>Enregistrer</button>
      </form>
    </Sheet>
  );
}

/** « Construire automatiquement » : aperçu calculé ici, création par le serveur (route /cf/decks/auto). */
function AutoDeckSheet({ token, state, onClose, onState, show, onEdit }: { token: Tok; state: CfState; onClose: () => void; onState: (s: CfState) => void; show: (t: string, k?: 'ok' | 'err') => void; onEdit: (id: string | null, cards?: Record<string, number>, name?: string) => void }) {
  const owned = ownedCounts(state);
  const preview = useMemo(() => buildAutoDeck(owned), [state.collection]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const name = (() => { for (let i = 1; ; i++) { const n = i === 1 ? 'Deck automatique' : `Deck automatique ${i}`; if (!state.decks.some((d) => d.name === n)) return n; } })();
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
      show(`« ${name} » créé.`);
      onClose();
    } catch (e) { show(e instanceof Error ? e.message : 'Construction impossible.', 'err'); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="Construire automatiquement" onClose={onClose}>
      {preview ? (
        <>
          <p className="cf-sheet-note">Le jeu choisit vos deux familles les mieux fournies et garde une courbe de coûts jouable. Vous pourrez le modifier ensuite.</p>
          <div className="cf-auto-stats"><Curve cards={preview} /><FamilyBar cards={preview} /></div>
          <ul className="cf-deck-list compact">
            {Object.entries(preview).sort(([a], [b]) => cardDef(a)!.cost - cardDef(b)!.cost).map(([id, n]) => { const d = cardDef(id)!; return <li key={id} className={FAMILY_STYLE[d.family].cls}><CostBadge cost={d.cost} size={18} /><span>{d.name}</span><b>×{n}</b></li>; })}
          </ul>
          <div className="cf-foot-row">
            <button className="cf-btn ghost" onClick={() => { onClose(); onEdit(null, preview, name); }}>Retoucher d’abord</button>
            <button className="cf-btn gold" disabled={busy} onClick={() => void create()}>Créer ce deck</button>
          </div>
        </>
      ) : <p className="cf-sheet-note">Il vous faut au moins {CF_RULES.deckSize} cartes utilisables (vous en avez {usableCount(owned)}). Ouvrez des boosters ou fabriquez des cartes.</p>}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------
// Éditeur

export function DeckEditor({ token, state, onState, deckId, initial, initialName, onBack }: {
  token: Tok; state: CfState; onState: (s: CfState) => void; deckId: string | null; initial?: Record<string, number>; initialName?: string; onBack: () => void;
}) {
  const [cards, setCards] = useState<Record<string, number>>(() => ({ ...(initial ?? {}) }));
  const [name, setName] = useState(initialName ?? (() => { for (let i = 1; ; i++) { const n = `Mon deck ${i}`; if (!state.decks.some((d) => d.name === n)) return n; } })());
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
    if (stats.total >= CF_RULES.deckSize) { show(`Le deck est complet (${CF_RULES.deckSize} cartes) : retirez-en une d’abord.`, 'err'); return; }
    if (n >= limit(id)) { show(n >= cfMaxUseful(id) ? `${cardDef(id)?.name} : ${cfMaxUseful(id)} exemplaire${cfMaxUseful(id) > 1 ? 's' : ''} au plus.` : `Vous n’avez que ${owned[id]} exemplaire${(owned[id] ?? 0) > 1 ? 's' : ''}.`, 'err'); return; }
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
    } catch (e) { show(e instanceof Error ? e.message : 'Enregistrement impossible.', 'err'); }
    finally { setBusy(false); }
  };
  const back = async () => { if (!dirty || await askConfirm('Quitter sans enregistrer ce deck ?', 'Quitter')) onBack(); };
  const w = Math.floor((Math.min(560, typeof window !== 'undefined' ? window.innerWidth : 360) - 32 - 20) / 3);
  const complete = stats.total === CF_RULES.deckSize && problems.length === 0;

  return (
    <CfShell title={deckId ? 'Modifier le deck' : 'Nouveau deck'} onBack={() => void back()} className="cf-editor"
      right={<span className={`cf-counter${stats.total === CF_RULES.deckSize ? ' full' : stats.total > CF_RULES.deckSize ? ' over' : ''}`} aria-label={`${stats.total} cartes sur ${CF_RULES.deckSize}`}>{stats.total}/{CF_RULES.deckSize}</span>}
      foot={<button className="cf-btn gold big" disabled={busy || !complete || !name.trim()} onClick={() => void save()}>{complete ? 'Enregistrer le deck' : `Encore ${Math.max(0, CF_RULES.deckSize - stats.total)} carte${CF_RULES.deckSize - stats.total > 1 ? 's' : ''}`}</button>}>
      <input className="cf-name-input" value={name} maxLength={CF_DECK_NAME_MAX} onChange={(e) => setName(e.target.value)} aria-label="Nom du deck" />
      <div className="cf-ed-stats">
        <Curve cards={cards} />
        <div className="cf-ed-dist">
          <FamilyBar cards={cards} />
          <span className="cf-ed-types">{TYPES.filter((t) => stats.types[t]).map((t) => <small key={t}>{TYPE_LABEL[t]} {stats.types[t]}</small>)}{!stats.total && <small>Touchez une carte pour l’ajouter.</small>}</span>
        </div>
      </div>
      {alerts.length > 0 && <ul className="cf-alerts">{alerts.map((a, i) => <li key={i} className={a.level}>{a.text}</li>)}</ul>}
      {problems.filter((p) => !/exactement/.test(p)).map((p, i) => <p key={i} className="cf-deck-warn">{p}</p>)}

      {stats.total > 0 && (
        <ul className="cf-deck-list editable">
          {Object.entries(cards).sort(([a], [b]) => (cardDef(a)!.cost - cardDef(b)!.cost) || a.localeCompare(b)).map(([id, n]) => {
            const d = cardDef(id)!;
            return (
              <li key={id} className={FAMILY_STYLE[d.family].cls}>
                <CostBadge cost={d.cost} size={20} /><span>{d.name}</span><b>×{n}</b>
                <button onClick={() => remove(id)} aria-label={`Retirer ${d.name}`}>−</button>
                <button onClick={() => add(id)} aria-label={`Ajouter ${d.name}`} disabled={n >= limit(id) || stats.total >= CF_RULES.deckSize}>+</button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="cf-filters">
        <div className="cf-selects two">
          <select value={fam} onChange={(e) => setFam(e.target.value as CardFamily | '')} aria-label="Famille"><option value="">Toutes les familles</option>{FAMS.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value as CardType | '')} aria-label="Type"><option value="">Tous les types</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
        </div>
      </div>
      <div className="cf-grid" style={{ ['--w' as string]: `${w}px` }}>
        {pool.map((c) => {
          const n = cards[c.id] ?? 0;
          return (
            <div key={c.id} className={`cf-pool${n ? ' in' : ''}`}>
              <CardView id={c.id} width={w} selected={n > 0} onClick={() => add(c.id)} />
              <div className="cf-pool-bar">
                <button onClick={() => remove(c.id)} disabled={!n} aria-label={`Retirer ${c.name}`}>−</button>
                <span>{n}/{limit(c.id)}</span>
                <button onClick={() => setZoom(c.id)} aria-label={`Voir ${c.name} en grand`}><Icon name="search" size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {zoom && <div className="cf-zoom" role="dialog" aria-modal="true" onClick={() => setZoom(null)}><CardView id={zoom} width={Math.min(260, vw() - 60)} /><button className="cf-btn ghost">Fermer</button></div>}
      {toast}
    </CfShell>
  );
}
