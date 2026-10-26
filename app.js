// つづく（TuZuQ）：画面の操作。記録はこの端末の中だけ（js/store.js）、計算は js/stats.js
// LINE の中（LIFF）で開いたときだけ、送る文のある習慣の○をくらぶボットにも入れる（js/linelog.js）
// 読まれるところ：index.html（画面の入口。部品は js/ から読む）
import { LINKS, MAX_HABITS, MAX_IMPORT_BYTES, oneMark, addHabit, isHabitId, applyBotDays, botDays, botHabits, confirmBotDay, rememberLinked, exportJson, importJson, linkedDays, linkedNote, load, moveHabit, moveHabitTo, orderToday, removeHabit, reset, restoreHabit, save, toggle, updateHabit } from "./js/store.js?v=202610261100";
import { cleanGasUrl, inLineApp, lineLogMessage, sendBox, startLineLog, statusSections, waitForBot, withinBotDays } from "./js/linelog.js?v=202610261100";
import { daysAgo, holdMs, watchLongPress } from "./js/long-press.js?v=202610261100";
import { habitIdFromUrl } from "./js/link.js?v=202610261100";
import { cardParams } from "./js/card.js?v=202610261100";
import { dragSort } from "./js/drag-sort.js?v=202610261100";
import { exportFile } from "./js/export-file.js?v=202610261100";
import { LINE_LOG, OPEN_URL } from "./js/line-config.js?v=202610261100";
import { googleRemindUrl, remindIcs } from "./js/remind.js?v=202610261100";
import { best, doneCount, fullStreak, label, lastDays, level, monthGrid, monthStats, streak, weekHeader, weekday, ymd } from "./js/stats.js?v=202610261100";

const $ = (id) => document.getElementById(id);
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

// 週のはじまりは Q ツール共通の設定（line-share/shared/week-start.js）を先に見る。まだないときは、つづくに残した値
// （共通の部品が読めないときも、つづくの値で動く）
const withSharedWeek = (s) => {
  if (window.QWeekStart) s.weekStart = window.QWeekStart.get(s.weekStart);
  return s;
};
let state = withSharedWeek(load());
const ui = {
  emoji: EMOJIS[0],
  editing: null, // 直している習慣の id
  cal: null, // カレンダーで見る習慣の id
  month: ymd().slice(0, 7), // "YYYY-MM"
  justDone: null, // ○をつけたばかりの「id:日付」（少し弾ませる）
  focus: null, // カレンダーの予定から開いて、光らせている習慣の id
  order: null // きょうの○の並び（id の列）。押すたびに行が動かないよう、開いたとき・並べ方を変えたときだけ決めなおす
};

// 文字を HTML に入れられる形にする（& < > " ' を置きかえる）
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// いまの記録を端末に残す。残せなかったら知らせる
function persist() {
  if (!save(state)) say("この端末に残せませんでした（プライベートブラウズでは、閉じると消えます）");
}

// 季節の絵文字をときどき文の後ろに（Q キットの season.js。まだ読めていなければ、そのまま）
const cheer = (text) => (window.QSeason ? window.QSeason.decorate(text) : text);

// 下に短い知らせを出す（undo があれば「元に戻す」ボタンつき）
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
// つないだツールの記録の日（Set）。同じ描き直しのあいだは覚えたものを返す
const linkedOf = (link) => linkedCache[link] || (linkedCache[link] = linkedDays(link, state));

// 習慣ごとの○の日（自分でつけた日＋つないだツールの記録の日＋くらぶボットで記録した日）
function daysOf(h) {
  const own = new Set(state.done[h.id] || []);
  const auto = new Set([...(h.link ? linkedOf(h.link) : []), ...botDays(state, h.id)]);
  return { own, auto, all: new Set([...own, ...auto]) };
}

// ---- くらぶボット（LINE の中で開いたときだけ） ----
let lineLog = null; // js/linelog.js の startLineLog の返事（つなげないときは null）
let me = null; // 見出しの右の本人のアイコン（shared/line-me.js。ブラウザ版では null）
const inLine = !!LINE_LOG.liffId && inLineApp(); // つなぎ先の欄は、LINE の中で開いたときだけ出す
const SEND_DELAY_MS = 5000; // ○のあと「元に戻す」を押せるあいだは送らない
const pending = new Map(); // 「習慣の id|日付」→ { id, date, text, timer }（まだ送っていないチェック）
// まだ送っていないチェックを見分ける名前（「習慣の id|日付」）
const pendKey = (id, date) => `${id}|${date}`;
let lastRead = 0;
// くらぶボットから読んだ、型のある習慣の日ごとの数字（{ 習慣の id: { unit, days: { "YYYY-MM-DD": 95 } } }）。
// 時間・距離・充電の％など（くらぶボットの「3つの型」）。端末には残さない（開くたびに読む）
let botValues = {};

// 数字を出す字にする（95 分 → 1時間35分・12.4 km・+20%）
function valueText(value, unit) {
  const v = Number(value) || 0;
  if (unit === "分") return v >= 60 ? `${Math.floor(v / 60)}時間${v % 60 ? `${Math.round(v % 60)}分` : ""}` : `${Math.round(v)}分`;
  if (unit === "%") return `${v > 0 ? "+" : ""}${v}%`;
  if (unit === "km") return `${v}km`;
  return `${v}${unit || ""}`;
}

// チェックをくらぶボットに送る予約をする（「元に戻す」を押せる5秒のあとに送る）
function queueSend(h, date) {
  const key = pendKey(h.id, date);
  cancelSend(key);
  pending.set(key, { id: h.id, date, text: h.lineText, timer: setTimeout(() => sendNow(key), SEND_DELAY_MS) });
}
// 送る予約を取りやめる
function cancelSend(key) {
  const p = pending.get(key);
  if (p) clearTimeout(p.timer);
  pending.delete(key);
}
// 予約したチェックをいまくらぶボットに送り、結果を知らせる（keepalive は閉じるとき）
async function sendNow(key, keepalive = false) {
  const p = pending.get(key);
  if (!p || !lineLog) return;
  cancelSend(key);
  const id = p.id;
  // 送れたとわかるまで箱に入れておく（閉じるときに送った分・電波がなかった分は、次に開いたときに送りなおす）
  outbox.put(key, { text: p.text, date: p.date });
  const res = await lineLog.record(p.text, p.date, keepalive);
  if (res.ok || !RETRY_ERRORS.has(res.error)) outbox.drop(key);
  me?.update();
  if (keepalive) return; // 閉じるところ。次に開いたときに読みなおす
  const h = state.habits.find((x) => x.id === id);
  if (res.ok) {
    if (h) confirmBotDay(state, id, res.date || p.date);
    persist();
    render();
    const day = p.date === ymd() ? "" : `${label(p.date)}の分として`;
    if (h) say(res.added ? `💬 「${h.name}」を${day}くらぶボットに入れました${res.github ? "（GitHub にも）" : ""}` : `💬 「${h.name}」は、もうくらぶボットに入っています`);
    return;
  }
  const again = h && (res.error === "net" || res.error === "fail");
  if (again && window.LineShareUI?.toast) {
    window.LineShareUI.toast(lineLogMessage(res.error), { actionLabel: "もう一度", onAction: () => (pending.set(key, { ...p, timer: 0 }), sendNow(key)), ms: 8000 });
  } else {
    say(lineLogMessage(res.error));
  }
}
// 送れなかった○の箱（js/linelog.js の sendBox。Q キットの shared/botlink.js の outbox）
const outbox = sendBox();
const RETRY_ERRORS = new Set(["net", "fail"]); // 送りなおせば入るかもしれない失敗
// 前に送れなかった○を送りなおす（つないだとき。7日前までの分だけ。だめならまた次に）
async function resendOutbox() {
  if (!lineLog) return;
  const today = ymd();
  for (const { id, item } of outbox.all()) {
    if (!item || !withinBotDays(item.date, today) || !item.text) {
      outbox.drop(id);
      continue;
    }
    const res = await lineLog.record(item.text, item.date);
    if (res.ok || !RETRY_ERRORS.has(res.error)) outbox.drop(id);
    if (!res.ok && RETRY_ERRORS.has(res.error)) break; // 電波がないあいだは、あとはまた次に
  }
  me?.update();
}
// 閉じる・ほかのアプリに切りかえるときは、待っている○をすぐ送る
function flushSends() {
  [...pending.keys()].forEach((key) => sendNow(key, true));
}

// くらぶボットで記録した日を読む（開いたとき・戻ってきたとき。1分に1回まで）
async function readBotDays(force = false) {
  if (!lineLog || (!force && Date.now() - lastRead < 60000)) return;
  const habits = botHabits(state);
  if (!habits.length) return;
  lastRead = Date.now();
  const res = await lineLog.days(habits.map((h) => h.lineText));
  if (!res.ok) {
    if (res.error === "auth") say("くらぶボットのチェックを読めませんでした。LINE で、つづくを開きなおしてね");
    else if (res.error === "claim" || res.error === "notyou") say(lineLogMessage(res.error));
    else if (res.error !== "off") say("くらぶボットのチェックを読めませんでした（電波のよい所で開きなおしてね）");
    return;
  }
  const nextValues = {};
  habits.forEach((h, i) => {
    const days = res.values && res.values[i];
    if (days && typeof days === "object" && Object.keys(days).length) nextValues[h.id] = { unit: String((res.units && res.units[i]) || ""), days };
  });
  const valuesChanged = JSON.stringify(nextValues) !== JSON.stringify(botValues);
  botValues = nextValues;
  if (applyBotDays(state, habits, res.days)) {
    persist();
    render();
  } else if (valuesChanged) {
    render();
  }
  sendLinkedToBot(habits);
}

// ほかのツール（しょくじ・キロっく）で記録した日を、くらぶボットにも入れる（つづくが仲介する）
// - 送る文を決めた、ツール連動の習慣だけ。今日から7日以内で、まだくらぶボットにない日を、1日ずつ
// - うまく送れなかった日は、開いているあいだは送りなおさない（次に開いたときにまた試す）
const linkedTried = new Set(); // 「習慣の id|日付」
// しょくじ・キロっくで記録した日のうち、まだくらぶボットにない日を送る
async function sendLinkedToBot(habits) {
  const today = ymd();
  for (const h of habits) {
    if (!h.link || !lineLog) continue;
    const bot = botDays(state, h.id);
    const days = [...linkedOf(h.link)].filter((d) => withinBotDays(d, today) && !bot.has(d) && !linkedTried.has(`${h.id}|${d}`)).sort();
    let added = 0;
    for (const d of days) {
      linkedTried.add(`${h.id}|${d}`);
      const res = await lineLog.record(h.lineText, d, false, linkedNote(h.link, d)); // キロっくなら、種目・重さ・回数も
      if (!res.ok) break; // 1つでもだめなら、この習慣はここまで
      confirmBotDay(state, h.id, res.date || d);
      if (res.added) added++;
    }
    if (days.length) {
      persist();
      render();
    }
    if (added) say(`💬 ${h.name}：${LINKS[h.link].name}（${LINKS[h.link].what}）の ${added}日分をくらぶボットに入れました`);
  }
}

// ○のボタンの見た目（is-on・is-auto・is-today・is-pop）
function dotClass(h, d, date, today) {
  const on = d.all.has(date);
  const auto = !d.own.has(date) && d.auto.has(date);
  return { on, auto, cls: `${on ? " is-on" : ""}${auto ? " is-auto" : ""}${date === today ? " is-today" : ""}${ui.justDone === `${h.id}:${date}` ? " is-pop" : ""}` };
}

// ---- きょうの○ ----
// まだ一度も○をつけていない人にだけ、1つ目の習慣の丸に「👆 押してね」の指を出す（1回押したら二度と出ない）
function neverChecked() {
  return !Object.values(state.done || {}).some((d) => d && d.length) && !Object.values(state.bot || {}).some((d) => d && d.length);
}

// きょうの○の、習慣1つぶんの HTML（名前・続いた日数・きょうの丸・この1週間の丸）
function habitHtml(h, today, week, tapHint = false) {
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
          <span class="habit-name"><b>${esc(h.name)}</b></span>
          <span class="habit-streak${n ? "" : " is-zero"}">${n ? `🔥${n}日` : "これから"}</span>
          ${botValues[h.id] && botValues[h.id].days[today] !== undefined ? `<small class="habit-value" title="くらぶボットで記録した、きょうの合計">きょう ${esc(valueText(botValues[h.id].days[today], botValues[h.id].unit))}</small>` : ""}
          <button class="check${now.on ? " is-on" : ""}${ui.justDone === `${h.id}:${today}` ? " is-pop" : ""}" type="button" data-toggle="${h.id}" data-date="${today}" ${now.auto ? "disabled" : ""} aria-pressed="${now.on}" aria-label="${esc(h.name)} きょう${now.on ? "できた" : "まだ"}">${now.on ? "✓" : ""}${tapHint && !now.on ? '<span class="tap-hint" aria-hidden="true">👆</span>' : ""}</button>
          ${h.link || (lineLog && h.lineText) ? `<span class="habit-tags">${h.link ? `<a class="auto-tag is-link" href="${esc(LINKS[h.link].url)}" aria-label="${esc(LINKS[h.link].name)}（${esc(LINKS[h.link].what)}）を開く。記録した日は自動でチェック">${esc(LINKS[h.link].name)}連動 ›</a>` : ""}${lineLog && h.lineText ? '<small class="auto-tag bot-tag" title="チェックするとくらぶボットにも記録します">ボット連動</small>' : ""}</span>` : ""}
        </div>
        <div class="dots" aria-label="この1週間">${dots}</div>
      </div>`;
}

// きょうの○（習慣の一覧・しぼりこみ・できた数・送るボタン）を描く
function renderToday(today) {
  $("todayHeading").textContent = `きょうの○ ${label(today)}`;
  $("progress").classList.remove("is-all");
  $("todayTools").hidden = state.habits.length < 2; // しぼりこみ・並べ方は2つから（0こにしたときも消す）
  if (!state.habits.length) {
    $("progress").textContent = "";
    // LINE の中で開いて習慣がないとき：ブラウザで使っていた記録は、ここには出ない（別のブラウザ）
    const moved = inLineApp() ? '<br><small>ブラウザ版で使っていた記録は、ここには出ません。ブラウザ版で「🔒 記録の控え」を書き出して、ここで読みこむとうつせます</small>' : "";
    // qcheck-ok: W1 moved は決まった文字だけ（IDEAS も esc）
    $("habitList").innerHTML = `<div class="ls-empty"><span class="ls-empty-icon" aria-hidden="true">🌱</span>まずは、つづけたいことを1つ。<br>押すとふえます（自分で決めるなら下の「➕ 習慣をふやす」）${moved}</div>
      <div class="ls-chips start-ideas">${IDEAS.slice(0, 6).map(([e, n], i) => `<button class="ls-chip is-small" type="button" data-quick="${i}">${e} ${esc(n)}</button>`).join("")}</div>`;
    $("sendArea").hidden = true;
    $("dotLegend").hidden = true;
    return;
  }
  const week = lastDays(today, 7);
  // その習慣がきょうできたか
  const isDone = (h) => daysOf(h).all.has(today);
  // 並び：習慣がふえた・へった・日がかわった・並べ方を変えたときだけ決めなおす
  const ids = state.habits.map((h) => h.id).join(",");
  if (!ui.order || ui.order.ids !== ids || ui.order.day !== today) {
    ui.order = { ids, day: today, list: orderToday(state.habits, state.view, isDone, (h) => streak(daysOf(h).all, today)) };
  }
  const shown = ui.order.list.map((id) => state.habits.find((h) => h.id === id)).filter(Boolean);
  const v = state.view || {};
  const todoCount = state.habits.filter((h) => !isDone(h)).length;
  const toolsHtml = `<div class="ls-chips today-filter" role="group" aria-label="しぼりこみ">${[
    ["all", `すべて ${state.habits.length}`],
    ["todo", `まだ ${todoCount}`],
    ["done", `できた ${state.habits.length - todoCount}`]
  ]
    .map(([k, t]) => `<button class="ls-chip is-small" type="button" data-filter="${k}" aria-pressed="${(v.filter || "all") === k}">${t}</button>`)
    .join("")}</div>
    <label class="today-sort"><span class="sr-only">並べ方</span><select id="todaySort">${[
      ["mine", "いつもの順"],
      ["todo", "まだを先に"],
      ["streak", "🔥 つづいている順"]
    ]
      .map(([k, t]) => `<option value="${k}"${(v.sort || "mine") === k ? " selected" : ""}>${t}</option>`)
      .join("")}</select></label>`;
  $("todayTools").innerHTML = toolsHtml; // qcheck-ok: W1 決まった文字と数だけ
  $("habitList").innerHTML = shown.length
    ? shown.map((h, i) => habitHtml(h, today, week, i === 0 && neverChecked())).join("")
    : `<div class="ls-empty">${v.filter === "todo" ? "🎉 まだの習慣はありません" : "まだ、できた習慣はありません"}<br><button class="ls-chip is-small" type="button" data-filter="all">すべてを見る</button></div>`;
  const doneToday = state.habits.length - todoCount;
  $("progress").innerHTML = `<b>${doneToday}</b> / ${state.habits.length}`; // qcheck-ok: W1 数だけ
  $("progress").classList.toggle("is-all", doneToday === state.habits.length);
  ui.justDone = null;
  $("sendArea").hidden = false;
  $("sendBtn").href = cardUrl(today);
  // ○の色の見本：自動の○（くらぶボット・ほかのツール）がつながっている習慣があるときだけ、オレンジの説明も
  $("dotLegend").hidden = false;
  $("legendAuto").hidden = !state.habits.some((h) => h.link || (lineLog && h.lineText) || botDays(state, h.id).size);
}

// きょうの○の並べ方・しぼりこみ（この端末に覚える）。同じものをもう一度押すと、いまの状態で並べなおす
function setView(next) {
  state.view = { ...(state.view || {}), ...next };
  ui.order = null;
  persist();
  render();
}
$("todayTools").addEventListener("click", (e) => {
  const f = e.target.closest("[data-filter]");
  if (f) setView({ filter: f.dataset.filter });
});
$("todayTools").addEventListener("change", (e) => {
  if (e.target.id === "todaySort") setView({ sort: e.target.value });
});

$("habitList").addEventListener("click", (e) => {
  const all = e.target.closest("[data-filter]");
  if (all) return setView({ filter: all.dataset.filter });
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

// おくるんのお知らせカード：きょうの○の一覧と、続いた日数（中身は js/card.js）
function cardUrl(today) {
  const params = cardParams(state.habits, (h) => {
    const d = daysOf(h);
    return { done: d.all.has(today), streak: streak(d.all, today) };
  }, today);
  return window.OQRN ? window.OQRN.cardUrl(params) : "#";
}

// ---- 習慣をふやす・直す ----
function renderForm() {
  // 送る文は、LINE の中でくらぶボット（自分の GAS）とつながっているときだけ（入れた文は、つながっていないときも残す）
  $("lineTextField").hidden = !lineLog;
  $("lineLogNote").hidden = !lineLog;
  $("gasField").hidden = !inLine;
  // [しるし][名前] のしるし。押すと選べる絵文字とカスタムが開く。カスタムで選んでいるときは、カスタムの欄が選んだ形
  $("emojiNow").textContent = ui.emoji;
  $("emojiBtn").setAttribute("aria-label", `しるしを選ぶ（いま：${ui.emoji}）`);
  $("emojis").innerHTML = EMOJIS.map((e) => `<button class="ls-picker-item" type="button" role="radio" aria-checked="${e === ui.emoji}" data-emoji="${e}">${e}</button>`).join("");
  const custom = !EMOJIS.includes(ui.emoji);
  $("emojiCustom").classList.toggle("is-selected", custom);
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
          (h, i) => `<div class="manage${h.id === ui.editing ? " is-editing" : ""}" data-row="${h.id}">
          <span class="grip" data-grip="${h.id}" title="引っぱって並べ替え" aria-hidden="true">⠿</span>
          <button class="name" type="button" data-edit="${h.id}" aria-label="${esc(h.name)} を直す">${esc(h.emoji)} ${esc(h.name)}${h.link ? `<small class="manage-sub">${esc(LINKS[h.link].label.split(" ")[0])} ${esc(LINKS[h.link].name)}と連動</small>` : ""}${h.lineText ? `<small class="manage-sub">💬 ${esc(h.lineText)}</small>` : ""}</button>
          <button class="mini" type="button" data-move="${h.id}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="上へ">↑</button>
          <button class="mini" type="button" data-move="${h.id}" data-dir="1" ${i === state.habits.length - 1 ? "disabled" : ""} aria-label="下へ">↓</button>
          <button class="mini del" type="button" data-del="${h.id}" aria-label="${esc(h.name)} を消す">✕</button>
        </div>`
        )
        .join("") +
      '<p class="edit-hint">名前を押すと直せます。⠿ を引っぱると並べ替え</p>'
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

// しるしを押したとき・名前を入れているあいだは、選べる絵文字を出す（Q キットの pickField）。選んだらたたむ（名前・カスタムを入れているあいだは開いたまま）
const emojiPick = window.LineShareUI?.pickField?.({ field: $("nameField"), button: $("emojiBtn"), input: $("name"), picker: $("emojiPicker") }) || null;
// Q キットが古い・読めないときは、押して開く・たたむだけ
if (!emojiPick) $("emojiBtn").addEventListener("click", () => ($("emojiPicker").hidden = !$("emojiPicker").hidden));
// 選べる絵文字を開く・たたむ
function openEmojiPicker(open) {
  if (emojiPick) return open ? emojiPick.open() : emojiPick.close();
  $("emojiPicker").hidden = !open;
}
$("emojis").addEventListener("click", (e) => {
  const b = e.target.closest("[data-emoji]");
  if (!b) return;
  ui.emoji = b.dataset.emoji;
  $("emojiCustom").value = "";
  if (document.activeElement !== $("name")) openEmojiPicker(false);
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

// 習慣をふやす・直す欄を空にもどす
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

// ⠿ を引っぱって並べ替え（js/drag-sort.js）
dragSort($("manageList"), (id, from, to) => {
  if (to !== from) {
    moveHabitTo(state, id, to);
    persist();
  }
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

// カレンダー（習慣ごと・「すべて」）と、この月のまとめを描く
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


$("calHabits").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cal]");
  if (!b) return;
  ui.cal = b.dataset.cal;
  renderCalendar(ymd());
});
$("calendar").addEventListener("click", (e) => {
  // 「🗓 すべて」の日：その日のようすを知らせる
  const all = e.target.closest("[data-cal-all]");
  if (all) {
    if (all.disabled) return;
    const date = all.dataset.calAll;
    const list = state.habits.map((h) => `${daysOf(h).all.has(date) ? "✅" : "⬜"} ${h.emoji}${h.name}`).join("　");
    return say(`${label(date)}　${list}`);
  }
  // 習慣ごとの日：つけ外し
  const b = e.target.closest("[data-cal-day]");
  if (!b || b.disabled || b.dataset.calDay > ymd()) return;
  if (holdMs(b.dataset.calDay, ymd()) && e.detail !== 0) return; // 前の日は長押し
  const h = state.habits.find((x) => x.id === ui.cal);
  if (h) applyToggle(h, b.dataset.calDay);
});

/**
 * チェックをつけ外しする（一覧・カレンダーで同じ）
 * - LINE の中で、送る文のある習慣なら、7日前まではくらぶボットにも入れる（5秒の「元に戻す」のあと）
 */
function applyToggle(h, date) {
  const today = ymd();
  const on = toggle(state, h.id, date);
  persist();
  if (on) ui.justDone = `${h.id}:${date}`;
  if (!on) {
    cancelSend(pendKey(h.id, date)); // 送る前に外したら、送らない
    outbox.drop(pendKey(h.id, date)); // 電波がなくて箱に入れていた分も
    me?.update();
  }
  render();
  if (!on) return;
  const n = streak(daysOf(h).all, today);
  const text = date === today ? cheer(n >= 2 ? `🔥 「${h.name}」${n}日つづいています` : `✅ 「${h.name}」できました`) : `✅ 「${h.name}」${label(date)}にチェックしました`;
  if (lineLog && h.lineText) {
    if (!withinBotDays(date, today)) return say(`${text}（8日より前は、この端末だけに残ります）`);
    queueSend(h, date);
    say(`${text}（くらぶボットにも入れます）`, () => {
      cancelSend(pendKey(h.id, date));
      if ((state.done[h.id] || []).includes(date)) toggle(state, h.id, date);
      persist();
      render();
    });
    return;
  }
  // LINE 版で、くらぶボットにつなぐ人なのに、いまつながっていない（電波がない・起こしている途中）：箱に入れて、つながったら送る
  if (waitForBot({ inLine, gasUrl: state.gasUrl, lineText: h.lineText, date, today })) {
    outbox.put(pendKey(h.id, date), { text: h.lineText, date });
    me?.update();
    return say(`${text}（つながったら、くらぶボットにも入れます）`);
  }
  if (date === today) say(text);
}

// ---- 前の日の長押し（一覧の7つの丸・カレンダーの日。js/long-press.js） ----
// 押しつづけると丸のまわりが満ちて、つけ外しする。途中で離したら、長押しのことを知らせる
watchLongPress({
  targetOf: (e) => e.target.closest("[data-toggle], [data-cal-day]"),
  dateOf: (el) => el.dataset.date || el.dataset.calDay,
  today: ymd,
  onFire: (el, date) => {
    const h = state.habits.find((x) => x.id === (el.dataset.toggle || ui.cal));
    if (h && date <= ymd()) applyToggle(h, date);
  },
  onShort: (date, ms) => say(`${daysAgo(date, ymd())}日前は、長押しでつけ外しします（${(ms / 1000).toFixed(1)}秒）`)
});
$("weekStart").addEventListener("click", (e) => {
  const b = e.target.closest("[data-week-start]");
  if (!b) return;
  state.weekStart = Number(b.dataset.weekStart) === 0 ? 0 : 1;
  window.QWeekStart?.set(state.weekStart); // ほかの Q ツールも同じ週のはじまりで開く
  persist();
  renderCalendar(ymd());
});
// カレンダーの月を n か月ずらして描きなおす
function shiftMonth(n) {
  const [y, m] = ui.month.split("-").map(Number);
  ui.month = ymd(new Date(y, m - 1 + n, 1)).slice(0, 7);
  renderCalendar(ymd());
}
$("prevMonth").addEventListener("click", () => shiftMonth(-1));
$("nextMonth").addEventListener("click", () => shiftMonth(1));

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
  if (!(await exportFile(file, "つづくのお知らせ"))) say("📥 カレンダーのファイルを書き出しました。開くとカレンダーに入ります");
});

// ---- 控え ----
$("exportBtn").addEventListener("click", async () => {
  const file = new File([exportJson(state)], `tuzuq-${ymd()}.json`, { type: "application/json" });
  if (!(await exportFile(file, "つづくの記録の控え"))) say("⬇️ 控えを書き出しました");
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
  // null：ほかのタブで全部消した。qlove:weekStart：ほかのツールで週のはじまりを変えた
  if (e.key === "tuzuq:v1" || e.key === null || e.key === "qlove:weekStart") state = withSharedWeek(load());
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

// 画面をまるごと描きなおす（つないだツールの日を覚えてから）
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

// ---- LINE 版で使う：ブラウザで開いたときの案内と、4コマ（最初だけ。閉じたら出さない。Q キットの shared/botlink.js の guide） ----
window.QBotLink?.guide({
  key: "tuzuq:lineBannerOff", // この端末で閉じたか（設定なので端末に残してよい）
  openUrl: OPEN_URL,
  say,
  closedText: "使い方の案内を閉じました（「⚙️ くらぶボットとつなぐ」からまた見られます）"
});

// 最初だけの使い方（Q キットの「💡 使い方」。「わかった」で消え、その端末では二度と出さない）
window.addEventListener("load", () =>
  window.LineShareUI?.firstTip?.(
    "tuzuq",
    [
      "できた習慣は、右の丸を押してチェック。下の7つの丸で、前の日もつけ外しできます",
      "記録はこのブラウザの中だけに残ります。ほかの端末へは「🔒 記録の控え」でうつせます",
      "「カードで送る」で、きょうできたことを家族や友だちに送れます"
    ],
    document.querySelector("main > section.ls-panel")
  )
);

// ---- くらぶボットとつなぐ（LINE の中の LIFF で開いたときだけ。ブラウザでは何もしない） ----
// つなぎ先を入れなおしたときも、ここからやりなおす
function connectLineLog() {
  const had = !!lineLog;
  lineLog = null;
  return startLineLog(state.gasUrl).then((client) => {
    // くらぶボットにつないでいる人が、LINE のアプリ内のブラウザ（LIFF ではない）で開いたときは、開きなおしを出す
    $("reopenInLiff").hidden = window.QBotLink ? window.QBotLink.reopenHidden({ client, url: state.gasUrl }) : true;
    // つながらないときは、前につながっていたときだけ描きなおす（開いたときの「その習慣を光らせる」を消さないように）
    if (!client) return had && render();
    lineLog = client;
    $("statusBox").hidden = false;
    $("whereNote").innerHTML = "📱 この版の記録は、ブラウザ版とは<b>別</b>です。<br>「ボット連動」の札がある習慣は、チェックするとくらぶボットにも届きます。"; // qcheck-ok: W1 決まった文字だけ
    $("whereNote").hidden = false;
    render();
    me?.update();
    resendOutbox().then(() => readBotDays(true));
  });
}
// ---- LINE 版の「わたし」：見出しの右に本人のアイコン。押すと、ログイン・くらぶボットとのつながり・まだ送っていない○（Q キットの shared/line-me.js） ----
me = window.QLineMe?.mount({
  liffId: LINE_LOG.liffId,
  botName: "くらぶボット",
  connected: () => !!lineLog,
  pending: () => outbox.all().length,
  // 電波がもどったとき・「いま送る」：つながっていれば箱の○を送り、まだならつなぎなおす（つなぐと箱の○も送る）
  retry: () => (lineLog ? resendOutbox() : connectLineLog()),
  onSettings: () => {
    $("lineFold").open = true;
    $("lineFold").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
connectLineLog();

// くらぶボットのいまの設定（見るだけ。字は textContent で入れる）
$("statusBtn").addEventListener("click", async () => {
  if (!lineLog) return;
  const btn = $("statusBtn");
  btn.disabled = true;
  btn.textContent = "読みこみ中…";
  const sections = statusSections(await lineLog.status());
  btn.disabled = false;
  btn.textContent = "🔎 くらぶボットのいまの設定を見る";
  const list = $("statusList");
  list.replaceChildren();
  if (!sections) {
    say("いまの設定を読めませんでした（電波のよい所で、もう一度）");
    return;
  }
  sections.forEach((sec) => {
    const box = document.createElement("div");
    box.className = "status-sec";
    const h = document.createElement("b");
    h.textContent = sec.title;
    box.append(h);
    sec.rows.forEach((r) => {
      const p = document.createElement("p");
      p.textContent = r;
      box.append(p);
    });
    list.append(box);
  });
  $("statusHint").hidden = false;
});

// つなぐ GAS の URL（自分で入れたものだけ。URL の ?〜 からは受けとらない）
$("gasUrl").value = state.gasUrl;
$("gasUrl").addEventListener("change", () => {
  const raw = $("gasUrl").value.trim();
  const url = cleanGasUrl(raw);
  $("gasUrlError").hidden = !raw || !!url;
  if (raw && !url) return;
  state.gasUrl = url;
  persist();
  say(url ? "💬 つなぎ先を決めました（LINE 版で使えます）" : "つなぎ先を消しました");
  connectLineLog();
});

// カレンダーの予定から開いたとき（?h=習慣の id）：その習慣まで動かして、少し光らせる。アドレスからは消す
(function focusFromLink() {
  const got = habitIdFromUrl(location.href, inLineApp()); // js/link.js
  if (!got) return;
  history.replaceState(null, "", got.clean);
  const id = got.id;
  const h = isHabitId(id) && state.habits.find((x) => x.id === id);
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
