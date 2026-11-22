"""Windows desktop notifications for the BTL local host.

The host owns this bridge rather than the browser page, so notifications can still
arrive when the frontend is closed, as long as the local host and engine are running.
"""
from __future__ import annotations


class WindowsNotificationsUnavailable(RuntimeError):
    """Raised when this machine cannot send Windows desktop notifications."""


def notification_content(event: dict) -> tuple[str, str] | None:
    """Turn a supported engine event into concise notification title/body text."""
    kind = str(event.get("event", ""))
    raw_channel = str(event.get("channel") or "").strip()
    channel = raw_channel.split(":", 1)[-1].lstrip("@") if raw_channel else ""
    who = f"@{channel}" if channel else "Boitier Tiktok Live"

    if kind == "live":
        return "TikTok LIVE détecté", f"{who} est en direct."
    if kind in ("offline", "ended"):
        return "TikTok LIVE terminé", f"Le direct de {who} est terminé ou interrompu."
    if kind == "finished":
        if event.get("remux_ok") is False:
            return "Enregistrement incomplet", f"Le fichier de {who} n’a pas pu être finalisé correctement."
        return "Enregistrement terminé", f"Le fichier de {who} est prêt dans la bibliothèque."
    if kind == "error":
        detail = str(event.get("error") or "Une erreur moteur est survenue.").strip()
        return "Erreur moteur BTL", f"{who} : {detail[:220]}"
    if kind == "disk_low":
        free = event.get("free_gb")
        minimum = event.get("min_gb")
        if isinstance(free, (int, float)) and isinstance(minimum, (int, float)):
            detail = f"{free:.1f} Go libres, seuil configuré : {minimum:.1f} Go."
        else:
            detail = "L’espace libre est passé sous le seuil configuré."
        return "Espace disque faible", detail
    return None


def send_windows_notification(title: str, message: str, *, platform: str | None = None,
                              notification_api=None) -> bool:
    """Send through an injected persistent-icon backend; never create a temporary tray icon.

    Plyer's Windows backend registers one Shell_NotifyIcon entry per notification and
    retains its cleanup callback until process exit. Production uses ``WindowsTray.notify``
    on BTL's already-running icon; ``notification_api`` remains injectable for tests.
    """
    import sys

    platform = sys.platform if platform is None else platform
    if platform != "win32":
        raise WindowsNotificationsUnavailable("Les notifications système BTL nécessitent Windows.")
    if notification_api is None:
        raise WindowsNotificationsUnavailable(
            "Aucune icône BTL persistante n’est disponible pour afficher la notification."
        )

    notification_api.notify(
        title=title,
        message=message,
        app_name="Boitier Tiktok Live",
        timeout=8,
    )
    return True
