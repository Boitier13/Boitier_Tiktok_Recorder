"""The About text (Tk-free so it can be tested). The GUI shows it in a themed info dialog."""

from __future__ import annotations

import os

SITES = ("Enregistre les directs de Kick, Twitch, YouTube, Rumble, TikTok "
         "et des sites compatibles avec yt-dlp (ou un lien .m3u8 direct). Fishtank.live est intégré ; "
         "ses caméras changent à chaque saison.")
DISCLAIMER = ("Utilisez ce logiciel de manière responsable. Vous devez respecter les conditions d’utilisation "
              "de chaque site et les lois locales, notamment pour les sites réservés aux adultes. L’auteur "
              "n’est pas responsable de l’usage de ce logiciel. Le fichier cookies.txt donne accès à votre compte : ne le partagez jamais.")


def tool_lines(deps_module) -> list[str]:
    d = deps_module
    return [
        f"yt-dlp {d.YTDLP_VERSION}" if d.HAS_YTDLP else "yt-dlp : introuvable",
        f"streamlink {d.STREAMLINK_VERSION}" if d.HAS_STREAMLINK else "streamlink : introuvable",
        f"ffmpeg {d.FFMPEG_VERSION}" if d.HAS_FFMPEG else "ffmpeg : introuvable",
        f"deno {d.DENO_VERSION}" if d.HAS_DENO else "deno : introuvable (recommandé pour YouTube)",
    ]


def package_line(version_of=None) -> str:
    from msr import depsupdate
    version_of = version_of or depsupdate.installed_version
    parts = []
    for dist, label, kind in depsupdate.PACKAGES:
        if kind == "tool":
            continue                       # yt-dlp / streamlink are listed with the tools
        v = version_of(dist)
        parts.append(f"{label} {v}" if v else f"{label} (introuvable)")
    return ", ".join(parts)


def environment_line(in_venv: bool, python_version: str) -> str:
    if in_venv:
        return f"Python {python_version} dans l’environnement dédié de MSR (.venv)."
    return f"Python {python_version}, hors de l’environnement dédié de MSR (.venv) (mise à jour des composants désactivée)."


def about_text(version: str, *, tools: list[str], packages: str, environment: str,
               streams: str, clips: str, data_dir: str) -> str:
    return "\n".join([
        f"Multi-Stream Recorder v{version}",
        "",
        SITES,
        "",
        "Outils : " + " \u00b7 ".join(tools),
        "Composants Python : " + packages,
        environment,
        "Vérifiez les versions et mettez les composants à jour avec le bouton Mises à jour\u2026.",
        "",
        f"Enregistrements : {streams}",
        f"Clips et captures d’écran : {clips}",
        f"Paramètres (config.ini, channels.json, cookies.txt) : {data_dir}",
        "Pour déplacer les captures ou les clips, modifiez streams_dir / clips_dir dans config.ini, "
        "puis quittez complètement l’application (Ctrl+Q) et relancez-la.",
        "",
        "Les scripts et outils automatisés peuvent piloter MSR avec msr_ctl.py (voir docs/AGENT_GUIDE.md).",
        "",
        DISCLAIMER,
    ])


def about_for(config, version: str) -> str:
    """The text for this running copy."""
    import sys
    from msr import deps, venv
    streams = config.get("Paths", "streams_dir")
    clips = (config.get("Clipping", "clips_dir", fallback="") or "").strip() or os.path.join(streams, "Clips")
    data_dir = os.path.dirname(os.path.abspath(getattr(config, "config_file", "config.ini")))
    return about_text(version, tools=tool_lines(deps), packages=package_line(),
                      environment=environment_line(venv.in_venv(), sys.version.split()[0]),
                      streams=streams, clips=clips, data_dir=data_dir)
