/**
 * Coups Fourrés : choisir son deck AVANT chaque partie (demande de Sam, novembre : « il faut qu'on puisse
 * choisir son deck avant que la partie se lance, peu importe le type de partie »).
 *
 * - `DeckPicker` : les decks du joueur en tuiles (nom, familles, légendaire éventuelle) ; le deck actif
 *   est présélectionné et marqué ; un deck pas jouable est grisé avec la raison (il ne peut pas être choisi).
 * - `DeckChoiceSheet` : la feuille « Avec quel deck ? » ouverte avant la partie classée, un défi (envoyé
 *   ou accepté), une table entre amis (créée ou rejointe).
 * - `DeckBadge` : petit rappel du deck choisi (salle d'attente, salon de la table).
 */
import { useMemo, useState } from 'react';
import { CARD_BY_ID, FAMILY_LABEL, type CardFamily } from '../../../shared/cards/catalog';
import { Sheet } from '../ui/kit';
import { FAMILY_STYLE } from './meta';
import { CardArt } from './art';
import type { CfState } from './api';

export interface DeckOption { id: string; name: string; cards: Record<string, number>; valid: boolean; problems: string[] }

/** Familles d'un deck (de la plus fournie à la moins fournie) et sa carte vedette (légendaire, sinon la plus présente). */
export function deckSummary(cards: Record<string, number>): { families: CardFamily[]; star: string | null; legend: string | null; count: number } {
  const per = new Map<CardFamily, number>();
  let legend: string | null = null;
  let star: string | null = null;
  let best = 0;
  let count = 0;
  for (const [id, n] of Object.entries(cards)) {
    const d = CARD_BY_ID[id];
    if (!d || n <= 0) continue;
    count += n;
    per.set(d.family, (per.get(d.family) ?? 0) + n);
    if (d.rarity === 'legendaire') legend = id;
    if (n > best || (n === best && star && (CARD_BY_ID[star]?.cost ?? 0) < d.cost)) { best = n; star = id; }
  }
  const families = [...per].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  return { families, star: legend ?? star, legend, count };
}

/** Rappel compact d'un deck : petite illustration, nom, familles. */
export function DeckBadge({ deck, label = 'Votre deck' }: { deck: { name: string; cards?: Record<string, number> } | null; label?: string }) {
  if (!deck) return null;
  const s = deck.cards ? deckSummary(deck.cards) : null;
  return (
    <span className="cf-deckbadge">
      {s?.star && <span className="cf-deckbadge-art" aria-hidden><CardArt id={s.star} /></span>}
      <span><small>{label}</small><b>« {deck.name} »</b>{s && s.families.length > 0 && <em>{s.families.map((f) => FAMILY_LABEL[f]).join(' · ')}</em>}</span>
    </span>
  );
}

export function DeckPicker({ decks, value, active, onChange }: { decks: DeckOption[]; value: string | null; active: string | null; onChange: (id: string) => void }) {
  // Jouables d'abord, le deck actif en tête.
  const list = useMemo(() => [...decks].sort((a, b) => Number(b.valid) - Number(a.valid) || Number(b.id === active) - Number(a.id === active)), [decks, active]);
  if (!decks.length) return <p className="cf-muted">Aucun deck : construisez-en un dans « Mes decks ».</p>;
  return (
    <div className="cf-decklist" role="radiogroup" aria-label="Votre deck pour cette partie">
      {list.map((d) => {
        const s = deckSummary(d.cards);
        const on = d.id === value;
        return (
          <button key={d.id} type="button" role="radio" aria-checked={on} disabled={!d.valid} className={`cf-decktile${on ? ' on' : ''}${d.valid ? '' : ' bad'}`} onClick={() => onChange(d.id)}>
            <span className="cf-decktile-art" aria-hidden style={s.families[0] ? { background: `linear-gradient(160deg, ${FAMILY_STYLE[s.families[0]].c1}, ${FAMILY_STYLE[s.families[0]].c2})` } : undefined}>
              {s.star && <CardArt id={s.star} />}
            </span>
            <span className="cf-decktile-tx">
              <b>{d.name}{d.id === active && <em className="cf-decktile-act">actif</em>}</b>
              <small>{s.families.length ? s.families.map((f) => FAMILY_LABEL[f]).join(' · ') : 'Vide'}{s.legend ? ` · ★ ${CARD_BY_ID[s.legend]?.name}` : ''}</small>
              {!d.valid && <small className="cf-decktile-why">Pas jouable : {d.problems.join(' ')}</small>}
            </span>
            <i className="cf-decktile-dot" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/** Feuille « Avec quel deck ? » avant une partie en ligne. */
export function DeckChoiceSheet({ st, title, intro, confirm, onConfirm, onClose, onDecks }: {
  st: CfState | null; title: string; intro?: string; confirm: string; onConfirm: (deckId: string) => void; onClose: () => void; onDecks?: () => void;
}) {
  const decks = st?.decks ?? [];
  const firstValid = decks.find((d) => d.id === st?.activeDeck && d.valid)?.id ?? decks.find((d) => d.valid)?.id ?? null;
  const [id, setId] = useState<string | null>(firstValid);
  const chosen = decks.find((d) => d.id === id && d.valid) ?? null;
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="cf-deckchoice">
        {intro && <p className="cf-sheet-note">{intro}</p>}
        <DeckPicker decks={decks} value={id} active={st?.activeDeck ?? null} onChange={setId} />
        {onDecks && <button className="cf-link" onClick={onDecks}>Modifier mes decks</button>}
        <button className="cf-btn gold big" disabled={!chosen} onClick={() => chosen && onConfirm(chosen.id)}>{chosen ? `${confirm} avec « ${chosen.name} »` : 'Choisissez un deck jouable'}</button>
      </div>
    </Sheet>
  );
}
