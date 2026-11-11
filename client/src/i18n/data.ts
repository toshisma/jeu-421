/**
 * Catalogues du jeu (dés, boutique, succès, défis, événements…) dans la langue choisie.
 * Ces listes viennent de shared/ : leur texte français reste la référence (serveur, tests). Côté navigateur,
 * applyDataLang remplace en place les noms et descriptions à chaque changement de langue, de sorte que tous
 * les écrans qui lisent `item.name` ou `ACHIEVEMENTS[i].name` s'affichent dans la bonne langue.
 * Le français est restauré à l'identique. Clés : `app.item.<id>`, `app.dc.<id>`, `app.a.<id>`… (zones/commun).
 */
import { fr, type MessageKey } from '../../../shared/i18n/fr';
import { translateServerText } from '../../../shared/i18n/server-texts';
import { LANG_LOCALE, translate, type Lang } from '../../../shared/i18n';
import { BARON } from '../../../shared/i18n/courtisan';
import { CATEGORY_LABELS, ITEMS } from '../../../shared/progress/catalog';
import { COLLECTION, FX, FX_KIND_LABEL, INVITE_DICE, RARITY_LABEL, SERIES, SHINY_SUFFIX, seasonDie } from '../../../shared/progress/dice-collection';
import { QUESTS } from '../../../shared/progress/quests';
import { ACHIEVEMENTS } from '../../../shared/progress/achievements';
import { EVENTS, shortDate } from '../../../shared/progress/events';
import { BOSSES } from '../../../shared/progress/boss';
import { DIVISIONS } from '../../../shared/season';
import { ALBUM, monthName, ofMonth, titleLabel } from '../../../shared/progress/profile';
import { PLACE_LABEL, REPORT_REASONS } from '../../../shared/moderation';
import { TDC_FELTS } from '../../../shared/progress/comptoirs';

type Dyn = Record<string, unknown>;
const k = (s: string) => s as MessageKey;
const has = (key: string) => key in fr;

interface Slot { o: Dyn; f: string; key: MessageKey }
const slots: Slot[] = [];
function add(o: object, f: string, key: string) { if (has(key)) slots.push({ o: o as Dyn, f, key: k(key) }); }

const seriesFelt = new Map(SERIES.map((s) => [s.felt, s]));
type Dynamic = { o: Dyn; f: string; fr: string; render: (lang: Lang) => string };
const dynamic: Dynamic[] = [];
function dyn(o: object, f: string, render: (lang: Lang) => string) { dynamic.push({ o: o as Dyn, f, fr: (o as Dyn)[f] as string, render }); }
const monthYear = (lang: Lang, ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(LANG_LOCALE[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' });

for (const it of ITEMS) {
  const base = it.id.replace(SHINY_SUFFIX, '');
  if (it.id !== base) { dyn(it, 'name', (l) => translate(l, k('app.shiny'), { name: translate(l, k(`app.dc.${base}`)) })); add(it, 'flavor', `app.dc.${base}.f`); continue; }
  if (/^ds-\d{4}-\d{2}$/.test(it.id)) { const ym = it.id.slice(3); dyn(it, 'name', (l) => translate(l, k('app.season_die'), { month: monthYear(l, ym) })); dyn(it, 'flavor', (l) => translate(l, k('app.season_die_f'))); continue; }
  if (TDC_FELTS.some((f) => f.id === it.id)) { add(it, 'name', `tdc.felt.${it.id}`); add(it, 'description', 'tdc.felt.d'); continue; }
  const s = seriesFelt.get(it.id);
  if (s) { dyn(it, 'name', (l) => translate(l, k('app.series_felt'), { name: translate(l, k(`app.series.${s.id}`)) })); dyn(it, 'description', (l) => translate(l, k('app.series_felt_d'), { name: translate(l, k(`app.series.${s.id}`)) })); continue; }
  if (has(`app.item.${it.id}`)) { add(it, 'name', `app.item.${it.id}`); add(it, 'description', `app.item.${it.id}.d`); continue; }
  add(it, 'name', `app.dc.${it.id}`); add(it, 'flavor', `app.dc.${it.id}.f`);
}
for (const c of [...COLLECTION, ...INVITE_DICE]) { add(c, 'name', `app.dc.${c.id}`); add(c, 'flavor', `app.dc.${c.id}.f`); }
for (const s of SERIES) { add(s, 'name', `app.series.${s.id}`); add(s, 'title', `app.series.${s.id}.t`); }
for (const f of FX) { add(f, 'name', `app.fx.${f.id}`); add(f, 'flavor', `app.fx.${f.id}.f`); }
for (const key of Object.keys(FX_KIND_LABEL)) add(FX_KIND_LABEL, key, `app.fxk.${key}`);
for (const key of Object.keys(RARITY_LABEL)) add(RARITY_LABEL, key, `app.rar.${key}`);
for (const key of Object.keys(CATEGORY_LABELS)) add(CATEGORY_LABELS, key, `app.cat.${key}`);
for (const q of QUESTS) add(q, 'text', `app.q.${q.id}`);
for (const a of ACHIEVEMENTS) { const z = a.game === 'courtisan' ? 'dm2' : a.game === 'poker' ? 'pm' : 'app'; add(a, 'name', `${z}.a.${a.id}`); add(a, 'description', `${z}.a.${a.id}.d`); }
for (const e of EVENTS) { add(e, 'name', `app.ev.${e.id}`); add(e, 'description', `app.ev.${e.id}.d`); }
for (const b of BOSSES) { add(b, 'twist', `app.boss.${b.id}.t`); if (b.id === 'baron') dyn(b, 'name', (l) => (l === 'fr' ? 'Le Baron' : BARON[l])); }
for (const d of DIVISIONS) add(d, 'name', `app.div.${d.id}`);
for (const a of ALBUM) add(a, 'name', `app.album.${a.id}`);
for (const r of REPORT_REASONS) add(r, 'label', `app.reason.${r.id}`);
for (const key of Object.keys(PLACE_LABEL)) add(PLACE_LABEL, key, `app.place.${key}`);

let dataLang: Lang = 'fr';
export function applyDataLang(lang: Lang) {
  dataLang = lang;
  for (const s of slots) s.o[s.f] = translate(lang, s.key);
  for (const d of dynamic) d.o[d.f] = lang === 'fr' ? d.fr : d.render(lang);
}

/** « de novembre 2026 » en français, « November 2026 » ailleurs. */
export const ofMonthL = (season: string) => (dataLang === 'fr' ? ofMonth(season) : monthYear(dataLang, season));
export const monthNameL = (season: string) => (dataLang === 'fr' ? monthName(season) : monthYear(dataLang, season));
/** Date courte « 2 nov. » : selon la langue. */
export const shortDateL = (day: string) => (dataLang === 'fr' ? shortDate(day) : new Date(`${day}T12:00:00Z`).toLocaleDateString(LANG_LOCALE[dataLang], { day: 'numeric', month: 'short', timeZone: 'UTC' }));
/** Nom de la saison pour un dé `seasonDie` (déjà traduit par applyDataLang pour la boutique). */
export const seasonDieName = (season: string) => (dataLang === 'fr' ? seasonDie(season).name : translate(dataLang, k('app.season_die'), { month: monthYear(dataLang, season) }));
/** Titre affiché : titres composés et catalogue, dans la langue en cours. */
export const titleL = (id: string | undefined) => { const t = titleLabel(id); return t ? translateServerText(dataLang, t) : t; };
