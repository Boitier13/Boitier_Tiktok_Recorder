"""BTL local host for the integrated MSR engine and the vertical smoke test.

The canonical engine source is ../engine, imported without editing upstream modules.
The demo UI and --smoke path remain safe: the engine starts paused and test-created
channels are disabled unless a caller explicitly enables them. Synthetic events are
transport tests only, never evidence of TikTok detection.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import logging
import mimetypes
import multiprocessing
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

if getattr(sys, "frozen", False):
    REPO_ROOT = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent)).resolve()
    ROOT = REPO_ROOT / "prototype"
else:
    ROOT = Path(__file__).resolve().parent
    REPO_ROOT = ROOT.parent
ENGINE = REPO_ROOT / "engine"
UI = ROOT / "ui" / "index.html"
if getattr(sys, "frozen", False):
    # The BTL onedir build stages ffmpeg.exe/ffprobe.exe beside the app.
    # Keep the shared MSR engine unchanged; expose the packaged tools at the host boundary.
    BUNDLED_TOOLS = Path(sys.executable).resolve().parent / "tools"
    if BUNDLED_TOOLS.is_dir():
        os.environ["PATH"] = str(BUNDLED_TOOLS) + os.pathsep + os.environ.get("PATH", "")
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ENGINE))

from msr.config import Config  # noqa: E402
from msr.control import HeadlessApp, Service, call, subscribe  # noqa: E402
from msr.recorder import StreamRecorder  # noqa: E402
from windows_notifications import (  # noqa: E402
    WindowsNotificationsUnavailable,
    notification_content,
    send_windows_notification,
)
from windows_tray import TrayUnavailable, WindowsTray  # noqa: E402
from windows_desktop import (  # noqa: E402
    DesktopUnavailable,
    FrontendDevServer,
    WindowsDesktopShell,
    show_windows_message,
    webview2_runtime_version,
)
from windows_startup import StartupUnavailable, WindowsStartup  # noqa: E402


def windows_startup_manager(data_dir):
    return WindowsStartup(
        data_dir,
        repo_root=REPO_ROOT,
        frozen=bool(getattr(sys, "frozen", False)),
        executable=Path(sys.executable),
    )


def _capture_tool_version(command, args, *, timeout=30, runner=None):
    """Probe one packaged console launcher with enough time for onefile cold-start extraction."""
    from msr.nowindow import no_window_kwargs

    if runner is None:
        runner = subprocess.run
    try:
        result = runner(
            [command, *args], capture_output=True, text=True, timeout=timeout,
            **no_window_kwargs(),
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None


def capture_tools_status():
    """Probe required tools; allow bundled onefile Python launchers a slower cold start."""
    from msr import deps
    from msr.util import ffprobe_from_ffmpeg

    # yt-dlp and Streamlink are self-extracting PyInstaller onefile executables. On
    # Windows 10, antivirus scanning can make each first launch exceed the engine's
    # generic five-second probe timeout. Probe both concurrently with a 30-second cap.
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="btl-tool-check") as pool:
        yt_dlp_future = pool.submit(_capture_tool_version, "yt-dlp", ["--version"])
        streamlink_future = pool.submit(_capture_tool_version, "streamlink", ["--version"])
        yt_dlp_version = yt_dlp_future.result()
        streamlink_version = streamlink_future.result()

    if streamlink_version and streamlink_version.lower().startswith("streamlink "):
        streamlink_version = streamlink_version[len("streamlink "):].strip()
    return {
        "yt-dlp": yt_dlp_version,
        "streamlink": streamlink_version,
        "ffmpeg": deps.check_ffmpeg("ffmpeg"),
        "ffprobe": "available" if deps.check_ffprobe(ffprobe_from_ffmpeg("ffmpeg")) else None,
    }


def missing_capture_tool_message(status, *, frozen=False):
    missing = [name for name, version in status.items() if not version]
    if not missing:
        return ""
    missing_lines = "\n".join(f"• {name} : introuvable ou ne démarre pas" for name in missing)
    if frozen:
        remedy = (
            "Extrayez de nouveau le dossier complet du ZIP BTL (ne copiez pas uniquement l’EXE). "
            "Les exécutables requis doivent rester dans le sous-dossier tools."
        )
    else:
        remedy = (
            "En mode source, installez les dépendances Python depuis le lock Windows de packaging, "
            "placez ffmpeg.exe et ffprobe.exe dans un même dossier, puis ajoutez ce dossier et les "
            "commandes yt-dlp.exe / streamlink.exe au PATH avant de relancer."
        )
    return (
        "BTL ne peut pas démarrer l’enregistrement : un ou plusieurs outils requis sont absents.\n\n"
        f"{missing_lines}\n\n{remedy}"
    )


def is_tiktok_channel(channel):
    value = str(channel or "").strip()
    platform, separator, username = value.partition(":")
    return bool(separator and username.strip()) and platform.strip().lower() == "tiktok"


def require_tiktok_channel(channel):
    value = str(channel or "").strip()
    if not is_tiktok_channel(value):
        raise ValueError("BTL ne prend en charge que les créateurs TikTok.")
    return value


def is_tiktok_row(row, inherited_channel=""):
    platform = str(row.get("platform", "")).strip().lower()
    return platform == "tiktok" or is_tiktok_channel(
        row.get("channel") or row.get("name") or inherited_channel
    )


def tiktok_only_payload(payload, hidden_count=0, inherited_channel=""):
    """Filter platform rows at the BTL boundary; leave the shared MSR model untouched."""
    if isinstance(payload, list):
        return [tiktok_only_payload(row, hidden_count, inherited_channel) for row in payload]
    if not isinstance(payload, dict):
        return payload
    own_channel = payload.get("channel") or inherited_channel
    result = {}
    for key, value in payload.items():
        if key in ("channels", "finished", "cleanup_queue", "recordings", "by_platform") and isinstance(value, list):
            result[key] = [tiktok_only_payload(row, hidden_count, own_channel) for row in value
                           if isinstance(row, dict) and is_tiktok_row(row, own_channel)]
        else:
            result[key] = tiktok_only_payload(value, hidden_count, own_channel)
    health = result.get("health")
    if isinstance(health, dict):
        health = dict(health)
        health.pop("fishtank", None)
        tools = health.get("tools")
        if isinstance(tools, dict):
            tools = dict(tools)
            for name in ("streamlink", "curl_cffi", "websocket-client", "deno"):
                tools.pop(name, None)
            health["tools"] = tools
        if hidden_count:
            health["problems"] = list(health.get("problems") or []) + [
                f"{hidden_count} chaîne(s) d’autres plateformes conservée(s) désactivée(s) et masquée(s) dans BTL."
            ]
        result["health"] = health
    return result


def tiktok_only_status(state, hidden_count=0):
    return tiktok_only_payload(state, hidden_count)


class Prototype:
    def __init__(self, data_dir: Path, *, enable_windows_notifications=True):
        self.data_dir = data_dir.resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        streams = self.data_dir / "recordings"
        streams.mkdir(parents=True, exist_ok=True)
        self.config = Config(str(self.data_dir / "config.ini"))
        self.config.config.set("Paths", "streams_dir", str(streams))
        self.config.config.set("Paths", "fallback_dir", "")
        self.config.config.set("Paths", "cookies_file", "")
        self.config.config.set("Advanced", "use_venv", "false")
        if not self.config.config.has_section("Control"):
            self.config.config.add_section("Control")
        self.config.config.set("Control", "enabled", "true")
        self.config.config.set("Control", "status_interval_seconds", "0.5")
        if not self.config.save():
            raise RuntimeError("Impossible d'écrire la configuration de test")

        self.app = None
        self.service = None
        self.engine_thread = None
        self._stop_lock = threading.Lock()
        self._stopped = False
        self._enable_windows_notifications = enable_windows_notifications
        self._notification_sender = send_windows_notification
        self._notification_stop = threading.Event()
        self._notification_thread = None
        self._notification_error_logged = False
        self.unsupported_channels = []

    def start(self):
        # Start the actual engine's supported headless adapter and local control service.
        # paused=True is deliberate: enabled roster mutations cannot create network workers.
        app = HeadlessApp(
            self.config,
            lambda keys: StreamRecorder(
                keys, self.config, presence=app.presence, watch_channels=app.disabled_keys()
            ),
        )
        self.app = app
        app.paused = True
        # Preserve unsupported rows in the shared engine config but disable them so
        # opening BTL cannot start other-platform recording or presence workers.
        roster = app.records()
        self.unsupported_channels = sorted(
            row.get("name", "") for row in roster
            if not is_tiktok_channel(row.get("name"))
        )
        if self.unsupported_channels:
            hidden = set(self.unsupported_channels)
            app.roster.mutate(lambda rows: [
                row.update(enabled=False) for row in rows if row.get("name") in hidden
            ])
        # BTL manages TikTok only; the shared MSR presence poller would otherwise
        # probe disabled Kick/Twitch rows retained for compatibility.
        app.start_presence = lambda: None

        self.service = Service.start_for(app)
        if self.service is None or self.service.server is None:
            raise RuntimeError("Le service de contrôle local du moteur n'a pas démarré")
        self.engine_thread = threading.Thread(
            target=app.run, kwargs={"start_now": False}, daemon=True, name="btl-engine-headless"
        )
        self.engine_thread.start()
        self._wait_for_control()
        if self._enable_windows_notifications and sys.platform == "win32":
            self._notification_thread = threading.Thread(
                target=self._watch_engine_notifications,
                daemon=True,
                name="btl-windows-notifications",
            )
            self._notification_thread.start()
        return self

    def _wait_for_control(self):
        deadline = time.monotonic() + 5
        last = None
        while time.monotonic() < deadline:
            try:
                result = call(str(self.data_dir), "ping", timeout=2)
                if result.get("ok") and result["result"].get("mode") == "headless":
                    return
                last = result
            except Exception as exc:  # server thread may not have accepted yet
                last = exc
            time.sleep(0.05)
        raise RuntimeError(f"Moteur non joignable après démarrage : {last}")

    def _dispatch_windows_notification(self, event):
        if not isinstance(event, dict) or event.get("synthetic") is True:
            return False
        channel = event.get("channel")
        if channel and not is_tiktok_channel(channel):
            return False
        try:
            if not self.config.getboolean("GUI", "notifications", fallback=True):
                return False
        except Exception:
            return False
        content = notification_content(event)
        if content is None:
            return False
        try:
            self._notification_sender(*content)
            return True
        except Exception as exc:
            if not self._notification_error_logged:
                logging.warning("Notifications Windows BTL indisponibles : %s", exc)
                self._notification_error_logged = True
            return False

    def send_test_notification(self):
        if not self.config.getboolean("GUI", "notifications", fallback=True):
            raise ValueError("Les notifications sont désactivées dans les paramètres BTL.")
        return self._notification_sender(
            "Notification de test BTL", "Les notifications Windows sont opérationnelles."
        )

    def _watch_engine_notifications(self):
        after = 0
        try:
            after = int(self.command("events", {"after": 0}).get("seq", 0))
        except Exception:
            pass
        wanted = ["live", "offline", "ended", "finished", "error", "disk_low"]
        while not self._notification_stop.is_set():
            try:
                stream = subscribe(
                    str(self.data_dir),
                    {"events": wanted, "after": after, "heartbeat": 5, "max_seconds": 60},
                    idle_timeout=15,
                )
                ack = next(stream)
                if not ack.get("ok"):
                    raise RuntimeError(ack.get("error", "Abonnement moteur refusé"))
                for item in stream:
                    if self._notification_stop.is_set():
                        break
                    if item.get("type") == "event":
                        event = item.get("event", {})
                        after = max(after, int(event.get("seq", after) or after))
                        self._dispatch_windows_notification(event)
                    elif item.get("type") == "heartbeat":
                        after = max(after, int(item.get("seq", after) or after))
            except Exception as exc:
                if not self._notification_stop.is_set() and not self._notification_error_logged:
                    logging.warning("Abonnement aux notifications moteur interrompu : %s", exc)
                    self._notification_error_logged = True
                self._notification_stop.wait(2)

    def command(self, name, args=None):
        reply = call(str(self.data_dir), name, args or {}, timeout=10)
        if not reply.get("ok"):
            raise ValueError(f"{reply.get('code')}: {reply.get('error')}")
        return reply.get("result")

    def shutdown(self):
        with self._stop_lock:
            if self._stopped:
                return
            self._stopped = True
        self._notification_stop.set()
        try:
            if self._notification_thread and self._notification_thread.is_alive():
                self._notification_thread.join(timeout=2)
            if self.app is not None and self.engine_thread and self.engine_thread.is_alive():
                try:
                    call(str(self.data_dir), "quit", timeout=5)
                except Exception:
                    self.app.request_quit()
                self.engine_thread.join(timeout=5)
            if self.service is not None:
                self.service.stop()
            if self.engine_thread and self.engine_thread.is_alive():
                self.app.request_quit()
                self.engine_thread.join(timeout=2)
            poller = getattr(self.app, "_poller", None) if self.app is not None else None
            if poller is not None:
                poller.stop()
                thread = getattr(poller, "_thread", None)
                if thread is not None and thread is not threading.current_thread():
                    thread.join(timeout=2)
        finally:
            pass


class LocalUI(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, prototype: Prototype, host="127.0.0.1", port=0, frontend_dir=None):
        self.prototype = prototype
        self.frontend_dir = Path(frontend_dir).resolve() if frontend_dir else None
        super().__init__((host, port), UIHandler)


def create_local_ui(prototype, port, frontend_dir=None, *, platform=None, notify=None):
    """Bind the local API or explain a duplicate/occupied-port launch and stop cleanly."""
    platform = sys.platform if platform is None else platform
    try:
        return LocalUI(prototype, port=port, frontend_dir=frontend_dir)
    except OSError as exc:
        message = (
            f"BTL ne peut pas démarrer son serveur local sur le port {port}. "
            "Une autre instance BTL ou une autre application utilise peut-être ce port. "
            "Quittez l’instance précédente depuis son icône de barre système, ou choisissez "
            f"un autre port. Détail : {exc}"
        )
        try:
            prototype.shutdown()
        except Exception:
            logging.warning("Arrêt du moteur après échec de liaison impossible", exc_info=True)
        if platform == "win32":
            if notify is not None:
                notify(message)
            else:
                show_windows_message(message, title="Boitier Tiktok Live déjà ouvert")
        else:
            logging.error(message)
        raise SystemExit(2) from exc


class UIHandler(BaseHTTPRequestHandler):
    server: LocalUI
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        # Keep the prototype's local console concise; pythonw has no stdout stream.
        if sys.stdout is not None:
            print("[BTL UI] " + (fmt % args))

    @property
    def prototype(self):
        return self.server.prototype

    def _send_json(self, value, status=200):
        value = tiktok_only_payload(
            value, len(getattr(self.prototype, "unsupported_channels", []))
        )
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _serve_frontend_file(self, target: Path, *, immutable=False):
        try:
            size = target.stat().st_size
            content_type, _encoding = mimetypes.guess_type(str(target))
            content_type = content_type or "application/octet-stream"
            if content_type.startswith("text/") or content_type in (
                "application/javascript", "application/json", "image/svg+xml",
            ):
                content_type += "; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(size))
            self.send_header(
                "Cache-Control",
                "public, max-age=31536000, immutable" if immutable else "no-cache",
            )
            self.end_headers()
            with target.open("rb") as source:
                while chunk := source.read(128 * 1024):
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            return
        except OSError as exc:
            self._send_json({"error": f"Ressource frontend indisponible : {exc}"}, 503)

    def _serve_frontend(self):
        root = self.server.frontend_dir
        shell = root / "_shell.html" if root is not None else None
        if shell is None or not shell.is_file():
            return self._send_json({"error": "Build frontend de production absent."}, 503)
        requested = unquote(urlparse(self.path).path).replace("\\", "/")
        parts = [part for part in requested.split("/") if part]
        if any(part in (".", "..") or part.startswith(".") for part in parts):
            return self._send_json({"error": "Chemin frontend invalide."}, 404)
        if not parts:
            return self._serve_frontend_file(shell)
        candidate = (root / Path(*parts)).resolve()
        try:
            inside = os.path.commonpath((str(root), str(candidate))) == str(root)
        except ValueError:
            inside = False
        if not inside or parts == ["_headers"]:
            return self._send_json({"error": "Introuvable"}, 404)
        if candidate.is_file():
            return self._serve_frontend_file(candidate, immutable=parts[0] == "assets")
        # Missing hashed assets should be a real 404, not the SPA shell.
        if parts[0] == "assets" or "." in parts[-1]:
            return self._send_json({"error": "Ressource frontend introuvable."}, 404)
        # Client-side routes such as /createurs must resolve to the prerendered TanStack shell.
        return self._serve_frontend_file(shell)

    def _body(self):
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 65536)
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            raise ValueError("Corps JSON invalide") from None

    def _read_engine_settings(self):
        raw = {}
        for section in ("GUI", "Paths", "Recording", "Timeouts"):
            reply = self.prototype.command("config_get", {"section": section})
            raw[section] = reply.get("settings", {}).get(section, {})

        def number(section, key, default):
            try:
                return float(raw.get(section, {}).get(key, default))
            except (TypeError, ValueError):
                return float(default)

        def boolean(section, key, default=False):
            value = str(raw.get(section, {}).get(key, str(default))).lower()
            return value in ("1", "true", "yes", "on")

        minutes = number("Timeouts", "poll_interval_minutes", 3)
        return {
            "notificationsEnabled": boolean("GUI", "notifications", True),
            "saveFolder": str(raw.get("Paths", {}).get("streams_dir", "")),
            "checkIntervalSec": round(minutes * 60),
            "quality": str(raw.get("Recording", {}).get("quality", "best")),
            "filenamePattern": str(raw.get("Recording", {}).get("filename_pattern", "{username}_{timestamp}")),
            "splitOnResolutionChange": boolean("Recording", "split_on_resolution_change", True),
            "maxRecordHours": number("Recording", "max_record_hours", 12),
            "maxFileSizeGB": number("Recording", "max_file_size_gb", 8),
            "minDiskSpaceGB": number("Recording", "min_disk_space_gb", 5),
            "reconnectGraceMinutes": number("Timeouts", "reconnect_grace_minutes", 3),
            "reconnectExtendedMinutes": number("Timeouts", "reconnect_extended_minutes", 10),
        }

    def _find_archived_recording(self, requested):
        if not requested:
            return None
        archive = tiktok_only_payload(self.prototype.command("recordings", {"limit": 5000}))
        return next((row for row in archive.get("recordings", [])
                     if isinstance(row, dict) and isinstance(row.get("path"), str)
                     and os.path.normcase(os.path.abspath(row["path"]))
                     == os.path.normcase(os.path.abspath(requested))), None)

    def _serve_recording(self):
        requested = parse_qs(urlparse(self.path).query).get("id", [""])[0]
        if not requested:
            return self._send_json({"error": "Enregistrement obligatoire."}, 400)
        headers_sent = False
        try:
            entry = self._find_archived_recording(requested)
            if entry is None:
                return self._send_json({"error": "Enregistrement introuvable dans l’archive."}, 404)
            root = os.path.realpath(self.prototype.config.config.get("Paths", "streams_dir"))
            media = os.path.realpath(entry["path"])
            try:
                inside_root = os.path.commonpath((root, media)) == root
            except ValueError:
                inside_root = False
            if not inside_root or os.path.splitext(media)[1].lower() != ".mp4" or not os.path.isfile(media):
                return self._send_json({"error": "Fichier vidéo indisponible ou hors du dossier autorisé."}, 404)

            size = os.path.getsize(media)
            start, end = 0, max(0, size - 1)
            status = 200
            byte_range = self.headers.get("Range", "")
            if byte_range:
                try:
                    unit, spec = byte_range.split("=", 1)
                    first, last = spec.split("-", 1)
                    if unit.strip().lower() != "bytes" or "," in spec or size == 0:
                        raise ValueError
                    if first:
                        start = int(first)
                        end = int(last) if last else size - 1
                    else:
                        suffix = int(last)
                        if suffix <= 0:
                            raise ValueError
                        start = max(0, size - suffix)
                        end = size - 1
                    if start < 0 or end < start or start >= size:
                        raise ValueError
                    end = min(end, size - 1)
                except (ValueError, TypeError):
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206

            length = 0 if size == 0 else end - start + 1
            self.send_response(status)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(length))
            if status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            headers_sent = True
            if not length:
                return
            with open(media, "rb") as source:
                source.seek(start)
                remaining = length
                while remaining:
                    chunk = source.read(min(128 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:
            if not headers_sent:
                self._send_json({"error": str(exc)}, 503)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            if self.server.frontend_dir is not None:
                self._serve_frontend()
            else:
                data = UI.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
        elif path == "/api/state":
            try:
                state = self.prototype.command("status")
                self._send_json(tiktok_only_status(state, len(self.prototype.unsupported_channels)))
            except Exception as exc:
                self._send_json({"error": str(exc)}, 503)
        elif path == "/api/recordings":
            try:
                self._send_json(tiktok_only_payload(
                    self.prototype.command("recordings", {"limit": 5000})
                ))
            except Exception as exc:
                self._send_json({"error": str(exc)}, 503)
        elif path == "/api/recordings/media":
            self._serve_recording()
        elif path == "/api/windows/startup":
            try:
                self._send_json(windows_startup_manager(self.prototype.data_dir).status())
            except Exception as exc:
                self._send_json({"error": str(exc)}, 503)
        elif path == "/api/settings":
            try:
                self._send_json({"settings": self._read_engine_settings()})
            except Exception as exc:
                self._send_json({"error": str(exc)}, 503)
        elif path == "/api/library/summary":
            try:
                self._send_json(tiktok_only_payload(self.prototype.command("library_summary")))
            except Exception as exc:
                self._send_json({"error": str(exc)}, 503)
        elif path == "/api/library/channels":
            try:
                self._send_json(tiktok_only_payload(self.prototype.command("recordings_browse")))
            except Exception as exc:
                self._send_json({"error": str(exc)}, 503)
        elif path == "/api/library/pending":
            try:
                pending = self.prototype.command("library_pending")
                pending["batches"] = self.prototype.command("library_batches").get("batches", [])
                self._send_json(tiktok_only_payload(pending))
            except Exception as exc:
                self._send_json({"error": str(exc)}, 503)
        elif path == "/api/library/channel":
            query = parse_qs(urlparse(self.path).query)
            channel = query.get("channel", [""])[0]
            if not channel:
                self._send_json({"error": "Créateur obligatoire."}, 400)
            else:
                channel = require_tiktok_channel(channel)
                args = {key: query[key][0] for key in ("text", "sort", "order", "limit")
                        if query.get(key)}
                args["channel"] = channel
                try:
                    self._send_json(self.prototype.command("recordings_browse", args))
                except Exception as exc:
                    self._send_json({"error": str(exc)}, 404)
        elif path == "/api/events":
            self._stream_events()
        elif path == "/api" or path.startswith("/api/"):
            self._send_json({"error": "Introuvable"}, 404)
        elif self.server.frontend_dir is not None:
            self._serve_frontend()
        else:
            self._send_json({"error": "Introuvable"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/notifications/test":
                try:
                    self.prototype.send_test_notification()
                    self._send_json({"sent": True})
                except WindowsNotificationsUnavailable as exc:
                    self._send_json({"error": str(exc)}, 501)
                except ValueError as exc:
                    self._send_json({"error": str(exc)}, 409)
                except Exception as exc:
                    self._send_json({"error": str(exc)}, 503)
            elif path == "/api/windows/startup":
                body = self._body()
                enabled = body.get("enabled")
                if not isinstance(enabled, bool):
                    return self._send_json({"error": "Le champ enabled doit être booléen."}, 400)
                startup = windows_startup_manager(self.prototype.data_dir)
                if not startup.status()["supported"]:
                    return self._send_json({"error": "Le démarrage automatique est disponible uniquement sous Windows."}, 501)
                try:
                    return self._send_json(startup.set_enabled(enabled))
                except StartupUnavailable as exc:
                    return self._send_json({"error": str(exc)}, 500)
            elif path == "/api/settings":
                body = self._body()
                key = str(body.get("key", ""))
                value = body.get("value")
                mapping = {
                    "notificationsEnabled": ("GUI", "notifications"),
                    "saveFolder": ("Paths", "streams_dir"),
                    "checkIntervalSec": ("Timeouts", "poll_interval_minutes"),
                    "quality": ("Recording", "quality"),
                    "filenamePattern": ("Recording", "filename_pattern"),
                    "splitOnResolutionChange": ("Recording", "split_on_resolution_change"),
                    "maxRecordHours": ("Recording", "max_record_hours"),
                    "maxFileSizeGB": ("Recording", "max_file_size_gb"),
                    "minDiskSpaceGB": ("Recording", "min_disk_space_gb"),
                    "reconnectGraceMinutes": ("Timeouts", "reconnect_grace_minutes"),
                    "reconnectExtendedMinutes": ("Timeouts", "reconnect_extended_minutes"),
                }
                if key not in mapping:
                    return self._send_json({"error": "Paramètre non pris en charge par BTL."}, 400)
                if key == "quality" and value not in ("best", "1080p60", "1080p", "720p60", "720p", "480p", "worst"):
                    return self._send_json({"error": "Qualité vidéo non prise en charge."}, 400)
                section, option = mapping[key]
                if key == "checkIntervalSec":
                    if not isinstance(value, (int, float)) or isinstance(value, bool) or value % 30:
                        return self._send_json({"error": "La fréquence doit être un multiple de 30 secondes."}, 400)
                    value = float(value) / 60
                elif key in ("maxRecordHours", "maxFileSizeGB", "minDiskSpaceGB",
                             "reconnectGraceMinutes", "reconnectExtendedMinutes"):
                    if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
                        return self._send_json({"error": "Une valeur numérique positive ou nulle est requise."}, 400)
                elif key in ("notificationsEnabled", "splitOnResolutionChange") and not isinstance(value, bool):
                    return self._send_json({"error": "Une valeur booléenne est requise."}, 400)
                elif key in ("saveFolder", "filenamePattern") and not isinstance(value, str):
                    return self._send_json({"error": "Une valeur textuelle est requise."}, 400)
                result = self.prototype.command("config_set", {
                    "section": section, "key": option, "value": value,
                })
                stored = self._read_engine_settings()[key]
                return self._send_json({"key": key, "value": stored,
                                        "applies": result.get("applies", "next_start")})
            if path == "/api/creators":
                body = self._body()
                username = str(body.get("username", "")).strip().lstrip("@")
                if not username:
                    return self._send_json({"error": "Saisissez un pseudonyme TikTok."}, 400)
                enabled = body.get("enabled", False)
                if not isinstance(enabled, bool):
                    return self._send_json({"error": "Le champ enabled doit être booléen."}, 400)
                result = self.prototype.command(
                    "channel_add", {"names": [f"tiktok:{username}"], "disabled": not enabled}
                )
                return self._send_json({"result": result, "state": self.prototype.command("channels")})
            if path == "/api/rename":
                body = self._body()
                channel = require_tiktok_channel(body.get("channel", ""))
                username = str(body.get("username", "")).strip().lstrip("@")
                if not username:
                    return self._send_json({"error": "Créateur et nouveau pseudonyme obligatoires."}, 400)
                result = self.prototype.command(
                    "channel_edit", {"channel": channel, "new_name": username}
                )
                return self._send_json({"result": result, "state": self.prototype.command("channels")})
            creator_prefix = "/api/creators/"
            check_suffix = "/check"
            if path.startswith(creator_prefix) and path.endswith(check_suffix):
                channel = require_tiktok_channel(unquote(path[len(creator_prefix):-len(check_suffix)]))
                result = self.prototype.command("check", {"channels": [channel]})
                return self._send_json({"result": result, "state": self.prototype.command("status")})
            if path == "/api/library/plan-removal":
                body = self._body()
                media_path = str(body.get("path", ""))
                if self._find_archived_recording(media_path) is None:
                    return self._send_json({"error": "Cette vidéo n’est pas dans l’archive."}, 404)
                plan = self.prototype.command(
                    "library_plan", {"action": "pending", "paths": [media_path]}
                )
                return self._send_json({"plan": plan})
            if path == "/api/library/restore":
                body = self._body()
                batch = str(body.get("batch", ""))
                if not batch or body.get("confirm") is not True:
                    return self._send_json({"error": "Lot et confirmation explicite requis."}, 400)
                result = self.prototype.command("library_restore", {"batch": batch, "confirm": True})
                return self._send_json({"result": result})
            if path == "/api/library/move-to-pending":
                body = self._body()
                media_path = str(body.get("path", ""))
                if body.get("confirm") is not True:
                    return self._send_json({"error": "Confirmation explicite requise."}, 400)
                if self._find_archived_recording(media_path) is None:
                    return self._send_json({"error": "Cette vidéo n’est pas dans l’archive."}, 404)
                result = self.prototype.command(
                    "library_execute", {"action": "pending", "paths": [media_path], "confirm": True}
                )
                return self._send_json({"result": result})
            if path == "/api/recording/stop":
                body = self._body()
                channel = require_tiktok_channel(body.get("channel", ""))
                result = self.prototype.command("record_stop", {"channels": [channel]})
                return self._send_json({"result": result, "state": self.prototype.command("status")})
            if path == "/api/session":
                body = self._body()
                running = body.get("running")
                if not isinstance(running, bool):
                    return self._send_json({"error": "Le champ running doit être booléen."}, 400)
                command = "start" if running else "stop"
                result = self.prototype.command(command)
                return self._send_json({"result": result, "state": self.prototype.command("status")})
            if path == "/api/demo-event":
                body = self._body()
                channel = require_tiktok_channel(body.get("channel", ""))
                rows = self.prototype.command("channels").get("channels", [])
                row = next((r for r in rows if r.get("name") == channel), None)
                if row is None:
                    return self._send_json({"error": "Créateur absent du moteur."}, 404)
                # Test-only injection into the real engine Tracker; intentionally not a
                # claim that TikTok detection happened. This event traverses the real
                # engine's ControlServer subscribe protocol before becoming SSE in the UI.
                ev = self.prototype.app.tracker.emit(
                    "live", channel, source="prototype-synthetic", synthetic=True
                )
                return self._send_json({"event": ev, "synthetic": True})
            if path == "/api/shutdown":
                self._send_json({"stopping": True})
                threading.Thread(target=self._stop_host, daemon=True).start()
                return
            self._send_json({"error": "Introuvable"}, 404)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, 400)
        except Exception as exc:
            self._send_json({"error": str(exc)}, 500)

    def do_PATCH(self):
        path = urlparse(self.path).path
        prefix = "/api/creators/"
        if not path.startswith(prefix):
            return self._send_json({"error": "Introuvable"}, 404)
        try:
            channel = require_tiktok_channel(unquote(path[len(prefix):]))
            body = self._body()
            if not isinstance(body.get("enabled"), bool):
                return self._send_json({"error": "Le champ enabled doit être booléen."}, 400)
            cmd = "channel_enable" if body["enabled"] else "channel_disable"
            result = self.prototype.command(cmd, {"channels": [channel]})
            return self._send_json({"result": result, "state": self.prototype.command("channels")})
        except Exception as exc:
            self._send_json({"error": str(exc)}, 400)

    def do_DELETE(self):
        path = urlparse(self.path).path
        prefix = "/api/creators/"
        if not path.startswith(prefix):
            return self._send_json({"error": "Introuvable"}, 404)
        try:
            channel = require_tiktok_channel(unquote(path[len(prefix):]))
            result = self.prototype.command("channel_remove", {"channels": [channel]})
            return self._send_json({"result": result, "state": self.prototype.command("status")})
        except ValueError as exc:
            return self._send_json({"error": str(exc)}, 400)
        except Exception as exc:
            return self._send_json({"error": str(exc)}, 500)

    def _stream_events(self):
        # Bridge the engine's authenticated JSON-line subscription into same-origin SSE.
        try:
            after = int(urlparse(self.path).query.partition("after=")[2].split("&", 1)[0] or 0)
            stream = subscribe(
                str(self.prototype.data_dir),
                {"events": ["live", "error", "offline", "ended", "finished"],
                 "after": after, "heartbeat": 2, "max_seconds": 3600},
                idle_timeout=10,
            )
            ack = next(stream)
            if not ack.get("ok"):
                return self._send_json(ack, 503)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-transform")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            self.wfile.write(b": connecte au moteur BTL\n\n")
            self.wfile.flush()
            for item in stream:
                if item.get("type") == "heartbeat":
                    self.wfile.write(b": battement\n\n")
                elif item.get("type") == "event":
                    event = item.get("event", {})
                    channel = event.get("channel") if isinstance(event, dict) else None
                    if channel and not is_tiktok_channel(channel):
                        continue
                    payload = json.dumps(event, ensure_ascii=False).encode("utf-8")
                    self.wfile.write(b"id: " + str(event.get("seq", 0)).encode() + b"\n")
                    self.wfile.write(b"event: engine\ndata: " + payload + b"\n\n")
                elif item.get("type") == "bye":
                    break
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, StopIteration):
            return
        except Exception as exc:
            try:
                self.wfile.write(("event: erreur\ndata: " + json.dumps({"message": str(exc)}) + "\n\n").encode())
                self.wfile.flush()
            except OSError:
                pass

    def _stop_host(self):
        self.prototype.shutdown()
        self.server.shutdown()


def _package_spawn_probe(result_queue):
    """Small side-effect-free target used to verify Windows frozen spawn bootstrapping."""
    from msr.worker import record_worker

    result_queue.put({
        "pid": os.getpid(),
        "worker": f"{record_worker.__module__}.{record_worker.__name__}",
        "frozen": bool(getattr(sys, "frozen", False)),
    })


def run_package_smoke(timeout=30):
    """Spawn a child through the app entrypoint without touching TikTok or recording media."""
    context = multiprocessing.get_context("spawn")
    result_queue = context.Queue()
    process = context.Process(target=_package_spawn_probe, args=(result_queue,), name="btl-package-spawn-probe")
    try:
        process.start()
        process.join(timeout)
        if process.is_alive():
            process.terminate()
            process.join(3)
            raise RuntimeError("Le worker multiprocessing du paquet ne s’est pas terminé à temps.")
        if process.exitcode != 0:
            raise RuntimeError(f"Le worker multiprocessing du paquet a échoué (exit={process.exitcode}).")
        try:
            result = result_queue.get(timeout=3)
        except queue.Empty as exc:
            raise RuntimeError("Le worker multiprocessing n’a pas renvoyé son résultat.") from exc
        if result.get("pid") == os.getpid() or result.get("worker") != "msr.worker.record_worker":
            raise RuntimeError(f"Résultat inattendu du worker multiprocessing : {result!r}")
        return result
    finally:
        result_queue.close()
        result_queue.join_thread()


class SmokeResult:
    def __init__(self):
        self.passed = []

    def check(self, label, condition):
        if not condition:
            raise AssertionError("ÉCHEC — " + label)
        self.passed.append(label)
        print("OK — " + label)


def run_smoke(data_dir: Path | None = None):
    import http.client
    import urllib.error
    import urllib.parse
    import urllib.request

    ephemeral = data_dir is None
    path = data_dir or Path(tempfile.mkdtemp(prefix="btl-prototype-smoke-"))
    static_dist = Path(tempfile.mkdtemp(prefix="btl-static-spa-smoke-"))
    (static_dist / "assets").mkdir()
    (static_dist / "_shell.html").write_text(
        '<!doctype html><html lang="fr"><title>Boitier Tiktok Live</title></html>',
        encoding="utf-8",
    )
    (static_dist / "assets" / "app.js").write_text("window.btlStaticBuild = true;", encoding="utf-8")
    prototype = Prototype(path).start()
    httpd = LocalUI(prototype, port=0, frontend_dir=static_dist)
    web_thread = threading.Thread(target=httpd.serve_forever, daemon=True, name="btl-prototype-http")
    web_thread.start()
    base = f"http://127.0.0.1:{httpd.server_port}"
    result = SmokeResult()

    def api(method, route, payload=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(base + route, data=body, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as response:
            raise AssertionError(response.read().decode("utf-8")) from None

    def api_error(method, route, payload=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(base + route, data=body, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as response:
            return response.code, json.loads(response.read().decode("utf-8"))

    try:
        probe_call = {}

        def fake_probe_runner(command, **kwargs):
            probe_call.update(command=command, kwargs=kwargs)
            return subprocess.CompletedProcess(command, 0, stdout="2026.10.26\n", stderr="")

        probe_version = _capture_tool_version("yt-dlp", ["--version"], runner=fake_probe_runner)
        result.check("probe onefile des outils utilise un délai de démarrage étendu",
                     probe_version == "2026.10.26"
                     and probe_call.get("kwargs", {}).get("timeout") == 30)

        page = api_page = urllib.request.urlopen(base + "/", timeout=5).read().decode("utf-8")
        result.check("interface locale française servie par l’hôte du prototype",
                     '<html lang="fr">' in page and "Boitier Tiktok Live" in page)
        deep_page = urllib.request.urlopen(base + "/createurs", timeout=5).read().decode("utf-8")
        with urllib.request.urlopen(base + "/assets/app.js", timeout=5) as response:
            static_js = response.read().decode("utf-8")
            static_cache = response.headers.get("Cache-Control", "")
        missing_asset, _ = api_error("GET", "/assets/missing.js")
        unknown_api, _ = api_error("GET", "/api/not-a-route")
        result.check("build SPA statique servi par le host avec fallback de route et cache des assets",
                     deep_page == page and "window.btlStaticBuild" in static_js
                     and "immutable" in static_cache and missing_asset == 404
                     and unknown_api == 404)
        spawn_result = run_package_smoke()
        result.check("worker engine importé avec le protocole multiprocessing spawn",
                     spawn_result.get("worker") == "msr.worker.record_worker"
                     and spawn_result.get("pid") != os.getpid())

        state = api("GET", "/api/state")
        result.check("démarrage du véritable adaptateur headless du moteur", state["app"]["mode"] == "headless")
        result.check("BTL TikTok ne démarre pas le poller multi-plateforme partagé",
                     prototype.app._poller is None)
        result.check("état initial vide lu à travers le pont UI → moteur", state.get("channels") == [])
        mixed = tiktok_only_payload({
            "channels": [{"name": "tiktok:creator"}, {"name": "twitch:creator"}],
            "by_platform": [{"platform": "tiktok"}, {"platform": "twitch"}],
        })
        result.check("filtrage BTL TikTok sans modifier le modèle partagé",
                     mixed["channels"] == [{"name": "tiktok:creator"}]
                     and mixed["by_platform"] == [{"platform": "tiktok"}])
        code, _ = api_error("POST", "/api/rename", {
            "channel": "twitch:creator", "username": "not_allowed"
        })
        result.check("refus des opérations BTL sur une chaîne non TikTok", code == 400)
        settings_before = api("GET", "/api/settings").get("settings", {})
        result.check("lecture des paramètres réellement présents dans config.ini",
                     settings_before.get("quality") == prototype.config.get("Recording", "quality", fallback="best")
                     and settings_before.get("checkIntervalSec") == round(
                         prototype.config.getfloat("Timeouts", "poll_interval_minutes", fallback=3) * 60))
        try:
            saved_setting = api("POST", "/api/settings", {"key": "checkIntervalSec", "value": 90})
            reloaded_settings = api("GET", "/api/settings").get("settings", {})
            result.check("modification validée, persistée et relue depuis la configuration moteur",
                         saved_setting.get("value") == 90 and saved_setting.get("applies") == "now"
                         and reloaded_settings.get("checkIntervalSec") == 90)
        finally:
            api("POST", "/api/settings", {"key": "checkIntervalSec",
                                            "value": settings_before.get("checkIntervalSec", 180)})

        live_notice = notification_content({"event": "live", "channel": "tiktok:probe"})
        result.check("événements moteur traduits en titre et contenu Windows localisés",
                     live_notice == ("TikTok LIVE détecté", "@probe est en direct."))
        sent_notices = []
        original_sender = prototype._notification_sender
        prototype._notification_sender = lambda title, message: sent_notices.append((title, message))
        try:
            delivered = prototype._dispatch_windows_notification(
                {"event": "live", "channel": "tiktok:probe", "seq": 9001}
            )
            other_platform = prototype._dispatch_windows_notification(
                {"event": "live", "channel": "twitch:probe", "seq": 9002}
            )
            result.check("hôte relaie TikTok et ignore les notifications des autres plateformes",
                         delivered and not other_platform and sent_notices == [live_notice])
            prototype.config.config.set("GUI", "notifications", "false")
            prototype.config.save()
            suppressed = prototype._dispatch_windows_notification(
                {"event": "finished", "channel": "tiktok:probe", "seq": 9002}
            )
            synthetic = prototype._dispatch_windows_notification(
                {"event": "live", "channel": "tiktok:probe", "synthetic": True}
            )
            result.check("préférence désactivée et événements synthétiques ne déclenchent pas de toast",
                         not suppressed and not synthetic and len(sent_notices) == 1)
        finally:
            prototype.config.config.set("GUI", "notifications", "true")
            prototype.config.save()
            prototype._notification_sender = original_sender

        class FakeNotificationAPI:
            def __init__(self):
                self.calls = []

            def notify(self, **kwargs):
                self.calls.append(kwargs)

        fake_notification_api = FakeNotificationAPI()
        native_sent = send_windows_notification(
            "Test", "Essai", platform="win32", notification_api=fake_notification_api
        )
        result.check("adaptateur Windows appelle Plyer avec le titre et le message attendus",
                     native_sent and fake_notification_api.calls == [{
                         "title": "Test", "message": "Essai", "app_name": "Boitier Tiktok Live", "timeout": 8
                     }])
        try:
            send_windows_notification("Test", "Essai", platform="linux", notification_api=fake_notification_api)
            unsupported_platform_rejected = False
        except WindowsNotificationsUnavailable:
            unsupported_platform_rejected = True
        result.check("adaptateur natif refuse honnêtement un système non-Windows",
                     unsupported_platform_rejected)

        from types import SimpleNamespace

        class FakeMenuItem:
            def __init__(self, text, action=None, **kwargs):
                self.text, self.action = text, action

        class FakeMenu:
            SEPARATOR = object()

            def __init__(self, *items):
                self.items = items

        class FakeIcon:
            def __init__(self, *args):
                self.menu = args[-1]
                self.update_count = 0

            def run(self):
                return

            def update_menu(self):
                self.update_count += 1

            def stop(self):
                return

        class FakeDrawing:
            def ellipse(self, *args, **kwargs):
                pass

            def line(self, *args, **kwargs):
                pass

        class FakeTrayPrototype:
            class App:
                paused = True

            app = App()
            commands = []

            def command(self, name):
                self.commands.append(name)
                self.app.paused = name != "start"

        tray_prototype = FakeTrayPrototype()
        opened_urls = []
        tray_shutdown = threading.Event()
        tray = WindowsTray(
            tray_prototype,
            "http://127.0.0.1:8765/",
            tray_shutdown.set,
            platform="win32",
            pystray_module=SimpleNamespace(Menu=FakeMenu, MenuItem=FakeMenuItem, Icon=FakeIcon),
            image_module=SimpleNamespace(new=lambda *args, **kwargs: object()),
            draw_module=SimpleNamespace(Draw=lambda image: FakeDrawing()),
            open_url=opened_urls.append,
        )
        tray.start()
        tray_items = tray.icon.menu.items
        tray_items[0].action(tray.icon, tray_items[0])
        tray_items[1].action(tray.icon, tray_items[1])
        tray_items[3].action(tray.icon, tray_items[3])
        tray_shutdown.wait(1)
        menu_works = (opened_urls == ["http://127.0.0.1:8765/"]
                      and tray_prototype.commands == ["start"]
                      and tray.icon.update_count == 1 and tray_shutdown.is_set())
        tray.stop()
        result.check("menu de barre système : ouvrir l’interface, basculer surveillance et quitter",
                     menu_works)
        try:
            WindowsTray(prototype, "", lambda: None, platform="linux").start()
            tray_platform_rejected = False
        except TrayUnavailable:
            tray_platform_rejected = True
        result.check("intégration de la zone de notification explicitement réservée à Windows",
                     tray_platform_rejected)

        class FakeSignal:
            def __init__(self):
                self.callbacks = []

            def __iadd__(self, callback):
                self.callbacks.append(callback)
                return self

            def fire(self):
                return [callback() for callback in self.callbacks]

        class FakeWebWindow:
            def __init__(self):
                self.events = SimpleNamespace(closing=FakeSignal(), minimized=FakeSignal())
                self.hide_count = 0
                self.show_count = 0
                self.restore_count = 0
                self.destroy_count = 0

            def hide(self):
                self.hide_count += 1

            def show(self):
                self.show_count += 1

            def restore(self):
                self.restore_count += 1

            def destroy(self):
                self.destroy_count += 1

        class FakeWebview:
            def __init__(self):
                self.window = FakeWebWindow()
                self.start_options = None

            def create_window(self, *args, **kwargs):
                return self.window

            def start(self, **kwargs):
                self.start_options = kwargs

        fake_webview = FakeWebview()
        desktop_shell = WindowsDesktopShell(
            "http://127.0.0.1:8765/", webview_module=fake_webview, platform="win32"
        ).prepare()
        desktop_shell.attach_tray(tray)
        tray.window = desktop_shell
        close_results = desktop_shell.window.events.closing.fire()
        desktop_shell.window.events.minimized.fire()
        desktop_shell.show()
        tray._open()
        desktop_shell.run()
        tray._quit()
        close_after_quit = desktop_shell.window.events.closing.fire()
        shell_works = (close_results == [False] and close_after_quit == [None]
                       and desktop_shell.window.hide_count == 2
                       and desktop_shell.window.show_count == 2
                       and desktop_shell.window.restore_count == 2
                       and desktop_shell.window.destroy_count == 1
                       and fake_webview.start_options == {"gui": "edgechromium", "debug": False})
        result.check("fenêtre WebView2 se masque, se restaure et se ferme proprement via le tray",
                     shell_works)
        try:
            WindowsDesktopShell("", platform="linux").prepare()
            desktop_platform_rejected = False
        except DesktopUnavailable:
            desktop_platform_rejected = True
        result.check("fenêtre desktop native explicitement réservée à Windows",
                     desktop_platform_rejected)

        class FakeWebViewRegistry:
            HKEY_CURRENT_USER = "HKCU"
            HKEY_LOCAL_MACHINE = "HKLM"
            KEY_READ = 0x20019
            KEY_WOW64_32KEY = 0x0200
            KEY_WOW64_64KEY = 0x0100

            def __init__(self, name="Microsoft Edge WebView2 Runtime", version="124.0.2478.67"):
                self.name = name
                self.version = version

            def OpenKey(self, root, path, _reserved, _access):
                if path == "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients":
                    return (root, "clients")
                if path == "{test-client}":
                    return (root, "client")
                raise OSError("registry key not found")

            def EnumKey(self, handle, index):
                if handle[1] == "clients" and index == 0:
                    return "{test-client}"
                raise OSError("no more registry keys")

            def QueryValueEx(self, handle, value):
                if handle[1] != "client":
                    raise OSError("not a client key")
                if value == "name":
                    return self.name, 1
                if value == "pv":
                    return self.version, 1
                raise OSError("value not found")

            def CloseKey(self, _handle):
                return None

        registry_version = webview2_runtime_version(
            platform="win32", winreg_module=FakeWebViewRegistry()
        )
        registry_rejects_edge_only = webview2_runtime_version(
            platform="win32", winreg_module=FakeWebViewRegistry(name="Microsoft Edge")
        ) is None
        registry_skips_other_platform = webview2_runtime_version(platform="linux") is None
        result.check("précontrôle WebView2 détecte le runtime Evergreen et ignore Edge seul",
                     registry_version == "124.0.2478.67" and registry_rejects_edge_only
                     and registry_skips_other_platform)
        tool_help = missing_capture_tool_message(
            {"yt-dlp": None, "streamlink": "8.6.3", "ffmpeg": None, "ffprobe": None},
            frozen=True,
        )
        result.check("outils manquants donnent une réparation ciblée pour l’archive portable",
                     "yt-dlp" in tool_help and "ffprobe" in tool_help
                     and "dossier complet" in tool_help and "sous-dossier tools" in tool_help)

        class FakeShutdownPrototype:
            def __init__(self):
                self.stopped = False

            def shutdown(self):
                self.stopped = True

        first_instance = LocalUI(FakeShutdownPrototype(), port=0)
        duplicate_prototype = FakeShutdownPrototype()
        duplicate_notices = []
        try:
            try:
                create_local_ui(
                    duplicate_prototype, first_instance.server_port,
                    platform="win32", notify=duplicate_notices.append,
                )
                duplicate_rejected = False
            except SystemExit as exc:
                duplicate_rejected = exc.code == 2
        finally:
            first_instance.server_close()
        result.check("double lancement sur le même port est signalé et arrête son moteur proprement",
                     duplicate_rejected and duplicate_prototype.stopped
                     and len(duplicate_notices) == 1
                     and "autre instance" in duplicate_notices[0])

        startup_root = Path(tempfile.mkdtemp(prefix="btl-startup-smoke-"))
        startup_folder = startup_root / "User's Startup"
        startup_folder.mkdir(parents=True)
        unrelated_shortcut = startup_folder / "Other application.lnk"
        unrelated_shortcut.write_bytes(b"leave unchanged")
        startup_pythonw = startup_root / "pythonw.exe"
        startup_pythonw.write_bytes(b"test executable placeholder")
        startup_calls = []
        startup = None

        def fake_startup_powershell(command, **kwargs):
            startup_calls.append((command, kwargs))
            startup.shortcut.write_bytes(b"synthetic shortcut")
            return SimpleNamespace(returncode=0, stderr="")

        try:
            startup = WindowsStartup(
                startup_root / "User's Data", platform="win32", folder=startup_folder,
                script=Path(__file__).resolve(), pythonw=startup_pythonw,
                run=fake_startup_powershell,
            )
            startup_off = startup.status()
            startup_on = startup.set_enabled(True)
            command_text = startup_calls[0][0][-1]
            startup_removed = startup.set_enabled(False)
            result.check("démarrage Windows créé et retiré par raccourci utilisateur, sans registre ni admin",
                         not startup_off["enabled"] and startup_on["enabled"]
                         and not startup_removed["enabled"] and unrelated_shortcut.exists()
                         and len(startup_calls) == 1
                         and "--background" not in command_text and "--no-desktop" in command_text
                         and "User''s Startup" in command_text)

            frozen_exe = startup_root / "BoitierTiktokLive.exe"
            frozen_exe.write_bytes(b"frozen executable placeholder")
            frozen_folder = startup_root / "Frozen Startup"
            frozen_calls = []
            frozen_startup = None

            def fake_frozen_powershell(command, **kwargs):
                frozen_calls.append(command)
                frozen_startup.shortcut.write_bytes(b"frozen shortcut")
                return SimpleNamespace(returncode=0, stderr="")

            frozen_startup = WindowsStartup(
                startup_root / "User's Data", platform="win32", folder=frozen_folder,
                repo_root=startup_root, frozen=True, executable=frozen_exe,
                run=fake_frozen_powershell,
            )
            frozen_startup.set_enabled(True)
            frozen_command = frozen_calls[0][-1]
            frozen_startup.set_enabled(False)
            result.check("raccourci d’autostart vise l’exécutable PyInstaller plutôt qu’un pythonw externe",
                         len(frozen_calls) == 1 and str(frozen_exe) in frozen_command
                         and "btl_vertical_host.py" not in frozen_command
                         and "--no-desktop" in frozen_command)
        finally:
            shutil.rmtree(startup_root, ignore_errors=True)

        startup_api_state = api("GET", "/api/windows/startup")
        result.check("API expose honnêtement la disponibilité du démarrage Windows",
                     startup_api_state.get("supported") is (sys.platform == "win32"))
        if sys.platform != "win32":
            startup_code, _ = api_error(
                "POST", "/api/windows/startup", {"enabled": True}
            )
            result.check("API refuse explicitement la modification du démarrage hors Windows",
                         startup_code == 501)

        archive = api("GET", "/api/recordings")
        result.check("liste des enregistrements obtenue depuis l’index moteur", archive.get("recordings") == [])

        media_fixture = (Path(prototype.config.config.get("Paths", "streams_dir"))
                         / "Processed" / "tiktok" / "btl_media_probe" / "probe.mp4")
        media_fixture.parent.mkdir(parents=True, exist_ok=True)
        media_payload = bytes(range(64))
        media_fixture.write_bytes(media_payload)
        old_media_time = time.time() - 3600
        os.utime(media_fixture, (old_media_time, old_media_time))
        try:
            media_archive = api("GET", "/api/recordings")
            media_entry = next((item for item in media_archive.get("recordings", [])
                                if item.get("path") == str(media_fixture)), None)
            req = urllib.request.Request(
                base + "/api/recordings/media?id=" + urllib.parse.quote(str(media_fixture), safe=""),
                headers={"Range": "bytes=8-15"},
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                ranged_status = response.status
                ranged_bytes = response.read()
                content_range = response.headers.get("Content-Range", "")
            result.check("lecture locale d’un MP4 référencé dans l’archive avec requête HTTP Range",
                         media_entry is not None and ranged_status == 206
                         and ranged_bytes == media_payload[8:16] and content_range == "bytes 8-15/64")
            forged_code, _ = api_error("GET", "/api/recordings/media?id="
                                       + urllib.parse.quote("/etc/passwd", safe=""))
            result.check("route média refuse les chemins absents de l’archive moteur", forged_code == 404)
            library_channels = api("GET", "/api/library/channels")
            result.check("la commande d’index bibliothèque du moteur remonte le créateur du média",
                         any(row.get("channel") == "tiktok:btl_media_probe"
                             for row in library_channels.get("channels", [])))
            library_summary = api("GET", "/api/library/summary")
            result.check("résumé global de bibliothèque obtenu depuis le scan moteur",
                         library_summary.get("summary", {}).get("recordings", {}).get("files", 0) >= 1)
            browse = api("GET", "/api/library/channel?channel=tiktok%3Abtl_media_probe")
            result.check("navigation du créateur dans l’index bibliothèque réel",
                         any(row.get("path") == str(media_fixture)
                             for row in browse.get("recordings", [])))
            plan = api("POST", "/api/library/plan-removal", {"path": str(media_fixture)})
            plan_data = plan.get("plan", {})
            result.check("aperçu moteur de déplacement réversible vers PendingDeletion",
                         plan_data.get("files") == 1 and plan_data.get("action") == "pending")
            moved = api("POST", "/api/library/move-to-pending",
                        {"path": str(media_fixture), "confirm": True})
            batch = moved.get("result", {}).get("batch")
            pending = api("GET", "/api/library/pending")
            result.check("action confirmée déplace le fichier dans PendingDeletion, pas en suppression définitive",
                         bool(batch) and not media_fixture.exists() and pending.get("files") == 1)
            restored = api("POST", "/api/library/restore", {"batch": batch, "confirm": True})
            result.check("restauration du lot réversible via la commande bibliothèque moteur",
                         restored.get("result", {}).get("done") == 1 and media_fixture.exists())
        finally:
            shutil.rmtree(media_fixture.parent, ignore_errors=True)
            pending_fixture = media_fixture.parents[3] / "PendingDeletion" / "tiktok" / "btl_media_probe"
            shutil.rmtree(pending_fixture, ignore_errors=True)

        added = api("POST", "/api/creators", {"username": "btl_audit_probe"})
        result.check("ajout via l’interface relayé au roster moteur, sans worker réseau",
                     added["result"].get("added") == ["tiktok:btl_audit_probe"])
        key = "tiktok:btl_audit_probe"

        renamed = api("POST", "/api/rename", {"channel": key, "username": "btl_audit_probe_edited"})
        result.check("modification du pseudonyme via l’interface et la commande moteur",
                     renamed["result"].get("new") == "tiktok:btl_audit_probe_edited")
        key = "tiktok:btl_audit_probe_edited"

        enabled = api("PATCH", "/api/creators/" + urllib.parse.quote(key, safe=""), {"enabled": True})
        result.check("activation persistée via l’interface, session moteur tenue en pause",
                     enabled["result"].get("enabled") is True)
        disabled = api("PATCH", "/api/creators/" + urllib.parse.quote(key, safe=""), {"enabled": False})
        result.check("désactivation persistée via l’interface", disabled["result"].get("enabled") is False)
        rows = api("GET", "/api/state").get("channels", [])
        result.check("lecture après mutation depuis le roster JSON réel du moteur",
                     len(rows) == 1 and rows[0].get("name") == key and rows[0].get("enabled") is False)
        check_code, check_error = api_error(
            "POST", "/api/creators/" + urllib.parse.quote(key, safe="") + "/check", {}
        )
        result.check("vérification immédiate protégée tant que la session de surveillance est arrêtée",
                     check_code == 400 and "not running" in check_error.get("error", "").lower())

        # Open the browser-facing SSE bridge first, then inject a test-only event through
        # the real Tracker. This proves transport/UI delivery, not TikTok detection.
        client = http.client.HTTPConnection("127.0.0.1", httpd.server_port, timeout=8)
        client.request("GET", "/api/events", headers={"Accept": "text/event-stream"})
        response = client.getresponse()
        result.check("SSE de l’interface connecté à l’abonnement authentifié du moteur",
                     response.status == 200 and response.getheader("Content-Type", "").startswith("text/event-stream"))
        response.readline()  # initial SSE comment
        response.readline()  # blank separator
        injection = api("POST", "/api/demo-event", {"channel": key})
        result.check("événement de démonstration injecté explicitement comme synthétique",
                     injection.get("synthetic") is True and injection["event"].get("event") == "live")
        lines = []
        deadline = time.monotonic() + 6
        while time.monotonic() < deadline:
            line = response.readline().decode("utf-8", errors="replace")
            if not line:
                break
            lines.append(line)
            if line.startswith("data:") and '"synthetic": true' in line:
                break
        client.close()
        result.check("événement Tracker reçu par l’interface au travers de SSE",
                     any(line.startswith("event: engine") for line in lines)
                     and any(line.startswith("data:") and '"synthetic": true' in line for line in lines))

        removed = api("DELETE", "/api/creators/" + urllib.parse.quote(key, safe=""))
        result.check("suppression du créateur relayée à la commande réelle du moteur",
                     removed.get("result", {}).get("removed") == [key])
        result.check("roster vide après suppression via l’API", api("GET", "/api/state").get("channels") == [])

        stopped = api("POST", "/api/shutdown", {})
        result.check("demande d’arrêt propre transmise depuis l’interface", stopped.get("stopping") is True)
        prototype.engine_thread.join(timeout=5)
        result.check("boucle headless terminée", not prototype.engine_thread.is_alive())
        presence_thread = prototype.app._poller._thread if prototype.app._poller else None
        if presence_thread is not None:
            presence_thread.join(timeout=2)
        result.check("poller de présence arrêté proprement avec le host",
                     presence_thread is None or not presence_thread.is_alive())
        deadline = time.monotonic() + 3
        while (path / "msr_control.json").exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        result.check("fichier de contrôle retiré à l’arrêt", not (path / "msr_control.json").exists())
        print(f"\nRÉSULTAT : {len(result.passed)}/{len(result.passed)} étapes du prototype réussies.")
        print("Aucun LIVE TikTok n’a été interrogé ni enregistré ; l’événement reçu était synthétique.")
        return result
    finally:
        prototype.shutdown()
        httpd.shutdown()
        httpd.server_close()
        web_thread.join(timeout=2)
        shutil.rmtree(static_dist, ignore_errors=True)
        if ephemeral:
            shutil.rmtree(path, ignore_errors=True)


def _background_data_dir() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    return base / "BoitierTiktokRecorder"


def _launch_background(data_dir: Path, port: int, ui_url: str | None, no_tray: bool):
    if sys.platform != "win32":
        raise SystemExit("Le lancement détaché avec --background est réservé à Windows.")
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    if not pythonw.is_file():
        raise SystemExit(f"pythonw.exe introuvable à côté de l’interpréteur : {pythonw}")
    if not no_tray:
        try:
            import pystray  # noqa: F401
            from PIL import Image, ImageDraw  # noqa: F401
        except ImportError as exc:
            raise SystemExit("pystray et Pillow sont requis pour le mode --background avec icône tray.") from exc
    command = [str(pythonw), str(Path(__file__).resolve()), "--data-dir", str(data_dir),
               "--port", str(port)]
    if ui_url:
        command.extend(["--ui-url", ui_url])
    if no_tray:
        command.append("--no-tray")
    command.append("--no-desktop")
    flags = getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
    flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
    subprocess.Popen(
        command,
        cwd=str(REPO_ROOT),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=flags,
    )


def main():
    parser = argparse.ArgumentParser(description="Hôte local BTL ↔ moteur MSR")
    parser.add_argument("--smoke", action="store_true", help="exécuter le parcours vertical automatisé")
    parser.add_argument("--package-smoke", action="store_true",
                        help="tester le lancement d’un worker spawn (contrôle post-build PyInstaller)")
    parser.add_argument("--check-tools", action="store_true",
                        help="vérifier yt-dlp, Streamlink, FFmpeg et ffprobe sans démarrer l’hôte")
    parser.add_argument("--data-dir", type=Path, default=None,
                        help="dossier de données (Windows : %LOCALAPPDATA% par défaut ; autres OS : temporaire)")
    parser.add_argument("--port", type=int, default=8765, help="port API local (défaut : 8765)")
    parser.add_argument("--no-tray", action="store_true", help="ne pas créer l’icône Windows de barre système")
    parser.add_argument("--no-desktop", action="store_true", help="servir l’interface dans un navigateur, sans fenêtre WebView2")
    parser.add_argument("--ui-url", default=None, help="URL externe du frontend (sinon le host sert le build SPA local)")
    parser.add_argument("--dev-frontend", action="store_true",
                        help="démarrer Vite en développement au lieu de servir le build SPA")
    parser.add_argument("--background", action="store_true",
                        help="relancer via pythonw.exe sans console et fermer ce processus")
    args = parser.parse_args()
    if args.package_smoke:
        try:
            result = run_package_smoke()
            if sys.stdout is not None:
                print(f"multiprocessing spawn smoke OK: {result}")
        except Exception as exc:
            logging.error("Windows spawn smoke failed: %s", exc)
            raise SystemExit(1) from exc
        return
    if args.smoke:
        run_smoke(args.data_dir)
        return
    if args.check_tools:
        status = capture_tools_status()
        if sys.stdout is not None:
            for name, version in status.items():
                print(f"{name}: {version or 'MANQUANT'}")
        raise SystemExit(0 if all(status.values()) else 1)
    if sys.platform == "win32":
        status = capture_tools_status()
        message = missing_capture_tool_message(status, frozen=bool(getattr(sys, "frozen", False)))
        if message:
            show_windows_message(message, title="Outils de capture requis")
            raise SystemExit(2)
    if args.background:
        data_dir = args.data_dir or _background_data_dir()
        _launch_background(data_dir, args.port, args.ui_url, args.no_tray)
        return
    if args.dev_frontend and args.ui_url:
        parser.error("--dev-frontend et --ui-url ne peuvent pas être utilisés ensemble.")

    frontend_dir = None
    built_frontend = REPO_ROOT / "frontend" / ".output" / "public"
    if args.ui_url is None and not args.dev_frontend and (built_frontend / "_shell.html").is_file():
        frontend_dir = built_frontend
    elif sys.platform == "win32" and args.ui_url is None and not args.dev_frontend:
        parser.error(
            "Build frontend absent : exécutez `cd frontend && npm ci && npm run build`, "
            "ou utilisez --dev-frontend pour le développement."
        )

    ephemeral_data_dir = args.data_dir is None and sys.platform != "win32"
    data_dir = args.data_dir or (
        _background_data_dir() if sys.platform == "win32"
        else Path(tempfile.mkdtemp(prefix="btl-prototype-"))
    )
    background_log = None
    if sys.stdout is None or sys.stderr is None:
        data_dir.mkdir(parents=True, exist_ok=True)
        background_log = open(data_dir / "btl-host.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = background_log
        sys.stderr = background_log
        logging.basicConfig(stream=background_log, level=logging.INFO,
                            format="%(asctime)s %(levelname)s %(message)s")

    prototype = Prototype(data_dir).start()
    httpd = create_local_ui(prototype, port=args.port, frontend_dir=frontend_dir)
    desktop_enabled = sys.platform == "win32" and not args.no_desktop
    frontend_server = None
    frontend_url = None
    if args.dev_frontend:
        frontend_server = FrontendDevServer(REPO_ROOT)
        try:
            frontend_url = frontend_server.start(httpd.server_port, log_stream=sys.stdout)
        except DesktopUnavailable as exc:
            logging.warning("Frontend React local indisponible : %s", exc)
            frontend_server = None
            desktop_enabled = False

    ui_url = args.ui_url or frontend_url or f"http://127.0.0.1:{httpd.server_port}/"
    desktop = None
    browser_fallback = False
    if desktop_enabled:
        try:
            desktop = WindowsDesktopShell(ui_url).prepare()
        except DesktopUnavailable as exc:
            logging.warning("Fenêtre desktop BTL indisponible : %s", exc)
            desktop = None
            browser_fallback = True
            show_windows_message(
                f"{exc}\n\nBTL va ouvrir l’interface dans votre navigateur. "
                "Après installation/réparation du composant indiqué, relancez BTL pour retrouver la fenêtre native.",
                title="Fenêtre WebView2 indisponible — mode navigateur",
            )

    def shutdown_host():

        prototype.shutdown()
        httpd.shutdown()

    tray = None
    if sys.platform == "win32" and not args.no_tray:
        try:
            tray = WindowsTray(
                prototype,
                ui_url,
                shutdown=shutdown_host,
                window=desktop,
            )
            tray.start()
            if desktop is not None:
                desktop.attach_tray(tray)
        except TrayUnavailable as exc:
            logging.warning("Zone de notification BTL non démarrée : %s", exc)
            tray = None

    if sys.stdout is not None:
        print(f"Hôte BTL actif : {ui_url}")
        print(f"Dossier de données : {data_dir}")
        if desktop is not None:
            print("Interface ouverte dans la fenêtre native Microsoft Edge WebView2.")
        if tray is not None:
            print("L’icône BTL permet de restaurer l’interface et d’arrêter l’hôte.")
        else:
            print("Le navigateur peut être fermé sans arrêter le moteur ; Ctrl+C arrête l’hôte.")

    web_thread = None
    try:
        if desktop is not None:
            web_thread = threading.Thread(
                target=httpd.serve_forever, daemon=True, name="btl-local-http"
            )
            web_thread.start()
            try:
                desktop.run()
            except DesktopUnavailable as exc:
                logging.warning("WebView2 indisponible, bascule vers le navigateur : %s", exc)
                show_windows_message(
                    f"{exc}\n\nBTL va ouvrir l’interface dans votre navigateur. Après réparation du runtime, relancez BTL.",
                    title="WebView2 indisponible — mode navigateur",
                )
                desktop.destroy()
                desktop = None
                if tray is not None:
                    tray.window = None
                httpd.shutdown()
                web_thread.join(timeout=3)
                web_thread = None
                web_thread = threading.Thread(
                    target=httpd.serve_forever, daemon=True, name="btl-browser-fallback"
                )
                web_thread.start()
                try:
                    webbrowser.open(ui_url)
                except Exception:
                    logging.warning("Impossible d’ouvrir automatiquement le navigateur", exc_info=True)
                web_thread.join()
        else:
            if browser_fallback:
                web_thread = threading.Thread(
                    target=httpd.serve_forever, daemon=True, name="btl-browser-fallback"
                )
                web_thread.start()
                try:
                    webbrowser.open(ui_url)
                except Exception:
                    logging.warning("Impossible d’ouvrir automatiquement le navigateur", exc_info=True)
                web_thread.join()
            else:
                httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if desktop is not None:
            desktop.destroy()
        if tray is not None:
            tray.stop()
        if web_thread is not None and web_thread.is_alive():
            httpd.shutdown()
            web_thread.join(timeout=3)
        prototype.shutdown()
        httpd.server_close()
        if frontend_server is not None:
            frontend_server.stop()
        if ephemeral_data_dir:
            shutil.rmtree(data_dir, ignore_errors=True)
        if background_log is not None:
            background_log.close()


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
