"""Console entry point for the pinned yt-dlp package in the BTL portable bundle."""
import sys

from yt_dlp import main


if __name__ == "__main__":
    result = main()
    raise SystemExit(result if isinstance(result, int) else 0)
