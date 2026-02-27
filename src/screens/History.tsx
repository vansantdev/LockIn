// src/screens/History.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { DaySnapshot, LockInState, UrgeEntry } from "../core/types";
import {
  calcDailyScoreFromDay,
  labelFor,
  missionCompletionPercent,
  urgeResistPercent,
} from "../core/scoring";
import { todayKey } from "../core/dates";

type Tone = "safe" | "warn" | "bad";

function Pill({ text, tone }: { text: string; tone: Tone }) {
  const border =
    tone === "bad"
      ? "rgba(255,77,109,.55)"
      : tone === "warn"
      ? "rgba(255,184,102,.55)"
      : "rgba(108,92,255,.35)";
  const bg =
    tone === "bad"
      ? "rgba(255,77,109,.10)"
      : tone === "warn"
      ? "rgba(255,184,102,.10)"
      : "rgba(108,92,255,.08)";

  return (
    <span
      className="pill"
      style={{
        borderColor: border,
        background: bg,
        fontWeight: 800,
        transform: "translateZ(0)",
        animation: "pillPop 180ms ease-out",
      }}
    >
      {text}
    </span>
  );
}

function timeLabel(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function HistoryScreen({
  state,
  onDelete,
  onJumpToToday,
}: {
  state: LockInState;
  onDelete: (day: string, id: string) => void;
  onJumpToToday?: () => void;
}) {
  const dayKeys = useMemo(() => {
    const keys = Object.keys(state.days || {});
    keys.sort((a, b) => (a < b ? 1 : -1)); // newest first
    return keys;
  }, [state.days]);

  const [selectedDay, setSelectedDay] = useState<string>(() => dayKeys[0] ?? "");

  // tiny UX hint line
  const [hint, setHint] = useState<string>("");
  const hintTimer = useRef<number | null>(null);
  function flashHint(msg: string) {
    setHint(msg);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(""), 1600);
  }

  // Ensure selected day always valid
  useEffect(() => {
    if (!dayKeys.length) return;
    if (!dayKeys.includes(selectedDay)) {
      setSelectedDay(dayKeys[0]);
    }
  }, [dayKeys, selectedDay]);

  const snap: DaySnapshot | null =
    selectedDay && state.days[selectedDay] ? state.days[selectedDay] : null;

  const urges = (snap?.urges ?? []) as UrgeEntry[];
  const urgesSorted = useMemo(() => [...urges].sort((a, b) => b.ts - a.ts), [urges]);

  const daily = useMemo(() => (snap ? calcDailyScoreFromDay(snap) : null), [snap]);
  const resistedPct = useMemo(() => urgeResistPercent(urges), [urges]);
  const missionsPct = useMemo(
    () => (snap ? missionCompletionPercent(snap.missions) : 0),
    [snap]
  );

  const today = todayKey();

  const resistedCount = useMemo(() => urges.filter((u) => u.resisted).length, [urges]);
  const gaveInCount = useMemo(() => urges.filter((u) => !u.resisted).length, [urges]);

  function confirmDelete(day: string, u: UrgeEntry) {
    const ok = window.confirm(`Delete this entry?\n\n${labelFor(u)} • Intensity ${u.intensity}`);
    if (!ok) return;
    onDelete(day, u.id);
    flashHint("Entry deleted.");
  }

  function clearSelectedDay() {
    if (!snap) return;
    if (!urges.length) return;

    const ok = window.confirm(
      `Clear ALL triggers for ${selectedDay}?\n\nThis only removes entries for that day (Ops fields stay).`
    );
    if (!ok) return;

    // delete one by one using existing contract
    for (const u of urges) onDelete(selectedDay, u.id);
    flashHint("Day cleared.");
  }

  const gradeTone: Tone =
    daily?.grade === "RED" ? "bad" : daily?.grade === "UNSTABLE" ? "warn" : "safe";

  return (
    <section className="card">
      {/* Tiny animations without CSS edits */}
      <style>
        {`
          @keyframes pillPop {
            from { transform: translateY(2px) scale(.98); opacity: .85; }
            to   { transform: translateY(0) scale(1); opacity: 1; }
          }
          .pressFx { transition: transform 90ms ease; }
          .pressFx:active { transform: translateY(1px); }
        `}
      </style>

      <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        History
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {onJumpToToday && (
            <button className="btn ghost pressFx" onClick={onJumpToToday} type="button">
              Go to Today
            </button>
          )}
        </div>
      </h2>

      {dayKeys.length === 0 ? (
        <div className="muted">No days logged yet.</div>
      ) : (
        <>
          {/* Day Selector */}
          <div className="field" style={{ marginTop: 0 }}>
            <label>Day</label>
            <select
              className="select pressFx"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            >
              {dayKeys.map((d) => (
                <option key={d} value={d}>
                  {d === today ? `${d} (Today)` : d}
                </option>
              ))}
            </select>
          </div>

          {/* Summary */}
          {snap && daily && (
            <div style={{ marginTop: 12 }}>
              <div className="muted">Day Summary</div>

              <div className="rowBetween" style={{ alignItems: "center", marginTop: 8 }}>
                <div style={{ fontSize: 34, fontWeight: 900 }}>{daily.score}</div>
                <Pill text={daily.grade} tone={gradeTone} />
              </div>

              <div className="tiny muted" style={{ marginTop: 6 }}>
                Urge {resistedPct}% • Directives {missionsPct}% • Sleep {daily.breakdown.sleep}
              </div>

              <div className="grid3" style={{ marginTop: 12 }}>
                <div className="stat">
                  <div className="statLabel">Urges</div>
                  <div className="statValue">{urges.length}</div>
                </div>
                <div className="stat">
                  <div className="statLabel">Resisted</div>
                  <div className="statValue">{resistedCount}</div>
                </div>
                <div className="stat">
                  <div className="statLabel">Gave In</div>
                  <div className="statValue">{gaveInCount}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <button
                  className="btn ghost pressFx"
                  type="button"
                  onClick={clearSelectedDay}
                  disabled={!urges.length}
                  title="Deletes all trigger entries for this selected day"
                >
                  Clear day
                </button>
              </div>

              {hint ? (
                <div className="tiny" style={{ marginTop: 10, fontWeight: 800 }}>
                  {hint}
                </div>
              ) : null}
            </div>
          )}

          {/* Entries */}
          {urgesSorted.length === 0 ? (
            <div className="muted" style={{ marginTop: 14 }}>
              No triggers logged for this day.
            </div>
          ) : (
            <div className="historyList" style={{ marginTop: 14 }}>
              {urgesSorted.map((u) => (
                <div className="historyItem" key={u.id}>
                  <div className="historyTop">
                    <div className="historyTitle">{labelFor(u)}</div>
                    <div className="muted tiny">{timeLabel(u.ts)}</div>
                  </div>

                  <div className="lastRow" style={{ marginTop: 8, alignItems: "center" }}>
                    <Pill text={`Intensity ${u.intensity}`} tone={u.intensity >= 4 ? "warn" : "safe"} />
                    <Pill text={u.resisted ? "Resisted" : "Gave In"} tone={u.resisted ? "safe" : "bad"} />

                    <button
                      className="btn ghost pressFx"
                      onClick={() => confirmDelete(selectedDay, u)}
                      style={{ marginLeft: "auto" }}
                      type="button"
                      title="Delete this entry"
                    >
                      Delete
                    </button>
                  </div>

                  {u.note ? (
                    <div className="tiny muted" style={{ marginTop: 8 }}>
                      {u.note}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}