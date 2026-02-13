"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export function Toast({ item }: { item: ToastItem }) {
  const base =
    "pointer-events-auto w-[min(92vw,360px)] rounded-2xl border px-4 py-3 shadow-xl backdrop-blur";

  const styles: Record<ToastType, string> = {
    success:
      "bg-emerald-50/90 border-emerald-200 text-emerald-950 dark:bg-emerald-900/30 dark:border-emerald-900/60 dark:text-emerald-100",
    error:
      "bg-red-50/90 border-red-200 text-red-950 dark:bg-red-900/30 dark:border-red-900/60 dark:text-red-100",
    info:
      "bg-white/90 border-gray-200 text-gray-900 dark:bg-gray-900/60 dark:border-gray-700 dark:text-gray-100",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className={cn(base, styles[item.type])}
      role="status"
      aria-live="polite"
    >
      <div className="text-sm font-semibold leading-snug">{item.message}</div>
    </motion.div>
  );
}

export function ToastStack({ items }: { items: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[999] -translate-x-1/2 space-y-2">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <Toast key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
}
