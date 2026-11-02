import { createRoot } from 'react-dom/client';
import { App } from './App';
// Polices servies par notre propre serveur (aucune requête vers un service tiers).
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-500-italic.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow/latin-800.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Application installable : service worker (cache hors ligne) uniquement pour la version web
// servie en HTTPS (ou localhost). Ni la version fichier unique, ni l'application native n'en ont besoin.
const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
if (import.meta.env.PROD && !__STANDALONE__ && !isNative && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
