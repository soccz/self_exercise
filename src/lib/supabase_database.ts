// Minimal Supabase Database type for server-side usage (Telegram webhook, etc.).
// This avoids `any` and keeps type-safety without requiring codegen.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          full_name: string | null;
          goal_mode: "fat_loss" | "muscle_gain" | null;
          weight: number | string | null;
          muscle_mass: number | string | null;
          fat_percentage: number | string | null;
          estimated_1rm_squat: number | string | null;
          estimated_1rm_bench: number | string | null;
          estimated_1rm_dead: number | string | null;
          level: number | null;
          xp: number | null;
          current_streak: number | null;
          last_workout_date: string | null;
          telegram_chat_id: string | null;
          telegram_remind_enabled: boolean | null;
          telegram_remind_time: string | null;
          telegram_timezone: string | null;
          telegram_last_reminded_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["users"]["Row"], "created_at" | "updated_at">> & {
          id: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["users"]["Row"], "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      workouts: {
        Row: {
          id: string;
          user_id: string | null;
          routine_id: string | null;
          workout_date: string | null;
          title: string | null;
          total_volume: number | string | null;
          average_rpe: number | string | null;
          duration_minutes: number | null;
          estimated_calories: number | string | null;
          cardio_distance_km: number | string | null;
          cardio_avg_speed_kph: number | string | null;
          cardio_avg_incline_pct: number | string | null;
          avg_heart_rate: number | null;
          logs: Json | null;
          feedback: string | null;
          mood: string | null;
          created_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["workouts"]["Row"], "id" | "created_at">> & {
          user_id: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["workouts"]["Row"], "id" | "created_at">>;
        Relationships: [];
      };
      daily_conditions: {
        Row: {
          id: string;
          user_id: string | null;
          condition_date: string;
          sleep_hours: number | string | null;
          fatigue_score: number | null;
          stress_score: number | null;
          soreness_score: number | null;
          resting_hr: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["daily_conditions"]["Row"], "id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<Database["public"]["Tables"]["daily_conditions"]["Row"], "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      advice_logs: {
        Row: {
          id: string;
          user_id: string | null;
          event_date: string;
          source: string;
          mode: string | null;
          advice_json: Json;
          created_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["advice_logs"]["Row"], "id" | "created_at">>;
        Update: Partial<Omit<Database["public"]["Tables"]["advice_logs"]["Row"], "id" | "created_at">>;
        Relationships: [];
      };
      routines: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          description: string | null;
          exercises: Json;
          difficulty_level: number | null;
          is_public: boolean | null;
          created_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["routines"]["Row"], "id" | "created_at">>;
        Update: Partial<Omit<Database["public"]["Tables"]["routines"]["Row"], "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
