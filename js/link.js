// つづく：URL の受け渡し（カレンダーの予定・カードから、その習慣を開くリンク）
// 読まれるところ：app.js・js/remind.js（テストは test/link.test.mjs・test/remind.test.mjs）
import { OPEN_URL } from "./line-config.js?v=202610291710";

// 予定・カードから開くのは LINE 版（LIFF）。くらぶボットとつないでいれば、そのまま○がくらぶボットにも入る
export const PAGE_URL = OPEN_URL;

// 予定から開くリンク：?h=習慣の id で、開いたらその習慣を目立たせる
export const habitUrl = (h) => `${PAGE_URL}?h=${encodeURIComponent(h.id)}`;

/**
 * 開いたアドレスから、目立たせる習慣の id を読む。なければ null
 * - LINE 版で開くリンク（liff.line.me/…?h=）をブラウザで押したときは、liff.state に入って届く（LINE 版では LIFF が ?h= に戻す）
 * - clean は、印（h・ブラウザでは liff.state も）を消したアドレス（history.replaceState に使う）
 */
export function habitIdFromUrl(href, inLine = false) {
  const url = new URL(href);
  let id = url.searchParams.get("h");
  if (!url.searchParams.has("h")) {
    if (inLine) return null;
    try {
      id = new URLSearchParams(String(url.searchParams.get("liff.state") || "").replace(/^[^?]*\?/, "")).get("h");
    } catch {
      id = null;
    }
    if (!id) return null;
  }
  url.searchParams.delete("h");
  if (!inLine) url.searchParams.delete("liff.state");
  return { id: id || "", clean: url.toString() };
}
