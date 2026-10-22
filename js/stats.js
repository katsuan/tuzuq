// つづく：計算（画面に関係しない計算だけ）
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export function ymd(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

// カレンダーの曜日の見出し（週のはじまりから7つ）。dow：0＝日 … 6＝土
export function weekHeader(weekStart = 1) {
  return Array.from({ length: 7 }, (_, i) => {
    const dow = (weekStart + i) % 7;
    return { label: WEEK[dow], dow };
  });
}

export function weekday(date) {
  const [y, m, d] = date.split("-").map(Number);
  return WEEK[new Date(y, m - 1, d).getDay()];
}

// 「10/23（金）」
export function label(date) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${weekday(date)}）`;
}

// 続けて○がついた日数（今日まだなら、昨日までで数える＝今日つければ続く）
export function streak(days, today) {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// これまでいちばん長く続いた日数
export function best(days) {
  const list = [...days].sort();
  let top = 0;
  let run = 0;
  let prev = null;
  list.forEach((d) => {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    top = Math.max(top, run);
    prev = d;
  });
  return top;
}

// 今日までの n 日（古い順）
export function lastDays(today, n) {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

// ひと月のカレンダー。weekStart：1＝月曜はじまり（既定）、0＝日曜はじまり。前後の空きは null
export function monthGrid(year, month, weekStart = 1) {
  const first = new Date(year, month - 1, 1);
  const count = new Date(year, month, 0).getDate();
  const cells = Array((first.getDay() - weekStart + 7) % 7).fill(null);
  for (let d = 1; d <= count; d++) cells.push(ymd(new Date(year, month - 1, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}
