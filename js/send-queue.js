// つづく：○をくらぶボットに送る予約（画面の部品はなし）
// - ○をつけたら、「元に戻す」を押せるあいだ（delayMs）は待ってから送る。そのあいだに外したら送らない
// - 送るときは、送れたとわかるまで箱（outbox）に入れておく。電波がなかった分は、次に開いたときに送りなおす
// - 閉じるとき（flush）は、待っている○をすぐ送る
// 読まれるところ：app.js（テストは test/send-queue.test.mjs）
import { RETRY_ERRORS } from "./linelog.js?v=202611012034";

// まだ送っていないチェックを見分ける名前（「習慣の id|日付」）
export const sendKey = (id, date) => `${id}|${date}`;

/**
 * 送る予約の入れもの
 * - ready()：いまくらぶボットにつながっているか。record(text, date, keepalive)：送る（{ ok, error, ... } を返す）
 * - onDone(key, item, res, keepalive)：送ったあと（うまくいっても、いかなくても）
 * - timers：setTimeout・clearTimeout（テストでは自分で進める）
 */
export function sendQueue({ delayMs, outbox, ready, record, onDone, timers = globalThis }) {
  const pending = new Map(); // key → { id, date, text, timer }（まだ送っていないチェック）
  const sending = new Set(); // いま送っている key（同じものを2回送らない）

  // 送る予約を取りやめる
  function cancel(key) {
    const p = pending.get(key);
    if (p) timers.clearTimeout(p.timer);
    pending.delete(key);
  }

  // 予約したチェックをいま送る（keepalive は閉じるとき）
  async function send(key, keepalive = false) {
    const p = pending.get(key);
    if (!p || !ready()) return;
    cancel(key);
    outbox.put(key, { text: p.text, date: p.date });
    if (sending.has(key)) return; // 箱から送りなおしている途中（それで入る）
    sending.add(key);
    // 閉じるときも送れるよう、record はすぐ（同じ流れの中で）呼ぶ
    let res;
    try {
      res = await record(p.text, p.date, keepalive);
    } catch {
      res = { ok: false, error: "net" };
    }
    sending.delete(key);
    if (res.ok || !RETRY_ERRORS.has(res.error)) outbox.drop(key);
    onDone(key, p, res, keepalive);
  }

  // チェックを送る予約をする（同じ日の予約があれば、入れなおす）
  function queue(id, date, text) {
    const key = sendKey(id, date);
    cancel(key);
    pending.set(key, { id, date, text, timer: timers.setTimeout(() => send(key), delayMs) });
    return key;
  }

  // 「もう一度」：送れなかったものを、すぐ送りなおす
  function retry(key, item) {
    pending.set(key, { ...item, timer: 0 });
    return send(key);
  }

  // 閉じる・ほかのアプリに切りかえるときは、待っている○をすぐ送る
  const flush = () => [...pending.keys()].forEach((key) => send(key, true));

  return { queue, cancel, send, retry, flush, sending, has: (key) => pending.has(key) };
}
