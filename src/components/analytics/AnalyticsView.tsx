"use client";

import { Download, Trash2 } from "lucide-react";
import { useData } from "@/lib/data/context";
import { useUI } from "@/lib/ui/context";
import { useState } from "react";
import { calculateCalories } from "@/lib/quant/engine";

export function AnalyticsView() {
  const { user, recentWorkouts, deleteWorkout, isLoading, error } = useData();
  const { pushToast, openUnlock } = useUI();
  const [now] = useState(() => Date.now());

  const downloadExport = async (format: "csv" | "json") => {
    try {
      const res = await fetch(`/api/export?format=${format}`, { credentials: "include" });
      if (res.status === 401) {
        pushToast("error", "잠금 해제가 필요합니다");
        openUnlock();
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        const msg = typeof j?.error === "string" ? j.error : "내보내기 실패";
        pushToast("error", msg);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "csv" ? "iron-quant-workouts.csv" : "iron-quant-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      pushToast("success", "내보내기 완료");
    } catch (e) {
      console.error(e);
      pushToast("error", "내보내기 중 오류");
    }
  };

  if (isLoading || !user) {
    return (
      <div className="p-5 space-y-4">
        <div className="h-24 rounded-2xl bg-gray-200 animate-pulse" />
        <div className="h-24 rounded-2xl bg-gray-200 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
          데이터 오류: {error}
        </div>
      </div>
    );
  }

  const recentCount = recentWorkouts.length;
  const isFatLoss = user.goal_mode === "fat_loss";
  const avgRpe = recentCount
    ? recentWorkouts.reduce((acc, workout) => acc + workout.average_rpe, 0) / recentCount
    : 0;
  const totalMinutes = recentWorkouts.reduce(
    (acc, workout) => acc + workout.duration_minutes,
    0,
  );

  const last7 = (() => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const workouts = recentWorkouts.filter((w) => {
      const t = Date.parse(w.workout_date);
      return Number.isFinite(t) && now - t <= sevenDays;
    });
    const volume = workouts.reduce((acc, w) => acc + (w.total_volume || 0), 0);
    const calories = workouts.reduce(
      (acc, w) => acc + calculateCalories(user.weight || 75, w.duration_minutes || 0, w.average_rpe || 6),
      0,
    );
    const minutes = workouts.reduce((acc, w) => acc + (w.duration_minutes || 0), 0);
    return { count: workouts.length, volume, calories, minutes };
  })();

  return (
    <div className="p-5 space-y-5">
      <div className="flex gap-2">
        <button
          onClick={() => downloadExport("csv")}
          className="inline-flex items-center gap-2 rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          <Download size={14} />
          CSV 내보내기
        </button>
        <button
          onClick={() => downloadExport("json")}
          className="inline-flex items-center gap-2 rounded-2xl border border-toss-grey-100 bg-white px-3 py-2 text-xs font-bold text-toss-grey-700 shadow-sm active:scale-[0.99] transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          <Download size={14} />
          JSON 내보내기
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-toss-grey-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs text-toss-grey-500">최근 기록 수</div>
          <div className="mt-1 text-2xl font-bold text-toss-grey-900 dark:text-white">
            {recentCount}
          </div>
        </div>
        <div className="rounded-2xl border border-toss-grey-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs text-toss-grey-500">{isFatLoss ? "최근 7일 칼로리" : "평균 RPE"}</div>
          <div className="mt-1 text-2xl font-bold text-toss-grey-900 dark:text-white">
            {isFatLoss ? `${Math.round(last7.calories).toLocaleString()}kcal` : avgRpe.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-toss-grey-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs text-toss-grey-500">최근 7일 운동 횟수</div>
          <div className="mt-1 text-2xl font-bold text-toss-grey-900 dark:text-white">
            {last7.count}
          </div>
        </div>
        <div className="rounded-2xl border border-toss-grey-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs text-toss-grey-500">{isFatLoss ? "최근 7일 운동 시간" : "최근 7일 총 볼륨"}</div>
          <div className="mt-1 text-2xl font-bold text-toss-grey-900 dark:text-white">
            {isFatLoss ? `${Math.round(last7.minutes)}분` : Math.round(last7.volume).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-toss-grey-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="text-xs text-toss-grey-500">누적 운동 시간</div>
        <div className="mt-1 text-2xl font-bold text-toss-grey-900 dark:text-white">
          {totalMinutes}분
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-toss-grey-700 dark:text-gray-300">최근 운동</h2>
        {recentWorkouts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-toss-grey-200 bg-white p-4 text-sm text-toss-grey-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            아직 운동 기록이 없습니다.
          </div>
        ) : (
          recentWorkouts.slice(0, 5).map((workout) => (
            <div
              key={workout.id}
              className="rounded-2xl border border-toss-grey-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 flex justify-between items-center group"
            >
              <div>
                <div className="text-sm font-semibold text-toss-grey-900 dark:text-white">
                  {workout.title || "운동"}
                </div>
                <div className="mt-1 text-xs text-toss-grey-500">
                  {workout.workout_date} · {workout.duration_minutes}분 · RPE {workout.average_rpe}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm("정말 삭제하시겠습니까?")) {
                    deleteWorkout(workout.id);
                  }
                }}
                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                aria-label="Delete workout"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
