import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Application mobile (Android / iOS) : la même interface que la version web, embarquée dans
 * l'application. Le multijoueur se connecte au serveur dont l'adresse est fixée au build :
 *   VITE_SERVER_URL=https://votre-serveur.example npm run app:build
 * Changez `appId` avant la première publication (il ne peut plus changer ensuite sur les stores).
 */
const config: CapacitorConfig = {
  appId: 'com.exemple.jeu421',
  appName: '421',
  webDir: 'dist/client',
  backgroundColor: '#140c07',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never' },
};

export default config;
