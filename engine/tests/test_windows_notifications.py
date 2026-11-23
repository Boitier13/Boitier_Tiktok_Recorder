"""Windows notification bridge never falls back to Plyer's per-notification tray icon."""
import unittest
from unittest.mock import Mock

from prototype.windows_notifications import (
    WindowsNotificationsUnavailable,
    notification_content,
    send_windows_notification,
)


class WindowsNotificationBridgeTests(unittest.TestCase):
    def test_engine_timeout_error_is_localized_in_french(self):
        title, body = notification_content({
            "event": "error", "channel": "tiktok:massoud_le_lion", "error": "timeout"
        })
        self.assertEqual(title, "Erreur moteur BTL")
        self.assertIn("@massoud_le_lion", body)
        self.assertIn("Délai d’attente dépassé", body)
        self.assertNotIn("timeout", body.casefold())

    def test_http_403_is_localized_without_losing_extra_diagnostics(self):
        _, body = notification_content({
            "event": "error", "channel": "tiktok:creator", "error": "HTTP 403: blocked"
        })
        self.assertIn("TikTok a refusé l’accès au flux", body)
        self.assertIn("bloqué", body)
        self.assertNotIn("blocked", body)

    def test_no_persistent_backend_fails_closed_instead_of_using_plyer(self):
        with self.assertRaises(WindowsNotificationsUnavailable):
            send_windows_notification("Titre", "Message", platform="win32")

    def test_injected_persistent_backend_receives_notification(self):
        api = Mock()

        self.assertTrue(send_windows_notification(
            "Titre", "Message", platform="win32", notification_api=api
        ))

        api.notify.assert_called_once_with(
            title="Titre", message="Message", app_name="Boitier Tiktok Live", timeout=8
        )

    def test_non_windows_still_rejects_notification(self):
        with self.assertRaises(WindowsNotificationsUnavailable):
            send_windows_notification("Titre", "Message", platform="linux", notification_api=Mock())


if __name__ == "__main__":
    unittest.main()
