"use client";

import { motion } from "framer-motion";
import { ChevronRight, TrendingUp, Activity, AlertCircle, Flame, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useData } from "@/lib/data/context";
import { useUI } from "@/lib/ui/context";
import { AssetAdvice, calculateCalories } from "@/lib/quant/engine";
import { goalModeLabel } from "@/lib/goal_mode";

export function AssetView() {
    const { user, totalAssetValue, assetAdvice, lastWorkoutCalories, isLoading, error, recentWorkouts, todayMission } = useData();
    const { openLogger, openProfileEditor } = useUI();
    const [now] = useState(() => Date.now());

    if (isLoading || !user) {
        return (
            <div className="p-5 flex items-center justify-center min-h-[50vh]">
                <div className="animate-pulse space-y-4 w-full">
                    <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                    <div className="h-40 bg-gray-200 rounded-3xl"></div>
                    <div className="h-20 bg-gray-200 rounded-2xl"></div>
                </div>
            </div>
        );
    }

    const isFatLoss = user.goal_mode === "fat_loss";
    const primaryAdvice = assetAdvice[0];
    const isProfileEmpty = !user.full_name || user.full_name === "Me" || user.weight === 0;

    const week = (() => {
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const rows = recentWorkouts.filter((w) => {
            const t = Date.parse(w.workout_date);
            return Number.isFinite(t) && t >= sevenDaysAgo;
        });
        const minutes = rows.reduce((acc, w) => acc + (w.duration_minutes || 0), 0);
        const calories = rows.reduce((acc, w) => acc + calculateCalories(user.weight || 75, w.duration_minutes || 0, w.average_rpe || 6), 0);
        const targetMinutes = 150;
        const progress = Math.max(0, Math.min(100, Math.round((minutes / targetMinutes) * 100)));
        return { rows, minutes, calories, targetMinutes, progress };
    })();

    return (
        <div className="p-5 space-y-6 pb-24">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-between items-start"
            >
                <div>
                    <div className="flex items-center space-x-2 mb-1">
                        <span className="bg-toss-blue/10 text-toss-blue px-2 py-0.5 rounded-md text-xs font-bold">
                            {goalModeLabel(user.goal_mode)}
                        </span>
                        {error && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-md text-xs font-bold">Offline</span>}
                    </div>
                    <h1 className="text-2xl font-bold text-toss-grey-900 dark:text-white leading-tight">
                        {user.full_name}님의<br />
                        {isFatLoss ? "감량 대시보드" : "신체 자산 가치"}
                    </h1>
                </div>
                <div className="w-10 h-10 rounded-full bg-toss-grey-100 dark:bg-gray-800 flex items-center justify-center">
                    <span className="text-xl">{isFatLoss ? "🔥" : "🏃‍♂️"}</span>
                </div>
            </motion.div>

            {isProfileEmpty ? (
                <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={openProfileEditor}
                    className="w-full rounded-2xl border border-toss-grey-100 bg-white p-4 text-left shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800"
                >
                    <div className="text-xs font-bold text-toss-grey-500">시작하기</div>
                    <div className="mt-1 text-sm font-semibold text-toss-grey-900 dark:text-white">
                        {isFatLoss
                            ? "내 정보(이름/체중)를 입력하면 칼로리 추정 정확도가 올라갑니다"
                            : "내 정보(이름/체중/1RM)를 입력하면 추천 정확도가 올라갑니다"}
                    </div>
                    <div className="mt-2 inline-flex items-center text-xs font-bold text-toss-blue">
                        지금 입력하기 <ChevronRight size={14} />
                    </div>
                </motion.button>
            ) : null}

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className={cn(
                    "rounded-[2rem] p-7 relative overflow-hidden",
                    isFatLoss
                        ? "bg-gradient-to-br from-emerald-50 via-white to-cyan-50 text-slate-900 border border-emerald-100 shadow-xl"
                        : "bg-gradient-to-br from-sky-50 via-white to-indigo-50 text-slate-900 border border-sky-100 shadow-xl",
                )}
            >
                <svg className="absolute bottom-0 left-0 w-full h-32 opacity-20" preserveAspectRatio="none">
                    <path d="M0,80 Q50,60 100,80 T200,50 T300,90 T400,40 V150 H0 Z" fill="url(#grad1)" />
                    <defs>
                        <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style={{ stopColor: "#3b82f6", stopOpacity: 1 }} />
                            <stop offset="100%" style={{ stopColor: "#3b82f6", stopOpacity: 0 }} />
                        </linearGradient>
                    </defs>
                </svg>

                {isFatLoss ? (
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-slate-500 font-medium text-sm">주간 유산소 목표 진행률</span>
                            <div className="text-sm font-bold text-emerald-700">{week.minutes}/{week.targetMinutes}분</div>
                        </div>
                        <div className="text-5xl font-bold tracking-tight">{week.progress}%</div>
                        <div className="mt-4 h-2.5 rounded-full bg-emerald-100 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${week.progress}%` }} />
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <div className="bg-white/85 rounded-2xl p-3 border border-emerald-100">
                                <div className="text-slate-500 text-xs mb-1">주간 추정 소모</div>
                                <div className="text-lg font-bold">{Math.round(week.calories).toLocaleString()} kcal</div>
                            </div>
                            <div className="bg-white/85 rounded-2xl p-3 border border-emerald-100">
                                <div className="text-slate-500 text-xs mb-1">오늘 추천</div>
                                <div className="text-sm font-bold line-clamp-2">{todayMission || "빠르게 걷기 20분"}</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-slate-500 font-medium text-sm">3대 운동 합계 (Total 1RM)</span>
                            <div className="flex items-center space-x-1 text-sky-700 text-sm font-bold bg-sky-100 px-2 py-0.5 rounded-full">
                                <TrendingUp size={14} />
                                <span>Lv.{user.level}</span>
                            </div>
                        </div>
                        <div className="text-5xl font-bold mb-4 tracking-tight">
                            {totalAssetValue.toLocaleString()} <span className="text-2xl text-slate-500">kg</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <div className="bg-white/85 rounded-2xl p-3 border border-sky-100">
                                <div className="text-slate-500 text-xs mb-1">상체 지수</div>
                                <div className="text-lg font-bold">
                                    {user.estimated_1rm_bench > 0 ? "Tracking" : "No Data"}
                                </div>
                            </div>
                            <div className="bg-white/85 rounded-2xl p-3 border border-sky-100">
                                <div className="text-slate-500 text-xs mb-1">하체 지수</div>
                                <div className="text-lg font-bold">
                                    {user.estimated_1rm_squat > 0 ? "Tracking" : "No Data"}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <div className="text-xs text-toss-grey-500 font-bold px-1 mb-2">오늘 추천</div>
                {primaryAdvice ? (
                    <AdviceCard advice={primaryAdvice} onClick={openLogger} isFatLoss={isFatLoss} />
                ) : (
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl text-center text-gray-500 text-sm">
                        현재 추천이 없습니다. 오늘 기록부터 시작하세요.
                    </div>
                )}
            </motion.div>

            {lastWorkoutCalories ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-900/10 rounded-2xl border border-orange-100 dark:border-orange-800/30"
                >
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-800 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-200">
                            <Activity size={20} />
                        </div>
                        <div>
                            <div className="text-xs text-orange-600 dark:text-orange-300 font-bold">최근 소모 추정</div>
                            <div className="text-sm font-medium text-orange-900 dark:text-orange-100">-{lastWorkoutCalories} kcal</div>
                        </div>
                    </div>
                    <span className="text-2xl">🔥</span>
                </motion.div>
            ) : null}

            {isFatLoss ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="grid grid-cols-3 gap-3"
                >
                    <MetricCard icon={<Flame size={16} />} label="주간 kcal" value={Math.round(week.calories).toLocaleString()} unit="kcal" />
                    <MetricCard icon={<Timer size={16} />} label="주간 시간" value={String(week.minutes)} unit="분" />
                    <MetricCard icon={<Activity size={16} />} label="기록 횟수" value={String(week.rows.length)} unit="회" />
                </motion.div>
            ) : (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="space-y-3 pt-2"
                >
                    <h3 className="text-lg font-bold text-toss-grey-800 dark:text-gray-200 px-1">
                        구성 종목 (3대 운동)
                    </h3>

                    <div className="space-y-3">
                        <AssetItem
                            icon="🦵"
                            name="Squat (하체)"
                            value={user.estimated_1rm_squat}
                            change="Hold"
                            onClick={openProfileEditor}
                        />
                        <AssetItem
                            icon="💪"
                            name="Bench (상체)"
                            value={user.estimated_1rm_bench}
                            change="Buy"
                            onClick={openProfileEditor}
                        />
                        <AssetItem
                            icon="🏋️‍♂️"
                            name="Deadlift (전신)"
                            value={user.estimated_1rm_dead}
                            change="Hold"
                            onClick={openProfileEditor}
                        />
                    </div>
                </motion.div>
            )}
        </div>
    );
}

function AdviceCard({ advice, onClick, isFatLoss }: { advice: AssetAdvice, onClick: () => void, isFatLoss: boolean }) {
    const isBuy = advice.type === 'Buy';

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left p-0.5 rounded-[1.2rem] bg-gradient-to-br shadow-sm active:scale-[0.98] transition-all",
                isBuy ? "from-toss-blue to-cyan-500" : "from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600"
            )}
        >
            <div className="bg-white dark:bg-gray-900 rounded-[1rem] p-4 h-full">
                <div className="flex justify-between items-start mb-2">
                    <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-full border",
                        isBuy ? "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800"
                            : "bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                    )}>
                        {isFatLoss ? "감량 액션" : `${advice.type.toUpperCase()} 의견`}
                    </span>
                    {advice.priority >= 4 && <AlertCircle size={16} className="text-red-500" />}
                </div>
                <div className="font-bold text-gray-900 dark:text-gray-100 mb-1 leading-snug">
                    {advice.message}
                </div>
                {advice.recommendedWorkout && (
                    <div className="text-sm text-toss-blue font-medium mt-2 flex items-center">
                        추천: {advice.recommendedWorkout} <ChevronRight size={14} />
                    </div>
                )}
            </div>
        </button>
    );
}

function MetricCard({ icon, label, value, unit }: { icon: ReactNode; label: string; value: string; unit: string }) {
    return (
        <div className="rounded-2xl border border-toss-grey-100 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-toss-grey-500 text-xs flex items-center gap-1">{icon}{label}</div>
            <div className="mt-1 text-lg font-bold text-toss-grey-900 dark:text-white">{value}<span className="text-xs ml-1 text-toss-grey-500">{unit}</span></div>
        </div>
    );
}

function AssetItem({ icon, name, value, change, onClick }: { icon: string, name: string, value: number, change: 'Buy' | 'Hold', onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
        >
            <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center text-xl">
                    {icon}
                </div>
                <div className="text-left">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{name}</div>
                    <div className="text-xs text-gray-500">{value}kg (1RM 추정)</div>
                </div>
            </div>
            <div className="flex flex-col items-end">
                <div className="font-bold text-gray-900 dark:text-white">{value} kg</div>
                {change === 'Buy' && (
                    <div className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                        저평가
                    </div>
                )}
            </div>
        </button>
    );
}
