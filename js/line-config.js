// LINE の中（LIFF）で開いたときに、記録ボット（自分の GAS）とつなぐための設定。
// LIFF の ID は画面に置く前提のもの（W10）。鍵・合言葉はここに置かない。
// つなぐ GAS の URL は、使う人がそれぞれ、つづくの設定に入れる（ここには置かない。秘密ではないが、人ごとにちがう）。
// 空のあいだは、LINE の中で開いても今までどおり（端末の中だけ）。
//   liffId：つづくの LIFF の ID（Q のプロバイダーの LINE ログインのチャネル。scope は openid と profile）
// 読まれるところ：app.js・js/card.js・js/linelog.js・js/link.js（テストは test/linelog.test.mjs）

export const LINE_LOG = {
  liffId: "2012187502-o87l8Esu"
};

// つづくを LINE の中（LIFF）で開く URL。カードのボタン・カレンダーの予定から開くときに使う（ブラウザで押しても、つづくが開く）
export const OPEN_URL = LINE_LOG.liffId ? `https://liff.line.me/${LINE_LOG.liffId}` : "https://katsuan.github.io/tuzuq/";
