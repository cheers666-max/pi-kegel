#!/usr/bin/env python3
"""
Turn `tools/frames.json` into the README assets.

Renders each frame exactly like a terminal would: monospace cell grid, ANSI SGR
colours, wide (CJK) glyphs occupying two cells, Braille drawn by Menlo.

Outputs:
    assets/demo.gif          - one loop of the workout
    assets/contract.png      - hero still: mid-contraction
    assets/relax.png         - hero still: relaxed / open
    assets/menu.png          - the /kegel -> 训练记录 report

Usage: python3 tools/make-assets.py [--scale 2]
"""
import json
import re
import unicodedata
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
ASSETS = ROOT / "assets"

SCALE = 2
COLORS = 32
if "--scale" in sys.argv:
    SCALE = float(sys.argv[sys.argv.index("--scale") + 1])
if "--colors" in sys.argv:
    COLORS = int(sys.argv[sys.argv.index("--colors") + 1])

FONT_SIZE = int(14 * SCALE)
CELL_W = None  # measured from the mono font below
CELL_H = int(FONT_SIZE * 1.45)

MONO = "/System/Library/Fonts/Menlo.ttc"
MONO_BOLD_INDEX = 1
CJK = "/System/Library/Fonts/Hiragino Sans GB.ttc"
EMOJI = "/System/Library/Fonts/Apple Color Emoji.ttc"
# Menlo has no Braille block (it would draw .notdef boxes) - the flower needs
# Apple's real 8-dot Braille face. Apple Symbols backfills ─ █ ★ ▲ ▸ ⏱.
BRAILLE = "/System/Library/Fonts/Apple Braille.ttf"
SYMBOLS = "/System/Library/Fonts/Apple Symbols.ttf"

BG = (26, 27, 38)
BG_HEADER = (33, 34, 48)
BORDER = (47, 51, 77)
PAD = int(14 * SCALE)
HEADER_H = int(26 * SCALE)

# the 256-colour indexes the mock theme emits -> RGB
PALETTE = {
    44: (86, 220, 220),
    253: (218, 218, 218),
    245: (138, 138, 138),
    240: (88, 88, 88),
    114: (135, 215, 135),
    215: (255, 175, 95),
}
DEFAULT_FG = PALETTE[253]

SGR = re.compile(r"\x1b\[([0-9;]*)m")


def load_fonts():
    mono = ImageFont.truetype(MONO, FONT_SIZE, index=0)
    mono_bold = ImageFont.truetype(MONO, FONT_SIZE, index=MONO_BOLD_INDEX)
    cjk = ImageFont.truetype(CJK, FONT_SIZE, index=0)
    cjk_bold = ImageFont.truetype(CJK, FONT_SIZE, index=2)
    def optional(path, size=None, index=0):
        """Apple Color Emoji is a bitmap (sbix) face: only certain strikes load."""
        want = size or FONT_SIZE
        for candidate in (want, 96, 64, 48, 40, 32, 20):
            try:
                return ImageFont.truetype(path, candidate, index=index)
            except OSError:
                continue
        return None
    return (
        mono, mono_bold, cjk, cjk_bold,
        optional(EMOJI),
        optional(BRAILLE),
        optional(SYMBOLS),
    )


MONO, MONO_BOLD, CJK, CJK_BOLD, EMOJI, BRAILLE_F, SYMBOLS_F = load_fonts()
CELL_W = round(MONO.getlength("M"))

# ── per-character font fallback, the way a terminal does it ──────────────────
_NOTDEF_CACHE = {}


def _notdef(font):
    key = id(font)
    if key not in _NOTDEF_CACHE:
        im = Image.new("L", (48, 48), 0)
        ImageDraw.Draw(im).text((6, 6), "\ue123", font=font, fill=255)
        _NOTDEF_CACHE[key] = im.tobytes()
    return _NOTDEF_CACHE[key]


def _has_glyph(font, ch):
    if font is None:
        return False
    if font is EMOJI:
        im = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
        try:
            ImageDraw.Draw(im).text((0, 0), ch, font=font, fill=(255, 255, 255, 255), embedded_color=True)
        except Exception:
            return False
        return im.getbbox() is not None
    im = Image.new("L", (48, 48), 0)
    try:
        ImageDraw.Draw(im).text((6, 6), ch, font=font, fill=255)
    except Exception:
        return False
    raw = im.tobytes()
    return raw != _notdef(font) and im.getbbox() is not None


_FONT_CHOICE = {}
MISSING = set()


def pick_font(ch: str, bold: bool):
    """Braille -> Apple Braille, pictographs -> colour emoji, CJK -> Hiragino,
    everything else -> Menlo. Returns (font, use_embedded_color)."""
    key = (ch, bold)
    if key in _FONT_CHOICE:
        return _FONT_CHOICE[key]
    o = ord(ch)
    chain = []
    if 0x2800 <= o <= 0x28FF:
        chain.append((BRAILLE_F, False))
    elif is_emoji(ch):
        chain.append((EMOJI, True))
    chain.append((MONO_BOLD if bold else MONO, False))
    if is_emoji(ch):
        chain.append((EMOJI, True))
    chain += [(SYMBOLS_F, False), (CJK_BOLD if bold else CJK, False), (EMOJI, True)]
    for font, embedded in chain:
        if _has_glyph(font, ch):
            _FONT_CHOICE[key] = (font, embedded)
            return _FONT_CHOICE[key]
    MISSING.add(ch)
    _FONT_CHOICE[key] = (MONO_BOLD if bold else MONO, False)
    return _FONT_CHOICE[key]


def is_wide(ch: str) -> bool:
    return unicodedata.east_asian_width(ch) in ("W", "F")


def is_emoji(ch: str) -> bool:
    o = ord(ch)
    return 0x1F300 <= o <= 0x1FAFF or 0x2600 <= o <= 0x27BF or o in (0x23F1, 0x23F0, 0x23F3)


def parse_sgr(text: str):
    """Yield (char, rgb, bold) for one line of ANSI-coloured text."""
    fg, bold = DEFAULT_FG, False
    pos = 0
    for match in SGR.finditer(text):
        if match.start() > pos:
            for ch in text[pos : match.start()]:
                yield ch, fg, bold
        codes = [c for c in match.group(1).split(";") if c != ""]
        i = 0
        while i < len(codes):
            code = codes[i]
            if code == "38" and i + 2 < len(codes) and codes[i + 1] == "5":
                fg = PALETTE.get(int(codes[i + 2]), DEFAULT_FG)
                i += 3
            elif code in ("0", ""):
                fg, bold = DEFAULT_FG, False
                i += 1
            elif code == "1":
                bold = True
                i += 1
            elif code == "22":
                bold = False
                i += 1
            else:
                i += 1
        pos = match.end()
    for ch in text[pos:]:
        yield ch, fg, bold


@lru_cache(maxsize=256)
def emoji_tile(ch: str, box_w: int, box_h: int):
    """Apple Color Emoji is a 96px bitmap strike - render big, downscale, cache."""
    canvas = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).text((0, 0), ch, font=EMOJI, fill=(255, 255, 255, 255), embedded_color=True)
    bbox = canvas.getbbox()
    if not bbox:
        return None
    glyph = canvas.crop(bbox)
    scale = min(box_w / glyph.width, box_h / glyph.height)
    size = (max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale)))
    return glyph.resize(size, Image.LANCZOS)


def draw_line(draw, line: str, x0: int, y0: int):
    x = x0
    for ch, fg, bold in parse_sgr(line):
        wide = is_wide(ch)
        width = CELL_W * (2 if wide else 1)
        if ch.strip():
            font, embedded = pick_font(ch, bold)
            if embedded and font is EMOJI:
                tile = emoji_tile(ch, CELL_W * 2, int(CELL_H * 0.86))
                if tile is not None:
                    tile = tile.convert("RGBA")
                    draw._image.paste(tile, (x + max(0, (CELL_W * 2 - tile.width) // 2), y0 + CELL_H - tile.height - int(CELL_H * 0.05)), tile)
                x += width
                continue
            try:
                draw.text((x, y0), ch, font=font, fill=fg)
            except Exception:
                draw.text((x, y0), ch, font=MONO_BOLD if bold else MONO, fill=fg)
        x += width
    return x


def frame_image(lines, title="pi · 凯格尔训练", width_cells=None, rich_header=True):
    cols = width_cells or max((cell_len(l) for l in lines), default=80)
    cols = max(cols, 40)
    body_h = CELL_H * len(lines)
    w = cols * CELL_W + PAD * 2
    h = body_h + PAD * 2 + (HEADER_H if rich_header else 0)

    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)

    if rich_header:
        draw.rectangle([0, 0, w, HEADER_H], fill=BG_HEADER)
        r = int(5 * SCALE)
        for i, color in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
            cx = PAD + i * int(16 * SCALE)
            cy = HEADER_H // 2
            draw.ellipse([cx, cy - r, cx + r * 2, cy + r], fill=color)
        draw.text((PAD + int(62 * SCALE), HEADER_H // 2 - CELL_H // 2 + int(2 * SCALE)), title, font=CJK, fill=PALETTE[245])
        draw.line([0, HEADER_H, w, HEADER_H], fill=BORDER)

    y = PAD + (HEADER_H if rich_header else 0)
    for line in lines:
        draw_line(draw, line, PAD, y)
        y += CELL_H
    return img


def cell_len(line: str) -> int:
    return sum(2 if is_wide(c) else 1 for c, _, _ in parse_sgr(line))


def load_frames():
    data = json.loads((TOOLS / "frames.json").read_text())
    return data


def build_gif(data, out: Path, delay_ms: int, scale_step: int = 1, colors: int = 64):
    frames = [f for i, f in enumerate(data["frames"]) if i % scale_step == 0]
    # One shared palette + no dithering: every frame otherwise re-quantises the
    # antialiased text and the file triples in size (and the palette flickers).
    base = frame_image(frames[0]["lines"]).quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    images = [
        frame_image(f["lines"]).quantize(palette=base, dither=Image.Dither.NONE) for f in frames
    ]
    images[0].save(
        out,
        save_all=True,
        append_images=images[1:],
        duration=delay_ms,
        loop=0,
        optimize=True,
        disposal=2,
    )
    return len(frames)


def pick_frame(data, phase: str, fraction: float):
    """The frame closest to `fraction` through a phase (for the hero stills)."""
    pool = [f for f in data["frames"] if f["phase"] == phase]
    if not pool:
        return data["frames"][0]
    return pool[min(len(pool) - 1, int(len(pool) * fraction))]


def main():
    ASSETS.mkdir(exist_ok=True)
    data = load_frames()
    print(f"cell {CELL_W}x{CELL_H}px, font {FONT_SIZE}px, scale {SCALE}")

    # hero stills
    for phase, fraction, name in [("contract", 0.85, "contract"), ("relax", 0.9, "relax")]:
        frame = pick_frame(data, phase, fraction)
        img = frame_image(frame["lines"], title=f"pi · 凯格尔训练 · {frame['phase']}")
        img.save(ASSETS / f"{name}.png")
        print(f"  assets/{name}.png  {img.width}x{img.height}")

    if data.get("report"):
        img = frame_image(data["report"], title="pi · /kegel → 📈 训练记录")
        img.save(ASSETS / "menu.png")
        print(f"  assets/menu.png   {img.width}x{img.height}")

    # GIF: sample every 400ms of workout time, play back at 90ms/frame (~4.4x)
    if MISSING:
        print(f"  !! 没有任何字体覆盖的字符: {sorted(MISSING)}")
    gif_delay = 90
    count = build_gif(data, ASSETS / "demo.gif", delay_ms=gif_delay, colors=COLORS)
    size_kb = (ASSETS / "demo.gif").stat().st_size / 1024
    workout_ms = data["frames"][-1]["ms"]
    print(
        f"  assets/demo.gif   {count} frames  {size_kb:.0f} KB  "
        f"({workout_ms / 1000:.0f}s 训练压在 {count * gif_delay / 1000:.1f}s 内，{workout_ms / (count * gif_delay):.1f}x)"
    )


if __name__ == "__main__":
    main()
