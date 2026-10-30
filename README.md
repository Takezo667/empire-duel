# Empire Duel Remaster — Jeu navigateur 2 à 4 joueurs

Jeu de stratégie en temps réel **original**, inspiré du genre des RTS historiques (non affilié à Age of Empires ou Microsoft).

## Nouveautés

- Carte agrandie avec rendu 2D dessiné, routes, arbres, champs et mines (sans emojis sur le terrain)
- Caméra centrée sur **ton** château à la connexion (corrige le problème de sélection du joueur 2)
- Caméra déplaçable avec **WASD**, les flèches et la mini-carte, zoom avec la molette ou les boutons +/−
- Sélection d'unités par clic ou sélection multiple en traçant un rectangle
- Clic droit pour déplacer, récolter ou attaquer ; le clic gauche sur le terrain fonctionne aussi après sélection
- Construction de maisons, casernes, archeries, écuries et tours ; chantiers construits par les villageois
- Recrutement de villageois, épéistes, archers, éclaireurs ; limites de population et files d'entraînement
- Combat en temps réel, tours de défense, points de vie et victoire par destruction des centres-villes
- Salons privés de 2 à 4 joueurs via code ou lien, retour dans une partie après rafraîchissement via un jeton du navigateur

## Pour jouer en local sur Mac ou Windows

Installez Node.js (version 18 ou supérieure), puis ouvrez le Terminal dans ce dossier :

```sh
npm install
npm start
```

Ouvrez `http://localhost:3000`.

## Publier sur Render (compte GitHub déjà relié)

Conservez cette structure, avec `server.js` et `package.json` à la racine :

```
empire-duel/
  package.json
  server.js
  README.md
  public/
    index.html
    style.css
    app.js
```

Mettez **tous** ces fichiers à jour dans votre dépôt GitHub `Takezo667/empire-duel`.

Render → votre service `empire-duel` → déploiement automatique sur `main`, ou **Manual Deploy → Deploy latest commit**.

Paramètres Render : Web Service / Node ; Build `npm install`, Start `npm start`, instance Free si souhaitée. Aucune variable d'environnement n'est requise.

### Attention

- Les parties sont en mémoire du serveur et **recommencent** lors d'un redéploiement ou d'une mise en veille/reprise sur l'offre gratuite.
- Les commandes sont validées côté serveur ; pour une expérience fluide, une connexion stable est préférable.
- Testez en créant un nouveau code de salon après cette mise à jour.
