"use client";

import { User as UserIcon, Settings, Trophy, Activity, Lock, RefreshCcw } from "lucide-react";
import { useData } from "@/lib/data/context";
import { useUI } from "@/lib/ui/context";
import { goalModeLabel } from "@/lib/goal_mode";

export function ProfileView() {
    const { user, isLoading, error, offlineQueueSize, syncState, syncMessage, retrySync, resolveConflict } = useData();
    const { openProfileEditor, openUnlock } = useUI();

    if (isLoading || !user) {
        return (
            <div className="p-5 flex items-center justify-center min-h-[50vh]">
                <div className="animate-pulse w-full space-y-4">
                    <div className="h-20 bg-gray-200 rounded-full w-20 mx-auto"></div>
                    <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto"></div>
                </div>
            </div>
        );
    }

    const total1rm =
        (user.estimated_1rm_squat || 0) +
        (user.estimated_1rm_bench || 0) +
        (user.estimated_1rm_dead || 0);

    return (
        <div className="p-5 space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-toss-grey-900 dark:text-white">내 정보</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={openUnlock}
                        className="p-2 text-toss-grey-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                        aria-label="잠금 해제"
                    >
                        <Lock size={22} />
                    </button>
                    <button
                        onClick={openProfileEditor}
                        className="p-2 text-toss-grey-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                        aria-label="내 정보 수정"
                    >
                        <Settings size={24} />
                    </button>
                </div>
            </div>

            {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
                    데이터 오류: {error}
                </div>
            ) : null}

            {offlineQueueSize > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100">
                    오프라인 임시 저장 {offlineQueueSize}건이 대기 중입니다.
                </div>
            ) : null}

            <div className="rounded-2xl border border-toss-grey-100 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                    <span className="font-bold text-toss-grey-700 dark:text-gray-200">동기화 상태</span>
                    <span className="rounded-full bg-toss-grey-100 px-2 py-0.5 text-xs font-bold text-toss-grey-700 dark:bg-gray-700 dark:text-gray-200">
                        {syncState === "saved" ? "저장됨" : syncState === "syncing" ? "동기화중" : syncState === "done" ? "완료" : syncState === "conflict" ? "충돌" : syncState === "error" ? "실패" : "대기"}
                    </span>
                </div>
                <div className="mt-1 text-xs text-toss-grey-500 dark:text-gray-400">{syncMessage}</div>
                {(syncState === "error" || syncState === "saved") ? (
                    <button
                        onClick={() => { void retrySync(); }}
                        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-toss-grey-200 px-2 py-1 text-xs font-bold text-toss-grey-700 dark:border-gray-600 dark:text-gray-200"
                    >
                        <RefreshCcw size={12} />
                        다시 동기화
                    </button>
                ) : null}
                {syncState === "conflict" ? (
                    <div className="mt-2 flex gap-2">
                        <button
                            onClick={() => { void resolveConflict("keep_local"); }}
                            className="rounded-lg border border-toss-grey-200 px-2 py-1 text-xs font-bold text-toss-grey-700 dark:border-gray-600 dark:text-gray-200"
                        >
                            내 기록 유지
                        </button>
                        <button
                            onClick={() => { void resolveConflict("use_server"); }}
                            className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-700 dark:border-red-800 dark:text-red-300"
                        >
                            서버 기록 사용
                        </button>
                    </div>
                ) : null}
            </div>

            {/* Profile Header */}
            <div className="flex flex-col items-center space-y-4">
                <div className="w-24 h-24 bg-toss-grey-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-toss-grey-400">
                    <UserIcon size={40} />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-bold text-toss-grey-900 dark:text-white">{user.full_name}</h2>
                    <div className="text-toss-blue font-medium">Level {user.level} · {goalModeLabel(user.goal_mode)}</div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-toss-grey-100 dark:border-gray-700 space-y-2">
                    <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center text-yellow-600 mb-2">
                        <Trophy size={20} />
                    </div>
                    <div className="text-toss-grey-500 text-sm">누적 경험치</div>
                    <div className="text-xl font-bold text-toss-grey-900 dark:text-white">{user.xp.toLocaleString()} XP</div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-toss-grey-100 dark:border-gray-700 space-y-2">
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 mb-2">
                        <Activity size={20} />
                    </div>
                    <div className="text-toss-grey-500 text-sm">운동 연속일</div>
                    <div className="text-xl font-bold text-toss-grey-900 dark:text-white">{user.current_streak}일</div>
                </div>
            </div>

            {/* Body Stats */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-toss-grey-100 dark:border-gray-700 space-y-4">
                <h3 className="font-bold text-toss-grey-700 dark:text-gray-300">신체 지표</h3>
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-toss-grey-50 dark:bg-gray-900/30 p-4">
                        <div className="text-xs text-toss-grey-500">체중</div>
                        <div className="mt-1 text-lg font-bold text-toss-grey-900 dark:text-white">{user.weight ?? 0}kg</div>
                    </div>
                    <div className="rounded-2xl bg-toss-grey-50 dark:bg-gray-900/30 p-4">
                        <div className="text-xs text-toss-grey-500">골격근량</div>
                        <div className="mt-1 text-lg font-bold text-toss-grey-900 dark:text-white">{user.muscle_mass ?? 0}kg</div>
                    </div>
                    <div className="rounded-2xl bg-toss-grey-50 dark:bg-gray-900/30 p-4">
                        <div className="text-xs text-toss-grey-500">체지방률</div>
                        <div className="mt-1 text-lg font-bold text-toss-grey-900 dark:text-white">{user.fat_percentage ?? 0}%</div>
                    </div>
                </div>
            </div>

            {/* 1RM Box */}
            <div className="bg-toss-grey-50 dark:bg-gray-800/50 p-6 rounded-3xl space-y-4">
                <h3 className="font-bold text-toss-grey-700 dark:text-gray-300">
                    {user.goal_mode === "fat_loss" ? "근력 지표 (선택)" : "나의 1RM 추정치"}
                </h3>
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-toss-grey-500">스쿼트</span>
                        <span className="font-bold text-toss-grey-900 dark:text-white">{user.estimated_1rm_squat}kg</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-toss-grey-500">벤치프레스</span>
                        <span className="font-bold text-toss-grey-900 dark:text-white">{user.estimated_1rm_bench}kg</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-toss-grey-500">데드리프트</span>
                        <span className="font-bold text-toss-grey-900 dark:text-white">{user.estimated_1rm_dead}kg</span>
                    </div>
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                        <span className="text-toss-grey-900 dark:text-white font-bold">Total</span>
                        <span className="font-bold text-toss-blue text-lg">
                            {total1rm}kg
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
