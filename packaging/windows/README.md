# Installation, mise à jour et désinstallation Windows BTL

## Décision de cycle de vie

BTL est distribué comme ZIP portable x64 contenant une application PyInstaller `onedir`, pas comme MSI. Les scripts PowerShell fournis ajoutent un cycle utilisateur sans droits administrateur :

- **Application** : `%LOCALAPPDATA%\Programs\BoitierTiktokRecorder` par défaut.
- **Configuration et créateurs** : `%LOCALAPPDATA%\BoitierTiktokRecorder` par défaut — `config.ini`, journaux, index et liste des créateurs. Ce chemin est séparé du dossier application et n’est ni remplacé lors d’une mise à jour, ni supprimé par défaut à la désinstallation.
- **Enregistrements vidéo** : `%USERPROFILE%\Videos\BoitierTiktokRecorder` par défaut, en utilisant le dossier Vidéos Windows connu s’il est redirigé (par exemple OneDrive). Les vidéos restent séparées de la configuration et sont conservées lors des mises à jour et désinstallations.
- **Raccourcis** : raccourci menu Démarrer à l’installation; autostart facultatif géré depuis Paramètres par un raccourci Startup du profil utilisateur. Aucun service ni clé de registre d’autostart n’est créé.

`-InstallDir`, `-DataDir` et `-RecordingsDir` permettent de personnaliser les chemins. Le lanceur conserve `--data-dir` pour la configuration et la liste des créateurs; le dossier vidéo par défaut est résolu par BTL depuis le dossier Vidéos Windows. Les scripts refusent que les trois dossiers se recouvrent. Périmètre V1 accepté : pas de MSI, pas de sélecteur natif de dossier, et import/export reportés.

## Installer

1. Extraire le ZIP complet dans un dossier temporaire.
2. Depuis le dossier extrait, lancer :

```powershell
.\maintenance\install.ps1
```

L’application et un raccourci menu Démarrer sont installés pour l’utilisateur courant. La configuration reste sous `%LOCALAPPDATA%\BoitierTiktokRecorder`; les captures sont enregistrées sous `%USERPROFILE%\Videos\BoitierTiktokRecorder`. L’autostart n’est pas activé implicitement; il peut l’être ensuite dans Paramètres. Si Windows bloque un script marqué comme téléchargé, débloquez uniquement les scripts de ce dossier (`Unblock-File .\maintenance\*.ps1`) au lieu de modifier la stratégie PowerShell globale.

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

Le script prépare la nouvelle arborescence à côté de l’installation, remplace le dossier application avec restauration de l’ancien en cas d’échec de bascule, puis supprime le backup applicatif après succès. Il **n’écrit pas dans les dossiers utilisateur** : `config.ini`, journaux, index et liste des créateurs restent sous `%LOCALAPPDATA%\BoitierTiktokRecorder`; les vidéos restent sous `%USERPROFILE%\Videos\BoitierTiktokRecorder` (ou aux chemins personnalisés enregistrés à l’installation). Les raccourcis restent valides parce que le chemin d’installation ne change pas; le script refuse de tourner si BTL est encore ouvert.

Avant une mise à jour importante, une copie de sauvegarde des dossiers de configuration et de vidéos reste recommandée. Si une ancienne installation contient `config.ini` ou `recordings` à côté de l’EXE, l’update s’arrête plutôt que de les écraser : sauvegardez et déplacez la configuration hors du dossier application. Les vidéos trouvées sous leur ancien chemin configuré sont migrées au premier démarrage vers le dossier Vidéos par défaut; si source et destination contiennent déjà des fichiers, BTL refuse la migration sans écraser de données et indique les chemins pour une fusion manuelle. Pour changer le chemin d’installation, désinstallez l’ancienne application en conservant les données puis réinstallez au nouvel emplacement en réutilisant les mêmes `-DataDir` et `-RecordingsDir`; réactivez l’autostart si besoin.

## Désinstaller sans effacer les données

Lancer le script depuis le dossier de l’installation :

```powershell
.\maintenance\uninstall.ps1
```

Il demande que BTL soit fermé, retire le raccourci Startup BTL s’il vise cette installation, retire le raccourci menu Démarrer correspondant et le dossier application. **Il conserve les données utilisateur** : configuration et créateurs sous `%LOCALAPPDATA%\BoitierTiktokRecorder`, vidéos sous `%USERPROFILE%\Videos\BoitierTiktokRecorder` (ou leurs chemins personnalisés consignés dans `install-info.json`). La suppression de l’application est différée de quelques secondes pour laisser le script rendre la main avant le retrait des fichiers.

Pour effacer également les données, il faut ajouter `-PurgeUserData`; le script affiche alors les deux chemins complets et exige de les ressaisir exactement, séparés par `|`. Exemple :

```powershell
.\maintenance\uninstall.ps1 -PurgeUserData
```

La confirmation est irréversible. Les dossiers personnalisés de données et les raccourcis visant une autre installation ne sont pas supprimés implicitement. Une fermeture manuelle de dossier ZIP jamais installé ne touche ni aux données ni aux raccourcis; si l’autostart avait été activé, désinstallez proprement ou désactivez-le dans Paramètres avant de déplacer/supprimer le dossier.

## Outils de capture inclus

Les quatre commandes requises par le moteur sont placées dans `tools/` :

- `yt-dlp.exe` et `streamlink.exe` : launchers console PyInstaller construits depuis les distributions exactes du lock Python BTL. Ils sont vérifiés contre leurs versions verrouillées et lancent respectivement les points d’entrée officiels `yt_dlp:main` et `streamlink_cli.main:main`.
- `ffmpeg.exe` et `ffprobe.exe` : extraits ensemble de l’archive Windows x64 de FFmpeg, avec contrôle taille/SHA-256 et vérification `-version` lors du build. BTL ajoute `tools/` au `PATH` au démarrage, sans changer le moteur partagé.

Le build puis l’EXE final exposent `--check-tools`, qui teste les quatre commandes sans lancer l’hôte. Les launchers onefile yt-dlp et Streamlink sont vérifiés séquentiellement avec jusqu’à trois tentatives et un budget total de 90 secondes chacun (45 secondes maximum par tentative), pour absorber un échec transitoire pendant l’analyse antivirus ou l’extraction à froid; ffmpeg/ffprobe gardent un délai de 15 secondes. Le dernier échec détaillé reste dans `%TEMP%\btl-tools-check.txt` et `%TEMP%\btl-tools-check-last-failure.txt`, même après un lancement ultérieur réussi; ce dernier est consigné séparément dans `%TEMP%\btl-tools-check-last-success.txt`. Les résultats du contrôle alimentent ensuite le cache de dépendances du moteur, afin que ses sondes génériques plus courtes ne signalent pas à tort les launchers comme absents. Au premier démarrage, un roster vide `channels.json` est créé dans le dossier de données persistant. Si un outil est absent/inutilisable, le démarrage Windows affiche une boîte de dépannage avec le chemin de ce rapport. Dans une archive gelée, elle demande de réextraire le ZIP complet; en mode source, elle demande les dépendances Python verrouillées et les outils dans le `PATH`.

## Microsoft Edge WebView2

Le runtime Evergreen WebView2 **n’est pas embarqué** : il est entretenu séparément par Microsoft et peut déjà être présent avec Edge. Avant d’ouvrir la fenêtre native, BTL cherche l’entrée « Microsoft Edge WebView2 Runtime » dans Edge Update pour HKCU/HKLM et les vues registre pertinentes; la valeur de version doit être valide et non nulle.

S’il manque, BTL indique le lien Microsoft de téléchargement et ouvre l’interface dans le navigateur par défaut. Si le runtime est détecté mais ne démarre pas, le message recommande de réparer Evergreen et de vérifier les politiques WebView2/Edge. Relancer BTL après installation/réparation pour revenir à la fenêtre native. Réduire la fenêtre conserve son bouton dans la barre des tâches; fermer la fenêtre la masque dans la zone de notification. Un nouveau lancement de l’EXE utilise un mutex utilisateur pour restaurer l’instance déjà ouverte au lieu de lancer une seconde sonde/outils. `--no-desktop` reste disponible pour choisir délibérément le navigateur; l’autostart en arrière-plan n’ouvre pas de navigateur spontanément.

## Dépendances verrouillées

`engine/requirements.txt` reste le manifeste multi-plateforme du moteur MSR commun et n’est pas modifié par cette sélection. Le build Windows utilise `requirements-win-x64-py312.lock` (versions et hashes) produit à partir de `requirements-build.in`; les dépendances runtime directes BTL sont listées dans `requirements-btl.in`.

Versions directes épinglées dans le lock candidat : yt-dlp 2026.10.26, Streamlink 8.6.3, curl-cffi 0.17.0, psutil 7.2.2, Pillow 13.0.0, pywebview 6.2.1, pystray 0.19.5, Plyer 2.1.0, colorama 0.4.6 et PyInstaller 6.22.3. Le lock transitive contient 48 distributions et leurs hashes PyPI.

La génération et l’installation Windows/Python 3.12 restent à valider sur un runner Windows x64. Les versions ci-dessus ne doivent donc pas être appelées « versions testées Windows » avant le workflow vert.

## FFmpeg et vérification d’intégrité

`tools-win-x64.lock.json` fixe l’asset candidat BtbN n9.0.2-61-gd59078794d, variante étiquetée LGPL, taille 171,850,214 octets et SHA-256 `c0231e389cf6afaa81ef9673c7ff0d05f8e3890268ebc698b1d462e9685a2b43`. L’URL utilise le tag immuable `autobuild-2026-11-22-12-36`, et le hash obligatoire refuse tout payload différent. `fetch_ffmpeg.ps1` copie les deux exécutables et les notices/licences présentes dans l’archive. Le lock de l’asset et ces notices sont placés sous `tools/ffmpeg-licenses/`.

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
