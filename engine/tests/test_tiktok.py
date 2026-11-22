"""TikTok live-status parsers used when yt-dlp reports offline."""
import configparser
import json
import os
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from msr.platforms import (
    build_recording_command_streamlink,
    check_tiktok_live_webcast,
    build_recording_command_tiktok_flv,
    tiktok_parse_api_live_room,
    tiktok_room_id_from_html,
    tiktok_stream_url_from_api,
)


class TiktokRoomIdFromHtmlTests(unittest.TestCase):
    def test_quoted_room_id(self):
        html = '{"user":{"uniqueId":"aljazeeraenglish","roomId":"7555123499"}}'
        self.assertEqual(tiktok_room_id_from_html(html), "7555123499")

    def test_unquoted_room_id(self):
        html = '{"roomId": 7555123499, "status": 2}'
        self.assertEqual(tiktok_room_id_from_html(html), "7555123499")

    def test_missing(self):
        self.assertIsNone(tiktok_room_id_from_html("<html>captcha</html>"))
        self.assertIsNone(tiktok_room_id_from_html(""))
        self.assertIsNone(tiktok_room_id_from_html(None))


class TiktokDirectStreamTests(unittest.TestCase):
    @staticmethod
    def api_data():
        variants = {
            "data": {
                "LD": {"main": {"flv": "https://cdn.invalid/low.flv?sig=low"}},
                "SD1": {"main": "https://cdn.invalid/sd.flv?sig=sd"},
                "HD1": {"main": "https://cdn.invalid/hd.flv?sig=hd"},
                "ORIGIN": {"main": "https://cdn.invalid/origin.flv?sig=origin"},
            }
        }
        return {
            "data": {
                "liveRoom": {
                    "streamData": {
                        "pull_data": {"stream_data": json.dumps(variants)},
                    },
                },
            },
        }

    def test_api_stream_variants_respect_quality_and_best(self):
        data = self.api_data()
        self.assertEqual(
            tiktok_stream_url_from_api(data, "480p"),
            "https://cdn.invalid/sd.flv?sig=sd",
        )
        self.assertEqual(
            tiktok_stream_url_from_api(data, "best"),
            "https://cdn.invalid/origin.flv?sig=origin",
        )

    def test_invalid_or_missing_signed_url_is_ignored(self):
        data = self.api_data()
        data["data"]["liveRoom"]["streamData"]["pull_data"]["stream_data"] = "{"
        self.assertIsNone(tiktok_stream_url_from_api(data, "best"))
        self.assertIsNone(tiktok_stream_url_from_api({}, "best"))

    @patch("msr.platforms._tiktok_http_get")
    def test_live_api_check_returns_direct_url_without_logging_it(self, get):
        data = self.api_data()
        data["data"]["user"] = {"status": 2, "roomId": "123"}
        data["data"]["liveRoom"].update({"status": 2, "roomId": "123", "title": "Live"})
        get.return_value = json.dumps(data)
        logger = Mock()

        result = check_tiktok_live_webcast(
            "@sample", None, logger, timeout=1, quality="480p"
        )

        self.assertEqual(result, (
            True, "123", "Live", None, "https://cdn.invalid/sd.flv?sig=sd"
        ))
        self.assertNotIn("sig=sd", " ".join(str(call) for call in logger.mock_calls))

    def test_direct_ffmpeg_command_uses_headers_and_writes_ts(self):
        config = configparser.ConfigParser()
        cmd = build_recording_command_tiktok_flv(
            "https://cdn.invalid/live.flv?sig=secret", "capture.ts", config, verbose=False
        )
        self.assertEqual(cmd[0], "ffmpeg")
        self.assertIn("User-Agent: ", cmd[cmd.index("-headers") + 1])
        self.assertIn("Referer: https://www.tiktok.com/", cmd[cmd.index("-headers") + 1])
        self.assertIn("-c", cmd)
        self.assertIn("copy", cmd)
        self.assertEqual(cmd[-1], "capture.ts")


class TiktokStreamlinkCommandTests(unittest.TestCase):
    def test_tiktok_capture_uses_browser_headers(self):
        cmd = build_recording_command_streamlink(
            "https://www.tiktok.com/@sample/live",
            "capture.ts",
            "480p",
            "tiktok",
            None,
            verbose=False,
            streamlink_debug=False,
        )

        self.assertIn(
            "User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            cmd,
        )
        self.assertIn("Accept-Language=en-US,en;q=0.9", cmd)
        self.assertIn("--http-header", cmd)
        self.assertIn("--loglevel", cmd)
        self.assertEqual(cmd[cmd.index("https://www.tiktok.com/@sample/live") + 1], "480p")


class TiktokParseApiLiveRoomTests(unittest.TestCase):
    def test_live_user_and_room_status_2(self):
        data = {
            "data": {
                "user": {"uniqueId": "aljazeeraenglish", "roomId": "111", "status": 2},
                "liveRoom": {"title": "Al Jazeera English TT Live", "status": 2},
            }
        }
        live, room_id, title = tiktok_parse_api_live_room(data)
        self.assertTrue(live)
        self.assertEqual(room_id, "111")
        self.assertEqual(title, "Al Jazeera English TT Live")

    def test_ended_keeps_room_id_but_not_live(self):
        data = {
            "data": {
                "user": {"roomId": "222", "status": 4},
                "liveRoom": {"title": "press conference", "status": 4},
            }
        }
        live, room_id, title = tiktok_parse_api_live_room(data)
        self.assertFalse(live)
        self.assertEqual(room_id, "222")
        self.assertEqual(title, "press conference")

    def test_live_if_only_live_room_status_is_2(self):
        data = {
            "data": {
                "user": {"roomId": 333, "status": 4},
                "liveRoom": {"status": 2, "title": "still up"},
            }
        }
        live, room_id, title = tiktok_parse_api_live_room(data)
        self.assertTrue(live)
        self.assertEqual(room_id, "333")
        self.assertEqual(title, "still up")

    def test_garbage(self):
        self.assertEqual(tiktok_parse_api_live_room({}), (False, None, None))
        self.assertEqual(tiktok_parse_api_live_room(None), (False, None, None))
