"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Lock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useData } from "@/lib/data/context";
import { useUI } from "@/lib/ui/context";

interface AppUnlockProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppUnlock({ isOpen, onClose }: AppUnlockProps) {
  const { error, refreshData } = useData();
  const { openUnlock, pushToast } = useUI();
  const [secret, setSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (error === "App locked" && !isOpen) {
      openUnlock();
    }
  }, [error, isOpen, openUnlock]);

  const handleUnlock = async () => {
    const value = secret.trim();
    if (!value) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secret: value }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: unknown; locked?: unknown };

      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : "잠금 해제 실패";
        pushToast("error", msg);
        return;
      }

      if (json?.locked === false) {
        pushToast("info", "잠금 기능이 비활성화되어 있습니다");
      } else {
        pushToast("success", "잠금 해제 완료");
      }

      // Clear "App locked" in the data layer so the modal doesn't immediately re-open.
      // Also verifies that the new session cookie is actually working.
      try {
        await refreshData();
      } catch {
        // ignore
      }

      setSecret("");
      onClose();
    } catch (e) {
      console.error(e);
      pushToast("error", "잠금 해제 중 오류");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen ? (
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
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 rounded-t-3xl max-w-md mx-auto shadow-2xl flex flex-col"
          >
            <div className="p-6 pb-2 shrink-0">
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-2xl bg-toss-grey-100 dark:bg-gray-700 flex items-center justify-center">
                    <Lock size={18} className="text-toss-grey-700 dark:text-gray-100" />
                  </div>
                  <div className="text-lg font-bold dark:text-white">잠금 해제</div>
                </div>
                <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                  <X size={18} className="dark:text-white" />
                </button>
              </div>
              <div className="mt-2 text-sm text-toss-grey-500 dark:text-gray-300">
                공개 배포에서 임의 수정 방지를 위해 설정한 비밀키(`APP_SECRET`)를 입력합니다.
              </div>
            </div>

            <div className="p-6 pt-2 space-y-3">
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="APP_SECRET"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 bg-transparent dark:text-white"
              />
              <button
                onClick={handleUnlock}
                disabled={isSubmitting || !secret.trim()}
                className="w-full bg-toss-blue text-white py-4 rounded-2xl font-bold text-lg active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isSubmitting ? "확인 중..." : "잠금 해제"}
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
