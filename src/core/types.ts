// src/core/types.ts
export const SCHEMA_VERSION = 1 as const;

export type UrgeType =
  | "scrolling"
  | "gaming"
  | "junk food"
  | "late-night snacking"
  | "shopping/spending"
  | "gambling"
  | "alcohol"
  | "weed"
  | "vape"
  | "cigs/cigars"
  | "porn"
  | "custom";

export type UrgeEntry = {
  id: string;
  type: UrgeType;
  customLabel?: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  resisted: boolean;
  note?: string;
  ts: number; // epoch ms
};

export type Tab = "today" | "weekly" | "history";

export type Mission = { text: string; done: boolean };

// Keep your existing shape (you can expand later if you want)
export type TimeBlocks = { am: string; pm: string };

// YYYY-MM-DD
export type DayKey = string;

export type DaySnapshot = {
  day: DayKey;

  // Quick stats (0–5 or 0–10 scales are fine; we’ll normalize in scoring)
  energy: number; // 0..10 recommended
  mood: number; // 0..10 recommended
  sleep: number; // hours OR 0..10 — just stay consistent
  spent: number; // dollars (or 0..10 if you want “spending control”)

  timeBlocks?: TimeBlocks;

  missions: Mission[];
  urges: UrgeEntry[];

  // bookkeeping
  updatedAt: number; // epoch ms
};

export type LockInState = {
  version: typeof SCHEMA_VERSION;

  // Map of day => snapshot
  days: Record<DayKey, DaySnapshot>;

  // Small UI preferences are ok to persist
  ui: {
    tab: Tab;
  };
};