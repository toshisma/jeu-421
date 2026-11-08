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
  { re: /dernier mot/i, title: 'Dernier mot', text: 'Carte qui se joue à la toute fin de la manche, quand toutes les combinaisons sont posées, juste avant les comptes.' },
  { re: /commande du comptoir/i, title: 'Commande du comptoir', text: 'Une règle bonus tirée au début de chaque manche, la même pour tous, écrite en haut de l’écran.' },
  { re: /tournées?/i, title: 'Tournée', text: `Ce que coûtent les cartes (le chiffre dans le petit verre), à ne pas confondre avec les jetons. ${R.tourneesPerRound} de plus à chaque manche (${R.tourneesPerRound + R.tourneesLoserBonus} pour le perdant de la manche d’avant), ${R.tourneesMax} au plus.` },
  { re: /habitués?/i, title: 'Habitué', text: `Carte qui s’installe devant vous et agit toute seule pendant ${R.habitueRounds} manches, puis rentre chez lui. ${R.maxHabitues} au plus, jamais deux fois le même.` },
  { re: /pièges?/i, title: 'Piège', text: `Posé face cachée devant un adversaire, il se déclenche tout seul quand sa condition arrive. L’adversaire voit qu’il y a un piège, pas lequel. ${R.maxTrapsOn} au plus devant un même joueur, et ${R.maxTraps} posés au plus par joueur.` },
  { re: /ripostes?/i, title: 'Riposte', text: 'Carte jouée en réponse à une carte adverse, au moment où elle est jouée (vous avez 15 secondes).' },
  { re: /\bCoups?\b/, title: 'Coup', text: 'Carte jouée pendant votre tour, avant ou après un lancer, puis défaussée.' },
  { re: /meneur/i, title: 'Meneur', text: 'Celui qui joue en premier dans la manche. Son nombre de lancers fixe le maximum des autres.' },
  { re: /combinaisons?/i, title: 'Combinaison', text: 'Vos 3 dés une fois arrêtés : 4-2-1, trois as, brelan, suite… Elle vaut des jetons : le gagnant de la manche en donne autant au perdant.' },
  { re: /nénettes?/i, title: 'Nénette', text: 'Le 2-2-1, la plus petite combinaison : celui qui perd avec une nénette reçoit au moins 2 jetons.' },
  { re: /brelans?/i, title: 'Brelan', text: 'Trois dés identiques (sauf trois as) : vaut la valeur du dé, par exemple 5 pour 5-5-5.' },
  { re: /\bsuites?\b/i, title: 'Suite', text: 'Trois dés qui se suivent (3-2-1, 6-5-4…) : vaut 2 jetons.' },
  { re: /\bmanches?\b/i, title: 'Manche', text: 'Chacun lance ses dés à son tour ; la meilleure combinaison gagne et donne des jetons au perdant. Puis on recommence.' },
  { re: /jetons?/i, title: 'Jetons', text: `On en a ${R.startTokens} au départ (${R.startTokensMulti} à 3 ou 4) : le premier à n’en avoir plus aucun gagne la partie.` },
  { re: /défauss(?:ez|ée|é|e)s?/i, title: 'Défausser', text: 'Mettre une carte de côté, face visible : elle ne sert plus pour cette partie (sauf carte qui la reprend).' },
  { re: /pioch(?:ez|e|er)/i, title: 'Piocher', text: 'Prendre la carte du dessus de votre deck et l’ajouter à votre main.' },
];

const ANY = new RegExp(TERMS.map((t) => t.re.source).join('|'), 'gi');
const termOf = (word: string) => TERMS.find((t) => new RegExp(`^(?:${t.re.source})$`, t.re.flags.includes('i') ? 'i' : '').test(word)) ?? null;

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
      for (const m of chunk.matchAll(ANY)) {
        const t = termOf(m[0]);
        if (!t || seen.has(t.title)) continue;
        seen.add(t.title);
        if (m.index! > last) out.push(chunk.slice(last, m.index));
        out.push(
          <button key={`${key}-${ci}-${m.index}`} type="button" className="cf-term" aria-label={`${m[0]} : explication`}
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
            <button type="button" className="cf-btn gold" onClick={() => setOpen(null)}>Compris</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
