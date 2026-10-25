// つづく：カレンダーでお知らせ（Google カレンダーのリンク・.ics）のテスト
//   node --test test/
import "./_botlink.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { googleRemindUrl, remindIcs } from "../js/remind.js";
import { PAGE_URL, habitUrl } from "../js/link.js";

const habit = { id: "abcd1234", name: "水を2L, 飲む; かならず", emoji: "💧" };

test("Google カレンダー：毎日くり返す予定（時刻から15分）を、つづくのリンクつきで作る", () => {
  const q = new URL(googleRemindUrl(habit, "21:00", "2026-10-24", "Asia/Tokyo")).searchParams;
  assert.equal(q.get("action"), "TEMPLATE");
  assert.equal(q.get("text"), "💧 水を2L, 飲む; かならず");
  assert.equal(q.get("dates"), "20261024T210000/20261024T211500");
  assert.equal(q.get("recur"), "RRULE:FREQ=DAILY");
  assert.equal(q.get("ctz"), "Asia/Tokyo");
  assert.ok(q.get("details").includes(PAGE_URL));
});

test("日付をまたぐ時刻（23:50）でも、終わりは次の日", () => {
  const q = new URL(googleRemindUrl(habit, "23:50", "2026-12-31")).searchParams;
  assert.equal(q.get("dates"), "20261231T235000/20270101T000500");
  assert.equal(q.get("ctz"), null);
});

test(".ics：習慣ごとに毎日くり返す予定と、時刻ちょうどのお知らせ。カンマ・セミコロンはエスケープ", () => {
  const ics = remindIcs([habit, { id: "efgh5678", name: "本", emoji: "📖" }], "07:30", "2026-10-24");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /UID:tuzuq-abcd1234@katsuan\.github\.io/);
  assert.match(ics, /DTSTART:20261024T073000/);
  assert.match(ics, /RRULE:FREQ=DAILY/);
  assert.match(ics, /TRIGGER:PT0M/);
  assert.ok(ics.includes("SUMMARY:💧 水を2L\\, 飲む\\; かならず"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("予定のリンクは、習慣の印（?h=）つきでつづくを開く", () => {
  assert.equal(habitUrl(habit), `${PAGE_URL}?h=abcd1234`);
  const q = new URL(googleRemindUrl(habit, "21:00", "2026-10-24")).searchParams;
  assert.ok(q.get("details").includes(`${PAGE_URL}?h=abcd1234`));
  const ics = remindIcs([habit], "21:00", "2026-10-24");
  assert.ok(ics.includes(`URL:${PAGE_URL}?h=abcd1234`));
});

test("予定・カードから開くのは、つづくの LINE の中（LIFF）の URL", () => {
  assert.equal(PAGE_URL, "https://liff.line.me/2012187502-o87l8Esu");
  assert.equal(habitUrl({ id: "abcd1234" }), "https://liff.line.me/2012187502-o87l8Esu?h=abcd1234");
});
