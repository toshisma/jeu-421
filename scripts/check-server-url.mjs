// Garde-fou : une application mobile sans adresse de serveur n'aurait pas de multijoueur.
const url = process.env.VITE_SERVER_URL;
if (!url || !/^https:\/\//.test(url)) {
  console.error('\n✖ Indiquez l\'adresse HTTPS de votre serveur de jeu, par exemple :\n  VITE_SERVER_URL=https://jeu-421.onrender.com npm run app:build\n');
  process.exit(1);
}
console.log(`Application mobile reliée au serveur : ${url}`);
