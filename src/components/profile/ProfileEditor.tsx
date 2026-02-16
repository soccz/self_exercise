"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/data/context";
import { useUI } from "@/lib/ui/context";
import type { GoalMode } from "@/lib/data/types";

interface ProfileEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Accept common human inputs like "75", "75.5", "75kg", "1,234", "75,5".
  // If both "," and "." exist, treat "," as thousands separator; otherwise treat "," as decimal separator.
  let normalized = trimmed.replace(/\s+/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/,/g, "");
  } else if (normalized.includes(",") && !normalized.includes(".")) {
    normalized = normalized.replace(/,/g, ".");
  }

  const match = normalized.match(/[-+]?\d*\.?\d+/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : undefined;
}

export function ProfileEditor({ isOpen, onClose }: ProfileEditorProps) {
  const { user, saveUser, isLoading, error } = useData();
  const { pushToast, openUnlock } = useUI();

  const [form, setForm] = useState({
    fullName: "",
    goalMode: "fat_loss" as GoalMode,
    weight: "",
    muscleMass: "",
    fatPercentage: "",
    squat: "",
    bench: "",
    dead: "",
  });

  useEffect(() => {
    if (!isOpen || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      fullName: user.full_name ?? "",
      goalMode: user.goal_mode ?? "fat_loss",
      weight: String(user.weight ?? ""),
      muscleMass: String(user.muscle_mass ?? ""),
      fatPercentage: String(user.fat_percentage ?? ""),
      squat: String(user.estimated_1rm_squat ?? ""),
      bench: String(user.estimated_1rm_bench ?? ""),
      dead: String(user.estimated_1rm_dead ?? ""),
    });
  }, [isOpen, user]);

  const total1rm = useMemo(() => {
    const s = toNumberOrUndefined(form.squat) ?? 0;
    const b = toNumberOrUndefined(form.bench) ?? 0;
    const d = toNumberOrUndefined(form.dead) ?? 0;
    return s + b + d;
  }, [form.squat, form.bench, form.dead]);

  const canSubmit = Boolean(form.fullName.trim());

  const handleSave = async () => {
    if (!canSubmit) return;

    const invalid: string[] = [];
    const parseField = (label: string, raw: string): number | undefined => {
      const t = raw.trim();
      if (!t) return undefined;
      const n = toNumberOrUndefined(t);
      if (n === undefined) invalid.push(label);
      return n;
    };

    const weight = parseField("체중", form.weight);
    const muscle_mass = parseField("골격근량", form.muscleMass);
    const fat_percentage = parseField("체지방률", form.fatPercentage);
    const estimated_1rm_squat = parseField("스쿼트 1RM", form.squat);
    const estimated_1rm_bench = parseField("벤치 1RM", form.bench);
    const estimated_1rm_dead = parseField("데드 1RM", form.dead);

    if (invalid.length > 0) {
      pushToast("error", `숫자 형식이 올바르지 않습니다: ${invalid.join(", ")}`);
      return;
    }

    const res = await saveUser({
      full_name: form.fullName.trim(),
      goal_mode: form.goalMode,
      weight,
      muscle_mass,
      fat_percentage,
      estimated_1rm_squat,
      estimated_1rm_bench,
      estimated_1rm_dead,
    });

    if (res.ok) {
      pushToast("success", "내 정보 저장 완료");
      onClose();
    } else {
      if (res.error === "App locked") {
        pushToast("error", "잠금 해제가 필요합니다");
        openUnlock();
        return;
      }
      pushToast("error", res.error || "저장 실패");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-40"
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 rounded-t-3xl max-w-md mx-auto shadow-2xl flex flex-col max-h-[90dvh]"
            style={{ height: 'auto' }}
          >
            {/* Header (Fixed) */}
            <div className="p-6 pb-2 shrink-0">
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6" />
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold dark:text-white">내 정보 수정</h2>
                <button
                  onClick={onClose}
                  className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full"
                >
                  <X size={20} className="dark:text-white" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto p-6 pt-2 flex-1 space-y-4 pb-32">
              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
                  저장/로드 중 오류: {error}
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  이름
                </label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  className="w-full text-lg font-bold border-b-2 border-gray-200 focus:border-toss-blue outline-none py-2 bg-transparent dark:text-white dark:border-gray-700"
                />
              </div>

              <div className="rounded-2xl border border-toss-grey-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/30">
                <div className="text-sm font-bold text-toss-grey-700 dark:text-gray-200">목표 모드</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, goalMode: "fat_loss" }))}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${form.goalMode === "fat_loss"
                      ? "border-toss-blue bg-toss-blue/10 text-toss-blue"
                      : "border-gray-200 bg-white text-toss-grey-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      }`}
                  >
                    <div className="font-bold">감량</div>
                    <div className="text-[11px] opacity-80">유산소/칼로리 중심</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, goalMode: "muscle_gain" }))}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${form.goalMode === "muscle_gain"
                      ? "border-toss-blue bg-toss-blue/10 text-toss-blue"
                      : "border-gray-200 bg-white text-toss-grey-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      }`}
                  >
                    <div className="font-bold">근육</div>
                    <div className="text-[11px] opacity-80">중량/1RM 중심</div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    체중 (kg)
                  </label>
                  <input
                    inputMode="decimal"
                    value={form.weight}
                    onChange={(e) => setForm((prev) => ({ ...prev, weight: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-transparent dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    골격근량 (kg)
                  </label>
                  <input
                    inputMode="decimal"
                    value={form.muscleMass}
                    onChange={(e) => setForm((prev) => ({ ...prev, muscleMass: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-transparent dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  체지방률 (%)
                </label>
                <input
                  inputMode="decimal"
                  value={form.fatPercentage}
                  onChange={(e) => setForm((prev) => ({ ...prev, fatPercentage: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-transparent dark:text-white"
                />
              </div>

              <div className="rounded-2xl border border-toss-grey-100 bg-toss-grey-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                <div className="text-sm font-bold text-toss-grey-700 dark:text-gray-200">
                  1RM (추정)
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">스쿼트</label>
                    <input
                      inputMode="decimal"
                      value={form.squat}
                      onChange={(e) => setForm((prev) => ({ ...prev, squat: e.target.value }))}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 bg-transparent dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">벤치</label>
                    <input
                      inputMode="decimal"
                      value={form.bench}
                      onChange={(e) => setForm((prev) => ({ ...prev, bench: e.target.value }))}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 bg-transparent dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">데드</label>
                    <input
                      inputMode="decimal"
                      value={form.dead}
                      onChange={(e) => setForm((prev) => ({ ...prev, dead: e.target.value }))}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 bg-transparent dark:text-white"
                    />
                  </div>
                </div>
                <div className="mt-3 text-sm text-toss-grey-700 dark:text-gray-200">
                  Total: <span className="font-bold text-toss-blue">{total1rm}kg</span>
                </div>
              </div>
            </div>

            {/* Sticky Action Button */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={handleSave}
                disabled={isLoading || !canSubmit}
                className="w-full bg-toss-blue text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
              >
                <Save size={20} />
                <span>저장하기</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
