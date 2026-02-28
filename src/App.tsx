// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";

import type { DaySnapshot, LockInState, Tab, UrgeEntry } from "./core/types";
import { todayKey } from "./core/dates";
import {
  commitDay,
  loadState,
  saveState,
  setTab as setTabInState,
  getDay,
  resetAll,
} from "./core/storage";
import { calcStreakFromState } from "./core/scoring";

import { LogModal } from "./components/LogModal";
import { TodayScreen } from "./screens/Today";
import WeeklyScreen from "./screens/Weekly";
import { HistoryScreen } from "./screens/History";

import { track, trackPageView } from "./core/analytics";

type BackupPayload = {
  version: 1;
  exportedAt: number;
  state: LockInState;
};

function downloadJson(filename: string, obj: any) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function App() {
  // =========================
  // APP STATE
  // =========================
  const [state, setState] = useState<LockInState>(() => loadState());
  const [logging, setLogging] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Saved indicator (+ timestamp)
  const [savedPulse, setSavedPulse] = useState<"idle" | "saved">("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedTimer = useRef<number | null>(null);

  // Undo reset (5 sec window)
  const [undo, setUndo] = useState<null | { prevDay: DaySnapshot; expiresAt: number }>(null);
  const undoTimer = useRef<number | null>(null);

  // Import input ref
  const importRef = useRef<HTMLInputElement | null>(null);

  function pulseSaved() {
    setSavedAt(Date.now());
    setSavedPulse("saved");
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedPulse("idle"), 1400);
  }

  // =========================
  // INITIAL LOAD
  // =========================
  useEffect(() => {
    const s = loadState();
    setState(s);
    setHydrated(true);

    track("app_open");
    trackPageView(window.location.pathname);
  }, []);

  // =========================
  // SAVE (debounced)
  // =========================
  const saveDebounce = useRef<number | null>(null);
  useEffect(() => {
    if (!hydrated) return;

    if (saveDebounce.current) window.clearTimeout(saveDebounce.current);
    saveDebounce.current = window.setTimeout(() => {
      try {
        saveState(state);
        pulseSaved();
      } catch {
        // ignore storage errors
      }
    }, 150);
  }, [hydrated, state]);

  // =========================
  // DERIVED
  // =========================
  const tab: Tab = state.ui?.tab ?? "today";
  const tKey = todayKey();

  const today = useMemo(() => getDay(state, tKey), [state, tKey]);
  const streak = useMemo(() => calcStreakFromState(state), [state]);

  // Track tab change
  const lastTabRef = useRef<Tab | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (lastTabRef.current === tab) return;

    lastTabRef.current = tab;
    track("tab_click", { tab });
    trackPageView(`/${tab}`);
  }, [tab, hydrated]);

  // =========================
  // HELPERS
  // =========================
  function setTab(tab: Tab) {
    setState((prev) => setTabInState(prev, tab));
  }

  function editToday(patch: Partial<DaySnapshot>) {
    setState((prev) => {
      const current = getDay(prev, tKey);
      const next: DaySnapshot = { ...current, ...patch, day: tKey };
      return { ...prev, days: { ...prev.days, [tKey]: next } };
    });
  }

  function openLogModal() {
    setLogging(true);
    track("log_modal_open");
  }

  function addUrge(entry: Omit<UrgeEntry, "id" | "ts">) {
    const id =
      (globalThis.crypto as any)?.randomUUID?.() ??
      `u_${Math.random().toString(16).slice(2)}_${Date.now()}`;

    const next: UrgeEntry = { ...entry, id, ts: Date.now() };

    setState((prev) => {
      const d = getDay(prev, tKey);
      const urges = [next, ...(d.urges ?? [])];
      const updated: DaySnapshot = { ...d, urges };
      return commitDay(prev, updated);
    });

    track("urge_logged", {
      type: (entry as any)?.type ?? "unknown",
      intensity: (entry as any)?.intensity ?? null,
      resisted: (entry as any)?.resisted ?? null,
    });

    setLogging(false);
  }

  function resetTriggersToday() {
    const ok = window.confirm(
      "Reset today's triggers only?\n\nThis clears ONLY today's logged triggers/urges."
    );
    if (!ok) return;

    track("reset_day");

    setState((prev) => {
      const d = getDay(prev, tKey);
      if (!d.urges?.length) return prev;

      const prevDay = d;
      const nextDay: DaySnapshot = { ...d, urges: [] };

      const expiresAt = Date.now() + 5000;
      setUndo({ prevDay, expiresAt });

      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndo(null), 5000);

      return commitDay(prev, nextDay);
    });
  }

  function undoReset() {
    if (!undo) return;
    track("reset_day_undo");

    setState((prev) => commitDay(prev, undo.prevDay));
    setUndo(null);

    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }

  function fullResetEverything() {
    const typed = window.prompt('Type reset to erase EVERYTHING (all days + all history).');
    if (typed !== "reset") return;

    track("full_reset_confirmed");

    resetAll();
    setUndo(null);
    setLogging(false);
    setSavedAt(null);
    setSavedPulse("idle");
    setState(loadState());
  }

  function exportBackup() {
    const payload: BackupPayload = {
      version: 1,
      exportedAt: Date.now(),
      state,
    };
    downloadJson(`lockin-backup-${todayKey()}.json`, payload);
    track("backup_exported");
  }

  function clickImport() {
    importRef.current?.click();
    track("backup_import_clicked");
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;

      if (!parsed?.state || parsed.version !== 1) throw new Error("Invalid backup file.");
      const nextState = parsed.state as LockInState;

      setState(nextState);
      saveState(nextState);
      pulseSaved();

      track("backup_import_success");
      alert("Backup imported successfully.");
    } catch (err: any) {
      track("backup_import_failed");
      alert(err?.message ?? "Import failed.");
    }
  }

  function deleteEntry(day: string, id: string) {
    setState((prev) => {
      const snap = prev.days[day];
      if (!snap) return prev;

      const nextUrges = (snap.urges ?? []).filter((u) => u.id !== id);
      return commitDay(prev, { ...snap, urges: nextUrges });
    });

    track("delete_urge");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="brand">LockIn</div>
          <div className="sub">Control urges • Execute daily • Stay locked</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {savedPulse === "saved" && (
            <div className="saveBadge">
              Saved ✓{savedAt ? ` ${fmtTime(savedAt)}` : ""}
            </div>
          )}

          <button className="btn ghost" onClick={exportBackup} type="button">
            Export
          </button>

          <button className="btn ghost" onClick={clickImport} type="button">
            Import
          </button>

          <input
            ref={importRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={onImportFile}
          />

          <button className="btn ghost" onClick={resetTriggersToday} type="button">
            Reset Day
          </button>

          <button className="btn" onClick={fullResetEverything} type="button">
            Full Reset
          </button>
        </div>
      </header>

      {undo && Date.now() < undo.expiresAt && (
        <div className="undoBar">
          <div>Triggers cleared for today.</div>
          <button className="btn primary" onClick={undoReset} type="button">
            Undo
          </button>
        </div>
      )}

      <nav className="tabs">
        <button
          className={`tabBtn ${tab === "today" ? "active" : ""}`}
          onClick={() => setTab("today")}
          type="button"
        >
          Today
        </button>

        <button
          className={`tabBtn ${tab === "weekly" ? "active" : ""}`}
          onClick={() => setTab("weekly")}
          type="button"
        >
          Weekly
        </button>

        <button
          className={`tabBtn ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
          type="button"
        >
          History
        </button>
      </nav>

      {tab === "today" && (
        <TodayScreen day={today} streak={streak} onEditDay={editToday} onLog={openLogModal} />
      )}

      {tab === "weekly" && <WeeklyScreen urges={today?.urges} />}

      {tab === "history" && (
        <HistoryScreen state={state} onDelete={deleteEntry} onJumpToToday={() => setTab("today")} />
      )}

      <footer className="footer muted">v1.0 • offline-first • PWA ready</footer>

      {logging && <LogModal onClose={() => setLogging(false)} onSave={addUrge} />}
    </div>
  );
}