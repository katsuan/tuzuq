// つづく（TuzuQ）：画面の操作。記録はこの端末の中だけ（js/store.js）、計算は js/stats.js
import { LINKS, MAX_HABITS, MAX_IMPORT_BYTES, addHabit, cut, rememberLinked, exportJson, importJson, linkedDays, load, moveHabit, removeHabit, reset, restoreHabit, save, toggle, updateHabit } from "./js/store.js?v=202610240735";
import { googleRemindUrl, remindIcs } from "./js/remind.js?v=202610240735";
import { best, label, lastDays, monthGrid, monthStats, streak, weekHeader, weekday, ymd } from "./js/stats.js?v=202610240735";

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
  ["🍚", "しょくじを記録", "shoquji"],
  ["🏋️", "筋トレ（キロっく）", "kiloq"]
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

// つないだツールの記録の日（描くたびに1回だけ読む。render のはじめに空にする）
let linkedCache = {};
const linkedOf = (link) => linkedCache[link] || (linkedCache[link] = linkedDays(link, state));

// 習慣ごとの○の日（自分でつけた日＋つないだツールの記録の日）
function daysOf(h) {
  const own = new Set(state.done[h.id] || []);
  const auto = h.link ? linkedOf(h.link) : new Set();
  return { own, auto, all: new Set([...own, ...auto]) };
}

// ○のボタンの見た目（is-on・is-auto・is-today・is-pop）
function dotClass(h, d, date, today) {
  const on = d.all.has(date);
  const auto = !d.own.has(date) && d.auto.has(date);
  return { on, auto, cls: `${on ? " is-on" : ""}${auto ? " is-auto" : ""}${date === today ? " is-today" : ""}${ui.justDone === `${h.id}:${date}` ? " is-pop" : ""}` };
}

// ---- きょうの○ ----
function habitHtml(h, today, week) {
  const d = daysOf(h);
  const now = dotClass(h, d, today, today);
  const n = streak(d.all, today);
  const dots = week
    .map((date) => {
      const x = dotClass(h, d, date, today);
      return `<button class="dot${x.cls}" type="button" data-toggle="${h.id}" data-date="${date}" ${x.auto ? "disabled" : ""} aria-pressed="${x.on}" aria-label="${label(date)} ${x.on ? "○あり" : "○なし"}"><span>${weekday(date)}</span><i></i></button>`;
    })
    .join("");
  return `<div class="habit${now.on ? " is-done" : ""}" data-habit="${h.id}">
        <div class="habit-top">
          <span class="habit-emoji" aria-hidden="true">${esc(h.emoji)}</span>
          <span class="habit-name"><b>${esc(h.name)}</b>${h.link ? `<small class="auto-tag">${esc(LINKS[h.link].label.split(" ")[0])} 記録した日に自動で○</small>` : ""}</span>
          <span class="habit-streak${n ? "" : " is-zero"}">${n ? `🔥${n}日` : "これから"}</span>
          <button class="check${now.on ? " is-on" : ""}${ui.justDone === `${h.id}:${today}` ? " is-pop" : ""}" type="button" data-toggle="${h.id}" data-date="${today}" ${now.auto ? "disabled" : ""} aria-pressed="${now.on}" aria-label="${esc(h.name)} きょう${now.on ? "できた" : "まだ"}">${now.on ? "✓" : ""}</button>
        </div>
        <div class="dots" aria-label="この1週間">${dots}</div>
      </div>`;
}

function renderToday(today) {
  $("todayHeading").textContent = `きょうの○ ${label(today)}`;
  $("progress").classList.remove("is-all");
  if (!state.habits.length) {
    $("progress").textContent = "";
    $("habitList").innerHTML = `<div class="ls-empty"><span class="ls-empty-icon" aria-hidden="true">🌱</span>まずは、つづけたいことを1つ。<br>押すとふえます（自分で決めるなら下の「➕ 習慣をふやす」）</div>
      <div class="ls-chips start-ideas">${IDEAS.slice(0, 6).map(([e, n], i) => `<button class="ls-chip is-small" type="button" data-quick="${i}">${e} ${esc(n)}</button>`).join("")}</div>`;
    $("sendArea").hidden = true;
    return;
  }
  const week = lastDays(today, 7);
  $("habitList").innerHTML = state.habits.map((h) => habitHtml(h, today, week)).join("");
  const doneToday = state.habits.filter((h) => daysOf(h).all.has(today)).length;
  $("progress").innerHTML = `<b>${doneToday}</b> / ${state.habits.length}`; // qcheck-ok: W1 数だけ
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
  // 別のタブで消した習慣・日付をまたいだ古いボタンなら、描きなおすだけ
  if (!h || b.dataset.date > ymd()) return render();
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
  let done = 0;
  const lines = state.habits.map((h) => {
    const d = daysOf(h);
    const n = streak(d.all, today);
    if (d.all.has(today)) done++;
    return `${d.all.has(today) ? "○" : "・"} ${h.emoji} ${h.name}${n ? `（🔥${n}日）` : ""}`;
  });
  const params = new URLSearchParams({
    headerTitle: "✅ きょうの○",
    date: label(today),
    showDate: "true",
    title: done === state.habits.length ? `ぜんぶできた！ ${done} / ${done}` : `${done} / ${state.habits.length} できた`,
    detail: cut(lines.join("\n"), 300),
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

$("name").addEventListener("input", () => ($("nameError").hidden = true));

function clearForm() {
  $("nameError").hidden = true;
  $("name").value = "";
  $("link").value = "";
  ui.emoji = EMOJIS[0];
}

$("saveBtn").addEventListener("click", () => {
  const name = $("name").value.trim();
  $("nameError").hidden = !!name;
  if (!name) return $("name").focus();
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
// 週のはじまりの切りかえ（習慣がなくても、いまの設定を出す）
function renderWeekStart() {
  document.querySelectorAll("[data-week-start]").forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.weekStart) === state.weekStart)));
}

function renderCalendar(today) {
  renderWeekStart();
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
  $("nextMonth").disabled = ui.month >= today.slice(0, 7);
  const d = daysOf(h);
  $("calWeek").innerHTML = weekHeader(state.weekStart) // qcheck-ok: W1 決まった曜日の字だけ
    .map((w) => `<span class="${w.dow === 0 ? "is-sun" : w.dow === 6 ? "is-sat" : ""}">${w.label}</span>`)
    .join("");
  const cells = monthGrid(y, m, state.weekStart);
  $("calendar").innerHTML = cells
    .map((date) => {
      if (!date) return '<span class="cell is-blank"></span>';
      const x = dotClass(h, d, date, today);
      return `<button class="cell${x.cls}" type="button" data-cal-day="${date}" ${date > today || x.auto ? "disabled" : ""} aria-pressed="${x.on}" aria-label="${label(date)}">${Number(date.slice(8))}</button>`;
    })
    .join("");
  // 割合は、習慣をはじめた日（それより前に○があれば、その日）から
  const since = [ymd(new Date(h.at)), ...d.all].sort()[0];
  const month = monthStats(cells, d.all, today, since);
  $("calStats").innerHTML = `
    <div><span>この月</span><b>${month.count}<small>日</small></b><em>${month.rate}%</em></div>
    <div><span>いま</span><b>${streak(d.all, today)}<small>日</small></b><em>つづいている</em></div>
    <div><span>いちばん</span><b>${best(d.all)}<small>日</small></b><em>つづいた</em></div>`;
}

$("calHabits").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cal]");
  if (!b) return;
  ui.cal = b.dataset.cal;
  renderCalendar(ymd());
});
$("calendar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cal-day]");
  if (!b || b.disabled || b.dataset.calDay > ymd()) return;
  toggle(state, ui.cal, b.dataset.calDay);
  persist();
  render();
});
$("weekStart").addEventListener("click", (e) => {
  const b = e.target.closest("[data-week-start]");
  if (!b) return;
  state.weekStart = Number(b.dataset.weekStart) === 0 ? 0 : 1;
  persist();
  renderCalendar(ymd());
});
function shiftMonth(n) {
  const [y, m] = ui.month.split("-").map(Number);
  ui.month = ymd(new Date(y, m - 1 + n, 1)).slice(0, 7);
  renderCalendar(ymd());
}
$("prevMonth").addEventListener("click", () => shiftMonth(-1));
$("nextMonth").addEventListener("click", () => shiftMonth(1));

// ファイルを渡す：共有できる端末は共有メニュー、ほかはダウンロード。共有したら true
async function handOver(file, shareTitle) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle });
    } catch {
      // やめたときは何もしない
    }
    return true;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return false;
}

// ---- カレンダーでお知らせ ----
function renderRemind() {
  $("remindAt").value = state.remindAt;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  // qcheck-ok: W1 名前・絵文字は esc、URL は URLSearchParams で作ったもの
  $("remindList").innerHTML = state.habits.length
    ? state.habits
        .map(
          (h) => `<div class="manage remind-row"><span class="name">${esc(h.emoji)} ${esc(h.name)}</span>
          <a class="ls-chip is-small" href="${esc(googleRemindUrl(h, state.remindAt, ymd(), tz))}" target="_blank" rel="noopener" aria-label="${esc(h.name)} を Google カレンダーに入れる">Google</a></div>`
        )
        .join("")
    : '<p class="ls-hint">習慣をふやすと、ここからカレンダーに入れられます。</p>';
  $("remindIcs").disabled = !state.habits.length;
}
$("remindAt").addEventListener("change", () => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test($("remindAt").value)) return;
  state.remindAt = $("remindAt").value;
  persist();
  renderRemind();
});
$("remindIcs").addEventListener("click", async () => {
  const file = new File([remindIcs(state.habits, state.remindAt, ymd())], "tuzuq-remind.ics", { type: "text/calendar" });
  if (!(await handOver(file, "つづくのお知らせ"))) say("📥 カレンダーのファイルを書き出しました。開くとカレンダーに入ります");
});

// ---- 控え ----
$("exportBtn").addEventListener("click", async () => {
  const file = new File([exportJson(state)], `tuzuq-${ymd()}.json`, { type: "application/json" });
  if (!(await handOver(file, "つづくの記録の控え"))) say("⬇️ 控えを書き出しました");
});

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) return say("ファイルが大きすぎます（つづくで書き出した控えか確かめてください）");
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
  // 確かめの窓（Q キット）がまだ読みこめていなければ、消さない（ブラウザの小窓は使わない）
  if (!window.LineShareUI?.ask) return say("少し待ってから、もう一度押してください");
  const ok = await LineShareUI.ask({ title: "記録をすべて消しますか？", text: "この端末のつづくの習慣と○を、すべて消します。もとに戻せません。", ok: "すべて消す", danger: true });
  if (!ok) return;
  state = reset(state.weekStart);
  ui.editing = null;
  clearForm();
  render();
  say("記録をすべて消しました");
});

// ほかのタブ（しょくじなど）で記録が変わったら描きなおす
window.addEventListener("storage", (e) => {
  if (e.key === "tuzuq:v1" || e.key === null) state = load(); // null：ほかのタブで全部消した
  // キロっく・しょくじの記録が変わったときも、下の render で読みなおして覚える
  render();
});
// 日付をまたいで開きっぱなしでも、今日に（戻ってきたとき・開いたまま0時をこえたとき）
let shownDay = "";
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && render());
setInterval(() => ymd() !== shownDay && render(), 30000);

function render() {
  renderRemind();
  // つないだツールの記録から読んだ日を覚えておく（もとのツールが古い記録を消しても○が残る）
  if (rememberLinked(state)) persist();
  linkedCache = {};
  const today = (shownDay = ymd());
  renderToday(today);
  renderForm();
  renderCalendar(today);
  $("editSummary").textContent = state.habits.length ? `習慣をふやす・直す（${state.habits.length}）` : "習慣をふやす・直す";
}

render();

// カレンダーの予定から開いたとき（?h=習慣の id）：その習慣まで動かして、少し光らせる。アドレスからは消す
(function focusFromLink() {
  const url = new URL(location.href);
  const id = url.searchParams.get("h");
  if (!url.searchParams.has("h")) return;
  url.searchParams.delete("h");
  history.replaceState(null, "", url);
  const h = /^[a-z0-9]{4,24}$/.test(id || "") && state.habits.find((x) => x.id === id);
  if (!h) return say("この端末には、その習慣がありません（ほかの端末で作った習慣かもしれません）");
  const card = document.querySelector(`.habit[data-habit="${h.id}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("is-focus");
  setTimeout(() => card.classList.remove("is-focus"), 2600);
  if (!daysOf(h).all.has(ymd())) say(`「${h.name}」できたら、右の○を押してね`);
})();
