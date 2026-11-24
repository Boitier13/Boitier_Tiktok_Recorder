"""WebView2 production settings used by the native Windows shell."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from prototype.windows_desktop import (
    WindowsDesktopShell,
    cleanup_webview2_temp_profile,
    enable_edge_default_context_menus,
    webview2_temp_profile_dir,
)


class TestEdgeDefaultContextMenus(unittest.TestCase):
    def setUp(self):
        class FakeEdgeChrome:
            def __init__(self):
                self.original_calls = 0

            def on_webview_ready(self, _sender, _args):
                self.original_calls += 1
                return "initialized"

        self.edge_module = SimpleNamespace(EdgeChrome=FakeEdgeChrome)
        self.settings = SimpleNamespace(AreDefaultContextMenusEnabled=False)
        self.sender = SimpleNamespace(
            CoreWebView2=SimpleNamespace(Settings=self.settings)
        )
        self.args = SimpleNamespace(IsSuccess=True)

    def test_context_menu_is_enabled_after_pywebview_production_setup(self):
        enable_edge_default_context_menus(self.edge_module)
        backend = self.edge_module.EdgeChrome()

        result = backend.on_webview_ready(self.sender, self.args)

        self.assertEqual(result, "initialized")
        self.assertEqual(backend.original_calls, 1)
        self.assertTrue(self.settings.AreDefaultContextMenusEnabled)

    def test_failed_webview_initialization_does_not_touch_settings(self):
        enable_edge_default_context_menus(self.edge_module)
        self.args.IsSuccess = False
        backend = self.edge_module.EdgeChrome()

        backend.on_webview_ready(self.sender, self.args)

        self.assertFalse(self.settings.AreDefaultContextMenusEnabled)

    def test_patch_is_idempotent(self):
        enable_edge_default_context_menus(self.edge_module)
        patched = self.edge_module.EdgeChrome.on_webview_ready
        enable_edge_default_context_menus(self.edge_module)
        self.assertIs(self.edge_module.EdgeChrome.on_webview_ready, patched)

    def test_profile_uses_one_named_directory_under_temp(self):
        with tempfile.TemporaryDirectory() as temp_root:
            self.assertEqual(
                webview2_temp_profile_dir(temp_root),
                Path(temp_root) / "BoitierTiktokRecorder" / "WebView2",
            )

    def test_private_profile_is_cleaned_before_and_after_webview_run(self):
        with tempfile.TemporaryDirectory() as temp_root:
            profile = Path(temp_root) / "BoitierTiktokRecorder" / "WebView2"
            stale = profile / "old-cache"
            stale.parent.mkdir(parents=True)
            stale.write_bytes(b"stale")
            observed = {}

            class FakeEdgeChrome:
                def on_webview_ready(self, _sender, _args):
                    return None

            class FakeWebview:
                def start(self, **kwargs):
                    observed.update(kwargs)
                    self.profile = Path(kwargs["storage_path"])
                    self.profile.mkdir(parents=True)
                    (self.profile / "cache").write_bytes(b"private cache")

            shell = WindowsDesktopShell(
                "http://127.0.0.1/",
                webview_module=FakeWebview(),
                platform="win32",
                edgechromium_module=SimpleNamespace(EdgeChrome=FakeEdgeChrome),
                webview_profile_dir=profile,
            )
            shell.window = object()
            shell.run()

            self.assertTrue(observed["private_mode"])
            self.assertEqual(observed["storage_path"], str(profile))
            self.assertFalse(profile.exists())

    def test_profile_cleanup_retries_locked_cache(self):
        with tempfile.TemporaryDirectory() as temp_root:
            profile = Path(temp_root) / "BoitierTiktokRecorder" / "WebView2"
            (profile / "EBWebView").mkdir(parents=True)
            waits = []

            def remove_on_retry(_delay):
                waits.append(True)
                (profile / "EBWebView" / "cache.dat").unlink(missing_ok=True)

            (profile / "EBWebView" / "cache.dat").write_bytes(b"locked")
            # Simulate a transient Windows file lock: the first removal fails.
            import prototype.windows_desktop as desktop_module

            original = desktop_module.shutil.rmtree
            calls = []

            def flaky_rmtree(path):
                calls.append(path)
                if len(calls) == 1:
                    raise PermissionError("file is still held by Edge")
                original(path)

            desktop_module.shutil.rmtree = flaky_rmtree
            try:
                self.assertTrue(cleanup_webview2_temp_profile(profile, sleep=remove_on_retry))
            finally:
                desktop_module.shutil.rmtree = original
            self.assertEqual(len(waits), 1)
            self.assertFalse(profile.exists())


if __name__ == "__main__":
    unittest.main()
