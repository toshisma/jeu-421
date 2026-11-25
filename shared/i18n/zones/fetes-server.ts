/**
 * Saint-Nicolas et fêtes : textes français envoyés par le serveur (titres, notifications du jour J,
 * erreurs du calendrier de l'avent), traduits dans la langue du joueur. Branché dans server-texts.ts.
 */
import type { Lang } from '../index';
import { FETE_TITLES, fetePush } from '../../progress/fetes';

type Foreign = Exclude<Lang, 'fr'>;
type T = Record<Foreign, string>;

const p6 = fetePush('2026-12-06')!, p24 = fetePush('2026-12-24')!, p1 = fetePush('2027-01-01')!;

export const FETES_TEXTS: Record<string, T> = {
  [FETE_TITLES['fete:saint-nicolas']]: { en: 'Good child', de: 'Braves Kind', nl: 'Braaf kind' },
  [FETE_TITLES['fete:noel']]: { en: 'Holiday elf', de: 'Festtagswichtel', nl: 'Feestelf' },
  // Calendrier de l'année (shared/progress/calendar.ts)
  [FETE_TITLES['fete:paques']]: { en: 'Egg hunter', de: 'Eiersucher', nl: 'Eierenzoeker' },
  [FETE_TITLES['fete:halloween']]: { en: 'Fearless at the bar', de: 'Furchtlos an der Theke', nl: 'Onverschrokken aan de toog' },
  [FETE_TITLES['fete:reveillon']]: { en: 'New Year’s Eve podium', de: 'Silvester-Podest', nl: 'Oudejaarspodium' },
  [p6.title]: { en: 'Happy St Nicholas’ Day!', de: 'Frohen Nikolaustag!', nl: 'Fijne Sinterklaas!' },
  [p6.body]: {
    en: 'St Nicholas and Père Fouettard are waiting for you at the bar, and today’s advent calendar door hides a dice bag.',
    de: 'Der Nikolaus und Knecht Ruprecht warten an der Theke auf dich, und hinter dem heutigen Türchen steckt ein Würfelbeutel.',
    nl: 'Sinterklaas en Roetpiet wachten op je aan de toog, en achter het vakje van vandaag zit een zakje dobbelstenen.',
  },
  [p24.title]: { en: 'Merry Christmas Eve!', de: 'Frohen Heiligabend!', nl: 'Fijne kerstavond!' },
  [p24.body]: {
    en: 'The last advent calendar door hides a dice bag. Father Christmas is waiting for you at the bar.',
    de: 'Hinter dem letzten Türchen steckt ein Würfelbeutel. Der Weihnachtsmann wartet an der Theke auf dich.',
    nl: 'Achter het laatste vakje zit een zakje dobbelstenen. De Kerstman wacht op je aan de toog.',
  },
  [p1.title]: { en: 'Happy New Year!', de: 'Frohes neues Jahr!', nl: 'Gelukkig nieuwjaar!' },
  [p1.body]: {
    en: 'Happy New Year from the bar! The holiday challenges end tomorrow.',
    de: 'Frohes neues Jahr von der Theke! Die Feiertags-Aufgaben enden morgen.',
    nl: 'Gelukkig nieuwjaar vanaf de toog! De uitdagingen van de feestdagen eindigen morgen.',
  },
  'Case du jour déjà ouverte.': { en: 'Today’s door is already open.', de: 'Das heutige Türchen ist schon offen.', nl: 'Het vakje van vandaag is al open.' },
  'Pas de case à ouvrir aujourd’hui.': { en: 'No door to open today.', de: 'Heute gibt es kein Türchen.', nl: 'Vandaag is er geen vakje.' },
};

/** Traduction d'un texte des fêtes, ou null s'il n'en est pas un. */
/** Textes avec une valeur : titre de la galette (année), fil d'actualité (pseudo). */
const PATTERNS: [RegExp, T][] = [
  [/^Roi ou reine du 421 (\d{4})$/, { en: 'King or queen of 421 $1', de: 'König oder Königin des 421 $1', nl: 'Koning of koningin van 421 $1' }],
  [/^👑 (.+) a trouvé la fève de la galette des rois !$/, { en: '👑 $1 found the charm in the king cake!', de: '👑 $1 hat die Bohne im Dreikönigskuchen gefunden!', nl: '👑 $1 vond de boon in de driekoningentaart!' }],
];

export function translateFetes(lang: Foreign, text: string): string | null {
  const t = FETES_TEXTS[text]?.[lang];
  if (t) return t;
  for (const [re, x] of PATTERNS) if (re.test(text)) return text.replace(re, x[lang]);
  return null;
}
