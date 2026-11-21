# BTL Windows package — third-party notices and release gate

**Status: preparation only; not a legal clearance or a verified complete notice set.**
The dependency set below is a candidate lock generated on 2026-11-21. It has not
been installed or tested on Windows, and this document does not assert that the
licenses of every transitive dependency have been cleared for redistribution.
Do not publish a binary until the release gate at the end is complete.

## Direct Python dependencies

The exact versions are pinned in `requirements-win-x64-py312.lock`; the lock also
pins every transitive Python distribution and includes PyPI artifact SHA-256 hashes.
License labels here are preliminary project/package metadata, not a substitute for
the license texts shipped by each package.

| Distribution | Locked version | Preliminary license information |
|---|---:|---|
| yt-dlp (with `default` extra, including yt-dlp-ejs) | 2026.10.26 | Unlicense (verify packaged license text and EJS component notices) |
| Streamlink | 8.6.3 | BSD-2-Clause (verify package license and dependencies) |
| curl-cffi | 0.17.0 | MIT (verify included native cURL/BoringSSL notices) |
| psutil | 7.2.2 | BSD-3-Clause |
| Pillow | 13.0.0 | HPND; bundled codec/library notices may also apply |
| pywebview | 6.2.1 | BSD-3-Clause |
| pystray | 0.19.5 | LGPL-3.0 (desktop tray feature; assess how PyInstaller bundles it) |
| plyer | 2.1.0 | MIT |
| colorama | 0.4.6 | BSD-3-Clause |
| PyInstaller (build tool; special exception) | 6.22.3 | GPL-2.0-or-later with the PyInstaller exception; review the exception and bootloader notices |

## External recording tools

- `yt-dlp.exe` and `streamlink.exe` are console-mode PyInstaller launchers built
  from the hash-locked Python packages; their versions must match the lock and
  their `--version` smoke tests must pass in the final package. The packaging
  instructions include those checks, but they still require a Windows run.
- Microsoft Edge WebView2 Evergreen Runtime is an external Windows prerequisite;
  BTL checks its Edge Update registry entry at launch, explains how to install it,
  and falls back to the browser if the native shell cannot start. The runtime is
  serviced by Microsoft and is not bundled in this ZIP.
- FFmpeg and **ffprobe** are distributed together from the same Windows x64 LGPL
  archive. Candidate: BtbN `n9.0`, asset recorded in `tools-win-x64.lock.json`,
  SHA-256 `c6ba688c964ab8b2e5d357100a49be25491c60b5d48cdaac46d20ba0dded6260`.
  The URL's `latest` tag is mutable; the digest is therefore mandatory and any
  byte change must fail the build. This archive has not been downloaded or tested.
- BtbN describes its `lgpl` variant as excluding GPL-only libraries (notably
  libx264/libx265); that name alone is not proof of the actual contents or of
  LGPL compliance. Preserve the archive's license texts and configuration/build
  information, inspect `ffmpeg -buildconf`, `ffmpeg -L`, and `ffprobe -L`, and
  review every included codec/library's obligations before redistribution.
- Deno is not included in this BTL TikTok selection: it is not identified as
  required by the TikTok capture path. Revisit this if the chosen service path
  demonstrates a runtime need.

## Required before a public release

1. Generate a notice inventory from the actual Windows build environment for **all**
   distributions in the lock, including transitive packages and PyInstaller's
   bootloader. Include each applicable license text and copyright attribution in
   the portable package, not only this summary. Resolve missing/ambiguous SPDX
   identifiers and inspect native-wheel bundled licenses (especially curl-cffi,
   Pillow, pystray and cryptographic/network libraries).
2. For FFmpeg, verify the archive digest, exact binaries/version/build configuration,
   all `LICENSE`/`COPYING` files and component licenses. Include the required texts,
   notices, corresponding source/build information and any required written offer
   or relinkability materials for the exact LGPL build. Obtain a distribution review;
   do not infer clearance from the filename `lgpl`.
3. Verify yt-dlp, yt-dlp-ejs and Streamlink entry-point behavior in the frozen Windows
   package; document the executable and their notices. Run the build and smoke test
   on Windows x64 / CPython 3.12 x64.
4. Record the audited notice bundle and tool hashes alongside each release artifact.

## Sources consulted for this candidate inventory

- PyPI project metadata and artifact hashes for the locked Python releases (queried
  2026-11-21); license metadata may be incomplete or stale.
- BtbN FFmpeg-Builds README and release metadata: <https://github.com/FFmpeg-Builds/FFmpeg-Builds>
  and <https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/tag/latest>.
- FFmpeg licensing overview: <https://ffmpeg.org/legal.html>.
