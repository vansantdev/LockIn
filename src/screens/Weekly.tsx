// src/screens/Weekly.tsx
import { useMemo } from "react";
import type { UrgeEntry } from "../core/types";
import { endOfWeekSunday, fmtShort, startOfWeekMonday } from "../core/dates";
import { calcWeeklyRank } from "../core/scoring";

// -----------------------------
// Helpers
// -----------------------------
function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

type OpsDay = {
  day: string; // YYYY-MM-DD
  entries: number;
  label: string; // Clean | High intensity
  tone: "clean" | "high";
  intensity: number; // 0..1 for bar
};

export default function Weekly({ urges = [] }: { urges?: UrgeEntry[] }) {
  const now = new Date();
  const weekStart = startOfWeekMonday(now);
  const weekEnd = endOfWeekSunday(now);

  const weekTitle = useMemo(() => {
    return `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}`;
  }, [weekStart.getTime(), weekEnd.getTime()]);

  // Build 7 days (Mon -> Sun)
  const days = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < 7; i++) list.push(ymd(addDays(weekStart, i)));
    return list;
  }, [weekStart.getTime()]);

  // Urges within this week
  const urgesThisWeek = useMemo(() => {
    const start = weekStart.getTime();
    const end = addDays(weekEnd, 1).getTime();
    return (urges || []).filter((u) => u.ts >= start && u.ts < end);
  }, [urges, weekStart.getTime(), weekEnd.getTime()]);

  // Counts per day
  const opsDays: OpsDay[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of urgesThisWeek) {
      const d = ymd(new Date(u.ts));
      counts[d] = (counts[d] || 0) + 1;
    }

    const maxCount = Math.max(1, ...Object.values(counts), 1);

    return days.map((day) => {
      const entries = counts[day] || 0;

      // Your existing “simple” rule
      const label = entries >= 2 ? "High intensity" : "Clean";
      const tone: OpsDay["tone"] = label === "High intensity" ? "high" : "clean";

      // intensity bar: normalized by max of week
      const intensity = Math.max(0, Math.min(1, entries / maxCount));

      return { day, entries, label, tone, intensity };
    });
  }, [days, urgesThisWeek]);

  // Weekly rank
  const weeklyRank = useMemo(() => {
    try {
      const result = calcWeeklyRank(urgesThisWeek as any) ?? "—";
      return typeof result === "string" ? result : (result as any).rank ?? "—";
    } catch {
      return "—";
    }
  }, [urgesThisWeek]);

  // Simple headline stats (safe defaults)
  const totalEntries = useMemo(() => opsDays.reduce((a, d) => a + d.entries, 0), [opsDays]);
  const highDays = useMemo(() => opsDays.filter((d) => d.tone === "high").length, [opsDays]);
  const cleanDays = 7 - highDays;

  return (
    <div className="screen">
      <div className="card">
        <div className="weeklyTitle">After-Action Report ({weekTitle})</div>

        {/* Refined top summary */}
        <div className="weeklyRows">
          <div className="weeklyRank">
            <div className="muted">Weekly Rank</div>
            <div className="rankRow">
              <div className="rankValue">{weeklyRank}</div>
              <span className="pill good">{cleanDays} clean</span>
            </div>
            <div className="tiny">
              Total entries: {totalEntries} • High-intensity days: {highDays}
            </div>
          </div>
        </div>

        {/* Ops Week Strip */}
        <div style={{ marginTop: 18 }}>
          <div className="opsHeader">Ops Week Strip</div>
          <div className="muted" style={{ marginBottom: 10 }}>
            Active drivers only per day.
          </div>

          <div className="opsWeekGrid">
            {opsDays.map((d) => {
              const pillClass = d.tone === "high" ? "pill bad" : "pill good";
              const pillsAlignClass = d.tone === "clean" ? "opsDayPills isClean" : "opsDayPills";

              // show MM-DD in top label
              const short = d.day.slice(5);

              return (
                <div key={d.day} className="opsDay">
                  <div className="opsDayLabel">
                    <span>{short}</span>
                  </div>

                  <div className="opsDayStatus">
                    <div className={pillsAlignClass}>
                      <span className={pillClass}>{d.label}</span>
                    </div>
                  </div>

                  {/* Mini visualization bar */}
                  <div className="opsBarTrack" aria-hidden="true">
                    <div
                      className={`opsBarFill ${d.tone === "high" ? "isHigh" : "isClean"}`}
                      style={{ width: `${Math.round(d.intensity * 100)}%` }}
                    />
                  </div>

                  <div className="tiny" style={{ marginTop: 8 }}>
                    Entries: {d.entries}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* v1.0 lock footer text (optional, if you already render .footer elsewhere ignore this) */}
        <div className="footer">LockIn • v1.0</div>
      </div>
    </div>
  );
}