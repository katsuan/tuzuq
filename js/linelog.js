// LINE の中（LIFF）で開いたときだけ、記録ボット（LOgBOT）とつなぐ
// - ○を押した習慣（送る文があるもの）を、ボットに1件記録する。開いたときに、ボットで記録した日を読む
// - ボットに送るのは LIFF の ID トークンだけ（だれかはボット側が LINE に確かめる）。トークンは端末に残さない（W7）
// - つなぐ先は、使う人が自分で入れた自分の GAS の URL だけ（URL の ?〜 からは受けとらない。W5・W9）
// - ブラウザで開いたとき・設定が空のときは何もしない（つづくは今までどおり端末の中だけ）
// - 約束（何を送り、何が返るか）は docs/linelog-api.md
import { LINE_LOG } from "./line-config.js?v=202610242046";

const SDK = "https://static.line-scdn.net/liff/edge/2/sdk.js";
const TIMEOUT_MS = 15000;
const GAS = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,120}\/exec$/;
// つなぐ GAS の URL の形（ちがえば ""）
export const cleanGasUrl = (v) => (GAS.test(String(v ?? "").trim()) ? String(v).trim() : "");

// LINE のアプリの中か（ブラウザでは LIFF の SDK も読まない）
export const inLineApp = (ua = globalThis.navigator?.userAgent || "") => /\bLine\//i.test(ua);

function loadSdk() {
  if (window.liff) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK;
    s.charset = "utf-8";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("sdk"));
    document.head.append(s);
  });
}

/**
 * つなげるときは { record, days } を、つなげないときは null を返す
 * - LINE のアプリの中で、LIFF として開き、ログインしているときだけ
 */
export async function startLineLog(gasUrl, config = LINE_LOG) {
  const liffId = String(config?.liffId || "");
  if (!liffId || !cleanGasUrl(gasUrl) || !inLineApp()) return null;
  try {
    await loadSdk();
    await Promise.race([liff.init({ liffId }), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 10000))]);
    if (!liff.isInClient() || !liff.isLoggedIn()) return null;
  } catch (error) {
    console.error(error);
    return null;
  }
  return makeClient(gasUrl, () => {
    try {
      return liff.getIDToken() || "";
    } catch {
      return "";
    }
  });
}

/**
 * ボットへの呼び出し（テストでは fetch と ID トークンを差しかえる）
 * 返事は { ok, ... } か { ok: false, error }（error：auth・off・bad・day・many・fail・net）
 */
export function makeClient(gasUrl, getIdToken, fetchImpl = (...a) => fetch(...a)) {
  async function post(body, keepalive = false) {
    const idToken = getIdToken();
    if (!idToken) return { ok: false, error: "auth" };
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // text/plain なら、GAS に前もっての問い合わせ（preflight）がいらない
      const res = await fetchImpl(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ app: "tuzuq", v: 1, idToken, ...body }),
        keepalive,
        signal: ctrl?.signal
      });
      const json = await res.json();
      return json && typeof json === "object" ? json : { ok: false, error: "net" };
    } catch {
      return { ok: false, error: "net" };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return {
    record: (text, date, keepalive) => post({ op: "record", text, date }, keepalive),
    days: (texts) => post({ op: "days", texts })
  };
}

// 失敗したときに出す、やさしい言葉（E2：仕組みの言葉は出さない）
export function lineLogMessage(error) {
  if (error === "auth") return "記録ボットに入れられませんでした。LINE で、つづくを開きなおしてね";
  if (error === "day") return "記録ボットに入れられるのは、きょうのチェックだけです（このチェックは、この端末に残っています）";
  if (error === "off") return "記録ボットは、まだ準備中です（チェックはこの端末に残っています）";
  if (error === "claim") return "つなぎ先の GAS に、持ち主の登録を受けつけました。10分以内に、GAS エディタで adoptTuzuqOwner を実行してね";
  if (error === "notyou") return "つなぎ先の GAS の持ち主ではありません。つなぎ先の URL を確かめてね";
  return "記録ボットに入れられませんでした。チェックはこの端末に残っています";
}
