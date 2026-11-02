import { startServer } from './app';

const port = Number(process.env.PORT) || 3001;
startServer({
  port,
  accounts: { minSoloMs: process.env.MIN_SOLO_MS ? Number(process.env.MIN_SOLO_MS) : undefined },
}).then(({ port: p }) => {
  console.log(`🎲 Serveur 421 prêt sur http://localhost:${p}`);
});
