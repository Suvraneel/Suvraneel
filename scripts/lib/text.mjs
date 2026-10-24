// Text as SVG paths, laid out from the glyph tables in scripts/fonts/*.json.
//
// An SVG shown through <img> on GitHub cannot rely on web fonts, so every word in
// the README art is drawn as outlines of the portfolio's own typefaces:
//   spaceboards       display face (Space Boards + the site's companion digits)
//   tasa-text*        TASA Orbiter Text (SIL OFL 1.1), small UI text
//   tasa-deck         TASA Orbiter Deck, taglines
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fonts");
const cache = new Map();

export function face(name) {
  if (!cache.has(name)) {
    const data = JSON.parse(readFileSync(join(FONT_DIR, `${name}.json`), "utf8"));
    cache.set(name, data);
  }
  return cache.get(name);
}

const fmt = (v) => {
  const s = (Math.round(v * 10) / 10).toString();
  return s === "-0" ? "0" : s;
};

const TOKEN = /([MLQCZ])|(-?\d*\.?\d+(?:e-?\d+)?)/g;

/** Map a glyph path (font units, y up) into user space at (x0, y0) baseline. */
function place(d, k, x0, y0) {
  const parts = [];
  let nums = [];
  const flush = () => {
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push(`${fmt(x0 + nums[i] * k)} ${fmt(y0 - nums[i + 1] * k)}`);
    if (pts.length) parts.push(pts.join(" "));
    nums = [];
  };
  for (const m of d.matchAll(TOKEN)) {
    if (m[1]) {
      flush();
      parts.push(m[1]);
    } else nums.push(Number(m[2]));
  }
  flush();
  return parts.join("");
}

function glyphOf(f, ch) {
  return f.glyphs[ch] ?? f.glyphs[ch.toUpperCase()] ?? f.glyphs["?"] ?? [f.upm * 0.5, ""];
}

/** Advance width of `str` at `size` px, with `tracking` in em. */
export function measure(fontName, str, size, tracking = 0) {
  const f = face(fontName);
  const k = size / f.upm;
  let w = 0;
  const chars = [...str];
  chars.forEach((ch, i) => {
    w += glyphOf(f, ch)[0] * k;
    if (i < chars.length - 1) w += tracking * size;
  });
  return w;
}

/**
 * Path data for `str`. anchor: "start" | "middle" | "end" relative to x.
 * Returns { d, width }.
 */
export function text(fontName, str, { x = 0, y = 0, size = 16, tracking = 0, anchor = "start" } = {}) {
  const f = face(fontName);
  const k = size / f.upm;
  const width = measure(fontName, str, size, tracking);
  let cx = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  let d = "";
  for (const ch of str) {
    const [adv, gd] = glyphOf(f, ch);
    if (gd) d += place(gd, k, cx, y);
    cx += adv * k + tracking * size;
  }
  return { d, width };
}

/** A <path> element for `str`; extra attributes are passed through verbatim. */
export function textPath(fontName, str, opts = {}, attrs = "") {
  const { d } = text(fontName, str, opts);
  return `<path ${attrs} d="${d}"/>`;
}

/** Split `str` into lines no wider than `maxWidth` px. */
export function wrap(fontName, str, size, maxWidth, tracking = 0) {
  const words = str.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(fontName, next, size, tracking) > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
