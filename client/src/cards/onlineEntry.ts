/**
 * Coups Fourrés : point d'entrée PROTÉGÉ vers le module en ligne (client/src/cards/online.ts),
 * écrit en parallèle. Les écrans n'importent jamais online.ts directement : ils passent par ici.
 *
 * - `import.meta.glob` ne casse pas la compilation si online.ts n'existe pas encore (on obtient {}).
 * - Chaque fonction attendue est facultative : si elle manque, l'écran affiche « Bientôt disponible ».
 *
 * Fonctions que les écrans appellent (à brancher dans online.ts lors de la fusion, mêmes noms) :
 *   setCfPresence(inMode)              présence « Dans Coups Fourrés » (entrée / sortie du menu du mode)
 *   startRanked(opts)                  partie classée : recherche d'un adversaire → contrôleur
 *   challengeFriend(opts)              défier un ami (invitation) → contrôleur quand il accepte
 *   createTable(opts) / joinTable(opts) table entre amis à code (2 à 4 joueurs) → contrôleur
 *   watch(opts)                        regarder la partie d'un ami → contrôleur (spectateur)
 * Les fonctions qui mènent à une partie renvoient un CfMatchmaking : `controller` se résout quand la
 * partie commence ; `cancel()` abandonne l'attente ; `onStatus` reçoit des messages d'attente.
 */
import type { CfController } from './controller';

export interface CfMatchmaking {
  controller: Promise<CfController>;
  cancel(): void;
  /** Code de la table (tables entre amis), à partager. */
  code?: string;
}
export interface CfOnlineCommon { token: string | null; deckId?: string | null; onStatus?: (text: string) => void }
export interface CfOnlineModule {
  setCfPresence?(inMode: boolean): void;
  startRanked?(o: CfOnlineCommon): CfMatchmaking;
  challengeFriend?(o: CfOnlineCommon & { username: string }): CfMatchmaking;
  createTable?(o: CfOnlineCommon & { seats?: number }): CfMatchmaking;
  joinTable?(o: CfOnlineCommon & { code: string }): CfMatchmaking;
  watch?(o: { token: string | null; username?: string; code?: string }): CfMatchmaking;
}

const MODULES = import.meta.glob('./online.ts') as Record<string, () => Promise<CfOnlineModule>>;
let loading: Promise<CfOnlineModule | null> | null = null;

/** Charge le module en ligne s'il existe (null sinon, jamais d'erreur). */
export function loadOnline(): Promise<CfOnlineModule | null> {
  const load = MODULES['./online.ts'];
  if (!load) return Promise.resolve(null);
  return (loading ??= load().then((m) => m ?? null, () => { loading = null; return null; }));
}

/** Le module existe-t-il dans cette version ? (sans le charger) */
export const onlineAvailable = () => !!MODULES['./online.ts'];

export const SOON = 'Bientôt disponible : les parties en ligne de Coups Fourrés arrivent très vite.';

/** Appelle une fonction du module si elle existe ; renvoie null sinon (l'écran affiche SOON). */
export async function tryOnline<K extends keyof CfOnlineModule>(name: K, ...args: Parameters<NonNullable<CfOnlineModule[K]>>): Promise<ReturnType<NonNullable<CfOnlineModule[K]>> | null> {
  try {
    const m = await loadOnline();
    const f = m?.[name] as ((...a: unknown[]) => unknown) | undefined;
    if (typeof f !== 'function') return null;
    return (f(...args) ?? null) as ReturnType<NonNullable<CfOnlineModule[K]>>;
  } catch {
    return null;
  }
}

/** Présence dans le mode (silencieux si le module n'existe pas). */
export function cfPresence(inMode: boolean) {
  void tryOnline('setCfPresence', inMode);
}
