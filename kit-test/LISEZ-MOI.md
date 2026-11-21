# Tester la génération multiphoto de Révis’Facile

Ce kit crée deux questionnaires fictifs et les dossiers de test dans le Drive du compte qui l’installe. Il héberge la page de test dans le même projet Apps Script. Aucun dossier existant n’est nécessaire. La connexion et les deux questionnaires fictifs sont testables sans Gemini. Pour tester la génération, utilise une clé Gemini réservée à cet essai.

## Après accord pour le déploiement de test

1. Ouvrir [script.google.com](https://script.google.com/) et cliquer sur **Nouveau projet**. Le nommer **Révis’Facile — Test multiphoto**.
2. Remplacer le contenu du fichier `Code.gs` par celui du [Code.gs de ce dossier](Code.gs). Cliquer sur **+ → HTML**, nommer le fichier **Index**, puis remplacer son contenu par celui d’[Index.html](Index.html). Enregistrer les deux fichiers.
3. Ouvrir **Paramètres du projet → Propriétés du script**. Ajouter `CODE_ACCES` avec un code réservé au test, puis `SESSION_SECRET` avec 64 caractères hexadécimaux aléatoires en minuscules. Sur Mac, `openssl rand -hex 32 | pbcopy` place directement la valeur dans le presse-papiers. Sur Windows, PowerShell peut faire de même avec la commande ci-dessous. Coller la valeur uniquement dans les propriétés du script et vider ensuite le presse-papiers.
4. Dans l’éditeur, sélectionner **installerTest**, cliquer sur **Exécuter** et autoriser ce nouveau projet à accéder à Drive si Google le demande. Le script crée automatiquement les dossiers et les deux questionnaires fictifs.
5. Pour le test de génération, ajouter la propriété `GEMINI_API_KEY` dans ce projet de test. Coller la clé uniquement dans les propriétés du script.
6. Dans ce même projet, choisir **Déployer → Nouveau déploiement → Application Web**. Sélectionner **Exécuter en tant que moi** et **Toute personne** pour l’accès, si ton compte propose cette option. Ouvrir l’URL qui se termine par `/exec`. Cette URL est celle du test et s’ouvre directement sur ordinateur et téléphone. Si le compte ne propose pas l’accès sans connexion Google, le test du parcours sans compte Google reste bloqué sur ce compte.

```powershell
$octetsSession = New-Object byte[] 32
$aleatoireSession = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$aleatoireSession.GetBytes($octetsSession)
$aleatoireSession.Dispose()
([BitConverter]::ToString($octetsSession).Replace('-', '').ToLowerInvariant()) | Set-Clipboard
```

## Parcours à essayer

1. Saisir le code de test. Ouvrir le questionnaire **Fractions**, le terminer, puis ouvrir **Géographie**.
2. Fermer Firefox Android en mode normal, puis rouvrir l’URL avec les réglages Family Link habituels. Les questionnaires doivent s’afficher sans ressaisie si Firefox conserve le stockage du site.
3. Appuyer sur **Se déconnecter**, puis rouvrir la page. Le code doit être demandé.
4. Facultatif, pour tester la révocation globale. Se reconnecter dans deux navigateurs. Dans les propriétés du projet, ajouter `NOUVEAU_CODE_ACCES` avec un autre code de test. Depuis l’éditeur, exécuter **changerCodeTest** avec le compte propriétaire. Recharger les deux pages. Elles doivent demander le nouveau code.

## Tester plusieurs photos

1. Télécharger les images fictives [fractions-1.jpg](photos-fictives/fractions-1.jpg), [fractions-2.jpg](photos-fictives/fractions-2.jpg) et [volcans-1.jpg](photos-fictives/volcans-1.jpg).
2. Sur le téléphone, sélectionner les deux pages de fractions, puis appuyer sur **Générer le questionnaire**. Vérifier le compteur d’envoi, puis le titre proposé. Modifier le titre ou le conserver, puis appuyer sur **Enregistrer le questionnaire**. Vérifier que le questionnaire apparaît alors dans **Mes questionnaires**. Rechercher une question sur la simplification et une sur l’addition pour vérifier que les deux pages ont été prises en compte.
3. Dans Drive, ouvrir le dossier **Révis’Facile — Test multiphoto**. Sous **Archives**, vérifier que le dossier portant le titre du nouveau cours contient les deux images et que le dossier **Questionnaires fictifs** contient un seul nouveau fichier JSON.
4. Pour vérifier l’isolation, lancer un autre lot avec la page sur les volcans depuis un second navigateur ou appareil. Vérifier que ses questions et son dossier d’archives concernent uniquement les volcans.
5. Pour tester la reprise, couper le réseau pendant un envoi. Vérifier qu’un message s’affiche, que les photos restent sélectionnées et que le bouton **Réessayer** est disponible. Rétablir le réseau, puis appuyer sur **Réessayer**. Refaire l’essai pendant la génération pour vérifier qu’un retour tardif du serveur ne crée pas de doublon. Si la page a été fermée et que certaines photos manquent, resélectionner les mêmes fichiers dans le même ordre. Vérifier qu’un seul questionnaire est ajouté après enregistrement. Refaire l’essai en coupant le réseau pendant l’enregistrement du titre. La nouvelle tentative doit conserver le titre saisi et reprendre le même lot.

6. Dans **Mes questionnaires**, appuyer sur **Renommer**, puis enregistrer un autre titre. Vérifier que le titre affiché et celui du dossier d’archives changent, que les questions et les photos sont toujours présentes et qu’aucun fichier JSON supplémentaire n’apparaît.

La page d’essai est hébergée par Apps Script. Elle permet de tester la sélection, la compression, les sessions, Gemini et Drive sur Firefox Android et sur ordinateur. La communication depuis le domaine GitHub Pages reste à valider séparément. Si une exécution est interrompue brutalement, son lot peut rester réservé jusqu’à dix minutes avant de pouvoir être repris.

Les contrôles locaux utilisent seulement les images fictives et des simulations de Drive, Gemini et du navigateur. Depuis la racine du dépôt, exécuter `node kit-test/tests-lots.cjs`.
