/**
 * Boîte à idées / signaler un souci : constantes communes au client et au serveur (server/feedback.ts).
 * Les textes visibles sont dans la zone `fb.` (shared/i18n/zones/feedback.*.ts).
 */
export const FB_KINDS = ['idee', 'souci', 'autre'] as const;
export type FbKind = (typeof FB_KINDS)[number];
/** Reçue (pas encore ouverte par l'équipe) → Lue → Faite / Pas retenue. */
export const FB_STATUSES = ['recue', 'lue', 'faite', 'refusee'] as const;
export type FbStatus = (typeof FB_STATUSES)[number];
export const FB_MIN = 10;
export const FB_MAX = 1000;
export const FB_REPLY_MAX = 300;
/** Envois par jour (24 h glissantes) : par compte, et par adresse (invités et comptes confondus). */
export const FB_DAILY_ACCOUNT = 5;
export const FB_DAILY_IP = 10;

export const isFbKind = (v: unknown): v is FbKind => typeof v === 'string' && (FB_KINDS as readonly string[]).includes(v);
export const isFbStatus = (v: unknown): v is FbStatus => typeof v === 'string' && (FB_STATUSES as readonly string[]).includes(v);

/** Texte nettoyé : caractères de contrôle et invisibles retirés (retours à la ligne gardés), espaces réduits. */
export function cleanFbText(raw: unknown, max = FB_MAX): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Contexte joint (non personnel) : version, langue, taille d'écran, écran en cours. */
export interface FbContext { version: string; lang: string; viewport: string; screen: string }
export function cleanFbContext(raw: unknown): FbContext {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown, re: RegExp, n: number) => (typeof v === 'string' && re.test(v) ? v.slice(0, n) : '');
  return {
    version: s(o.version, /^[0-9]{1,3}(\.[0-9]{1,3}){0,2}$/, 12),
    lang: s(o.lang, /^(fr|en|de|nl)$/, 2),
    viewport: s(o.viewport, /^[0-9]{2,5}×[0-9]{2,5}$/, 12),
    screen: s(o.screen, /^[a-z0-9-]{1,24}$/, 24),
  };
}
