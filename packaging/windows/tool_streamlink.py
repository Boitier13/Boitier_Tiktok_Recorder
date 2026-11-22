"""Console entry point for the pinned Streamlink package in the BTL portable bundle."""
import sys

from streamlink_cli.main import main


if __name__ == "__main__":
    result = main()
    raise SystemExit(result if isinstance(result, int) else 0)
