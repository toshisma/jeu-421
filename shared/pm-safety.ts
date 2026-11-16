/**
 * Sécurité des messages privés : signaux à risque (repérage discret, sans jamais bloquer un message),
 * motifs de signalement d'une conversation, motifs de lecture par l'administration, conservation.
 *
 *  - Le repérage travaille par CATÉGORIES (passer sur une autre messagerie, demander l'âge, une photo,
 *    des coordonnées, proposer une rencontre, demander le secret), avec quelques motifs génériques par
 *    catégorie dans les 4 langues du jeu. Ce n'est volontairement pas une liste exhaustive de phrases :
 *    le but est d'attirer l'œil de l'administrateur sur une conversation, pas de juger un message.
 *  - Score d'une conversation = somme des poids des catégories DIFFÉRENTES vues sur les 7 derniers jours
 *    (+1 si une même catégorie revient 3 fois ou plus). Une seule catégorie ne suffit jamais à alerter :
 *    il faut un faisceau (ex. âge + photo, autre messagerie + secret).
 */

export type RiskCat = 'ailleurs' | 'age' | 'photo' | 'coordonnees' | 'rencontre' | 'secret';

/** Catégories, libellé (administration, en français) et poids. */
export const RISK_CATS: { id: RiskCat; label: string; weight: number }[] = [
  { id: 'ailleurs', label: 'Invite à parler sur une autre messagerie ou un réseau', weight: 2 },
  { id: 'age', label: 'Demande l’âge ou la classe', weight: 1 },
  { id: 'photo', label: 'Demande une photo ou la caméra', weight: 2 },
  { id: 'coordonnees', label: 'Demande une adresse, un numéro ou l’école', weight: 2 },
  { id: 'rencontre', label: 'Propose de se rencontrer', weight: 2 },
  { id: 'secret', label: 'Demande de garder le secret', weight: 2 },
];
export const riskLabel = (id: string) => RISK_CATS.find((c) => c.id === id)?.label ?? id;

/** Seuil d'alerte (score de la conversation) et fenêtre de calcul. */
export const ALERT_THRESHOLD = 3;
export const ALERT_WINDOW_MS = 7 * 24 * 3600_000;
/** Une même catégorie répétée au moins ce nombre de fois ajoute 1 au score (insistance). */
export const REPEAT_BONUS_AT = 3;

/** Conservation des messages privés et des copies figées traitées (jours). */
export const PM_RETENTION_DAYS = 365;
/** Signaux bruts gardés (jours) : ils ne servent qu'au score de la semaine. */
export const SIGNAL_RETENTION_DAYS = 30;

/** Minuscules, sans accents, apostrophes droites, espaces simples, lettres répétées réduites (« photooo »). */
export function normalizePm(text: string): string {
  return ` ${String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'").replace(/ß/g, 'ss').replace(/([a-z])\1{2,}/g, '$1')
    .replace(/[^a-z0-9'?!.,@+\s-]/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** Motifs génériques par catégorie (texte normalisé : sans accents, minuscules). fr · en · de · nl. */
const PATTERNS: Record<RiskCat, RegExp[]> = {
  ailleurs: [
    /\b(snap|snapchat|whatsapp|whats app|wsp|insta|instagram|telegram|kik|wickr|skype|facetime|messenger|tiktok)\b/,
    /\b(ajoute|rajoute|add|follow|fug|voeg)\w* (moi|me|mich|me toe)?\s?(sur|on|auf|op)\b/,
    /\b(parl|discut|ecri)\w* (ailleurs|en dehors du jeu|hors du jeu|sur un autre)/,
    /\b(talk|chat|text) (somewhere else|elsewhere|outside the game|off here)\b/,
    /\b(woanders|ausserhalb des spiels) (schreiben|reden|chatten)\b/,
    /\b(ergens anders|buiten het spel) (praten|chatten|appen)\b/,
    /\bdiscord\b.{0,25}\b(prive|perso|dm|mp|private|privat)\b/,
  ],
  age: [
    /\b(t'?as|tu as|ta|t'a) quel age\b/, /\bquel age (as[- ]tu|tu as|t'?as|ta|avez[- ]vous)\b/, /\btu as quel age\b/,
    /\b(t'?es|tu es|tes) en quelle classe\b/, /\btu (es|as) au (college|lycee|primaire)\b/,
    /\bhow old (are|r) (you|u|ya)\b/, /\bwhat grade (are|r) (you|u) in\b/, /\b(your|ur) age\b/, /\bage\s?\?/,
    /\bwie alt bist du\b/, /\bin welche(r)? klasse (gehst|bist) du\b/,
    /\bhoe oud ben (je|jij)\b/, /\bin welke (klas|groep) zit (je|jij)\b/,
  ],
  photo: [
    /\b(envoi|envoy|montr|balanc|fais voir)\w* (moi |nous )?(une |ta |des |tes )?(photo|tof|selfie|image|video)/,
    /\b(photo|tof|selfie)s? (de toi|de ton|de ta|sans)\b/, /\b(allume|met|mets) (ta )?(cam|camera|webcam)\b/,
    /\b(send|show) (me )?(a |your |some )?(pic|pics|photo|photos|picture|selfie|video)\b/, /\b(pic|picture|photo)s? of (you|u)\b/, /\bnudes?\b/,
    /\b(schick|zeig)\w* (mir )?(ein |dein |deine )?(foto|bild|selfie|video)/, /\b(foto|bild)er? von dir\b/,
    /\b(stuur|laat)\w* (me |mij )?(een |je |jouw )?(foto|selfie|video)/, /\bfoto'?s? van (je|jou)\b/,
    /\b(webcam|turn on (your )?cam|kamera an|camera aan)\b/,
  ],
  coordonnees: [
    /\b(ton|ta|tes|votre) (adresse|numero|num|tel|telephone|portable|ecole|college|lycee|ville|nom de famille)\b/,
    /\b(tu habites|t'?habites|vous habitez|tu vis) (ou|dans quelle|quelle ville)\b/, /\b(dans )?quel(le)? (ecole|college|lycee)\b/,
    /\b(your|ur) (address|number|phone|school|last name|surname)\b/, /\bwhere do (you|u) live\b/, /\bwhat school\b/, /\bwhich school\b/,
    /\b(deine|dein) (adresse|nummer|handynummer|telefonnummer|schule|nachname)\b/, /\bwo wohnst du\b/, /\bauf welche schule\b/,
    /\b(je|jouw) (adres|nummer|telefoonnummer|school|achternaam)\b/, /\bwaar woon (je|jij)\b/, /\bop welke school\b/,
    /(\+?\d[\s.-]?){9,}/,
  ],
  rencontre: [
    /\b(se|te|nous|on se) (voir|rencontrer|retrouver|voit|rencontre|retrouve) (en vrai|irl|pour de vrai|dehors|quelque part)\b/,
    /\brencontr\w* (en vrai|irl)\b/, /\birl\b/, /\b(viens|venir) chez moi\b/, /\bje (passe|viens) (te chercher|chez toi)\b/,
    /\bmeet (up|me|in person|irl)\b/, /\bin real life\b/, /\bcome (over|to my (house|place))\b/, /\bpick (you|u) up\b/,
    /\b(uns|dich) (mal )?(treffen|sehen) (im echten|in echt|draussen)\b/, /\bwollen wir uns treffen\b/, /\bkomm zu mir\b/, /\bim echten leben\b/, /\bdich abholen\b/,
    /\bafspreken\b/, /\belkaar (zien|ontmoeten) in (het echt|het echte leven)\b/, /\bin het echt\b/, /\bkom naar (mij|me) toe\b/, /\bje ophalen\b/,
  ],
  secret: [
    /\b(dis|dire|di|raconte)\w* (rien|pas|le pas|ca a personne|a personne)\b.{0,20}\b(personne|parents|mere|pere|maman|papa)\b/,
    /\bne (le )?dis (rien|pas|a personne)\b/, /\b(c'?est |notre )(petit )?secret\b/, /\bentre nous\b.{0,15}\bsecret\b/,
    /\b(efface|supprime)\w* (nos|les|tes|ces) messages\b/,
    /\b(don'?t|do not|dont) tell (anyone|any1|your (mom|mum|dad|parents))\b/, /\bour (little )?secret\b/, /\bdelete (our|these|the|your) (messages|chat)\b/,
    /\bsag(s)? (es )?(niemandem|keinem)\b/, /\b(sag|erzahl|erzaehl) (deinen eltern|deiner mutter|deinem vater) nichts\b/, /\bunser (kleines )?geheimnis\b/, /\blosch\w* (die|unsere) nachrichten\b/,
    /\bvertel (het )?(aan )?niemand\b/, /\bvertel (het )?niet aan je (ouders|moeder|vader)\b/, /\bons (kleine )?geheim(pje)?\b/, /\bverwijder (onze|de|deze) berichten\b/,
  ],
};

/** Catégories à risque repérées dans un message (vide pour un message anodin). */
export function scanMessage(text: string): RiskCat[] {
  const t = normalizePm(text);
  return (Object.keys(PATTERNS) as RiskCat[]).filter((c) => PATTERNS[c].some((re) => re.test(t)));
}

/** Score d'une conversation à partir des catégories repérées (une entrée par message signalé). */
export function conversationScore(hits: RiskCat[][]): { score: number; cats: RiskCat[] } {
  const count = new Map<RiskCat, number>();
  for (const h of hits) for (const c of new Set(h)) count.set(c, (count.get(c) ?? 0) + 1);
  let score = 0;
  for (const [c, n] of count) score += (RISK_CATS.find((x) => x.id === c)?.weight ?? 1) + (n >= REPEAT_BONUS_AT ? 1 : 0);
  const cats = RISK_CATS.map((x) => x.id).filter((c) => count.has(c));
  return { score, cats };
}

/** Motifs de signalement d'une conversation privée (libellés traduits côté joueur : clés `mpm.reason.*`). */
export const PM_REPORT_REASONS = [
  { id: 'mineur', label: 'Comportement inquiétant envers un mineur' },
  { id: 'infos_perso', label: 'Demande d’informations personnelles ou de photos' },
  { id: 'rencontre', label: 'Propose de se rencontrer ou de parler ailleurs' },
  { id: 'harcelement', label: 'Harcèlement' },
  { id: 'autre_mp', label: 'Autre' },
] as const;
export type PmReportReason = (typeof PM_REPORT_REASONS)[number]['id'];
export const isPmReportReason = (v: unknown): v is PmReportReason => PM_REPORT_REASONS.some((r) => r.id === v);
/** Messages figés avec un signalement de conversation. */
export const PM_REPORT_SNAPSHOT = 50;

/** Motif obligatoire pour qu'un administrateur ouvre une conversation (inscrit au journal). */
export const READ_MOTIVES = [
  { id: 'signalement', label: 'Signalement' },
  { id: 'alerte', label: 'Alerte automatique' },
  { id: 'securite', label: 'Vérification de sécurité' },
  { id: 'autre', label: 'Autre' },
] as const;
export type ReadMotive = (typeof READ_MOTIVES)[number]['id'];

/** Clé d'une paire de comptes (ordre indifférent). */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
