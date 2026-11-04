import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Deux modes de build :
//  - normal     : client servi par le serveur Node (solo + multijoueur), sortie dist/client
//  - standalone : un seul fichier HTML autonome (solo + bac d'essai, sans serveur), sortie dist/standalone
/**
 * Polices principales de l'accueil demandées dès la lecture de la page (au lieu d'attendre que le
 * JavaScript affiche le texte) : le titre et les boutons apparaissent directement avec la bonne police.
 */
const FONT_PRELOAD = [/barlow-latin-500-normal-.*\.woff2$/, /barlow-latin-700-normal-.*\.woff2$/, /barlow-condensed-latin-800-normal-.*\.woff2$/];
const preloadFonts = {
  name: 'preload-fonts',
  transformIndexHtml: {
    order: 'post' as const,
    handler(html: string, ctx: { bundle?: Record<string, unknown> }) {
      const files = Object.keys(ctx.bundle ?? {}).filter((f) => FONT_PRELOAD.some((r) => r.test(f)));
      return files.map((f) => ({ tag: 'link', attrs: { rel: 'preload', href: `/${f}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' as const }));
    },
  },
};

export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
    root: 'client',
    plugins: standalone ? [react(), viteSingleFile()] : [react(), preloadFonts],
    define: { __STANDALONE__: JSON.stringify(standalone) },
    server: {
      port: 5173,
      fs: { allow: ['..'] },
      proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
    },
    build: {
      outDir: standalone ? '../dist/standalone' : '../dist/client',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2000,
      // Version servie : la 3D (three) et la physique (cannon-es) dans leurs propres fichiers, gardés en
      // cache d'une version du jeu à l'autre tant que ces bibliothèques ne changent pas.
      rollupOptions: standalone ? {} : {
        output: {
          manualChunks: (id: string) => (id.includes('/node_modules/three/') ? 'three' : id.includes('/node_modules/cannon-es/') ? 'cannon' : undefined),
        },
      },
    },
    test: { root: '.', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
  } as any;
});
