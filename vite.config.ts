import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Deux modes de build :
//  - normal     : client servi par le serveur Node (solo + multijoueur), sortie dist/client
//  - standalone : un seul fichier HTML autonome (solo + bac d'essai, sans serveur), sortie dist/standalone
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
    root: 'client',
    plugins: standalone ? [react(), viteSingleFile()] : [react()],
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
    },
    test: { root: '.', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
  } as any;
});
