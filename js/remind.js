// つづく：毎日のお知らせを、カレンダーに任せる（サーバーなしで、決まった時刻に知らせてもらう）
//   Google カレンダー：習慣ごとに、毎日くり返す予定を作る画面を開く（Google の「タスク」はリンクから作れないので、予定で）
//   まとめて（.ics）：iPhone は開くと「すべてを追加」。時刻ちょうどのお知らせつき
// どちらも予定の中に、つづくを開くリンクを入れる。止めるときはカレンダーの予定を消す
import { OPEN_URL } from "./line-config.js?v=202610242130";
// 予定から開くのは LINE の中（LIFF）。記録ボットとつないでいれば、そのまま○が記録ボットにも入る
export const PAGE_URL = OPEN_URL;
const MINUTES = 15; // 予定の長さ

const pad = (n) => String(n).padStart(2, "0");
// "2026-10-24" と "21:00" → その日時（この端末の時刻）。分を足した時刻も出す
function at(day, time, plusMinutes = 0) {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const t = new Date(y, m - 1, d, h, mi + plusMinutes);
  return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
}
const title = (h) => `${h.emoji} ${h.name}`;
// 予定から開くリンク：?h=習慣の id で、開いたらその習慣を目立たせる
export const habitUrl = (h) => `${PAGE_URL}?h=${encodeURIComponent(h.id)}`;
const details = (h) => `「${h.name}」ができたら、つづくでチェックしよう\n${habitUrl(h)}`;

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

export function remindIcs(habits, time, today) {
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
