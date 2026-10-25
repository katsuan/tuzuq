// つづく：おくるんのお知らせカード（OQRN.cardUrl）に渡す中身。画面には触らない（テストで呼ぶ）
// 読まれるところ：app.js（テストは test/card.test.mjs）
import { cut } from "./store.js?v=202610260600";
import { label } from "./stats.js?v=202610260600";
import { OPEN_URL } from "./line-config.js?v=202610260600";

export const CARD_COLOR = "#2F80D8"; // ロゴの青

/**
 * きょうの○の一覧と、続いた日数のカード
 * @param habits 習慣の並び
 * @param dayOf (h) => { done: きょうできたか, streak: 続いた日数 }
 */
export function cardParams(habits, dayOf, today) {
  let done = 0;
  const lines = habits.map((h) => {
    const d = dayOf(h);
    if (d.done) done++;
    return `${d.done ? "○" : "・"} ${h.emoji} ${h.name}${d.streak ? `（🔥${d.streak}日）` : ""}`;
  });
  return new URLSearchParams({
    headerTitle: "✅ きょうの○",
    date: label(today),
    showDate: "true",
    title: done === habits.length ? `ぜんぶできた！ ${done} / ${done}` : `${done} / ${habits.length} できた`,
    detail: cut(lines.join("\n"), 300),
    theme: "custom",
    customColor: CARD_COLOR,
    showAction: "true",
    actionLabel: "✅ つづくでチェックする",
    actionUrl: OPEN_URL, // LINE 版のつづく（おくるんの config.js の trustedLiffIds に登録ずみ）
    from: "tuzuq"
  });
}
