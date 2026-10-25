// tuzuq：使い心地の決まり（q-oqrn/docs/ux.md）を、ファイルの中身で確かめるテスト（画面は開かない）
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("最初だけの使い方（firstTip）は3つまで。中の言葉（くらぶボット・GitHub・GAS・LIFF）を使わない（B3・G5）", () => {
  const m = read("app.js").match(/firstTip\?\.\(\s*"tuzuq",\s*\[([\s\S]*?)\]/);
  assert.ok(m, "firstTip がある");
  const steps = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(steps.length >= 1 && steps.length <= 3, String(steps.length));
  steps.forEach((s) => assert.doesNotMatch(s, /くらぶボット|GitHub|GAS|LIFF|LINE/, s));
});

test("小さな丸のボタンも、押せる広さは 44px 以上（34px ＋ まわり 5px。C3）", () => {
  const css = read("style.css");
  assert.match(css, /\.mini[^{]*\{[^}]*width: 34px/);
  assert.match(css, /\.mini::after[^{]*\{[^}]*inset: -5px/);
});
