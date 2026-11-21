"""Windows WebView2 shell and development frontend server for the BTL prototype."""
from __future__ import annotations

import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


class DesktopUnavailable(RuntimeError):
    """Raised when the native Windows UI cannot be launched."""


WEBVIEW2_INSTALL_URL = "https://developer.microsoft.com/microsoft-edge/webview2/"
WEBVIEW2_CLIENTS_KEY = r"SOFTWARE\Microsoft\EdgeUpdate\Clients"


def webview2_runtime_version(platform=None, winreg_module=None):
    """Return the installed Evergreen WebView2 Runtime version, or None.

    Edge Update may register the runtime for the current user or the machine and
    in either registry view. Enumerate client names rather than hard-coding an
    updater GUID; Edge itself is not mistaken for the WebView2 Runtime.
    ``winreg_module`` is injectable so the registry decision is testable off Windows.
    """
    platform = sys.platform if platform is None else platform
    if platform != "win32":
        return None
    if winreg_module is None:
        try:
            import winreg as winreg_module
        except ImportError:
            return None

    access = getattr(winreg_module, "KEY_READ", 0x20019)
    views = (0, getattr(winreg_module, "KEY_WOW64_32KEY", 0),
             getattr(winreg_module, "KEY_WOW64_64KEY", 0))
    roots = (getattr(winreg_module, "HKEY_CURRENT_USER", None),
             getattr(winreg_module, "HKEY_LOCAL_MACHINE", None))
    for root in roots:
        if root is None:
            continue
        for view in dict.fromkeys(views):
            try:
                clients = winreg_module.OpenKey(root, WEBVIEW2_CLIENTS_KEY, 0, access | view)
            except OSError:
                continue
            try:
                index = 0
                while True:
                    try:
                        client_id = winreg_module.EnumKey(clients, index)
                    except OSError:
                        break
                    index += 1
                    try:
                        client = winreg_module.OpenKey(clients, client_id, 0, access | view)
                        name = str(winreg_module.QueryValueEx(client, "name")[0])
                        version = str(winreg_module.QueryValueEx(client, "pv")[0])
                    except OSError:
                        continue
                    if "webview2 runtime" not in name.casefold():
                        continue
                    if re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,3}", version) and version != "0.0.0.0":
                        return version
            finally:
                try:
                    winreg_module.CloseKey(clients)
                except OSError:
                    pass
    return None


def show_windows_message(message, *, title="Boitier Tiktok Live", platform=None):
    """Show a user-visible native notice when a console-less Windows build cannot continue."""
    platform = sys.platform if platform is None else platform
    if platform != "win32":
        return False
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, str(message), str(title), 0x00000010 | 0x00040000)
        return True
    except Exception:
        return False


class FrontendDevServer:
    """Launch the repository's React/Vite frontend and proxy it to the local Python host."""

    def __init__(self, repo_root: Path, *, node=None, popen=subprocess.Popen):
        self.repo_root = Path(repo_root)
        self.frontend_dir = self.repo_root / "frontend"
        self.node = node or shutil.which("node")
        self._popen = popen
        self.process = None
        self.url = None
        self._owns_server = False

    @staticmethod
    def _free_port():
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    def start(self, api_port: int, *, log_stream=None, timeout=45):
        if not self.node:
            raise DesktopUnavailable("Node.js est requis pour servir l’interface React locale.")
        vite = self.frontend_dir / "node_modules" / "vite" / "bin" / "vite.js"
        if not vite.is_file():
            raise DesktopUnavailable(
                "Dépendances frontend absentes. Exécutez `npm install` dans le dossier frontend."
            )
        port = self._free_port()
        self.url = f"http://127.0.0.1:{port}/"
        env = os.environ.copy()
        env["BTL_API_TARGET"] = f"http://127.0.0.1:{int(api_port)}"
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) if os.name == "nt" else 0
        output = log_stream if log_stream is not None else subprocess.DEVNULL
        try:
            self.process = self._popen(
                [self.node, str(vite), "dev", "--host", "127.0.0.1", "--port", str(port), "--strictPort"],
                cwd=str(self.frontend_dir),
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.STDOUT,
                creationflags=creationflags,
            )
        except OSError as exc:
            raise DesktopUnavailable(f"Impossible de démarrer Vite : {exc}") from exc
        self._owns_server = True

        deadline = time.monotonic() + timeout
        last_error = None
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise DesktopUnavailable("Le serveur frontend s’est arrêté pendant son démarrage.")
            try:
                with urllib.request.urlopen(self.url, timeout=1) as response:
                    if response.status < 500:
                        return self.url
            except (OSError, urllib.error.URLError) as exc:
                last_error = exc
            time.sleep(0.2)
        self.stop()
        raise DesktopUnavailable(f"Le serveur frontend n’a pas répondu à temps : {last_error}")

    def stop(self):
        process = self.process
        self.process = None
        if process is None or not self._owns_server:
            return
        self._owns_server = False
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)


class WindowsDesktopShell:
    """Native titlebar/window hosting the actual React app through Microsoft Edge WebView2."""

    def __init__(self, ui_url: str, *, webview_module=None, platform=None,
                 runtime_probe=webview2_runtime_version):
        self.ui_url = ui_url
        self.platform = sys.platform if platform is None else platform
        self.webview = webview_module
        self.runtime_probe = runtime_probe
        self.window = None
        self.tray = None
        self._allow_close = False

    def prepare(self):
        if self.platform != "win32":
            raise DesktopUnavailable("La fenêtre WebView2 BTL est réservée à Windows.")
        if self.webview is None:
            runtime_version = self.runtime_probe(platform=self.platform)
            if not runtime_version:
                raise DesktopUnavailable(
                    "Le runtime Microsoft Edge WebView2 Evergreen est absent. "
                    f"Installez-le depuis {WEBVIEW2_INSTALL_URL}, puis relancez BTL. "
                    "L’interface reste accessible dans le navigateur pendant ce temps."
                )
            try:
                import webview
                self.webview = webview
            except ImportError as exc:
                raise DesktopUnavailable(
                    "Le composant pywebview est absent du paquet BTL. Réextrayez l’archive complète "
                    "ou reconstruisez-la avec le lock de packaging/windows."
                ) from exc
        try:
            self.window = self.webview.create_window(
                "Boitier Tiktok Live",
                self.ui_url,
                width=1360,
                height=900,
                min_size=(980, 640),
                resizable=True,
                text_select=True,
            )
            self.window.events.closing += self._on_closing
            self.window.events.minimized += self._on_minimized
        except Exception as exc:
            raise DesktopUnavailable(
                "WebView2 est détecté mais la fenêtre native n’a pas pu être créée. "
                "Réparez le runtime Evergreen, vérifiez les politiques Edge/WebView2 de Windows, "
                f"puis relancez BTL. Détail : {exc}"
            ) from exc
        return self

    def attach_tray(self, tray):
        self.tray = tray

    def _has_tray(self):
        return self.tray is not None and self.tray.icon is not None

    def _on_closing(self):
        if self._allow_close:
            return None
        if self._has_tray():
            self.window.hide()
            # pywebview cancels the native close when a handler returns False.
            return False
        return None

    def _on_minimized(self):
        if self._has_tray():
            self.window.hide()

    def show(self):
        if self.window is not None:
            self.window.restore()
            self.window.show()

    def destroy(self):
        if self.window is not None:
            # Programmatic shutdown (including the tray's Quit command) must bypass
            # the user-close-to-hide behavior or WebView2 can remain alive invisibly.
            self._allow_close = True
            try:
                self.window.destroy()
            except Exception:
                pass

    def run(self):
        if self.window is None:
            raise DesktopUnavailable("La fenêtre WebView2 n’a pas été préparée.")
        try:
            self.webview.start(gui="edgechromium", debug=False)
        except Exception as exc:
            raise DesktopUnavailable(
                "WebView2 n’a pas pu démarrer. Installez/réparez le runtime Microsoft Edge WebView2 Evergreen "
                f"({WEBVIEW2_INSTALL_URL}) et relancez BTL. Détail : {exc}"
            ) from exc
