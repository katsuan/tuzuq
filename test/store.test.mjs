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
const blank = () => ({ v: 1, habits: [], done: {}, weekStart: 1, auto: {}, remindAt: "21:00", gasUrl: "", bot: {}, view: { sort: "mine", filter: "all" } });

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

test("しょくじが書く記録がある日の一覧（shoquji:days。食事記録ボットで入れた記録の日も入る）も読む。形がちがう日は捨てる", () => {
  mem.delete("shoquji:v1");
  mem.set("shoquji:days", JSON.stringify({ v: 1, days: ["2026-10-20", "2026-10-21", "<b>", 5, "2026-02-30"] }));
  assert.deepEqual([...linkedDays("shoquji")].sort(), ["2026-10-20", "2026-10-21"]);
  mem.set("shoquji:v1", JSON.stringify({ logs: [{ date: "2026-10-22" }] }));
  assert.deepEqual([...linkedDays("shoquji")].sort(), ["2026-10-20", "2026-10-21", "2026-10-22"]);
  mem.set("shoquji:days", "こわれた");
  assert.deepEqual([...linkedDays("shoquji")], ["2026-10-22"]);
  mem.delete("shoquji:days");
  mem.delete("shoquji:v1");
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
  assert.equal(h.emoji, "💧", "しるしは見た目の1文字");
  mem.set("tuzuq:v1", JSON.stringify({ habits: [{ id: "emoj0002", name: "a", emoji: "abcdefg💧" }], done: {} }));
  assert.equal(load().habits[0].emoji, "a");
});

test("お知らせの時刻は 21:00 が既定。形のちがう値は 21:00 に", () => {
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], done: {}, remindAt: "07:30" }));
  assert.equal(load().remindAt, "07:30");
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], done: {}, remindAt: "25:99" }));
  assert.equal(load().remindAt, "21:00");
  mem.delete("tuzuq:v1");
  assert.equal(load().remindAt, "21:00");
});

test("記録ボットに送る文は60字まで。使わなくなった lineBot は読んだら捨てる。つなぎ先の URL は形を確かめる", async () => {
  const { isHabitId } = await import("../js/store.js");
  mem.set("tuzuq:v1", JSON.stringify({ habits: [{ id: "lift0001", name: "筋トレ", lineText: "# workout" + "x".repeat(100) }], done: {}, lineBot: "@123abcde", gasUrl: "https://evil.example/exec" }));
  const s = load();
  assert.equal("lineBot" in s, false);
  assert.equal(s.gasUrl, "");
  assert.equal(s.habits[0].lineText.length, 60);
  const ok = "https://script.google.com/macros/s/AKfycbx1234567890abc/exec";
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], done: {}, gasUrl: ok }));
  assert.equal(load().gasUrl, ok);
  assert.equal(isHabitId("lift0001"), true);
  assert.equal(isHabitId('x" onclick=1'), false);
  assert.equal(isHabitId(null), false);
});

test("自動の○のピルから開くのは、決まった自分のツールだけ（https・katsuan.github.io か LINE）", async () => {
  const { LINKS } = await import("../js/store.js");
  Object.values(LINKS).forEach((def) => {
    assert.match(def.url, /^https:\/\/(katsuan\.github\.io\/[a-z-]+\/|liff\.line\.me\/\d{10}-[A-Za-z0-9]+)$/);
    assert.ok(def.name);
    assert.ok(def.what, "何のツールかがわかる言葉（例：食事の記録）");
  });
});

test("しるしは、見た目の1文字だけ（つながった絵文字も1つ。空・長すぎるものは ✅）", async () => {
  const { oneMark, addHabit } = await import("../js/store.js");
  assert.equal(oneMark("🧘"), "🧘");
  assert.equal(oneMark("👨‍👩‍👧‍👦"), "👨‍👩‍👧‍👦");
  assert.equal(oneMark("🇯🇵日本"), "🇯🇵");
  assert.equal(oneMark("🏃🏽‍♀️"), "🏃🏽‍♀️");
  assert.equal(oneMark("読書"), "読");
  assert.equal(oneMark("  "), "");
  assert.equal(oneMark('<img src=x onerror=alert(1)>'), "<"); // qcheck-ok: W8 テストの見本の文字（画面では esc する）
  const s = blank();
  assert.equal(addHabit(s, { name: "a", emoji: "" }).emoji, "✅");
  assert.equal(addHabit(s, { name: "b", emoji: "🐈‍⬛ねこ" }).emoji, "🐈‍⬛");
});

test("カレンダーの「すべて」：できた数・色の濃さ・全部つづいた日数", async () => {
  const { doneCount, level, fullStreak } = await import("../js/stats.js");
  const a = new Set(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
  const b = new Set(["2026-10-22", "2026-10-23"]);
  const c = new Set(["2026-10-22", "2026-10-23", "2026-10-24"]);
  const sets = [a, b, c];
  assert.equal(doneCount(sets, "2026-10-23"), 3);
  assert.equal(doneCount(sets, "2026-10-24"), 2);
  assert.equal(level(0, 3), 0);
  assert.equal(level(1, 3), 1);
  assert.equal(level(2, 3), 2);
  assert.equal(level(3, 3), 4);
  assert.equal(level(1, 12), 1);
  assert.equal(level(11, 12), 3);
  assert.equal(fullStreak(sets, "2026-10-24"), 2, "きょうまだなら、きのうまで（22・23）");
  assert.equal(fullStreak([], "2026-10-24"), 0);
});

test("前の日ほど長押し（きょうは0）。記録ボットに入れられるのは7日前まで", async () => {
  const { daysAgo, holdMs } = await import("../js/long-press.js");
  const { withinBotDays } = await import("../js/linelog.js");
  assert.equal(daysAgo("2026-10-21", "2026-10-24"), 3);
  assert.equal(daysAgo("2026-10-24", "2026-10-24"), 0);
  assert.equal(daysAgo("2026-09-24", "2026-10-24"), 30);
  const t = "2026-10-24";
  assert.equal(holdMs(t, t), 0);
  assert.equal(holdMs("2026-10-23", t), 500);
  assert.equal(holdMs("2026-10-22", t), 800);
  assert.equal(holdMs("2026-10-21", t), 800);
  assert.equal(holdMs("2026-10-20", t), 1200);
  assert.equal(holdMs("2026-10-17", t), 1200);
  assert.equal(holdMs("2026-10-16", t), 1500);
  assert.equal(holdMs("2026-01-01", t), 1500);
  assert.equal(holdMs("2026-10-25", t), 0, "未来はそもそも押せない");
  assert.equal(withinBotDays("2026-10-17", t), true);
  assert.equal(withinBotDays("2026-10-16", t), false);
  assert.equal(withinBotDays("2026-10-25", t), false);
});

test("前のよくある習慣の名前（しょくじ・キロっく入り）は、だれでも読める名前に。自分で付けた名前は変えない", () => {
  mem.set("tuzuq:v1", JSON.stringify({ habits: [
    { id: "old11111", name: "しょくじを記録", link: "shoquji" },
    { id: "old22222", name: "筋トレ（キロっく）", link: "kiloq" },
    { id: "own33333", name: "しょくじを記録", link: null },
    { id: "own44444", name: "キロっくで筋トレ", link: "kiloq" }
  ], done: {} }));
  const names = load().habits.map((h) => h.name);
  assert.deepEqual(names, ["食事を記録", "筋トレ", "しょくじを記録", "キロっくで筋トレ"]);
});

test("moveHabitTo：引っぱった先へ並べ替える（はみ出たら端）", async () => {
  const store = await import("../js/store.js");
  const s = { habits: [{ id: "a" }, { id: "b" }, { id: "c" }], done: {} };
  store.moveHabitTo(s, "a", 2);
  assert.deepEqual(s.habits.map((h) => h.id), ["b", "c", "a"]);
  store.moveHabitTo(s, "a", 0);
  assert.deepEqual(s.habits.map((h) => h.id), ["a", "b", "c"]);
  store.moveHabitTo(s, "c", 99);
  assert.deepEqual(s.habits.map((h) => h.id), ["a", "b", "c"]);
  store.moveHabitTo(s, "zz", 0);
  assert.deepEqual(s.habits.map((h) => h.id), ["a", "b", "c"]);
});

test("orderToday：まだを先に・つづいている順・しぼりこみ（同じなら自分の順）", async () => {
  const store = await import("../js/store.js");
  const hs = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const done = { a: true, c: true };
  const n = { a: 3, b: 0, c: 9, d: 3 };
  const run = (view) => store.orderToday(hs, view, (h) => done[h.id], (h) => n[h.id]);
  assert.deepEqual(run({}), ["a", "b", "c", "d"]);
  assert.deepEqual(run({ sort: "todo" }), ["b", "d", "a", "c"]);
  assert.deepEqual(run({ sort: "streak" }), ["c", "a", "d", "b"]);
  assert.deepEqual(run({ filter: "todo" }), ["b", "d"]);
  assert.deepEqual(run({ filter: "done", sort: "streak" }), ["c", "a"]);
  assert.deepEqual(run({ sort: "<x>", filter: 1 }), ["a", "b", "c", "d"]);
  assert.deepEqual(store.cleanView(null), { sort: "mine", filter: "all" });
});

test("kiloqNote：その日のトレーニングを短い文に（同じセットはまとめる・自重は回数・総量）", async () => {
  const store = await import("../js/store.js");
  const list = [
    { date: "2026-10-24", title: "胸", exercises: [
      { name: "ベンチプレス", sets: [{ weight: 60, reps: 10 }, { weight: "60", reps: "10" }, { weight: 55, reps: 8 }, { weight: "", reps: "" }] },
      { name: "腕立て", sets: [{ weight: "", reps: 20 }] },
      { name: "", sets: [{ weight: 10, reps: 10 }] },
      null
    ] },
    { date: "2026-10-23", title: "脚", exercises: [{ name: "スクワット", sets: [{ weight: 80, reps: 5 }] }] }
  ];
  assert.equal(store.kiloqNote(list, "2026-10-24"), "メニュー：胸\nベンチプレス 60kg×10×2・55kg×8\n腕立て 20回\n総量 1,640kg");
  assert.equal(store.kiloqNote(list, "2026-10-22"), "");
  assert.equal(store.kiloqNote("x", "2026-10-24"), "");
  assert.equal(store.kiloqNote([{ date: "2026-10-24", exercises: "x" }], "2026-10-24"), "");
});

test("kiloqNote：長くなって600字で切っても、絵文字が半分にならない", async () => {
  const store = await import("../js/store.js");
  for (let pad = 0; pad < 40; pad++) {
    const exercises = Array.from({ length: 30 }, (_, i) => ({ name: "💪".repeat(11) + i, sets: [{ weight: 10, reps: 5 }] }));
    const note = store.kiloqNote([{ date: "2026-10-24", title: "あ".repeat(pad % 20) + "い".repeat(Math.floor(pad / 20)), exercises }], "2026-10-24");
    assert.ok(note.length <= 600);
    assert.equal(/[\uD800-\uDBFF]$/.test(note), false, `pad=${pad}`);
  }
});
