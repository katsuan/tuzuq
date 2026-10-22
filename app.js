// つづく（TuzuQ）：画面の操作。記録はこの端末の中だけ（js/store.js）、計算は js/stats.js
import { LINKS, MAX_HABITS, addHabit, exportJson, importJson, linkedDays, load, moveHabit, removeHabit, reset, restoreHabit, save, toggle, updateHabit } from "./js/store.js?v=202610231";
import { addDays, best, label, lastDays, monthGrid, streak, weekday, ymd } from "./js/stats.js?v=202610231";

const $ = (id) => document.getElementById(id);
const PAGE_URL = "https://katsuan.github.io/tuzuq/";
const CARD_COLOR = "#2F80D8"; // ロゴの青
const EMOJIS = ["✅", "💧", "🚶", "🏃", "📖", "🧘", "🦷", "💊", "📓", "🛏️", "🥗", "🎹", "📚", "🌱", "🧹", "💪", "🍚"];
const IDEAS = [
  ["💧", "水を2L飲む"],
  ["🚶", "8000歩あるく"],
  ["📖", "本を10ページ"],
  ["🧘", "ストレッチ"],
  ["🦷", "フロス"],
  ["📓", "日記を書く"],
  ["🛏️", "0時までに寝る"],
  ["🍚", "しょくじを記録", "shoquji"]
];

let state = load();
const ui = {
  emoji: EMOJIS[0],
  editing: null, // 直している習慣の id
  cal: null, // カレンダーで見る習慣の id
  month: ymd().slice(0, 7), // "YYYY-MM"
  justDone: null // ○をつけたばかりの「id:日付」（少し弾ませる）
};

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function persist() {
  if (!save(state)) say("この端末に残せませんでした（プライベートブラウズでは、閉じると消えます）");
}

function say(text, undo) {
  if (window.LineShareUI?.toast) {
    window.LineShareUI.toast(text, undo ? { actionLabel: "元に戻す", onAction: undo } : {});
    return;
  }
  $("status").textContent = text;
  clearTimeout(say.timer);
  if (text) say.timer = setTimeout(() => ($("status").textContent = ""), 3500);
}

// 習慣ごとの○の日（自分でつけた日＋つないだツールの記録の日）
function daysOf(h) {
  const own = new Set(state.done[h.id] || []);
  const auto = h.link ? linkedDays(h.link) : new Set();
  return { own, auto, all: new Set([...own, ...auto]) };
}

// ---- きょうの○ ----
function renderToday() {
  const today = ymd();
  $("todayHeading").textContent = `きょうの○ ${label(today)}`;
  const week = lastDays(today, 7);
  if (!state.habits.length) {
    $("progress").textContent = "";
    $("habitList").innerHTML = `<div class="ls-empty"><span class="ls-empty-icon" aria-hidden="true">🌱</span>まずは、つづけたいことを1つ。<br>押すとふえます（自分で決めるなら下の「➕ 習慣をふやす」）</div>
      <div class="ls-chips start-ideas">${IDEAS.slice(0, 6).map(([e, n], i) => `<button class="ls-chip is-small" type="button" data-quick="${i}">${e} ${esc(n)}</button>`).join("")}</div>`;
    $("sendArea").hidden = true;
    return;
  }
  let doneToday = 0;
  $("habitList").innerHTML = state.habits
    .map((h) => {
      const d = daysOf(h);
      const isDone = d.all.has(today);
      if (isDone) doneToday++;
      const n = streak(d.all, today);
      const dots = week
        .map((date) => {
          const on = d.all.has(date);
          const auto = !d.own.has(date) && d.auto.has(date);
          const pop = ui.justDone === `${h.id}:${date}` ? " is-pop" : "";
          return `<button class="dot${on ? " is-on" : ""}${auto ? " is-auto" : ""}${date === today ? " is-today" : ""}${pop}" type="button" data-toggle="${h.id}" data-date="${date}" ${auto ? "disabled" : ""} aria-pressed="${on}" aria-label="${label(date)} ${on ? "○あり" : "○なし"}"><span>${weekday(date)}</span><i></i></button>`;
        })
        .join("");
      const autoToday = !d.own.has(today) && d.auto.has(today);
      return `<div class="habit${isDone ? " is-done" : ""}">
        <div class="habit-top">
          <span class="habit-emoji" aria-hidden="true">${esc(h.emoji)}</span>
          <span class="habit-name"><b>${esc(h.name)}</b>${h.link ? `<small class="auto-tag">${esc(LINKS[h.link].label.split(" ")[0])} 記録した日に自動で○</small>` : ""}</span>
          <span class="habit-streak${n ? "" : " is-zero"}">${n ? `🔥${n}日` : "これから"}</span>
          <button class="check${isDone ? " is-on" : ""}${ui.justDone === `${h.id}:${today}` ? " is-pop" : ""}" type="button" data-toggle="${h.id}" data-date="${today}" ${autoToday ? "disabled" : ""} aria-pressed="${isDone}" aria-label="${esc(h.name)} きょう${isDone ? "できた" : "まだ"}">${isDone ? "✓" : ""}</button>
        </div>
        <div class="dots" aria-label="この1週間">${dots}</div>
      </div>`;
    })
    .join("");
  $("progress").innerHTML = `<b>${doneToday}</b> / ${state.habits.length}`;
  $("progress").classList.toggle("is-all", doneToday === state.habits.length);
  ui.justDone = null;
  $("sendArea").hidden = false;
  $("sendBtn").href = cardUrl(today);
}

$("habitList").addEventListener("click", (e) => {
  const quick = e.target.closest("[data-quick]");
  if (quick) {
    const [emoji, name, link] = IDEAS[Number(quick.dataset.quick)];
    addHabit(state, { name, emoji, link });
    persist();
    render();
    say(`🌱 「${name}」をふやしました。できたら右の○を押します`);
    return;
  }
  const b = e.target.closest("[data-toggle]");
  if (!b || b.disabled) return;
  const h = state.habits.find((x) => x.id === b.dataset.toggle);
  const date = b.dataset.date;
  const on = toggle(state, h.id, date);
  persist();
  if (on) ui.justDone = `${h.id}:${date}`;
  render();
  if (on && date === ymd()) {
    const n = streak(daysOf(h).all, date);
    say(n >= 2 ? `🔥 「${h.name}」${n}日つづいています` : `○ 「${h.name}」できました`);
  }
});

// おくるんのお知らせカード：きょうの○の一覧と、続いた日数
function cardUrl(today) {
  const lines = state.habits.map((h) => {
    const d = daysOf(h);
    const n = streak(d.all, today);
    return `${d.all.has(today) ? "○" : "・"} ${h.emoji} ${h.name}${n ? `（🔥${n}日）` : ""}`;
  });
  const done = state.habits.filter((h) => daysOf(h).all.has(today)).length;
  const params = new URLSearchParams({
    headerTitle: "✅ きょうの○",
    date: label(today),
    showDate: "true",
    title: done === state.habits.length ? `ぜんぶできた！ ${done} / ${done}` : `${done} / ${state.habits.length} できた`,
    detail: lines.join("\n").slice(0, 300),
    theme: "custom",
    customColor: CARD_COLOR,
    showAction: "true",
    actionLabel: "✅ つづくで○をつける",
    actionUrl: PAGE_URL,
    from: "tuzuq"
  });
  return window.OQRN ? window.OQRN.cardUrl(params) : "#";
}

// ---- 習慣をふやす・直す ----
function renderForm() {
  $("emojis").innerHTML = EMOJIS.map((e) => `<button class="ls-chip emoji" type="button" role="radio" aria-checked="${e === ui.emoji}" data-emoji="${e}">${e}</button>`).join("");
  const used = new Set(state.habits.map((h) => h.name));
  $("ideas").innerHTML = ui.editing
    ? ""
    : IDEAS.map(([e, n], i) => (used.has(n) ? "" : `<button class="ls-chip is-small" type="button" data-idea="${i}">${e} ${esc(n)}</button>`)).join("");
  $("formHeading").textContent = ui.editing ? "✏️ 習慣を直す" : "➕ 習慣をふやす";
  $("saveBtn").textContent = ui.editing ? "✏️ 直す" : "＋ ふやす";
  $("cancelEdit").hidden = !ui.editing;
  $("saveBtn").disabled = !ui.editing && state.habits.length >= MAX_HABITS;

  $("manageList").innerHTML = state.habits.length
    ? `<p class="sub-title">📋 いまの習慣（${state.habits.length} / ${MAX_HABITS}）</p>` +
      state.habits
        .map(
          (h, i) => `<div class="manage${h.id === ui.editing ? " is-editing" : ""}">
          <button class="name" type="button" data-edit="${h.id}" aria-label="${esc(h.name)} を直す">${esc(h.emoji)} ${esc(h.name)}${h.link ? ` <small>${esc(LINKS[h.link].label)}</small>` : ""}</button>
          <button class="mini" type="button" data-move="${h.id}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="上へ">↑</button>
          <button class="mini" type="button" data-move="${h.id}" data-dir="1" ${i === state.habits.length - 1 ? "disabled" : ""} aria-label="下へ">↓</button>
          <button class="mini del" type="button" data-del="${h.id}" aria-label="${esc(h.name)} を消す">✕</button>
        </div>`
        )
        .join("") +
      '<p class="edit-hint">名前を押すと直せます</p>'
    : "";
}

(function fillLinks() {
  Object.entries(LINKS).forEach(([key, def]) => {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = def.label;
    $("link").append(o);
  });
})();

$("emojis").addEventListener("click", (e) => {
  const b = e.target.closest("[data-emoji]");
  if (!b) return;
  ui.emoji = b.dataset.emoji;
  renderForm();
});

$("ideas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-idea]");
  if (!b) return;
  const [emoji, name, link] = IDEAS[Number(b.dataset.idea)];
  $("name").value = name;
  $("link").value = link || "";
  ui.emoji = emoji;
  renderForm();
});

function clearForm() {
  $("name").value = "";
  $("link").value = "";
  ui.emoji = EMOJIS[0];
}

$("saveBtn").addEventListener("click", () => {
  const name = $("name").value.trim();
  if (!name) {
    say("つづけたいことを入れてください");
    $("name").focus();
    return;
  }
  const entry = { name, emoji: ui.emoji, link: $("link").value || null };
  if (ui.editing) {
    updateHabit(state, ui.editing, entry);
    ui.editing = null;
    say(`✏️ 「${name}」を直しました`);
  } else {
    if (state.habits.length >= MAX_HABITS) return say(`習慣は ${MAX_HABITS} こまでです`);
    addHabit(state, entry);
    say(`🌱 「${name}」をふやしました ↑`);
  }
  persist();
  clearForm();
  render();
});

$("cancelEdit").addEventListener("click", () => {
  ui.editing = null;
  clearForm();
  render();
});

$("manageList").addEventListener("click", (e) => {
  const edit = e.target.closest("[data-edit]");
  if (edit) {
    const h = state.habits.find((x) => x.id === edit.dataset.edit);
    ui.editing = h.id;
    ui.emoji = h.emoji;
    $("name").value = h.name;
    $("link").value = h.link || "";
    render();
    $("formHeading").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const mv = e.target.closest("[data-move]");
  if (mv) {
    moveHabit(state, mv.dataset.move, Number(mv.dataset.dir));
    persist();
    render();
    return;
  }
  const del = e.target.closest("[data-del]");
  if (!del) return;
  const trash = removeHabit(state, del.dataset.del);
  if (!trash) return;
  if (ui.editing === trash.habit.id) {
    ui.editing = null;
    clearForm();
  }
  persist();
  render();
  say(`🗑 「${trash.habit.name}」を消しました`, () => {
    restoreHabit(state, trash);
    persist();
    render();
  });
});

// ---- カレンダー ----
function renderCalendar() {
  if (!state.habits.length) {
    $("calHabits").innerHTML = "";
    $("calendar").innerHTML = "";
    $("calStats").innerHTML = '<div class="ls-empty">習慣をふやすと、ここにひと月の○が出ます</div>';
    $("monthLabel").textContent = "";
    return;
  }
  if (!state.habits.some((h) => h.id === ui.cal)) ui.cal = state.habits[0].id;
  const h = state.habits.find((x) => x.id === ui.cal);
  $("calHabits").innerHTML = state.habits
    .map((x) => `<button class="ls-chip is-small" type="button" aria-pressed="${x.id === ui.cal}" data-cal="${x.id}">${esc(x.emoji)} ${esc(x.name)}</button>`)
    .join("");
  const [y, m] = ui.month.split("-").map(Number);
  $("monthLabel").textContent = `${y}年${m}月`;
  const today = ymd();
  $("nextMonth").disabled = ui.month >= today.slice(0, 7);
  const d = daysOf(h);
  const cells = monthGrid(y, m);
  $("calendar").innerHTML = cells
    .map((date) => {
      if (!date) return '<span class="cell is-blank"></span>';
      const on = d.all.has(date);
      const auto = !d.own.has(date) && d.auto.has(date);
      const future = date > today;
      return `<button class="cell${on ? " is-on" : ""}${auto ? " is-auto" : ""}${date === today ? " is-today" : ""}" type="button" data-cal-day="${date}" ${future || auto ? "disabled" : ""} aria-pressed="${on}" aria-label="${label(date)}">${Number(date.slice(8))}</button>`;
    })
    .join("");
  const inMonth = cells.filter((c) => c && d.all.has(c)).length;
  const passed = cells.filter((c) => c && c <= today).length;
  $("calStats").innerHTML = `
    <div><span>この月</span><b>${inMonth}<small>日</small></b><em>${passed ? Math.round((inMonth / passed) * 100) : 0}%</em></div>
    <div><span>いま</span><b>${streak(d.all, today)}<small>日</small></b><em>つづいている</em></div>
    <div><span>いちばん</span><b>${best(d.all)}<small>日</small></b><em>つづいた</em></div>`;
}

$("calHabits").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cal]");
  if (!b) return;
  ui.cal = b.dataset.cal;
  renderCalendar();
});
$("calendar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cal-day]");
  if (!b || b.disabled) return;
  toggle(state, ui.cal, b.dataset.calDay);
  persist();
  render();
});
function shiftMonth(n) {
  const [y, m] = ui.month.split("-").map(Number);
  ui.month = ymd(new Date(y, m - 1 + n, 1)).slice(0, 7);
  renderCalendar();
}
$("prevMonth").addEventListener("click", () => shiftMonth(-1));
$("nextMonth").addEventListener("click", () => shiftMonth(1));

// ---- 控え ----
$("exportBtn").addEventListener("click", async () => {
  const file = new File([exportJson(state)], `tuzuq-${ymd()}.json`, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "つづくの記録の控え" });
    } catch {
      // やめたときは何もしない
    }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  say("⬇️ 控えを書き出しました");
});

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const added = importJson(state, await file.text());
    persist();
    render();
    say(`⬆️ 控えを読みこみました（習慣が ${added} こふえました）`);
  } catch {
    say("読みこめませんでした（つづくで書き出した控えか確かめてください）");
  }
});

$("resetBtn").addEventListener("click", async () => {
  const ok = window.LineShareUI?.ask
    ? await LineShareUI.ask({ title: "記録をすべて消しますか？", text: "この端末のつづくの習慣と○を、すべて消します。もとに戻せません。", ok: "すべて消す", danger: true })
    : confirm("記録をすべて消しますか？");
  if (!ok) return;
  state = reset();
  ui.editing = null;
  clearForm();
  render();
  say("記録をすべて消しました");
});

// ほかのタブ（しょくじなど）で記録が変わったら描きなおす
window.addEventListener("storage", (e) => {
  if (e.key === "tuzuq:v1") state = load();
  render();
});
// 日付をまたいで開きっぱなしでも、戻ってきたら今日に
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && render());

function render() {
  renderToday();
  renderForm();
  renderCalendar();
  $("editSummary").textContent = state.habits.length ? `習慣をふやす・直す（${state.habits.length}）` : "習慣をふやす・直す";
}

render();
