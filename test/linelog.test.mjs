// つづく：LINE の中（LIFF）で開いたときの、くらぶボットとのつなぎのテスト（画面に触らない部分）
//   node --test test/
import "./_botlink.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const { cleanGasUrl, inLineApp, makeClient, startLineLog, lineLogMessage } = await import("../js/linelog.js");
const { LINE_LOG } = await import("../js/line-config.js");
const store = await import("../js/store.js");

const GAS = "https://script.google.com/macros/s/AKfyTEST_123/exec";
const TOKEN = "head.payload.sign";
// 決まった返事を返す偽物の fetch（送った中身は seen に入れる）
const okFetch = (reply, seen) => async (url, opt) => {
  seen.push({ url, opt, body: JSON.parse(opt.body) });
  return { json: async () => reply };
};

test("ボットに送るのは ID トークンと、記録する文・日付だけ（userId は送らない）。text/plain で送る", async () => {
  const seen = [];
  const c = makeClient(GAS, () => TOKEN, okFetch({ ok: true, added: true, date: "2026-10-24" }, seen));
  const res = await c.record("# workout", "2026-10-24");
  assert.equal(res.ok, true);
  assert.equal(seen[0].url, GAS);
  assert.equal(seen[0].opt.method, "POST");
  assert.match(seen[0].opt.headers["Content-Type"], /^text\/plain/);
  assert.deepEqual(seen[0].body, { app: "tuzuq", v: 1, op: "record", tool: "tuzuq", action: "record", liffId: LINE_LOG.liffId, idToken: TOKEN, text: "# workout", date: "2026-10-24" });
  await c.days(["# workout", "# coding"]);
  assert.deepEqual(seen[1].body, { app: "tuzuq", v: 1, op: "days", tool: "tuzuq", action: "days", liffId: LINE_LOG.liffId, idToken: TOKEN, texts: ["# workout", "# coding"] });
  // つないだツールの中身（キロっく）があるときだけ note も送る
  await c.record("# workout", "2026-10-24", false, "ベンチプレス 60kg×10");
  assert.deepEqual(seen[2].body, { app: "tuzuq", v: 1, op: "record", tool: "tuzuq", action: "record", liffId: LINE_LOG.liffId, idToken: TOKEN, text: "# workout", date: "2026-10-24", note: "ベンチプレス 60kg×10" });
});

test("ID トークンがないときは送らない。通信できないときは net", async () => {
  const seen = [];
  const none = makeClient(GAS, () => "", okFetch({ ok: true }, seen));
  assert.deepEqual(await none.record("# workout", "2026-10-24"), { ok: false, error: "auth" });
  assert.equal(seen.length, 0);
  const down = makeClient(GAS, () => TOKEN, async () => { throw new Error("offline"); });
  assert.deepEqual(await down.days(["# workout"]), { ok: false, error: "net" });
  const broken = makeClient(GAS, () => TOKEN, async () => ({ json: async () => { throw new Error("html"); } }));
  assert.deepEqual(await broken.record("# a", "2026-10-24"), { ok: false, error: "net" });
});

test("ID トークンは端末に残さない（W7）", async () => {
  mem.clear();
  const s = store.load();
  store.addHabit(s, { name: "筋トレ", lineText: "# workout" });
  const c = makeClient(GAS, () => TOKEN, okFetch({ ok: true, added: true, date: "2026-10-24" }, []));
  await c.record("# workout", "2026-10-24");
  store.confirmBotDay(s, s.habits[0].id, "2026-10-24");
  store.save(s);
  assert.ok(![...mem.values()].join("").includes(TOKEN));
  assert.ok(!store.exportJson(s).includes(TOKEN));
});

test("ブラウザで開いたとき・設定が空のときは、LIFF を読まずに null（つづくは今までどおり）", async () => {
  assert.equal(inLineApp("Mozilla/5.0 (iPhone) Safari/604.1"), false);
  assert.equal(inLineApp("Mozilla/5.0 (iPhone) Line/14.1.0 LIFF"), true);
  assert.equal(await startLineLog(GAS, { liffId: "" }), null);
  assert.equal(await startLineLog("https://evil.example.com/exec", { liffId: "2000000001-abcd" }), null);
  assert.equal(await startLineLog("", { liffId: "2000000001-abcd" }), null);
  globalThis.navigator ??= {};
  assert.equal(await startLineLog(GAS, { liffId: "2000000001-abcd" }), null, "LINE のアプリでなければ null");
  // 公開しているつづくには、だれかの GAS の URL を置かない（使う人がそれぞれ入れる）
  assert.deepEqual(Object.keys(LINE_LOG), ["liffId"]);
  assert.match(LINE_LOG.liffId, /^\d{10}-[A-Za-z0-9]+$/);
});

test("ボットから読んだ日：日付だけ、習慣ごとに置きかえる。ボットに入った日は外せない○にうつす", () => {
  const s = store.load();
  s.habits = [];
  s.done = {};
  s.bot = {};
  const a = store.addHabit(s, { name: "筋トレ", lineText: "# workout" });
  const b = store.addHabit(s, { name: "読書", lineText: "# 読書" });
  store.addHabit(s, { name: "水" });
  assert.deepEqual(store.botHabits(s).map((h) => h.id), [a.id, b.id]);
  const hs = store.botHabits(s);
  // qcheck-ok: W8 テストの見本の文字
  assert.equal(store.applyBotDays(s, hs, [["2026-10-20", "<img src=x onerror=alert(1)>", 5, "2026-10-20", "2026-10-22"], []]), true);
  assert.deepEqual(s.bot[a.id], ["2026-10-20", "2026-10-22"]);
  assert.equal(s.bot[b.id], undefined);
  assert.equal(store.applyBotDays(s, hs, [["2026-10-22", "2026-10-20"], []]), false, "同じなら変わらない");
  assert.equal(store.applyBotDays(s, hs, "bad"), false);
  // ○ → ボットに入った
  store.toggle(s, a.id, "2026-10-24");
  store.confirmBotDay(s, a.id, "2026-10-24");
  assert.deepEqual(s.done[a.id], []);
  assert.ok(store.botDays(s, a.id).has("2026-10-24"));
  store.confirmBotDay(s, a.id, "not-a-date");
  store.confirmBotDay(s, "nohabit", "2026-10-24");
  assert.equal(s.bot.nohabit, undefined);
});

test("ボットの日も、残す・控え・消して元に戻すで消えない。形のちがう中身は捨てる", () => {
  mem.clear();
  const s = store.load();
  const h = store.addHabit(s, { name: "筋トレ", lineText: "# workout" });
  store.applyBotDays(s, [h], [["2026-10-20"]]);
  store.save(s);
  assert.deepEqual(store.load().bot, { [h.id]: ["2026-10-20"] });
  const back = store.load();
  back.habits = [];
  back.done = {};
  back.bot = {};
  store.importJson(back, store.exportJson(s));
  assert.deepEqual(back.bot, { [h.id]: ["2026-10-20"] });
  const trash = store.removeHabit(s, h.id);
  assert.equal(s.bot[h.id], undefined);
  store.restoreHabit(s, trash);
  assert.deepEqual(s.bot[h.id], ["2026-10-20"]);
  // 知らない習慣の日・日付でないものは読まない
  mem.set("tuzuq:v1", JSON.stringify({ habits: [{ id: "good1234", name: "a" }], done: {}, bot: { good1234: ["2026-10-01", "x"], other999: ["2026-10-02"] } }));
  assert.deepEqual(store.load().bot, { good1234: ["2026-10-01"] });
});

test("失敗の言葉に、仕組みの言葉（LIFF・GAS・トークン）を出さない", () => {
  ["auth", "day", "off", "net", "fail", "many", "bad", undefined].forEach((e) => {
    assert.doesNotMatch(lineLogMessage(e), /LIFF|GAS|トークン|API|error/i);
  });
});

test("つなぐ GAS の URL は、GAS のウェブアプリの形だけ（ほかのサイト・スクリプトは入らない）", () => {
  assert.equal(cleanGasUrl(GAS), GAS);
  assert.equal(cleanGasUrl(" " + GAS + " "), GAS);
  ["https://evil.example.com/macros/s/AKfyTEST_123/exec", "http://script.google.com/macros/s/AKfyTEST_123/exec", "https://script.google.com/macros/s/AKfyTEST_123/exec?x=1", "javascript:alert(1)//script.google.com/macros/s/AKfyTEST_123/exec", "https://script.google.com.evil.com/macros/s/AKfyTEST_123/exec", ""].forEach((u) => assert.equal(cleanGasUrl(u), "", u)); // qcheck-ok: W8 テストの見本の文字
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], gasUrl: "https://evil.example.com/exec" }));
  assert.equal(store.load().gasUrl, "");
  mem.set("tuzuq:v1", JSON.stringify({ habits: [], gasUrl: GAS }));
  assert.equal(store.load().gasUrl, GAS);
});

test("持ち主の登録・持ち主でないときの言葉", () => {
  assert.match(lineLogMessage("claim"), /adoptTuzuqOwner/);
  assert.match(lineLogMessage("notyou"), /持ち主ではありません/);
});

test("いまの設定：入口の GAS の sections も、配布用の status も、見出しと行にそろえる（だめなら null）", async () => {
  const { statusSections } = await import("../js/linelog.js");
  assert.deepEqual(statusSections({ ok: true, sections: [{ title: "🔔 知らせ", rows: ["毎日 20:00", 5] }, null] }), [{ title: "🔔 知らせ", rows: ["毎日 20:00", "5"] }]);
  const s = statusSections({ ok: true, status: { tuzuqOwner: true, github: false, habits: ["# workout"] } });
  assert.equal(s[0].rows[1], "送る文：# workout");
  assert.match(s[1].rows[0], /つながっていません/);
  assert.equal(statusSections({ ok: false, error: "notyou" }), null);
  assert.equal(statusSections(null), null);
});

test("くらぶボットにつなぐときは、くらぶボットの形（app: qlove・tool・action）で送る", async () => {
  const seen = [];
  const c = makeClient(GAS, () => TOKEN, okFetch({ ok: true }, seen), { legacy: false });
  await c.record("# workout", "2026-10-25");
  assert.deepEqual(seen[0].body, { app: "qlove", v: 1, tool: "tuzuq", action: "record", liffId: LINE_LOG.liffId, idToken: TOKEN, text: "# workout", date: "2026-10-25" });
});

test("電波がない・つながっていないときの○：LINE 版でつなぐ人なら箱に入れ、つながったら送る（送る文がある・7日前まで）。ブラウザ版・つながない人は端末だけ", async () => {
  const { waitForBot, sendBox } = await import("../js/linelog.js");
  const base = { inLine: true, gasUrl: GAS, lineText: "# workout", date: "2026-10-26", today: "2026-10-26" };
  assert.equal(waitForBot(base), true);
  assert.equal(waitForBot({ ...base, inLine: false }), false, "ブラウザ版");
  assert.equal(waitForBot({ ...base, gasUrl: "" }), false, "つながない人");
  assert.equal(waitForBot({ ...base, lineText: "" }), false, "送る文がない");
  assert.equal(waitForBot({ ...base, date: "2026-10-18" }), false, "8日前");
  // 箱に入れて、電波がもどったら送る（送れたら消す）
  const box = sendBox();
  box.put("h1|2026-10-26", { text: "# workout", date: "2026-10-26" });
  assert.equal(box.all().length, 1);
  assert.doesNotMatch(String(globalThis.localStorage.getItem("tuzuq:outbox")), /idToken|head\.payload/);
  const seen = [];
  const c = makeClient(GAS, () => TOKEN, okFetch({ ok: true, added: true }, seen));
  for (const { id, item } of box.all()) if ((await c.record(item.text, item.date)).ok) box.drop(id);
  assert.equal(seen[0].body.text, "# workout");
  assert.equal(box.all().length, 0);
});
