// つづく：送るカードの中身（js/card.js）のテスト
//   node --test test/
import "./_botlink.mjs";
import test from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { cardParams, CARD_COLOR } = await import("../js/card.js");

const habits = [
  { id: "a", emoji: "💧", name: "水" },
  { id: "b", emoji: "📖", name: "読書" }
];

test("きょうの○の一覧・続いた日数・できた数をカードに入れる", () => {
  const p = cardParams(habits, (h) => (h.id === "a" ? { done: true, streak: 5 } : { done: false, streak: 0 }), "2026-10-23");
  assert.equal(p.get("title"), "1 / 2 できた");
  assert.equal(p.get("detail"), "○ 💧 水（🔥5日）\n・ 📖 読書");
  assert.equal(p.get("date"), "10/23（金）");
  assert.equal(p.get("customColor"), CARD_COLOR);
  assert.equal(p.get("from"), "tuzuq");
  assert.match(p.get("actionUrl"), /^https:\/\/liff\.line\.me\//);
});

test("ぜんぶできた日は「ぜんぶできた！」。長い一覧は300字まで（絵文字は半分にしない）", () => {
  assert.equal(cardParams(habits, () => ({ done: true, streak: 1 }), "2026-10-23").get("title"), "ぜんぶできた！ 2 / 2");
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `h${i}`, emoji: "🏃", name: "あ".repeat(23) + "💧" }));
  const detail = cardParams(many, () => ({ done: false, streak: 0 }), "2026-10-23").get("detail");
  assert.ok(detail.length <= 300);
  assert.equal(/[\uD800-\uDBFF]$/.test(detail), false);
});
