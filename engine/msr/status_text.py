"""Localized status-detail text used by the desktop UI."""


def french_status_detail(detail, channel_key=""):
    """Translate brief UI details without hiding whether a check really failed.

    TikTok's plain ``timeout`` means the status check did not determine whether
    the creator is live, so spell out that the status is unknown. Confirmed
    offline results are represented by the separate ``Offline`` status.
    """
    value = str(detail or "")
    low = value.lower().strip()
    if channel_key.startswith("tiktok:") and low == "timeout":
        return "Vérification expirée — statut inconnu"
    exact = {
        "starting": "démarrage",
        "retry (streamlink)": "nouvel essai (streamlink)",
        "fallback (streamlink)": "solution de repli (streamlink)",
        "no cookie": "aucun cookie",
    }
    if low in exact:
        return exact[low]
    for prefix, translated in (("remuxing", "Conversion"), ("processing", "Traitement"),
                               ("checking", "Vérification"), ("retry", "Nouvel essai"),
                               ("fallback", "Solution de repli")):
        if low.startswith(prefix):
            suffix = value[len(prefix):].strip()
            return translated + (f" {suffix}" if suffix else "…")
    return value
