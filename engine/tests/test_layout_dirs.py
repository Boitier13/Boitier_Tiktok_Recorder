"""Linux reuses an existing recordings folder whose name differs only by case.

Windows keeps the spelled path (``Processed``). These tests force both behaviours
so a case-insensitive volume and a case-sensitive one each prove their half.
Nothing here writes outside a temporary directory.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from msr.util import (
    PENDING_DELETION_FOLDER, PROCESSED_FOLDER, RECORDED_FOLDER,
    channel_record_dirs, layout_bases, linux_reuses_dir_case, prefer_dir,
    migrate_legacy_layout_folders, read_layout_paths, recorded_scan_bases,
    reuse_dir, reuse_path,
)


def _sensitive(folder: Path) -> bool:
    low, high = folder / "aa", folder / "Aa"
    low.mkdir()
    try:
        high.mkdir()
    except FileExistsError:
        return False
    try:
        return not os.path.samefile(low, high)
    finally:
        if high.exists() and not os.path.samefile(low, high):
            high.rmdir()
        low.rmdir()


class ReuseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "streams"
        self.root.mkdir()

    def test_windows_spelling_is_not_rewritten(self):
        (self.root / PROCESSED_FOLDER.lower()).mkdir()
        got = reuse_dir(str(self.root), "Processed", reuse=False)
        self.assertEqual(got, os.path.join(str(self.root), PROCESSED_FOLDER))
        recorded, processed, pending = channel_record_dirs(str(self.root), "kick", "alice", reuse=False)
        self.assertTrue(processed.endswith(os.path.join(PROCESSED_FOLDER, "kick", "alice")))
        self.assertTrue(recorded.endswith(os.path.join(RECORDED_FOLDER, "kick", "alice")))
        self.assertTrue(pending.endswith(os.path.join(PENDING_DELETION_FOLDER, "kick", "alice")))
        # On a case-insensitive volume the canonical and lowercase French names
        # refer to the same directory, so existence cannot prove a sibling.
        # The listing still has exactly the name we made: reuse did not add one.
        spellings = [p.name for p in self.root.iterdir()
                     if p.name.lower() == PROCESSED_FOLDER.lower()]
        self.assertEqual(spellings, [PROCESSED_FOLDER.lower()])

    def test_linux_reuses_the_existing_tree_and_does_not_create_a_sibling(self):
        if not _sensitive(self.root):
            self.skipTest("this volume cannot hold two spellings of one name")
        old = self.root / PROCESSED_FOLDER.lower() / "Kick" / "Alice"
        old.mkdir(parents=True)
        (old / "old.mp4").write_bytes(b"x" * 50)
        recorded, processed, pending = channel_record_dirs(str(self.root), "kick", "alice", reuse=True)
        self.assertEqual(processed, str(old))
        os.makedirs(recorded, exist_ok=True)
        os.makedirs(processed, exist_ok=True)
        os.makedirs(pending, exist_ok=True)
        self.assertFalse((self.root / PROCESSED_FOLDER).exists())
        self.assertTrue((self.root / PROCESSED_FOLDER.lower() / "Kick" / "Alice").is_dir())
        self.assertTrue((self.root / RECORDED_FOLDER / "kick" / "alice").is_dir())
        self.assertTrue((self.root / PENDING_DELETION_FOLDER).is_dir())
        # a channel folder that is not there yet keeps today's spelling, under the old top folder
        fresh = reuse_path(str(self.root / "processed"), "twitch", "newname", reuse=True)
        self.assertEqual(fresh, str(self.root / "processed" / "twitch" / "newname"))

    def test_when_both_spellings_exist_the_fuller_one_is_used(self):
        if not _sensitive(self.root):
            self.skipTest("this volume cannot hold two spellings of one name")
        low = self.root / PROCESSED_FOLDER.lower() / "kick" / "a"
        high = self.root / PROCESSED_FOLDER / "kick" / "a"
        low.mkdir(parents=True)
        high.mkdir(parents=True)
        for i in range(6):
            (low / f"f{i}.mp4").write_bytes(b"x")
        (high / "only.mp4").write_bytes(b"x")
        self.assertEqual(os.path.basename(prefer_dir([str(low.parent.parent), str(high.parent.parent)], "Processed")),
                         PROCESSED_FOLDER.lower())
        self.assertEqual(reuse_dir(str(self.root), "Processed", reuse=True),
                         str(self.root / PROCESSED_FOLDER.lower()))
        # the small capitalized tree is the one to use when it holds more
        for i in range(20):
            (high / f"more{i}.mp4").write_bytes(b"x")
        self.assertEqual(reuse_dir(str(self.root), "Processed", reuse=True), str(self.root / PROCESSED_FOLDER))

    def test_recorded_scan_sees_case_variants_on_linux_only(self):
        lower = self.root / RECORDED_FOLDER.lower()
        lower.mkdir()
        one = recorded_scan_bases(str(self.root), os.path.join(str(self.root), RECORDED_FOLDER))
        expected_one = [os.path.join(str(self.root), RECORDED_FOLDER)]
        if sys.platform.startswith("linux"):
            expected_one.append(str(lower))
        self.assertEqual(one, expected_one)
        if not _sensitive(self.root):
            return
        canonical = self.root / RECORDED_FOLDER
        canonical.mkdir()
        if not sys.platform.startswith("linux"):
            self.assertEqual(len(recorded_scan_bases(str(self.root), str(canonical))), 1)
            return
        found = recorded_scan_bases(str(self.root), str(canonical))
        self.assertEqual({os.path.basename(p) for p in found}, {RECORDED_FOLDER, RECORDED_FOLDER.lower()})

    def test_layout_bases_prefer_what_is_already_there(self):
        if not sys.platform.startswith("linux"):
            bases = layout_bases(str(self.root))
            self.assertEqual(bases[1], os.path.join(str(self.root), PROCESSED_FOLDER))
            return
        if not _sensitive(self.root):
            self.skipTest("this volume cannot hold two spellings of one name")
        (self.root / PROCESSED_FOLDER.lower()).mkdir()
        (self.root / RECORDED_FOLDER.lower()).mkdir()
        recorded, processed, pending = layout_bases(str(self.root))
        self.assertEqual(os.path.basename(recorded), RECORDED_FOLDER.lower())
        self.assertEqual(os.path.basename(processed), PROCESSED_FOLDER.lower())
        self.assertEqual(os.path.basename(pending), PENDING_DELETION_FOLDER)

    def test_windows_answer_ignores_a_second_spelling(self):
        """reuse=False is what Windows does. It has to pass on Linux too.

        The first cut of the Linux folder change (PR #9) failed Windows CI:
        a case-sensitive assertion. Passing the flag here checks the Windows
        answer where this file is written, which is usually Linux."""
        if not _sensitive(self.root):
            self.skipTest("this volume cannot hold two spellings of one name")
        (self.root / RECORDED_FOLDER).mkdir()
        (self.root / RECORDED_FOLDER.lower()).mkdir()
        (self.root / PROCESSED_FOLDER.lower() / "kick").mkdir(parents=True)
        primary = str(self.root / RECORDED_FOLDER)
        self.assertEqual(
            recorded_scan_bases(str(self.root), primary, reuse=False), [primary])
        self.assertEqual(
            {os.path.basename(p) for p in recorded_scan_bases(str(self.root), primary, reuse=True)},
            {RECORDED_FOLDER, RECORDED_FOLDER.lower()})
        spelled = os.path.join(str(self.root), PROCESSED_FOLDER, "kick")
        self.assertEqual(
            read_layout_paths(str(self.root), "Processed", "kick", reuse=False), [spelled])
        self.assertEqual(
            read_layout_paths(str(self.root), "Processed", "kick", reuse=True),
            [str(self.root / PROCESSED_FOLDER.lower() / "kick")])

    def test_legacy_roots_merge_without_overwriting_and_update_undo_manifest(self):
        old = self.root / "Processed" / "tiktok" / "alice" / "live.mp4"
        old.parent.mkdir(parents=True)
        old.write_bytes(b"legacy version")
        canonical = self.root / PROCESSED_FOLDER / "tiktok" / "alice" / "live.mp4"
        canonical.parent.mkdir(parents=True)
        canonical.write_bytes(b"french version")
        pending = self.root / "PendingDeletion" / "tiktok" / "alice" / "gone.ts"
        pending.parent.mkdir(parents=True)
        pending.write_bytes(b"recover me")
        manifest = self.root.parent / "library_moves.json"
        manifest.write_text(json.dumps({"moves": [{
            "pending": str(pending), "original": str(old),
        }]}), encoding="utf-8")
        self.addCleanup(lambda: manifest.unlink(missing_ok=True))

        renamed = migrate_legacy_layout_folders(str(self.root), str(manifest))
        moves = json.loads(manifest.read_text(encoding="utf-8"))["moves"][0]
        preserved = self.root / PROCESSED_FOLDER / "tiktok" / "alice" / "live (copie 1).mp4"
        self.assertEqual(renamed, {"Processed": PROCESSED_FOLDER, "PendingDeletion": PENDING_DELETION_FOLDER})
        self.assertFalse((self.root / "Processed").exists())
        self.assertFalse((self.root / "PendingDeletion").exists())
        self.assertEqual(canonical.read_bytes(), b"french version")
        self.assertEqual(preserved.read_bytes(), b"legacy version")
        self.assertEqual(Path(moves["pending"]), self.root / PENDING_DELETION_FOLDER / "tiktok" / "alice" / "gone.ts")
        self.assertEqual(Path(moves["original"]), preserved)

    def test_platform_argument_is_the_windows_switch(self):
        self.assertFalse(linux_reuses_dir_case("win32"))
        self.assertFalse(linux_reuses_dir_case("darwin"))
        self.assertTrue(linux_reuses_dir_case("linux"))
        self.assertEqual(linux_reuses_dir_case(), sys.platform.startswith("linux"))


if __name__ == "__main__":
    unittest.main()
