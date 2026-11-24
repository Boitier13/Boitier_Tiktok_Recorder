"""Resolve BTL's own brand assets in source and frozen Windows builds."""
from __future__ import annotations

import sys
from pathlib import Path


def brand_assets_dir() -> Path:
    """Return the bundled/source brand directory without coupling BTL to MSR assets."""
    bundle_root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    candidates = (
        bundle_root / "brand",
        bundle_root / "frontend" / ".output" / "public" / "brand",
        bundle_root / "frontend" / "public" / "brand",
    )
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    # Keep a deterministic path for useful missing-asset errors and tests.
    return candidates[0] if getattr(sys, "frozen", False) else candidates[2]


def brand_asset_path(name: str) -> Path:
    """Resolve one flat asset name from BTL's branded asset directory."""
    if Path(name).name != name:
        raise ValueError("Brand asset name must be a plain filename.")
    return brand_assets_dir() / name
