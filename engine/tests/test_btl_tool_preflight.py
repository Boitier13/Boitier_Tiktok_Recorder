"""Transient startup behavior for the bundled Windows capture-tool launchers."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from prototype.btl_vertical_host import (
    _capture_tool_presence,
    _capture_tool_version,
    _seed_engine_tool_presence,
)


class CaptureToolPreflightTests(unittest.TestCase):
    def test_startup_cache_is_seeded_from_presence_without_launching_tools(self):
        with tempfile.TemporaryDirectory() as tmp:
            commands = {}
            for name in ("yt-dlp", "streamlink", "ffmpeg", "ffprobe"):
                path = Path(tmp) / f"{name}.exe"
                path.touch()
                commands[name] = str(path)
            commands["ffprobe"] = str(Path(tmp) / "missing-ffprobe.exe")
            env = {}
            with patch("prototype.btl_vertical_host.shutil.which", return_value=None):
                with patch("prototype.btl_vertical_host.subprocess.run",
                           side_effect=AssertionError("must not spawn")):
                    self.assertTrue(_seed_engine_tool_presence(commands, environ=env))

        self.assertIn('"yt-dlp": "present"', env["MSR_TOOL_VERSIONS"])
        self.assertIn('"ffprobe": null', env["MSR_TOOL_VERSIONS"])
        self.assertIn('"deno": null', env["MSR_TOOL_VERSIONS"])

    def test_valid_startup_cache_is_preserved(self):
        env = {"MSR_TOOL_VERSIONS": '{"yt-dlp":"cached","streamlink":null,"ffmpeg":"cached"}'}
        with patch("prototype.btl_vertical_host._capture_tool_presence", side_effect=AssertionError("must not rescan")):
            self.assertFalse(_seed_engine_tool_presence({}, environ=env))
        self.assertEqual(env["MSR_TOOL_VERSIONS"],
                         '{"yt-dlp":"cached","streamlink":null,"ffmpeg":"cached"}')

    def test_quick_presence_gate_does_not_launch_tools(self):
        with tempfile.TemporaryDirectory() as tmp:
            commands = {}
            for name in ("yt-dlp", "streamlink", "ffmpeg", "ffprobe"):
                path = Path(tmp) / f"{name}.exe"
                path.touch()
                commands[name] = str(path)
            commands["ffprobe"] = str(Path(tmp) / "missing-ffprobe.exe")
            with patch("prototype.btl_vertical_host._sync_engine_tool_status") as sync:
                status = _capture_tool_presence(commands)
            self.assertEqual(status, {
                "yt-dlp": "present", "streamlink": "present", "ffmpeg": "present", "ffprobe": None,
            })
            sync.assert_not_called()

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
