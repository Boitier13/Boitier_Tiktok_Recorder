from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "prototype"))

from prototype.btl_branding import brand_asset_path, brand_assets_dir
from windows_startup import WindowsStartup
from windows_tray import WindowsTray


class BtlBrandAssetTests(unittest.TestCase):
    def test_brand_files_are_available_in_the_frontend_public_assets(self):
        assets = brand_assets_dir()
        root = Path(__file__).resolve().parents[2]
        expected_dirs = {
            root / "frontend" / ".output" / "public" / "brand",
            root / "frontend" / "public" / "brand",
        }
        self.assertIn(assets, expected_dirs)
        for name in (
            "btl-windows.png",
            "btl-windows.ico",
            "btl-logo-primary.png",
            "btl-logo-compact.png",
            "btl-logo-compact.ico",
        ):
            with self.subTest(name=name):
                self.assertTrue(brand_asset_path(name).is_file())

    def test_png_source_dimensions_match_the_three_delivered_logos(self):
        expected = {
            "btl-windows.png": (258, 261),
            "btl-logo-primary.png": (355, 342),
            "btl-logo-compact.png": (356, 187),
        }
        for name, size in expected.items():
            with self.subTest(name=name), brand_asset_path(name).open("rb") as image:
                header = image.read(24)
            self.assertEqual(header[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", header[16:24]), size)

    def test_windows_icons_include_small_and_large_shell_sizes(self):
        expected = [16, 20, 24, 32, 40, 48, 64, 128, 256]
        for name in ("btl-windows.ico", "btl-logo-compact.ico"):
            with self.subTest(name=name), brand_asset_path(name).open("rb") as icon:
                data = icon.read()
            reserved, kind, count = struct.unpack("<HHH", data[:6])
            sizes = sorted((data[6 + 16 * i] or 256) for i in range(count))
            self.assertEqual((reserved, kind), (0, 1))
            self.assertEqual(sizes, expected)

    def test_tray_loads_the_symbol_only_logo(self):
        opened = []

        class LoadedImage:
            def convert(self, mode):
                self.mode = mode
                return self

            def resize(self, size, resampling):
                return (size, resampling)

        class FakeImageModule:
            Resampling = SimpleNamespace(LANCZOS=9)

            @staticmethod
            def open(path):
                opened.append(path)
                return LoadedImage()

        tray = WindowsTray(None, "", lambda: None, platform="win32", image_module=FakeImageModule)
        self.assertEqual(tray._make_icon(), ((64, 64), 9))
        self.assertEqual(opened, [str(brand_asset_path("btl-windows.png"))])

    def test_startup_shortcut_defaults_to_the_compact_logo_ico(self):
        startup = WindowsStartup(Path("data"), platform="win32", folder=Path("startup"))
        self.assertEqual(startup.icon, brand_asset_path("btl-logo-compact.ico"))


if __name__ == "__main__":
    unittest.main()
