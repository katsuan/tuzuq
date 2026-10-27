// つづく：毎日のお知らせを、カレンダーに任せる（サーバーなしで、決まった時刻に知らせてもらう）
//   Google カレンダー：習慣ごとに、毎日くり返す予定を作る画面を開く（Google の「タスク」はリンクから作れないので、予定で）
//   まとめて（.ics）：iPhone は開くと「すべてを追加」。時刻ちょうどのお知らせつき
// どちらも予定の中に、つづくを開くリンクを入れる。止めるときはカレンダーの予定を消す
// 読まれるところ：app.js（テストは test/remind.test.mjs）
import { habitUrl } from "./link.js?v=202610271256"; // 予定から開くリンク（?h=習慣の id）
const MINUTES = 15; // 予定の長さ

// 2けたにそろえる（7 → "07"）
const pad = (n) => String(n).padStart(2, "0");
// "2026-10-24" と "21:00" → その日時（この端末の時刻）。分を足した時刻も出す
function at(day, time, plusMinutes = 0) {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const t = new Date(y, m - 1, d, h, mi + plusMinutes);
  return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
}
// 予定の題（しるし＋名前）
const title = (h) => `${h.emoji} ${h.name}`;
// 予定のメモ（ひとことと、その習慣を開くリンク）
const details = (h) => `「${h.name}」ができたら、つづくでチェックしよう\n${habitUrl(h)}`;

// Google カレンダーで、毎日くり返す予定を作る画面のリンクを返す
export function googleRemindUrl(habit, time, today, tz = "") {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: title(habit),
    dates: `${at(today, time)}/${at(today, time, MINUTES)}`,
    recur: "RRULE:FREQ=DAILY",
    details: details(habit)
  });
  if (tz) q.set("ctz", tz);
  return `https://calendar.google.com/calendar/render?${q}`;
}

// 習慣ごとの毎日の予定をまとめた .ics の中身を返す（時刻ちょうどのお知らせつき）
export function remindIcs(habits, time, today) {
  // .ics に書けるよう、\ ; , 改行を書きかえる
  const esc = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n|\r/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//katsuan//tuzuq//JA", "CALSCALE:GREGORIAN", "X-WR-CALNAME:つづく"];
  for (const h of habits) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:tuzuq-${h.id}@katsuan.github.io`, // 同じ習慣を2回入れても1つに
      `DTSTAMP:${stamp}`,
      `DTSTART:${at(today, time)}`,
      `DTEND:${at(today, time, MINUTES)}`,
      "RRULE:FREQ=DAILY",
      `SUMMARY:${esc(title(h))}`,
      `DESCRIPTION:${esc(details(h))}`,
      `URL:${habitUrl(h)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(title(h))}`,
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
