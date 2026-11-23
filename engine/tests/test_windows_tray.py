"""BTL notifications reuse the single persistent notification-area icon."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from prototype.windows_tray import TrayUnavailable, WindowsTray


class WindowsTrayNotificationTests(unittest.TestCase):
    def make_tray(self):
        tray = WindowsTray(object(), "http://localhost/", lambda: None, platform="win32")
        tray.icon = SimpleNamespace(visible=True, notify=Mock())
        tray.thread = SimpleNamespace(is_alive=lambda: True)
        return tray

    def test_notification_uses_existing_icon_and_reverses_pystray_argument_order(self):
        tray = self.make_tray()

        self.assertTrue(tray.notify("LIVE détecté", "@créateur est en direct."))

        tray.icon.notify.assert_called_once_with("@créateur est en direct.", "LIVE détecté")

    def test_notification_is_rejected_if_tray_icon_is_not_ready(self):
        tray = self.make_tray()
        tray.icon.visible = False

        with self.assertRaises(TrayUnavailable):
            tray.notify("Titre", "Message")
        tray.icon.notify.assert_not_called()

    def test_notification_is_rejected_if_icon_backend_cannot_notify(self):
        tray = self.make_tray()
        tray.icon.notify = None

        with self.assertRaises(TrayUnavailable):
            tray.notify("Titre", "Message")


if __name__ == "__main__":
    unittest.main()
