import { DataProvider, User, UserPatch, Workout, WorkoutDraft } from "./types";

const MOCK_USER: User = {
    id: 'me',
    full_name: 'Iron Quant',
    weight: 0,
    muscle_mass: 0,
    fat_percentage: 0,
    estimated_1rm_squat: 0,
    estimated_1rm_bench: 0,
    estimated_1rm_dead: 0,
    level: 1,
    xp: 0,
    current_streak: 0
};

const MOCK_WORKOUTS: Workout[] = [];

export class MockDataProvider implements DataProvider {
    async getUser(_id: string): Promise<User | null> {
        void _id;
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return MOCK_USER;
    }

    async getWorkouts(_userId: string): Promise<Workout[]> {
        void _userId;
        await new Promise(resolve => setTimeout(resolve, 500));
        return MOCK_WORKOUTS;
    }

    async getTodayMission(_userId: string): Promise<string> {
        void _userId;
        return "스쿼트 5x5 증량 도전";
    }

    async saveWorkout(userId: string, workout: WorkoutDraft): Promise<void> {
        console.log("Mock Provider: Saving workout...", workout);

        // Simulating Evolution/Quant Engine Logic
        const newXp = MOCK_USER.xp + 50;
        MOCK_USER.xp = newXp;
        if (newXp >= MOCK_USER.level * 1000) {
            MOCK_USER.level += 1;
            console.log("LEVEL UP!");
        }
        MOCK_USER.current_streak += 1;

        MOCK_WORKOUTS.unshift({
            id: `w-${Date.now()}`,
            user_id: userId,
            workout_date: new Date().toISOString().split('T')[0],
            title: workout.title || "새로운 운동",
            total_volume: 3000 + Math.floor(Math.random() * 1000), // Random volume for 'graph' effect
            average_rpe: 8,
            duration_minutes: 60,
            logs: [],
            mood: 'Good'
        });
        await new Promise(resolve => setTimeout(resolve, 800)); // Simulate delay
    }

    async deleteWorkout(workoutId: string): Promise<void> {
        const index = MOCK_WORKOUTS.findIndex(w => w.id === workoutId);
        if (index > -1) {
            MOCK_WORKOUTS.splice(index, 1);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    async saveUser(_userId: string, patch: UserPatch): Promise<void> {
        void _userId;
        Object.assign(MOCK_USER, patch);
        await new Promise(resolve => setTimeout(resolve, 300));
    }
}
