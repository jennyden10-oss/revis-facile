const MODELE = "gemini-3.5-flash-lite";

function genererQuestionnaire_(photos) {
  const cle = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!cle) throw erreurLot_("GEMINI_NON_CONFIGURE");

  const partiesImages = photos.map(photo => {
    const blob = photo.getBlob();
    return {
      inline_data: {
        mime_type: blob.getContentType(),
        data: Utilities.base64Encode(blob.getBytes())
      }
    };
  });

  const consigne = `
Tu es un professeur de collège français.

Lis attentivement toutes les photos, dans l’ordre transmis.
Elles appartiennent au même cours. Utilise le contenu de l’ensemble des pages.

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

  return quiz;
}

function verifierQuiz_(quiz) {
  if (!quiz || typeof quiz.titre !== "string" || !quiz.titre.trim() ||
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
  const props = PropertiesService.getScriptProperties();
  const dossier = dossierLotConfigure_(props, "DOSSIER_QUIZ");
  const resultat = trouverQuiz_(dossier, id);
  if (!resultat) throw erreurLot_("QUESTIONNAIRE_INTROUVABLE");
  return resultat.quiz;
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Révis’Facile — Test multiphoto")
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
      "chargerQuiz", "verifierReponse", "listerQuiz", "preparerLot", "genererQuiz", "ajouterPhoto", "validerTitre", "renommerQuiz", "supprimerQuiz"
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
    if (donnees.action === "preparerLot") {
      return reponseJson_({ succes: true, ...preparerLot_(donnees) });
    }
    if (donnees.action === "ajouterPhoto") {
      enregistrerPhoto_(donnees);
      return reponseJson_({ succes: true });
    }
    if (donnees.action === "genererQuiz") {
      return reponseJson_({ succes: true, quiz: genererLot_(donnees) });
    }
    if (donnees.action === "validerTitre" || donnees.action === "renommerQuiz") {
      const quiz = donnees.action === "validerTitre"
        ? validerTitreLot_(donnees) : renommerQuiz_(donnees);
      return reponseJson_({ succes: true, quiz });
    }
    if (donnees.action === "supprimerQuiz") {
      return reponseJson_({ succes: true, ...supprimerQuiz_(donnees) });
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
    if (erreur.codeLot) return reponseJson_({ succes: false, erreur: erreur.codeLot });
    console.error(erreur);
    reponse.message = "Demande refusée.";
  }

  return reponseJson_(reponse);
}

function reponseJson_(donnees) {
  return ContentService.createTextOutput(JSON.stringify(donnees))
    .setMimeType(ContentService.MimeType.JSON);
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

    if (fichier.isTrashed() || !fichier.getName().toLowerCase().endsWith(".json")) {
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

const MAX_PHOTOS_LOT = 8;
const MAX_OCTETS_PHOTO = 1536 * 1024;
const DUREE_VERROU_LOT_MS = 10 * 60 * 1000;

function erreurLot_(code) {
  return Object.assign(new Error(code), { codeLot: code });
}

function cleLot_(id) {
  if (typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) {
    throw erreurLot_("LOT_INVALIDE");
  }
  return "LOT_" + id;
}

function lireLot_(props, donnees) {
  const cle = cleLot_(donnees.lotId);
  const lot = JSON.parse(props.getProperty(cle) || "null");
  const proprietaire = cleSession_(donnees.jeton);
  if (lot && lot.proprietaire !== proprietaire) throw erreurLot_("LOT_INVALIDE");
  return { cle, lot, proprietaire };
}

function dossierLotConfigure_(props, cle) {
  const id = props.getProperty(cle);
  if (!id) throw erreurLot_("DRIVE_NON_CONFIGURE");
  return DriveApp.getFolderById(id);
}

function photoLot_(dossier, index) {
  return fichierActif_(dossier, "Photo_" + (index + 1) + ".jpg");
}

function fichierActif_(dossier, nom) {
  const fichiers = dossier.getFilesByName(nom);
  while (fichiers.hasNext()) {
    const fichier = fichiers.next();
    if (!fichier.isTrashed()) return fichier;
  }
  return null;
}

function preparerLot_(donnees) {
  if (!Number.isInteger(donnees.nombre) || donnees.nombre < 1 || donnees.nombre > MAX_PHOTOS_LOT) {
    throw erreurLot_("NOMBRE_PHOTOS");
  }
  return avecVerrouSessions_(props => {
    const { cle, lot, proprietaire } = lireLot_(props, donnees);
    if (lot && lot.nombre !== donnees.nombre) throw erreurLot_("LOT_INVALIDE");
    const entree = dossierLotConfigure_(props, "DOSSIER_COURS");
    let dossier;
    if (lot) {
      dossier = DriveApp.getFolderById(lot.dossierId);
    } else {
      const nom = "Lot_" + donnees.lotId;
      const dossiers = entree.getFoldersByName(nom);
      dossier = dossiers.hasNext() ? dossiers.next() : entree.createFolder(nom);
      props.setProperty(cle, JSON.stringify({
        proprietaire, dossierId: dossier.getId(), nombre: donnees.nombre
      }));
    }
    const recues = [];
    for (let index = 0; index < donnees.nombre; index++) {
      if (photoLot_(dossier, index)) recues.push(index);
    }
    return { recues };
  });
}

function enregistrerPhoto_(donnees) {
  const contenu = donnees.contenuBase64;
  if (typeof contenu !== "string" || !contenu || contenu.length > 4 * Math.ceil(MAX_OCTETS_PHOTO / 3)) {
    throw erreurLot_("PHOTO_TROP_GRANDE");
  }
  let octets;
  try {
    octets = Utilities.base64Decode(contenu);
  } catch {
    throw erreurLot_("PHOTO_INVALIDE");
  }
  if (octets.length > MAX_OCTETS_PHOTO) throw erreurLot_("PHOTO_TROP_GRANDE");
  if (octets.length < 4 || (octets[0] & 255) !== 255 ||
      (octets[1] & 255) !== 216 || (octets[2] & 255) !== 255) {
    throw erreurLot_("PHOTO_INVALIDE");
  }
  avecVerrouSessions_(props => {
    const { lot } = lireLot_(props, donnees);
    const index = donnees.indexPhoto;
    if (!lot || !Number.isInteger(index) || index < 0 || index >= lot.nombre) {
      throw erreurLot_("LOT_INVALIDE");
    }
    const dossier = DriveApp.getFolderById(lot.dossierId);
    const existante = photoLot_(dossier, index);
    if (existante) {
      const empreinte = octetsPhoto => Utilities.base64Encode(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, octetsPhoto)
      );
      if (empreinte(existante.getBlob().getBytes()) !== empreinte(octets)) {
        throw erreurLot_("PHOTOS_DIFFERENTES");
      }
      return;
    }
    if (lot.enCoursJusqua || lot.termine) throw erreurLot_("LOT_INVALIDE");
    const nom = "Photo_" + (index + 1) + ".jpg";
    dossier.createFile(Utilities.newBlob(octets, "image/jpeg", nom));
  });
}

function genererLot_(donnees) {
  const props = PropertiesService.getScriptProperties();
  const dossierQuiz = dossierLotConfigure_(props, "DOSSIER_QUIZ");
  const nomFinal = "Quiz_" + donnees.lotId + ".json";
  const nomTemporaire = "Quiz_" + donnees.lotId + ".en-cours";

  const travail = avecVerrouSessions_(() => {
    const { cle, lot } = lireLot_(props, donnees);
    if (!lot) throw erreurLot_("LOT_INVALIDE");
    const termine = fichierActif_(dossierQuiz, nomFinal);
    if (termine) {
      return { resultat: resumeTitre_(lireQuizFichier_(termine)) };
    }
    if (lot.termine) throw erreurLot_("QUESTIONNAIRE_INTROUVABLE");
    const brouillon = fichierActif_(dossierQuiz, nomTemporaire);
    if (brouillon) return { resultat: resumeTitre_(lireQuizFichier_(brouillon), true) };
    if (lot.enCoursJusqua > Date.now()) throw erreurLot_("GENERATION_EN_COURS");
    const dossier = DriveApp.getFolderById(lot.dossierId);
    const photos = Array.from({ length: lot.nombre }, (_, index) => photoLot_(dossier, index));
    if (photos.some(photo => !photo)) throw erreurLot_("LOT_INCOMPLET");
    lot.enCoursJusqua = Date.now() + DUREE_VERROU_LOT_MS;
    props.setProperty(cle, JSON.stringify(lot));
    return { cle, lot, photos };
  });

  if (travail.resultat) return travail.resultat;

  try {
    let quiz;
    try {
      quiz = genererQuestionnaire_(travail.photos);
    } catch (erreur) {
      if (erreur.codeLot) throw erreur;
      console.error(erreur);
      throw erreurLot_("GEMINI_INDISPONIBLE");
    }
    quiz.id = donnees.lotId;
    quiz.titre = quiz.titre.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80).trim();
    if (!quiz.titre) throw erreurLot_("GEMINI_INDISPONIBLE");
    dossierQuiz.createFile(nomTemporaire, JSON.stringify(quiz), "application/json");
    return resumeTitre_(quiz, true);
  } finally {
    avecVerrouSessions_(() => {
      const lot = JSON.parse(props.getProperty(travail.cle));
      delete lot.enCoursJusqua;
      props.setProperty(travail.cle, JSON.stringify(lot));
    });
  }
}

function lireQuizFichier_(fichier) {
  return JSON.parse(fichier.getBlob().getDataAsString("UTF-8"));
}

function resumeTitre_(quiz, aValider = false) {
  return { id: quiz.id, titre: quiz.titre, aValider };
}

function titreQuizValide_(valeur) {
  const titre = typeof valeur === "string" ? valeur.trim() : "";
  if (!titre || titre.length > 80 || /[\u0000-\u001f\u007f]/.test(titre)) {
    throw erreurLot_("TITRE_INVALIDE");
  }
  return titre;
}

function nomArchiveQuiz_(titre) {
  return titre.replace(/[\\/:*?"<>|]/g, "-");
}

function validerTitreLot_(donnees) {
  const titre = titreQuizValide_(donnees.titre);
  return avecVerrouSessions_(props => {
    const { cle, lot } = lireLot_(props, donnees);
    if (!lot) throw erreurLot_("LOT_INVALIDE");

    const dossierQuiz = dossierLotConfigure_(props, "DOSSIER_QUIZ");
    const nom = "Quiz_" + donnees.lotId;
    const final = fichierActif_(dossierQuiz, nom + ".json");
    if (final) return resumeTitre_(lireQuizFichier_(final));
    const brouillon = fichierActif_(dossierQuiz, nom + ".en-cours");
    if (!brouillon) throw erreurLot_("BROUILLON_INTROUVABLE");

    const quiz = lireQuizFichier_(brouillon);
    const dossier = DriveApp.getFolderById(lot.dossierId);
    const archives = dossierLotConfigure_(props, "DOSSIER_TRAITES");
    quiz.titre = titre;
    quiz.dossierArchiveId = lot.dossierId;
    try {
      brouillon.setContent(JSON.stringify(quiz));
      dossier.setName(nomArchiveQuiz_(titre));
      const parents = dossier.getParents();
      if (!parents.hasNext() || parents.next().getId() !== archives.getId()) {
        dossier.moveTo(archives);
      }
      brouillon.setName(nom + ".json");
    } catch (erreur) {
      console.error(erreur);
      throw erreurLot_("ARCHIVAGE_INTERROMPU");
    }
    lot.termine = true;
    props.setProperty(cle, JSON.stringify(lot));
    return resumeTitre_(quiz);
  });
}

function renommerQuiz_(donnees) {
  const titre = titreQuizValide_(donnees.titre);
  return avecVerrouSessions_(props => {
    const dossierQuiz = dossierLotConfigure_(props, "DOSSIER_QUIZ");
    const resultat = trouverQuiz_(dossierQuiz, donnees.id);
    if (!resultat) throw erreurLot_("QUESTIONNAIRE_INTROUVABLE");
    const { fichier, quiz } = resultat;
    if (quiz.titre !== donnees.titreActuel && quiz.titre !== titre) {
      throw erreurLot_("TITRE_MODIFIE");
    }

    if (props.getProperty("SUPPRESSION_" + donnees.id)) {
      throw erreurLot_("SUPPRESSION_A_REPRENDRE");
    }
    const archive = archiveLieeQuiz_(props, quiz);
    const archiveId = archive?.getId();

    const ancienTitre = quiz.titre;
    try {
      if (archive) archive.setName(nomArchiveQuiz_(titre));
      if (titre !== ancienTitre || (archive && !quiz.dossierArchiveId)) {
        quiz.titre = titre;
        if (archive) quiz.dossierArchiveId = archiveId;
        fichier.setContent(JSON.stringify(quiz));
      }
    } catch (erreur) {
      // En cas d'échec ambigu de setContent, se recaler sur le titre réellement écrit.
      if (archive) {
        try {
          archive.setName(nomArchiveQuiz_(lireQuizFichier_(fichier).titre));
        } catch (erreurReprise) {
          console.error(erreurReprise);
        }
      }
      console.error(erreur);
      throw erreurLot_("RENOMMAGE_INTERROMPU");
    }
    return { ...resumeTitre_(quiz), archiveRenommee: Boolean(archive) };
  });
}

// Interface publique du kit isolé, avec la même authentification que le serveur.
function appelerTest(action, parametres) {
  if (!["connexion", "deconnexion", "listerQuiz", "chargerQuiz",
        "preparerLot", "ajouterPhoto", "genererQuiz", "verifierReponse", "validerTitre", "renommerQuiz", "supprimerQuiz"].includes(action)) {
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
    if (["DOSSIER_COURS", "DOSSIER_QUIZ", "DOSSIER_TRAITES"]
      .some(cle => props.getProperty(cle))) {
      throw new Error("Ce projet contient déjà une configuration Drive.");
    }
    const dossier = DriveApp.createFolder("Révis’Facile — Test multiphoto");
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

function archiveLieeQuiz_(props, quiz) {
  // Les questionnaires de l'étape 3 peuvent encore référencer leur dossier via le lot.
  const lot = JSON.parse(props.getProperty("LOT_" + quiz.id) || "null");
  const archiveId = quiz.dossierArchiveId || lot?.dossierId;
  if (!archiveId) return null;

  try {
    const archive = DriveApp.getFolderById(archiveId);
    const racine = dossierLotConfigure_(props, "DOSSIER_TRAITES");
    const parents = archive.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === racine.getId()) return archive;
    }
  } catch (erreur) {
    console.error(erreur);
  }
  throw erreurLot_("ARCHIVE_INTROUVABLE");
}

function supprimerQuiz_(donnees) {
  const id = donnees.id;
  if (typeof id !== "string" || !id) {
    throw erreurLot_("QUESTIONNAIRE_INTROUVABLE");
  }
  return avecVerrouSessions_(props => {
    const cle = "SUPPRESSION_" + id;
    let operation = JSON.parse(props.getProperty(cle) || "null");
    let fichier, archive;

    if (operation) {
      fichier = DriveApp.getFileById(operation.fichierId);
      archive = operation.archiveId ? DriveApp.getFolderById(operation.archiveId) : null;
    } else {
      const dossierQuiz = dossierLotConfigure_(props, "DOSSIER_QUIZ");
      const resultat = trouverQuiz_(dossierQuiz, id);
      // Une réponse réseau perdue peut conduire à rejouer une suppression déjà terminée.
      if (!resultat) return { dejaSupprime: true };
      fichier = resultat.fichier;
      const quiz = resultat.quiz;
      if (quiz.titre !== donnees.titre) throw erreurLot_("TITRE_MODIFIE");
      archive = archiveLieeQuiz_(props, quiz);
      operation = {
        fichierId: fichier.getId(),
        archiveId: archive?.getId(),
        archiveDejaEnCorbeille: archive?.isTrashed() || false
      };
      props.setProperty(cle, JSON.stringify(operation));
    }

    try {
      // Le questionnaire reste visible tant que son dossier n'est pas en corbeille.
      if (archive && !archive.isTrashed()) archive.setTrashed(true);
      if (!fichier.isTrashed()) fichier.setTrashed(true);
    } catch (erreur) {
      console.error(erreur);
      try {
        // Drive peut avoir exécuté l'écriture avant de signaler une erreur.
        if (fichier.isTrashed() && (!archive || archive.isTrashed())) {
          props.deleteProperty(cle);
          return { archiveSupprimee: Boolean(archive) };
        }
        if (fichier.isTrashed()) fichier.setTrashed(false);
        if (archive && !operation.archiveDejaEnCorbeille && archive.isTrashed()) {
          archive.setTrashed(false);
        }
        props.deleteProperty(cle);
      } catch (erreurRestauration) {
        // Conserver les identifiants pour reprendre la même opération.
        console.error(erreurRestauration);
        throw erreurLot_("SUPPRESSION_A_REPRENDRE");
      }
      throw erreurLot_("SUPPRESSION_INTERROMPUE");
    }
    props.deleteProperty(cle);
    return { archiveSupprimee: Boolean(archive) };
  });
}

function trouverQuiz_(dossier, id) {
  if (typeof id !== "string" || !id) return null;

  const canonique = fichierActif_(dossier, "Quiz_" + id + ".json");
  if (canonique) {
    const quiz = lireQuizCorrespondant_(canonique, id);
    if (quiz) return { fichier: canonique, quiz };
  }

  // Un export historique peut avoir un autre nom. Son identifiant reste dans le JSON.
  let resultat = null;
  const fichiers = dossier.getFiles();
  while (fichiers.hasNext()) {
    const fichier = fichiers.next();
    if (fichier.isTrashed() || !fichier.getName().toLowerCase().endsWith(".json")) continue;
    const quiz = lireQuizCorrespondant_(fichier, id);
    if (!quiz) continue;
    if (resultat) throw erreurLot_("QUESTIONNAIRE_AMBIGU");
    resultat = { fichier, quiz };
  }
  return resultat;
}

function lireQuizCorrespondant_(fichier, id) {
  let quiz;
  try {
    quiz = lireQuizFichier_(fichier);
  } catch (erreur) {
    if (erreur instanceof SyntaxError) return null;
    throw erreur;
  }
  return quiz?.id === id && typeof quiz.titre === "string" && Array.isArray(quiz.questions)
    ? quiz : null;
}
