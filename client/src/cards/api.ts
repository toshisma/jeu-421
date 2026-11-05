/**
 * « Coups Fourrés » : appels à l'API du mode cartes (comptes seulement ; un invité reçoit une
 * erreur 401 « Session expirée »). Chaque action renvoie l'état complet du joueur à jour (`state`).
 * Les erreurs arrivent en ApiError (message en français, prêt à afficher ; `status` 409 pour
 * « confirmez » sur le recyclage d'exemplaires utiles).
 */
import { api } from '../account/api';
import type { CfDivision, CfLeagueBoard, CfOpenedCard, CfState } from '../../../shared/cards/progress';

export type { CfState, CfOpenedCard, CfLeagueBoard, CfDivision };
type Tok = string | null | undefined;
type WithState<T = object> = T & { ok: true; state: CfState };

/** Tout l'état du joueur pour le mode (collection, decks, capsules, missions, ligue, historique). */
export const cfMe = (token: Tok) => api<WithState>('/cf/me', { token }).then((r) => r.state);

/** Première visite : 2 decks de départ + 3 boosters (une seule fois ; 409 ensuite). */
export const cfDiscover = (token: Tok) => api<WithState<{ boosters: number }>>('/cf/discover', { token, body: {} });

/** Achète un booster (100 capsules). */
export const cfBuyBooster = (token: Tok) => api<WithState<{ capsules: number }>>('/cf/booster/buy', { token, body: {} });

/** Ouvre un booster : 5 cartes dans l'ordre d'ouverture (rareté, brillante, nouvelle). */
export const cfOpenBooster = (token: Tok) => api<WithState<{ cards: CfOpenedCard[] }>>('/cf/booster/open', { token, body: {} });

/** Fabrique un exemplaire avec des éclats de verre. */
export const cfCraft = (token: Tok, cardId: string) => api<WithState<{ shards: number }>>('/cf/craft', { token, body: { cardId } });

/**
 * Recycle des exemplaires. Sans `confirm`, seuls les exemplaires en trop (au-delà du maximum utile)
 * sont acceptés ; au-delà, le serveur répond 409 et le client demande confirmation puis rappelle
 * avec `confirm: true`. Jamais si un deck devient injouable (409 avec le nom du deck).
 */
export const cfRecycle = (token: Tok, cardId: string, count = 1, confirm = false) =>
  api<WithState<{ shards: number; gained: number }>>('/cf/recycle', { token, body: { cardId, count, confirm } });

/** Recycle tous les exemplaires en trop d'un coup. */
export const cfRecycleExtras = (token: Tok) => api<WithState<{ shards: number; gained: number; cards: number }>>('/cf/recycle-extras', { token, body: {} });

/** « Légende du zinc » : réclame la carte légendaire choisie. */
export const cfLegendPick = (token: Tok, cardId: string) => api<WithState<{ cardId: string }>>('/cf/legend-pick', { token, body: { cardId } });

/** Decks (5 au plus, 20 cartes, cartes possédées). */
export const cfCreateDeck = (token: Tok, name: string, cards: Record<string, number>) =>
  api<WithState<{ id: string }>>('/cf/decks', { token, body: { name, cards } });
export const cfUpdateDeck = (token: Tok, id: string, patch: { name?: string; cards?: Record<string, number> }) =>
  api<WithState<{ id: string }>>(`/cf/decks/${encodeURIComponent(id)}`, { token, body: patch });
export const cfRenameDeck = (token: Tok, id: string, name: string) => cfUpdateDeck(token, id, { name });
export const cfDeleteDeck = (token: Tok, id: string) =>
  api<WithState<{ id: string }>>(`/cf/decks/${encodeURIComponent(id)}`, { token, method: 'DELETE' });
export const cfSetActiveDeck = (token: Tok, id: string) =>
  api<WithState<{ id: string }>>(`/cf/decks/${encodeURIComponent(id)}/active`, { token, body: {} });

/** Ligue : ma division et mes points, saison, fin de saison, top 50. */
export const cfLeague = (token: Tok) => api<CfLeagueBoard & { ok: true }>('/cf/league', { token });
