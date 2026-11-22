# Inventaire exhaustif initial — modules, dépendances et couverture de tests BTL

**Commits de référence audités :** `engine` `4e76f3fa3dcc7520396e819b35cca8a665c8f4ca`; `frontend` `ad213b8fb403dc6619a6eab8d64633710391167b`; `main` `15bcb0b271e4f04eed3ca4204d8aae41ddc0d1cf`. Les copies source sont maintenant sous `engine/` et `frontend/` dans la branche Arena ; les modules du moteur restent intacts, tandis que la copie frontend porte la première tranche d’intégration. `prototype/vendor/engine/` est le snapshot isolé du moteur utilisé par le test d’origine.

Ce document complète `AUDIT_INITIAL_BTL_FR.md`. L’inventaire est exhaustif **au niveau des fichiers présents et des tests déclarés** (AST, imports, docstrings, commandes et fixtures). Il ne transforme pas la présence d’une fonction en preuve de son fonctionnement réel ; les limites d’exécution et de TikTok sont consignées plus bas.

## 1. Tous les fichiers Python du package `msr`

| Fichier | Taille / symboles top-level | Rôle déclaré dans le code | Décision initiale pour BTL |
|---|---:|---|---|
| `msr/__init__.py` | 11 lignes / 0 | Multi-Stream Recorder internals. The user-facing entry point remains ``Multi-Stream-Recorder.py`` in the project root. Worker processes import ``msr.worker.record_worker`` so Windows ``spawn`` does not re-execute the GUI. Conventions and clip/GUI gotchas for f | À conserver provisoirement ; vérifier les références lors de l’élagage TikTok-only. |
| `msr/about.py` | 76 lignes / 5 | The About text (Tk-free so it can be tested). The GUI shows it in a themed info dialog. | Garder les capacités utiles ; rebrand/adapter installation et mises à jour. |
| `msr/agent_status.py` | 556 lignes / 11 | What an agent needs beyond the live channel table: health, events, finished recordings. Used by ``msr.control`` (status file and commands). Nothing here holds or returns a secret: cookie checks report counts, domains and expiry times, never values; Fishtank on | Garder events/health/status, compléter mappings BTL ; événement réel TikTok reste à valider. |
| `msr/appicon.py` | 141 lignes / 11 | The app icon (assets/icon.*): taskbar identity, window icons for every Toplevel, the tray image, and desktop shortcuts. Nothing here runs in headless mode. | Garder les capacités utiles ; rebrand/adapter installation et mises à jour. |
| `msr/apply_update.py` | 214 lignes / 13 | Standalone helper: wait for MSR to exit, copy a staged update, relaunch. Copied to a temp file before MSR quits so this process does not run from the ``msr/`` tree it is about to replace. Stdlib only — do not import ``msr``. | À conserver provisoirement ; vérifier les références lors de l’élagage TikTok-only. |
| `msr/channel_panel.py` | 433 lignes / 14 | Left roster panel: pure helpers plus the small Add Channel dialog. Pure functions here are unit-tested headlessly (no Tk needed). The panel widgets themselves are built in ``msr.gui.main_gui`` because they share a lot of closure state with the rest of the wind | Helpers roster réutilisables ; UI d’ajout multi-sites à remplacer/adapter. |
| `msr/charts.py` | 329 lignes / 12 | Small Canvas charts in the app theme: horizontal bars, a donut and monthly columns. No dependencies. Each chart redraws itself when its canvas is resized or the theme changes, and shows an exact-number tooltip drawn on the canvas itself (no extra windows) when | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/clip_audio.py` | 990 lignes / 18 | Sound for the Clip Editor. ffmpeg decodes to raw PCM on a pipe. Windows plays it with waveOut (ctypes), ported from Leapcut's clipper/audio_out.py. Linux plays it by handing that PCM to pw-play, pw-cat or paplay. The sound is the master clock: position() is ho | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/clip_core.py` | 628 lignes / 36 | Clip Editor engine, Tk-free: how long a (still growing) recording is, preview frames, the cut itself and output names. Everything here only reads the source. A recording's .ts is opened with shared access by Python and ffmpeg, so the recorder keeps writing und | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/clip_editor.py` | 894 lignes / 4 | Clip Editor: a small DVR-style window to cut a clip out of a recording, also while it is still being recorded. Timeline over the whole recording so far (the live edge grows), scrub with a preview frame, play with sound and a volume slider, mark In / Out (I / O | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/config.py` | 573 lignes / 11 | config.ini defaults and accessors. | Garder stockage et validation génériques ; réduire les sections spécifiques uniquement après utilisation/import mapping. |
| `msr/context_menu.py` | 36 lignes / 3 | Which mouse event opens a right-click menu. On X11, Tk's ``tk_popup`` from ``<Button-3>`` leaves the button release for the menu. A quick click then invokes whatever item is under the pointer (the channel list's Enable, for example). Opening on ``<ButtonReleas | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/control.py` | 2406 lignes / 40 | Agent / headless control: one command set for the GUI, --headless and msr_ctl.py. Three pieces, no tkinter here: * ``Controller`` runs the commands (status, roster edits, start/stop, check, clip, settings, library, history, logs, update, quit) against an *app  | Garder contrat de contrôle/persistance ; nettoyer validation plateformes et commandes purement Twitch/other-platform. |
| `msr/control_exec.py` | 298 lignes / 7 | Ordered execution for control commands (no tkinter here). Control requests arrive on server threads. They never touch the window or the recorder themselves: they put ``(callable, reply slot)`` on a ``SerialQueue`` and wait. The owner thread runs the jobs one a | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/deps.py` | 425 lignes / 19 | Optional/required tool detection (yt-dlp, streamlink, ffmpeg, …). | Garder détection générique, sélectionner les dépendances nécessaires à BTL après inventaire. |
| `msr/deps_dialog.py` | 210 lignes / 2 | Updates dialog: installed/latest/status per dependency, Check now, Update selected, Update all. Network and pip run in a worker thread; the worker only puts results on a queue that after() drains, so Tk is touched from the main thread only. | À conserver provisoirement ; vérifier les références lors de l’élagage TikTok-only. |
| `msr/depsupdate.py` | 360 lignes / 24 | Dependencies: what MSR runs on, what is newer, and pip updates. Tk-free (GUI dialog, control API and msr_ctl.py share it). Rows: MSR itself (GitHub releases; installed by the existing in-app updater), the recording tools yt-dlp and streamlink, ffmpeg (reported | Conserver le modèle de vérification si utile ; réécrire catalogue de dépendances BTL et distribution (non conserver la liste MSR aveuglément). |
| `msr/dialogs.py` | 394 lignes / 27 | Themed, always-parented dialogs for the Tk GUI. Native ``messagebox`` / ``simpledialog`` windows ignore the app theme and, called without ``parent=``, open wherever Windows likes. These helpers replace them: * every dialog belongs to a window (``parent``) and  | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/dpapi.py` | 35 lignes / 4 | Windows DPAPI (current user) for secrets at rest; callers keep plaintext elsewhere. | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/gui.py` | 3829 lignes / 12 | Tkinter GUI: status table, channel roster, clips, tray, theme. | Interface MSR anglaise et Tk : ne pas reprendre telle quelle ; retirer/adapter pour conserver les capacités BTL sans perdre logique non UI. |
| `msr/health.py` | 294 lignes / 18 | Health checks for unattended runs. Tk-free (msr/health_ui.py shows the results). Startup: ffmpeg, streamlink and yt-dlp run (a hidden --version call each), the recordings folder is writable with enough free space, and the Twitch sign-in is still valid (one val | Garder contrôle d’espace/disque/processus ; retirer checks sites non TikTok et ajouter état BTL. |
| `msr/health_ui.py` | 193 lignes / 2 | Health in the main window: a one-line status in the bottom bar (green / amber / red, click for details) and the scheduler that runs msr/health.py on a background thread. Results reach Tk through a queue drained by after(); the worker never touches Tk. Each new | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/history.py` | 298 lignes / 17 | Last-20-versions history for small saved files (channels.json, config.ini). ``snapshot(path)`` is called right before the file is overwritten, so the state you had a moment ago can always be brought back (the Restore previous... dialog). Versions live beside t | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/iometer.py` | 656 lignes / 26 | Whole-disk write and NIC download rates for the Status header meters. Uses ``psutil`` counters (the same optional dependency as process cleanup). The GUI shows machine-wide rates; MSR-only totals belong in the tooltip. Windows reports the one-second counter de | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/kick_realtime.py` | 199 lignes / 12 | Kick realtime negotiation + Centrifugo JSON protocol helpers (no I/O state). Kick retired the hard-coded Pusher app key (error 4001 "App key ... not in this cluster"). Its web client now does, per connection: 1. ``POST https://web.kick.com/api/v1/realtime/conn | Spécifique Kick : candidat retrait après vérification des imports et suppression du push Kick dans recorder. |
| `msr/library.py` | 1035 lignes / 41 | Library statistics: how much is recorded, from which sites and channels, and how it grows. Read-only and fast. A scan only lists folders (``os.scandir``) and reads the file sizes and dates the listing already carries; it never opens a video, never runs ffprobe | Garder index et statistiques bibliothèque ; filtrer catégorie plateforme, vérifier migration. |
| `msr/library_actions.py` | 1026 lignes / 37 | Library actions: delete, move to PendingDeletion, restore, empty folders. No tkinter here. Everything that can remove a file lives in this module so it can be tested with temporary folders and reviewed in one place. The flow is always the same: candidates (Fil | Garder actions fichiers/confirmation/récupération (génériques). |
| `msr/library_browser.py` | 361 lignes / 2 | Library > Recordings: one channel's recordings, newest first, with title search. Pick a channel in the jump box (type to narrow it, Enter or pick from the list) or from the Channels tab ("Recordings" button / menu). The list shows date, length, stream title an | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/library_dialog.py` | 466 lignes / 6 | The review-and-confirm window that stands in front of every deletion in the Library tab. It is the dry run: it lists exactly which files would be touched (untick any), what the action is, how much it frees (or does not), what is refused and why, and for a perm | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/library_manage.py` | 615 lignes / 6 | File management in the Library tab: the PendingDeletion card, the Clean up tab (suggestions plus the tickable file list), and the Manager that every delete button and menu entry goes through. Nothing here removes a file by itself. Every path leads to a review  | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/library_window.py` | 764 lignes / 10 | The Library tab: what is recorded, from which sites and channels, and how it grows. A panel that lives in the main window's notebook (next to Status and Logs), with the Canvas charts from msr/charts.py. The scan runs in a background thread (msr/library.py Scan | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/logbridge.py` | 177 lignes / 5 | Forward worker-process log records to the GUI without writing the file twice. Each recording worker keeps the file and console handlers from ``setup_child_logging`` (one line in ``stream_recorder.log``, same format as before). When the GUI is running it also a | À conserver provisoirement ; vérifier les références lors de l’élagage TikTok-only. |
| `msr/logview.py` | 253 lignes / 9 | Log panel behaviour: follow new lines only while the reader is at the bottom. Auto-scrolling on every line makes it impossible to scroll back (the view is yanked down twice a second). ``LogFollower`` checks whether the view was at the bottom *before* a batch i | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/nowindow.py` | 67 lignes / 4 | Hide console windows for every child process on Windows. Under pythonw there is no console, so each ffmpeg/ffprobe/streamlink/yt-dlp call would open (and close) its own console window. Two layers, both from this stdlib-only module: * ``no_window_kwargs()``: th | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/options_panel.py` | 694 lignes / 8 | The Options tab: Twitch connect plus grouped settings, scrollable. Rows come from ``GROUPS``. Writes go through ``apply_setting(section, key, value)`` (gui.py: ``control.apply_setting``, the same checks and save as ``config_set``, then live apply and sync othe | UI options multi-sites/Tk à remplacer par paramètres BTL ; réutiliser validation/control plutôt que widget. |
| `msr/paths.py` | 41 lignes / 2 | Data-directory resolution: keep runtime files out of the code folder. MSR historically resolved config.ini, channels.json, window_state.json and kick_channel_ids.json relative to the current working directory. To run the code from a git checkout while every ru | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/platforms.py` | 2059 lignes / 26 | Per-site live checks, auth, and ffmpeg/yt-dlp/streamlink command builders. | Garder comme surface commune initiale ; filtrer par branches TikTok et retirer fonctions/branches non TikTok après traçage. |
| `msr/presence.py` | 279 lignes / 11 | Live *presence* for every roster channel, independent of recording. Recording workers only exist for enabled channels, so a disabled channel never counted as live even while its streamer was. Presence is a separate, read-only signal. Its only UI use is the ros | Garder surveillance/états de présence distincts de l’enregistrement ; adapter méthode TikTok et états erreur. |
| `msr/preview_state.py` | 224 lignes / 9 | Tk-free bookkeeping for the live preview strip. The window (``msr/gui.py``) and the grab (``msr/worker.py: create_preview_frame``) stay thin; what needs to be remembered between ticks lives here so it can be tested without a display or ffmpeg: * when each chan | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/recorder.py` | 2338 lignes / 11 | Session orchestrator: worker processes, cleanup, Kick push listener. | Garder orchestration, processus, nettoyage et supervision ; détacher séparément listeners Kick/Twitch. |
| `msr/recordings_index.py` | 347 lignes / 23 | Recordings archive, Tk-free: one channel's recordings with date, length, title and size (from the .meta.json MSR writes; no ffprobe) and the clips cut from each (clip .meta.json, else the Clip Editor's name pattern). Used by Library > Recordings (msr/library_b | Garder index des enregistrements et clips (générique), à connecter à BTL. |
| `msr/restore_dialog.py` | 131 lignes / 3 | The Restore previous... window: pick an earlier saved version of channels.json or config.ini and put it back. Built on msr/dialogs.py (themed, parented, centred). | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/scrollview.py` | 118 lignes / 1 | A vertical scrolling frame, the same arrangement the Options tab uses. One canvas, a ttk scrollbar on the right, and the mouse wheel from ``msr.wheel`` (Windows/macOS ``<MouseWheel>`` and X11 ``<Button-4>`` / ``<Button-5>``). The wheel binding is ``bind_all``  | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/sounds.py` | 95 lignes / 3 | Optional sound effects ([Sounds] in config.ini, all off by default). Windows system sounds via winsound (async, nothing bundled); a no-op elsewhere. Muted while the session is locked when quiet_while_locked is on. Rate-limited per event; a problem key (channel | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/startup_error.py` | 146 lignes / 10 | Make a failed start visible when there is no console (``pythonw`` / ``run_msr.pyw``). A start that dies under pythonw used to leave nothing: no window, no traceback. Now the problem is appended to ``msr_startup_error.log`` (current folder, i.e. the data folder | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/status.py` | 258 lignes / 14 | Read-only status snapshot for `Multi-Stream-Recorder.py --json`. Nothing here writes a file, creates a folder, takes the single-instance lock, opens a window or reads a secret. The snapshot is meant to be pasted into a bug report or read by a script/AI assista | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/storage.py` | 309 lignes / 17 | A recordings drive that goes away while MSR runs (unplugged USB or external disk, a dropped share). Standard library only, no Tk. The pieces: * ``classify`` / ``probe_dir`` / ``quick_check``: is the folder reachable, and if not, why (a short reason with no fil | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/theme_dialog.py` | 229 lignes / 4 | The Theme... window: pick a colour theme, see it applied live, keep it or cancel back. Built on msr/dialogs.py. The preview is drawn from the highlighted theme's own tokens, and the whole app already shows it behind this window (msr/themeui.apply_ttk does the  | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/theme_palettes.py` | 137 lignes / 0 | Published palettes for the Omarchy-inspired themes: data only, no logic. Each entry is the palette as published by the Omarchy theme port named in ``port`` (values copied from its colors.toml, or from its terminal files when it has none), and ``themes.from_pal | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/themes.py` | 562 lignes / 25 | MSR colour themes: one palette of semantic tokens per theme, no tkinter, no colours anywhere else. Every colour the app draws comes from the current Theme (``themes.current()``): ttk styles, Tk widgets, Text tags, charts, dialogs, menus and the Windows title b | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/themeui.py` | 127 lignes / 4 | Apply a Theme to Tk: every ttk style, the combobox pop-down lists and the Windows caption. msr/themes.py holds the colours (no tkinter); this module is the one place that turns them into ttk styles, so the main window, the dialogs and the tests all get the sam | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/timeline_view.py` | 113 lignes / 6 | Clip Editor timeline zoom / pan / wheel mapping, without Tk (mirrors Leapcut's marks bar). | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/tls.py` | 28 lignes / 2 | HTTPS context for MSR's own requests (GitHub update checks and downloads). Python's default context trusts only the roots already in the Windows store. Windows adds missing roots on demand for its own apps, but not for Python, so a site on a newer root (api.gi | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/tooltip.py` | 139 lignes / 5 | The one override-redirect tooltip. The window is created withdrawn, with the theme background already set, so it is not mapped first at Tk's default size and default light background. Omarchy's floating-workspace mode resizes every new non-modal window to abou | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/twitch_connect.py` | 152 lignes / 7 | Tk-free "Connect Twitch" job: device-code flow on a background thread. Events go to a queue the Options tab drains with after(): ("code", uri, user_code, expires_in) / ("connected", login) / ("expired",) / ("error", text) / ("cancelled",). Only one job runs pe | Spécifique OAuth Twitch : candidat retrait après retrait des commandes/UI Twitch. |
| `msr/twitch_eventsub.py` | 467 lignes / 28 | Twitch EventSub over WebSocket: OAuth device flow, token store, Helix calls, message parsing. No threads, no tkinter (the listener is msr/twitch_push.py). Documented flow (dev.twitch.tv/docs/eventsub, /docs/authentication): * The user authorizes MSR's register | Spécifique Twitch EventSub : candidat retrait avec ses tests/config. |
| `msr/twitch_push.py` | 427 lignes / 2 | Twitch go-live push via EventSub WebSocket (opt-in, additive to polling). Mirrors KickPushListener: one socket, a ``stream.online`` notification for a recording channel calls ``recorder.check_now(key)``; presence-only channels just update the presence store. N | Spécifique push Twitch : candidat retrait après retrait du branchement dans recorder. |
| `msr/update.py` | 585 lignes / 31 | Download a GitHub release zipball and stage an in-app update. The running GUI cannot overwrite its own ``msr/`` tree. ``prepare_update`` fills a staging folder; ``spawn_updater`` must be started *after* this process has killed its workers, immediately before ` | Garder les capacités utiles ; rebrand/adapter installation et mises à jour. |
| `msr/util.py` | 2319 lignes / 82 | Shared helpers: paths, cookies, logging, process control, validation. | Garder helpers sûrs (paths, logs, process, validation) ; retirer mappings multi-sites uniquement à la fin. |
| `msr/venv.py` | 635 lignes / 33 | MSR's own virtual environment (.venv inside the MSR folder). Stdlib only: the launchers import this from whatever Python opened them, before any third-party package exists. First launch: create .venv with the launching Python, pip-install requirements.txt into | Garder les capacités utiles ; rebrand/adapter installation et mises à jour. |
| `msr/waveform.py` | 198 lignes / 10 | Optional Clip Editor waveform: loudness per 0.1 s, read by ffmpeg in a background thread. Mirrors Leapcut's sound graph (10 readings/s, one byte each over -72..0 dBFS, drawn as a filled strip on a -60..-12 dB scale), but without numpy: ffmpeg's astats measures | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/wheel.py` | 80 lignes / 5 | Mouse-wheel notches for Windows, macOS and X11. X11 Tk 8.6 sends ``<Button-4>`` (up) and ``<Button-5>`` (down) and leaves ``delta`` at 0. Windows and macOS send ``<MouseWheel>`` with ``delta`` in multiples of 120. Button-4/5 carry the same ``event.state``, so  | UI/UX ou feature commune : conserver la capacité utile, traduire/adapter à l’interface BTL. |
| `msr/winacl.py` | 124 lignes / 3 | Windows: limit a file to the current user (protected DACL, one full-control ACE). Used for msr_control.json (it holds the control token). Fail-soft: returns False and the file keeps its inherited permissions. A no-op elsewhere (POSIX uses chmod 0600). | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/winstate.py` | 139 lignes / 8 | Remember window size and place: the main window (clamped so a changed monitor never leaves it off-screen) and resizable dialogs. Everything lives in window_state.json, which the main window already uses; this module only ever *merges* into it. | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/wintheme.py` | 250 lignes / 12 | Windows title-bar theming shared by the main window and dialogs. Tk can't colour the native caption, so on Windows 10 20H1+/11 we ask DWM for the immersive dark title bar (DWMWA_USE_IMMERSIVE_DARK_MODE = 20; 19 on early Windows 11 builds). Native ``messagebox` | Composant transversal : conserver ou remplacer par équivalent prouvé, pas de suppression aveugle. |
| `msr/worker.py` | 3452 lignes / 41 | Clips, remux, process monitor, and the per-channel recording worker. ``record_worker`` is the multiprocessing target — it must stay a top-level function in this module so Windows ``spawn`` can pickle it. | Garder workers, supervision de capture, remux et sécurité ; élaguer chaque branche site avec tests, jamais supprimer le worker entier. |
| `msr/yt_live_start.py` | 386 lignes / 22 | YouTube "record from the start" (yt-dlp --live-from-start). When a YouTube channel is found live, the first segment of that broadcast is recorded with --live-from-start, so the minutes before MSR noticed are kept (YouTube keeps the DVR window, yt-dlp reads up  | Plateforme exclue candidate retrait. |

## 2. Entrypoints et fichiers runtime à part

| Fichier | Rôle | Décision |
|---|---|---|
| `Multi-Stream-Recorder.py` | Entrée GUI/`--headless`/JSON, bootstrap de config, single-instance et arrêt. Importe `msr.gui` au chargement, même lorsque `--headless` est demandé. | Conserver l’engine en mode headless ou adapter un host BTL ; **contrainte à tester** car le lancement headless importe encore Tkinter. |
| `run_msr.pyw` / `run_msr.bat` | Lancement sans console, préparation du venv dédié et transfert d’arguments. | Réutiliser l’approche de lancement, mais produire un launcher BTL sans terminal. |
| `msr_ctl.py` | Client CLI JSON du protocole local, aussi appelé par le prototype. | Source du contrat client ; pas une interface utilisateur finale. |
| `create_shortcut.py` | Création de raccourcis sur système existant. | Adapter uniquement après choix d’installateur et cycle d’autostart BTL. |
| `requirements.txt` | Dépendances d’exécution multi-plateforme, FFmpeg/ffprobe et notes Deno/Tk. | Construire un manifeste BTL dérivé après matrice ci-dessous ; garder les notices/licences. |
| `LICENSE`, `THIRD_PARTY_NOTICES.md` | Attribution et notices des composants importés. | Garder et compléter/mettre à jour pour toute redistribution. |

## 3. Matrice des dépendances : conserver / retirer sous conditions

| Dépendance/composant | Utilité observée | BTL | Motif / précaution |
|---|---|---|---|
| Python 3 + bibliothèque standard | runtime et outils internes, multiprocessing, sockets, fichiers, HTTP, configuration. | Conserver / empaqueter | Le critère « sans installation manuelle de Python » demande un runtime embarqué/installer à concevoir ; le venv actuel ne livre pas Python. |
| Tkinter | interface MSR, dialogs, code d’entrée ; import de GUI avant sélection du mode headless. | À décider dans l’hôte final | WebView pourrait éviter l’UI Tk, mais l’entrypoint existant l’importe encore ; prototype direct évite cet entrypoint, preuve de faisabilité partielle, pas preuve du launcher Windows. |
| `yt-dlp[default]` + `yt-dlp-ejs` | extraction/détection et fallback TikTok ; commun à YouTube/Rumble. | **Conserver** | Vérification d’ajout TikTok refuse le créateur si la commande `yt-dlp` est absente. Les tests de capture réels restent requis. |
| Streamlink | le worker choisit Streamlink pour enregistrer TikTok ; sert aussi à Kick/Twitch. | **Conserver** | Ne pas supprimer en retirant Kick/Twitch : code worker sélectionne l’outil pour TikTok. |
| FFmpeg + ffprobe | TS→MP4, vérification, clips, audio, preview, metadata. Déclarés hors pip. | **Conserver et empaqueter/installer** | Nécessaires à la finalisation et aux fonctions média ; aucun MP4 réel testé dans cet environnement. FFmpeg doit être accessible au processus. |
| `curl_cffi` | fallback HTTP TikTok dans l’audit de Webcast (et protections d’autres sites). | **Conserver provisoirement** | Facultatif dans requirements mais le chemin TikTok l’utilise si présent ; tester le comportement sans package puis décider si l’option est réellement nécessaire. |
| `psutil` | nettoyage de process, métriques et détection d’orphelins/disk I/O. | Garder provisoirement | Optionnel, mais important fiabilité et performances ; tester les fallbacks sans psutil avant décision. |
| `websocket-client` | listeners temps réel Kick/Twitch, pas de transport TikTok repéré. | Candidat retrait | Peut être supprimé si les implémentations et références Kick/Twitch sont éliminées et si la suite de tests confirme aucune dépendance commune. |
| `pystray` + Pillow | icône système/tray et rendu icône. | Garder ou remplacer par API native Windows | Capacité de fonctionnement arrière-plan souhaitée ; tester notification/tray Windows, pas de réduction proposée. |
| `plyer` | notifications bureau best-effort. | Garder provisoirement ou remplacer par API Windows native | Le besoin notification reste ; évaluer interactions/clics et fiabilité Windows. |
| `colorama` | couleurs console. | Facultatif | La version BTL sans terminal peut l’omettre après retrait de tous les points d’entrée console colorés. |
| Deno | nécessaire selon notes MSR pour fiabilité YouTube, sans lien TikTok identifié. | Candidat retrait | Tracer tout chemin yt-dlp TikTok et le code d’installation avant retrait. |
| PyGObject / pycairo | backend tray AppIndicator Linux uniquement. | Peut sortir du bundle Windows | Ils sont marqués Linux-only dans requirements ; ne pas les confondre avec pystray/Pillow utilisés sous Windows. |
| `multiprocessing`, `subprocess`, sockets, `configparser` | travailleurs indépendants, FFmpeg/Streamlink, ControlServer, réglages. | **Conserver** | Architecture du moteur ; garder contrat contrôlé, arrêt des enfants et permissions locales. |
| Frontend React/TanStack/Vite | affichage et navigation Creator Radar. | Conserver l’expérience, pas le fake store | Le build Vite/Nitro fonctionne ; server files vides. Les dépendances Radix/Tailwind/React sont UI. Auditer les composants réellement importés avant de retirer le surplus. |
| Google Fonts (IBM Plex Sans, Sora, JetBrains Mono) | typographie demandée dans le cahier. | **Conserver les familles, servir localement** | Actuellement téléchargées depuis Google ; BTL doit rester lisible hors ligne et garder l’identité visuelle. Licences/font files à embarquer correctement. |

### Candidats de code exclusivement plateforme (pas encore supprimés)

- **Kick :** `msr/kick_realtime.py`, `KickPushListener` et les appels associés dans `msr/recorder.py`, options de configuration et tests de push/realtime. La logique de processus et d’enregistrement située autour est partagée : découpage chirurgical requis.
- **Twitch :** `msr/twitch_connect.py`, `twitch_eventsub.py`, `twitch_push.py`, settings/token flow et commandes control ; `websocket-client` devient candidat de suppression après recherche globale des imports.
- **YouTube :** `msr/yt_live_start.py`, réglages `YouTube.*` et tests catch-up associés ; yt-dlp lui-même reste requis par TikTok.
- **Rumble/Fishtank :** fonctions dispatchées dans `platforms.py`, `worker.py`, `control.py`, `gui.py`, `config.py`, `health.py`, dépendances/cookies ; pas de modules uniques simples à supprimer. Tracer leurs fonctions et tests par call graph avant retrait.
- **Communs à préserver ou à couvrir par remplacement :** worker/supervisor, ffmpeg/remux, storage/fallback, roster/config/history, control/events, health/process cleanup, library/actions, clips/editor, notifications/tray, logs, icon, launch/update, DPAPI/ACL/redaction. Rien ici ne doit disparaître simplement parce qu’un autre réseau sort du produit.

## 4. Inventaire des 97 fichiers de tests Python (1 553 méthodes `test_*` détectées par AST)

| Test file | Méthodes | Domaine/portée d’après le nom et les imports |
|---|---:|---|
| `tests/test_agent_status.py` | 42 | control/status/events/commands; some tests require headless or Tk bridge |
| `tests/test_app_update.py` | 17 | app update |
| `tests/test_appicon.py` | 11 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_catchup_clip_guard.py` | 5 | clips, media preview and editor |
| `tests/test_channel.py` | 40 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_channel_panel.py` | 23 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_charts.py` | 19 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_chrome_guards.py` | 6 | chrome guards |
| `tests/test_clip_audio.py` | 20 | clips, media preview and editor |
| `tests/test_clip_editor.py` | 38 | clips, media preview and editor |
| `tests/test_clip_editor_zoom.py` | 19 | clips, media preview and editor |
| `tests/test_clip_seek.py` | 35 | clips, media preview and editor |
| `tests/test_config.py` | 18 | configuration, persistence and filesystem layout |
| `tests/test_config_secrets.py` | 7 | configuration, persistence and filesystem layout |
| `tests/test_context_menu.py` | 4 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_control.py` | 35 | control/status/events/commands; some tests require headless or Tk bridge |
| `tests/test_control_archive.py` | 5 | control archive |
| `tests/test_control_events.py` | 5 | control/status/events/commands; some tests require headless or Tk bridge |
| `tests/test_control_exec.py` | 12 | control/status/events/commands; some tests require headless or Tk bridge |
| `tests/test_control_subscribe.py` | 6 | control/status/events/commands; some tests require headless or Tk bridge |
| `tests/test_control_twitch.py` | 5 | control twitch |
| `tests/test_deps_path.py` | 4 | dependencies, venv, updates and packaging guardrails |
| `tests/test_depsupdate.py` | 30 | dependencies, venv, updates and packaging guardrails |
| `tests/test_dialogs.py` | 18 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_fishtank_offseason.py` | 7 | fishtank offseason |
| `tests/test_footage_safety.py` | 44 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_gui_smoke.py` | 9 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_hardening.py` | 13 | security, redaction, tokens and safe writes |
| `tests/test_header_actions.py` | 2 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_health.py` | 27 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_health_checks.py` | 12 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_history.py` | 22 | configuration, persistence and filesystem layout |
| `tests/test_iometer.py` | 43 | iometer |
| `tests/test_kick_realtime.py` | 12 | Kick-only candidate to remove with corresponding code |
| `tests/test_layout_dirs.py` | 7 | configuration, persistence and filesystem layout |
| `tests/test_library.py` | 34 | library, index, file actions and cleanup |
| `tests/test_library_actions.py` | 56 | library, index, file actions and cleanup |
| `tests/test_library_browser.py` | 21 | library, index, file actions and cleanup |
| `tests/test_library_dialog.py` | 16 | library, index, file actions and cleanup |
| `tests/test_library_manage.py` | 27 | library, index, file actions and cleanup |
| `tests/test_library_window.py` | 22 | library, index, file actions and cleanup |
| `tests/test_logfilter.py` | 18 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_logview.py` | 13 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_no_console.py` | 20 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_omarchy_themes.py` | 27 | omarchy themes |
| `tests/test_open_folder.py` | 8 | open folder |
| `tests/test_options_panel.py` | 15 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_options_settings.py` | 13 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_os_guards.py` | 3 | os guards |
| `tests/test_popup_guard.py` | 3 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_presence.py` | 17 | presence |
| `tests/test_preview_grab.py` | 10 | clips, media preview and editor |
| `tests/test_preview_stale.py` | 3 | clips, media preview and editor |
| `tests/test_preview_state.py` | 35 | clips, media preview and editor |
| `tests/test_preview_strip_gui.py` | 1 | clips, media preview and editor |
| `tests/test_push_catchup.py` | 11 | push catchup |
| `tests/test_reconnect.py` | 4 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_release_notes_home.py` | 2 | release notes home |
| `tests/test_requirements_markers.py` | 4 | dependencies, venv, updates and packaging guardrails |
| `tests/test_rumble.py` | 3 | rumble |
| `tests/test_runtime_paths.py` | 8 | configuration, persistence and filesystem layout |
| `tests/test_security.py` | 38 | security, redaction, tokens and safe writes |
| `tests/test_settings_parity.py` | 9 | settings parity |
| `tests/test_small_fixes.py` | 20 | small fixes |
| `tests/test_sounds.py` | 11 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_split_remux.py` | 17 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_startup_cleanup.py` | 29 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_startup_cost.py` | 9 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_startup_safety.py` | 28 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_status.py` | 17 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_storage.py` | 47 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_supervisor.py` | 40 | recording reliability, remux, reconnect, disk or startup recovery |
| `tests/test_theme_dialog.py` | 13 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_theme_guard.py` | 3 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_theme_smoke.py` | 5 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_themes.py` | 21 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_tiktok.py` | 7 | TikTok roomId/API parser fixtures (not a live network or recording test) |
| `tests/test_timing_guards.py` | 5 | timing guards |
| `tests/test_token_security.py` | 11 | security, redaction, tokens and safe writes |
| `tests/test_tooltip.py` | 10 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_tray_linux.py` | 22 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_twitch_push.py` | 16 | Twitch-only candidate to remove with corresponding code |
| `tests/test_twitch_signin_guard.py` | 4 | Twitch-only candidate to remove with corresponding code |
| `tests/test_twitch_token_refresh.py` | 14 | Twitch-only candidate to remove with corresponding code |
| `tests/test_ui_polish.py` | 3 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_update.py` | 14 | dependencies, venv, updates and packaging guardrails |
| `tests/test_update_check_tls.py` | 7 | dependencies, venv, updates and packaging guardrails |
| `tests/test_update_complete.py` | 8 | dependencies, venv, updates and packaging guardrails |
| `tests/test_venv.py` | 21 | dependencies, venv, updates and packaging guardrails |
| `tests/test_venv_progress.py` | 10 | dependencies, venv, updates and packaging guardrails |
| `tests/test_version_sync.py` | 3 | dependencies, venv, updates and packaging guardrails |
| `tests/test_wheel.py` | 7 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_winacl.py` | 4 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_winstate.py` | 21 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_wintheme.py` | 3 | Tk/Windows UI, notifications, themes, layout or launch; some require tkinter/display |
| `tests/test_worker_logs.py` | 8 | worker logs |
| `tests/test_yt_live_start.py` | 32 | YouTube-only live-from-start candidate; do not remove yt-dlp dependency |
### Exécution complète dans l’environnement d’audit

- Commande : `python -m unittest discover -s tests -p 'test_*.py'` sur extraction temporaire de `engine` commit `4e76f3f`.
- Résultat : **1 115 tests exécutés, 1 011 réussis, 58 erreurs, 4 échecs, 42 ignorés**. Les erreurs/échecs dominants viennent de `tkinter` absent ; deux erreurs supplémentaires sont liées à `websocket-client` absent. Les quatre échecs de tests CLI sont la conséquence de l’import GUI/Tk manquant dans le même environnement. Ce n’est pas un verdict Windows et ça ne doit pas être présenté comme 1 115 tests verts.
- Une sélection headless de **95 tests** (TikTok parsers, reconnect, remux helpers, presence, config, health et timing guards) a réussi antérieurement. Le `test_tiktok.py` ne simule que JSON/HTML : il ne fait ni requête live ni capture.
- Tranche d’intégration actuelle : `npx tsc --noEmit` et `npm run build` passent ; Vitest 11/11 dans deux fichiers, dont test de route du toast Windows. Trois exécutions consécutives du host ont chacune passé 39 assertions (117/117), dont configuration persistée, notifications, menu tray et comportements WebView2 fermeture/minimisation/restauration avec doubles de test. Aucun vrai toast, tray ou fenêtre WebView2 Windows, worker d’enregistrement ni appel TikTok n’a été testé.

## 5. Résultats/risques de l’audit complet

1. Le moteur n’est pas « une bibliothèque headless complètement découplée » : il a `HeadlessApp` et un protocole local utiles, mais `Multi-Stream-Recorder.py` importe `msr.gui` (Tkinter) dès le chargement, même pour `--headless`. Le prototype peut démarrer les modules headless directement en ignorant ce point d’entrée ; le lancement normal Windows/Tk et le paquet final doivent être vérifiés. Ce point doit apparaître dans l’architecture, pas être caché.
2. Le protocole `msr.control` utilise un socket JSON-lines sur loopback, token aléatoire et `msr_control.json` protégé ; `subscribe` transporte des événements avec heartbeat et séquence. Le token n’est pas transmis au JavaScript. Vite relaie les URL relatives `/api/*` au host Python sur `127.0.0.1`. Le host HTTP reste un adaptateur de développement : validation/sécurité de production, cycle de vie et packaging restent à faire.
3. Ajout/édition du roster s’appuient sur `yt-dlp` installé comme commande (pas simplement importable), validateur actuel et clés `tiktok:<handle>`. Le moteur ne récupère pas ici avatar/nom TikTok. Les tests du spike ont passé le même chemin ControlServer et roster, mais gardent le compte désactivé pour éviter tout appel TikTok.
4. Aucun plafond de créateurs/enregistrements n’a été trouvé dans le spawn worker par canal. Le front mock impose 4. La limite numérique réellement soutenable doit être mesurée sur Windows ; aucune limitation n’est proposée par cet audit.
5. Les chemins de capture et remux sont robustes dans le code (TS récupérable, MP4 validé, sidecars, fallback disque), mais la qualité audio/vidéo et le nombre de LIVE simultanés restent non prouvés en trafic réel.
6. Le dossier moteur garde des modules pour fonctionnalités communes au-delà du cahier (clips/DVR, screenshot, preview, themes, diagnostic). Ne pas en déduire qu’elles doivent être supprimées ; documenter les décisions de produit avant chaque suppression.

## 6. Limites d’accès et travaux restants avant intégration complète

- L’environnement d’agent ne possède pas `tkinter`, `streamlink`, FFmpeg, un desktop Windows, ni les ressources 6 Go/disque mécanique de l’ordinateur utilisateur. Le test headless a donc volontairement injecté le point d’événement et n’a pas démarré de worker réseau.
- La sortie réseau permise ici ne comprend pas les domaines TikTok ; il est impossible de faire valider live/API TikTok dans ce sandbox. Les tests réels doivent être lancés sur le PC Windows de l’utilisateur avec compte/flux approprié, sans partager cookies/identifiants dans le dépôt ou le chat.
- Avant intégration complète, éprouver cette tranche sur Windows avec le point d’entrée pris en charge et vérifier démarrage/arrêt avec Tk installé ; ensuite versionner le contrat BTL et compléter la suite d’acceptation. Les branches originales restent inchangées ; la branche active `arena/8479bd6c-boitier-tiktok-recorder` est la branche de travail isolée imposée par Arena, sans créer/changer de branche.

## 7. Première tranche d’intégration commencée après autorisation

Les arbres amont sont réunis sous `engine/` et `frontend/` dans la branche Arena. `frontend/src/lib/backend.ts` traduit le contrat de statut/archives moteur en modèles UI ; `app-store.tsx` lit snapshots et SSE. Les actions réellement raccordées sont l’ajout, le renommage (hôte prototype), l’activation/désactivation, le retrait de créateurs, la lecture des enregistrements finis et l’arrêt/démarrage explicite de session. Le frontend retire les données mockées et la limite UI de quatre ; les statuts d’erreur restent distincts du hors-ligne.

Les routes `/api/state`, `/api/recordings`, `/api/creators`, `/api/session`, `/api/recording/stop` et `/api/events` passent par l’adaptateur Python. Les URL d’API sont relatives au navigateur et relayées par Vite vers `127.0.0.1`. Le moteur démarre en pause ; dans l’interface, le démarrage de session constitue l’action explicite qui peut lancer la surveillance réseau et l’enregistrement.

Paramètres, notifications et fenêtre WebView2 sont raccordés dans le prototype ; le sélecteur de dossier, ouverture/suppression sécurisée de fichiers, installateur et runtimes embarqués restent hors de cette tranche. Aucun code plateforme non-TikTok n’a été supprimé. La configuration hôte actuelle est de développement et ne doit pas être distribuée comme API de production.
