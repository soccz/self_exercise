"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DataProvider, User, UserPatch, Workout, WorkoutDraft } from "./types";
import { MockDataProvider } from "./mock";
import { SupabaseDataProvider } from "./supabase_service";
import { MY_ID } from "../supabase";
import { analyzePortfolio, calculateCalories, AssetAdvice, calculateTotalAssetValue } from "../quant/engine";
import { enqueueUserPatch, enqueueWorkoutAdd, enqueueWorkoutDelete, flushQueue, getQueueSize } from "@/lib/offline/queue";

// Default to Supabase in production. Opt-in to mock for local/demo.
// Set NEXT_PUBLIC_USE_MOCK=true to force mock provider.
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

interface DataContextType {
    user: User | null;
    recentWorkouts: Workout[];
    todayMission: string;
    assetAdvice: AssetAdvice[];
    totalAssetValue: number;
    lastWorkoutCalories?: number;
    recoveryStatus?: { need: boolean, reasons: string[] }; // Keeping for compatibility or UI usage
    error: string | null;
    refreshData: () => Promise<void>;
    saveWorkout: (workout: WorkoutDraft) => Promise<boolean>;
    deleteWorkout: (id: string) => Promise<boolean>;
    saveUser: (patch: UserPatch) => Promise<boolean>;
    isLoading: boolean;
    offlineQueueSize: number;
}

const DataContext = createContext<DataContextType>({
    user: null,
    recentWorkouts: [],
    todayMission: "",
    assetAdvice: [],
    totalAssetValue: 0,
    error: null,
    refreshData: async () => { },
    saveWorkout: async () => false,
    deleteWorkout: async () => false,
    saveUser: async () => false,
    isLoading: true,
    recoveryStatus: { need: false, reasons: [] },
    offlineQueueSize: 0,
});

export function DataContextProvider({ children }: { children: React.ReactNode }) {
    const [provider] = useState<DataProvider>(() =>
        USE_MOCK ? new MockDataProvider() : new SupabaseDataProvider()
    );

    const [user, setUser] = useState<User | null>(null);
    const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
    const [todayMission, setTodayMission] = useState("");
    const [assetAdvice, setAssetAdvice] = useState<AssetAdvice[]>([]);
    const [totalAssetValue, setTotalAssetValue] = useState(0);
    const [lastWorkoutCalories, setLastWorkoutCalories] = useState<number>(0);
    const [recoveryStatus, setRecoveryStatus] = useState<{ need: boolean, reasons: string[] }>({ need: false, reasons: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [offlineQueueSize, setOfflineQueueSize] = useState<number>(0);

    const shouldQueueOffline = (err: unknown): boolean => {
        if (USE_MOCK) return false;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
        const msg = err instanceof Error ? err.message : String(err);
        return msg.includes("Failed to fetch") || msg.includes("NetworkError");
    };

    const refreshQueueSize = () => {
        try {
            setOfflineQueueSize(getQueueSize());
        } catch {
            setOfflineQueueSize(0);
        }
    };

    const refreshData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const fallbackUser: User = {
            id: MY_ID,
            full_name: "Me",
            weight: 0,
            muscle_mass: 0,
            fat_percentage: 0,
            estimated_1rm_squat: 0,
            estimated_1rm_bench: 0,
            estimated_1rm_dead: 0,
            level: 1,
            xp: 0,
            current_streak: 0,
        };

        try {
            const [userResult, workoutsResult] = await Promise.allSettled([
                provider.getUser(MY_ID),
                provider.getWorkouts(MY_ID),
            ]);

            const userData =
                userResult.status === "fulfilled" ? userResult.value : null;
            const workouts =
                workoutsResult.status === "fulfilled" ? workoutsResult.value : [];

            // Always set a non-null user so the UI can hydrate and buttons work
            // even if Supabase is misconfigured/RLS blocks reads.
            const currentUser = userData ?? fallbackUser;
            setUser(currentUser);
            setRecentWorkouts(workouts);

            if (userResult.status === "rejected") {
                const msg =
                    userResult.reason instanceof Error
                        ? userResult.reason.message
                        : "Failed to load user";
                setError(msg);
            }
            if (workoutsResult.status === "rejected") {
                const msg =
                    workoutsResult.reason instanceof Error
                        ? workoutsResult.reason.message
                        : "Failed to load workouts";
                setError((prev) => prev ?? msg);
            }

            // Apply Client-Side Quant Logic (New Engine)
            const advice = analyzePortfolio(workouts);
            setAssetAdvice(advice);

            // Set 'Mission' to the top priority advice
            if (advice.length > 0) {
                setTodayMission(advice[0].recommendedWorkout || advice[0].message);
            } else {
                setTodayMission("자유 운동");
            }

            // Calculate Asset Value
            const assetValue = calculateTotalAssetValue({
                squat: currentUser.estimated_1rm_squat || 0,
                bench: currentUser.estimated_1rm_bench || 0,
                dead: currentUser.estimated_1rm_dead || 0
            });
            setTotalAssetValue(assetValue);


            // Legacy Recovery Status (Map from advice for UI compatibility if needed)
            const restAdvice = advice.find(a => a.message.includes("휴식") || a.message.includes("휴장"));
            setRecoveryStatus({
                need: !!restAdvice,
                reasons: restAdvice ? [restAdvice.message] : []
            });

            // Calculate Calories for latest workout
            if (workouts.length > 0 && currentUser) {
                const last = workouts[0];
                const cals = calculateCalories(currentUser.weight, last.duration_minutes, last.average_rpe);
                setLastWorkoutCalories(cals);
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to load data";
            console.error("Failed to load data:", error);
            setError(message);
            setUser((prev) => prev ?? fallbackUser);
            setRecentWorkouts([]);
        } finally {
            setIsLoading(false);
        }
    }, [provider]);

    const flushOffline = useCallback(async () => {
        if (USE_MOCK) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        try {
            const res = await flushQueue(provider, MY_ID);
            refreshQueueSize();
            if (res.flushed > 0) {
                await refreshData();
            }
        } catch {
            // ignore
        }
    }, [provider, refreshData]);

    const saveWorkout = useCallback(async (workout: WorkoutDraft) => {
        setIsLoading(true);
        setError(null);
        try {
            await provider.saveWorkout(MY_ID, workout);
            await refreshData();
            return true;
        } catch (error) {
            console.error("Failed to save workout:", error);
            if (shouldQueueOffline(error)) {
                enqueueWorkoutAdd(workout);
                refreshQueueSize();
                return true;
            }
            setError(error instanceof Error ? error.message : "Failed to save workout");
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [provider, refreshData]);

    const saveUser = useCallback(async (patch: UserPatch) => {
        setIsLoading(true);
        setError(null);
        try {
            await provider.saveUser(MY_ID, patch);
            await refreshData();
            return true;
        } catch (error) {
            console.error("Failed to save user:", error);
            if (shouldQueueOffline(error)) {
                enqueueUserPatch(patch);
                refreshQueueSize();
                return true;
            }
            setError(error instanceof Error ? error.message : "Failed to save user");
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [provider, refreshData]);

    const deleteWorkout = useCallback(async (id: string) => {
        setIsLoading(true);
        setError(null);
        try {
            await provider.deleteWorkout(id);
            await refreshData();
            return true;
        } catch (error) {
            console.error("Failed to delete workout:", error);
            if (shouldQueueOffline(error)) {
                enqueueWorkoutDelete(id);
                refreshQueueSize();
                return true;
            }
            setError(error instanceof Error ? error.message : "Failed to delete workout");
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [provider, refreshData]);

    useEffect(() => {
        refreshQueueSize();
        refreshData();
        // Try flushing any queued actions on startup.
        void flushOffline();
    }, [refreshData, flushOffline]);

    useEffect(() => {
        const onOnline = () => {
            void flushOffline();
        };
        window.addEventListener("online", onOnline);
        return () => window.removeEventListener("online", onOnline);
    }, [flushOffline]);

    return (
        <DataContext.Provider value={{ user, recentWorkouts, todayMission, lastWorkoutCalories, error, refreshData, saveWorkout, deleteWorkout, saveUser, isLoading, recoveryStatus, assetAdvice, totalAssetValue, offlineQueueSize }}>
            {children}
        </DataContext.Provider>
    );
}

export const useData = () => useContext(DataContext);
