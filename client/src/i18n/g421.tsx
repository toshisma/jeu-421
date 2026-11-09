/** Aides de traduction du 421 côté navigateur : pluriels, places, combinaisons, personnages, règles. */
import type { ReactNode } from 'react';
import { translate, type MessageKey } from '../../../shared/i18n';
import { BARON, PERSONA_LABELS, PHRASE_LABELS } from '../../../shared/i18n/courtisan';
import { comboIn, ordinalIn } from '../../../shared/i18n/zones/jeu421-server';
import { describeConfig, type GameConfig, type Variant } from '../../../shared/config';
import { getLang, tr } from './lang';

type Foreign = 'en' | 'de' | 'nl';
const foreign = (): Foreign | null => { const l = getLang(); return l === 'fr' ? null : l; };

/** Pluriel : `base.one` / `base.many` ; en français, 0 reste au singulier comme avant. */
export function trn(base: string, n: number, vars?: Record<string, string | number>): string {
  const lang = getLang();
  const one = n === 1 || (lang === 'fr' && n <= 1);
  return translate(lang, `${base}.${one ? 'one' : 'many'}` as MessageKey, { n, ...vars });
}
/** Combinaison (« Brelan de 5 ») dans la langue du joueur. */
export const trCombo = (label: string) => comboIn(getLang(), label);
/** Place (1 = premier). */
export const ord = (n: number) => ordinalIn(getLang(), n);
/** Texte avec `**gras**`. */
export const rich = (t: string): ReactNode => t.split('**').map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p));
/** Nom d'ordinateur : seul « Le Baron » change. */
export const botName = (name: string) => { const f = foreign(); return f && name === 'Le Baron' ? BARON[f] : f && name === 'Vous' ? tr('g421.pc.you') : name; };
/** Phrase rapide (liste fermée). */
export const trPhrase = (p: string) => { const f = foreign(); return f ? PHRASE_LABELS[f][p] ?? p : p; };
/** Slogan d'un ordinateur. */
export const trTagline = (id: string, fr: string) => { const f = foreign(); return f ? PERSONA_LABELS[f][id]?.tagline ?? fr : fr; };
/** Variante de règles : nom court. */
export const trVariant = (v: Variant | string) => tr(`g421.variant.${v}` as MessageKey);

/** Nom d'un tour de tournoi. */
export function roundLabel(index: number, total: number): string {
  if (index === total - 1) return tr('g421.round.final');
  if (index === total - 2) return tr('g421.round.semi');
  return tr('g421.round.n', { n: index + 1 });
}
/** Heure d'un tournoi : « 21 h ». */
export const hourTr = (h: number) => tr('g421.hour', { h });

/** Réplique d'un ordinateur (reaction) dans la langue du joueur. */
const LINES: Record<Foreign, Record<string, string>> = {
  en: { 'Et voilà le travail !': 'That’s how it’s done!', 'Payez, messieurs !': 'Pay up, gentlemen!', 'Pas mal, pas mal.': 'Not bad, not bad.', 'Bon… on fera mieux.': 'Well… we’ll do better.', 'Ah ! Comme au bon vieux temps.': 'Ah! Just like the good old days.', 'Je garde, mon petit.': 'I’ll keep that, dear.', 'Ces dés sont pipés…': 'These dice are loaded…', 'Prévisible.': 'Predictable.', 'Élémentaire.': 'Elementary.', 'Convenable.': 'Adequate.', 'Fâcheux contretemps.': 'A tiresome setback.', 'Hop hop hop !': 'Hup hup hup!', 'Trop facile !': 'Too easy!', 'Ça passe !': 'That’ll do!', 'Oups.': 'Oops.', 'QUATRE-CENT-VINGT-ET-UN !': 'FOUR-TWO-ONE!', 'Tournée générale !': 'Drinks are on me!', 'Ça me va !': 'Works for me!', 'Allez, la prochaine…': 'Next time…', 'Merci, merci.': 'Thank you, thank you.', 'Parfait.': 'Perfect.', 'Tant pis.': 'Never mind.', 'Et paf !': 'And bam!', 'Ça ira.': 'That’ll do.', 'Pfff…': 'Pfff…' },
  de: { 'Et voilà le travail !': 'So wird’s gemacht!', 'Payez, messieurs !': 'Zahlen, meine Herren!', 'Pas mal, pas mal.': 'Nicht schlecht, nicht schlecht.', 'Bon… on fera mieux.': 'Na ja… das geht besser.', 'Ah ! Comme au bon vieux temps.': 'Ah! Wie in den guten alten Zeiten.', 'Je garde, mon petit.': 'Das behalte ich, mein Kind.', 'Ces dés sont pipés…': 'Diese Würfel sind gezinkt…', 'Prévisible.': 'Vorhersehbar.', 'Élémentaire.': 'Elementar.', 'Convenable.': 'Akzeptabel.', 'Fâcheux contretemps.': 'Ein ärgerlicher Zwischenfall.', 'Hop hop hop !': 'Hopp, hopp, hopp!', 'Trop facile !': 'Zu einfach!', 'Ça passe !': 'Passt!', 'Oups.': 'Ups.', 'QUATRE-CENT-VINGT-ET-UN !': 'VIER-ZWEI-EINS!', 'Tournée générale !': 'Lokalrunde!', 'Ça me va !': 'Passt mir!', 'Allez, la prochaine…': 'Nächstes Mal…', 'Merci, merci.': 'Danke, danke.', 'Parfait.': 'Perfekt.', 'Tant pis.': 'Macht nichts.', 'Et paf !': 'Und zack!', 'Ça ira.': 'Das reicht.', 'Pfff…': 'Pfff…' },
  nl: { 'Et voilà le travail !': 'Zo doe je dat!', 'Payez, messieurs !': 'Betalen, heren!', 'Pas mal, pas mal.': 'Niet slecht, niet slecht.', 'Bon… on fera mieux.': 'Tja… dat kan beter.', 'Ah ! Comme au bon vieux temps.': 'Ah! Net als vroeger.', 'Je garde, mon petit.': 'Die houd ik, kind.', 'Ces dés sont pipés…': 'Deze stenen zijn vals…', 'Prévisible.': 'Voorspelbaar.', 'Élémentaire.': 'Elementair.', 'Convenable.': 'Aanvaardbaar.', 'Fâcheux contretemps.': 'Vervelende tegenslag.', 'Hop hop hop !': 'Hop hop hop!', 'Trop facile !': 'Te makkelijk!', 'Ça passe !': 'Dat lukt!', 'Oups.': 'Oeps.', 'QUATRE-CENT-VINGT-ET-UN !': 'VIER-TWEE-EEN!', 'Tournée générale !': 'Rondje van de zaak!', 'Ça me va !': 'Goed voor mij!', 'Allez, la prochaine…': 'Volgende keer…', 'Merci, merci.': 'Dank je, dank je.', 'Parfait.': 'Perfect.', 'Tant pis.': 'Jammer dan.', 'Et paf !': 'En paf!', 'Ça ira.': 'Dat is goed.', 'Pfff…': 'Pfff…' },
};
export const trLine = (t: string | null) => { const f = foreign(); return f && t ? LINES[f][t] ?? t : t; };
export const REACTION_LINES = LINES;

/** Résumé des réglages (salon, règles) dans la langue du joueur. */
export function describeCfg(c: GameConfig): string[] {
  const lang = getLang();
  if (lang === 'fr') return describeConfig(c);
  const t = (k: string, vars?: Record<string, string | number>) => translate(lang, k as MessageKey, vars);
  const lines: string[] = [t(`g421.cfg.variant.${c.variant}`)];
  if (c.variant === 'classique') lines.push(trn('g421.cfg.pot', c.chargeThrows, { pot: c.totalTokens }));
  if (c.variant === 'decharge') lines.push(t('g421.cfg.start', { n: c.startTokens }));
  if (c.variant === 'manches') lines.push(t('g421.cfg.rounds', { n: c.rounds }));
  lines.push(trn('g421.cfg.throws', c.maxThrows, { rest: c.leaderSetsThrows ? t('g421.cfg.limited') : '' }));
  lines.push(t('g421.cfg.dir', { dir: t(`g421.cfg.dir.${c.direction}`), rest: t(c.loserStarts ? 'g421.cfg.loserStarts' : 'g421.cfg.rotate') }));
  lines.push(c.turnSeconds ? t('g421.cfg.time', { n: c.turnSeconds }) : t('g421.cfg.noTime'));
  if (c.variant !== 'manches') lines.push(t('g421.cfg.best', { rest: t(c.bestTieRule === 'barrage' ? 'g421.cfg.bestBarrage' : 'g421.cfg.bestFirst') }));
  const how = c.tieRule === 'barrage' ? (c.rolloffMode === 'addition' ? t('g421.cfg.byTotal') : t('g421.cfg.byFigure')) : '';
  lines.push(t('g421.cfg.tie', { rule: t(`g421.tie.${c.tieRule}`), how, fewer: c.fewerThrowsWins ? t('g421.cfg.fewer') : '' }));
  return lines;
}
