#!/usr/bin/env python3
"""つづく（TsuduQ）のアイコン・ロゴ・OGP を作る。

名前は「つづく」。英字は TsuduQ（「つ・づ・く」の「く」を Q にする。おくるん＝OQRN・しょくじ＝ShoQuji と同じ作り方）。
アイコンはおくるんと同じ角の丸い四角に、青のグラデーション。
Q はカレンダーの○：白い輪の中にチェック、右下へのびるしっぽは「つづいていく」矢印。

  icon.svg・icon-32.png・apple-touch-icon.png・icon-512.png・icon-maskable-512.png … アイコン
  logo.svg … 横長のロゴ「TsuduQ」（Jua。Q はアイコンと同じ形）
  ogp.png  … 共有したときの画像（1200×630）

使い方: python3 tools/icon.py（となりのおくるん（q-oqrn）の tools/brandkit.py を使う）
"""
from pathlib import Path

import brandkit_path  # noqa: F401
from brandkit import Brand, arrow_head, centered, polar

ROOT = Path(__file__).resolve().parent.parent
BRAND = Brand(light=(110, 182, 255), dark=(47, 128, 216))

C = (46, 46)
R, RING_W = 24, 10
TAIL_END = polar(C, 45, 46)
SHAPES = [
    {"t": "ring", "c": C, "r": R, "w": RING_W},
    # チェック（輪の中）
    {"t": "line", "p": [(C[0] - 9, C[1] + 0.5), (C[0] - 2.5, C[1] + 7), (C[0] + 10, C[1] - 7)], "w": 6.4},
    # しっぽ：輪のふちから右下へのびる矢印（つづいていく）
    {"t": "line", "p": [polar(C, 45, R + 1), polar(C, 45, 40)], "w": 7},
    {"t": "poly", "p": arrow_head(TAIL_END, 45, 11, 15)},
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
    logo, ratio = BRAND.logo_svg("TsuduQ", SHAPES, C, RING_OUTER, "TsuduQ（つづく）")
    (ROOT / "logo.svg").write_text(logo, encoding="utf-8")
    BRAND.write_ogp(
        ROOT / "ogp.png", SHAPES, "つづく", "TsuduQ",
        ["できた日に○をつけるだけ", "記録はこの端末の中だけ"], decorate,
        copy="きょうの○が、あしたにつづく",
    )
    print(f"アイコン・logo.svg（高さ 28px なら幅 {28 * ratio:.0f}px）・ogp.png を書き出しました")


if __name__ == "__main__":
    main()
