// つづく：画面の HTML の組み立て（js/view.js）のテスト
//   node --test test/
import "./_botlink.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { dotClass, esc, habitHtml, manageHtml, todayToolsHtml } from "../js/view.js";
import { lastDays } from "../js/stats.js";

const XSS = '<img src=x onerror=alert(1)>"\''; // qcheck-ok: W8 テストの見本の文字
const today = "2026-11-05";
const week = lastDays(today, 7);
const days = (own = [], auto = []) => ({ own: new Set(own), auto: new Set(auto), all: new Set([...own, ...auto]) });
const habit = (o = {}) => ({ id: "abcd1234", name: "水を2L", emoji: "💧", link: null, lineText: "", ...o });

test("esc：HTML に入れられる形に（& < > \" ' を置きかえる）", () => {
  assert.equal(esc('a&b<c>"d\''), "a&amp;b&lt;c&gt;&quot;d&#39;");
  assert.equal(esc(null), "");
  assert.equal(esc(3), "3");
});

test("使う人が入れた名前・しるし・送る文は、そのまま HTML にならない", () => {
  const h = habit({ name: XSS, emoji: XSS, lineText: XSS });
  for (const html of [habitHtml(h, { d: days(), today, week }), manageHtml([h])]) {
    assert.equal(html.includes("<img"), false);
    assert.ok(html.includes("&lt;img"));
  }
});

test("この1週間の丸：7つ、いちばん右が「きょう」。前の日は曜日の字", () => {
  const html = habitHtml(habit(), { d: days([today]), today, week });
  const dots = [...html.matchAll(/<button class="dot([^"]*)"[^>]*data-date="([^"]+)"[^>]*aria-label="([^"]+)"><span>([^<]+)<\/span>/g)];
  assert.equal(dots.length, 7);
  assert.deepEqual(dots.map((m) => m[2]), week);
  assert.ok(dots[6][1].includes("is-today") && dots[6][1].includes("is-on"));
  assert.equal(dots[6][3], "水を2L きょうできた");
  assert.equal(dots[6][4], "きょう");
  assert.equal(dots[5][4], "水");
  assert.equal(dots[5][3], "11/4（水） ○なし");
  assert.ok(html.includes('class="habit is-done"'));
});

test("自動の○（つないだツール・くらぶボット）は押せない。自分でつけた日は押せる", () => {
  const d = days(["2026-11-04"], ["2026-11-03"]);
  assert.deepEqual(dotClass(habit(), d, "2026-11-03", today), { on: true, auto: true, cls: " is-on is-auto" });
  assert.deepEqual(dotClass(habit(), d, "2026-11-04", today), { on: true, auto: false, cls: " is-on" });
  assert.equal(dotClass(habit(), d, today, today, `abcd1234:${today}`).cls, " is-today is-pop");
  const html = habitHtml(habit(), { d, today, week });
  assert.match(html, /data-date="2026-11-03" disabled/);
  assert.doesNotMatch(html, /data-date="2026-11-04" disabled/);
});

test("続いた日数：0日なら「これから」、あれば「🔥n日」", () => {
  assert.ok(habitHtml(habit(), { d: days(), today, week }).includes('habit-streak is-zero">これから'));
  assert.ok(habitHtml(habit(), { d: days(["2026-11-03", "2026-11-04"]), today, week }).includes(">🔥2日<"));
});

test("札：つないだツールは開くリンク、くらぶボットに入れる習慣は「ボット連動」。どちらもなければ出さない", () => {
  assert.equal(habitHtml(habit(), { d: days(), today, week }).includes("habit-tags"), false);
  const linked = habitHtml(habit({ link: "shoquji" }), { d: days(), today, week });
  assert.match(linked, /<a class="auto-tag is-link" href="https:\/\/[^"]+"/);
  assert.ok(linked.includes("連動 ›"));
  assert.ok(habitHtml(habit({ lineText: "# water" }), { d: days(), today, week, bot: true }).includes("ボット連動"));
});

test("最初だけの指（👆）は、きょうがまだのときだけ", () => {
  assert.ok(habitHtml(habit(), { d: days(), today, week, tapHint: true }).includes("tap-hint"));
  assert.equal(habitHtml(habit(), { d: days([today]), today, week, tapHint: true }).includes("tap-hint"), false);
});

test("くらぶボットの数字：きょうの分があるときだけ「きょう 1時間35分」", () => {
  const value = { unit: "分", days: { [today]: 95 } };
  assert.ok(habitHtml(habit(), { d: days(), today, week, value }).includes("きょう 1時間35分"));
  assert.equal(habitHtml(habit(), { d: days(), today, week, value: { unit: "分", days: {} } }).includes("habit-value"), false);
});

test("しぼりこみ：えらんでいるものだけ押した形。並べ方は選んでいるものに selected", () => {
  const html = todayToolsHtml({ filter: "todo", sort: "streak" }, 3, 1);
  assert.match(html, /data-filter="todo" aria-pressed="true">まだ 1</);
  assert.match(html, /data-filter="done" aria-pressed="false">できた 2</);
  assert.match(html, /<option value="streak" selected>/);
  assert.match(todayToolsHtml({}, 2, 2), /data-filter="all" aria-pressed="true"/);
});

test("いまの習慣：いちばん上の「上へ」・いちばん下の「下へ」は押せない。直している行に印", () => {
  const list = [habit({ id: "aaaa1111" }), habit({ id: "bbbb2222", link: "kiloq" }), habit({ id: "cccc3333", lineText: "# read" })];
  const html = manageHtml(list, "bbbb2222");
  assert.match(html, /data-move="aaaa1111" data-dir="-1" disabled/);
  assert.match(html, /data-move="cccc3333" data-dir="1" disabled/);
  assert.doesNotMatch(html, /data-move="bbbb2222" data-dir="-?1" disabled/);
  assert.ok(html.includes('class="manage is-editing" data-row="bbbb2222"'));
  assert.ok(html.includes("いまの習慣（3 / 12）"));
  assert.ok(html.includes("💬 # read"));
  assert.equal(manageHtml([]), "");
});
