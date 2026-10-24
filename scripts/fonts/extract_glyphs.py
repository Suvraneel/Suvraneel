#!/usr/bin/env python3
"""Extract the portfolio's brand typefaces into glyph-outline tables.

The README assets draw every word as SVG paths, so they look identical on any
machine (an <img> SVG cannot load web fonts reliably). This script turns the
portfolio's fonts into small JSON tables that `scripts/lib/text.mjs` lays out.

Run it only when the portfolio's fonts change:

    pip install fonttools brotli
    python3 scripts/fonts/extract_glyphs.py --src ../suvraneel.github.io

Sources (from github.com/Suvraneel/suvraneel.github.io):
  styles/fonts/Spaceboards.otf          display face (letters only)
  public/fonts/space-boards-digits.woff2 the site's companion digits for it
  styles/fonts/TASAOrbiterVF.woff2      text face, SIL Open Font License 1.1

Outputs scripts/fonts/*.json: {upm, ascent, descent, glyphs: {char: [advance, d]}}
with `d` in font units, y up, using only absolute M/L/Q/C/Z commands.
"""

import argparse
import json
import pathlib

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = pathlib.Path(__file__).resolve().parent
ASCII = [chr(c) for c in range(32, 127)]
EXTRA = list("—–·•→↗’‘“”…×★©")


class PathPen(BasePen):
    """Absolute M/L/Q/C/Z only, so the layout code can transform points."""

    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.out = []

    @staticmethod
    def _n(v):
        s = f"{v:.1f}".rstrip("0").rstrip(".")
        return "0" if s in ("-0", "") else s

    def _pt(self, *pts):
        return " ".join(f"{self._n(x)} {self._n(y)}" for x, y in pts)

    def _moveTo(self, p):
        self.out.append("M" + self._pt(p))

    def _lineTo(self, p):
        self.out.append("L" + self._pt(p))

    def _curveToOne(self, a, b, c):
        self.out.append("C" + self._pt(a, b, c))

    def _qCurveToOne(self, a, b):
        self.out.append("Q" + self._pt(a, b))

    def _closePath(self):
        self.out.append("Z")

    _endPath = _closePath


def table(fonts, chars):
    """fonts: list of TTFont, first one that maps a char wins (fallback chain)."""
    head = fonts[0]
    hhea = head["hhea"]
    out = {
        "upm": head["head"].unitsPerEm,
        "ascent": hhea.ascent,
        "descent": hhea.descent,
        "capHeight": getattr(head["OS/2"], "sCapHeight", 0) or 0,
        "glyphs": {},
    }
    for ch in chars:
        for font in fonts:
            cmap = font.getBestCmap()
            name = cmap.get(ord(ch))
            if not name:
                continue
            gs = font.getGlyphSet()
            pen = PathPen(gs)
            gs[name].draw(pen)
            advance = font["hmtx"][name][0]
            scale = out["upm"] / font["head"].unitsPerEm
            if scale != 1:  # not needed for these fonts, kept for safety
                advance *= scale
            out["glyphs"][ch] = [round(advance, 1), "".join(pen.out)]
            break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="portfolio repo checkout")
    args = ap.parse_args()
    src = pathlib.Path(args.src)

    spaceboards = TTFont(src / "styles/fonts/Spaceboards.otf")
    digits = TTFont(src / "public/fonts/space-boards-digits.woff2")
    tasa_vf = src / "styles/fonts/TASAOrbiterVF.woff2"

    def tasa(wght, opsz):
        return instantiateVariableFont(TTFont(tasa_vf), {"wght": wght, "opsz": opsz})

    jobs = {
        # Space Boards has no digits; the site falls back to its own digit font.
        "spaceboards": table([spaceboards, digits], ASCII),
        "tasa-text": table([tasa(400, 8)], ASCII + EXTRA),
        "tasa-text-medium": table([tasa(500, 8)], ASCII + EXTRA),
        "tasa-deck": table([tasa(400, 32)], ASCII + EXTRA),
    }
    for name, data in jobs.items():
        path = HERE / f"{name}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        print(f"{path.name}: {len(data['glyphs'])} glyphs, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
