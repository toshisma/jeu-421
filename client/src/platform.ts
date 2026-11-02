/**
 * Où se trouve le serveur de jeu ?
 *  - Version web : même adresse que la page (rien à configurer).
 *  - Application mobile (Capacitor) : la page est servie depuis le téléphone, il faut donc
 *    indiquer l'adresse publique du serveur au moment du build : VITE_SERVER_URL=https://…
 */
const env = import.meta.env as Record<string, string | undefined>;

export const isNativeApp = (): boolean =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Adresse du serveur Socket.IO (undefined = même origine que la page). */
export const SERVER_URL: string | undefined = env.VITE_SERVER_URL || undefined;

/** Adresse publique du jeu, utilisée dans les liens d'invitation. */
export function publicUrl(): string {
  if (env.VITE_PUBLIC_URL) return env.VITE_PUBLIC_URL.replace(/\/$/, '');
  if (isNativeApp() && SERVER_URL) return SERVER_URL.replace(/\/$/, '');
  return `${location.origin}${location.pathname.replace(/\/$/, '')}`;
}

/** Adresse complète d'une ressource du serveur (photos…), y compris dans l'application mobile. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(data:|https?:)/.test(path)) return path;
  return `${(SERVER_URL ?? '').replace(/\/$/, '')}${path}`;
}
