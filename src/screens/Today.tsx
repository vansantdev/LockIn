// src/screens/Today.tsx
import { useMemo, useRef, useState } from "react";
import type { DaySnapshot, Mission, TimeBlocks, UrgeEntry } from "../core/types";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function pct(n: number) {
  return clamp(Math.round(n), 0, 100);
}

function labelFor(u: UrgeEntry) {
  // @ts-ignore (some builds use customLabel, some don't)
  const custom = (u as any).customLabel as string | undefined;
  // @ts-ignore
  const type = (u as any).type as string;
  if (type === "custom") return custom?.trim() ? custom.trim() : "Custom";
  return type ?? "Unknown";
}

function missionCompletionPercent(missions: Mission[]) {
  const active = missions.filter((m) => (m.text ?? "").trim().length > 0);
  if (!active.length) return 0;
  const done = active.filter((m) => m.done).length;
  return pct((done / active.length) * 100);
}

function urgeResistPercent(todays: UrgeEntry[]) {
  if (!todays.length) return 0;
  const resisted = todays.filter((u) => u.resisted).length;
  return pct((resisted / todays.length) * 100);
}

function sleepScore(hours: number) {
  if (hours >= 7 && hours <= 8) return 100;
  if (hours === 6) return 80;
  if (hours === 5) return 60;
  if (hours === 4) return 40;
  if (hours <= 3) return 20;
  if (hours === 9) return 90;
  if (hours >= 10) return 80;
  return 70;
}

function calcDailyScore(args: {
  todays: UrgeEntry[];
  missions: Mission[];
  energy: number; // 1..5
  mood: number; // 1..5
  sleep: number; // 0..12
}) {
  const urge = urgeResistPercent(args.todays);
  const miss = missionCompletionPercent(args.missions);
  const energy = pct((args.energy / 5) * 100);
  const mood = pct((args.mood / 5) * 100);
  const sleep = sleepScore(args.sleep);

  const score = 0.4 * urge + 0.25 * miss + 0.15 * energy + 0.1 * mood + 0.1 * sleep;
  const final = pct(score);

  let grade: "CONTROLLED" | "SOLID" | "UNSTABLE" | "RED" = "SOLID";
  if (final >= 90) grade = "CONTROLLED";
  else if (final >= 75) grade = "SOLID";
  else if (final >= 60) grade = "UNSTABLE";
  else grade = "RED";

  return { score: final, grade, breakdown: { urge, miss, energy, mood, sleep } };
}

function calcRisk(args: { todays: UrgeEntry[]; energy: number; mood: number; sleep: number }) {
  const reasons: string[] = [];
  const gaveIn = args.todays.filter((u) => !u.resisted).length;

  if (args.sleep < 6) reasons.push("Low sleep");
  if (args.mood <= 2) reasons.push("Low mood");
  if (args.energy <= 2) reasons.push("Low energy");
  if (gaveIn >= 2) reasons.push("Multiple slip events");

  let level: "LOW" | "ELEVATED" | "HIGH" = "LOW";
  if (reasons.length >= 3) level = "HIGH";
  else if (reasons.length >= 1) level = "ELEVATED";

  return { level, reasons, gaveIn };
}

type Forecast = {
  level: "LOW" | "ELEVATED" | "HIGH";
  danger: number; // 0..100
  headline: string;
  reasons: string[]; // ONLY ACTIVE right now
  action: string;
};

function riskForecast(args: { todays: UrgeEntry[]; energy: number; mood: number; sleep: number }): Forecast {
  const hour = new Date().getHours();

  const slips = args.todays.filter((u) => !u.resisted);
  const slipCount = slips.length;
  const avgIntensity =
    args.todays.length > 0
      ? args.todays.reduce((a, u) => a + (u.intensity ?? 3), 0) / args.todays.length
      : 0;

  // safety 0..100 (higher = safer)
  let safety = 78;

  // ops penalties
  if (args.sleep < 6) safety -= 18;
  if (args.sleep < 5) safety -= 10;

  if (args.mood <= 2) safety -= 14;
  if (args.energy <= 2) safety -= 12;

  // behavior penalties
  safety -= slipCount * 10;
  if (avgIntensity >= 4) safety -= 8;

  // time-of-day pressure
  if (hour >= 21) safety -= 10;
  if (hour >= 23) safety -= 8;

  safety = clamp(Math.round(safety), 0, 100);
  const danger = 100 - safety;

  let level: "LOW" | "ELEVATED" | "HIGH" = "LOW";
  if (danger >= 55) level = "HIGH";
  else if (danger >= 30) level = "ELEVATED";

  let action = "Run a 60-second reset: water + 10 breaths + stand up.";
  if (level === "ELEVATED") action = "Interrupt pattern: 2 minutes, no phone, breathe + move.";
  if (level === "HIGH") action = "Hard reset: leave the room for 3 minutes. No debate. Then log one directive.";

  // ✅ ONLY ACTIVE reasons (pill row)
  const reasons: string[] = [];
  if (args.sleep < 6) reasons.push("Sleep debt");
  if (args.mood <= 2) reasons.push("Mood low");
  if (args.energy <= 2) reasons.push("Energy low");
  if (slipCount >= 1) reasons.push(`Slip x${slipCount}`);
  if (avgIntensity >= 4) reasons.push("High intensity");
  if (hour >= 21) reasons.push("Late-night window");

  const headline =
    level === "LOW"
      ? "Forecast: Stable window"
      : level === "ELEVATED"
      ? "Forecast: Pressure rising"
      : "Forecast: High-risk window";

  return { level, danger, headline, reasons, action };
}

const QUICK_WINS = [
  "10-minute walk (no phone)",
  "Hydrate + protein (stabilize)",
  "Clean one zone (desk / kitchen)",
  "5-minute stretch + deep breaths",
  "Text someone: “I’m staying locked.”",
  "Set a 25-min focus block",
  "Cold rinse face + reset",
];

function tryAddQuickWin(missions: Mission[]): { next: Mission[]; added: boolean; reason?: string } {
  const next = [...missions];
  const idx = next.findIndex((m) => !(m.text ?? "").trim());
  if (idx === -1) return { next: missions, added: false, reason: "All directive slots are filled." };

  const existing = new Set(
    missions
      .map((m) => (m.text ?? "").trim().toLowerCase())
      .filter(Boolean)
  );

  // try up to 10 picks to avoid duplicates
  for (let tries = 0; tries < 10; tries++) {
    const pick = QUICK_WINS[Math.floor(Math.random() * QUICK_WINS.length)];
    if (existing.has(pick.trim().toLowerCase())) continue;
    next[idx] = { text: pick, done: false };
    return { next, added: true };
  }

  // if everything is duplicate, still add a random one (better than doing nothing)
  const pick = QUICK_WINS[Math.floor(Math.random() * QUICK_WINS.length)];
  next[idx] = { text: pick, done: false };
  return { next, added: true };
}

function clearCompleted(missions: Mission[]): Mission[] {
  // clears completion state but keeps text
  return missions.map((m) => ((m.text ?? "").trim() ? { ...m, done: false } : m));
}

function Pill({ text, tone }: { text: string; tone: "safe" | "warn" | "bad" }) {
  // ✅ no green; use purple + warn + danger palette
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

export function TodayScreen({
  day,
  streak,
  onEditDay,
  onLog,
}: {
  day: DaySnapshot;
  streak: number;
  onEditDay: (patch: Partial<DaySnapshot>) => void;
  onLog: () => void;
}) {
  const urgesToday = (day.urges ?? []) as UrgeEntry[];
  const missions = (day.missions ?? []) as Mission[];
  const timeBlocks = (day.timeBlocks ?? { am: "", pm: "" }) as TimeBlocks;

  const energy = typeof day.energy === "number" ? day.energy : 3;
  const mood = typeof day.mood === "number" ? day.mood : 3;
  const sleep = typeof day.sleep === "number" ? day.sleep : 7;
  const spent = typeof day.spent === "number" ? day.spent : 0;

  const resistedToday = urgesToday.filter((u) => u.resisted).length;
  const gaveInToday = urgesToday.filter((u) => !u.resisted).length;
  const last = urgesToday[0];

  const daily = useMemo(
    () => calcDailyScore({ todays: urgesToday, missions, energy, mood, sleep }),
    [urgesToday, missions, energy, mood, sleep]
  );
  const risk = useMemo(() => calcRisk({ todays: urgesToday, energy, mood, sleep }), [urgesToday, energy, mood, sleep]);
  const forecast = useMemo(() => riskForecast({ todays: urgesToday, energy, mood, sleep }), [urgesToday, energy, mood, sleep]);

  // tiny UX: message line for quick-win / clear actions
  const [hint, setHint] = useState<string>("");
  const hintTimer = useRef<number | null>(null);

  function flashHint(msg: string) {
    setHint(msg);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(""), 1600);
  }

  const forecastTone: "safe" | "warn" | "bad" =
    forecast.level === "HIGH" ? "bad" : forecast.level === "ELEVATED" ? "warn" : "safe";

  const forecastBorder =
    forecastTone === "bad"
      ? "rgba(255,77,109,.55)"
      : forecastTone === "warn"
      ? "rgba(255,184,102,.55)"
      : "rgba(108,92,255,.35)";

  const meterColor =
    forecastTone === "bad"
      ? "rgba(255,77,109,.92)"
      : forecastTone === "warn"
      ? "rgba(255,184,102,.92)"
      : "rgba(108,92,255,.85)";

  const hasNoUrges = urgesToday.length === 0;
  const anyCompleted = missions.some((m) => (m.text ?? "").trim() && m.done);

  return (
    <>
      {/* Local keyframes (tiny animation, no CSS edits required) */}
      <style>
        {`
          @keyframes pillPop {
            from { transform: translateY(2px) scale(.98); opacity: .85; }
            to   { transform: translateY(0) scale(1); opacity: 1; }
          }
          @keyframes hintFade {
            from { opacity: 0; transform: translateY(2px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .hintLine { animation: hintFade 160ms ease-out; }
          .pressFx { transition: transform 90ms ease; }
          .pressFx:active { transform: translateY(1px); }
        `}
      </style>

      {/* COMMAND STATUS */}
      <section className="card">
        <h2>Command Status</h2>

        {risk.level !== "LOW" && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 14,
              border: `1px solid ${
                risk.level === "HIGH" ? "rgba(255,77,109,.55)" : "rgba(255,184,102,.55)"
              }`,
              background: "rgba(0,0,0,.18)",
            }}
          >
            <div style={{ fontWeight: 900 }}>{risk.level === "HIGH" ? "⚠ HIGH RISK DAY" : "⚠ ELEVATED RISK DAY"}</div>
            <div className="tiny">{risk.reasons.join(" • ")}</div>
          </div>
        )}

        <div className="grid3" style={{ marginTop: 12 }}>
          <div className="stat">
            <div className="statLabel">Streak</div>
            <div className="statValue">{streak}</div>
          </div>
          <div className="stat">
            <div className="statLabel">Resisted</div>
            <div className="statValue">{resistedToday}</div>
          </div>
          <div className="stat">
            <div className="statLabel">Gave In</div>
            <div className="statValue">{gaveInToday}</div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="muted">Daily Control Score</div>
          <div className="rowBetween" style={{ alignItems: "center", marginTop: 6 }}>
            <div style={{ fontSize: 34, fontWeight: 900 }}>{daily.score}</div>
            <span className="pill">{daily.grade}</span>
          </div>
          <div className="tiny">
            Urge {daily.breakdown.urge}% • Directives {daily.breakdown.miss}% • Sleep {daily.breakdown.sleep}
          </div>
        </div>

        {/* Risk Forecast */}
        <div
          style={{
            marginTop: 14,
            padding: "12px 12px",
            borderRadius: 16,
            border: `1px solid ${forecastBorder}`,
            background: "rgba(0,0,0,.16)",
          }}
        >
          <div className="rowBetween" style={{ alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>{forecast.headline}</div>
            <span className="pill">{forecast.level}</span>
          </div>

          <div style={{ marginTop: 10 }}>
            <div className="tiny muted" style={{ marginBottom: 6 }}>
              Risk meter (next few hours)
            </div>

            <div
              style={{
                height: 10,
                borderRadius: 999,
                background: "rgba(255,255,255,.08)",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,.08)",
              }}
            >
              {/* tiny animation: width transition */}
              <div
                style={{
                  height: "100%",
                  width: `${forecast.danger}%`,
                  background: meterColor,
                  transition: "width 240ms ease",
                }}
              />
            </div>

            {/* ✅ ACTIVE pills ONLY */}
            {forecast.reasons.length > 0 ? (
              <div className="lastRow" style={{ marginTop: 10 }}>
                {forecast.reasons.map((r) => (
                  <Pill
                    key={r}
                    text={r}
                    tone={
                      r.includes("Slip") || r.includes("High intensity")
                        ? "bad"
                        : r.includes("Late-night") || r.includes("Sleep debt")
                        ? "warn"
                        : forecastTone
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="tiny muted" style={{ marginTop: 10 }}>
                No active risk drivers detected.
              </div>
            )}

            <div style={{ marginTop: 10, fontWeight: 900 }}>
              Action: <span style={{ fontWeight: 700 }}>{forecast.action}</span>
            </div>
          </div>
        </div>

        {/* CTA row */}
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn primary pressFx" onClick={onLog} type="button" style={{ flex: 1, minWidth: 180 }}>
            Log Trigger
          </button>

          <button
            className="btn pressFx"
            type="button"
            onClick={() => {
              const res = tryAddQuickWin(missions);
              if (!res.added) {
                flashHint(res.reason ?? "No empty directive slot.");
                return;
              }
              onEditDay({ missions: res.next });
              flashHint("Quick Win loaded.");
            }}
            style={{ minWidth: 160 }}
            title="Autofill a directive into the next empty slot"
          >
            + Quick Win
          </button>

          <button
            className="btn ghost pressFx"
            type="button"
            disabled={!anyCompleted}
            onClick={() => {
              onEditDay({ missions: clearCompleted(missions) });
              flashHint("Completed cleared.");
            }}
            style={{ minWidth: 160 }}
            title="Unchecks completed directives"
          >
            Clear Completed
          </button>
        </div>

        {hint ? (
          <div className="tiny hintLine" style={{ marginTop: 10, fontWeight: 800 }}>
            {hint}
          </div>
        ) : null}

        {/* Empty-state microcopy */}
        {hasNoUrges ? (
          <div style={{ marginTop: 12 }}>
            <div className="tiny muted">
              No triggers logged today. That’s good.
              <br />
              If pressure spikes, log it immediately — logging breaks the trance.
            </div>
          </div>
        ) : null}

        {/* last entry */}
        {last ? (
          <div className="last">
            <div className="muted">Last entry</div>
            <div className="lastRow">
              <span className="pill">{labelFor(last)}</span>
              <span className="pill">Intensity {last.intensity}</span>
              <span className={`pill ${last.resisted ? "good" : "bad"}`}>{last.resisted ? "Resisted" : "Gave In"}</span>
            </div>
          </div>
        ) : null}
      </section>

      {/* OPS CONSOLE */}
      <section className="card">
        <h2>Ops Console</h2>

        {/* DIRECTIVES */}
        <div className="rowBetween">
          <div>
            <div className="muted">Directives</div>
            <div className="tiny">3 wins. No excuses.</div>
          </div>
        </div>

        <div className="prio">
          {missions.map((m, i) => (
            <div key={i} className="missionRow">
              <button
                className={`check ${m.done ? "on" : ""} pressFx`}
                onClick={() => {
                  const next = [...missions];
                  next[i] = { ...next[i], done: !next[i].done };
                  onEditDay({ missions: next });
                }}
                type="button"
                aria-label={`Toggle directive ${i + 1}`}
              >
                {m.done ? "✓" : ""}
              </button>

              <input
                className="input"
                value={m.text}
                placeholder={`Directive ${i + 1}`}
                onChange={(e) => {
                  const next = [...missions];
                  next[i] = { ...next[i], text: e.target.value };
                  onEditDay({ missions: next });
                }}
              />
            </div>
          ))}
        </div>

        <div className="tiny muted" style={{ marginTop: 10 }}>
          Completed: {missions.filter((x) => x.done && x.text.trim()).length}/{missions.filter((x) => x.text.trim()).length || 0}
        </div>

        {/* TIME BLOCKS */}
        <div className="energy">
          <div className="rowBetween">
            <div>
              <div className="muted">Time Blocks</div>
              <div className="tiny">AM + PM. Keep it simple.</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <div>
              <div className="tiny muted">AM Block</div>
              <textarea
                className="textarea"
                value={timeBlocks.am}
                placeholder="What gets done this morning?"
                onChange={(e) => onEditDay({ timeBlocks: { ...timeBlocks, am: e.target.value } })}
                rows={3}
              />
            </div>

            <div>
              <div className="tiny muted">PM Block</div>
              <textarea
                className="textarea"
                value={timeBlocks.pm}
                placeholder="What gets done this afternoon/night?"
                onChange={(e) => onEditDay({ timeBlocks: { ...timeBlocks, pm: e.target.value } })}
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* ENERGY */}
        <div className="energy">
          <div className="rowBetween">
            <div>
              <div className="muted">Energy</div>
              <div className="tiny">1 = drained • 5 = lethal</div>
            </div>
            <div className="energyBadge">Level {energy}</div>
          </div>

          <input
            className="range"
            type="range"
            min={1}
            max={5}
            value={energy}
            onChange={(e) => onEditDay({ energy: Number(e.target.value) })}
          />
        </div>

        {/* MOOD + SLEEP */}
        <div className="energy">
          <div className="rowBetween">
            <div>
              <div className="muted">Mood</div>
              <div className="tiny">1 = rough • 5 = locked</div>
            </div>
            <div className="energyBadge">Mood {mood}</div>
          </div>

          <input
            className="range"
            type="range"
            min={1}
            max={5}
            value={mood}
            onChange={(e) => onEditDay({ mood: Number(e.target.value) })}
          />

          <div className="rowBetween" style={{ marginTop: 12 }}>
            <div>
              <div className="muted">Sleep</div>
              <div className="tiny">Hours last night</div>
            </div>
            <div className="energyBadge">{sleep}h</div>
          </div>

          <input
            className="range"
            type="range"
            min={0}
            max={12}
            value={sleep}
            onChange={(e) => onEditDay({ sleep: Number(e.target.value) })}
          />
        </div>

        {/* MONEY QUICK LOG */}
        <div className="energy">
          <div className="rowBetween">
            <div>
              <div className="muted">Spent Today</div>
              <div className="tiny">Quick money awareness.</div>
            </div>
            <div className="energyBadge">${Number(spent).toFixed(2)}</div>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <input
              className="input"
              inputMode="decimal"
              value={String(spent)}
              onChange={(e) => onEditDay({ spent: Number(e.target.value || 0) })}
              placeholder="0"
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn ghost pressFx" type="button" onClick={() => onEditDay({ spent: Math.max(0, Math.round((spent - 5) * 100) / 100) })}>
                -5
              </button>
              <button className="btn ghost pressFx" type="button" onClick={() => onEditDay({ spent: Math.round((spent + 5) * 100) / 100 })}>
                +5
              </button>
              <button className="btn ghost pressFx" type="button" onClick={() => onEditDay({ spent: 0 })}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}