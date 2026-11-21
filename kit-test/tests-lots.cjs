const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dossierProjet = path.resolve(__dirname, "..");
const iterateur = objets => {
  let index = 0;
  return { hasNext: () => index < objets.length, next: () => objets[index++] };
};

function environnement() {
  const dossiers = new Map();
  const fichiersDrive = new Map();
  const props = new Map([
    ["DOSSIER_COURS", "entree"],
    ["DOSSIER_QUIZ", "quiz"],
    ["DOSSIER_TRAITES", "archives"],
    ["CODE_ACCES", "code fictif"],
    ["SESSION_SECRET", crypto.randomBytes(32).toString("hex")],
    ["GEMINI_API_KEY", "clé simulée"]
  ]);
  const pannes = { gemini: false, deplacement: false, publication: false, contenu: false, apresCreationPhoto: false };
  Object.assign(pannes, { archiveCorbeille: false, fichierCorbeille: false, apresFichierCorbeille: false, restaurerArchive: false });
  function dossier(id, nom = id, parent = null) {
    let enCorbeille = false;
    const contenu = {
      id, nom, parent, fichiers: [],
      getId: () => id,
      isTrashed: () => enCorbeille,
      setTrashed: valeur => {
        if (valeur ? pannes.archiveCorbeille : pannes.restaurerArchive) throw new Error("Corbeille archives indisponible");
        enCorbeille = valeur;
      },
      getParents: () => iterateur(contenu.parent ? [contenu.parent] : []),
      getFiles: () => iterateur(contenu.fichiers),
      getFilesByName: nomFichier => iterateur(contenu.fichiers.filter(f => f.getName() === nomFichier)),
      getFoldersByName: nomDossier => iterateur([...dossiers.values()].filter(
        d => d.nom === nomDossier && d.parent === contenu
      )),
      createFolder: nomDossier => dossier(crypto.randomUUID(), nomDossier, contenu),
      setName: nomDossier => { contenu.nom = nomDossier; },
      moveTo: destination => {
        if (pannes.deplacement) throw new Error("Drive indisponible");
        contenu.parent = destination;
      },
      createFile: (source, texte, mime) => {
        let blob = typeof source === "string" ? creerBlob(Buffer.from(texte), mime, source) : source;
        let nomFichier = typeof source === "string" ? source : source.nom;
        const fichierId = crypto.randomUUID();
        let fichierEnCorbeille = false;
        const fichier = {
          getId: () => fichierId,
          getName: () => nomFichier,
          getBlob: () => blob,
          isTrashed: () => fichierEnCorbeille,
          setTrashed: valeur => {
            if (valeur && pannes.fichierCorbeille) throw new Error("Corbeille questionnaires indisponible");
            fichierEnCorbeille = valeur;
            if (valeur && pannes.apresFichierCorbeille) throw new Error("Réponse Drive perdue");
          },
          setContent: texte => {
            if (pannes.contenu) throw new Error("Écriture interrompue");
            blob = creerBlob(Buffer.from(texte), mime, nomFichier);
          },
          setName: nouveau => {
            if (pannes.publication) throw new Error("Publication interrompue");
            nomFichier = nouveau;
          }
        };
        fichiersDrive.set(fichierId, fichier);
        contenu.fichiers.push(fichier);
        if (pannes.apresCreationPhoto && mime === undefined) throw new Error("Réponse Drive interrompue");
        return fichier;
      }
    };
    dossiers.set(id, contenu);
    return contenu;
  }
  function creerBlob(octets, mime, nom) {
    return {
      nom,
      getBytes: () => octets,
      getContentType: () => mime,
      getDataAsString: () => Buffer.from(octets).toString("utf8")
    };
  }
  const entree = dossier("entree");
  const quiz = dossier("quiz");
  const archives = dossier("archives");
  let verrouille = false;
  const requetes = [];
  const quizGemini = {
    titre: "Fractions",
    questions: [{
      type: "qcm", question: "Quelle fraction est équivalente à 6/8 ?",
      choix: ["3/4", "1/2"], correctes: [0], explication: "On divise par 2."
    }]
  };
  let pendantGemini = () => {};
  const contexte = vm.createContext({
    console: { error() {}, warn() {} },
    Logger: { log() {} },
    DriveApp: { getFolderById: id => dossiers.get(id), getFileById: id => fichiersDrive.get(id) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: cle => props.get(cle) ?? null,
      setProperty: (cle, valeur) => props.set(cle, valeur),
      deleteProperty: cle => props.delete(cle),
      getProperties: () => Object.fromEntries(props),
      getKeys: () => [...props.keys()]
    }) },
    LockService: { getScriptLock: () => ({
      waitLock() { assert(!verrouille, "Le verrou global doit être libre"); verrouille = true; },
      releaseLock() { assert(verrouille); verrouille = false; }
    }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      computeHmacSha256Signature: (texte, secret) => crypto.createHmac("sha256", secret).update(texte).digest(),
      computeDigest: (_, octets) => crypto.createHash("sha256").update(octets).digest(),
      base64EncodeWebSafe: octets => Buffer.from(octets).toString("base64url"),
      base64Encode: octets => Buffer.from(octets).toString("base64"),
      base64Decode: texte => Buffer.from(texte, "base64"),
      getUuid: () => crypto.randomUUID(),
      newBlob: creerBlob,
      sleep() {}
    },
    ContentService: {
      createTextOutput: contenu => ({ setMimeType() { return this; }, getContent: () => contenu }),
      MimeType: { JSON: "json" }
    },
    UrlFetchApp: {
      fetch: (_url, options) => {
        assert(!verrouille, "Les autres sessions restent utilisables pendant Gemini");
        requetes.push(JSON.parse(options.payload));
        pendantGemini();
        if (pannes.gemini) throw new Error("Gemini indisponible");
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(quizGemini) }] } }]
          })
        };
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(dossierProjet, "Code.gs"), "utf8"), contexte);
  const appeler = (action, donnees = {}) => JSON.parse(contexte.doPost({
    postData: { contents: JSON.stringify({ ...donnees, action }) }
  }).getContent());
  return {
    appeler, dossiers, entree, quiz, archives, pannes, requetes, props,
    simulerPendantGemini: callback => { pendantGemini = callback; }
  };
}

const { appeler, dossiers, entree, quiz, archives, pannes, requetes, props, simulerPendantGemini } = environnement();
const connexion = () => appeler("connexion", { codeAcces: "code fictif" }).jeton;
const jeton = connexion();
const autreJeton = connexion();
const lotId = crypto.randomUUID();
const autreLot = crypto.randomUUID();
const photo = nom => fs.readFileSync(path.join(__dirname, "photos-fictives", nom + ".jpg")).toString("base64");
const premierCours = [photo("fractions-1"), photo("fractions-2")];
const autreCours = photo("volcans-1");
const chargerPhoto = (id, indexPhoto, contenuBase64, session = jeton) => appeler("ajouterPhoto", {
  jeton: session, lotId: id, indexPhoto, contenuBase64
});
const generer = (id = lotId, session = jeton) => appeler("genererQuiz", { jeton: session, lotId: id });
const preparer = (id = lotId, nombre = 2, session = jeton) => appeler("preparerLot", { jeton: session, lotId: id, nombre });
const valider = (titre, id = lotId, session = jeton) => appeler("validerTitre", {
  jeton: session, lotId: id, titre
});
const renommer = (id, titreActuel, titre) => appeler("renommerQuiz", { jeton, id, titreActuel, titre });
const lister = () => appeler("listerQuiz", { jeton }).questionnaires;
const ancienId = crypto.randomUUID();
quiz.createFile("Quiz_" + ancienId + ".json", JSON.stringify({
  id: ancienId, titre: "Ancien questionnaire", questions: [{}]
}), "application/json");

for (const action of ["preparerLot", "ajouterPhoto", "genererQuiz", "validerTitre", "renommerQuiz", "supprimerQuiz"]) {
  assert.equal(appeler(action, { lotId }).erreur, "SESSION_INVALIDE");
}
assert.equal(preparer(lotId, 9).erreur, "NOMBRE_PHOTOS");
assert.deepEqual(preparer().recues, []);
assert(preparer(autreLot, 1, autreJeton).succes);
assert.equal(preparer(lotId, 2, autreJeton).erreur, "LOT_INVALIDE");
assert.equal(chargerPhoto(lotId, 0, premierCours[0], autreJeton).erreur, "LOT_INVALIDE");
assert.equal(generer(lotId, autreJeton).erreur, "LOT_INVALIDE");
assert.equal(chargerPhoto(lotId, 0, Buffer.alloc(1536 * 1024 + 1).toString("base64")).erreur, "PHOTO_TROP_GRANDE");
assert.equal(chargerPhoto(lotId, 0, "dGV4dGU=").erreur, "PHOTO_INVALIDE");
assert.equal(generer().erreur, "LOT_INCOMPLET");
pannes.apresCreationPhoto = true;
assert.equal(chargerPhoto(lotId, 0, premierCours[0]).succes, false);
pannes.apresCreationPhoto = false;
assert.deepEqual(preparer().recues, [0]);
assert(chargerPhoto(lotId, 0, premierCours[0]).succes, "La photo déjà écrite reste idempotente");
assert.equal(chargerPhoto(lotId, 0, autreCours).erreur, "PHOTOS_DIFFERENTES");
assert(chargerPhoto(autreLot, 0, autreCours, autreJeton).succes);
assert(chargerPhoto(lotId, 1, premierCours[1]).succes);
assert.deepEqual(preparer().recues, [0, 1]);
pannes.gemini = true;
assert.equal(generer().erreur, "GEMINI_INDISPONIBLE");
pannes.gemini = false;
assert.equal(lister().length, 1);
simulerPendantGemini(() => {
  assert.equal(generer().erreur, "GENERATION_EN_COURS");
  assert.equal(lister().length, 1);
});
const proposition = generer();
assert.deepEqual(proposition.quiz, { id: lotId, titre: "Fractions", aValider: true });
assert.deepEqual(generer().quiz, proposition.quiz);
assert.equal(lister().length, 1, "Un brouillon n’apparaît pas dans la liste");
assert.equal(appeler("chargerQuiz", { jeton, id: lotId }).succes, false);
assert.deepEqual(requetes.at(-1).contents[0].parts.slice(1).map(part => part.inline_data.data), premierCours);
assert.equal(valider("Autre cours", lotId, autreJeton).erreur, "LOT_INVALIDE");
assert.equal(valider("  ").erreur, "TITRE_INVALIDE");
pannes.deplacement = true;
assert.equal(valider("Fractions — révision").erreur, "ARCHIVAGE_INTERROMPU");
pannes.deplacement = false;
pannes.publication = true;
assert.equal(valider("Fractions — révision").erreur, "ARCHIVAGE_INTERROMPU");
assert.equal(lister().length, 1);
pannes.publication = false;
const resultat = valider("Fractions — révision");
assert.deepEqual(resultat.quiz, { id: lotId, titre: "Fractions — révision", aValider: false });
assert.deepEqual(valider("Autre titre lors d’un retour perdu").quiz, resultat.quiz);
assert.deepEqual(generer().quiz, resultat.quiz);
assert.equal(requetes.length, 2, "Les reprises d’archivage ne rappellent pas Gemini");
const fichier = quiz.fichiers.find(f => f.getName() === "Quiz_" + lotId + ".json");
assert.equal(quiz.fichiers.length, 2);
const dossiersArchives = [...dossiers.values()].filter(d => d.parent === archives);
assert.equal(dossiersArchives.length, 1);
const [archive] = dossiersArchives;
assert.equal(archive.nom, "Fractions — révision");
assert.equal(archive.fichiers.length, 2);
assert.equal([...dossiers.values()].filter(d => d.parent === entree).length, 1);
assert.equal(lister().length, 2);
const original = appeler("chargerQuiz", { jeton, id: lotId }).quiz;
pannes.contenu = true;
assert.equal(renommer(lotId, original.titre, "Fractions faciles").erreur, "RENOMMAGE_INTERROMPU");
assert.equal(archive.nom, original.titre);
pannes.contenu = false;
assert(renommer(lotId, original.titre, "Fractions faciles").quiz.archiveRenommee);
assert(renommer(lotId, original.titre, "Fractions faciles").succes, "Une réponse perdue est rejouable");
assert.equal(renommer(lotId, original.titre, "Titre périmé").erreur, "TITRE_MODIFIE");
assert.equal(archive.nom, "Fractions faciles");
assert.equal(quiz.fichiers.find(f => f.getName() === "Quiz_" + lotId + ".json"), fichier);
assert.deepEqual(appeler("chargerQuiz", { jeton, id: lotId }).quiz, { ...original, titre: "Fractions faciles" });
assert.equal(renommer(ancienId, "Ancien questionnaire", "Ancien — nouveau titre").quiz.archiveRenommee, false);

const cleAutre = "LOT_" + autreLot;
const lotInterrompu = JSON.parse(props.get(cleAutre));
props.set(cleAutre, JSON.stringify({ ...lotInterrompu, enCoursJusqua: Date.now() + 10000 }));
assert.equal(generer(autreLot, autreJeton).erreur, "GENERATION_EN_COURS");
props.set(cleAutre, JSON.stringify({ ...lotInterrompu, enCoursJusqua: Date.now() - 1 }));
simulerPendantGemini(() => {});
assert(generer(autreLot, autreJeton).succes);
assert(valider("Fractions", autreLot, autreJeton).succes);
const archiveAncienne = dossiers.get(lotInterrompu.dossierId);
const fichierAncien = quiz.fichiers.find(f => f.getName() === "Quiz_" + autreLot + ".json");
const ancienFormat = JSON.parse(fichierAncien.getBlob().getDataAsString());
delete ancienFormat.dossierArchiveId;
fichierAncien.setContent(JSON.stringify(ancienFormat));
assert(renommer(autreLot, "Fractions", "Autre cours archivé").quiz.archiveRenommee);
assert.equal(archiveAncienne.nom, "Autre cours archivé");
assert.equal(archive.nom, "Fractions faciles");
assert.deepEqual(requetes.at(-1).contents[0].parts.slice(1).map(part => part.inline_data.data), [autreCours]);
const supprimer = (id, titre) => appeler("supprimerQuiz", { jeton, id, titre });
const titreFinal = "Fractions faciles";
assert.equal(supprimer(lotId, "Ancien titre").erreur, "TITRE_MODIFIE");
pannes.archiveCorbeille = true;
assert.equal(supprimer(lotId, titreFinal).erreur, "SUPPRESSION_INTERROMPUE");
pannes.archiveCorbeille = false;
assert(!fichier.isTrashed() && !archive.isTrashed());
pannes.fichierCorbeille = true;
assert.equal(supprimer(lotId, titreFinal).erreur, "SUPPRESSION_INTERROMPUE");
assert(!fichier.isTrashed() && !archive.isTrashed(), "L’archive est restaurée si le JSON n’a pas été déplacé");
pannes.restaurerArchive = true;
assert.equal(supprimer(lotId, titreFinal).erreur, "SUPPRESSION_A_REPRENDRE");
assert(props.has("SUPPRESSION_" + lotId) && archive.isTrashed() && !fichier.isTrashed());
assert.equal(renommer(lotId, titreFinal, "Autre").erreur, "SUPPRESSION_A_REPRENDRE");
pannes.fichierCorbeille = pannes.restaurerArchive = false;
pannes.apresFichierCorbeille = true;
assert.equal(supprimer(lotId, titreFinal).archiveSupprimee, true);
pannes.apresFichierCorbeille = false;
assert(!props.has("SUPPRESSION_" + lotId));
assert(fichier.isTrashed() && archive.isTrashed() && archive.fichiers.length === 2);
assert(!lister().some(quiz => quiz.id === lotId));
assert.equal(appeler("chargerQuiz", { jeton, id: lotId }).succes, false);
assert(supprimer(lotId, titreFinal).dejaSupprime);
fichier.setTrashed(false);
archive.setTrashed(false);
assert.equal(appeler("chargerQuiz", { jeton, id: lotId }).quiz.questions[0].correctes[0], 0);
assert.equal(archive.fichiers.length, 2);

assert.equal(supprimer(ancienId, "Ancien — nouveau titre").archiveSupprimee, false);
assert(!archiveAncienne.isTrashed(), "Aucune archive n’est recherchée par titre");
const idAncienNom = crypto.randomUUID();
const fichierAncienNom = quiz.createFile("Ancien-export.json", JSON.stringify({
  id: idAncienNom, titre: "Export historique", questions: [{}]
}), "application/json");
assert(supprimer(idAncienNom, "Export historique").succes && fichierAncienNom.isTrashed());
const idArchiveExterne = crypto.randomUUID();
const fichierArchiveExterne = quiz.createFile("Quiz_" + idArchiveExterne + ".json", JSON.stringify({
  id: idArchiveExterne, titre: "Lien déplacé", questions: [{}], dossierArchiveId: entree.id
}), "application/json");
assert.equal(supprimer(idArchiveExterne, "Lien déplacé").erreur, "ARCHIVE_INTROUVABLE");
assert(!fichierArchiveExterne.isTrashed() && !entree.isTrashed());
console.log("OK — mise en corbeille, retour arrière, reprise et restauration");

console.log("OK — sessions, limites, isolation, reprises, archivage et anciens questionnaires");

async function testerInterface(kit = false) {
  const html = fs.readFileSync(path.join(dossierProjet, kit ? "kit-test/Index.html" : "index.html"), "utf8");
  const stockage = new Map();
  const fichiers = ["fractions-1", "fractions-2"].map(nom => new File(
    [Buffer.from(photo(nom), "base64")], nom + ".jpg", { type: "image/jpeg" }
  ));
  let coupeEnvoi = true;
  let coupeGeneration = true;
  let coupeValidation = true;
  let coupeSuppression = true;
  let dernierLot;
  let appelSuspendu;
  const envoyees = [];
  const historiques = [];
  const adresse = "https://script.google.com/macros/s/TEST/exec";

  function navigateur() {
    const elements = new Map();
    class Element {
      children = [];
      dataset = {};
      files = [];
      h = "";
      hidden = false;
      disabled = false;
      style = {};
      listeners = {};
      v = "";
      set value(value) { this.v = value; if (!value) this.files = []; }
      get value() { return this.v; }
      setAttribute() {}
      focus() {}
      set textContent(texte) { this.h = texte; this.children = []; }
      get textContent() { return this.h; }
      appendChild(element) { element.parent = this; this.children.push(element); }
      remove() { this.parent.children = this.parent.children.filter(element => element !== this); }
      replaceChildren() { this.children = []; }
      addEventListener(evenement, fonction) { this.listeners[evenement] = fonction; }
    }
    for (const [, id] of html.replace(/<script>[\s\S]*?<\/script>/g, "").matchAll(/\bid="([^"]+)"/g)) {
      assert(!elements.has(id));
      elements.set(id, new Element());
    }
    const lire = id => elements.get(id);
    const evenements = new EventTarget();
    const timers = new Map();
    const navigator = { onLine: true };
    const traiterRequete = async (data, signal) => {
      dernierLot = data.lotId || dernierLot;
      historiques.push(data);
      if (data.action === "ajouterPhoto") envoyees.push(data.indexPhoto);
      const resultat = appeler(data.action, data);
      if (data.action === "ajouterPhoto" && coupeEnvoi ||
          data.action === "genererQuiz" && coupeGeneration ||
          data.action === "validerTitre" && coupeValidation ||
          data.action === "supprimerQuiz" && coupeSuppression) {
        return new Promise(resolve => {
          appelSuspendu = { action: data.action, signal, terminer: () => resolve(resultat) };
        });
      }
      return resultat;
    };
    const contexte = vm.createContext({
      console, crypto, AbortController, navigator,
      location: { pathname: "/test" },
      addEventListener: evenements.addEventListener.bind(evenements),
      removeEventListener: evenements.removeEventListener.bind(evenements),
      setTimeout: (callback, delai) => {
        const id = Symbol();
        timers.set(id, { callback, delai });
        return id;
      },
      clearTimeout: id => timers.delete(id),
      document: {
        getElementById: lire,
        querySelector: () => ({ content: adresse }),
        createElement: () => new Element()
      },
      localStorage: {
        getItem: cle => stockage.get(cle) ?? null,
        setItem: (cle, valeur) => stockage.set(cle, valeur),
        removeItem: cle => stockage.delete(cle)
      },
      fetch: async (url, options) => {
        assert.equal(url, adresse);
        const resultat = await traiterRequete(JSON.parse(options.body), options.signal);
        return { ok: true, json: async () => resultat };
      },
      google: {
        script: {
          get run() {
            let succes, echec;
            return {
              withSuccessHandler(callback) { succes = callback; return this; },
              withFailureHandler(callback) { echec = callback; return this; },
              appelerTest(action, parametres) {
                traiterRequete({ ...parametres, action }).then(succes, echec);
              }
            };
          }
        }
      }
    });
    contexte.window = contexte;
    for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script, contexte);
    // Le redimensionnement Canvas est vérifié lors de l’essai navigateur du kit.
    vm.runInContext(`
      preparerImage = fichier => fichier;
      convertirPhotoBase64 = async fichier => convertirTest(await fichier.arrayBuffer());
    `, contexte);
    contexte.convertirTest = buffer => Buffer.from(buffer).toString("base64");
    return { lire, evenements, timers, navigator };
  }
  const sessionTest = appeler("connexion", { codeAcces: "code fictif" });
  stockage.set(kit ? "revisFacileTestConnexion:/test" : "revisFacileSession:" + adresse, JSON.stringify({
    jeton: sessionTest.jeton, expireA: sessionTest.expireA
  }));

  async function attendreAppel(action) {
    for (let tentative = 0; tentative < 100; tentative++) {
      if (appelSuspendu?.action === action) return appelSuspendu;
      await new Promise(setImmediate);
    }
    assert.fail("Appel jamais suspendu : " + action);
  }

  let page = navigateur();
  page.lire("photosCours").files = fichiers;
  page.lire("photosCours").listeners.change();
  assert.match(page.lire("nombrePhotos").textContent, /^2 photos/);
  const clicEnvoi = page.lire("genererQuestionnaire").listeners.click();
  const envoi = await attendreAppel("ajouterPhoto");
  assert(page.lire("genererQuestionnaire").disabled);
  const lotOriginal = dernierLot;

  page.navigator.onLine = false;
  page.evenements.dispatchEvent(new Event("offline"));
  await clicEnvoi;
  assert.match(page.lire("progressionLot").textContent, /Connexion Internet interrompue/);
  assert.deepEqual(page.lire("photosCours").files, fichiers);
  assert.equal(page.lire("genererQuestionnaire").textContent, "Réessayer");
  assert.equal(page.lire("genererQuestionnaire").disabled, false);
  if (!kit) assert(envoi.signal.aborted);

  const nombreAppelsHorsLigne = historiques.length;
  await page.lire("genererQuestionnaire").listeners.click();
  assert.equal(historiques.length, nombreAppelsHorsLigne);
  assert.deepEqual(envoyees, [0]);
  envoi.terminer();

  coupeEnvoi = false;
  page.navigator.onLine = true;
  const clicGeneration = page.lire("genererQuestionnaire").listeners.click();
  const attente = await attendreAppel("genererQuiz");
  assert.deepEqual(envoyees, [0, 1], "La photo déjà reçue est ignorée à la reprise.");
  const minuterie = [...page.timers.values()].find(timer => timer.delai === 120000);
  assert(minuterie);
  minuterie.callback();
  await clicGeneration;
  if (!kit) assert(attente.signal.aborted);
  assert.match(page.lire("progressionLot").textContent, /La réponse tarde/);
  assert.deepEqual(page.lire("photosCours").files, fichiers);
  assert.equal(page.lire("genererQuestionnaire").disabled, false);
  const requetesApresCreation = requetes.length;

  coupeGeneration = false;
  page = navigateur();
  await page.lire("genererQuestionnaire").listeners.click();
  assert.equal(dernierLot, lotOriginal);
  assert.equal(requetes.length, requetesApresCreation);
  attente.terminer();
  await new Promise(setImmediate);
  assert.equal(page.lire("formTitreLot").hidden, false);
  assert.equal(page.lire("titreLot").value, "Fractions");
  assert(!lister().some(quiz => quiz.id === lotOriginal));

  page.lire("titreLot").value = "Révision des fractions";
  page.lire("titreLot").listeners.input();
  const soumettre = id => page.lire(id).listeners.submit({ preventDefault() {} });
  const clicValidation = soumettre("formTitreLot");
  const validation = await attendreAppel("validerTitre");
  page.navigator.onLine = false;
  page.evenements.dispatchEvent(new Event("offline"));
  await clicValidation;
  assert.match(page.lire("progressionLot").textContent, /Connexion Internet interrompue/);
  assert.equal(page.lire("titreLot").value, "Révision des fractions");

  coupeValidation = false;
  page = navigateur();
  assert.equal(page.lire("titreLot").value, "Révision des fractions");
  await soumettre("formTitreLot");
  validation.terminer();
  assert.match(page.lire("progressionLot").textContent, /Questionnaire créé : Révision des fractions/);
  assert.equal(lister().filter(quiz => quiz.id === lotOriginal).length, 1);
  assert.equal(requetes.length, requetesApresCreation);
  const ligne = page.lire("listeQuiz").children.find(element =>
    element.children[0].textContent === "📖 Révision des fractions");
  ligne.children[1].onclick();
  assert.equal(page.lire("nouveauTitre").value, "Révision des fractions");
  page.lire("nouveauTitre").value = "Fractions, révision finale";
  await soumettre("formRenommer");
  assert.match(page.lire("messageRenommage").textContent, /dossier d’archives renommés/);
  assert(lister().some(quiz => quiz.id === lotOriginal && quiz.titre === "Fractions, révision finale"));
  const ligneRenommee = page.lire("listeQuiz").children.find(element => element.dataset.quizId === lotOriginal);
  ligneRenommee.children[2].onclick();
  assert.match(page.lire("confirmationSuppression").textContent, /Fractions, révision finale/);
  const appelsAvantAnnulation = historiques.length;
  page.lire("annulerSuppression").listeners.click();
  assert.equal(historiques.length, appelsAvantAnnulation);
  assert(page.lire("formSuppression").hidden);

  ligneRenommee.children[2].onclick();
  const clicSuppression = soumettre("formSuppression");
  const suppression = await attendreAppel("supprimerQuiz");
  page.navigator.onLine = false;
  page.evenements.dispatchEvent(new Event("offline"));
  await clicSuppression;
  assert(!page.lire("formSuppression").hidden);
  assert.match(page.lire("messageSuppression").textContent, /Connexion Internet interrompue/);
  assert(page.lire("listeQuiz").children.some(element => element.dataset.quizId === lotOriginal));
  coupeSuppression = false;
  page.navigator.onLine = true;
  await soumettre("formSuppression");
  suppression.terminer();
  assert(page.lire("formSuppression").hidden);
  assert(!page.lire("listeQuiz").children.some(element => element.dataset.quizId === lotOriginal));
  assert(!lister().some(quiz => quiz.id === lotOriginal));
  assert(quiz.fichiers.filter(f => f.getName() === "Quiz_" + lotOriginal + ".json").length === 1);
  assert.equal(stockage.size, 1, "Seule la session reste après un succès");
  console.log("OK — coupure, validation, renommage et suppression (" + (kit ? "kit Apps Script" : "fetch") + ")");

}

testerInterface().then(() => testerInterface(true)).catch(erreur => {
  console.error(erreur);
  process.exitCode = 1;
});
