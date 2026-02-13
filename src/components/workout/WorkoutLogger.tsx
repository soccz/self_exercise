"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { useState } from "react";
import { useData } from "@/lib/data/context";
import { parseWorkoutText } from "@/lib/quant/engine";
import { useUI } from "@/lib/ui/context";

interface WorkoutLoggerProps {
    isOpen: boolean;
    onClose: () => void;
}

export function WorkoutLogger({ isOpen, onClose }: WorkoutLoggerProps) {
    const { saveWorkout, recentWorkouts } = useData();
    const { pushToast } = useUI();
    const [title, setTitle] = useState("오늘의 운동");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        const normalizedTitle = title.trim();
        if (!normalizedTitle) return;

        setIsSubmitting(true);
        try {
            const parsed = parseWorkoutText(normalizedTitle);

            // Use parsed data or defaults if parsing failed
            const workoutData = parsed && parsed.weight > 0 ? {
                title: `${parsed.name} ${parsed.weight}kg`,
                total_volume: parsed.weight * parsed.reps * parsed.sets,
                average_rpe: 8,
                duration_minutes: parsed.estimatedDuration,
                logs: [{ name: parsed.name, weight: parsed.weight, reps: parsed.reps, sets: parsed.sets }],
            } : {
                title: normalizedTitle,
                total_volume: 0,
                average_rpe: 6,
                duration_minutes: 45,
                logs: [],
            };

            const ok = await saveWorkout({
                workout_date: new Date().toISOString().split("T")[0],
                mood: "Good",
                ...workoutData
            });

            if (ok) {
                pushToast("success", "운동 기록 저장 완료");
                onClose();
                setTitle(""); // Reset form
            } else {
                pushToast("error", "기록 저장 실패");
            }
        } catch (e) {
            console.error(e);
            pushToast("error", "기록 저장 중 오류");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black z-40"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 rounded-t-3xl p-6 min-h-[60vh] max-w-md mx-auto shadow-2xl"
                    >
                        {/* Handle Bar */}
                        <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6" />

                        {/* Header */}
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-bold dark:text-white">운동 기록</h2>
                            <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                                <X size={20} className="dark:text-white" />
                            </button>
                        </div>

                        {/* Form Content */}
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">운동 기록 (예: 스쿼트 100 5 5)</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="스쿼트 100 5 5"
                                    className="w-full text-xl font-bold border-b-2 border-gray-200 focus:border-toss-blue outline-none py-2 bg-transparent dark:text-white dark:border-gray-700 placeholder-gray-300"
                                />
                                <p className="text-xs text-gray-400 mt-2">
                                    Tip: &quot;종목 무게 횟수 세트&quot; 순서로 적으면 자동 계산됩니다.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => {
                                        const last = recentWorkouts[0];
                                        const log = last?.logs?.[0];
                                        if (log?.name && Number.isFinite(log.weight) && Number.isFinite(log.reps) && Number.isFinite(log.sets)) {
                                            setTitle(`${log.name} ${log.weight} ${log.reps} ${log.sets}`);
                                            return;
                                        }
                                        if (last?.title) setTitle(last.title);
                                    }}
                                    className="rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                    마지막 기록 불러오기
                                </button>
                                <button
                                    onClick={() => setTitle("스쿼트 100 5 5")}
                                    className="rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                    스쿼트 템플릿
                                </button>
                                <button
                                    onClick={() => setTitle("벤치 60 10 5")}
                                    className="rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                    벤치 템플릿
                                </button>
                                <button
                                    onClick={() => setTitle("데드 120 5 5")}
                                    className="rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                    데드 템플릿
                                </button>
                            </div>

                            {/* Preview Card */}
                            {title.trim() && (
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600">
                                    {(() => {
                                        const parsed = parseWorkoutText(title);
                                        if (parsed && parsed.weight > 0) {
                                            return (
                                                <div className="text-sm space-y-1">
                                                    <div className="font-bold text-toss-blue dark:text-blue-400">✅ 자동 분석됨</div>
                                                    <div className="text-gray-600 dark:text-gray-300">
                                                        🏋️ {parsed.name}: {parsed.weight}kg × {parsed.reps}회 × {parsed.sets}세트
                                                    </div>
                                                    <div className="text-gray-500 text-xs">
                                                        ⏱ 예상 {parsed.estimatedDuration}분 | 🔥 {parsed.estimatedCalories}kcal
                                                    </div>
                                                </div>
                                            );
                                        } else {
                                            return (
                                                <div className="text-sm text-gray-400">
                                                    ✍️ 텍스트를 분석 중입니다...<br />
                                                    (예: 벤치 60 10 5)
                                                </div>
                                            );
                                        }
                                    })()}
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !title.trim()}
                                className="w-full bg-toss-blue text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <span>저장 중...</span>
                                ) : (
                                    <>
                                        <Check size={20} />
                                        <span>기록 저장하기</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
