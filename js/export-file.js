// つづく：ファイルを書き出す（画面の部品）。共有できる端末は共有メニュー、ほかはダウンロード
// 読まれるところ：app.js（控えの書き出し・カレンダーのお知らせの .ics）

// file を共有メニューかダウンロードで渡す。共有メニューを出したら true、ダウンロードなら false
export async function exportFile(file, shareTitle) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle });
    } catch {
      // やめたときは何もしない
    }
    return true;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return false;
}
