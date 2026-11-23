"""Presentation text tests that do not require a Tk display."""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from msr.status_text import french_status_detail


class FrenchStatusDetailTests(unittest.TestCase):
    def test_tiktok_timeout_says_status_is_unknown(self):
        self.assertEqual(
            french_status_detail("timeout", channel_key="tiktok:@creator"),
            "Vérification expirée — statut inconnu",
        )

    def test_timeout_for_other_platforms_is_not_relabelled_as_offline(self):
        self.assertEqual(french_status_detail("timeout", channel_key="twitch:creator"), "timeout")

    def test_existing_detail_translations_are_preserved(self):
        self.assertEqual(french_status_detail("starting", channel_key="tiktok:creator"), "démarrage")
        self.assertEqual(french_status_detail("fallback (streamlink)"), "solution de repli (streamlink)")


if __name__ == "__main__":
    unittest.main()
