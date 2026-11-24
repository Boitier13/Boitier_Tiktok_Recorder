"""Per-user Windows logon startup shortcut for the BTL host."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from btl_branding import brand_asset_path


class StartupUnavailable(RuntimeError):
    """Raised when Windows logon startup cannot be configured."""


def _ps_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def startup_folder() -> Path:
    """Resolve the current user's actual Startup folder, including redirected profiles."""
    if sys.platform == "win32":
        try:
            import ctypes

            buffer = ctypes.create_unicode_buffer(32768)
            if ctypes.windll.shell32.SHGetFolderPathW(None, 0x07, None, 0, buffer) == 0:
                if buffer.value:
                    return Path(buffer.value)
        except Exception:
            pass
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
    return Path.home() / "AppData" / "Roaming" / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


class WindowsStartup:
    """Manage one stable, user-scoped .lnk; no registry or administrator access is used."""

    shortcut_name = "Boitier Tiktok Live.lnk"

    def __init__(self, data_dir: Path, *, platform=None, folder: Path | None = None,
                 script: Path | None = None, pythonw: Path | None = None,
                 icon: Path | None = None, repo_root: Path | None = None,
                 frozen: bool | None = None, executable: Path | None = None,
                 run=subprocess.run):
        self.platform = sys.platform if platform is None else platform
        self.data_dir = Path(data_dir).resolve()
        self.folder = Path(folder) if folder is not None else startup_folder()
        self.frozen = bool(getattr(sys, "frozen", False)) if frozen is None else frozen
        self.executable = Path(executable) if executable is not None else Path(sys.executable)
        self.repo_root = Path(repo_root) if repo_root is not None else Path(__file__).resolve().parent.parent
        self.script = Path(script) if script is not None else self.repo_root / "prototype" / "btl_vertical_host.py"
        self.pythonw = Path(pythonw) if pythonw is not None else self.executable.with_name("pythonw.exe")
        self.icon = Path(icon) if icon is not None else brand_asset_path("btl-logo-compact.ico")
        self.run = run

    @property
    def shortcut(self) -> Path:
        return self.folder / self.shortcut_name

    def status(self) -> dict:
        return {"supported": self.platform == "win32",
                "enabled": self.platform == "win32" and self.shortcut.is_file()}

    def set_enabled(self, enabled: bool) -> dict:
        if self.platform != "win32":
            raise StartupUnavailable("Le démarrage automatique BTL est disponible uniquement sous Windows.")
        if not isinstance(enabled, bool):
            raise ValueError("Le champ enabled doit être booléen.")
        if not enabled:
            try:
                self.shortcut.unlink(missing_ok=True)
            except OSError as exc:
                raise StartupUnavailable(f"Impossible de retirer le raccourci de démarrage : {exc}") from exc
            return self.status()

        if self.frozen:
            if not self.executable.is_file():
                raise StartupUnavailable(f"Exécutable BTL introuvable : {self.executable}")
            target = self.executable
            arguments = subprocess.list2cmdline([
                "--data-dir", str(self.data_dir), "--no-desktop",
            ])
            working_dir = self.executable.parent
        else:
            if not self.pythonw.is_file():
                raise StartupUnavailable(f"pythonw.exe est introuvable : {self.pythonw}")
            target = self.pythonw
            arguments = subprocess.list2cmdline([
                str(self.script), "--data-dir", str(self.data_dir), "--no-desktop",
            ])
            working_dir = self.repo_root
        self.folder.mkdir(parents=True, exist_ok=True)
        script = (
            "$s = (New-Object -ComObject WScript.Shell).CreateShortcut(" + _ps_quote(str(self.shortcut)) + "); "
            f"$s.TargetPath = {_ps_quote(str(target))}; "
            f"$s.Arguments = {_ps_quote(arguments)}; "
            f"$s.WorkingDirectory = {_ps_quote(str(working_dir))}; "
            f"$s.IconLocation = {_ps_quote(str(self.icon) + ',0')}; "
            "$s.Description = 'Start Boitier Tiktok Live at Windows sign-in'; $s.Save()"
        )
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        try:
            result = self.run(
                ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                capture_output=True, text=True, errors="replace", timeout=20,
                creationflags=flags,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise StartupUnavailable(f"Impossible de créer le raccourci de démarrage : {exc}") from exc
        if result.returncode != 0:
            detail = (getattr(result, "stderr", "") or "PowerShell a refusé la création du raccourci.").strip()
            raise StartupUnavailable(detail[:400])
        if not self.shortcut.is_file():
            raise StartupUnavailable("PowerShell n’a pas créé le raccourci de démarrage attendu.")
        return self.status()
