#!/usr/bin/env python3
"""つづく（TuzuQ）のアイコン・ロゴ・OGP を作る。

名前は「つづく」。英字は TuzuQ（「つ・づ・く」を tu・zu・Q と書き、「く」を Q にする。おくるん＝OQRN・しょくじ＝ShoQuji と同じ作り方）。
アイコンはおくるんと同じ角の丸い四角に、青のグラデーション。
Q はカレンダーの○：白い輪の中にチェック、しっぽは右下からのびて輪の中に○をつけにいく黄色い手（ふちなし・ひとまとまり）。

  icon.svg・icon-32.png・apple-touch-icon.png・icon-512.png・icon-maskable-512.png … アイコン
  logo.svg … 横長のロゴ「TZQ」（Jua。Q はアイコンと同じ形。名前の英字は TuzuQ のまま。
             ロゴだけ短く、おくるん（OQRN）と同じ大文字の並びに）
  ogp.png  … 共有したときの画像（1200×630）

使い方: python3 tools/icon.py（となりのおくるん（q-oqrn）の tools/brandkit.py を使う）
"""
from pathlib import Path

import brandkit_path  # noqa: F401
import math

from brandkit import Brand, centered, num, polar

ROOT = Path(__file__).resolve().parent.parent
BRAND = Brand(light=(110, 182, 255), dark=(47, 128, 216))

C = (44, 44)
R, RING_W = 23, 10
HAND = (255, 204, 77)  # 黄色の手（ふちなし・ひとまとまり）
TIP_DEPTH = 12  # 指先が輪のふちから中心へ入る深さ


def hand(tip, angle=45):
    """右下からのびて、指先 tip で輪の中を押す手。丸い端の太い線と丸を重ねて、ひとつの黄色い形にする。
    手の中の座標：y＝指先から手首へ（angle の向き）、x＝その直角（親指がわ）"""
    a = math.radians(angle)
    ux, uy = math.cos(a), math.sin(a)  # 手首への向き
    wx, wy = uy, -ux  # 直角
    def at(x, y):
        return (tip[0] + y * ux + x * wx, tip[1] + y * uy + x * wy)
    return [
        {"t": "line", "p": [at(0, 5.5), at(0, 20.5)], "w": 11, "fill": HAND},  # 指
        # こぶし：角の丸い四角（太い線で四角をなぞり、まん中を丸でうめる）
        {"t": "line", "p": [at(3, 24), at(8, 24), at(8, 28), at(3, 28), at(3, 24)], "w": 18, "fill": HAND},
        {"t": "circle", "c": at(5.5, 26), "r": 4, "fill": HAND},
        {"t": "circle", "c": at(-5.5, 25.5), "r": 5.5, "fill": HAND},  # 親指
    ]


SHAPES = [
    {"t": "ring", "c": C, "r": R, "w": RING_W},
    # チェック（輪の中）
    {"t": "line", "p": [(C[0] - 9, C[1] + 0.5), (C[0] - 2.5, C[1] + 7), (C[0] + 10, C[1] - 7)], "w": 6.4},
    # Q のしっぽ：右下から、輪の中に○をつけにいく手
    *hand(polar(C, 45, R - TIP_DEPTH)),
]
SHAPES, (_DX, _DY) = centered(SHAPES)
C = (C[0] + _DX, C[1] + _DY)
RING_OUTER = R + RING_W / 2


def decorate(d, s):
    """OGP の背景：うっすら○の並び（カレンダー）"""
    for i in range(7):
        x, y, r = 520 + i * 92, 560, 26
        a = 70 if i < 5 else 35
        d.ellipse(((x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s), outline=(255, 255, 255, a), width=6 * s)
        if i < 5:
            d.ellipse(((x - r + 9) * s, (y - r + 9) * s, (x + r - 9) * s, (y + r - 9) * s), fill=(255, 255, 255, 60))


def main():
    BRAND.write_icons(ROOT, SHAPES)
    logo, ratio = BRAND.logo_svg("TZQ", SHAPES, C, RING_OUTER, "TZQ（つづく）")
    (ROOT / "logo.svg").write_text(logo, encoding="utf-8")
    BRAND.write_ogp(
        ROOT / "ogp.png", SHAPES, "つづく", "TuzuQ",
        ["できた日に丸を押すだけ", "登録なしで、すぐ使える"], decorate,
        copy="きょうのできたが、あしたにつづく",
    )
    print(f"アイコン・logo.svg（高さ 28px なら幅 {28 * ratio:.0f}px）・ogp.png を書き出しました")


if __name__ == "__main__":
    main()
