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
const { monthGrid, weekHeader } = await import("../js/stats.js");
const { load, importJson, exportJson, linkedDays, MAX_HABITS, MAX_DAYS_PER_HABIT, MAX_IMPORT_BYTES } = await import("../js/store.js");

const XSS = '" onclick=alert(1) x="'; // qcheck-ok: W8 テストの見本の文字
const ID = /^[a-z0-9]{4,24}$/;
const blank = () => ({ v: 1, habits: [], done: {}, weekStart: 1, auto: {}, remindAt: "21:00", lineBot: "", gasUrl: "", bot: {} });

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

test("カレンダーは月曜はじまりが既定。日曜はじまりにも切りかえられる", () => {
  // 2026年10月1日は木曜
  const mon = monthGrid(2026, 10);
  assert.equal(mon.indexOf("2026-10-01"), 3); // 月 火 水 [木]
  assert.equal(mon.indexOf("2026-10-05"), 7); // 次の行の頭が月曜
  const sun = monthGrid(2026, 10, 0);
  assert.equal(sun.indexOf("2026-10-01"), 4); // 日 月 火 水 [木]
  assert.equal(mon.length % 7, 0);
  assert.deepEqual(weekHeader(1).map((w) => w.label).join(""), "月火水木金土日");
  assert.deepEqual(weekHeader(0).map((w) => w.label).join(""), "日月火水木金土");
  // 月曜はじまりの月でも、1日が月曜なら空きなし（2026年6月1日は月曜）
  assert.equal(monthGrid(2026, 6)[0], "2026-06-01");
});

test("週のはじまりの設定は残り、変な値は月曜に", () => {
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], done: {}, weekStart: 0 }));
  assert.equal(load().weekStart, 0);
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], done: {}, weekStart: "x" }));
  assert.equal(load().weekStart, 1);
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], done: {} }));
  assert.equal(load().weekStart, 1);
});

test("キロっくの記録した日も○になり、キロっくが古い記録を消しても覚えておく", async () => {
  const { rememberLinked } = await import("../js/store.js");
  mem.set("tuzuq:v1", JSON.stringify({ habits: [{ id: "lift0001", name: "筋トレ", link: "kiloq" }], done: {} }));
  const s = load();
  assert.equal(s.habits[0].link, "kiloq");
  mem.set("liff-workout-history", JSON.stringify([{ date: "2026-10-20" }, { date: "2026-10-22" }, { date: "<img>" }, null]));
  assert.equal(rememberLinked(s), true);
  assert.deepEqual([...linkedDays("kiloq", s)].sort(), ["2026-10-20", "2026-10-22"]);
  // キロっく側で古いものが消えても、つづくには残る
  mem.set("liff-workout-history", JSON.stringify([{ date: "2026-10-23" }]));
  assert.equal(rememberLinked(s), true);
  assert.deepEqual([...linkedDays("kiloq", s)].sort(), ["2026-10-20", "2026-10-22", "2026-10-23"]);
  assert.equal(rememberLinked(s), false); // ふえなければ保存しない
  // 覚えた日は控えにも入る
  const back = { v: 1, habits: [], done: {}, weekStart: 1, auto: {} };
  importJson(back, exportJson(s));
  assert.deepEqual(back.auto.kiloq, ["2026-10-20", "2026-10-22", "2026-10-23"]);
});

test("つないでいない習慣のツールは覚えない・壊れた覚え書きは捨てる", async () => {
  const { rememberLinked } = await import("../js/store.js");
  mem.set("tuzuq:v1", JSON.stringify({ habits: [{ id: "read0001", name: "読書" }], done: {}, auto: { kiloq: ["2026-10-01", "x"], evil: ["2026-10-01"] } }));
  const s = load();
  assert.deepEqual(s.auto, { kiloq: ["2026-10-01"] });
  mem.set("liff-workout-history", JSON.stringify([{ date: "2026-10-23" }]));
  assert.equal(rememberLinked(s), false);
});

test("ない日付（2月30日・13月など）は捨てる。うるう日は残す", async () => {
  const { isDate } = await import("../js/stats.js");
  assert.equal(isDate("2028-02-29"), true);
  assert.equal(isDate("2027-02-29"), false);
  assert.equal(isDate("2026-02-30"), false);
  assert.equal(isDate("2026-13-01"), false);
  assert.equal(isDate("2026-00-10"), false);
  mem.set("tuzuq:v1", JSON.stringify({ habits: [{ id: "date0001", name: "a" }], done: { date0001: ["2026-02-30", "2028-02-29", "2026-10-32"] } }));
  assert.deepEqual(load().done.date0001, ["2028-02-29"]);
  mem.set("shoquji:v1", JSON.stringify({ logs: [{ date: "2026-02-30" }, { date: "2026-03-01" }] }));
  assert.deepEqual([...linkedDays("shoquji")], ["2026-03-01"]);
});

test("続いた日数は、月・年・うるう日をまたいでも数える（今日まだなら昨日まで）", async () => {
  const { streak, best } = await import("../js/stats.js");
  assert.equal(streak(new Set(["2027-12-30", "2027-12-31", "2028-01-01"]), "2028-01-02"), 3);
  assert.equal(streak(new Set(["2027-12-30", "2027-12-31", "2028-01-01"]), "2028-01-03"), 0);
  const leap = new Set(["2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.equal(streak(leap, "2028-03-01"), 3);
  assert.equal(best(leap), 3);
  assert.equal(best(new Set(["2027-02-28", "2027-03-01", "2027-03-03"])), 2);
  assert.equal(best(new Set()), 0);
});

test("うるう年の2月のカレンダー", () => {
  const feb28 = monthGrid(2028, 2); // 2028年2月1日は火曜
  assert.equal(feb28.indexOf("2028-02-01"), 1);
  assert.ok(feb28.includes("2028-02-29"));
  assert.equal(feb28.filter(Boolean).length, 29);
  const feb27 = monthGrid(2027, 2); // 2027年2月1日は月曜・28日で4行ちょうど
  assert.equal(feb27.length, 28);
  assert.equal(monthGrid(2027, 2, 0).length, 35);
});

test("この月の割合は、習慣をはじめた日から数える", async () => {
  const { monthStats } = await import("../js/stats.js");
  const cells = monthGrid(2026, 10);
  const days = new Set(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  // 10/20 にはじめて、毎日できた → 100%
  assert.deepEqual(monthStats(cells, days, "2026-10-23", "2026-10-20"), { count: 4, rate: 100 });
  // 前の月からの習慣なら、1日から
  assert.deepEqual(monthStats(cells, days, "2026-10-23", "2026-09-01"), { count: 4, rate: 17 });
  // 先の月・はじめる前の月は 0%
  assert.deepEqual(monthStats(monthGrid(2026, 9), new Set(), "2026-10-23", "2026-10-20"), { count: 0, rate: 0 });
});

test("前の名前（tsuduq:v1）の記録は、新しい名前で保存したら消える", async () => {
  const { save } = await import("../js/store.js");
  mem.delete("tuzuq:v1");
  mem.set("tsuduq:v1", JSON.stringify({ habits: [{ id: "old00001", name: "前の" }], done: {} }));
  const s = load();
  assert.equal(s.habits[0].name, "前の");
  save(s);
  assert.equal(mem.has("tsuduq:v1"), false);
  assert.equal(load().habits[0].name, "前の");
});

test("長い名前を切っても、絵文字が半分にならない", () => {
  mem.set("tuzuq:v1", JSON.stringify({ habits: [{ id: "emoj0001", name: "あ".repeat(23) + "💧💧", emoji: "💧💧💧💧💧" }], done: {} }));
  const h = load().habits[0];
  assert.equal(h.name, "あ".repeat(23));
  assert.equal(h.emoji, "💧💧💧💧");
  mem.set("tuzuq:v1", JSON.stringify({ habits: [{ id: "emoj0002", name: "a", emoji: "abcdefg💧" }], done: {} }));
  assert.equal(load().habits[0].emoji, "abcdefg");
});

test("お知らせの時刻は 21:00 が既定。形のちがう値は 21:00 に", () => {
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], done: {}, remindAt: "07:30" }));
  assert.equal(load().remindAt, "07:30");
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], done: {}, remindAt: "25:99" }));
  assert.equal(load().remindAt, "21:00");
  mem.delete("tuzuq:v1");
  assert.equal(load().remindAt, "21:00");
});

test("LINE でも記録（自分用）：ボットの ID は @ から。送る文入りでボットのトークを開くリンクを作る", async () => {
  const { lineRecordUrl, cleanBotId } = await import("../js/store.js");
  assert.equal(cleanBotId("@123abcde"), "@123abcde");
  assert.equal(cleanBotId("123abcde"), "");
  assert.equal(cleanBotId('@x" onclick=1'), "");
  assert.equal(lineRecordUrl("@123abcde", "# workout"), "https://line.me/R/oaMessage/%40123abcde/?%23%20workout");
  assert.equal(lineRecordUrl("", "# workout"), "");
  assert.equal(lineRecordUrl("@123abcde", ""), "");
  mem.set("tuzuq:v1", JSON.stringify({ habits: [{ id: "lift0001", name: "筋トレ", lineText: "# workout" + "x".repeat(100) }], done: {}, lineBot: "@123abcde" }));
  const s = load();
  assert.equal(s.lineBot, "@123abcde");
  assert.equal(s.habits[0].lineText.length, 60);
});
