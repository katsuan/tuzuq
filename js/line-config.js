// LINE の中（LIFF）で開いたときに、記録ボット（LOgBOT）とつなぐための設定。
// どちらも画面に置く前提のもの（W10）。鍵・合言葉はここに置かない（本人の確かめは、そのつど LIFF の ID トークンで）。
// 空のあいだは、LINE の中で開いても今までどおり（端末の中だけ）。
//   liffId：LINE Developers の LIFF の ID（LOgBOT と同じプロバイダーの LINE ログインのチャネルに作る。scope は openid）
//   gasUrl：LOgBOT の入口の GAS のウェブアプリの URL（…/exec）
export const LINE_LOG = {
  liffId: "",
  gasUrl: ""
};
