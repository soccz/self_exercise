import type { GoalMode } from "@/lib/data/types";

export type CouncilAgent = "analyst" | "physio" | "psych";
export type CouncilRisk = "low" | "medium" | "high";
export type CouncilHorizon = "today" | "week";

export interface CouncilWorkout {
  workout_date: string;
  total_volume: number;
  average_rpe: number;
  duration_minutes: number;
  estimated_calories?: number;
  cardio_distance_km?: number;
}

export interface CouncilCondition {
  condition_date: string;
  sleep_hours?: number;
  fatigue_score?: number;
  stress_score?: number;
  soreness_score?: number;
  resting_hr?: number;
}

export interface CouncilUser {
  id: string;
  mode: GoalMode;
  weight: number;
  current_streak: number;
}

export interface CouncilInput {
  now: Date;
  user: CouncilUser;
  workouts: CouncilWorkout[];
  conditions: CouncilCondition[];
}

export interface CouncilAdvice {
  agent: CouncilAgent;
  mode: GoalMode;
  priority: number; // 0~100
  confidence: number; // 0~1
  risk: CouncilRisk;
  horizon: CouncilHorizon;
  headline: string;
  reason: string[];
  action: string;
  tags: string[];
}

export interface CouncilResult {
  top: CouncilAdvice[];
  primary: CouncilAdvice | null;
}
