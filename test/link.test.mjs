// つづく：URL の受け渡し（js/link.js）のテスト
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { habitIdFromUrl, habitUrl, PAGE_URL } from "../js/link.js";

test("開いたアドレスの ?h= から習慣の id を読み、印を消したアドレスも返す", () => {
  assert.deepEqual(habitIdFromUrl("https://katsuan.github.io/tuzuq/?h=abcd1234&x=1"), { id: "abcd1234", clean: "https://katsuan.github.io/tuzuq/?x=1" });
  assert.equal(habitIdFromUrl("https://katsuan.github.io/tuzuq/"), null);
});

test("ブラウザで LINE 版のリンクを押したときは liff.state の中の ?h= を読む。LINE 版では読まない", () => {
  const href = "https://katsuan.github.io/tuzuq/?liff.state=%2F%3Fh%3Dabcd1234";
  assert.deepEqual(habitIdFromUrl(href), { id: "abcd1234", clean: "https://katsuan.github.io/tuzuq/" });
  assert.equal(habitIdFromUrl(href, true), null);
  assert.equal(habitIdFromUrl("https://katsuan.github.io/tuzuq/?liff.state=%2F%3Fx%3D1"), null);
  // LINE 版では ?h= を読み、liff.state は残す
  assert.deepEqual(habitIdFromUrl("https://katsuan.github.io/tuzuq/?h=abcd1234&liff.state=x", true), { id: "abcd1234", clean: "https://katsuan.github.io/tuzuq/?liff.state=x" });
});

test("予定から開くリンクと、読みとりが往復する", () => {
  const url = habitUrl({ id: "abcd1234" });
  assert.ok(url.startsWith(PAGE_URL));
  assert.equal(habitIdFromUrl(url).id, "abcd1234");
});
