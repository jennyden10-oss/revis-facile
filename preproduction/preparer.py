"""Regénère l’archive statique à partir de l’interface de la branche."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

dossier = Path(__file__).resolve().parent
racine = dossier.parent
interface = (racine / "index.html").read_text(encoding="utf-8")
balise_url = '<meta name="apps-script-url" content="">'
if interface.count(balise_url) != 1:
    raise SystemExit("L’URL du serveur doit rester vide dans le fichier de production.")
interface = interface.replace(
    balise_url,
    balise_url + '\n  <meta name="robots" content="noindex, nofollow">'
    + '\n  <script src="./application-config.js"></script>',
)
interface = interface.replace(
    "<h1>Révis'Facile 📚</h1>",
    "<h1>Révis'Facile · Préproduction</h1>"
    + '\n  <p><a href="./?configuration">Changer le serveur TEST</a></p>',
)
fichiers = {
    "index.html": (dossier / "configuration.html").read_bytes(),
    "application.html": interface.encode("utf-8"),
    "configuration.js": (dossier / "configuration.js").read_bytes(),
    "application-config.js": (dossier / "application-config.js").read_bytes(),
    ".nojekyll": b"",
}
for nom in ("manifest.json", "sw.js", "icone-192.png", "icone-512.png"):
    fichiers[nom] = (racine / nom).read_bytes()

with ZipFile(dossier / "revis-facile-preproduction.zip", "w") as archive:
    for nom, contenu in fichiers.items():
        archive.writestr(ZipInfo(nom), contenu, compress_type=ZIP_DEFLATED)
