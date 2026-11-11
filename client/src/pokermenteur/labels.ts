/**
 * Noms des mains et des faces dans la langue du joueur (« Full aux Rois par les 10 », « Kings full of Tens »…).
 * Faces : `pm.face.<0-5>` (lettres du dé : fr 9 10 V D R A, en 9 10 J Q K A, de 9 10 B D K A, nl 9 10 B V H A).
 */
import { Cat, evaluate } from '../../../shared/pokermenteur/hands';
import { tr } from '../i18n/lang';
import type { MessageKey } from '../../../shared/i18n';

const k = (s: string) => s as MessageKey;
/** Lettre de la face (sur le dé). */
export const faceLetter = (v: number) => tr(k(`pm.face.${v}`));
export const faceLetters = () => [0, 1, 2, 3, 4, 5].map(faceLetter);
/** Valeur au pluriel (« Rois »), forme « de » (« de Rois », « d’As ») et forme « aux » (« aux Rois »). */
const vp = (v: number) => tr(k(`pm.vp.${v}`));
const vd = (v: number) => tr(k(`pm.vd.${v}`));
const va = (v: number) => tr(k(`pm.va.${v}`));

/** Nom court d'une main (catégorie et valeurs principales). */
export function handName(dice: readonly number[], noStraights = false): string {
  const h = evaluate(dice, noStraights);
  const [a, b] = h.key;
  switch (h.cat) {
    case Cat.Poker: return tr('pm.h.poker' as MessageKey, { v: vd(a) });
    case Cat.Carre: return tr('pm.h.carre' as MessageKey, { v: vd(a) });
    case Cat.Full: return tr('pm.h.full' as MessageKey, { v: va(a), w: vp(b) });
    case Cat.GrandeSuite: return tr('pm.h.grande' as MessageKey);
    case Cat.PetiteSuite: return tr('pm.h.petite' as MessageKey);
    case Cat.Brelan: return tr('pm.h.brelan' as MessageKey, { v: vd(a) });
    case Cat.DoublePaire: return tr('pm.h.double' as MessageKey, { v: vp(a), w: vp(b) });
    case Cat.Paire: return tr('pm.h.paire' as MessageKey, { v: vd(a) });
    default: return tr('pm.h.rien' as MessageKey, { v: faceLetter(a) });
  }
}
/** Dés d'accompagnement (ceux qui ne font pas la catégorie), en lettres : « + A, 10, 9 ». */
export function kickers(dice: readonly number[], noStraights = false): string {
  const h = evaluate(dice, noStraights);
  const n = h.cat === Cat.Paire ? 3 : h.cat === Cat.DoublePaire ? 1 : h.cat === Cat.Brelan ? 2 : h.cat === Cat.Carre ? 1 : h.cat === Cat.Rien ? 4 : 0;
  if (!n) return '';
  const rest = h.cat === Cat.Rien ? h.key.slice(1) : h.key.slice(h.key.length - n);
  return rest.map(faceLetter).join(' · ');
}
/** Nom complet (avec les dés d'accompagnement). */
export function handFull(dice: readonly number[], noStraights = false): string {
  const kk = kickers(dice, noStraights);
  return kk ? `${handName(dice, noStraights)} (${kk})` : handName(dice, noStraights);
}
export const catName = (c: number) => tr(k(`pm.cat.${c}`));
