import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { DataProvider, User, UserPatch, Workout, WorkoutDraft } from "./types";
import { normalizeGoalMode } from "@/lib/goal_mode";

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export class SupabaseDataProvider implements DataProvider {
    private shouldBypassFallback(err: unknown): boolean {
        // If the server explicitly rejects the write (app lock), do not fall back to direct Supabase writes.
        // Otherwise `APP_SECRET` becomes meaningless when anon has write grants.
        const msg = err instanceof Error ? err.message : String(err);
        return msg === "App locked";
    }
    async getUser(id: string): Promise<User | null> {
        // Prefer server API (service role) so UI works even when RLS blocks anon reads.
        try {
            const res = await fetch("/api/user", { cache: "no-store", credentials: "include" });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Failed to load user");
            const raw: unknown = json?.user;
            if (!isRecord(raw)) return null;
            return {
                ...(raw as Record<string, unknown>),
                goal_mode: normalizeGoalMode(raw["goal_mode"]),
                weight: toNumber(raw["weight"]),
                muscle_mass: toNumber(raw["muscle_mass"]),
                fat_percentage: toNumber(raw["fat_percentage"]),
                estimated_1rm_squat: toNumber(raw["estimated_1rm_squat"]),
                estimated_1rm_bench: toNumber(raw["estimated_1rm_bench"]),
                estimated_1rm_dead: toNumber(raw["estimated_1rm_dead"]),
                level: toNumber(raw["level"]),
                xp: toNumber(raw["xp"]),
                current_streak: toNumber(raw["current_streak"]),
            } as User;
        } catch {
            // Fallback to direct Supabase client (dev/legacy)
        }

        if (!isSupabaseConfigured) {
            console.warn("Supabase is not configured. Returning null user.");
            return null;
        }

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            throw error;
        }
        const raw: unknown = data;
        if (!isRecord(raw)) return null;
        return {
            ...raw,
            goal_mode: normalizeGoalMode(raw["goal_mode"]),
            weight: toNumber(raw["weight"]),
            muscle_mass: toNumber(raw["muscle_mass"]),
            fat_percentage: toNumber(raw["fat_percentage"]),
            estimated_1rm_squat: toNumber(raw["estimated_1rm_squat"]),
            estimated_1rm_bench: toNumber(raw["estimated_1rm_bench"]),
            estimated_1rm_dead: toNumber(raw["estimated_1rm_dead"]),
            level: toNumber(raw["level"]),
            xp: toNumber(raw["xp"]),
            current_streak: toNumber(raw["current_streak"]),
        } as User;
    }

    async getWorkouts(userId: string): Promise<Workout[]> {
        // Prefer server API (service role).
        try {
            const res = await fetch("/api/workouts", { cache: "no-store", credentials: "include" });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Failed to load workouts");
            const rows: unknown = json?.workouts;
            if (!Array.isArray(rows)) return [];
            return rows
                .filter(isRecord)
                .map((raw) => ({
                    ...raw,
                    total_volume: toNumber(raw["total_volume"]),
                    average_rpe: toNumber(raw["average_rpe"]),
                    duration_minutes: toNumber(raw["duration_minutes"]),
                    estimated_calories: toNumber(raw["estimated_calories"]),
                    cardio_distance_km: toNumber(raw["cardio_distance_km"]),
                    cardio_avg_speed_kph: toNumber(raw["cardio_avg_speed_kph"]),
                    cardio_avg_incline_pct: toNumber(raw["cardio_avg_incline_pct"]),
                    avg_heart_rate: toNumber(raw["avg_heart_rate"]),
                    logs: raw["logs"] ?? [],
                })) as Workout[];
        } catch {
            // Fallback to direct Supabase client.
        }

        if (!isSupabaseConfigured) return [];

        const { data, error } = await supabase
            .from('workouts')
            .select('*')
            .eq('user_id', userId)
            .order('workout_date', { ascending: false });

        if (error) {
            throw error;
        }
        const rows: unknown = data;
        if (!Array.isArray(rows)) return [];

        return rows
            .filter(isRecord)
            .map((raw) => ({
                ...raw,
                total_volume: toNumber(raw["total_volume"]),
                average_rpe: toNumber(raw["average_rpe"]),
                duration_minutes: toNumber(raw["duration_minutes"]),
                estimated_calories: toNumber(raw["estimated_calories"]),
                cardio_distance_km: toNumber(raw["cardio_distance_km"]),
                cardio_avg_speed_kph: toNumber(raw["cardio_avg_speed_kph"]),
                cardio_avg_incline_pct: toNumber(raw["cardio_avg_incline_pct"]),
                avg_heart_rate: toNumber(raw["avg_heart_rate"]),
                logs: raw["logs"] ?? [],
            })) as Workout[];
    }

    async getTodayMission(_userId: string): Promise<string> {
        void _userId;
        return "컨디션 기반 추천 루틴 생성 중...";
    }

    async saveWorkout(userId: string, workout: WorkoutDraft): Promise<void> {
        try {
            const res = await fetch("/api/workouts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify(workout),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Failed to save workout");
            return;
        } catch (e) {
            if (this.shouldBypassFallback(e)) throw e;
            // Fallback to direct Supabase client.
        }

        if (!isSupabaseConfigured) {
            console.warn("Supabase not configured. Workout not saved.");
            return;
        }
        // In Single Player Mode, we might want to verify the 'secret' here or in RLS, 
        // but for now we just insert.
        const { error } = await supabase
            .from('workouts')
            .insert({
                user_id: userId,
                ...workout
            });

        if (error) {
            throw error;
        }
    }

    async deleteWorkout(workoutId: string): Promise<void> {
        try {
            const res = await fetch(`/api/workouts/${encodeURIComponent(workoutId)}`, {
                method: "DELETE",
                credentials: "include",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Failed to delete workout");
            return;
        } catch (e) {
            if (this.shouldBypassFallback(e)) throw e;
            // Fallback to direct Supabase client.
        }

        const { error } = await supabase
            .from('workouts')
            .delete()
            .eq('id', workoutId);

        if (error) throw error;
    }

    async saveUser(userId: string, patch: UserPatch): Promise<void> {
        try {
            const res = await fetch("/api/user", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify(patch),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Failed to save user");
            return;
        } catch (e) {
            if (this.shouldBypassFallback(e)) throw e;
            // Fallback to direct Supabase client.
        }

        if (!isSupabaseConfigured) return;

        const { error } = await supabase
            .from("users")
            .upsert({ id: userId, ...patch }, { onConflict: "id" });

        if (error) throw error;
    }
}
