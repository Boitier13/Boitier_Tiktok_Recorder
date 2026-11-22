"""Transient startup behavior for the bundled Windows capture-tool launchers."""
import unittest
from types import SimpleNamespace

from prototype.btl_vertical_host import _capture_tool_version


class CaptureToolPreflightTests(unittest.TestCase):
    def test_retries_a_transient_launcher_failure(self):
        calls = []
        diagnostics = {}

        def runner(argv, **_kwargs):
            calls.append(argv)
            if len(calls) == 1:
                return SimpleNamespace(returncode=1, stdout="", stderr="temporary startup failure")
            return SimpleNamespace(returncode=0, stdout="2026.10.26\n", stderr="")

        version = _capture_tool_version(
            "yt-dlp.exe", ["--version"], runner=runner, diagnostics=diagnostics,
            diagnostic_key="yt-dlp", retries=2, retry_delay=0, total_timeout=5,
        )

        self.assertEqual(version, "2026.10.26")
        self.assertEqual(len(calls), 2)
        self.assertIn("tentative 2/3", diagnostics["yt-dlp"])

    def test_missing_executable_fails_without_retries(self):
        calls = []

        def runner(argv, **_kwargs):
            calls.append(argv)
            raise FileNotFoundError("yt-dlp.exe missing")

        diagnostics = {}
        version = _capture_tool_version(
            "yt-dlp.exe", ["--version"], runner=runner, diagnostics=diagnostics,
            diagnostic_key="yt-dlp", retries=2, retry_delay=0, total_timeout=5,
        )

        self.assertIsNone(version)
        self.assertEqual(len(calls), 1)
        self.assertIn("FileNotFoundError", diagnostics["yt-dlp"])


if __name__ == "__main__":
    unittest.main()
