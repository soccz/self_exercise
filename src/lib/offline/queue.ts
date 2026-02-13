"use client";

import type { UserPatch, WorkoutDraft } from "@/lib/data/types";

type QueueItem =
  | { t: "user_patch"; at: number; patch: UserPatch }
  | { t: "workout_add"; at: number; workout: WorkoutDraft }
  | { t: "workout_del"; at: number; id: string };

const KEY = "iq_offline_queue_v1";

function load(): QueueItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as QueueItem[];
  } catch {
    return [];
  }
}

function save(items: QueueItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    // ignore
  }
}

export function enqueueUserPatch(patch: UserPatch) {
  const items = load();
  const now = Date.now();
  // Merge into the latest patch item to avoid growing queue on repeated edits.
  const idx = items.findIndex((i) => i.t === "user_patch");
  if (idx >= 0) {
    const current = items[idx] as Extract<QueueItem, { t: "user_patch" }>;
    items[idx] = { t: "user_patch", at: now, patch: { ...current.patch, ...patch } };
  } else {
    items.unshift({ t: "user_patch", at: now, patch });
  }
  save(items);
}

export function enqueueWorkoutAdd(workout: WorkoutDraft) {
  const items = load();
  items.unshift({ t: "workout_add", at: Date.now(), workout });
  save(items);
}

export function enqueueWorkoutDelete(id: string) {
  const items = load();
  items.unshift({ t: "workout_del", at: Date.now(), id });
  save(items);
}

export function getQueueSize(): number {
  return load().length;
}

export async function flushQueue(provider: {
  saveUser: (userId: string, patch: UserPatch) => Promise<void>;
  saveWorkout: (userId: string, workout: WorkoutDraft) => Promise<void>;
  deleteWorkout: (workoutId: string) => Promise<void>;
}, userId: string): Promise<{ flushed: number; remaining: number }> {
  const items = load();
  let flushed = 0;

  const remaining: QueueItem[] = [];
  // Oldest first to preserve intent (especially delete after add etc.)
  const ordered = [...items].reverse();
  for (let i = 0; i < ordered.length; i += 1) {
    const item = ordered[i];
    try {
      if (item.t === "user_patch") {
        await provider.saveUser(userId, item.patch);
      } else if (item.t === "workout_add") {
        await provider.saveWorkout(userId, item.workout);
      } else if (item.t === "workout_del") {
        await provider.deleteWorkout(item.id);
      }
      flushed += 1;
    } catch {
      // Stop early; keep item and everything older.
      remaining.push(item, ...ordered.slice(i + 1));
      break;
    }
  }

  // Convert remaining back to newest-first
  const newestFirst = remaining.reverse();
  save(newestFirst);
  return { flushed, remaining: newestFirst.length };
}
