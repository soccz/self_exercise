import assert from "node:assert/strict";
import { consultCouncil } from "./ensemble";
import type { CouncilCondition, CouncilInput, CouncilWorkout } from "./types";

const BASE_NOW = new Date("2026-02-16T00:00:00Z");

function ymdDaysAgo(days: number): string {
  return new Date(BASE_NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function makeInput(params: {
  mode?: "fat_loss" | "muscle_gain";
  workouts?: CouncilWorkout[];
  conditions?: CouncilCondition[];
  streak?: number;
}): CouncilInput {
  return {
    now: BASE_NOW,
    user: {
      id: "me",
      mode: params.mode ?? "fat_loss",
      weight: 75,
      current_streak: params.streak ?? 0,
    },
    workouts: params.workouts ?? [],
    conditions: params.conditions ?? [],
  };
}

function testOverheatScenario(): void {
  const workouts: CouncilWorkout[] = Array.from({ length: 5 }, (_v, i) => ({
    workout_date: ymdDaysAgo(i),
    total_volume: 0,
    average_rpe: 10,
    duration_minutes: 45,
    estimated_calories: 450,
    cardio_distance_km: 6,
  }));
  const result = consultCouncil(makeInput({ workouts, mode: "fat_loss", streak: 8 }));
  assert.ok(result.primary, "primary advice should exist");
  assert.equal(result.primary?.agent, "physio");
  assert.equal(result.primary?.risk, "high");
}

function testDropoutScenario(): void {
  const workouts: CouncilWorkout[] = [
    {
      workout_date: ymdDaysAgo(4),
      total_volume: 0,
      average_rpe: 6,
      duration_minutes: 20,
      estimated_calories: 160,
      cardio_distance_km: 2.5,
    },
  ];
  const result = consultCouncil(makeInput({ workouts, mode: "fat_loss", streak: 0 }));
  assert.ok(result.primary, "primary advice should exist");
  assert.equal(result.primary?.agent, "psych");
  assert.match(result.primary?.headline ?? "", /작심삼일|시장 이탈/);
}

function testStagnationScenario(): void {
  const workouts: CouncilWorkout[] = [
    {
      workout_date: ymdDaysAgo(0),
      total_volume: 0,
      average_rpe: 6,
      duration_minutes: 18,
      estimated_calories: 120,
      cardio_distance_km: 2.2,
    },
    {
      workout_date: ymdDaysAgo(2),
      total_volume: 0,
      average_rpe: 6,
      duration_minutes: 22,
      estimated_calories: 140,
      cardio_distance_km: 2.8,
    },
  ];
  const result = consultCouncil(makeInput({ workouts, mode: "fat_loss", streak: 2 }));
  assert.ok(result.primary, "primary advice should exist");
  assert.equal(result.primary?.agent, "analyst");
  assert.match(result.primary?.headline ?? "", /매수세|활동량 부족|목표선/);
}

testOverheatScenario();
testDropoutScenario();
testStagnationScenario();

console.log("ensemble tests passed");
