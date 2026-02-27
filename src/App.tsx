// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";

import type { DaySnapshot, LockInState, Tab, UrgeEntry } from "./core/types";
import { todayKey } from "./core/dates";
import { commitDay, defaultDay, loadState, saveState, setTab as setTabInState, getDay, resetAll } from "./core/storage";
import { calcStreakFromState } from "./core/scoring";

import { LogModal } from "./components/LogModal";
import { TodayScreen } from "./screens/Today";
import WeeklyScreen from "./screens/Weekly";
import { HistoryScreen } from "./screens/History";

type BackupPayload = {
  version: 1;
  exportedAt: number;
  state: LockInState;
};

function downloadJson(filename: string, obj: any) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function App() {
  // =========================
  // APP STATE
  // =========================
  const [state, setState] = useState<LockInState>(() => loadState());

  // modal
  const [logging, setLogging] = useState(false);

  // hydration flag
  const [hydrated, setHydrated] = useState(false);

  // Saved indicator (+ timestamp)
  const [savedPulse, setSavedPulse] = useState<"idle" | "saved">("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedTimer = useRef<number | null>(null);

  function pulseSaved() {
    setSavedAt(Date.now());
    setSavedPulse("saved");
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedPulse("idle"), 1400);
  }

  // Undo reset (5 sec window)
  const [undo, setUndo] = useState<null | { prevDay: DaySnapshot; expiresAt: number }>(null);
  const undoTimer = useRef<number | null>(null);

  // Midnight rollover banner
  const [rolloverBanner, setRolloverBanner] = useState<null | { day: string; ts: number }>(null);
  const lastDayRef = useRef<string>(todayKey());

  // Import input ref
  const importRef = useRef<HTMLInputElement | null>(null);

  // =========================
  // INITIAL LOAD (once)
  // =========================
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
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

    setLogging(false);
  }

  function resetTriggersToday() {
    const ok = window.confirm(
      "Reset today's triggers only?\n\nThis clears ONLY today's logged triggers/urges. Ops Console stays."
    );
    if (!ok) return;

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
    setState((prev) => commitDay(prev, undo.prevDay));
    setUndo(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }

  function fullResetEverything() {
    const typed = window.prompt('Type reset to erase EVERYTHING (all days + all history).');
    if (typed !== "reset") return;

    resetAll();
    setUndo(null);
    setLogging(false);
    setSavedAt(null);
    setSavedPulse("idle");
    setRolloverBanner(null);
    lastDayRef.current = todayKey();
    setState(loadState());
  }

  function exportBackup() {
    const payload: BackupPayload = {
      version: 1,
      exportedAt: Date.now(),
      state,
    };
    const day = todayKey();
    downloadJson(`lockin-backup-${day}.json`, payload);
  }

  function clickImport() {
    importRef.current?.click();
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
      if (!nextState.days || !nextState.ui) throw new Error("Backup missing required fields.");

      setState(nextState);
      saveState(nextState);
      pulseSaved();
      alert("Backup imported successfully.");
    } catch (err: any) {
      alert(err?.message ?? "Import failed.");
    }
  }

  function deleteEntry(day: string, id: string) {
    setState((prev) => {
      const snap = prev.days[day];
      if (!snap) return prev;

      const nextUrges = (snap.urges ?? []).filter((u) => u.id !== id);
      const nextSnap: DaySnapshot = { ...snap, urges: nextUrges };

      return commitDay(prev, nextSnap);
    });
  }

  // Ensure today exists at least once so ops fields persist even before first log
  useEffect(() => {
    if (!hydrated) return;
    setState((prev) => {
      if (prev.days[tKey]) return prev;
      return commitDay(prev, defaultDay(tKey));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Midnight rollover (auto-seed new day + banner)
  useEffect(() => {
    if (!hydrated) return;

    const tick = () => {
      const nowKey = todayKey();
      const prevKey = lastDayRef.current;

      if (nowKey !== prevKey) {
        lastDayRef.current = nowKey;

        setState((prev) => {
          const next = prev.days[nowKey] ? prev : commitDay(prev, defaultDay(nowKey));
          return setTabInState(next, "today");
        });

        setRolloverBanner({ day: nowKey, ts: Date.now() });
      }
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [hydrated]);

  // Auto-hide rollover banner after 6s
  useEffect(() => {
    if (!rolloverBanner) return;
    const id = window.setTimeout(() => setRolloverBanner(null), 6000);
    return () => window.clearTimeout(id);
  }, [rolloverBanner]);

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

          <button className="btn ghost" onClick={exportBackup} type="button" title="Download a JSON backup">
            Export
          </button>

          <button className="btn ghost" onClick={clickImport} type="button" title="Import a JSON backup">
            Import
          </button>

          <input
            ref={importRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={onImportFile}
          />

          <button className="btn ghost" onClick={resetTriggersToday} type="button" title="Clears only today's triggers">
            Reset Day
          </button>

          <button className="btn" onClick={fullResetEverything} type="button" title="Danger: wipes everything">
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

      {rolloverBanner && (
        <div className="undoBar" style={{ justifyContent: "space-between" }}>
          <div>
            New day initialized: <b>{rolloverBanner.day}</b>. Lock in.
          </div>
          <button className="btn primary" onClick={() => setRolloverBanner(null)} type="button">
            Dismiss
          </button>
        </div>
      )}

      <nav className="tabs">
        <button className={`tabBtn ${tab === "today" ? "active" : ""}`} onClick={() => setTab("today")} type="button">
          Today
        </button>
        <button className={`tabBtn ${tab === "weekly" ? "active" : ""}`} onClick={() => setTab("weekly")} type="button">
          Weekly
        </button>
        <button className={`tabBtn ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")} type="button">
          History
        </button>
      </nav>

      {tab === "today" && (
        <TodayScreen day={today} streak={streak} onEditDay={editToday} onLog={() => setLogging(true)} />
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
