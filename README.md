# Empire Duel — 2 à 4 joueurs

Jeu original de stratégie en temps réel, inspiré du genre RTS, non affilié à Age of Empires ni à Microsoft.

## Sur Mac ou PC

1. Installer Node.js 18+ sur le Mac qui héberge le serveur (pas nécessaire pour les autres joueurs).
2. Ouvrir Terminal dans le dossier du jeu, puis lancer `npm install` et `npm start`.
3. Ouvrir `http://localhost:3000` sur le Mac serveur.
4. Sur le même Wi-Fi, les autres ouvrent `http://IP-LOCALE-DU-MAC:3000`.
5. Les 2 à 4 joueurs utilisent le même code de salon. Les couleurs sont bleu, rouge, or, violet.

## Mettre le jeu sur Internet

Déployer **ce dossier** sur un hébergeur prenant en charge Node.js et WebSocket (par exemple Render), via un dépôt GitHub.
- Build command : `npm install`
- Start command : `npm start`
- Partager l'URL HTTPS attribuée par l'hébergeur.
- Chaque joueur ouvre le lien et saisit le même code de salon. Aucun téléchargement ni compte requis pour les joueurs.

## Règles

Récolter des ressources avec les ouvriers. Construire des casernes et des tours, former des soldats, attaquer les unités et châteaux ennemis. Le dernier château restant remporte la partie (à partir de deux royaumes inscrits). De 2 à 4 joueurs par salon. Les royaumes sont créés à l'arrivée de chaque joueur. Un joueur éliminé ne peut plus agir.

Les salons et parties sont conservés uniquement en mémoire sur le serveur : un redémarrage efface la progression. Un emplacement est réservé dès la première connexion d'un joueur ; une déconnexion ne libère pas cet emplacement pendant la partie. Le jeu ne contient pas de système d'alliances formelles, d'IA, ni de sauvegarde.
