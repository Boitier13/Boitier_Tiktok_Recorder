# PyInstaller onedir target: portable ZIP (Python 3.12 x64 is embedded by PyInstaller).
# Build only on Windows with packaging/windows/build.ps1 after `npm run build`.
from pathlib import Path
import sys

from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).resolve().parents[1]
ENTRY = ROOT / "prototype" / "btl_vertical_host.py"
FRONTEND = ROOT / "frontend" / ".output" / "public"

if not (FRONTEND / "_shell.html").is_file():
    raise SystemExit("Frontend SPA absent; run `npm run build` in frontend before packaging.")

# The engine has a number of lazy imports through `from msr import ...`; collect the
# package as a whole so control commands and Windows spawn workers resolve in the bundle.
sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(ROOT / "prototype"))
hiddenimports = collect_submodules("msr")
datas = [
    (str(FRONTEND), "frontend/.output/public"),
    (str(ROOT / "prototype" / "ui"), "prototype/ui"),
    (str(ROOT / "engine" / "assets"), "engine/assets"),
    (str(ROOT / "frontend" / "public" / "brand"), "brand"),
    (str(ROOT / "engine" / "LICENSE"), "engine"),
    (str(ROOT / "engine" / "THIRD_PARTY_NOTICES.md"), "engine"),
]
binaries = []
for package in (
    "webview", "pystray", "PIL", "plyer", "yt_dlp", "streamlink",
    "curl_cffi", "websocket", "psutil", "colorama",
):
    package_datas, package_binaries, package_hidden = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hidden

analysis = Analysis(
    [str(ENTRY)],
    pathex=[str(ROOT), str(ROOT / "engine"), str(ROOT / "prototype")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["PyQt5", "PyQt6", "PySide2", "PySide6", "gi"],
    noarchive=False,
    optimize=1,
)
pyz = PYZ(analysis.pure)
exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="BoitierTiktokLive",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    icon=str(ROOT / "frontend" / "public" / "brand" / "btl-windows.ico"),
)
collect = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="BoitierTiktokLive",
)
