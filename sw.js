// 電波がなくても、一度開いたページは開けるようにする（中身は ConneQt 共通の oqrn/shared/sw-core.js）
// 読まれるところ：index.html の最後で登録する
self.CONNEQT_TOOL = "tuzuq";
importScripts("/oqrn/shared/sw-core.js");
