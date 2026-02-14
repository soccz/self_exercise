
interface ParsedWorkout {
    name: string;
    weight: number;
    reps: number;
    sets: number;
    rpe?: number;
    estimatedDuration: number;
    estimatedCalories: number;
}

function parseWorkoutText(text: string, userWeight: number = 75): ParsedWorkout | null {
    let cleanText = text.trim();
    let rpe: number | undefined;

    // Extract RPE first (syntax: @9 or rpe 9)
    const rpeMatch = cleanText.match(/(@|rpe\s?)([\d\.]+)/i);
    if (rpeMatch) {
        console.log("RPE Match Found:", rpeMatch[0], rpeMatch[2]);
        rpe = parseFloat(rpeMatch[2]);
        cleanText = cleanText.replace(rpeMatch[0], "").trim();
        console.log("After cleaning RPE:", cleanText);
    } else {
        console.log("No RPE match");
    }

    const parts = cleanText.split(/\s+/);
    console.log("Parts:", parts);

    if (parts.length < 2) return null;

    const name = parts[0];
    let weight = 0, reps = 0, sets = 1;

    // Pattern 1: Name Weight Reps Sets (e.g., Squat 100 5 5)
    if (parts.length >= 4) {
        weight = parseFloat(parts[1]);
        reps = parseFloat(parts[2]);
        sets = parseFloat(parts[3]);
    }
    // Pattern 2: Name Weight Reps (Sets default to 3)
    else if (parts.length === 3) {
        weight = parseFloat(parts[1]);
        reps = parseFloat(parts[2]);
        sets = 3; // Default to 3 sets if not specified
    }
    // Pattern 3: Name Weight (e.g., Run 30)
    else if (parts.length === 2) {
        weight = parseFloat(parts[1]);
        reps = 1;
        sets = 1;
    }

    if (isNaN(weight) || isNaN(reps) || isNaN(sets)) return null;

    // Auto-Calculate Stats
    const estimatedDuration = (sets * 3) + 5;

    // METs Calculation
    let mets = 4.5;
    if (weight > 60) mets = 6.0;

    const durationHours = estimatedDuration / 60;
    const estimatedCalories = Math.round(mets * userWeight * durationHours);

    return { name, weight, reps, sets, rpe, estimatedDuration, estimatedCalories };
}

// Test Case
console.log("--- Testing ---");
const input = "벤치프레스 60 10 3 @9.5";
const result = parseWorkoutText(input, 75);
console.log("Result:", result);
