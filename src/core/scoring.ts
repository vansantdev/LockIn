// src/core/scoring.ts
import type { DaySnapshot, LockInState, Mission, UrgeEntry } from "./types";
import { dayKey } from "./dates";

export function labelFor(u: UrgeEntry) {
  if (u.type === "custom") return u.customLabel?.trim() ? u.customLabel.trim() : "Custom";
  return u.type;
}

function pct(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Missions: percent complete across non-empty mission lines */
export function missionCompletionPercent(missions: Mission[]) {
  const active = missions.filter((m) => m.text.trim().length > 0);
  if (!active.length) return 0;
  const done = active.filter((m) => m.done).length;
  return pct((done / active.length) * 100);
}

/** Urges: resisted percent for a given list */
export function urgeResistPercent(list: UrgeEntry[]) {
  if (!list.length) return 0;
  const resisted = list.filter((u) => u.resisted).length;
  return pct((resisted / list.length) * 100);
}

/** Simple, readable sleep curve */
export function sleepScore(hours: number) {
  if (hours >= 7 && hours <= 8) return 100;
  if (hours === 6) return 80;
  if (hours === 5) return 60;
  if (hours === 4) return 40;
  if (hours <= 3) return 20;
  if (hours === 9) return 90;
  if (hours >= 10) return 80;
  return 70;
}

/**
 * Daily score for a snapshot.
 * NOTE:
 * - energy/mood expected 1..5 in UI (your current behavior)
 * - sleep expected hours (0..12)
 */
export function calcDailyScoreFromDay(day: DaySnapshot) {
  const urge = urgeResistPercent(day.urges); // 0..100
  const miss = missionCompletionPercent(day.missions); // 0..100
  const energy = pct((clamp(day.energy, 1, 5) / 5) * 100);
  const mood = pct((clamp(day.mood, 1, 5) / 5) * 100);
  const sleep = sleepScore(clamp(day.sleep, 0, 24));

  const score =
    0.4 * urge +
    0.25 * miss +
    0.15 * energy +
    0.1 * mood +
    0.1 * sleep;

  const final = pct(score);

  let grade: "CONTROLLED" | "SOLID" | "UNSTABLE" | "RED" = "SOLID";
  if (final >= 90) grade = "CONTROLLED";
  else if (final >= 75) grade = "SOLID";
  else if (final >= 60) grade = "UNSTABLE";
  else grade = "RED";

  return { score: final, grade, breakdown: { urge, miss, energy, mood, sleep } };
}

/** Risk for a day snapshot (same logic you already had) */
export function calcRiskFromDay(day: DaySnapshot) {
  const reasons: string[] = [];
  const gaveIn = day.urges.filter((u) => !u.resisted).length;

  if (day.sleep < 6) reasons.push("Low sleep");
  if (day.mood <= 2) reasons.push("Low mood");
  if (day.energy <= 2) reasons.push("Low energy");
  if (gaveIn >= 2) reasons.push("Multiple slip events");

  let level: "LOW" | "ELEVATED" | "HIGH" = "LOW";
  if (reasons.length >= 3) level = "HIGH";
  else if (reasons.length >= 1) level = "ELEVATED";

  return { level, reasons, gaveIn };
}

/**
 * Streak v1.0 (based on state.days):
 * - "Clean day" = has at least 1 urge AND all urges resisted
 * - streak counts backwards from today for consecutive clean days
 */
export function calcStreakFromState(state: LockInState, today = new Date()) {
  let streak = 0;
  const cur = new Date(today);

  while (true) {
    const k = dayKey(cur.getTime());
    const day = state.days[k];

    const urges = day?.urges ?? [];
    const any = urges.length > 0;
    const allResisted = any && urges.every((u) => u.resisted);

    if (any && allResisted) {
      streak += 1;
      cur.setDate(cur.getDate() - 1);
      continue;
    }
    break;
  }

  return streak;
}

/** Weekly rank based on a list of urges across the week (same behavior as before) */
export function calcWeeklyRank(args: { weekEntries: UrgeEntry[] }) {
  const total = args.weekEntries.length;
  const resisted = args.weekEntries.filter((u) => u.resisted).length;
  const resistedPct = total ? (resisted / total) * 100 : 0;

  // penalty: count distinct days that had any "gave in"
  const slipDays = new Set<string>();
  for (const u of args.weekEntries) {
    if (!u.resisted) slipDays.add(dayKey(u.ts));
  }
  let score = resistedPct;
  score -= slipDays.size * 6; // each slip-day hurts

  const final = Math.max(0, Math.min(100, Math.round(score)));

  let rank: "CONTROLLED WEEK" | "SOLID WEEK" | "UNSTABLE" | "RELAPSE WEEK" = "SOLID WEEK";
  if (final >= 90) rank = "CONTROLLED WEEK";
  else if (final >= 75) rank = "SOLID WEEK";
  else if (final >= 60) rank = "UNSTABLE";
  else rank = "RELAPSE WEEK";

  return { rank, score: final, resistedPct: Math.round(resistedPct), slipDays: slipDays.size };
}

/**
 * Helper: get the 7 day keys for a week view (Mon..Sun) or (whatever your dates.ts uses)
 * We’ll keep it simple here: caller provides the ordered day keys they want displayed.
 */
export function flattenUrges(days: DaySnapshot[]) {
  return days.flatMap((d) => d.urges ?? []);
}

export function weeklySummaryFromDays(days: DaySnapshot[]) {
  const scored = days.map((d) => ({
    day: d.day,
    ...calcDailyScoreFromDay(d),
    urges: d.urges.length,
    resistedPct: urgeResistPercent(d.urges),
  }));

  const avgScore = scored.length
    ? Math.round(scored.reduce((a, x) => a + x.score, 0) / scored.length)
    : 0;

  const totalUrges = scored.reduce((a, x) => a + x.urges, 0);
  const allUrges = flattenUrges(days);
  const resistedPctWeek = urgeResistPercent(allUrges);

  const best = scored.reduce((best, x) => (x.score > best.score ? x : best), scored[0] ?? null);
  const worst = scored.reduce((worst, x) => (x.score < worst.score ? x : worst), scored[0] ?? null);

  const weekRank = calcWeeklyRank({ weekEntries: allUrges });

  return {
    avgScore,
    totalUrges,
    resistedPctWeek,
    bestDay: best?.day ?? null,
    bestScore: best?.score ?? null,
    worstDay: worst?.day ?? null,
    worstScore: worst?.score ?? null,
    weekRank,
    perDay: scored,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}