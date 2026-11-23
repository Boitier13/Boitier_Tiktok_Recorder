"""Updates dialog: installed/latest/status per dependency, Check now, Update selected, Update all.

Network and pip run in a worker thread; the worker only puts results on a queue that after()
drains, so Tk is touched from the main thread only.
"""

from __future__ import annotations

import logging
import queue
import threading
import tkinter as tk
from tkinter import ttk

from msr import dialogs, depsupdate

STATUS_TEXT = {
    "up_to_date": "À jour", "update_available": "Mise à jour disponible", "not_installed": "Non installé",
    "unknown": "Vérification impossible", "unchecked": "Pas encore vérifié", "external": "Géré hors de MSR",
}
COLUMNS = (("label", "Composant", 170), ("installed", "Installé", 170), ("latest", "Dernière version", 110),
           ("status", "État", 140), ("source", "Source / note", 330))


def open_deps_dialog(parent, *, config, state_file, ffmpeg_path="ffmpeg", on_msr_update=None,
                     on_badge=None, on_checked=None, check_now=True):
    """Open (or raise) the dialog.

    ``on_msr_update(row, parent=win)`` starts the app update from the release this dialog just
    found (tag, url, zipball on the row). It asks the one confirmation itself and returns True
    when the update has started, so this dialog does not ask again. ``on_badge(names)`` and
    ``on_checked(rows)`` tell the main window about the badge and the header banner.
    """
    existing = getattr(parent, "_msr_deps_dialog", None)
    if existing is not None and existing.winfo_exists():
        existing.deiconify(); existing.lift(); existing.focus_force()
        return existing
    win, frame = dialogs.new_dialog(parent, "Mises à jour")
    parent._msr_deps_dialog = win
    q: queue.Queue = queue.Queue()
    state = {"rows": depsupdate.rows(False, ffmpeg_path=ffmpeg_path), "busy": False, "job": None}

    ttk.Label(frame, text="Outils et composants utilisés par Multi-Stream Recorder. Les mises à jour se font en arrière-plan ; "
                          "les captures en cours gardent leur version, les prochaines utiliseront la nouvelle.",
              wraplength=900, justify="left").pack(anchor="w", pady=(0, 8))
    tree = ttk.Treeview(frame, columns=[c[0] for c in COLUMNS], show="headings", height=11, selectmode="extended")
    for key, title, width in COLUMNS:
        tree.heading(key, text=title)
        tree.column(key, width=width, anchor="w", stretch=key == "source")
    tree.pack(fill="both", expand=True)
    msg = ttk.Label(frame, text="", wraplength=900, justify="left")
    msg.pack(anchor="w", fill="x", pady=(8, 4))

    daily = tk.BooleanVar(value=config.getboolean("Updates", "daily_check", fallback=True))

    def _daily_changed():
        if not config.config.has_section("Updates"):
            config.config.add_section("Updates")
        config.config.set("Updates", "daily_check", "true" if daily.get() else "false")
        config.save()
    ttk.Checkbutton(frame, text="Rechercher les mises à jour une fois par jour en arrière-plan", variable=daily,
                    command=_daily_changed).pack(anchor="w")

    bar = ttk.Frame(frame)
    bar.pack(fill="x", pady=(10, 0))
    btn_check = ttk.Button(bar, text="Vérifier maintenant", command=lambda: _check())
    btn_sel = ttk.Button(bar, text="Mettre à jour la sélection", command=lambda: _update(_selected()))
    btn_all = ttk.Button(bar, text="Tout mettre à jour", command=lambda: _update(_all_updatable()))
    btn_close = ttk.Button(bar, text="Fermer", command=lambda: _close())
    for b in (btn_check, btn_sel, btn_all):
        b.pack(side="left", padx=(0, 6))
    btn_close.pack(side="right")

    def _fill():
        tree.delete(*tree.get_children())
        for r in state["rows"]:
            note = r.get("note") or ""
            src = r.get("source") or ""
            tree.insert("", "end", iid=r["name"], values=(
                r["label"], r.get("installed") or "\u2014", r.get("latest") or "\u2014",
                STATUS_TEXT.get(r["status"], r["status"]), f"{src}  {note}".strip()))
        if on_badge:
            on_badge(depsupdate.updates_available(state["rows"]))
        if on_checked:
            on_checked(state["rows"])
        _buttons()

    def _buttons():
        st = "disabled" if state["busy"] else "normal"
        for b in (btn_check, btn_sel, btn_all):
            b.configure(state=st)

    def _selected():
        return list(tree.selection())

    def _all_updatable():
        # MSR is included. Its updater asks once and, if it starts, restarts the app, so the
        # package installs below are skipped. Declining leaves those packages to update.
        return [r["name"] for r in state["rows"] if r.get("updatable")]

    def _work(fn, kind):
        state["busy"] = True
        _buttons()
        def run():
            try:
                q.put((kind, fn()))
            except Exception as e:     # never let the worker die silently
                q.put(("error", f"{type(e).__name__}: {e}"))
        threading.Thread(target=run, daemon=True, name=f"deps-{kind}").start()

    def _check():
        if state["busy"]:
            return
        msg.configure(text="Vérification\u2026")
        def fn():
            rs = depsupdate.rows(True, ffmpeg_path=ffmpeg_path)
            try:
                depsupdate.remember(state_file, rs)
            except Exception:
                pass
            return rs
        _work(fn, "rows")

    def _update(names):
        if state["busy"]:
            return
        by = {r["name"]: r for r in state["rows"]}
        if "msr" in names:
            # The app update stops recordings and restarts. It is not a pip install, and it asks
            # its own single confirmation (zip, git pull, or restart). Declining it leaves any
            # packages in this same click free to update.
            row = by.get("msr") or {}
            names = [n for n in names if n != "msr"]
            if row.get("updatable") and on_msr_update:
                try:
                    started = bool(on_msr_update(row, parent=win))
                except Exception as exc:
                    logging.exception("App update did not start")
                    dialogs.show_error(win, "Mise à jour impossible", f"Impossible de démarrer la mise à jour.\n\n{exc}")
                    return
                if started and win.winfo_exists():
                    _close()
                    return
                if not names:
                    return
        skipped = [by[n]["label"] for n in names if n in by and not by[n].get("updatable")]
        names = [n for n in names if n in by and by[n].get("updatable")]
        if not names:
            msg.configure(text="Aucune mise à jour à effectuer" + (f" ({', '.join(skipped)} ne peuvent pas être mis à jour ici)." if skipped
                                                     else ". Lancez d’abord une vérification."))
            return
        msg.configure(text=f"Updating {', '.join(names)}\u2026 (les captures continuent)")
        def fn():
            res = depsupdate.update_packages(names, log=lambda line: q.put(("log", line)))
            return res, depsupdate.rows(True, ffmpeg_path=ffmpeg_path)
        _work(fn, "update")

    def _drain():
        try:
            while True:
                kind, payload = q.get_nowait()
                if kind == "log":
                    msg.configure(text=payload)
                    continue
                state["busy"] = False
                if kind == "rows":
                    state["rows"] = payload
                    msg.configure(text=depsupdate.summary_text(payload))
                elif kind == "update":
                    res, rs = payload
                    state["rows"] = rs
                    msg.configure(text=summary(res))
                else:
                    msg.configure(text=f"Échec : {payload}")
                _fill()
        except queue.Empty:
            pass
        if win.winfo_exists():
            state["job"] = win.after(150, _drain)

    def _close():
        if state["job"]:
            try:
                win.after_cancel(state["job"])
            except tk.TclError:
                pass
        parent._msr_deps_dialog = None
        win.destroy()

    win.protocol("WM_DELETE_WINDOW", _close)
    win.bind("<Escape>", lambda e: _close())
    _fill()
    dialogs.present(win, parent)
    state["job"] = win.after(150, _drain)
    if check_now:
        _check()
    win._deps_state = state      # tests
    return win


def summary(results) -> str:
    ok = [f"{r['name']} {r.get('old') or '-'} -> {r.get('new')}" for r in results if r.get("ok")]
    bad = [f"{r['name']}: {r.get('error')}" + (" (version précédente restaurée)" if r.get("rolled_back") else "")
           for r in results if not r.get("ok")]
    parts = []
    if ok:
        parts.append("Mis à jour : " + "; ".join(ok) + ". Les prochaines captures utiliseront la nouvelle version.")
    if bad:
        parts.append("Non mis à jour : " + " ".join(bad))
    return "  ".join(parts) or "Aucune action effectuée."
