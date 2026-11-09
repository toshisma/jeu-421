/**
 * Coups Fourrés : version traduite des données du catalogue pour les écrans (noms, textes, familles…).
 * Le moteur et le serveur restent en français et en identifiants ; seul l'affichage passe par ici.
 */
import * as cat from '../../../shared/cards/catalog';
import type { CardDef, CardFamily, CardRarity, CardType } from '../../../shared/cards/catalog';
import { getLang, tr, trServer } from '../i18n/lang';
import { looseCf, trCombo } from '../../../shared/i18n/zones/cartes-rules';
import type { MessageKey } from '../../../shared/i18n';

const k = (s: string) => s as MessageKey;

let cacheLang = '';
let byId: Record<string, CardDef> = {};
let list: CardDef[] = [];
function refresh() {
  const l = getLang();
  if (l === cacheLang) return;
  cacheLang = l;
  list = cat.CARDS.map((d) => (l === 'fr' ? d : { ...d, name: tr(k(`cf.card.${d.id}.n`)), text: tr(k(`cf.card.${d.id}.t`)), flavor: tr(k(`cf.card.${d.id}.f`)) }));
  byId = Object.fromEntries(list.map((d) => [d.id, d]));
}
const proxyRecord = <V>(target: Record<string, V>, get: (key: string) => V | undefined): Record<string, V> => new Proxy(target, { get: (_t, p) => (typeof p === 'string' ? get(p) : undefined) });

export const CARDS: CardDef[] = new Proxy(cat.CARDS, {
  get(_t, p) { refresh(); const v = (list as unknown as Record<string | symbol, unknown>)[p]; return typeof v === 'function' ? (v as () => unknown).bind(list) : v; },
});
export const CARD_BY_ID: Record<string, CardDef> = proxyRecord(cat.CARD_BY_ID, (id) => { refresh(); return byId[id]; });
export const cardDef = (id: string): CardDef | undefined => { refresh(); return byId[id]; };
export const FAMILY_LABEL = proxyRecord<string>(cat.FAMILY_LABEL, (f) => tr(k(`cf.fam.${f}`))) as Record<CardFamily, string>;
export const TYPE_LABEL = proxyRecord<string>(cat.TYPE_LABEL, (t) => tr(k(`cf.type.${t}`))) as Record<CardType, string>;
export const RARITY_LABEL = proxyRecord<string>(cat.RARITY_LABEL, (r) => tr(k(`cf.rar.${r}`))) as Record<CardRarity, string>;

const WORD: Record<string, string> = { exemplaire: 'exemplaire', Tournée: 'tournee', carte: 'carte', jeton: 'jeton', lancer: 'lancer', dé: 'de', manche: 'manche', piège: 'piege', essai: 'essai', Habitué: 'habitue', joueur: 'joueur', inscrit: 'inscrit' };
/** « 2 Tournées » dans la langue du joueur (Mot français = identifiant, comme dans le code du jeu). */
export function plural(n: number, w: string): string {
  const id = WORD[w];
  if (!id) return getLang() === 'fr' ? `${n} ${w}${n > 1 ? 's' : ''}` : `${n} ${w}`;
  return `${n} ${tr(k(`cf.w.${id}.${n > 1 ? 'n' : '1'}`))}`;
}
/** Nom de carte dans la langue (utile pour un nom lu dans un texte du moteur). */
export const cardNameOf = (id: string | undefined): string => (id ? cardDef(id)?.name ?? '' : '');
/** Combinaison du moteur dans la langue (« Brelan de 5 » → « Three 5s »). */
export const comboLabel = (label: string): string => trCombo(getLang(), label);
/** Message français du moteur ou du serveur dans la langue (point final facultatif, noms de cartes reconnus au passage). */
export function cfText(text: string): string {
  const l = getLang();
  if (l === 'fr') return text;
  const r = trServer(text);
  if (r !== text) return r;
  for (const end of ['.', ' !', '.!']) {
    const d = trServer(text + end);
    if (d !== text + end) return d.replace(/[.!]\s*$/, '');
  }
  const c = trCombo(l, text);
  return c !== text ? c : looseCf(l, text);
}
