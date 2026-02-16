import type { GoalMode } from "@/lib/data/types";

type TgKeyboardButton = {
  text: string;
  web_app?: { url: string };
};

export function quickActionRows(goalMode: GoalMode, appUrl: string): TgKeyboardButton[][] {
  if (goalMode === "muscle_gain") {
    return [
      [{ text: "기록" }, { text: "오늘 추천" }],
      [{ text: "컨디션 입력" }, { text: "상태" }],
      [{ text: "마지막 수정" }, { text: "📱 앱 열기", web_app: { url: appUrl } }],
    ];
  }

  return [
    [{ text: "유산소 기록" }, { text: "오늘 추천" }],
    [{ text: "컨디션 입력" }, { text: "상태" }],
    [{ text: "마지막 수정" }, { text: "📱 앱 열기", web_app: { url: appUrl } }],
  ];
}

export function quickActionKeyboard(goalMode: GoalMode, appUrl: string): Record<string, unknown> {
  return {
    keyboard: quickActionRows(goalMode, appUrl),
    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: false,
    input_field_placeholder: goalMode === "fat_loss" ? "예: 러닝머신 30 8 1" : "예: 스쿼트 100 5 5",
  };
}
