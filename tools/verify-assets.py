#!/usr/bin/env python3
"""
Sanity-check the generated assets without eyeballs.

Three things have actually gone wrong here before, so they are asserted:
  1. Menlo has no Braille block - the flower silently became .notdef boxes.
  2. A frame can render but be static (bloom never animates).
  3. Quantised GIFs shift the background colour, so "pixel != BG" is not a
     reliable ink test - the modal colour is used instead.

Usage: python3 tools/verify-assets.py
"""
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("mk", ROOT / "tools" / "make-assets.py")
mk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mk)

SGR = re.compile(r"\x1b\[[0-9;]*m")
FAILURES = []


def check(label, ok, detail=""):
    print(f"{'  ok  ' if ok else 'FAIL  '}{label}{f' — {detail}' if detail else ''}")
    if not ok:
        FAILURES.append(label)


def chars_in_frames():
    data = json.loads((ROOT / "tools" / "frames.json").read_text())
    out = set()
    for frame in data["frames"]:
        for line in frame["lines"]:
            out |= set(SGR.sub("", line))
    return data, out


def flower_box(cell_w, cell_h, pad, header):
    return (pad + 5 * cell_w, pad + header + 3 * cell_h, pad + 21 * cell_w, pad + header + 9 * cell_h)


def ink(image, box):
    """(width, pixels) of non-background ink. Background = modal colour."""
    crop = image.crop(box).convert("RGB")
    colors = crop.getcolors(maxcolors=1 << 22) or [(1, (0, 0, 0))]
    bg = max(colors)[1]
    px = crop.load()
    xs = 0
    ink_px = 0
    lo, hi = crop.width, -1
    for y in range(crop.height):
        for x in range(crop.width):
            if px[x, y] != bg:
                ink_px += 1
                lo = min(lo, x)
                hi = max(hi, x)
    return (hi - lo + 1) if hi >= 0 else 0, ink_px


def main():
    data, chars = chars_in_frames()

    # 1. every glyph resolves to a font that really has it
    missing = []
    for ch in sorted(chars):
        if ch.isspace():
            continue
        for bold in (False, True):
            font, _ = mk.pick_font(ch, bold)
            if not mk._has_glyph(font, ch):
                missing.append((ch, hex(ord(ch)), bold))
    check(f"{len(chars)} 个字符全部有字形（无豆腐块）", not missing, str(missing[:4]))

    box = flower_box(mk.CELL_W, mk.CELL_H, mk.PAD, mk.HEADER_H)

    # 2. the hero stills really differ
    cw, cn = ink(Image.open(ROOT / "assets" / "contract.png"), box)
    rw, rn = ink(Image.open(ROOT / "assets" / "relax.png"), box)
    check(
        f"收缩/放松两态花明显不同（宽 {cw}→{rw}px，墨迹 {cn}→{rn}px）",
        cw > 0 and rw > cw * 1.5 and rn > cn * 1.8,
    )

    # 3. the GIF animates, with intermediate frames rather than a hard snap
    gif = Image.open(ROOT / "assets" / "demo.gif")
    widths = []
    for index in range(gif.n_frames):
        gif.seek(index)
        widths.append(ink(gif.copy(), box)[0])
    uniq = sorted(set(widths))
    mid = [w for w in widths if uniq[0] < w < uniq[-1]]
    check(f"GIF {gif.n_frames} 帧确实在呼吸（宽度 {uniq[0]}..{uniq[-1]}px）", len(uniq) >= 3, f"{len(uniq)} 种宽度")
    check(f"过渡是渐变而非突跳（{len(mid)} 个中间帧）", len(mid) >= 4)

    size_kb = (ROOT / "assets" / "demo.gif").stat().st_size / 1024
    print(f"\n  demo.gif {gif.size[0]}x{gif.size[1]}, {gif.n_frames} 帧, {size_kb:.0f} KB")
    print("\n素材校验全部通过" if not FAILURES else f"\n{len(FAILURES)} 项失败: {FAILURES}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
