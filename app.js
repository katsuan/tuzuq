// つづく（TuzuQ）：画面の操作。記録はこの端末の中だけ（js/store.js）、計算は js/stats.js
// LINE の中（LIFF）で開いたときだけ、送る文のある習慣の○を記録ボットにも入れる（js/linelog.js）
import { LINKS, MAX_HABITS, MAX_IMPORT_BYTES, oneMark, addHabit, applyBotDays, botDays, botHabits, confirmBotDay, cut, rememberLinked, exportJson, importJson, linkedDays, load, moveHabit, removeHabit, reset, restoreHabit, save, toggle, updateHabit } from "./js/store.js?v=202610242038";
import { cleanGasUrl, inLineApp, lineLogMessage, startLineLog } from "./js/linelog.js?v=202610242038";
import { daysAgo, holdMs, withinBotDays } from "./js/hold.js?v=202610242038";
import { LINE_LOG, OPEN_URL } from "./js/line-config.js?v=202610242038";
import { googleRemindUrl, remindIcs } from "./js/remind.js?v=202610242038";
import { best, doneCount, fullStreak, label, lastDays, level, monthGrid, monthStats, streak, weekHeader, weekday, ymd } from "./js/stats.js?v=202610242038";

const $ = (id) => document.getElementById(id);
// カードの「✅ つづくでチェックする」で開く先は、LINE の中のつづく（OPEN_URL。js/line-config.js）
const CARD_COLOR = "#2F80D8"; // ロゴの青
// しるしの候補：6列×3段の18個（どの端末でも6列にそろえる。style.css の .emojis）
const EMOJIS = ["✅", "💧", "🚶", "🏃", "📖", "🧘", "🦷", "💊", "📓", "🛏️", "☀️", "🥗", "🎹", "📚", "🌱", "🧹", "💪", "🍚"];
const IDEAS = [
  ["💧", "水を2L飲む"],
  ["🚶", "8000歩あるく"],
  ["📖", "本を10ページ"],
  ["🧘", "ストレッチ"],
  ["🦷", "フロス"],
  ["📓", "日記を書く"],
  ["🛏️", "0時までに寝る"],
  ["🍚", "食事を記録", "shoquji"],
  ["🏋️", "筋トレ", "kiloq"]
];

let state = load();
const ui = {
  emoji: EMOJIS[0],
  editing: null, // 直している習慣の id
  cal: null, // カレンダーで見る習慣の id
  month: ymd().slice(0, 7), // "YYYY-MM"
  justDone: null, // ○をつけたばかりの「id:日付」（少し弾ませる）
  focus: null // カレンダーの予定から開いて、光らせている習慣の id
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

// 習慣ごとの○の日（自分でつけた日＋つないだツールの記録の日＋記録ボットで記録した日）
function daysOf(h) {
  const own = new Set(state.done[h.id] || []);
  const auto = new Set([...(h.link ? linkedOf(h.link) : []), ...botDays(state, h.id)]);
  return { own, auto, all: new Set([...own, ...auto]) };
}

// ---- 記録ボット（LINE の中で開いたときだけ） ----
let lineLog = null; // js/linelog.js の startLineLog の返事（つなげないときは null）
const inLine = !!LINE_LOG.liffId && inLineApp(); // つなぎ先の欄は、LINE の中で開いたときだけ出す
const SEND_DELAY_MS = 5000; // ○のあと「元に戻す」を押せるあいだは送らない
const pending = new Map(); // 「習慣の id|日付」→ { id, date, text, timer }（まだ送っていないチェック）
const pendKey = (id, date) => `${id}|${date}`;
let lastRead = 0;

function queueSend(h, date) {
  const key = pendKey(h.id, date);
  cancelSend(key);
  pending.set(key, { id: h.id, date, text: h.lineText, timer: setTimeout(() => sendNow(key), SEND_DELAY_MS) });
}
function cancelSend(key) {
  const p = pending.get(key);
  if (p) clearTimeout(p.timer);
  pending.delete(key);
}
async function sendNow(key, keepalive = false) {
  const p = pending.get(key);
  if (!p || !lineLog) return;
  cancelSend(key);
  const id = p.id;
  const res = await lineLog.record(p.text, p.date, keepalive);
  if (keepalive) return; // 閉じるところ。次に開いたときに読みなおす
  const h = state.habits.find((x) => x.id === id);
  if (res.ok) {
    if (h) confirmBotDay(state, id, res.date || p.date);
    persist();
    render();
    const day = p.date === ymd() ? "" : `${label(p.date)}の分として`;
    if (h) say(res.added ? `💬 「${h.name}」を${day}記録ボットに入れました${res.github ? "（GitHub にも）" : ""}` : `💬 「${h.name}」は、もう記録ボットに入っています`);
    return;
  }
  const again = h && (res.error === "net" || res.error === "fail");
  if (again && window.LineShareUI?.toast) {
    window.LineShareUI.toast(lineLogMessage(res.error), { actionLabel: "もう一度", onAction: () => (pending.set(key, { ...p, timer: 0 }), sendNow(key)), ms: 8000 });
  } else {
    say(lineLogMessage(res.error));
  }
}
// 閉じる・ほかのアプリに切りかえるときは、待っている○をすぐ送る
function flushSends() {
  [...pending.keys()].forEach((key) => sendNow(key, true));
}

// 記録ボットで記録した日を読む（開いたとき・戻ってきたとき。1分に1回まで）
async function readBotDays(force = false) {
  if (!lineLog || (!force && Date.now() - lastRead < 60000)) return;
  const habits = botHabits(state);
  if (!habits.length) return;
  lastRead = Date.now();
  const res = await lineLog.days(habits.map((h) => h.lineText));
  if (!res.ok) {
    if (res.error === "auth") say("記録ボットのチェックを読めませんでした。LINE で、つづくを開きなおしてね");
    else if (res.error === "claim" || res.error === "notyou") say(lineLogMessage(res.error));
    else if (res.error !== "off") say("記録ボットのチェックを読めませんでした（電波のよい所で開きなおしてね）");
    return;
  }
  if (applyBotDays(state, habits, res.days)) {
    persist();
    render();
  }
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
  return `<div class="habit${now.on ? " is-done" : ""}${ui.focus === h.id ? " is-focus" : ""}" data-habit="${h.id}">
        <div class="habit-top">
          <span class="habit-emoji" aria-hidden="true">${esc(h.emoji)}</span>
          <span class="habit-name"><b>${esc(h.name)}</b>${h.link ? `<a class="auto-tag is-link" href="${esc(LINKS[h.link].url)}" aria-label="${esc(LINKS[h.link].name)}（${esc(LINKS[h.link].what)}）を開く。記録した日は自動でチェック">${esc(LINKS[h.link].label.split(" ")[0])} ${esc(LINKS[h.link].name)}（${esc(LINKS[h.link].what)}）と連動 ›</a>` : ""}${lineLog && h.lineText ? '<small class="auto-tag bot-tag">💬 記録ボットと連動</small>' : ""}</span>
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
    // LINE の中で開いて習慣がないとき：ブラウザで使っていた記録は、ここには出ない（別のブラウザ）
    const moved = inLineApp() ? '<br><small>ブラウザで使っていた記録は、ここには出ません（LINE の中は別のブラウザ）。ブラウザで「🔒 記録の控え」を書き出して、ここで読みこむとうつせます</small>' : "";
    // qcheck-ok: W1 moved は決まった文字だけ（IDEAS も esc）
    $("habitList").innerHTML = `<div class="ls-empty"><span class="ls-empty-icon" aria-hidden="true">🌱</span>まずは、つづけたいことを1つ。<br>押すとふえます（自分で決めるなら下の「➕ 習慣をふやす」）${moved}</div>
      <div class="ls-chips start-ideas">${IDEAS.slice(0, 6).map(([e, n], i) => `<button class="ls-chip is-small" type="button" data-quick="${i}">${e} ${esc(n)}</button>`).join("")}</div>`;
    $("sendArea").hidden = true;
    $("dotLegend").hidden = true;
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
  // ○の色の見本：自動の○（記録ボット・ほかのツール）がつながっている習慣があるときだけ、オレンジの説明も
  $("dotLegend").hidden = false;
  $("legendAuto").hidden = !state.habits.some((h) => h.link || (lineLog && h.lineText) || botDays(state, h.id).size);
}

$("habitList").addEventListener("click", (e) => {
  const quick = e.target.closest("[data-quick]");
  if (quick) {
    const [emoji, name, link] = IDEAS[Number(quick.dataset.quick)];
    addHabit(state, { name, emoji, link });
    persist();
    render();
    say(`🌱 「${name}」をふやしました。できたら右の丸を押してね`);
    return;
  }
  const b = e.target.closest("[data-toggle]");
  if (!b || b.disabled) return;
  const h = state.habits.find((x) => x.id === b.dataset.toggle);
  // 別のタブで消した習慣・日付をまたいだ古いボタンなら、描きなおすだけ
  if (!h || b.dataset.date > ymd()) return render();
  // 前の日は長押し（指・マウスで押したとき）。キーボード（Enter）では、そのままつけ外し
  if (holdMs(b.dataset.date, ymd()) && e.detail !== 0) return;
  applyToggle(h, b.dataset.date);
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
    actionLabel: "✅ つづくでチェックする",
    actionUrl: OPEN_URL, // LINE の中のつづく（おくるんの config.js の trustedLiffIds に登録ずみ。チャネルを公開すると、だれでも開ける）
    from: "tuzuq"
  });
  return window.OQRN ? window.OQRN.cardUrl(params) : "#";
}

// ---- 習慣をふやす・直す ----
function renderForm() {
  // 送る文は、LINE の中で記録ボット（自分の GAS）とつながっているときだけ（入れた文は、つながっていないときも残す）
  $("lineTextField").hidden = !lineLog;
  $("lineLogNote").hidden = !lineLog;
  $("gasField").hidden = !inLine;
  // [しるし][名前] のしるし。押すと選べる絵文字とカスタムが開く。カスタムで選んでいるときは、カスタムの欄が選んだ形
  $("emojiNow").textContent = ui.emoji;
  $("emojiBtn").setAttribute("aria-label", `しるしを選ぶ（いま：${ui.emoji}）`);
  $("emojis").innerHTML = EMOJIS.map((e) => `<button class="ls-chip emoji" type="button" role="radio" aria-checked="${e === ui.emoji}" data-emoji="${e}">${e}</button>`).join("");
  const custom = !EMOJIS.includes(ui.emoji);
  $("emojiCustom").classList.toggle("is-on", custom);
  if (custom && document.activeElement !== $("emojiCustom")) $("emojiCustom").value = ui.emoji;
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

// しるしを押すと開く（もう一度押すとたたむ）。選んだらたたむ（カスタムは打っているあいだ開いたまま）
function openEmojiPicker(open) {
  $("emojiPicker").hidden = !open;
  $("emojiBtn").setAttribute("aria-expanded", String(open));
}
$("emojiBtn").addEventListener("click", () => openEmojiPicker($("emojiPicker").hidden));
$("emojis").addEventListener("click", (e) => {
  const b = e.target.closest("[data-emoji]");
  if (!b) return;
  ui.emoji = b.dataset.emoji;
  $("emojiCustom").value = "";
  openEmojiPicker(false);
  renderForm();
});

$("ideas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-idea]");
  if (!b) return;
  const [emoji, name, link] = IDEAS[Number(b.dataset.idea)];
  $("name").value = name;
  $("link").value = link || "";
  ui.emoji = emoji;
  $("emojiCustom").value = "";
  renderForm();
});

$("name").addEventListener("input", () => ($("nameError").hidden = true));

// カスタム：入れた文字の1つめ（絵文字1つ）を、しるしにする。押しただけでも、前に入れたものを選ぶ
$("emojiCustom").addEventListener("input", () => {
  const mark = oneMark($("emojiCustom").value);
  if ($("emojiCustom").value && $("emojiCustom").value !== mark) $("emojiCustom").value = mark;
  if (!mark) return;
  ui.emoji = mark;
  renderForm();
});
$("emojiCustom").addEventListener("focus", () => {
  const mark = oneMark($("emojiCustom").value);
  if (mark && mark !== ui.emoji) {
    ui.emoji = mark;
    renderForm();
  }
});
$("emojiCustom").addEventListener("keydown", (e) => e.key === "Enter" && openEmojiPicker(false));

function clearForm() {
  $("nameError").hidden = true;
  $("name").value = "";
  $("link").value = "";
  $("lineText").value = "";
  $("emojiCustom").value = "";
  openEmojiPicker(false);
  ui.emoji = EMOJIS[0];
}



$("saveBtn").addEventListener("click", () => {
  const name = $("name").value.trim();
  $("nameError").hidden = !!name;
  if (!name) return $("name").focus();
  const entry = { name, emoji: ui.emoji, link: $("link").value || null, lineText: $("lineText").value.trim() };
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
  if (entry.lineText) readBotDays(true);
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
    $("emojiCustom").value = "";
    $("name").value = h.name;
    $("link").value = h.link || "";
    $("lineText").value = h.lineText || "";
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
    $("calStats").innerHTML = '<div class="ls-empty">習慣をふやすと、ここにひと月のチェックが出ます</div>';
    $("monthLabel").textContent = "";
    return;
  }
  // 先頭の「🗓 すべて」は、習慣を重ねて見る（ui.cal = "all"）
  if (ui.cal !== "all" && !state.habits.some((h) => h.id === ui.cal)) ui.cal = state.habits[0].id;
  $("calHabits").innerHTML =
    `<button class="ls-chip is-small" type="button" aria-pressed="${ui.cal === "all"}" data-cal="all">🗓 すべて</button>` +
    state.habits
      .map((x) => `<button class="ls-chip is-small" type="button" aria-pressed="${x.id === ui.cal}" data-cal="${x.id}">${esc(x.emoji)} ${esc(x.name)}</button>`)
      .join("");
  const [y, m] = ui.month.split("-").map(Number);
  $("monthLabel").textContent = `${y}年${m}月`;
  $("nextMonth").disabled = ui.month >= today.slice(0, 7);
  $("calWeek").innerHTML = weekHeader(state.weekStart) // qcheck-ok: W1 決まった曜日の字だけ
    .map((w) => `<span class="${w.dow === 0 ? "is-sun" : w.dow === 6 ? "is-sat" : ""}">${w.label}</span>`)
    .join("");
  const cells = monthGrid(y, m, state.weekStart);
  if (ui.cal === "all") return renderCalendarAll(cells, today);
  const h = state.habits.find((x) => x.id === ui.cal);
  const d = daysOf(h);
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

// 「🗓 すべて」：日ごとに、できた習慣の数を色の濃さで（全部できた日がいちばん濃い）。日を押すと、その日のようす
function renderCalendarAll(cells, today) {
  const sets = state.habits.map((h) => daysOf(h).all);
  const n = sets.length;
  $("calendar").innerHTML = cells
    .map((date) => {
      if (!date) return '<span class="cell is-blank"></span>';
      const c = doneCount(sets, date);
      const lv = level(c, n);
      return `<button class="cell lv-${lv}${date === today ? " is-today" : ""}" type="button" data-cal-all="${date}" ${date > today ? "disabled" : ""} aria-label="${label(date)} ${c}/${n}">${Number(date.slice(8))}</button>`;
    })
    .join("");
  const days = cells.filter((d) => d && d <= today);
  const full = days.filter((d) => doneCount(sets, d) === n).length;
  const some = days.filter((d) => doneCount(sets, d) > 0).length;
  $("calStats").innerHTML = `
    <div><span>この月</span><b>${full}<small>日</small></b><em>全部できた</em></div>
    <div><span>この月</span><b>${some}<small>日</small></b><em>1つ以上</em></div>
    <div><span>いま</span><b>${fullStreak(sets, today)}<small>日</small></b><em>全部つづき</em></div>`;
}

$("calendar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cal-all]");
  if (!b || b.disabled) return;
  const date = b.dataset.calAll;
  const list = state.habits.map((h) => `${daysOf(h).all.has(date) ? "✅" : "⬜"} ${h.emoji}${h.name}`).join("　");
  say(`${label(date)}　${list}`);
});

$("calHabits").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cal]");
  if (!b) return;
  ui.cal = b.dataset.cal;
  renderCalendar(ymd());
});
$("calendar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cal-day]");
  if (!b || b.disabled || b.dataset.calDay > ymd()) return;
  if (holdMs(b.dataset.calDay, ymd()) && e.detail !== 0) return; // 前の日は長押し
  const h = state.habits.find((x) => x.id === ui.cal);
  if (h) applyToggle(h, b.dataset.calDay);
});

/**
 * チェックをつけ外しする（一覧・カレンダーで同じ）
 * - LINE の中で、送る文のある習慣なら、7日前までは記録ボットにも入れる（5秒の「元に戻す」のあと）
 */
function applyToggle(h, date) {
  const today = ymd();
  const on = toggle(state, h.id, date);
  persist();
  if (on) ui.justDone = `${h.id}:${date}`;
  if (!on) cancelSend(pendKey(h.id, date)); // 送る前に外したら、送らない
  render();
  if (!on) return;
  const n = streak(daysOf(h).all, today);
  const text = date === today ? (n >= 2 ? `🔥 「${h.name}」${n}日つづいています` : `✅ 「${h.name}」できました`) : `✅ 「${h.name}」${label(date)}にチェックしました`;
  if (lineLog && h.lineText) {
    if (!withinBotDays(date, today)) return say(`${text}（8日より前は、この端末だけに残ります）`);
    queueSend(h, date);
    say(`${text}（記録ボットにも入れます）`, () => {
      cancelSend(pendKey(h.id, date));
      if ((state.done[h.id] || []).includes(date)) toggle(state, h.id, date);
      persist();
      render();
    });
    return;
  }
  if (date === today) say(text);
}

// ---- 前の日の長押し（一覧の7つの丸・カレンダーの日） ----
// 押しつづけると丸のまわりが満ちて、つけ外しする。途中で離したら何もしない
(function holdToToggle() {
  let hold = null; // { el, timer }
  const targetOf = (e) => e.target.closest("[data-toggle], [data-cal-day]");
  const dateOf = (el) => el.dataset.date || el.dataset.calDay;
  const stop = (fired) => {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold.el.classList.remove("is-holding");
    if (!fired) {
      const date = dateOf(hold.el);
      const ms = holdMs(date, ymd());
      say(`${daysAgo(date, ymd())}日前は、長押しでつけ外しします（${(ms / 1000).toFixed(1)}秒）`);
    }
    hold = null;
  };
  document.addEventListener("pointerdown", (e) => {
    const el = targetOf(e);
    if (!el || el.disabled) return;
    const ms = holdMs(dateOf(el), ymd());
    if (!ms) return;
    stop(true);
    el.style.setProperty("--hold", `${ms}ms`);
    el.classList.add("is-holding");
    hold = {
      el,
      timer: setTimeout(() => {
        const h = state.habits.find((x) => x.id === (el.dataset.toggle || ui.cal));
        const date = dateOf(el);
        stop(true);
        if (h && date <= ymd()) applyToggle(h, date);
      }, ms),
    };
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) =>
    document.addEventListener(type, (e) => {
      if (hold && (type !== "pointerleave" || e.target === hold.el)) stop(false);
    }, true)
  );
  // 長押しで出るメニュー（コピー・画像を保存など）を出さない
  document.addEventListener("contextmenu", (e) => targetOf(e) && e.preventDefault());
})();
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
  const ok = await LineShareUI.ask({ title: "記録をすべて消しますか？", text: "この端末のつづくの習慣とチェックを、すべて消します。もとに戻せません。", ok: "すべて消す", danger: true });
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
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    render();
    readBotDays();
  } else {
    flushSends();
  }
});
window.addEventListener("pagehide", flushSends);
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

// LINE の中（LIFF）で開いたときだけ、記録ボットとつなぐ（ブラウザでは何もしない）
// ---- LINE で使う：ブラウザで開いたときの案内の帯と、4コマ（最初だけ。閉じたら出さない） ----
const BANNER_KEY = "tuzuq:lineBannerOff"; // この端末で閉じたか（設定なので端末に残してよい）
(function lineGuide() {
  const inLine = inLineApp();
  let off = false;
  try {
    off = localStorage.getItem(BANNER_KEY) === "1";
  } catch {
    off = false;
  }
  const show = (open) => {
    $("lineGuidePanel").hidden = inLine || !open;
  };
  show(!off);
  // 「LINEで開く」は、おくるんの共通の案内に（読みこめなければ、ふつうのリンク）
  if (!inLine) {
    const shown = window.LineShareLiff?.outsideHelp?.($("lineOutside"), { appUrl: () => OPEN_URL, canLogin: false });
    if (!shown) $("lineOutside").innerHTML = `<a class="ls-button line is-block" href="${esc(OPEN_URL)}">💬 LINEで開く</a>`;
  }
  const remember = (value) => {
    try {
      if (value) localStorage.setItem(BANNER_KEY, "1");
      else localStorage.removeItem(BANNER_KEY);
    } catch {
      // 残せなくても、いまは閉じる・開く
    }
  };
  document.querySelectorAll("[data-close-line-guide]").forEach((b) =>
    b.addEventListener("click", () => {
      show(false);
      remember(true);
      say("LINE の案内を閉じました（「⚙️ LINE とつなぐ」からまた見られます）");
    })
  );
  document.querySelectorAll("[data-show-line-guide]").forEach((b) =>
    b.addEventListener("click", () => {
      remember(false);
      show(true);
      $("lineGuidePanel").hidden = false; // LINE の中でも見られるように
      $("lineGuidePanel").scrollIntoView({ behavior: "smooth", block: "start" });
    })
  );
})();

// 最初だけの使い方（Q キットの「💡 使い方」。「わかった」で消え、その端末では二度と出さない）
window.addEventListener("load", () =>
  window.LineShareUI?.firstTip?.(
    "tuzuq",
    [
      "できた習慣は、右の丸を押してチェック。下の7つの丸で、前の日もつけ外しできます",
      "記録はこのブラウザの中だけに残ります。ほかの端末・LINE の中へは「🔒 記録の控え」でうつせます",
      "GitHub や LINE は、つながなくても使えます（LINE で開くと、カードで送れて、記録ボットにも残せます）"
    ],
    document.querySelector("main > section.ls-panel")
  )
);

// つなぎ先を入れなおしたときも、ここからやりなおす
function connectLineLog() {
  const had = !!lineLog;
  lineLog = null;
  return startLineLog(state.gasUrl).then((client) => {
    // つながらないときは、前につながっていたときだけ描きなおす（開いたときの「その習慣を光らせる」を消さないように）
    if (!client) return had && render();
    lineLog = client;
    $("whereNote").innerHTML = "📱 いまは LINE の中。習慣とチェックは<b>この LINE の中だけ</b>に残ります（ブラウザとは別）。送る文のある習慣は、記録ボットにも入ります。"; // qcheck-ok: W1 決まった文字だけ
    $("whereNote").hidden = false;
    render();
    readBotDays(true);
  });
}
connectLineLog();

// つなぐ GAS の URL（自分で入れたものだけ。URL の ?〜 からは受けとらない）
$("gasUrl").value = state.gasUrl;
$("gasUrl").addEventListener("change", () => {
  const raw = $("gasUrl").value.trim();
  const url = cleanGasUrl(raw);
  $("gasUrlError").hidden = !raw || !!url;
  if (raw && !url) return;
  state.gasUrl = url;
  persist();
  say(url ? "💬 つなぎ先を決めました（LINE の中で開くと使えます）" : "つなぎ先を消しました");
  connectLineLog();
});

// カレンダーの予定から開いたとき（?h=習慣の id）：その習慣まで動かして、少し光らせる。アドレスからは消す
(function focusFromLink() {
  const url = new URL(location.href);
  // LINE の中で開くリンク（liff.line.me/…?h=）をブラウザで押したときは、liff.state に入って届く。LINE の中では LIFF が ?h= に戻してくれる
  let id = url.searchParams.get("h");
  if (!url.searchParams.has("h") && !inLineApp()) {
    try {
      id = new URLSearchParams(String(url.searchParams.get("liff.state") || "").replace(/^[^?]*\?/, "")).get("h");
    } catch {
      id = null;
    }
    if (!id) return;
  } else if (!url.searchParams.has("h")) return;
  url.searchParams.delete("h");
  if (!inLineApp()) url.searchParams.delete("liff.state");
  history.replaceState(null, "", url);
  const h = /^[a-z0-9]{4,24}$/.test(id || "") && state.habits.find((x) => x.id === id);
  if (!h) return say("この端末には、その習慣がありません（ほかの端末で作った習慣かもしれません）");
  const card = document.querySelector(`.habit[data-habit="${h.id}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  // 描きなおしても消えないように、光らせている習慣を覚えておく（habitHtml が is-focus を付ける）
  ui.focus = h.id;
  card.classList.add("is-focus");
  setTimeout(() => {
    ui.focus = null;
    document.querySelector(`.habit[data-habit="${h.id}"]`)?.classList.remove("is-focus");
  }, 2600);
  if (!daysOf(h).all.has(ymd())) say(`「${h.name}」できたら、右の丸を押してね`);
})();
