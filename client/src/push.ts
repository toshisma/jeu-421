/**
 * Notifications push (comptes, application installée ou navigateur compatible).
 * Sur iPhone, il faut d'abord installer l'application sur l'écran d'accueil (iOS 16.4 ou plus).
 */
import { api } from './account/api';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = () => (pushSupported() ? Notification.permission : 'denied');

function keyBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Active les notifications sur cet appareil. Renvoie un message d'erreur, ou null. */
export async function enablePush(token: string): Promise<string | null> {
  if (!pushSupported()) return 'Ce navigateur ne gère pas les notifications. Sur iPhone : installez d’abord le jeu sur l’écran d’accueil.';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Notifications refusées. Vous pouvez les autoriser dans les réglages du navigateur.';
  try {
    const { key } = await api<{ key: string | null }>('/push/key');
    if (!key) return 'Notifications indisponibles sur ce serveur.';
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key).buffer as ArrayBuffer });
    await api('/push/subscribe', { body: { subscription: sub.toJSON() }, token });
    return null;
  } catch (e) { return (e as Error).message || 'Activation impossible.'; }
}

export async function disablePush(token: string): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await api('/push/unsubscribe', { body: { endpoint: sub.endpoint }, token }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
}

export async function pushActive(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}
