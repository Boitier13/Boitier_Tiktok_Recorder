"""Windows notification-area controller for the BTL local host."""
from __future__ import annotations

import sys
import threading
import webbrowser

from btl_branding import brand_asset_path


class TrayUnavailable(RuntimeError):
    """Raised when the Windows tray integration cannot be initialized."""


class WindowsTray:
    def __init__(self, prototype, ui_url: str, shutdown, *, window=None, platform=None,
                 pystray_module=None, image_module=None, draw_module=None, open_url=None):
        self.prototype = prototype
        self.ui_url = ui_url
        self.shutdown_callback = shutdown
        self.window = window
        self.platform = sys.platform if platform is None else platform
        self.pystray = pystray_module
        self.image_module = image_module
        self.draw_module = draw_module
        self.open_url = open_url or webbrowser.open
        self.icon = None
        self.thread = None
        self._notification_lock = threading.Lock()

    def _load_dependencies(self):
        if self.pystray is None:
            try:
                import pystray
                self.pystray = pystray
            except ImportError as exc:
                raise TrayUnavailable("pystray est absent; installez les dépendances Windows du moteur.") from exc
        if self.image_module is None or self.draw_module is None:
            try:
                from PIL import Image, ImageDraw
                self.image_module = self.image_module or Image
                self.draw_module = self.draw_module or ImageDraw
            except ImportError as exc:
                raise TrayUnavailable("Pillow est absent; installez les dépendances Windows du moteur.") from exc

    def _make_icon(self):
        asset = brand_asset_path("btl-windows.png")
        opener = getattr(self.image_module, "open", None)
        if asset.is_file() and callable(opener):
            try:
                image = opener(str(asset)).convert("RGBA")
                resampling = getattr(self.image_module, "Resampling", None)
                lanczos = getattr(resampling, "LANCZOS", 1)
                return image.resize((64, 64), lanczos)
            except Exception:
                pass

        # Fallback keeps tray startup resilient if a source/development asset is missing.
        image = self.image_module.new("RGBA", (64, 64), (16, 20, 26, 255))
        draw = self.draw_module.Draw(image)
        draw.ellipse((7, 7, 57, 57), outline=(48, 205, 196, 255), width=3)
        draw.ellipse((18, 18, 46, 46), outline=(48, 205, 196, 210), width=2)
        draw.line((32, 32, 49, 16), fill=(245, 201, 106, 255), width=3)
        draw.ellipse((27, 27, 37, 37), fill=(255, 92, 103, 255))
        return image

    def start(self):
        if self.platform != "win32":
            raise TrayUnavailable("La zone de notification BTL nécessite Windows.")
        self._load_dependencies()
        menu = self.pystray.Menu(
            self.pystray.MenuItem("Ouvrir Boitier Tiktok Live", self._open, default=True),
            self.pystray.MenuItem(self._monitoring_label, self._toggle_monitoring),
            self.pystray.Menu.SEPARATOR,
            self.pystray.MenuItem("Quitter Boitier Tiktok Live", self._quit),
        )
        self.icon = self.pystray.Icon(
            "Boitier Tiktok Live", self._make_icon(), "Boitier Tiktok Live — moteur actif", menu
        )
        self.thread = threading.Thread(target=self.icon.run, daemon=True, name="btl-windows-tray")
        self.thread.start()
        return True

    def notify(self, title: str, message: str) -> bool:
        """Show a balloon on BTL's existing tray icon instead of registering a new icon.

        Plyer's Windows backend creates a distinct Shell_NotifyIcon entry per call;
        the packaged 2.1.0 implementation retains each entry until process exit.
        pystray updates the one long-lived BTL icon (NIM_MODIFY), so notifications
        cannot fill the hidden-icons list.
        """
        icon = self.icon
        if (icon is None or not getattr(icon, "visible", False)
                or self.thread is None or not self.thread.is_alive()):
            raise TrayUnavailable("L’icône BTL de la zone de notification n’est pas prête.")
        notify = getattr(icon, "notify", None)
        if not callable(notify):
            raise TrayUnavailable("Les notifications ne sont pas prises en charge par l’icône BTL.")
        with self._notification_lock:
            notify(message, title)
        return True

    def _open(self, _icon=None, _item=None):
        if self.window is not None:
            show = getattr(self.window, "show", None)
            if callable(show):
                # The desktop shell's show() also restores the native window.
                show()
            else:
                restore = getattr(self.window, "restore", None)
                if callable(restore):
                    restore()
                self.window.show()
        else:
            self.open_url(self.ui_url)

    def _monitoring_label(self, _item=None):
        paused = bool(getattr(self.prototype.app, "paused", True))
        return "Démarrer la surveillance" if paused else "Arrêter la surveillance"

    def _toggle_monitoring(self, _icon=None, _item=None):
        paused = bool(getattr(self.prototype.app, "paused", True))
        self.prototype.command("start" if paused else "stop")
        if self.icon is not None:
            self.icon.update_menu()

    def _quit(self, _icon=None, _item=None):
        # Do not block pystray's event callback while the HTTP server and engine stop.
        if self.icon is not None:
            try:
                self.icon.stop()
            except Exception:
                pass
        if self.window is not None:
            try:
                self.window.destroy()
            except Exception:
                pass
        threading.Thread(target=self.shutdown_callback, daemon=True, name="btl-tray-shutdown").start()

    def stop(self):
        if self.icon is not None:
            try:
                self.icon.stop()
            except Exception:
                pass
        if self.thread is not None and self.thread is not threading.current_thread():
            self.thread.join(timeout=2)
