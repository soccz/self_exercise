export type GoalMode = "fat_loss" | "muscle_gain";

export interface User {
    id: string;
    full_name: string;
    goal_mode: GoalMode;
    weight: number;
    muscle_mass: number;
    fat_percentage: number;
    estimated_1rm_squat: number;
    estimated_1rm_bench: number;
    estimated_1rm_dead: number;
    level: number;
    xp: number;
    current_streak: number;
}

export type UserPatch = Partial<Omit<User, "id">>;

export interface ExerciseLog {
    name: string;
    sets: number;
    reps: number;
    weight: number;
    rpe?: number;
}

export interface Workout {
    id: string;
    user_id: string;
    workout_date: string;
    title: string;
    total_volume: number;
    average_rpe: number;
    duration_minutes: number;
    logs: ExerciseLog[];
    feedback?: string;
    mood?: string;
}

export type WorkoutDraft = Omit<Workout, "id" | "user_id">;

export interface Routine {
    id: string;
    name: string;
    days: string[]; // Mon, Tue, etc.
    reps: number;
    intensity: number;
    type: 'upper' | 'lower' | 'core' | 'mobility' | 'cardio';
    unit: string;
    description?: string; // Optional extra
}

export interface DataProvider {
    getUser(id: string): Promise<User | null>;
    getWorkouts(userId: string): Promise<Workout[]>;
    getTodayMission(userId: string): Promise<string>;
    saveWorkout(userId: string, workout: WorkoutDraft): Promise<void>;
    deleteWorkout(workoutId: string): Promise<void>;
    saveUser(userId: string, patch: UserPatch): Promise<void>;
}
