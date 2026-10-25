// つづく：前の日のつけ外しは長押し（誤って押さないように）。前の日ほど長く
//   きょう 0（ふつうに押す）・きのう 0.5秒・2〜3日前 0.8秒・4〜7日前 1.2秒・それより前 1.5秒
// 読まれるところ：app.js（テストは test/store.test.mjs）
import { addDays } from "./stats.js?v=202610251110";

// 何日前か（きょうは 0。未来・形がちがうときも 0）
export function daysAgo(date, today) {
  if (!date || date >= today) return 0;
  let back = 0;
  for (let d = date; d < today && back < 400; d = addDays(d, 1)) back++;
  return back;
}

// 長押しの長さ（ミリ秒）。きょう・未来は 0（長押しにしない）
export function holdMs(date, today) {
  if (!date || date >= today) return 0;
  const back = daysAgo(date, today);
  if (back <= 1) return 500;
  if (back <= 3) return 800;
  if (back <= 7) return 1200;
  return 1500;
}

/**
 * 長押しを見はる（画面の部品）。押しつづけると丸のまわりが満ちて onFire、途中で離したら onShort
 * - targetOf(e)：押した所から、長押しの的（ボタン）を返す。dateOf(el)：その日付
 * - 的には、長押しのあいだ is-holding と --hold（長さ）を付ける
 */
export function watchLongPress({ targetOf, dateOf, today, onFire, onShort }) {
  let hold = null; // { el, timer }
  // 長押しを終える（fired が false なら、途中で離したので onShort）
  const stop = (fired) => {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold.el.classList.remove("is-holding");
    if (!fired) {
      const date = dateOf(hold.el);
      onShort(date, holdMs(date, today()));
    }
    hold = null;
  };
  document.addEventListener("pointerdown", (e) => {
    const el = targetOf(e);
    if (!el || el.disabled) return;
    const ms = holdMs(dateOf(el), today());
    if (!ms) return;
    stop(true);
    el.style.setProperty("--hold", `${ms}ms`);
    el.classList.add("is-holding");
    hold = {
      el,
      timer: setTimeout(() => {
        stop(true);
        onFire(el, dateOf(el));
      }, ms)
    };
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) =>
    document.addEventListener(
      type,
      (e) => {
        if (hold && (type !== "pointerleave" || e.target === hold.el)) stop(false);
      },
      true
    )
  );
  // 長押しで出るメニュー（コピー・画像を保存など）を出さない
  document.addEventListener("contextmenu", (e) => targetOf(e) && e.preventDefault());
}
