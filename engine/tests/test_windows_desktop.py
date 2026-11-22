"""WebView2 production settings used by the native Windows shell."""
import unittest
from types import SimpleNamespace

from prototype.windows_desktop import enable_edge_default_context_menus


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


if __name__ == "__main__":
    unittest.main()
