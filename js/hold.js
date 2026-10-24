// つづく：前の日のつけ外しは長押し（誤って押さないように）。前の日ほど長く
//   きょう 0（ふつうに押す）・きのう 0.5秒・2〜3日前 0.8秒・4〜7日前 1.2秒・それより前 1.5秒
import { addDays } from "./stats.js?v=202610242000";

export function holdMs(date, today) {
  if (!date || date >= today) return 0;
  let back = 0;
  for (let d = date; d < today && back < 9; d = addDays(d, 1)) back++;
  if (back <= 1) return 500;
  if (back <= 3) return 800;
  if (back <= 7) return 1200;
  return 1500;
}

// 記録ボットに入れられるのは、7日前まで（GAS の TUZUQ_BACK_DAYS_ と同じ）
export const BOT_BACK_DAYS = 7;
export function withinBotDays(date, today) {
  if (!date || date > today) return false;
  return addDays(today, -BOT_BACK_DAYS) <= date;
}
