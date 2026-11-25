/**
 * L'arrivage du mois : chaque mois (calendrier de Bruxelles), un objet original en vente CE MOIS-LÀ
 * seulement (champ `arrival` du catalogue : premier mois « AAAA-MM »), puis de nouveau le même mois
 * les années suivantes. Mis en avant en haut de la boutique (client/src/ui/ShopScreen.tsx).
 * Le serveur refuse l'achat hors de son mois (canBuy de profile.ts, appelé par /shop/buy avec today()).
 * Acheté, l'objet reste à vie. Textes : zone `thm.` (`thm.item.<id>`, `thm.arr.head.<id>`).
 */
import { ITEMS, type Item } from './catalog';

export const ARRIVALS: readonly Item[] = ITEMS.filter((i) => !!i.arrival);

/** L'objet d'arrivage `item` est-il en vente le jour `day` (AAAA-MM-JJ, Bruxelles) ? */
export function arrivalOpen(item: Pick<Item, 'arrival'>, day: string): boolean {
  if (!item.arrival) return false;
  const ym = day.slice(0, 7);
  return ym >= item.arrival && ym.slice(5, 7) === item.arrival.slice(5, 7);
}

/** Objets de l'arrivage du mois de `day`. */
export const arrivalsOf = (day: string): Item[] => ARRIVALS.filter((i) => arrivalOpen(i, day));

/** Dernier jour du mois de `day` (AAAA-MM-JJ). */
export function monthEnd(day: string): string {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Jours de vente restants, aujourd'hui compris (1 = dernier jour). */
export const arrivalDaysLeft = (day: string): number => Number(monthEnd(day).slice(8, 10)) - Number(day.slice(8, 10)) + 1;

/** Ligne courte pour le fil d'actualité de l'accueil (clé i18n `thm.arr.head.<id>`), null sans arrivage. */
export function arrivalHeadline(day: string): { id: string; icon: string; key: string; params?: Record<string, string | number> } | null {
  const it = arrivalsOf(day)[0];
  if (!it) return null;
  return { id: `arrival-${day.slice(0, 7)}`, icon: '📦', key: `thm.arr.head.${it.id}` };
}
