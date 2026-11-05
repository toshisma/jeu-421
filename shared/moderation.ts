/**
 * Modération : raisons de signalement, décisions possibles et textes communs au client et au serveur.
 * Le serveur fait foi : il vérifie chaque raison, chaque durée et retrouve lui-même les messages signalés.
 */

export const REPORT_REASONS = [
  { id: 'insultes', label: 'Insultes ou harcèlement' },
  { id: 'haine', label: 'Propos haineux ou discriminatoires' },
  { id: 'sexuel', label: 'Contenu sexuel ou choquant' },
  { id: 'spam', label: 'Spam ou publicité' },
  { id: 'triche', label: 'Triche ou anti-jeu' },
  { id: 'profil', label: 'Pseudo ou photo inappropriés' },
  { id: 'autre', label: 'Autre' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['id'];
export const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? 'Autre';
export const isReportReason = (v: unknown): v is ReportReason => REPORT_REASONS.some((r) => r.id === v);

/** Commentaire facultatif du joueur qui signale. */
export const REPORT_COMMENT_MAX = 300;
/** Signalements par compte et par heure. */
export const REPORTS_PER_HOUR = 10;
/** Messages de contexte joints au message signalé (ceux qui le précèdent). */
export const REPORT_CONTEXT = 3;

/** Lieu d'un message signalé. */
export type MessagePlace = 'prive' | 'table' | 'club';
export const PLACE_LABEL: Record<MessagePlace, string> = { prive: 'Message privé', table: 'Tchat de table', club: 'Tchat de club' };

export type Decision = 'classer' | 'avertissement' | 'muet' | 'suspension' | 'bannissement';
const H = 3600_000, D = 24 * H;
/** Durées possibles par sanction (ms). */
export const DURATIONS: Record<'muet' | 'suspension', { id: string; label: string; ms: number }[]> = {
  muet: [{ id: '1h', label: '1 heure', ms: H }, { id: '24h', label: '24 heures', ms: D }, { id: '7j', label: '7 jours', ms: 7 * D }],
  suspension: [{ id: '1j', label: '1 jour', ms: D }, { id: '7j', label: '7 jours', ms: 7 * D }, { id: '30j', label: '30 jours', ms: 30 * D }],
};
export const DECISIONS: { id: Decision; label: string; sanction: boolean }[] = [
  { id: 'classer', label: 'Aucune sanction (classer)', sanction: false },
  { id: 'avertissement', label: 'Avertissement', sanction: true },
  { id: 'muet', label: 'Muet', sanction: true },
  { id: 'suspension', label: 'Suspension', sanction: true },
  { id: 'bannissement', label: 'Bannissement définitif', sanction: true },
];
export const decisionLabel = (d: string | null | undefined) => DECISIONS.find((x) => x.id === d)?.label ?? '–';

/** Date et heure à Bruxelles : « 5 novembre 2026 à 21:04 ». */
export function brusselsDateTime(t: number): string {
  const d = new Date(t).toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', year: 'numeric' });
  const h = new Date(t).toLocaleTimeString('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' });
  return `${d} à ${h}`;
}

/** Texte montré à un joueur réduit au silence quand il essaie d'écrire. */
export function muteText(m: { until: number; reason: string }): string {
  return `Vous ne pouvez plus écrire jusqu’au ${brusselsDateTime(m.until)} (décision de la modération${m.reason ? ` : ${m.reason}` : ''}).`;
}

export const THANKS_TEXT = 'Merci pour votre signalement : une sanction a été prise contre un joueur que vous avez signalé.';
export const REPORT_SENT_TEXT = 'Merci, votre signalement a été transmis à l’équipe de modération.';
