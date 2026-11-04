// つづく：画面の HTML を組み立てる（文字を作るだけ。画面には触らない）
// - 習慣の名前・しるし・送る文など、使う人が入れた字は esc で置きかえてから入れる
// 読まれるところ：app.js（テストは test/view.test.mjs）
import { LINKS, MAX_HABITS } from "./store.js?v=202611012034";
import { valueText } from "./linelog.js?v=202611012034";
import { label, streak, weekday } from "./stats.js?v=202611012034";

// 文字を HTML に入れられる形にする（& < > " ' を置きかえる）
export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Q キットの線アイコン（ui.css の ls-icon）。ボタンの印は「線アイコン＋する言葉」（q-oqrn docs/ux.md G3・L4）
export const lsIcon = (name, cls = "") => `<span class="ls-icon${cls ? ` ${cls}` : ""}" data-icon="${name}" aria-hidden="true"></span>`;

/**
 * ○のボタンの見た目（is-on・is-auto・is-today・is-pop）
 * - d：その習慣の○の日（{ own, auto, all }）。pop：○をつけたばかりの「id:日付」（少し弾ませる）
 */
export function dotClass(h, d, date, today, pop = null) {
  const on = d.all.has(date);
  const auto = !d.own.has(date) && d.auto.has(date);
  return { on, auto, cls: `${on ? " is-on" : ""}${auto ? " is-auto" : ""}${date === today ? " is-today" : ""}${pop === `${h.id}:${date}` ? " is-pop" : ""}` };
}

/**
 * きょうの○の、習慣1つぶんの HTML（名前・続いた日数・札・この1週間の丸）
 * - d：○の日。week：この1週間の日付（古い順。いちばん右がきょう）
 * - tapHint：最初だけの「押してね」の指。pop：弾ませる「id:日付」。focus：光らせている習慣の id
 * - value：くらぶボットで記録した数字（{ unit, days }）。bot：くらぶボットにも入れる習慣か
 */
export function habitHtml(h, { d, today, week, tapHint = false, pop = null, focus = null, value = null, bot = false }) {
  const now = dotClass(h, d, today, today, pop);
  const n = streak(d.all, today);
  const dots = week
    .map((date) => {
      const x = dotClass(h, d, date, today, pop);
      // きょうの丸（いちばん右・大きめ）：押すだけでつけ外し。前の日は長押し
      const isToday = date === today;
      const name = isToday ? `${esc(h.name)} きょう${x.on ? "できた" : "まだ"}` : `${label(date)} ${x.on ? "○あり" : "○なし"}`;
      const hint = isToday && tapHint && !x.on ? '<span class="tap-hint" aria-hidden="true">👆</span>' : "";
      return `<button class="dot${x.cls}" type="button" data-toggle="${h.id}" data-date="${date}" ${x.auto ? "disabled" : ""} aria-pressed="${x.on}" aria-label="${name}"><span>${isToday ? "きょう" : weekday(date)}</span><i></i>${hint}</button>`;
    })
    .join("");
  const link = h.link && LINKS[h.link];
  return `<div class="habit${now.on ? " is-done" : ""}${focus === h.id ? " is-focus" : ""}" data-habit="${h.id}">
        <div class="habit-top">
          <span class="habit-emoji" aria-hidden="true">${esc(h.emoji)}</span>
          <span class="habit-name"><b>${esc(h.name)}</b></span>
          <span class="habit-streak${n ? "" : " is-zero"}">${n ? `🔥${n}日` : "これから"}</span>
          ${value && value.days[today] !== undefined ? `<small class="habit-value" title="くらぶボットで記録した、きょうの合計">きょう ${esc(valueText(value.days[today], value.unit))}</small>` : ""}
          ${link || bot ? `<span class="habit-tags">${link ? `<a class="auto-tag is-link" href="${esc(link.url)}" aria-label="${esc(link.name)}（${esc(link.what)}）を開く。記録した日は自動でチェック">${esc(link.name)}連動 ›</a>` : ""}${bot ? '<small class="auto-tag bot-tag" title="チェックするとくらぶボットにも記録します">ボット連動</small>' : ""}</span>` : ""}
        </div>
        <div class="dots" aria-label="この1週間">${dots}</div>
      </div>`;
}

// しぼりこみ（すべて・まだ・できた）と並べ方の部品（決まった文字と数だけ）
export function todayToolsHtml(v, total, todo) {
  const filters = [
    ["all", `すべて ${total}`],
    ["todo", `まだ ${todo}`],
    ["done", `できた ${total - todo}`]
  ];
  const sorts = [
    ["mine", "いつもの順"],
    ["todo", "まだを先に"],
    ["streak", "🔥 つづいている順"]
  ];
  return `<div class="ls-chips today-filter" role="group" aria-label="しぼりこみ">${filters
    .map(([k, t]) => `<button class="ls-chip is-small" type="button" data-filter="${k}" aria-pressed="${(v.filter || "all") === k}">${t}</button>`)
    .join("")}</div>
    <label class="today-sort"><span class="ls-sr-only">並べ方</span><select id="todaySort">${sorts
      .map(([k, t]) => `<option value="${k}"${(v.sort || "mine") === k ? " selected" : ""}>${t}</option>`)
      .join("")}</select></label>`;
}

// いまの習慣の一覧（⠿ で並べ替え・名前を押すと直す・上へ・下へ・消す）。editing：直している習慣の id
export function manageHtml(habits, editing = null) {
  if (!habits.length) return "";
  return (
    `<p class="sub-title">📋 いまの習慣（${habits.length} / ${MAX_HABITS}）</p>` +
    habits
      .map(
        (h, i) => `<div class="manage${h.id === editing ? " is-editing" : ""}" data-row="${h.id}">
          <span class="grip" data-grip="${h.id}" title="引っぱって並べ替え" aria-hidden="true">⠿</span>
          <button class="name" type="button" data-edit="${h.id}" aria-label="${esc(h.name)} を直す">${esc(h.emoji)} ${esc(h.name)}${h.link ? `<small class="manage-sub">${esc(LINKS[h.link].label.split(" ")[0])} ${esc(LINKS[h.link].name)}と連動</small>` : ""}${h.lineText ? `<small class="manage-sub">💬 ${esc(h.lineText)}</small>` : ""}</button>
          <button class="mini" type="button" data-move="${h.id}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="上へ">${lsIcon("down", "is-up")}</button>
          <button class="mini" type="button" data-move="${h.id}" data-dir="1" ${i === habits.length - 1 ? "disabled" : ""} aria-label="下へ">${lsIcon("down")}</button>
          <button class="mini del" type="button" data-del="${h.id}" aria-label="${esc(h.name)} を消す">${lsIcon("delete")}</button>
        </div>`
      )
      .join("") +
    '<p class="edit-hint">名前を押すと直せます。⠿ を引っぱると並べ替え</p>'
  );
}
