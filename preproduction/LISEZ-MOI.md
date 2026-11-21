# Préproduction Révis’Facile

Les fichiers à publier sont dans [l’archive statique](revis-facile-preproduction.zip). L’interface de production du dépôt et son déploiement Pages actuel restent en place. La copie statique s’installe dans un dépôt GitHub Pages **séparé**.

## 1. Activer le serveur dans Apps Script – TEST

1. Ouvre le projet **Révis’Facile – TEST** avec le compte Google secondaire. Dans les paramètres, vérifie que les trois propriétés Drive pointent vers les dossiers de test **Photos**, **Questionnaires fictifs** et **Archives**.
2. Remplace seulement le contenu de `Code.gs` par celui du [Code.gs du kit TEST](../kit-test/Code.gs). Garde le fichier HTML et les propriétés existantes. Ajoute une propriété `REVIS_FACILE_PREPRODUCTION` avec la valeur `oui`. L’installation des dossiers fictifs a déjà été faite.
3. Fais **Déployer → Nouveau déploiement → Application Web**. Choisis **Exécuter en tant que moi** et **Toute personne**, si ton compte propose cette option. Copie l’URL qui se termine par `/exec`. Il s’agit de l’adresse publique du serveur d’essai. Le code familial **de test** reste nécessaire dans l’application.

## 2. Publier la page dans un autre dépôt GitHub

1. Télécharge l’archive et décompresse-la. Crée un **nouveau dépôt public** nommé `revis-facile-preproduction` et coche **Add a README file**. Laisse les réglages Pages de `revis-facile` tels quels.
2. Dans le nouveau dépôt, choisis **Add file → Upload files** et dépose les **fichiers décompressés**, dont `index.html`, à la racine du nouveau dépôt. Valide avec **Commit changes**. La branche par défaut de ce nouveau dépôt appartient à ce site séparé.
3. Dans ce nouveau dépôt uniquement, ouvre **Settings → Pages**. Sélectionne **Deploy from a branch**, puis la branche par défaut et **/(root)**. Enregistre. Quand **Visit site** apparaît, ouvre le lien et utilise l’URL HTTPS affichée par GitHub.

Le dépôt de préproduction ne reçoit ni fichier Apps Script ni données Drive. L’adresse du serveur se renseigne dans le navigateur. Aucun code familial, secret ou clé API n’est nécessaire dans GitHub.

## 3. Ouvrir sur ordinateur et Firefox Android

1. Sur ordinateur, ouvre l’adresse HTTPS du nouveau site. Colle l’URL `/exec` du projet **TEST**, puis choisis **Ouvrir la préproduction**. La page vérifie que le serveur a été activé pour la préproduction avant d’afficher la connexion.
2. Saisis le code familial **de test**. Ouvre un questionnaire fictif. Pour essayer la génération, utilise uniquement les [photos fictives](../kit-test/photos-fictives).
3. Sur Firefox Android, ouvre la même adresse HTTPS avec les réglages Family Link habituels. Colle la même URL `/exec` du serveur **TEST** à la première visite, puis connecte-toi avec le code de test.
4. Ferme et rouvre Firefox sur le lien HTTPS pour vérifier la reprise de session. Le navigateur conserve l’adresse du serveur et la session s’il autorise le stockage du site. **Changer le serveur TEST** permet de revenir au formulaire.

L’archive est reconstruite avec `python preproduction/preparer.py` lorsque l’interface évolue.
