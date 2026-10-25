// LINE の中（LIFF）で開いたときだけ、記録ボット（LOgBOT）とつなぐ
// - ○を押した習慣（送る文があるもの）を、ボットに1件記録する。開いたときに、ボットで記録した日を読む
// - ボットに送るのは LIFF の ID トークンだけ（だれかはボット側が LINE に確かめる）。トークンは端末に残さない（W7）
// - つなぐ先は、使う人が自分で入れた自分の GAS の URL だけ（URL の ?〜 からは受けとらない。W5・W9）
// - ブラウザで開いたとき・設定が空のときは何もしない（つづくは今までどおり端末の中だけ）
// - 約束（何を送り、何が返るか）は docs/linelog-api.md
// 読まれるところ：app.js・js/store.js（テストは test/linelog.test.mjs・test/store.test.mjs）
import { LINE_LOG } from "./line-config.js?v=202610251500";
import { addDays } from "./stats.js?v=202610251500";

// 記録ボットに入れられるのは、7日前まで（GAS の TUZUQ_BACK_DAYS_ と同じ）
export const BOT_BACK_DAYS = 7;
// その日のチェックを記録ボットに入れられるか（きょうから7日前まで）
export function withinBotDays(date, today) {
  if (!date || date > today) return false;
  return addDays(today, -BOT_BACK_DAYS) <= date;
}

// つなぐ・送るの中身は、Q キットの共通の部品（q-oqrn の shared/botlink.js。window.QBotLink）。ここはつづくの分だけ：
//   つなぎ先（自分で入れた URL が先。なければ、くらぶボットに「つづく」の機能があるときだけ）・送る中身（record・days・status）
const Q = () => globalThis.QBotLink;
const TOOL = "tuzuq";
// つなぐ GAS の URL の形（ちがえば ""）。共通の部品が読めなかったときも、入れてある URL を消さないよう同じ形で確かめる
const GAS = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,120}\/exec$/;
export const cleanGasUrl = (v) => (Q() ? Q().cleanUrl(v) : GAS.test(String(v ?? "").trim()) ? String(v).trim() : "");
// LINE のアプリの中か（ブラウザでは LIFF の SDK も読まない）
export const inLineApp = (ua) => (Q() ? Q().inLineApp(ua) : false);

/**
 * つなげるときは { record, days, status } を、つなげないときは null を返す
 * - LINE のアプリの中で、LIFF として開き、ログインしているときだけ
 * - 自分で入れた URL（記録ボット）には前の形（app: "tuzuq"・op）で、くらぶボットにはくらぶボットの形で送る
 */
export async function startLineLog(gasUrl, config = LINE_LOG) {
  const B = Q();
  const liffId = String(config?.liffId || "");
  if (!B || !liffId || !B.inLineApp()) return null;
  const to = await B.target({ own: gasUrl, tool: TOOL });
  if (!to) return null;
  const client = await B.start({ liffId, url: to.url, tool: TOOL, legacyApp: to.legacy ? TOOL : "" });
  return client ? ops(client) : null;
}

/**
 * 記録ボットへの呼び出し（テストでは fetch と ID トークンを差しかえる）
 * 返事は { ok, ... } か { ok: false, error }（error：auth・off・bad・day・many・fail・net）
 */
export function makeClient(gasUrl, getIdToken, fetchImpl, { legacy = true, liffId = LINE_LOG.liffId } = {}) {
  return ops(Q().makeClient(gasUrl, getIdToken, { tool: TOOL, liffId, legacyApp: legacy ? TOOL : "", fetch: fetchImpl }));
}

// つづくがボットに頼むこと
function ops(client) {
  return {
    // ○を押した習慣を、その日の分として記録する（note：つないだツールの中身。キロっくの種目など）
    record: (text, date, keepalive, note) => client.call("record", { text, date, ...(note ? { note } : {}) }, { keepalive }),
    // 習慣ごとの、ボットで記録した日
    days: (texts) => client.call("days", { texts }),
    // いまの設定（見るだけ）
    status: () => client.call("status", {})
  };
}

// 送れなかった○の箱（閉じるときに送ったもの・電波がなかったもの。次に開いたときに送りなおす。ID トークンは入れない）
export const sendBox = (opts) => (Q() ? Q().outbox("tuzuq:outbox", opts) : { put() {}, drop() {}, all: () => [] });

// 失敗したときに出す、やさしい言葉（E2：仕組みの言葉は出さない）
export function lineLogMessage(error) {
  if (error === "auth") return "記録ボットに入れられませんでした。LINE で、つづくを開きなおしてね";
  if (error === "day") return "記録ボットに入れられるのは、きょうのチェックだけです（このチェックは、この端末に残っています）";
  if (error === "off") return "記録ボットは、まだ準備中です（チェックはこの端末に残っています）";
  if (error === "claim") return "つなぎ先の GAS に、持ち主の登録を受けつけました。10分以内に、GAS エディタで adoptTuzuqOwner を実行してね";
  if (error === "notyou") return "つなぎ先の GAS の持ち主ではありません。つなぎ先の URL を確かめてね";
  return "記録ボットに入れられませんでした。チェックはこの端末に残っています";
}

// いまの設定の答えを、見出しと行の並びに（入口の GAS は sections、配布用シートの GAS は status だけ返す）
export function statusSections(res) {
  if (!res || res.ok !== true) return null;
  // 返事の文字を、300字までの文字にする
  const str = (v) => String(v ?? "").slice(0, 300);
  if (Array.isArray(res.sections)) {
    return res.sections
      .filter((x) => x && typeof x === "object")
      .slice(0, 8)
      .map((x) => ({ title: str(x.title), rows: (Array.isArray(x.rows) ? x.rows : []).slice(0, 10).map(str) }));
  }
  const st = res.status && typeof res.status === "object" ? res.status : null;
  if (!st) return null;
  const habits = Array.isArray(st.habits) ? st.habits.slice(0, 12).map(str) : [];
  return [
    { title: "✅ つづく", rows: [`持ち主：${st.tuzuqOwner ? "登録ずみ" : "まだ"}`, `送る文：${habits.length ? habits.join("・") : "まだ"}`] },
    { title: "🌱 GitHub", rows: [st.github ? "つながっています" : "つながっていません（つながなくても記録はできます）"] }
  ];
}
