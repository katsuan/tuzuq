// つづく：記録の読みこみ（端末に残した中身・控えのファイル）のテスト（画面に触らない部分）
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const { load, importJson, exportJson, linkedDays, MAX_HABITS, MAX_DAYS_PER_HABIT, MAX_IMPORT_BYTES } = await import("../js/store.js");

const XSS = '" onclick=alert(1) x="';
const ID = /^[a-z0-9]{4,24}$/;
const blank = () => ({ v: 1, habits: [], done: {} });

test("ボタンに入る id は英数字だけ（控えの id に記号が入っていても作りなおす）", () => {
  const s = blank();
  importJson(s, JSON.stringify({ habits: [{ id: XSS, name: "水", emoji: "💧" }], done: { [XSS]: ["2026-10-01"] } }));
  assert.equal(s.habits.length, 1);
  assert.match(s.habits[0].id, ID);
  assert.equal(s.habits[0].name, "水");
});

test("同じ id が重なっても、1つずつ別の習慣になる", () => {
  const s = blank();
  importJson(s, JSON.stringify({ habits: [{ id: "abcd1234", name: "a" }, { id: "abcd1234", name: "b" }], done: {} }));
  assert.equal(new Set(s.habits.map((h) => h.id)).size, 2);
});

test("壊れた中身・形のちがう日付は捨てる。長い名前は切る", () => {
  mem.set("tuzuq:v1", JSON.stringify({ habits: [null, 3, { name: "" }, { id: "good1234", name: "あ".repeat(100), emoji: "🔥".repeat(20), link: "evil" }], done: { good1234: ["2026-10-01", "x", 5, "2026-10-01", "<b>"] } }));
  const s = load();
  assert.equal(s.habits.length, 1);
  assert.equal(s.habits[0].name.length, 24);
  assert.equal(s.habits[0].link, null);
  assert.deepEqual(s.done.good1234, ["2026-10-01"]);
  mem.set("tuzuq:v1", "{壊れた");
  assert.deepEqual(load(), blank());
});

test("習慣の数・○の日の数・控えの大きさに上限", () => {
  const s = blank();
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `h${1000 + i}`, name: `x${i}` }));
  const days = Array.from({ length: 5000 }, (_, i) => new Date(Date.UTC(2010, 0, 1 + i)).toISOString().slice(0, 10));
  importJson(s, JSON.stringify({ habits: many, done: { h1000: days } }));
  assert.equal(s.habits.length, MAX_HABITS);
  assert.equal(s.done.h1000.length, MAX_DAYS_PER_HABIT);
  assert.throws(() => importJson(blank(), " ".repeat(MAX_IMPORT_BYTES + 1)));
});

test("書き出した控えを読みこむと、同じ習慣と○に戻る", () => {
  const s = blank();
  importJson(s, JSON.stringify({ habits: [{ id: "keep1234", name: "読書", emoji: "📖" }], done: { keep1234: ["2026-10-20", "2026-10-21"] } }));
  const back = blank();
  importJson(back, exportJson(s));
  assert.deepEqual(back.habits, s.habits);
  assert.deepEqual(back.done, s.done);
});

test("しょくじの記録から読む日付も、形を確かめる", () => {
  mem.set("shoquji:v1", JSON.stringify({ logs: [{ date: "2026-10-22" }, { date: "<img>" }, null, { date: 3 }] }));
  assert.deepEqual([...linkedDays("shoquji")], ["2026-10-22"]);
  mem.set("shoquji:v1", JSON.stringify({ logs: "x" }));
  assert.equal(linkedDays("shoquji").size, 0);
});
