// Shared look of every README graphic, taken from the portfolio
// (github.com/Suvraneel/suvraneel.github.io, styles/globals.css):
// a black ground, hairline rules, a single cyan accent, the cyan-violet
// "seed" texture showing through Space Boards headings, and liquid-metal rims.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const C = {
  ground: "#000000",
  // #1BFCD7: the wordmark texture's cyan end, the site's --accent.
  accent: "#1BFCD7",
  violet: "#7B3CFF",
  ink: "#FFFFFF",
  body: "#C4C3CA",
  hair: "rgba(255,255,255,0.15)",
  hairSoft: "rgba(255,255,255,0.08)",
};

// The LiquidMetalButton's static rim (globals.css, .liquid-metal-shader[data-metal="static"]).
export const METAL_STOPS = [
  ["0%", "#8d9097"],
  ["11%", "#f3f4f7"],
  ["15%", "#e8eeff"],
  ["25%", "#55585e"],
  ["33%", "#1c1d20"],
  ["45%", "#c4c7ce"],
  ["52%", "#fdfdfe"],
  ["56%", "#fff0ea"],
  ["65%", "#66696f"],
  ["74%", "#202124"],
  ["86%", "#b3b6bd"],
  ["94%", "#eef0f4"],
  ["100%", "#8d9097"],
];

export const metalGradient = (id, attrs = 'x1="0" y1="0" x2="1" y2="1"') =>
  `<linearGradient id="${id}" ${attrs}>${METAL_STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;

const mime = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
const uriCache = new Map();

/** A data: URI for a file under assets/brand/src. */
export function dataUri(name) {
  if (!uriCache.has(name)) {
    const ext = name.split(".").pop();
    const buf = readFileSync(join(ROOT, "assets", "brand", "src", name));
    uriCache.set(name, `data:${mime[ext]};base64,${buf.toString("base64")}`);
  }
  return uriCache.get(name);
}

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Root <svg> with a title for screen readers. */
export function svg({ width, height, title, desc = "", body, style = "" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d" fill="none">
<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>
<style>${style}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
${body}
</svg>
`;
}

/**
 * The textured heading: clip the seed texture to `d`, optionally rising in like the
 * site's preloader and drifting like .animated-heading. Static renderers and reduced
 * motion get the finished state (base styles are the end frame).
 */
export function textured({ id, d, box, rise = false, riseFrom = 1, drift = true, ghost = true, tile = 512, src = tile > 400 ? "texture.webp" : "texture-sm.webp" }) {
  const [x, y, w, h] = box;
  // A 2x2 mirrored tile of the seed texture is seamless, so it can drift freely.
  const T = tile;
  const riseDelay = typeof rise === "number" ? rise : 0.2;
  const cols = Math.ceil((w + 400) / (2 * T)) + 1;
  const rows = Math.ceil((h + 300) / (2 * T)) + 1;
  return `
<defs><clipPath id="${id}-clip"><path d="${d}"/></clipPath>
<pattern id="${id}-tex" patternUnits="userSpaceOnUse" x="${x}" y="${y}" width="${2 * T}" height="${2 * T}">
  <image id="${id}-seed" href="${dataUri(src)}" width="${T}" height="${T}"/>
  <use href="#${id}-seed" transform="translate(${2 * T} 0) scale(-1 1)"/>
  <use href="#${id}-seed" transform="translate(0 ${2 * T}) scale(1 -1)"/>
  <use href="#${id}-seed" transform="translate(${2 * T} ${2 * T}) scale(-1 -1)"/>
</pattern>${
    rise
      ? `<style>.${id}-rise { animation: ${id}-rise 1.6s cubic-bezier(.22,1,.36,1) ${riseDelay}s backwards; }
@keyframes ${id}-rise { from { transform: translateY(${Math.round((h + 80) * riseFrom)}px); } }</style><mask id="${id}-rise" maskUnits="userSpaceOnUse" x="${x - 20}" y="${y - 40}" width="${w + 40}" height="${h + 80}"><rect class="${id}-rise" x="${x - 20}" y="${y - 40}" width="${w + 40}" height="${h + 80}" fill="#fff"/></mask>`
      : ""
  }</defs>
${ghost ? `<path d="${d}" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>` : ""}
<g clip-path="url(#${id}-clip)"${rise ? ` mask="url(#${id}-rise)"` : ""}>
  <rect x="${x}" y="${y - 40}" width="${w}" height="${h + 80}" fill="${C.accent}"/>
  <rect${drift ? ' class="drift"' : ""} x="${x - 2 * T * Math.floor(cols / 2)}" y="${y - 2 * T * Math.floor(rows / 2)}" width="${2 * T * (cols + 1)}" height="${2 * T * (rows + 1)}" fill="url(#${id}-tex)"/>
</g>`;
}

export const TEXTURE_CSS = `
.drift { animation: drift 24s cubic-bezier(.45,0,.55,1) infinite alternate; }
@keyframes drift { from { transform: translate(0,0); } to { transform: translate(-360px,-200px); } }
`;
