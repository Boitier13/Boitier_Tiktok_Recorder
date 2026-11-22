"""Reconnect polling schedule after a stream drops (ReconnectWindow)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from msr.worker import (
    ReconnectWindow,
    _recording_output_size,
    _should_report_stream_end,
)


class FakeClock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


class TestRecordingOutputSize(unittest.TestCase):
    def test_missing_or_empty_output_is_not_a_recording(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "capture.ts")
            self.assertEqual(_recording_output_size(path), 0)
            with open(path, "wb"):
                pass
            self.assertEqual(_recording_output_size(path), 0)

    def test_counts_written_raw_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "capture.ts")
            with open(path, "wb") as f:
                f.write(b"recorded media")
            self.assertEqual(_recording_output_size(path), len(b"recorded media"))

    def test_counts_ytdlp_mp4_extension_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "capture.ts")
            mp4_path = os.path.splitext(path)[0] + ".mp4"
            with open(mp4_path, "wb") as f:
                f.write(b"merged media")
            self.assertEqual(_recording_output_size(path), len(b"merged media"))


class TestStreamEndClassification(unittest.TestCase):
    def test_only_a_nonempty_unsplit_capture_counts_as_stream_end(self):
        self.assertFalse(_should_report_stream_end(False, False, 0))
        self.assertTrue(_should_report_stream_end(False, False, 1))
        self.assertFalse(_should_report_stream_end(False, True, 10))
        self.assertFalse(_should_report_stream_end(True, False, 10))


class TestReconnectWindow(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.win = ReconnectWindow(180, 600, clock=self.clock)

    def test_window_arms_at_first_poll_not_at_drop(self):
        self.win.reset()              # recording ended
        self.clock.t += 175           # 3-minute synchronous remux
        phase, remaining, sleep = self.win.next_poll()
        self.assertEqual(phase, "fast")
        self.assertEqual(remaining, 180)
        self.assertEqual(sleep, 15)

    def test_fast_then_extended_then_expired(self):
        self.assertEqual(self.win.next_poll()[0], "fast")
        self.clock.t += 179
        self.assertEqual(self.win.next_poll(), ("fast", 1, 15))
        self.clock.t += 1
        self.assertEqual(self.win.next_poll(), ("extended", 600, 30))
        self.clock.t += 599
        self.assertEqual(self.win.next_poll()[0], "extended")
        self.clock.t += 1
        self.assertEqual(self.win.next_poll(), ("expired", 0, None))

    def test_reset_starts_fresh_window(self):
        self.win.next_poll()
        self.clock.t += 10_000
        self.assertEqual(self.win.next_poll()[0], "expired")
        self.win.reset()
        self.assertEqual(self.win.next_poll()[0], "fast")

    def test_zero_extended_goes_straight_to_normal(self):
        win = ReconnectWindow(180, 0, clock=self.clock)
        win.next_poll()
        self.clock.t += 180
        self.assertEqual(win.next_poll()[0], "expired")


if __name__ == "__main__":
    unittest.main()
