const MODELE = "gemini-3.5-flash-lite";

function genererQuestionnaire_() {
  const props = PropertiesService.getScriptProperties();
  const cle = props.getProperty("GEMINI_API_KEY");
  const idCours = props.getProperty("DOSSIER_COURS");
  const idQuiz = props.getProperty("DOSSIER_QUIZ");
  const idTraites = props.getProperty("DOSSIER_TRAITES");
   if (!cle || !idCours || !idQuiz || !idTraites) {
    throw new Error("Paramètres du projet manquants.");
  }

  const dossierCours = DriveApp.getFolderById(idCours);
  const dossierQuiz = DriveApp.getFolderById(idQuiz);
  const dossierTraites = DriveApp.getFolderById(idTraites);
  const fichiers = dossierCours.getFiles();
  const photos = [];

  while (fichiers.hasNext()) {
    const fichier = fichiers.next();
    if (["image/jpeg", "image/png", "image/webp"]
        .includes(fichier.getMimeType())) {
      photos.push(fichier);
    }
  }

  if (photos.length === 0) {
    throw new Error("Aucune photo trouvée.");
  }

// Préparer toutes les photos du cours.
const partiesImages = [];

for (const photo of photos) {
  const blob = photo.getBlob();

  if (blob.getBytes().length > 15 * 1024 * 1024) {
    throw new Error("Photo trop volumineuse : " + photo.getName());
  }

  partiesImages.push({
    inline_data: {
      mime_type: blob.getContentType(),
      data: Utilities.base64Encode(blob.getBytes())
    }
  });

  Logger.log("Photo préparée : " + photo.getName());
}

  const consigne = `
Tu es un professeur de collège français.

Lis attentivement cette photographie d'un cours.

Crée un questionnaire de révision interactif
pour un élève de 5e.

CONSIGNES PÉDAGOGIQUES :
- Choisis le nombre de questions selon la richesse du cours.
- Évite les questions répétitives.
- Vérifie les notions essentielles.
- N'invente aucune connaissance absente du cours.
- Varie les types de questions quand c'est pertinent.
- Formule des questions précises et sans ambiguïté.
- Fournis une explication courte après chaque réponse.
- Répartis les bonnes réponses dans les choix proposés.

TYPES AUTORISÉS :

"qcm" : une seule réponse correcte,
avec 2 à 5 propositions.

"multiple" : plusieurs réponses correctes,
avec 3 à 5 propositions.

"vrai_faux" : affirmation à juger.

"trou" : mot, date ou expression à compléter.

"court" : réponse courte, quelques mots.

Pour les questions écrites ("trou" et "court") :

- Prévois systématiquement plusieurs formulations acceptables
  dans "reponsesAcceptees" lorsque c'est pertinent.
- Accepte les réponses courtes qui expriment correctement
  la connaissance demandée, même sans phrase complète.
- Prévois les variantes avec ou sans mots facultatifs,
  articles et unités implicites dans la question.
- Pour les nombres, prévois différentes écritures
  équivalentes : chiffres, lettres et expressions usuelles.
- Prévois les synonymes et reformulations qui conservent
  exactement le même sens dans le contexte du cours.
- N'exige pas de reprendre mot pour mot la formulation
  du cours si une autre formulation est correcte.
- N'accepte pas une réponse imprécise qui pourrait
  correspondre à plusieurs notions différentes.
- N'accepte jamais une valeur, une date ou une notion
  factuellement incorrecte.
- Évite les questions trop ouvertes ou ambiguës.
- Ne demande pas de rédaction longue.

EXEMPLE :
Question : "Combien d'habitants compte environ
la population mondiale ?"
reponsesAcceptees :
["8 milliards d'habitants", "8 milliards",
 "environ 8 milliards", "8 000 000 000",
 "8 milliards de personnes"]

Ces variantes sont équivalentes dans cet exemple.
En revanche, "8 millions" est une réponse incorrecte.

IMPORTANT :
La correction doit évaluer la connaissance de l'élève,
pas sa capacité à reproduire une formulation exacte.

RÉPONSE :
Retourne uniquement un objet JSON valide.

Structure :
{
  "titre": "Titre du cours",
  "questions": [
    {
      "type": "qcm",
      "question": "Question ?",
      "choix": ["A", "B", "C"],
      "correctes": [1],
      "reponsesAcceptees": [],
      "explication": "Explication"
    },
    {
      "type": "trou",
      "question": "Complète : ...",
      "choix": [],
      "correctes": [],
      "reponsesAcceptees": ["réponse", "variante"],
      "explication": "Explication"
    }
  ]
}

RÈGLES DE STRUCTURE :
- Pour qcm : correctes contient un seul indice.
- Pour multiple : correctes contient tous les indices corrects.
- Pour vrai_faux : choix vaut ["Vrai","Faux"]
  et correctes contient 0 ou 1.
- Pour trou et court : utiliser reponsesAcceptees.
- Les indices commencent à 0.
- Toutes les questions ont une explication.
`;

const requete = {
  contents: [{
    parts: [
      { text: consigne },
      ...partiesImages
    ]
  }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      temperature: 0.2
    }
  };

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    MODELE + ":generateContent";

  let reponse;

  for (let essai = 1; essai <= 3; essai++) {
    Logger.log("Tentative " + essai + "/3");

    reponse = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": cle },
      payload: JSON.stringify(requete),
      muteHttpExceptions: true
    });

    const statut = reponse.getResponseCode();
    if (statut === 200) break;

    if (![429, 500, 502, 503, 504].includes(statut)) {
      break;
    }

    if (essai < 3) {
      Utilities.sleep(5000 * essai);
    }
  }

  const statut = reponse.getResponseCode();
  const resultat = JSON.parse(reponse.getContentText());

  if (statut !== 200) {
    throw new Error(
      "Gemini HTTP " + statut + " : " +
      (resultat.error?.message || "Erreur inconnue")
    );
  }

  const texte = (resultat.candidates || [])
    .flatMap(c => c.content?.parts || [])
    .map(p => p.text || "")
    .join("");

  if (!texte) {
    throw new Error("Gemini n'a pas produit de questionnaire.");
  }

  const quiz = JSON.parse(texte);
  verifierQuiz_(quiz);

  // Identifiant aléatoire du questionnaire.
  quiz.id = Utilities.getUuid();

  const nom = "Quiz_" + quiz.id + ".json";

  dossierQuiz.createFile(
    nom,
    JSON.stringify(quiz, null, 2),
    "application/json"
  );
// Créer un sous-dossier pour conserver les photos du cours.
const nomDossier = quiz.titre
  .replace(/[\\/:*?"<>|]/g, "-")
  .substring(0, 80);

const dossierArchive = dossierTraites.createFolder(nomDossier);

// Déplacer toutes les photos dans ce sous-dossier.
for (const photo of photos) {
  photo.moveTo(dossierArchive);
  Logger.log("Photo archivée : " + photo.getName());
}

Logger.log("Cours archivé dans : " + nomDossier);
  Logger.log("QUESTIONNAIRE CRÉÉ !");
  Logger.log("Titre : " + quiz.titre);
  Logger.log("Questions : " + quiz.questions.length);
  Logger.log("Identifiant : " + quiz.id);

  const adresse = ScriptApp.getService().getUrl();

  if (adresse) {
    Logger.log("Lien : " + adresse + "?id=" + quiz.id);
  } else {
    Logger.log("Le lien sera disponible après déploiement.");
  }
}

function verifierQuiz_(quiz) {
  if (!quiz || typeof quiz.titre !== "string" ||
      !Array.isArray(quiz.questions) ||
      quiz.questions.length === 0) {
    throw new Error("Questionnaire incomplet.");
  }

  quiz.questions.forEach((q, i) => {
    const types = ["qcm", "multiple", "vrai_faux", "trou", "court"];

    if (!types.includes(q.type) ||
        typeof q.question !== "string" ||
        !q.question.trim() ||
        typeof q.explication !== "string" ||
        !q.explication.trim()) {
      throw new Error("Question invalide : " + (i + 1));
    }

    if (["qcm", "multiple", "vrai_faux"].includes(q.type)) {
      if (!Array.isArray(q.choix) ||
          !Array.isArray(q.correctes) ||
          q.correctes.length === 0 ||
          q.correctes.some(n =>
            !Number.isInteger(n) ||
            n < 0 || n >= q.choix.length
          ) ||
          new Set(q.correctes).size !== q.correctes.length) {
        throw new Error("Choix invalides : question " + (i + 1));
      }

      if (q.type === "qcm" &&
          (q.choix.length < 2 ||
           q.choix.length > 5 ||
           q.correctes.length !== 1)) {
        throw new Error("QCM invalide : " + (i + 1));
      }

      if (q.type === "multiple" &&
          (q.choix.length < 3 ||
           q.choix.length > 5 ||
           q.correctes.length < 2 ||
           q.correctes.length >= q.choix.length)) {
        throw new Error("Choix multiples invalides : " + (i + 1));
      }

      if (q.type === "vrai_faux" &&
          (q.choix.length !== 2 ||
           q.correctes.length !== 1)) {
        throw new Error("Vrai/faux invalide : " + (i + 1));
      }
    } else if (
      !Array.isArray(q.reponsesAcceptees) ||
      q.reponsesAcceptees.length === 0 ||
      q.reponsesAcceptees.some(r =>
        typeof r !== "string" || !r.trim()
      )
    ) {
      throw new Error("Réponses écrites invalides : " + (i + 1));
    }
  });
}

function chargerQuiz_(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id || "")) {
    throw new Error("Identifiant invalide.");
  }

  const dossier = DriveApp.getFolderById(
    PropertiesService.getScriptProperties()
      .getProperty("DOSSIER_QUIZ")
  );

  const fichiers = dossier.getFilesByName("Quiz_" + id + ".json");

  if (!fichiers.hasNext()) {
    throw new Error("Questionnaire introuvable.");
  }

  return JSON.parse(fichiers.next().getBlob().getDataAsString());
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Révis’Facile — Test de connexion")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function traiterPostTest_(e) {
  const reponse = {
    succes: false,
    message: "Demande refusée."
  };

  try {
    const donnees = JSON.parse(e?.postData?.contents || "{}");

    if (donnees.action === "connexion") {
      return reponseJson_(connecterFamille_(donnees.codeAcces));
    }

    if (donnees.action === "deconnexion") {
      revoquerSession_(donnees.jeton);
      return reponseJson_({ succes: true });
    }

    const actionsProtegees = [
      "chargerQuiz", "verifierReponse", "listerQuiz", "genererQuiz", "ajouterPhoto"
    ];
    if (!actionsProtegees.includes(donnees.action)) {
      return reponseJson_(reponse);
    }

    if (!sessionValide_(donnees.jeton)) {
      return reponseJson_({ succes: false, erreur: "SESSION_INVALIDE" });
    }

    if (donnees.action === "chargerQuiz") {
      reponse.quiz = chargerQuiz_(donnees.id);

      reponse.succes = true;
      reponse.message = "Questionnaire chargé.";
    }

if (donnees.action === "listerQuiz") {
  reponse.questionnaires = listerQuiz_();
  reponse.succes = true;
  reponse.message = "Liste des questionnaires récupérée.";
}
if (donnees.action === "ajouterPhoto") {
  reponse.nomFichier = enregistrerPhoto_(donnees);
  reponse.succes = true;
  reponse.message = "Photo enregistrée.";
}
if (donnees.action === "genererQuiz") {
  const verrouGeneration = LockService.getScriptLock();

  if (!verrouGeneration.tryLock(1000)) {
    throw new Error("Une génération est déjà en cours.");
  }

  try {
    genererQuestionnaire_();
    reponse.succes = true;
    reponse.message = "Questionnaire créé avec succès.";
  } finally {
    verrouGeneration.releaseLock();
  }
}
    if (donnees.action === "verifierReponse") {
      const quiz = chargerQuiz_(donnees.id);

      // Limite globale : 30 corrections par heure.
      const cacheCorrections = CacheService.getScriptCache();
      const verrouCorrections = LockService.getScriptLock();

      verrouCorrections.waitLock(5000);

      try {
        const heure = Utilities.formatDate(
          new Date(),
          "Europe/Paris",
          "yyyyMMddHH"
        );

        const cleLimite = "corrections_" + heure;
        const nombre = Number(
          cacheCorrections.get(cleLimite) || 0
        );

        if (nombre >= 30) {
          throw new Error("Limite de corrections atteinte.");
        }

        cacheCorrections.put(
          cleLimite,
          String(nombre + 1),
          3600
        );

      } finally {
        verrouCorrections.releaseLock();
      }

      const index = donnees.index;

      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= quiz.questions.length
      ) {
        throw new Error("Question invalide.");
      }

      const question = quiz.questions[index];

      if (!["trou", "court"].includes(question.type)) {
        throw new Error("Type de question invalide.");
      }

      const texteEleve = donnees.reponse;

      if (
        typeof texteEleve !== "string" ||
        !texteEleve.trim() ||
        texteEleve.length > 300
      ) {
        throw new Error("Réponse invalide.");
      }

      reponse.correcte = verifierReponseAvecGemini_(
        question.question,
        texteEleve,
        question.reponsesAcceptees
      );

      reponse.succes = true;
      reponse.message = "Réponse vérifiée.";
    }

  } catch (erreur) {
    console.error(erreur);
    reponse.message = "Demande refusée.";
  }

  return reponseJson_(reponse);
}

function reponseJson_(donnees) {
  return ContentService.createTextOutput(JSON.stringify(donnees))
    .setMimeType(ContentService.MimeType.JSON);
}

function enregistrerPhoto_(donnees) {
  const idDossier = PropertiesService
    .getScriptProperties()
    .getProperty("DOSSIER_COURS");

  if (!idDossier) {
    throw new Error("Dossier des cours non configuré.");
  }

  const typesAutorises = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!typesAutorises.includes(donnees.typeFichier)) {
    throw new Error("Format d'image non autorisé.");
  }

  if (
    typeof donnees.contenuBase64 !== "string" ||
    donnees.contenuBase64.length > 20 * 1024 * 1024
  ) {
    throw new Error("Image absente ou trop volumineuse.");
  }

  const octets = Utilities.base64Decode(donnees.contenuBase64);

  const nom = "Cours_" + Utilities.getUuid() +
    (donnees.typeFichier === "image/png" ? ".png" :
     donnees.typeFichier === "image/webp" ? ".webp" : ".jpg");

  const blob = Utilities.newBlob(
    octets,
    donnees.typeFichier,
    nom
  );

  DriveApp.getFolderById(idDossier).createFile(blob);

  return nom;
}

function verifierReponseAvecGemini_(question, reponse, reponsesAcceptees) {
  const cle = PropertiesService.getScriptProperties()
    .getProperty("GEMINI_API_KEY");

  if (!cle) throw new Error("Clé Gemini manquante.");

  const consigne = `
Tu es un correcteur de collège français.

Évalue la réponse d'un élève de 5e.

Question : ${JSON.stringify(question)}
Réponse de l'élève : ${JSON.stringify(reponse)}
Réponses de référence : ${JSON.stringify(reponsesAcceptees)}

RÈGLES :
- Accepte les synonymes et formulations équivalentes.
- Accepte une réponse courte mais suffisamment précise.
- N'exige pas une phrase complète.
- Tiens compte des unités implicites dans la question.
- Refuse les erreurs factuelles et les réponses ambiguës.
- Ne considère pas la réponse de référence comme
  la seule formulation possible.
- Si tu ne peux pas déterminer si la réponse est juste,
  ne la valide pas.

Retourne uniquement un JSON :
{"correcte": true}
ou
{"correcte": false}
`;

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    MODELE + ":generateContent";

  const resultat = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "x-goog-api-key": cle },
    payload: JSON.stringify({
      contents: [{parts: [{text: consigne}]}],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: 256
      }
    }),
    muteHttpExceptions: true
  });

  if (resultat.getResponseCode() !== 200) {
    throw new Error("Correction Gemini indisponible.");
  }

  const donnees = JSON.parse(resultat.getContentText());
  const texte = (donnees.candidates || [])
    .flatMap(c => c.content?.parts || [])
    .map(p => p.text || "")
    .join("");

  const correction = JSON.parse(texte);
  if (typeof correction.correcte !== "boolean") {
    throw new Error("Correction Gemini invalide.");
  }

  return correction.correcte;
}

function listerQuiz_() {
  const idDossier = PropertiesService
    .getScriptProperties()
    .getProperty("DOSSIER_QUIZ");

  if (!idDossier) {
    throw new Error("Dossier des questionnaires non configuré.");
  }

  const dossier = DriveApp.getFolderById(idDossier);
  const fichiers = dossier.getFiles();
  const questionnaires = [];

  while (fichiers.hasNext()) {
    const fichier = fichiers.next();

    if (!fichier.getName().toLowerCase().endsWith(".json")) {
      continue;
    }

    try {
      const quiz = JSON.parse(
        fichier.getBlob().getDataAsString("UTF-8")
      );

      if (
        typeof quiz.id === "string" &&
        typeof quiz.titre === "string" &&
        Array.isArray(quiz.questions)
      ) {
        questionnaires.push({
          id: quiz.id,
          titre: quiz.titre
        });
      }
    } catch (erreur) {
      console.warn(
        "Questionnaire ignoré : " + fichier.getName()
      );
    }
  }

  questionnaires.sort((a, b) =>
    a.titre.localeCompare(b.titre, "fr")
  );

  return questionnaires;
}

const DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const PREFIXE_SESSION = "SESSION_EMPREINTE_";

function configurationSessions_(props) {
  const secret = props.getProperty("SESSION_SECRET");
  const code = props.getProperty("CODE_ACCES");
  if (!/^[a-f0-9]{64}$/.test(secret || "") || !code) {
    throw new Error("Configuration des sessions manquante.");
  }
  return { secret, code };
}

function signatureSession_(valeur, secret) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(valeur, secret)
  ).replace(/=+$/, "");
}

function cleSession_(jeton) {
  if (typeof jeton !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(jeton)) {
    return null;
  }
  const empreinte = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, jeton
  );
  return PREFIXE_SESSION + Utilities.base64EncodeWebSafe(empreinte)
    .replace(/=+$/, "");
}

function avecVerrouSessions_(operation) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(5000);
  try {
    return operation(PropertiesService.getScriptProperties());
  } finally {
    verrou.releaseLock();
  }
}

function connecterFamille_(codeSaisi) {
  return avecVerrouSessions_(props => {
    const { secret, code } = configurationSessions_(props);
    const maintenant = Date.now();
    const limite = JSON.parse(props.getProperty("CONNEXION_ECHECS") || "null");
    const echecs = limite && limite.jusqua > maintenant ? limite.nombre : 0;

    if (echecs >= 5) {
      return { succes: false, erreur: "TROP_DE_TENTATIVES" };
    }
    if (typeof codeSaisi !== "string" || codeSaisi !== code) {
      props.setProperty("CONNEXION_ECHECS", JSON.stringify({
        nombre: echecs + 1,
        jusqua: maintenant + 15 * 60 * 1000
      }));
      return { succes: false, erreur: "CODE_INCORRECT" };
    }
    props.deleteProperty("CONNEXION_ECHECS");

    const marqueCode = signatureSession_("code:" + code, secret);
    for (const [cle, valeur] of Object.entries(props.getProperties())) {
      if (cle.startsWith(PREFIXE_SESSION)) {
        const session = JSON.parse(valeur);
        if (session.expireA <= maintenant || session.marqueCode !== marqueCode) {
          props.deleteProperty(cle);
        }
      }
    }

    // SESSION_SECRET est généré hors Apps Script avec un CSPRNG (32 octets).
    // HMAC produit un jeton imprévisible à partir d'un compteur jamais réutilisé.
    const compteur = Number(props.getProperty("SESSION_COMPTEUR") || 0) + 1;
    if (!Number.isSafeInteger(compteur) || compteur < 1) {
      throw new Error("Compteur de sessions invalide.");
    }
    props.setProperty("SESSION_COMPTEUR", String(compteur));
    const jeton = signatureSession_(
      "jeton:" + compteur + ":" + Utilities.getUuid(), secret
    );
    const cle = cleSession_(jeton);
    if (props.getProperty(cle)) {
      throw new Error("Collision de sessions.");
    }
    const expireA = maintenant + DUREE_SESSION_MS;
    props.setProperty(cle, JSON.stringify({ expireA, marqueCode }));
    return { succes: true, jeton, expireA };
  });
}

function sessionValide_(jeton) {
  const cle = cleSession_(jeton);
  if (!cle) return false;

  const props = PropertiesService.getScriptProperties();
  const valeur = props.getProperty(cle);
  if (!valeur) return false;

  const { secret, code } = configurationSessions_(props);
  const session = JSON.parse(valeur);
  return session.expireA > Date.now() &&
    session.marqueCode === signatureSession_("code:" + code, secret);
}

function revoquerSession_(jeton) {
  const cle = cleSession_(jeton);
  if (!cle) return;
  avecVerrouSessions_(props => props.deleteProperty(cle));
}

function effacerSessions_(props) {
  for (const cle of props.getKeys()) {
    if (cle.startsWith(PREFIXE_SESSION)) props.deleteProperty(cle);
  }
}

// À exécuter depuis l’éditeur Apps Script avec le compte qui administre le projet.
function revoquerToutesLesSessions_() {
  avecVerrouSessions_(effacerSessions_);
}

// Ajouter NOUVEAU_CODE_ACCES dans les propriétés avant d’exécuter cette fonction.
function changerCodeFamilial_() {
  avecVerrouSessions_(props => {
    const nouveauCode = props.getProperty("NOUVEAU_CODE_ACCES");
    if (!nouveauCode || !nouveauCode.trim() || nouveauCode === props.getProperty("CODE_ACCES")) {
      throw new Error("Nouveau code familial manquant ou identique.");
    }
    effacerSessions_(props);
    props.setProperty("CODE_ACCES", nouveauCode);
    props.deleteProperty("NOUVEAU_CODE_ACCES");
    props.deleteProperty("CONNEXION_ECHECS");
  });
}

// Interface publique du kit. Les actions Drive en écriture et Gemini sont exclues.
function appelerTest(action, parametres) {
  if (!["connexion", "deconnexion", "listerQuiz", "chargerQuiz"].includes(action)) {
    return { succes: false };
  }
  return JSON.parse(traiterPostTest_({
    postData: { contents: JSON.stringify({ ...parametres, action }) }
  }).getContent());
}

function installerTest() {
  // L'installation se fait depuis l'éditeur, dans un projet encore sans déploiement.
  if (ScriptApp.getService().getUrl()) {
    throw new Error("Installer dans un nouveau projet avant le déploiement.");
  }
  avecVerrouSessions_(props => {
    configurationSessions_(props);
    if (["DOSSIER_COURS", "DOSSIER_QUIZ", "DOSSIER_TRAITES", "GEMINI_API_KEY"]
      .some(cle => props.getProperty(cle))) {
      throw new Error("Ce projet contient déjà une configuration Drive ou Gemini.");
    }
    const dossier = DriveApp.createFolder("Révis’Facile — Test de connexion");
    const cours = dossier.createFolder("Photos");
    const quiz = dossier.createFolder("Questionnaires fictifs");
    const traites = dossier.createFolder("Archives");
    const exemples = [
      ["Fractions", "Quelle fraction est égale à un demi ?", ["1/2", "1/3", "2/3"], "Un demi s’écrit 1/2."],
      ["Géographie", "Sur quel continent se trouve la France métropolitaine ?", ["Europe", "Afrique", "Asie"], "La France métropolitaine se trouve en Europe."]
    ];
    for (const [titre, question, choix, explication] of exemples) {
      const id = Utilities.getUuid();
      const questionnaire = {
        id, titre,
        questions: [{ type: "qcm", question, choix, correctes: [0], explication }]
      };
      quiz.createFile("Quiz_" + id + ".json", JSON.stringify(questionnaire), "application/json");
    }
    props.setProperties({
      DOSSIER_COURS: cours.getId(),
      DOSSIER_QUIZ: quiz.getId(),
      DOSSIER_TRAITES: traites.getId()
    });
  });
}

function changerCodeTest() {
  // Seul le propriétaire authentifié peut lancer cette commande administrative.
  const compte = Session.getActiveUser().getEmail();
  if (!compte || compte !== Session.getEffectiveUser().getEmail()) {
    throw new Error("Commande réservée au propriétaire du projet de test.");
  }
  changerCodeFamilial_();
}
