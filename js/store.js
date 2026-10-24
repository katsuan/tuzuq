// つづく：記録の保存（この端末の localStorage の "tuzuq:v1" だけ。サーバーには送らない）
// 習慣 1件 = { id, name, emoji, link, at }
//   link：ほかの Q ツールの記録で自動で○をつける（"shoquji" … しょくじを記録した日）。なければ null
// done = { 習慣の id: ["YYYY-MM-DD", ...] }（○をつけた日）
// bot = { 習慣の id: ["YYYY-MM-DD", ...] }（LINE の中で開いたときに、記録ボットから読んだ「記録した日」。日付だけ）
// 消した習慣は、○の記録ごと控え（trash）に1つだけ残して「元に戻す」で戻せるようにする

import { isDate } from "./stats.js?v=202610241408";
import { cleanGasUrl } from "./linelog.js?v=202610241408";

const KEY = "tuzuq:v1";
const OLD_KEY = "tsuduq:v1"; // 前の名前
export const MAX_HABITS = 12;
export const MAX_DAYS_PER_HABIT = 3700; // 10年ぶんくらい
export const MAX_IMPORT_BYTES = 1024 * 1024; // 控えのファイルは 1MB まで
// id は画面のボタンやリンク（?h=）にも入れるので、英数字だけ（ちがう形なら新しく作る）
const ID = /^[a-z0-9]{4,24}$/;
export const isHabitId = (v) => ID.test(String(v ?? ""));
export const LINKS = {
  // url：自動の○のしるし（ピル）を押すと開く、そのツール（決まった自分のツールだけ。W5）
  shoquji: { name: "しょくじ", what: "食事の記録", label: "🍚 しょくじ（食事の記録）で記録した日", key: "shoquji:v1", url: "https://katsuan.github.io/shoquji/" },
  // キロっくは LINE の中で使う。この端末の同じブラウザ（LINE の中）で開いたときだけ読める。開くのも LINE の中で
  kiloq: { name: "キロっく", what: "筋トレの記録", label: "🏋️ キロっく（筋トレの記録）で記録した日", key: "liff-workout-history", url: "https://liff.line.me/2009927582-2isjfmkk" }
};
// 文字を n 字（UTF-16）までに切る。絵文字が半分に切れて残らないように
export function cut(text, n) {
  const s = String(text ?? "").trim().slice(0, n);
  return /[\uD800-\uDBFF]$/.test(s) ? s.slice(0, -1) : s;
}
// しるし：見た目の1文字だけ（家族の絵文字のような、つながった絵文字も1つ）。空なら ""
export function oneMark(text) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  let first = s;
  try {
    first = new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(s)[Symbol.iterator]().next().value?.segment || "";
  } catch {
    first = Array.from(s)[0] || "";
  }
  return first.length <= 16 ? first : "";
}
// 日付の並びを、重なりなし・古い順・上限つきに
const dayList = (list) => [...new Set(list.filter(isDate))].sort().slice(-MAX_DAYS_PER_HABIT);

// weekStart：カレンダーの週のはじまり（1＝月曜・既定、0＝日曜）
// auto：つないだツールの記録から読んだ日を覚えておく（{ shoquji: [日付...] }）。もとのツールが古い記録を消しても○が残るように
// remindAt：カレンダーでお知らせする時刻（"HH:MM"。js/remind.js）
export const REMIND_DEFAULT = "21:00";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// gasUrl：LINE の中で開いたときに、○を記録する自分の GAS（記録ボット）の URL。秘密ではない（形は js/linelog.js の cleanGasUrl）
// （前にあった lineBot（ボットの LINE の ID）は使わなくなったので、読んだら捨てる）
function blank() {
  return { v: 1, habits: [], done: {}, weekStart: 1, auto: {}, remindAt: REMIND_DEFAULT, gasUrl: "", bot: {}, view: { sort: "mine", filter: "all" } };
}

// 前のよくある習慣の名前（ツールの名前入り）を、だれでも読める名前に（カードを受け取る人は、しょくじ・キロっくを知らない）
// つないだ習慣で、名前が前の名前とまったく同じときだけ（自分で付けた名前は変えない）
const OLD_IDEA_NAMES = { shoquji: { "しょくじを記録": "食事を記録" }, kiloq: { "筋トレ（キロっく）": "筋トレ" } };
const friendlyName = (name, link) => (OLD_IDEA_NAMES[link] && OLD_IDEA_NAMES[link][name]) || name;

function cleanHabit(h) {
  return {
    id: isHabitId(h.id) ? String(h.id) : newId(),
    name: cut(friendlyName(String(h.name ?? "").trim(), h.link), 24),
    emoji: oneMark(h.emoji) || "✅",
    link: LINKS[h.link] ? h.link : null,
    lineText: cut(h.lineText, 60), // 記録ボットに送る文（例：# workout）
    at: Number(h.at) || Date.now()
  };
}

// 読みこんだ中身を、正しい形にそろえる（壊れた行は捨てる）
function clean(raw) {
  const s = blank();
  if (!raw || typeof raw !== "object") return s;
  s.weekStart = raw.weekStart === 0 ? 0 : 1;
  s.view = cleanView(raw.view);
  s.remindAt = TIME.test(raw.remindAt) ? raw.remindAt : REMIND_DEFAULT;
  s.gasUrl = cleanGasUrl(raw.gasUrl);
  const auto = raw.auto && typeof raw.auto === "object" ? raw.auto : {};
  Object.keys(LINKS).forEach((link) => {
    if (Array.isArray(auto[link])) s.auto[link] = dayList(auto[link]);
  });
  const done = raw.done && typeof raw.done === "object" ? raw.done : {};
  const bot = raw.bot && typeof raw.bot === "object" ? raw.bot : {};
  const seen = new Set();
  (Array.isArray(raw.habits) ? raw.habits : [])
    .filter((h) => h && typeof h === "object" && String(h.name || "").trim())
    .slice(0, MAX_HABITS)
    .forEach((h) => {
      const habit = cleanHabit(h);
      if (seen.has(habit.id)) habit.id = newId(); // 同じ id が重なったら、あとのほうを新しく
      seen.add(habit.id);
      const days = Array.isArray(done[h.id]) && habit.id === String(h.id) ? done[h.id] : [];
      s.habits.push(habit);
      s.done[habit.id] = dayList(days);
      if (habit.id === String(h.id) && Array.isArray(bot[h.id]) && bot[h.id].length) s.bot[habit.id] = dayList(bot[h.id]);
    });
  return s;
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function load() {
  try {
    // 前の名前（tsuduq:v1）で残した記録があれば、そのまま読む（次に保存するとき新しい名前で残る）
    return clean(JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || "null"));
  } catch {
    return blank();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.removeItem(OLD_KEY); // 新しい名前で残せたら、前の名前のものは消す（「すべて消す」で残らないように）
    return true;
  } catch {
    return false; // 残せない端末（プライベートブラウズなど）でも、開いているあいだは使える
  }
}

export function addHabit(state, h) {
  const habit = cleanHabit({ ...h, id: newId(), at: Date.now() });
  state.habits.push(habit);
  state.done[habit.id] = [];
  return habit;
}

export function updateHabit(state, id, h) {
  const habit = state.habits.find((x) => x.id === id);
  if (!habit) return null;
  Object.assign(habit, cleanHabit({ ...habit, ...h }));
  return habit;
}

// 消して、戻すための控えを返す
export function removeHabit(state, id) {
  const i = state.habits.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [habit] = state.habits.splice(i, 1);
  const days = state.done[id] || [];
  const bot = (state.bot && state.bot[id]) || [];
  delete state.done[id];
  if (state.bot) delete state.bot[id];
  return { habit, days, bot, index: i };
}

export function restoreHabit(state, trash) {
  if (!trash || state.habits.some((x) => x.id === trash.habit.id)) return;
  state.habits.splice(Math.min(trash.index, state.habits.length), 0, trash.habit);
  state.done[trash.habit.id] = trash.days;
  if (trash.bot && trash.bot.length) (state.bot = state.bot || {})[trash.habit.id] = trash.bot;
}

export function moveHabit(state, id, dir) {
  const i = state.habits.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.habits.length) return;
  [state.habits[i], state.habits[j]] = [state.habits[j], state.habits[i]];
}

// ---- きょうの○の並べ方・しぼりこみ ----
// sort：mine＝自分で決めた順・todo＝まだを先に・streak＝つづいている日が長い順
// filter：all＝すべて・todo＝まだ・done＝できた
export const SORTS = ["mine", "todo", "streak"];
export const FILTERS = ["all", "todo", "done"];
export function cleanView(v) {
  const o = v && typeof v === "object" ? v : {};
  return { sort: SORTS.includes(o.sort) ? o.sort : "mine", filter: FILTERS.includes(o.filter) ? o.filter : "all" };
}
// 並べた id の列を返す。isDone(h)・streakOf(h) は画面側から渡す（同じなら、自分で決めた順）
export function orderToday(habits, view, isDone, streakOf) {
  const v = cleanView(view);
  const list = habits
    .map((h, i) => ({ h, i, done: !!isDone(h), n: Number(streakOf(h)) || 0 }))
    .filter((x) => v.filter === "all" || (v.filter === "done" ? x.done : !x.done));
  if (v.sort === "todo") list.sort((a, b) => a.done - b.done || a.i - b.i);
  if (v.sort === "streak") list.sort((a, b) => b.n - a.n || a.i - b.i);
  return list.map((x) => x.h.id);
}

// 引っぱって並べ替え：id の習慣を to 番目へ（はみ出たら端へ）
export function moveHabitTo(state, id, to) {
  const i = state.habits.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [h] = state.habits.splice(i, 1);
  state.habits.splice(Math.max(0, Math.min(to, state.habits.length)), 0, h);
}

// ○をつける・外す。つけたら true
export function toggle(state, id, date) {
  const days = state.done[id] || (state.done[id] = []);
  const i = days.indexOf(date);
  if (i >= 0) {
    days.splice(i, 1);
    return false;
  }
  days.push(date);
  days.sort();
  return true;
}

// ほかの Q ツールの記録から、○になる日（同じサイト katsuan.github.io なので、同じ localStorage を読める）
// いまもとのツールに残っている記録の日
function liveLinkedDays(link) {
  const def = LINKS[link];
  if (!def) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(def.key) || "null");
    // しょくじ：{ logs: [{ date }] }。LINE の中で食事記録ボットとつないでいるときは、ボットで入れた記録の日も
    //   shoquji:days（{ v: 1, days: [日付…] }。しょくじが書く、端末の記録＋ボットの記録の日）に入っている
    if (link === "shoquji") {
      const own = Array.isArray(raw?.logs) ? raw.logs.map((l) => l && l.date) : [];
      return [...own, ...shoqujiDays()].filter(isDate);
    }
    // キロっく：[{ date, ... }]（新しい 10 回分だけ残る）
    if (link === "kiloq" && Array.isArray(raw)) return raw.map((w) => w && w.date).filter(isDate);
  } catch {
    // 読めなければ、自動の○はなし
  }
  return [];
}

// しょくじが書く「記録がある日の一覧」（ボットで入れた記録の日も入る）。読めなければ []
function shoqujiDays() {
  try {
    const raw = JSON.parse(localStorage.getItem("shoquji:days") || "null");
    return Array.isArray(raw?.days) ? raw.days.slice(-1000) : [];
  } catch {
    return [];
  }
}

// 覚えておいた日と、いま残っている日を合わせる
export function linkedDays(link, state) {
  if (!LINKS[link]) return new Set();
  return new Set([...((state && state.auto && state.auto[link]) || []), ...liveLinkedDays(link)]);
}

// つないでいる習慣のツールから読んだ日を、つづくに覚えておく。ふえたら true（保存する）
export function rememberLinked(state) {
  let changed = false;
  if (!state.auto) state.auto = {};
  new Set(state.habits.map((h) => h.link).filter((l) => LINKS[l])).forEach((link) => {
    const have = new Set(state.auto[link] || []);
    const add = liveLinkedDays(link).filter((d) => !have.has(d));
    if (add.length) {
      state.auto[link] = dayList([...have, ...add]);
      changed = true;
    }
  });
  return changed;
}

// ---- 記録ボット（LINE の中で開いたとき。js/linelog.js） ----
// ボットに記録する習慣（送る文があるもの）
export const botHabits = (state) => state.habits.filter((h) => h.lineText);

// ボットから読んだ日に置きかえる（habits[i] の日 = days[i]）。変わったら true
export function applyBotDays(state, habits, days) {
  if (!Array.isArray(days)) return false;
  state.bot = state.bot || {};
  let changed = false;
  habits.forEach((h, i) => {
    if (!state.habits.includes(h)) return;
    const next = Array.isArray(days[i]) ? dayList(days[i]) : [];
    if (JSON.stringify(next) === JSON.stringify(state.bot[h.id] || [])) return;
    if (next.length) state.bot[h.id] = next;
    else delete state.bot[h.id];
    changed = true;
  });
  return changed;
}

// ボットに入った日：ボットの日にうつす（自分の○からは外す。外せない○になる）
export function confirmBotDay(state, id, date) {
  if (!isDate(date) || !state.habits.some((h) => h.id === id)) return;
  state.bot = state.bot || {};
  state.bot[id] = dayList([...(state.bot[id] || []), date]);
  state.done[id] = (state.done[id] || []).filter((d) => d !== date);
}

export const botDays = (state, id) => new Set((state.bot && state.bot[id]) || []);

// 控え（書き出し・読みこみ）。読みこみは同じ習慣の○を足し、ほかの習慣は加える
export function exportJson(state) {
  return JSON.stringify({ app: "tuzuq", exportedAt: new Date().toISOString(), ...state }, null, 1);
}

export function importJson(state, text) {
  if (String(text).length > MAX_IMPORT_BYTES) throw new Error("too large");
  const incoming = clean(JSON.parse(text));
  let added = 0;
  Object.keys(incoming.auto).forEach((link) => {
    state.auto = state.auto || {};
    state.auto[link] = dayList([...(state.auto[link] || []), ...incoming.auto[link]]);
  });
  incoming.habits.forEach((h) => {
    const mine = state.habits.find((x) => x.id === h.id);
    if (!mine) {
      if (state.habits.length >= MAX_HABITS) return;
      state.habits.push(h);
      state.done[h.id] = [];
      added++;
    }
    state.done[h.id] = dayList([...(state.done[h.id] || []), ...incoming.done[h.id]]);
    if (incoming.bot[h.id]) (state.bot = state.bot || {})[h.id] = dayList([...((state.bot && state.bot[h.id]) || []), ...incoming.bot[h.id]]);
  });
  return added;
}

// 記録はすべて消すが、週のはじまりの設定は残す
// （覚えておいたつなぎの日も消す）
export function reset(weekStart = 1) {
  const s = blank();
  s.weekStart = weekStart === 0 ? 0 : 1;
  save(s);
  return s;
}
