import { useEffect, useState } from 'react';
import { isNativeApp } from '../platform';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// L'événement peut arriver avant que l'accueil soit affiché : on le garde de côté.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * « Installer l'application » :
 *  - Android / Chrome / Edge : bouton qui ouvre la fenêtre d'installation du navigateur ;
 *  - iPhone / iPad (Safari) : pas d'API d'installation, on explique le geste (Partager → Sur l'écran d'accueil) ;
 *  - déjà installée ou application native : rien.
 */
export function InstallPrompt() {
  const [, force] = useState(0);
  const [iosHelp, setIosHelp] = useState(false);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (isNativeApp() || isStandalone() || location.protocol === 'file:') return null;

  if (deferred) {
    return (
      <button className="btn" onClick={async () => {
        const d = deferred!;
        await d.prompt();
        await d.userChoice.catch(() => null);
        deferred = null;
        force((n) => n + 1);
      }}>📲 Installer l'application</button>
    );
  }
  if (isIos()) {
    return (
      <>
        <button className="btn ghost" onClick={() => setIosHelp((v) => !v)}>📲 Installer sur l'iPhone</button>
        {iosHelp && <p className="muted small center">Dans Safari, touchez <b>Partager</b> (le carré avec une flèche), puis <b>Sur l'écran d'accueil</b>.</p>}
      </>
    );
  }
  return null;
}
