// 電波がなくても、一度開いたページは開けるようにする（中身は ConneQt 共通の line-share/shared/sw-core.js）
// 読まれるところ：index.html の最後で登録する
self.CONNEQT_TOOL = "tuzuq";
importScripts("/line-share/shared/sw-core.js");
