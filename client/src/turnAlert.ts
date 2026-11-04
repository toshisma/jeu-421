/**
 * Alerte « À vous de jouer » quand l'onglet n'est pas au premier plan :
 *  - le titre de l'onglet clignote (« 🎲 À vous de jouer ! » / titre normal) ;
 *  - l'icône de l'onglet porte une pastille rouge ;
 *  - un petit son discret (réglages son / muet respectés) ;
 *  - onglet caché : notification système, seulement si l'autorisation a déjà été donnée
 *    (on ne la demande jamais ici) ;
 *  - application visible (téléphone) : courte vibration au début du tour en ligne.
 * Tout s'arrête dès que l'onglet revient au premier plan ou que ce n'est plus son tour.
 *
 * Le tour est lu dans le flux d'événements de la partie (et non dans l'écran, dont les animations
 * sont suspendues quand l'onglet est caché).
 */
import { useEffect, useRef } from 'react';
import { currentPlayerId } from '../../shared/engine';
import type { GameController } from './game/controller';
import { sound } from './audio/sound';

const ALERT_TITLE = '🎲 À vous de jouer !';
const TAG = '421-tour';

const away = () => document.visibilityState !== 'visible' || !document.hasFocus();

let baseIcon: string | null = null;
let badgeIcon: string | null = null;
function iconLink(): HTMLLinkElement | null { return document.querySelector('link[rel="icon"]'); }
function badged(): string {
  if (badgeIcon) return badgeIcon;
  // Le dé de l'onglet, avec une pastille rouge en haut à droite.
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect x='6' y='6' width='88' height='88' rx='18' fill='#f4ead5'/>"
    + "<circle cx='28' cy='28' r='9'/><circle cx='72' cy='72' r='9'/><circle cx='28' cy='72' r='9'/>"
    + "<circle cx='76' cy='24' r='22' fill='#e5484d' stroke='#161b1e' stroke-width='5'/></svg>";
  return (badgeIcon = `data:image/svg+xml,${encodeURIComponent(svg)}`);
}

class Alerter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private title = '';
  private flip = false;
  private notif: Notification | null = null;

  get on() { return this.timer !== null; }

  start(opts: { notify: boolean }) {
    if (this.timer) return;
    this.title = document.title;
    const link = iconLink();
    if (link) { baseIcon ??= link.href; link.href = badged(); }
    this.flip = true;
    document.title = ALERT_TITLE;
    this.timer = setInterval(() => { this.flip = !this.flip; document.title = this.flip ? ALERT_TITLE : this.title; }, 1000);
    // Son discret : deux petites notes (rien si le son est coupé ou pas encore autorisé).
    sound.turn(); setTimeout(() => sound.turn(), 160);
    if (opts.notify && document.visibilityState !== 'visible') void this.showNotification();
  }

  private async showNotification() {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const body = 'C\'est votre tour de lancer les dés.';
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (!this.timer) return;
      if (reg) {
        await reg.showNotification(ALERT_TITLE, { body, tag: TAG, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', lang: 'fr', data: { focus: true } });
      } else {
        this.notif = new Notification(ALERT_TITLE, { body, tag: TAG, icon: '/icons/icon-192.png', lang: 'fr' });
        this.notif.onclick = () => { window.focus(); this.notif?.close(); };
      }
    } catch { /* notifications indisponibles : le titre et l'icône suffisent */ }
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer); this.timer = null;
    document.title = this.title;
    const link = iconLink();
    if (link && baseIcon) link.href = baseIcon;
    this.notif?.close(); this.notif = null;
    void navigator.serviceWorker?.getRegistration?.().then((reg) => reg?.getNotifications({ tag: TAG })).then((ns) => ns?.forEach((n) => n.close())).catch(() => {});
  }
}

/**
 * À brancher sur l'écran de partie. `enabled` : réglage du joueur (et pas en spectateur ni en
 * partie à plusieurs sur le même appareil). `vibrate` : réglage des vibrations.
 */
export function useTurnAlert(controller: GameController, enabled: boolean, vibrate: boolean) {
  const vib = useRef(vibrate);
  vib.current = vibrate;
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const alerter = new Alerter();
    let mine = false;
    const update = () => {
      if (mine && away()) alerter.start({ notify: controller.mode === 'online' });
      else alerter.stop();
    };
    const offE = controller.subscribeEvents((e) => {
      const s = e.state;
      const now = currentPlayerId(s) === controller.meId;
      // Début de mon tour en ligne, application visible : petite vibration (téléphone).
      if (now && !mine && controller.mode === 'online' && document.visibilityState === 'visible' && vib.current && s.throwsUsed === 0) {
        try { navigator.vibrate?.([60, 80, 60]); } catch { /* refusé */ }
      }
      mine = now;
      update();
    });
    const onVis = () => update();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    window.addEventListener('blur', onVis);
    return () => {
      offE();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      window.removeEventListener('blur', onVis);
      alerter.stop();
    };
  }, [controller, enabled]);
}
