/**
 * Notifications push (comptes, application installée ou navigateur compatible).
 * Sur iPhone, il faut d'abord installer l'application sur l'écran d'accueil (iOS 16.4 ou plus).
 */
import { tr } from './i18n/lang';
import { api } from './account/api';
import { getLang } from './i18n/lang';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = () => (pushSupported() ? Notification.permission : 'denied');

function keyBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Active les notifications sur cet appareil. Renvoie un message d'erreur, ou null. */
export async function enablePush(token: string): Promise<string | null> {
  if (!pushSupported()) return tr('app.ce_navigateur_ne_gere_pas_les_notifi_2');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return tr('app.notifications_refusees_vous_pouvez_l');
  try {
    const { key } = await api<{ key: string | null }>('/push/key');
    if (!key) return tr('app.notifications_indisponibles_sur_ce_s');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key).buffer as ArrayBuffer });
    await api('/push/subscribe', { body: { subscription: sub.toJSON(), lang: getLang() }, token });
    return null;
  } catch (e) { return (e as Error).message || tr('app.activation_impossible'); }
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

/** Change la langue des notifications de cet appareil (le joueur vient de changer la langue du jeu). */
export async function syncPushLang(token: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await api('/push/lang', { body: { endpoint: sub.endpoint, lang: getLang() }, token }).catch(() => {});
}
