// つづく：記録の保存（この端末の localStorage の "tuzuq:v1" だけ。サーバーには送らない）
// 習慣 1件 = { id, name, emoji, link, at }
//   link：ほかの Q ツールの記録で自動で○をつける（"shoquji" … しょくじを記録した日）。なければ null
// done = { 習慣の id: ["YYYY-MM-DD", ...] }（○をつけた日）
// 消した習慣は、○の記録ごと控え（trash）に1つだけ残して「元に戻す」で戻せるようにする

const KEY = "tuzuq:v1";
export const MAX_HABITS = 12;
export const MAX_DAYS_PER_HABIT = 3700; // 10年ぶんくらい
export const MAX_IMPORT_BYTES = 1024 * 1024; // 控えのファイルは 1MB まで
// id は画面のボタンにも入れるので、英数字だけ（ちがう形なら新しく作る）
const ID = /^[a-z0-9]{4,24}$/;
export const LINKS = {
  shoquji: { label: "🍚 しょくじを記録した日", key: "shoquji:v1" },
  // キロっくは LINE の中で使う。この端末の同じブラウザ（LINE の中）で開いたときだけ読める
  kiloq: { label: "🏋️ キロっくで記録した日", key: "liff-workout-history" }
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (d) => typeof d === "string" && DATE_RE.test(d);

// weekStart：カレンダーの週のはじまり（1＝月曜・既定、0＝日曜）
// auto：つないだツールの記録から読んだ日を覚えておく（{ shoquji: [日付...] }）。もとのツールが古い記録を消しても○が残るように
function blank() {
  return { v: 1, habits: [], done: {}, weekStart: 1, auto: {} };
}

function cleanHabit(h) {
  return {
    id: ID.test(String(h.id || "")) ? String(h.id) : newId(),
    name: String(h.name || "").trim().slice(0, 24),
    emoji: String(h.emoji || "✅").slice(0, 8),
    link: LINKS[h.link] ? h.link : null,
    at: Number(h.at) || Date.now()
  };
}

// 読みこんだ中身を、正しい形にそろえる（壊れた行は捨てる）
function clean(raw) {
  const s = blank();
  if (!raw || typeof raw !== "object") return s;
  s.weekStart = raw.weekStart === 0 ? 0 : 1;
  const auto = raw.auto && typeof raw.auto === "object" ? raw.auto : {};
  Object.keys(LINKS).forEach((link) => {
    if (Array.isArray(auto[link])) s.auto[link] = [...new Set(auto[link].filter(isDate))].sort().slice(-MAX_DAYS_PER_HABIT);
  });
  const done = raw.done && typeof raw.done === "object" ? raw.done : {};
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
      s.done[habit.id] = [...new Set(days.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(-MAX_DAYS_PER_HABIT);
    });
  return s;
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function load() {
  try {
    // 前の名前（tsuduq:v1）で残した記録があれば、そのまま読む（次に保存するとき新しい名前で残る）
    return clean(JSON.parse(localStorage.getItem(KEY) || localStorage.getItem("tsuduq:v1") || "null"));
  } catch {
    return blank();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
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
  delete state.done[id];
  return { habit, days, index: i };
}

export function restoreHabit(state, trash) {
  if (!trash || state.habits.some((x) => x.id === trash.habit.id)) return;
  state.habits.splice(Math.min(trash.index, state.habits.length), 0, trash.habit);
  state.done[trash.habit.id] = trash.days;
}

export function moveHabit(state, id, dir) {
  const i = state.habits.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.habits.length) return;
  [state.habits[i], state.habits[j]] = [state.habits[j], state.habits[i]];
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
    // しょくじ：{ logs: [{ date }] }
    if (link === "shoquji" && Array.isArray(raw?.logs)) return raw.logs.map((l) => l && l.date).filter(isDate);
    // キロっく：[{ date, ... }]（新しい 10 回分だけ残る）
    if (link === "kiloq" && Array.isArray(raw)) return raw.map((w) => w && w.date).filter(isDate);
  } catch {
    // 読めなければ、自動の○はなし
  }
  return [];
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
      state.auto[link] = [...have, ...add].sort().slice(-MAX_DAYS_PER_HABIT);
      changed = true;
    }
  });
  return changed;
}

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
    state.auto[link] = [...new Set([...(state.auto[link] || []), ...incoming.auto[link]])].sort().slice(-MAX_DAYS_PER_HABIT);
  });
  incoming.habits.forEach((h) => {
    const mine = state.habits.find((x) => x.id === h.id);
    if (!mine) {
      if (state.habits.length >= MAX_HABITS) return;
      state.habits.push(h);
      state.done[h.id] = [];
      added++;
    }
    state.done[h.id] = [...new Set([...(state.done[h.id] || []), ...incoming.done[h.id]])].sort().slice(-MAX_DAYS_PER_HABIT);
  });
  return added;
}

// 記録はすべて消すが、週のはじまりの設定は残す
export function reset(weekStart = 1) { // 覚えておいたつなぎの日も消す
  const s = blank();
  s.weekStart = weekStart === 0 ? 0 : 1;
  save(s);
  return s;
}
