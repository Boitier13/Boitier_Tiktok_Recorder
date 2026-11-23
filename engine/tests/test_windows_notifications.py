"""Windows notification bridge never falls back to Plyer's per-notification tray icon."""
import unittest
from unittest.mock import Mock

from prototype.windows_notifications import (
    WindowsNotificationsUnavailable,
    send_windows_notification,
)


class WindowsNotificationBridgeTests(unittest.TestCase):
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
