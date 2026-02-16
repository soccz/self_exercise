"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useData } from "@/lib/data/context";
import { parseWorkoutText } from "@/lib/quant/engine";
import { useUI } from "@/lib/ui/context";
import { modeRecordTemplates } from "@/lib/goal_mode";

interface WorkoutLoggerProps {
    isOpen: boolean;
    onClose: () => void;
}

export function WorkoutLogger({ isOpen, onClose }: WorkoutLoggerProps) {
    const { saveWorkout, recentWorkouts, user, syncState, syncMessage } = useData();
    const { pushToast } = useUI();
    const [title, setTitle] = useState("오늘의 운동");
    const [raw, setRaw] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const goalMode = user?.goal_mode ?? "fat_loss";
    const templates = modeRecordTemplates(goalMode);

    useEffect(() => {
        if (!isOpen) return;
        setTitle(goalMode === "fat_loss" ? "오늘의 유산소" : "오늘의 운동");
    }, [goalMode, isOpen]);

    const handleSubmit = async () => {
        const normalizedTitle = title.trim();
        const normalizedRaw = raw.trim();
        if (!normalizedTitle && !normalizedRaw) return;

        setIsSubmitting(true);
        try {
            const userWeight = user?.weight || 75;
            const lines = normalizedRaw
                ? normalizedRaw
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .map((l) => l.replace(/^[-*]\s+/, ""))
                : [];

            const bad: string[] = [];
            const parsedLogs = lines
                .filter((l) => /\d/.test(l))
                .map((l) => {
                    const p = parseWorkoutText(l, userWeight);
                    if (!p || p.weight <= 0) {
                        bad.push(l);
                        return null;
                    }
                    return p;
                })
                .filter(Boolean);

            if (bad.length > 0) {
                pushToast("error", `해석 실패: ${bad.slice(0, 3).join(" / ")}${bad.length > 3 ? " ..." : ""}`);
                return;
            }

            const workoutData = (() => {
                if (parsedLogs.length === 0) {
                    // Fallback: try parsing the title as a single entry
                    const p = parseWorkoutText(normalizedTitle, userWeight);
                    if (p && p.weight > 0) {
                        return {
                            title: normalizedTitle || `${p.name} ${p.weight}kg`,
                            total_volume: p.weight * p.reps * p.sets,
                            average_rpe: 8,
                            duration_minutes: p.estimatedDuration,
                            logs: [{ name: p.name, weight: p.weight, reps: p.reps, sets: p.sets, rpe: p.rpe }],
                        };
                    }
                    return {
                        title: normalizedTitle || (goalMode === "fat_loss" ? "오늘의 유산소" : "오늘의 운동"),
                        total_volume: 0,
                        average_rpe: 6,
                        duration_minutes: goalMode === "fat_loss" ? 30 : 45,
                        logs: [],
                    };
                }

                const logs = parsedLogs.map((p) => ({
                    name: p!.name,
                    weight: p!.weight,
                    reps: p!.reps,
                    sets: p!.sets,
                    rpe: p!.rpe,
                }));
                const totalVol = logs.reduce((acc, l) => acc + l.weight * l.reps * l.sets, 0);
                const duration = parsedLogs.reduce((acc, p) => acc + (p?.estimatedDuration ?? 0), 0);
                const avgRpe = (() => {
                    const rpes = logs.map((l) => (typeof l.rpe === "number" && Number.isFinite(l.rpe) ? l.rpe : 8));
                    const sum = rpes.reduce((a, b) => a + b, 0);
                    return rpes.length ? sum / rpes.length : 8;
                })();

                return {
                    title: normalizedTitle || `Batch (${logs.length})`,
                    total_volume: totalVol,
                    average_rpe: avgRpe,
                    duration_minutes: duration || 0,
                    logs,
                };
            })();

            const ok = await saveWorkout({
                workout_date: new Date().toISOString().split("T")[0],
                mood: "Good",
                ...workoutData
            });

            if (ok) {
                pushToast("success", "운동 기록 저장 완료");
                onClose();
                setTitle(goalMode === "fat_loss" ? "오늘의 유산소" : "오늘의 운동"); // Reset form
                setRaw("");
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
                            <h2 className="text-2xl font-bold dark:text-white">{goalMode === "fat_loss" ? "유산소 기록" : "운동 기록"}</h2>
                            <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                                <X size={20} className="dark:text-white" />
                            </button>
                        </div>

                        {/* Form Content */}
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">제목</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder={goalMode === "fat_loss" ? "오늘의 유산소" : "오늘의 운동"}
                                    className="w-full text-xl font-bold border-b-2 border-gray-200 focus:border-toss-blue outline-none py-2 bg-transparent dark:text-white dark:border-gray-700 placeholder-gray-300"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">운동 기록 (여러 줄 가능)</label>
                                <textarea
                                    value={raw}
                                    onChange={(e) => setRaw(e.target.value)}
                                    placeholder={goalMode === "fat_loss" ? "러닝머신 30 8 1\n러닝머신 30분 8km/h 경사 1\n사이클 35분 20km/h" : "스쿼트 100 5 5\n벤치 60x10x5 @9\n데드 120 5 5"}
                                    className="w-full min-h-28 resize-y border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 bg-transparent dark:text-white placeholder-gray-300"
                                />
                                <p className="text-xs text-gray-400 mt-2">
                                    {goalMode === "fat_loss"
                                        ? "Tip: `러닝머신 30 8 1`(시간/속도/경사) 또는 `러닝머신 30분 8km/h`처럼 입력하면 칼로리/거리 계산 정확도가 올라갑니다."
                                        : "Tip: `벤치 60x10x5`, `벤치 60 10 5`, `@9` 모두 지원합니다."}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => {
                                        const last = recentWorkouts[0];
                                        const logs = last?.logs ?? [];
                                        const lines = logs
                                            .filter((l) => l?.name && Number.isFinite(l.weight) && Number.isFinite(l.reps) && Number.isFinite(l.sets))
                                            .slice(0, 12)
                                            .map((l) => `${l.name} ${l.weight} ${l.reps} ${l.sets}${l.rpe ? ` @${l.rpe}` : ""}`);
                                        if (lines.length > 0) {
                                            setTitle(last?.title || "오늘의 운동");
                                            setRaw(lines.join("\n"));
                                            return;
                                        }
                                        if (last?.title) setTitle(last.title);
                                    }}
                                    className="rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                    마지막 기록 불러오기
                                </button>
                                <button
                                    onClick={() => setRaw(templates[0] ?? "스쿼트 100 5 5")}
                                    className="rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                    템플릿 1
                                </button>
                                <button
                                    onClick={() => setRaw(templates[1] ?? "벤치 60x10x5")}
                                    className="rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                    템플릿 2
                                </button>
                                <button
                                    onClick={() => setRaw(templates[2] ?? "데드 120 5 5")}
                                    className="rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                    템플릿 3
                                </button>
                            </div>

                            <div className="rounded-2xl border border-toss-grey-100 bg-toss-grey-50 px-3 py-2 text-xs text-toss-grey-700 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                                동기화 상태: {syncState === "saved" ? "저장됨" : syncState === "syncing" ? "동기화중" : syncState === "done" ? "완료" : syncState === "conflict" ? "충돌" : syncState === "error" ? "실패" : "대기"} · {syncMessage}
                            </div>

                            {/* Preview Card */}
                            {(raw.trim() || title.trim()) && (
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600">
                                    {(() => {
                                        const userWeight = user?.weight || 75;
                                        const lines = raw
                                            .split(/\r?\n/)
                                            .map((l) => l.trim())
                                            .filter(Boolean)
                                            .map((l) => l.replace(/^[-*]\s+/, ""))
                                            .filter((l) => /\d/.test(l));
                                        const parsed = lines.map((l) => parseWorkoutText(l, userWeight)).filter((p) => p && p.weight > 0);
                                        if (parsed.length > 0) {
                                            const vol = parsed.reduce((acc, p) => acc + (p!.weight * p!.reps * p!.sets), 0);
                                            return (
                                                <div className="text-sm space-y-1">
                                                    <div className="font-bold text-toss-blue dark:text-blue-400">✅ 자동 분석됨 ({parsed.length}줄)</div>
                                                    <div className="text-gray-600 dark:text-gray-300 whitespace-pre-line">
                                                        {parsed.slice(0, 5).map((p, i) => `${i + 1}) ${p!.name}: ${p!.weight} x ${p!.reps} x ${p!.sets}${p!.rpe ? ` @${p!.rpe}` : ""}`).join("\n")}
                                                        {parsed.length > 5 ? `\n... +${parsed.length - 5}` : ""}
                                                    </div>
                                                    <div className="text-gray-500 text-xs">총 볼륨: {Math.round(vol).toLocaleString()}kg</div>
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
                                disabled={isSubmitting || (!title.trim() && !raw.trim())}
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
