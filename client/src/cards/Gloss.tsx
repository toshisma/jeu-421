import { getLang, tr } from '../i18n/lang';
/**
 * Coups Fourrés : mots techniques en couleur dans le texte des cartes (0.39, demande de Sam).
 * Toucher le mot ouvre une petite explication. Utilisé sur les grandes cartes (fiche, collection,
 * boosters, énigme) ; pas sur les petites cartes de la main, où toucher la carte ouvre la fiche.
 */
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CF_RULES } from '../../../shared/cards/catalog';

interface Term { re: RegExp; title: string; text: string }

const R = CF_RULES;
/** Ordre : les expressions longues d'abord (« Dernier mot » avant « mot »…). */
export const TERMS: Term[] = [
  { re: /dernier mot/i, get title() { return tr('cf.boardparts.dernier_mot'); }, get text() { return tr('cf.gloss.carte_qui_se_joue_a_la'); } },
  { re: /commande du comptoir/i, get title() { return tr('cf.boardparts.commande_du_comptoir'); }, get text() { return tr('cf.gloss.une_regle_bonus_tiree_au_debut'); } },
  { re: /tournées?/i, get title() { return tr('cf.game.tournee'); }, get text() { return tr('cf.gloss.ce_que_coutent_les_cartes_le', { tourneesPerRound: R.tourneesPerRound, a: R.tourneesPerRound + R.tourneesLoserBonus, tourneesMax: R.tourneesMax }); } },
  { re: /habitués?/i, get title() { return tr('cf.learn.habitue'); }, get text() { return tr('cf.gloss.carte_qui_s_installe_devant_vous', { habitueRounds: R.habitueRounds, maxHabitues: R.maxHabitues }); } },
  { re: /pièges?/i, get title() { return tr('cf.boardparts.piege'); }, get text() { return tr('cf.gloss.pose_face_cachee_devant_un_adversair', { maxTrapsOn: R.maxTrapsOn, maxTraps: R.maxTraps }); } },
  { re: /ripostes?/i, get title() { return tr('cf.learn.riposte'); }, get text() { return tr('cf.gloss.carte_jouee_en_reponse_a_une'); } },
  { re: /\bCoups?\b/, get title() { return tr('cf.learn.coup'); }, get text() { return tr('cf.gloss.carte_jouee_pendant_votre_tour_avant'); } },
  { re: /meneur/i, get title() { return tr('cf.learn.meneur'); }, get text() { return tr('cf.gloss.celui_qui_joue_en_premier_dans'); } },
  { re: /combinaisons?/i, get title() { return tr('cf.gloss.combinaison'); }, get text() { return tr('cf.gloss.vos_3_des_une_fois_arretes'); } },
  { re: /nénettes?/i, get title() { return tr('cf.gloss.nenette'); }, get text() { return tr('cf.gloss.le_2_2_1_la_plus'); } },
  { re: /brelans?/i, get title() { return tr('cf.gloss.brelan'); }, get text() { return tr('cf.gloss.trois_des_identiques_sauf_trois_as'); } },
  { re: /\bsuites?\b/i, get title() { return tr('cf.info.suite'); }, get text() { return tr('cf.gloss.trois_des_qui_se_suivent_3'); } },
  { re: /\bmanches?\b/i, get title() { return tr('cf.gloss.manche'); }, get text() { return tr('cf.gloss.chacun_lance_ses_des_a_son'); } },
  { re: /jetons?/i, get title() { return tr('cf.boardparts.jetons'); }, get text() { return tr('cf.gloss.on_en_a_au_depart_a', { startTokens: R.startTokens, startTokensMulti: R.startTokensMulti }); } },
  { re: /défauss(?:ez|ée|é|e)s?/i, get title() { return tr('cf.boardparts.defausser'); }, get text() { return tr('cf.gloss.mettre_une_carte_de_cote_face'); } },
  { re: /pioch(?:ez|e|er)/i, get title() { return tr('cf.gloss.piocher'); }, get text() { return tr('cf.gloss.prendre_la_carte_du_dessus_de'); } },
];

/** Mêmes termes, même ordre, dans les autres langues. */
const FOREIGN_RE: Record<'en' | 'de' | 'nl', string[]> = {
  en: ['last words?', 'bar orders?', 'pints?', 'regulars?', 'traps?', 'ripostes?', 'tricks?', 'leaders?', 'combos?', 'nénettes?', 'three of a kinds?', 'straights?', 'rounds?', 'chips?', 'discard', 'draw'],
  de: ['letzte[sn]? worte?', 'thekenansagen?', 'biere?', 'stammg(?:ast|äste)', 'fallen?', 'konter', 'streich(?:e|en)?', 'anführer', 'kombinationen?', 'nénetten?', 'drillinge?', 'straßen?', 'runden?', 'chips?', 'ablegen', 'ziehen'],
  nl: ['laatste woord(?:en)?', 'barbestelling(?:en)?', 'biertjes?', 'stamgast(?:en)?', 'vallen|val', 'replieken|repliek', 'streken|streek', 'leiders?', 'combinaties?', 'nénettes?', 'drie gelijke', 'straten|straat', 'rondes?|ronden', 'fiches?', 'afleggen', 'trekken'],
};
const FR_SOURCES = TERMS.map((t) => t.re.source);
const sources = () => { const l = getLang(); return l === 'fr' ? FR_SOURCES : FOREIGN_RE[l]; };
const anyRe = () => new RegExp(sources().join('|'), 'gi');
const termOf = (word: string) => { const s = sources(); const i = s.findIndex((src) => new RegExp(`^(?:${src})$`, 'i').test(word)); return i < 0 ? null : TERMS[i]; };

/**
 * Texte avec les mots techniques en couleur et touchables (la première fois seulement, pour ne pas
 * surcharger). `bold` : passage à mettre en gras. Les noms de cartes entre « » ne sont pas touchés.
 */
export function GlossText({ text, bold, plain }: { text: string; bold?: string; plain?: boolean }) {
  const [open, setOpen] = useState<Term | null>(null);
  if (plain) {
    const i = bold ? text.indexOf(bold) : -1;
    return i < 0 ? <>{text}</> : <>{text.slice(0, i)}<b>{bold}</b>{text.slice(i + bold!.length)}</>;
  }
  const seen = new Set<string>();
  const render = (src: string, key: string): ReactNode[] => {
    const out: ReactNode[] = [];
    src.split(/(«[^»]*»)/).forEach((chunk, ci) => {
      if (chunk.startsWith('«')) { out.push(chunk); return; }
      let last = 0;
      for (const m of chunk.matchAll(anyRe())) {
        const t = termOf(m[0]);
        if (!t || seen.has(t.title)) continue;
        seen.add(t.title);
        if (m.index! > last) out.push(chunk.slice(last, m.index));
        out.push(
          <button key={`${key}-${ci}-${m.index}`} type="button" className="cf-term" aria-label={tr('cf.gloss.explication', { a: m[0] })}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(t); }}>{m[0]}</button>,
        );
        last = m.index! + m[0].length;
      }
      if (last < chunk.length) out.push(chunk.slice(last));
    });
    return out;
  };
  const i = bold ? text.indexOf(bold) : -1;
  const parts: ReactNode[] = i < 0 ? render(text, 't') : [...render(text.slice(0, i), 'a'), <b key="b">{render(bold!, 'b')}</b>, ...render(text.slice(i + bold!.length), 'c')];
  return (
    <>
      {parts}
      {open && createPortal(
        <div className="cf-term-pop" role="dialog" aria-label={open.title} onClick={(e) => { e.stopPropagation(); setOpen(null); }}>
          <div className="cf-term-box" onClick={(e) => e.stopPropagation()}>
            <b>{open.title}</b>
            <p>{open.text}</p>
            <button type="button" className="cf-btn gold" onClick={() => setOpen(null)}>{tr('cf.boardparts.compris')}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
