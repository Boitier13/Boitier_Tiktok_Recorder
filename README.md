# Boitier Tiktok Live (BTL)

Application Windows de surveillance de créateurs TikTok et d’enregistrement de leurs LIVE. Le dépôt commence à réunir l’interface Creator Radar et le moteur MSR d’origine sur la branche Arena de travail ; le produit Windows final n’est pas encore empaqueté ni validé sur des LIVE TikTok réels.

## Arbres source réunis

- `frontend/` : interface React/TanStack française exportée de `frontend` commit `ad213b8fb403dc6619a6eab8d64633710391167b` ; la première tranche d’intégration remplace les fixtures par les snapshots du moteur pour roster/session/enregistrements.
- `engine/` : moteur Python original exporté de `engine` commit `4e76f3fa3dcc7520396e819b35cca8a665c8f4ca` ; modules source eux-mêmes non modifiés.
- `prototype/` : hôte local Python/REST/SSE et parcours de smoke test. Il importe désormais le moteur canonique depuis `engine/`. `prototype/vendor/engine/` est conservé comme snapshot de test d’origine.
- `docs/` : audit et provenance des copies source.

Les branches source GitHub n’ont pas été modifiées ; aucun code n’a été fusionné ni poussé vers elles.

## Exécution locale de développement

1. Installer les dépendances d’interface :

   ```sh
   cd frontend
   npm install --legacy-peer-deps
   ```

2. Installer les dépendances moteur requises pour les opérations testées. Pour l’ajout de créateurs, `yt-dlp` doit être accessible dans le `PATH`. Pour une vraie capture, il faut aussi Streamlink et FFmpeg/ffprobe. Sur Windows, installer également `pywebview`, `pystray`, Pillow et Plyer (présents dans `engine/requirements.txt`) ainsi que le runtime Microsoft Edge WebView2. Node.js n’est requis que pour construire le frontend, pas pour servir l’application une fois le build SPA généré.

3. Construire le frontend SPA de production (requis une fois avant le lancement de l’hôte Windows) :

   ```sh
   cd frontend
   npm run build
   ```

   Le build statique est écrit dans `frontend/.output/public`; l’installateur devra embarquer ce dossier. Pour du développement uniquement, `--dev-frontend` lance Vite à la place du build statique.

4. Depuis la racine du dépôt, démarrer l’hôte BTL local avec un dossier de données explicite :

   ```sh
   python prototype/btl_vertical_host.py --data-dir /chemin/vers/donnees-btl --port 8765
   ```

   L’hôte démarre le moteur en pause ; BTL n’active pas le poller multi-plateforme partagé. Sous Windows, il sert les fichiers SPA compilés par le serveur HTTP Python et ouvre cette URL dans WebView2 : Node.js et `node_modules` ne sont donc pas nécessaires à l’exécution. Avec le tray, réduire ou fermer la fenêtre la masque et l’icône la restaure ; « Quitter » ferme explicitement WebView2 puis arrête l’hôte. Sans tray, fermer la fenêtre termine l’hôte. La session ne démarre qu’après une action explicite dans l’interface ou le menu tray. `--background` lance le host via `pythonw.exe` sans fenêtre console. Le serveur API est lié à `127.0.0.1`.

5. Sur Linux ou pour un frontend lancé séparément, démarrer Vite dans un second terminal :

   ```sh
   cd frontend
   npm run dev -- --host 0.0.0.0
   ```

   Vite relaie les requêtes `/api/*` vers `http://127.0.0.1:8765`. Une autre cible peut être donnée avec `BTL_API_TARGET`. Le navigateur n’appelle donc pas directement un second service via `localhost`.

## Vérifications disponibles

- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm test`
- `cd frontend && npm run build`
- `PATH=<répertoire-venv-yt-dlp>:$PATH python prototype/btl_vertical_host.py --smoke`

La page Enregistrements affiche les captures actives, relaie leur arrêt au moteur et lit les MP4 archivés via le flux local HTTP (navigation par plages et commandes audio/vidéo natives). Elle expose aussi les statistiques du scan Bibliothèque, le détail des clips associés par créateur et le déplacement confirmé de vidéos vers PendingDeletion avec restauration par lot ; la suppression définitive n’est pas proposée. Les réglages exposés dans Paramètres sont chargés et enregistrés dans la configuration persistante du moteur via une liste blanche, puis indiquent quand ils prennent effet. Les notifications Windows passent par le host Python local et Plyer pour les événements LIVE, fin/interruption d’un LIVE, fin de capture, erreurs et espace disque faible ; elles continuent si l’interface web est fermée tant que le host et le moteur tournent et que Windows autorise les notifications. L’hôte Windows ajoute une icône de barre système (ouvrir l’interface, démarrer/arrêter la surveillance, quitter proprement) et l’option `--background` le relance via `pythonw.exe` sans console. Fermer la page web ne ferme donc pas le moteur. Un bouton Paramètres envoie un toast de test. Les tests du host simulent Plyer et pystray ; aucun affichage réel n’a été vérifié sur Windows. Les autres tests sont synthétiques : ils ne valident pas un LIVE TikTok, un média réel ni Windows 10. Sous Windows, le host ouvre par défaut cette interface React dans une fenêtre native Edge WebView2 et démarre Vite avec son proxy vers l’API locale ; avec le tray actif, réduire/fermer masque la fenêtre et l’icône la restaure. « Quitter » depuis le tray bypass le comportement de masquage pour fermer WebView2 et l’hôte proprement ; sans tray, la fermeture de la fenêtre termine l’hôte. `--no-desktop` conserve le navigateur. Le démarrage automatique se règle dans Paramètres : il lance BTL discrètement dans le tray à l’ouverture de session, sans démarrer la surveillance. Le périmètre V1 convenu est un ZIP portable sans MSI; le sélecteur natif de dossier et l’import/export sont reportés. Le ZIP portable fournit des scripts PowerShell d’installation, mise à jour et désinstallation utilisateur. Les smoke tests locaux du prototype (50/50) et du multiprocessing package ont réussi. Le workflow GitHub Actions Windows a aussi réussi le build PyInstaller et le cycle automatisé install/update/uninstall sur `windows-latest` (run [44922937660](https://github.com/Boitier13/Boitier_Tiktok_Recorder/actions/runs/44922937660)); les essais manuels Windows 10/11 et une capture autorisée restent nécessaires. Le runtime WebView2 Evergreen reste un prérequis externe détecté au démarrage avec un message de dépannage et un fallback navigateur.

Voir `docs/INTEGRATION_MANIFEST.md` et les rapports dans `docs/` pour l’état détaillé. La cible de pré-distribution Windows (ZIP portable x64, runtime Python embarqué par PyInstaller) et ses outils/prérequis sont décrits dans `packaging/windows/README.md`; la recette n’a pas encore été exécutée ni validée sur Windows et ne constitue pas une livraison finale.
