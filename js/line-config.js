// LINE の中（LIFF）で開いたときに、記録ボット（自分の GAS）とつなぐための設定。
// LIFF の ID は画面に置く前提のもの（W10）。鍵・合言葉はここに置かない。
// つなぐ GAS の URL は、使う人がそれぞれ、つづくの設定に入れる（ここには置かない。秘密ではないが、人ごとにちがう）。
// 空のあいだは、LINE の中で開いても今までどおり（端末の中だけ）。
//   liffId：つづくの LIFF の ID（Q のプロバイダーの LINE ログインのチャネル。scope は openid と profile）
export const LINE_LOG = {
  liffId: ""
};
