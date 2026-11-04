// つづく：○をくらぶボットに送る予約（js/send-queue.js）と、ボットの数字の書き方のテスト
//   node --test test/
import "./_botlink.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { sendKey, sendQueue } from "../js/send-queue.js";
import { valueText } from "../js/linelog.js";

// 自分で進める時計（setTimeout の代わり）
function fakeTimers() {
  const list = new Map();
  let next = 1;
  return {
    setTimeout: (fn) => (list.set(next, fn), next++),
    clearTimeout: (id) => list.delete(id),
    runAll: () => [...list.entries()].forEach(([id, fn]) => (list.delete(id), fn())),
    count: () => list.size
  };
}
// 送れなかった○の箱の代わり
function fakeBox() {
  const box = new Map();
  return { put: (k, v) => box.set(k, v), drop: (k) => box.delete(k), all: () => [...box.keys()] };
}
// 送ったあとの知らせを待つ
const settle = () => new Promise((r) => setTimeout(r, 0));

// 予約の入れものを作る（record は返事を決められる）
function makeQueue({ answer = { ok: true }, online = true } = {}) {
  const timers = fakeTimers();
  const outbox = fakeBox();
  const sent = [];
  const done = [];
  const q = sendQueue({
    delayMs: 5000,
    outbox,
    timers,
    ready: () => online,
    record: async (text, date, keepalive) => (sent.push({ text, date, keepalive }), typeof answer === "function" ? answer() : answer),
    onDone: (key, item, res, keepalive) => done.push({ key, res, keepalive })
  });
  return { q, timers, outbox, sent, done };
}

test("○をつけても、「元に戻す」を押せる5秒のあいだは送らない。時間がたったら送り、送れたら箱から消す", async () => {
  const { q, timers, outbox, sent, done } = makeQueue();
  const key = q.queue("abcd1234", "2026-11-05", "# water");
  assert.equal(key, sendKey("abcd1234", "2026-11-05"));
  assert.equal(sent.length, 0);
  timers.runAll();
  await settle();
  assert.deepEqual(sent, [{ text: "# water", date: "2026-11-05", keepalive: false }]);
  assert.deepEqual(outbox.all(), []);
  assert.equal(done.length, 1);
  assert.equal(q.has(key), false);
});

test("送る前に外した（元に戻した）○は送らない", async () => {
  const { q, timers, sent } = makeQueue();
  const key = q.queue("abcd1234", "2026-11-05", "# water");
  q.cancel(key);
  assert.equal(timers.count(), 0);
  timers.runAll();
  await settle();
  assert.equal(sent.length, 0);
});

test("同じ日の○を2回予約しても、送るのは1回", async () => {
  const { q, timers, sent } = makeQueue();
  q.queue("abcd1234", "2026-11-05", "# water");
  q.queue("abcd1234", "2026-11-05", "# water");
  assert.equal(timers.count(), 1);
  timers.runAll();
  await settle();
  assert.equal(sent.length, 1);
});

test("電波がない（net・fail）ときは箱に残し、ほかの失敗は箱から消す", async () => {
  for (const [error, kept] of [["net", true], ["fail", true], ["auth", false]]) {
    const { q, timers, outbox, done } = makeQueue({ answer: { ok: false, error } });
    const key = q.queue("abcd1234", "2026-11-05", "# water");
    timers.runAll();
    await settle();
    assert.deepEqual(outbox.all(), kept ? [key] : [], error);
    assert.equal(done[0].res.error, error);
  }
});

test("送るとちゅうで落ちても net として扱い、箱に残す", async () => {
  const { q, timers, outbox, done } = makeQueue({ answer: () => Promise.reject(new Error("offline")) });
  const key = q.queue("abcd1234", "2026-11-05", "# water");
  timers.runAll();
  await settle();
  assert.deepEqual(outbox.all(), [key]);
  assert.equal(done[0].res.error, "net");
});

test("つながっていないあいだは送らず、予約のまま残す", async () => {
  const { q, timers, sent } = makeQueue({ online: false });
  const key = q.queue("abcd1234", "2026-11-05", "# water");
  timers.runAll();
  await settle();
  assert.equal(sent.length, 0);
  assert.equal(q.has(key), true);
});

test("閉じるときは、待っている○をすぐ送る（keepalive）", async () => {
  const { q, timers, sent, done } = makeQueue();
  q.queue("abcd1234", "2026-11-04", "# water");
  q.queue("efgh5678", "2026-11-05", "# read");
  q.flush();
  await settle();
  assert.equal(timers.count(), 0);
  assert.deepEqual(sent.map((s) => s.keepalive), [true, true]);
  assert.deepEqual(done.map((d) => d.keepalive), [true, true]);
});

test("「もう一度」で、送れなかった○をすぐ送りなおす", async () => {
  let n = 0;
  const { q, timers, outbox, sent } = makeQueue({ answer: () => (n++ ? { ok: true } : { ok: false, error: "net" }) });
  const key = q.queue("abcd1234", "2026-11-05", "# water");
  timers.runAll();
  await settle();
  assert.deepEqual(outbox.all(), [key]);
  await q.retry(key, { id: "abcd1234", date: "2026-11-05", text: "# water" });
  assert.equal(sent.length, 2);
  assert.deepEqual(outbox.all(), []);
});

test("いま送っている○は、2回送らない（箱から送りなおしている途中など）", async () => {
  const { q, sent } = makeQueue();
  const key = q.queue("abcd1234", "2026-11-05", "# water");
  q.sending.add(key);
  await q.send(key);
  assert.equal(sent.length, 0);
});

test("ボットの数字：時間は「時間・分」、距離は km、充電は＋−つきの％", () => {
  assert.equal(valueText(95, "分"), "1時間35分");
  assert.equal(valueText(120, "分"), "2時間");
  assert.equal(valueText(45, "分"), "45分");
  assert.equal(valueText(12.4, "km"), "12.4km");
  assert.equal(valueText(20, "%"), "+20%");
  assert.equal(valueText(-5, "%"), "-5%");
  assert.equal(valueText(3, "回"), "3回");
  assert.equal(valueText("x", ""), "0");
});
