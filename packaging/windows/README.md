# Installation, mise à jour et désinstallation Windows BTL

## Décision de cycle de vie

BTL est distribué comme ZIP portable x64 contenant une application PyInstaller `onedir`, pas comme MSI. Les scripts PowerShell fournis ajoutent un cycle utilisateur sans droits administrateur :

- **Application** : `%LOCALAPPDATA%\Programs\BoitierTiktokRecorder` par défaut.
- **Données persistantes** : `%LOCALAPPDATA%\BoitierTiktokRecorder` par défaut — `config.ini`, journaux, index et dossiers d’enregistrements. Ce chemin est séparé du dossier application et n’est ni remplacé lors d’une mise à jour, ni supprimé par défaut à la désinstallation.
- **Raccourcis** : raccourci menu Démarrer à l’installation; autostart facultatif géré depuis Paramètres par un raccourci Startup du profil utilisateur. Aucun service ni clé de registre d’autostart n’est créé.

`-InstallDir` et `-DataDir` permettent de personnaliser les chemins. Les scripts refusent que le dossier application et le dossier de données se recouvrent. Ne placez jamais les enregistrements dans le dossier application. Périmètre V1 accepté : pas de MSI, pas de sélecteur natif de dossier, et import/export reportés; le chemin des données est le défaut ou `--data-dir`.

## Installer

1. Extraire le ZIP complet dans un dossier temporaire.
2. Depuis le dossier extrait, lancer :

```powershell
.\maintenance\install.ps1
```

L’application et un raccourci menu Démarrer sont installés pour l’utilisateur courant. Les données restent à leur emplacement existant/default. L’autostart n’est pas activé implicitement; il peut l’être ensuite dans Paramètres. Si Windows bloque un script marqué comme téléchargé, débloquez uniquement les scripts de ce dossier (`Unblock-File .\maintenance\*.ps1`) au lieu de modifier la stratégie PowerShell globale.

Exemple de chemins personnalisés :

```powershell
.\maintenance\install.ps1 `
  -InstallDir "$env:LOCALAPPDATA\Apps\BTL" `
  -DataDir "$env:LOCALAPPDATA\BoitierTiktokRecorder"
```

## Mettre à jour en préservant configuration et vidéos

1. Télécharger et extraire la **nouvelle** archive BTL dans un dossier distinct.
2. Quitter BTL et son icône de barre système.
3. Depuis cette nouvelle extraction, lancer `maintenance\update.ps1` en visant le même dossier application :

```powershell
.\maintenance\update.ps1
```

Pour une installation personnalisée :

```powershell
.\maintenance\update.ps1 -InstallDir "$env:LOCALAPPDATA\Apps\BTL"
```

Le script prépare la nouvelle arborescence à côté de l’installation, remplace le dossier application avec restauration de l’ancien en cas d’échec de bascule, puis supprime le backup applicatif après succès. Il **n’écrit pas dans le dossier de données** : `config.ini`, enregistrements, journaux et index restent sous `%LOCALAPPDATA%\BoitierTiktokRecorder` (ou leur chemin personnalisé enregistré à l’installation). Les raccourcis restent valides parce que le chemin d’installation ne change pas; le script refuse de tourner si BTL est encore ouvert.

Avant une mise à jour importante, une copie de sauvegarde du dossier de données reste recommandée. Si une ancienne installation contient `config.ini` ou `recordings` à côté de l’EXE, l’update s’arrête plutôt que de les écraser : sauvegardez et déplacez ces données hors du dossier application. Pour changer le chemin d’installation, désinstallez l’ancienne application en conservant les données puis réinstallez au nouvel emplacement en réutilisant le même `-DataDir`; réactivez l’autostart si besoin.

## Désinstaller sans effacer les données

Lancer le script depuis le dossier de l’installation :

```powershell
.\maintenance\uninstall.ps1
```

Il demande que BTL soit fermé, retire le raccourci Startup BTL s’il vise cette installation, retire le raccourci menu Démarrer correspondant et le dossier application. **Il conserve les données utilisateur**, y compris la configuration et les enregistrements, sous `%LOCALAPPDATA%\BoitierTiktokRecorder` ou le chemin personnalisé consigné dans `install-info.json`. La suppression de l’application est différée de quelques secondes pour laisser le script rendre la main avant le retrait des fichiers.

Pour effacer également les données, il faut ajouter `-PurgeUserData`; le script affiche alors le chemin complet et exige de le ressaisir exactement. Exemple :

```powershell
.\maintenance\uninstall.ps1 -PurgeUserData
```

La confirmation est irréversible. Les dossiers personnalisés de données et les raccourcis visant une autre installation ne sont pas supprimés implicitement. Une fermeture manuelle de dossier ZIP jamais installé ne touche ni aux données ni aux raccourcis; si l’autostart avait été activé, désinstallez proprement ou désactivez-le dans Paramètres avant de déplacer/supprimer le dossier.

## Outils de capture inclus

Les quatre commandes requises par le moteur sont placées dans `tools/` :

- `yt-dlp.exe` et `streamlink.exe` : launchers console PyInstaller construits depuis les distributions exactes du lock Python BTL. Ils sont vérifiés contre leurs versions verrouillées et lancent respectivement les points d’entrée officiels `yt_dlp:main` et `streamlink_cli.main:main`.
- `ffmpeg.exe` et `ffprobe.exe` : extraits ensemble de l’archive Windows x64 de FFmpeg, avec contrôle taille/SHA-256 et vérification `-version` lors du build. BTL ajoute `tools/` au `PATH` au démarrage, sans changer le moteur partagé.

Le build puis l’EXE final exposent `--check-tools`, qui teste les quatre commandes sans lancer l’hôte. Les launchers onefile yt-dlp et Streamlink disposent d’un délai de 30 secondes et sont vérifiés en parallèle pour tolérer leur démarrage à froid (notamment sous Windows 10 avec l’analyse antivirus). Si un outil est absent/inutilisable, le démarrage Windows affiche une boîte de dépannage. Dans une archive gelée, elle demande de réextraire le ZIP complet; en mode source, elle demande les dépendances Python verrouillées et les outils dans le `PATH`.

## Microsoft Edge WebView2

Le runtime Evergreen WebView2 **n’est pas embarqué** : il est entretenu séparément par Microsoft et peut déjà être présent avec Edge. Avant d’ouvrir la fenêtre native, BTL cherche l’entrée « Microsoft Edge WebView2 Runtime » dans Edge Update pour HKCU/HKLM et les vues registre pertinentes; la valeur de version doit être valide et non nulle.

S’il manque, BTL indique le lien Microsoft de téléchargement et ouvre l’interface dans le navigateur par défaut. Si le runtime est détecté mais ne démarre pas, le message recommande de réparer Evergreen et de vérifier les politiques WebView2/Edge. Relancer BTL après installation/réparation pour revenir à la fenêtre native. `--no-desktop` reste disponible pour choisir délibérément le navigateur; l’autostart en arrière-plan n’ouvre pas de navigateur spontanément.

## Dépendances verrouillées

`engine/requirements.txt` reste le manifeste multi-plateforme du moteur MSR commun et n’est pas modifié par cette sélection. Le build Windows utilise `requirements-win-x64-py312.lock` (versions et hashes) produit à partir de `requirements-build.in`; les dépendances runtime directes BTL sont listées dans `requirements-btl.in`.

Versions directes épinglées dans le lock candidat : yt-dlp 2026.10.26, Streamlink 8.6.3, curl-cffi 0.17.0, psutil 7.2.2, Pillow 13.0.0, pywebview 6.2.1, pystray 0.19.5, Plyer 2.1.0, colorama 0.4.6 et PyInstaller 6.22.3. Le lock transitive contient 48 distributions et leurs hashes PyPI.

La génération et l’installation Windows/Python 3.12 restent à valider sur un runner Windows x64. Les versions ci-dessus ne doivent donc pas être appelées « versions testées Windows » avant le workflow vert.

## FFmpeg et vérification d’intégrité

`tools-win-x64.lock.json` fixe l’asset candidat BtbN n9.0, variante étiquetée LGPL, taille 171,848,467 octets et SHA-256 `c6ba688c964ab8b2e5d357100a49be25491c60b5d48cdaac46d20ba0dded6260`. La source utilise une URL `latest` mutable; le hash obligatoire refuse tout payload différent. `fetch_ffmpeg.ps1` copie les deux exécutables et les notices/licences présentes dans l’archive. Le lock de l’asset et ces notices sont placés sous `tools/ffmpeg-licenses/`.

Ce contrôle d’intégrité ne vaut pas approbation de redistribution. Lire `THIRD_PARTY_NOTICES.md` : l’audit des licences, composants natifs, configuration exacte et obligations source/relinkabilité reste un **release gate**.

## Build et vérification

Sur Windows x64 avec CPython 3.12 x64, Node.js 22 et npm :

```powershell
./packaging/windows/build.ps1
```

Le script construit l’interface, installe le lock avec `pip --require-hashes`, produit l’application onedir, lance le smoke multiprocessing, construit les deux launchers console, vérifie les versions exactes, récupère FFmpeg/ffprobe avec le hash attendu, exécute `BoitierTiktokLive.exe --check-tools`, ajoute les scripts de cycle de vie et crée le ZIP.

Pour diagnostiquer un dossier déjà installé :

```powershell
& "$env:LOCALAPPDATA\Programs\BoitierTiktokRecorder\BoitierTiktokLive.exe" --check-tools
```

## État de validation

Le workflow GitHub Actions Windows a réussi le build PyInstaller, `--package-smoke` et le test automatisé du cycle install/update/uninstall sur `windows-latest` (run [44922937660](https://github.com/Boitier13/Boitier_Tiktok_Recorder/actions/runs/44922937660), 21 novembre 2026). Il a vérifié les outils manquants, les chemins avec espaces/accents, les hashes des données conservés et les raccourcis; l’artefact ZIP candidat `BoitierTiktokLive-win-x64-portable` a été publié (230,162,940 octets). Cela ne remplace pas les essais manuels Windows 10/11 : WebView2 réel, tray/autostart, installation utilisateur et capture autorisée restent à vérifier. La purge après confirmation exacte reste un essai manuel sur données jetables. Le ZIP demeure un candidat, pas une release juridiquement validée.

Le rapport de licences est encore préliminaire et bloque la redistribution publique tant que l’audit et les notices complètes ne sont pas terminés. Le ZIP candidat ne doit pas être présenté comme une release juridiquement validée.

Aucune signature Authenticode n’est configurée à ce stade. Avant une diffusion publique, décider du certificat et du service de signature, intégrer la signature des exécutables/scripts et l’horodatage dans un runner protégé (certificat/clé hors du dépôt), puis tester l’expérience SmartScreen sur une machine propre. Une signature ne garantit pas à elle seule l’absence d’avertissements SmartScreen; l’artefact de CI actuel est un candidat non signé.
