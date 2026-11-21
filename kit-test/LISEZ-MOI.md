# Tester la connexion de Révis’Facile

Ce kit crée deux questionnaires fictifs et les dossiers de test dans le Drive du compte qui l’installe. Il héberge la page de test dans le même projet Apps Script. Aucun dossier existant ni aucune clé Gemini ne sont nécessaires.

## Après accord pour le déploiement de test

1. Ouvrir [script.google.com](https://script.google.com/) et cliquer sur **Nouveau projet**. Le nommer **Révis’Facile — Test de connexion**.
2. Remplacer le contenu du fichier `Code.gs` par celui du [Code.gs de ce dossier](Code.gs). Cliquer sur **+ → HTML**, nommer le fichier **Index**, puis remplacer son contenu par celui d’[Index.html](Index.html). Enregistrer les deux fichiers.
3. Ouvrir **Paramètres du projet → Propriétés du script**. Ajouter `CODE_ACCES` avec un code réservé au test, puis `SESSION_SECRET` avec 64 caractères hexadécimaux aléatoires en minuscules. Sur Mac, `openssl rand -hex 32 | pbcopy` place directement la valeur dans le presse-papiers. Sur Windows, PowerShell peut faire de même avec la commande ci-dessous. Coller la valeur uniquement dans les propriétés du script et vider ensuite le presse-papiers.
4. Dans l’éditeur, sélectionner **installerTest**, cliquer sur **Exécuter** et autoriser ce nouveau projet à accéder à Drive si Google le demande. Le script crée automatiquement les dossiers et les deux questionnaires fictifs.
5. Dans ce même projet, choisir **Déployer → Nouveau déploiement → Application Web**. Sélectionner **Exécuter en tant que moi** et **Toute personne** pour l’accès, si ton compte propose cette option. Ouvrir l’URL qui se termine par `/exec`. Cette URL est celle du test et s’ouvre directement sur ordinateur et téléphone. Si le compte ne propose pas l’accès sans connexion Google, le test du parcours sans compte Google reste bloqué sur ce compte.

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

Cette page de test utilise le canal intégré d’Apps Script. Elle permet d’essayer les sessions réelles et les questionnaires fictifs. La validation finale de la communication GitHub Pages → Apps Script et du stockage sous le domaine GitHub Pages reste distincte. Le kit n’appelle pas Gemini.
