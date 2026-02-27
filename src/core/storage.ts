// src/core/storage.ts
import type { DayKey, DaySnapshot, LockInState, Tab, Mission, TimeBlocks, UrgeEntry } from "./types";
import { SCHEMA_VERSION } from "./types";
import { fmtShort } from "./dates";

/**
 * V1.0 storage strategy:
 * - Single persisted state object: LockInState
 * - Per-day snapshots keyed by YYYY-MM-DD
 * - Migration from legacy per-field keys into today's snapshot
 */

const KEY_STATE = "lockin.state";

// Legacy keys (your old storage.ts)
const KEY_URGES = "lockin.v1.urges";
const KEY_ENERGY = "lockin.v1.energy";
const KEY_MISSIONS = "lockin.v1.missions";
const KEY_TIMEBLOCKS = "lockin.v1.timeblocks";
const KEY_MOOD = "lockin.v1.mood";
const KEY_SLEEP = "lockin.v1.sleep";
const KEY_SPENT = "lockin.v1.spent";

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function now() {
  return Date.now();
}

export function todayKey(d = new Date()): DayKey {
  return fmtShort(d); // expects YYYY-MM-DD
}

export function defaultMissions(): Mission[] {
  return [
    { text: "", done: false },
    { text: "", done: false },
    { text: "", done: false },
  ];
}

export function defaultDay(day: DayKey): DaySnapshot {
  return {
    day,
    energy: 3,
    mood: 3,
    sleep: 7,
    spent: 0,
    timeBlocks: { am: "", pm: "" },
    missions: defaultMissions(),
    urges: [],
    updatedAt: now(),
  };
}

export function defaultState(): LockInState {
  return {
    version: SCHEMA_VERSION,
    days: {},
    ui: { tab: "today" },
  };
}

/**
 * Migration: if no KEY_STATE exists, attempt to pull legacy keys
 * and write them into today's snapshot, then clean up legacy keys.
 */
function migrateLegacyIntoState(): LockInState {
  const state = defaultState();
  const day = todayKey();

  const legacyUrges = safeParse<UrgeEntry[]>(
    localStorage.getItem(KEY_URGES),
    []
  );
  const legacyEnergy = safeParse<number>(
    localStorage.getItem(KEY_ENERGY),
    3
  );
  const legacyMood = safeParse<number>(
    localStorage.getItem(KEY_MOOD),
    3
  );
  const legacySleep = safeParse<number>(
    localStorage.getItem(KEY_SLEEP),
    7
  );
  const legacySpent = safeParse<number>(
    localStorage.getItem(KEY_SPENT),
    0
  );
  const legacyMissions = safeParse<Mission[]>(
    localStorage.getItem(KEY_MISSIONS),
    defaultMissions()
  );
  const legacyTimeBlocks = safeParse<TimeBlocks>(
    localStorage.getItem(KEY_TIMEBLOCKS),
    { am: "", pm: "" }
  );

  const hasAnyLegacy =
    (legacyUrges && legacyUrges.length > 0) ||
    legacyEnergy !== 3 ||
    legacyMood !== 3 ||
    legacySleep !== 7 ||
    legacySpent !== 0 ||
    (legacyMissions?.some((m) => (m.text ?? "").trim().length > 0) ?? false) ||
    ((legacyTimeBlocks?.am ?? "").trim().length > 0) ||
    ((legacyTimeBlocks?.pm ?? "").trim().length > 0);

  if (!hasAnyLegacy) {
    return state;
  }

  state.days[day] = {
    ...defaultDay(day),
    energy: legacyEnergy,
    mood: legacyMood,
    sleep: legacySleep,
    spent: legacySpent,
    missions: legacyMissions?.length ? legacyMissions : defaultMissions(),
    timeBlocks: legacyTimeBlocks,
    urges: legacyUrges ?? [],
    updatedAt: now(),
  };

  // Save migrated state
  localStorage.setItem(KEY_STATE, JSON.stringify(state));

  // Cleanup legacy keys so we don't re-migrate
  try {
    localStorage.removeItem(KEY_URGES);
    localStorage.removeItem(KEY_ENERGY);
    localStorage.removeItem(KEY_MISSIONS);
    localStorage.removeItem(KEY_TIMEBLOCKS);
    localStorage.removeItem(KEY_MOOD);
    localStorage.removeItem(KEY_SLEEP);
    localStorage.removeItem(KEY_SPENT);
  } catch {
    // ignore
  }

  return state;
}

export function loadState(): LockInState {
  const raw = localStorage.getItem(KEY_STATE);
  if (!raw) return migrateLegacyIntoState();

  const parsed = safeParse<LockInState>(raw, defaultState());

  // Minimal validation / fallback
  if (!parsed || typeof parsed !== "object") return defaultState();
  if (!("version" in parsed) || !("days" in parsed) || !("ui" in parsed)) {
    return defaultState();
  }

  // If you ever bump schema versions later, you’ll do migration here.
  // For now, enforce v1 shape.
  if (parsed.version !== SCHEMA_VERSION) {
    // Future-proof: reset to default (or implement real migrations later)
    return defaultState();
  }

  // Ensure ui.tab exists
  if (!parsed.ui?.tab) {
    parsed.ui = { tab: "today" };
  }

  return parsed;
}

export function saveState(state: LockInState) {
  localStorage.setItem(KEY_STATE, JSON.stringify(state));
}

export function getDay(state: LockInState, day: DayKey): DaySnapshot {
  return state.days[day] ?? defaultDay(day);
}

export function upsertDay(state: LockInState, next: DaySnapshot): LockInState {
  const days = { ...state.days, [next.day]: { ...next, updatedAt: now() } };
  return { ...state, days };
}

export function setTab(state: LockInState, tab: Tab): LockInState {
  return { ...state, ui: { ...state.ui, tab } };
}

export function resetAll() {
  localStorage.removeItem(KEY_STATE);
  // also nuke legacy keys just in case
  localStorage.removeItem(KEY_URGES);
  localStorage.removeItem(KEY_ENERGY);
  localStorage.removeItem(KEY_MISSIONS);
  localStorage.removeItem(KEY_TIMEBLOCKS);
  localStorage.removeItem(KEY_MOOD);
  localStorage.removeItem(KEY_SLEEP);
  localStorage.removeItem(KEY_SPENT);
}

/**
 * Convenience helpers for screens:
 * - load today's snapshot
 * - update one field without rewriting screen logic
 */
export function loadToday(): { state: LockInState; day: DaySnapshot } {
  const state = loadState();
  const dayKey = todayKey();
  const day = getDay(state, dayKey);
  return { state, day };
}

export function commitDay(state: LockInState, day: DaySnapshot) {
  const nextState = upsertDay(state, day);
  saveState(nextState);
  return nextState;
}