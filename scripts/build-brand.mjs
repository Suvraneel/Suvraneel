#!/usr/bin/env node
// Builds the static README graphics in assets/brand/ from the portfolio's typefaces,
// texture and colours. Zero dependencies: `node scripts/build-brand.mjs`.
//
// Copy here mirrors suvraneel.github.io (data/workData.ts, app/skills/SkillsPage.tsx,
// app/HomePage.tsx). Change it there first, then here.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { C, ROOT, TEXTURE_CSS, dataUri, metalGradient, svg, textured } from "./lib/brand.mjs";
import { measure, text, wrap } from "./lib/text.mjs";

const OUT = join(ROOT, "assets", "brand");
mkdirSync(join(OUT, "icons"), { recursive: true });
const write = (name, content) => {
  writeFileSync(join(OUT, name), content);
  console.log(`assets/brand/${name}  ${(content.length / 1024).toFixed(1)} KB`);
};

const p = (font, str, opts, fill, extra = "") => {
  const { d } = text(font, str, opts);
  return `<path d="${d}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
};

/* --------------------------------------------------------------- buttons */
// Icons drawn as 1.6px strokes on a 16px grid, like the site's animate-ui set.
const ICONS = {
  arrow: "M4 12L12 4M5.5 4H12V10.5",
  download: "M8 3V11M4.5 7.5L8 11L11.5 7.5M3.5 13.5H12.5",
};

// Every button has the same anatomy: a white 24px mark, the label, then an action
// icon, all on the liquid-metal rim. Marks are either 24-unit paths or a raster
// logo from assets/brand/src, desaturated so the row reads as one set.
const MARKS = {
  resume: { stroke: "M6.5 2.5H14L19 7.5V21.5H6.5ZM14 2.5V7.5H19M9.5 12.5H16M9.5 16.5H14" },
  linkedin: {
    fill: "M5 2.5H19A2.5 2.5 0 0 1 21.5 5V19A2.5 2.5 0 0 1 19 21.5H5A2.5 2.5 0 0 1 2.5 19V5A2.5 2.5 0 0 1 5 2.5Z",
    cut: "M7 10H9.6V18H7ZM8.3 6.2A1.5 1.5 0 1 1 8.3 9.2A1.5 1.5 0 1 1 8.3 6.2ZM11.4 10H13.9V11.1C14.3 10.4 15.2 9.8 16.4 9.8C18.4 9.8 19 11.1 19 13V18H16.4V13.6C16.4 12.6 16.1 11.9 15.2 11.9C14.2 11.9 13.9 12.7 13.9 13.6V18H11.4Z",
  },
  gmail: { si: "gmail" },
  x: { si: "x" },
  leetcode: { si: "leetcode" },
};
const SIB = JSON.parse(readFileSync(join(ROOT, "scripts", "lib", "simple-icons.json"), "utf8"));

function button({ label, icon = "arrow", mark, logo, logoW = 24, logoH = 24 }) {
  const H = 52;
  const size = 15;
  const box = 24;
  const mx = 16;
  const my = (H - box) / 2;
  const tw = measure("tasa-text", label, size);
  const lx = mx + box + 10;
  const W = Math.round(lx + tw + 10 + 16 + 18);
  const R = H / 2;
  const iconX = lx + tw + 10;
  let mark$ = "";
  if (logo) {
    mark$ = `<image href="${dataUri(logo)}" x="${mx + (box - logoW) / 2}" y="${(H - logoH) / 2}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet" filter="url(#mono)"/>`;
  } else if (MARKS[mark]?.stroke) {
    mark$ = `<path d="${MARKS[mark].stroke}" transform="translate(${mx} ${my})" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (MARKS[mark]?.cut) {
    mark$ = `<g transform="translate(${mx} ${my})"><path d="${MARKS[mark].fill}" fill="#fff"/><path d="${MARKS[mark].cut}" fill="#111"/></g>`;
  } else if (MARKS[mark]?.si) {
    mark$ = `<path d="${SIB[MARKS[mark].si].path}" transform="translate(${mx} ${my})" fill="#fff"/>`;
  }
  const label$ = `${mark$}${p("tasa-text", label, { x: lx, y: H / 2 + 5.2, size }, "rgba(255,255,255,0.92)")}`;
  const icon$ = `<path d="${ICONS[icon]}" transform="translate(${iconX.toFixed(1)} ${H / 2 - 8})" stroke="#fff" stroke-opacity=".85" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  const style = `.spin { animation: spin 6s linear infinite; transform-origin: ${W / 2}px ${H / 2}px; }
@keyframes spin { to { transform: rotate(360deg); } }
.sheen { animation: sheen 5.5s cubic-bezier(.65,0,.35,1) infinite; }
@keyframes sheen { 0%, 55% { transform: translateX(-${W}px); } 100% { transform: translateX(${W * 2}px); } }`;
  const body = `<defs>${metalGradient("metal")}
  <linearGradient id="inner" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#202020"/><stop offset="1" stop-color="#000"/></linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <clipPath id="pill"><rect width="${W}" height="${H}" rx="${R}"/></clipPath>
  <clipPath id="core"><rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="${R - 3}"/></clipPath>
  <filter id="mono" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".3 .5 .2 0 .32  .3 .5 .2 0 .32  .3 .5 .2 0 .32  0 0 0 1 0"/></filter>
</defs>
<g clip-path="url(#pill)">
  <rect class="spin" x="${W / 2 - W}" y="${H / 2 - W}" width="${W * 2}" height="${W * 2}" fill="url(#metal)"/>
</g>
<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="${R - 3}" fill="url(#inner)"/>
<rect x="3.5" y="3.5" width="${W - 7}" height="${H - 7}" rx="${R - 3.5}" stroke="rgba(255,255,255,0.12)"/>
<g clip-path="url(#core)"><rect class="sheen" x="0" y="0" width="${W * 0.5}" height="${H}" fill="url(#gloss)" transform="translate(-${W} 0)"/></g>
${label$}
${icon$}`;
  return svg({ width: W, height: H, title: label, body, style });
}

const BUTTONS = [
  ["btn-portfolio.svg", { label: "Portfolio", logo: "site-favicon.png", logoW: 24, logoH: 24 }],
  ["btn-opensorcerer.svg", { label: "Open Sorcerer", logo: "open-sorcerer.webp", logoW: 20, logoH: 30 }],
  ["btn-resume.svg", { label: "Resume", mark: "resume", icon: "download" }],
  ["btn-email.svg", { label: "Email", mark: "gmail" }],
  ["btn-leetcode.svg", { label: "LeetCode", mark: "leetcode" }],
];

/* ------------------------------------------------------- section headers */
function section({ index, kicker, title, href }, theme = "dark") {
  const ink = theme === "dark" ? (a) => `rgba(255,255,255,${a})` : (a) => `rgba(31,35,40,${a + 0.12})`;
  const W = 1280;
  const H = 148;
  const size = 68;
  const base = 112;
  const t = text("spaceboards", title, { x: 0, y: base, size });
  const k = p("tasa-text-medium", kicker.toUpperCase(), { x: 90, y: 34, size: 17, tracking: 0.18 }, ink(0.55));
  const i = p("tasa-text-medium", index, { x: 0, y: 34, size: 17, tracking: 0.14 }, theme === "dark" ? C.accent : "#0a8f7c");
  const link = href ? p("tasa-text", `${href.replace(/^https?:\/\//, "")} ↗`, { x: W, y: 34, size: 16, anchor: "end" }, ink(0.4)) : "";
  const lineX = t.width + 28;
  const style = `${TEXTURE_CSS}
.scan { animation: scan 6s cubic-bezier(.65,0,.35,1) infinite; }
@keyframes scan { 0% { transform: translateX(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateX(${W - lineX - 60}px); opacity: 0; } }`;
  const body = `
${i}
<rect x="38" y="28" width="38" height="1.2" fill="${ink(0.28)}"/>
${k}
${link}
${theme === "light" ? `<path d="${t.d}" stroke="rgba(31,35,40,0.35)" stroke-width="1.2"/>` : ""}
${textured({ id: "h", d: t.d, box: [0, base - size * 0.75, t.width, size * 1.25], ghost: false, tile: 384 })}
<rect x="${lineX}" y="${base - 1}" width="${W - lineX}" height="1" fill="${ink(0.15)}"/>
<rect class="scan" x="${lineX}" y="${base - 1.5}" width="60" height="2" fill="url(#scanG)"/>
<defs><linearGradient id="scanG" x1="0" x2="1"><stop offset="0" stop-color="${C.accent}" stop-opacity="0"/><stop offset="1" stop-color="${C.accent}"/></linearGradient></defs>`;
  return svg({ width: W, height: H, title: `${index} ${kicker}: ${title}`, body, style });
}

const SECTIONS = [
  ["h-about.svg", { index: "01", kicker: "Profile", title: "About Me", href: "suvraneel.github.io/about" }],
  ["h-skills.svg", { index: "02", kicker: "Capabilities", title: "Skills", href: "suvraneel.github.io/skills" }],
  ["h-github.svg", { index: "03", kicker: "In the open", title: "GitHub", href: "github.com/Suvraneel" }],
  ["h-projects.svg", { index: "04", kicker: "Selected work", title: "Projects", href: "suvraneel.github.io/projects" }],
  ["h-work.svg", { index: "05", kicker: "Experience", title: "Work", href: "suvraneel.github.io/work" }],
];

/* ----------------------------------------------------------------- stack */
// Capability areas and tools, as on suvraneel.github.io/skills.
const SI = JSON.parse(readFileSync(join(ROOT, "scripts", "lib", "simple-icons.json"), "utf8"));
const STACK = [
  ["Backend & Systems", "Systems that hold up beyond the happy path.",
    [["Java", "java"], ["Spring Boot", "springboot"], ["Node.js", "node"], ["FastAPI", "fastapi"], ["REST / SOAP APIs"], ["SQL"], ["PostgreSQL", "postgresql"], ["Redis", "redis"], ["Elasticsearch", "elasticsearch"]]],
  ["Agentic Engineering", "Agentic workflows with controls built in.",
    [["Agentic AI"], ["LLMs"], ["MCP", "mcp"], ["Tool calling"], ["RAG"], ["pgvector", "postgresql"], ["Celery", "celery"], ["FastAPI", "fastapi"], ["Claude", "claude"], ["Codex"], ["Cursor", "cursor"]]],
  ["Product Interfaces", "Turning complex systems into simple experiences.",
    [["TypeScript", "typescript"], ["JavaScript", "javascript"], ["React", "react"], ["Next.js", "nextjs"], ["Tailwind CSS", "tailwind"], ["HTML", "html"], ["CSS", "css"], ["React Native", "react"]]],
  ["Web3 & Protocols", "Building across chains, wallets, and decentralized infrastructure.",
    [["Solidity", "solidity"], ["Ethers.js", "ethereum"], ["Viem"], ["Wagmi", "wagmi"], ["Axelar"], ["IPFS", "ipfs"], ["WalletConnect", "walletconnect"]]],
  ["Shipping", "Ship, observe, improve.",
    [["Python", "python"], ["Docker", "docker"], ["AWS"], ["Bun", "bun"], ["Git", "git"], ["GitHub Actions", "githubactions"], ["Linux", "linux"], ["Postman", "postman"], ["Figma", "figma"]]],
  // Earlier work, kept but quieter: drawn dimmed, after everything current.
  ["Earlier stacks", "From earlier projects, coursework and hackathons.",
    [["C++", "cpp"], ["C", "c"], ["PHP", "php"], ["Bootstrap", "bootstrap"], ["MongoDB", "mongodb"], ["Express", "express"], ["MariaDB", "mariadb"], ["Spring", "spring"], ["Flutter", "flutter"], ["Dart", "dart"], ["Android Studio", "androidstudio"], ["pandas", "pandas"], ["NumPy", "numpy"], ["TensorFlow", "tensorflow"], ["scikit-learn", "scikitlearn"], ["Keras", "keras"]], { dim: true }],
  ["Earlier tools", "Picked up along the way.",
    [["GitHub", "github"], ["VS Code"], ["Eclipse IDE", "eclipse"], ["XAMPP", "xampp"], ["Replit", "replit"], ["CodePen"], ["Vercel", "vercel"], ["Heroku"], ["Bash", "bash"], ["Arduino", "arduino"], ["VHDL"], ["Photoshop"]], { dim: true }],
];

function stack() {
  const W = 1280;
  const L = 40;
  const chipsX = 420;
  const chipH = 46;
  const gap = 10;
  let y = 40;
  let body = "";
  STACK.forEach(([label, line, items, { dim = false } = {}], gi) => {
    const top = y;
    let cx = chipsX;
    let cy = y;
    let chips = "";
    for (const [name, icon] of items) {
      const tw = measure("tasa-text", name, 17);
      const w = Math.round((icon ? 50 : 36) + tw + 18);
      if (cx + w > W - L) {
        cx = chipsX;
        cy += chipH + gap;
      }
      const glyph = icon
        ? `<path d="${SI[icon].path}" transform="translate(${cx + 16} ${cy + 13}) scale(0.84)" fill="rgba(255,255,255,${dim ? 0.5 : 0.88})"/>`
        : `<circle cx="${cx + 20}" cy="${cy + chipH / 2}" r="3.5" fill="${dim ? "rgba(255,255,255,0.35)" : C.accent}"/>`;
      chips += `<g>
<rect x="${cx + 0.5}" y="${cy + 0.5}" width="${w - 1}" height="${chipH - 1}" rx="${chipH / 2}" fill="${dim ? "#000" : "#0b0b0c"}" stroke="rgba(255,255,255,${dim ? 0.09 : 0.14})"${dim ? ' stroke-dasharray="3 3"' : ""}/>
${glyph}
${p("tasa-text", name, { x: cx + (icon ? 50 : 36), y: cy + chipH / 2 + 6, size: 17 }, `rgba(255,255,255,${dim ? 0.58 : 0.88})`)}
</g>`;
      cx += w + gap;
    }
    const rowBottom = Math.max(cy + chipH, top + 86);
    body += `
${p("tasa-text-medium", `0${gi + 1}`, { x: L, y: top + 18, size: 15, tracking: 0.14 }, dim ? "rgba(27,252,215,0.5)" : C.accent)}
${p("tasa-text-medium", label.toUpperCase(), { x: L + 38, y: top + 18, size: 15, tracking: 0.16 }, `rgba(255,255,255,${dim ? 0.5 : 0.78})`)}
${wrap("tasa-text", line, 17, chipsX - L - 36)
  .map((ln, li) => p("tasa-text", ln, { x: L, y: top + 50 + li * 24, size: 17 }, `rgba(255,255,255,${dim ? 0.38 : 0.52})`))
  .join("\n")}
${chips}`;
    y = rowBottom + 28;
    if (gi < STACK.length - 1) body += `<rect x="${L}" y="${y - 14}" width="${W - 2 * L}" height="1" fill="${C.hairSoft}"/>`;
    y += 14;
  });
  const H = y + 2;
  const style = "";
  return svg({
    width: W,
    height: H,
    title: "Capabilities and tools",
    desc: STACK.map(([l, , items]) => `${l}: ${items.map((i) => i[0]).join(", ")}`).join(". "),
    style,
    body: `<rect width="${W}" height="${H}" rx="22" fill="#000"/><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="21.5" stroke="rgba(255,255,255,0.12)"/>${body}`,
  });
}

/* ---------------------------------------------------------- activity icons */
const ACTIVITY_ICONS = {
  push: '<circle cx="8" cy="8" r="2.6"/><path d="M1.5 8H5.4M10.6 8H14.5"/>',
  pr: '<circle cx="4" cy="3.6" r="1.7"/><circle cx="4" cy="12.4" r="1.7"/><circle cx="12" cy="12.4" r="1.7"/><path d="M4 5.3V10.7M12 10.7V6.6C12 5.4 11.1 4.6 10 4.6H7.4M8.9 3.1L7.4 4.6L8.9 6.1"/>',
  merge: '<circle cx="4" cy="3.6" r="1.7"/><circle cx="4" cy="12.4" r="1.7"/><circle cx="12" cy="8.4" r="1.7"/><path d="M4 5.3V10.7M4 5.3C4 7.2 5.6 8.4 7.4 8.4H10.3"/>',
  review: '<path d="M1.5 8C3 5.2 5.3 3.6 8 3.6S13 5.2 14.5 8C13 10.8 10.7 12.4 8 12.4S3 10.8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>',
  issue: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/>',
  comment: '<path d="M2.5 3.5H13.5V10.5H7.2L4.4 13V10.5H2.5Z"/>',
  repo: '<path d="M3.5 12V3C3.5 2.7 3.7 2.5 4 2.5H12.5V13.5H5C4.2 13.5 3.5 12.8 3.5 12ZM3.5 12C3.5 11.2 4.2 10.5 5 10.5H12.5"/>',
  release: '<path d="M2.5 2.5H8.2L13.5 7.8L7.8 13.5L2.5 8.2Z"/><circle cx="5.6" cy="5.6" r="1"/>',
  fork: '<circle cx="4" cy="3.6" r="1.7"/><circle cx="12" cy="3.6" r="1.7"/><circle cx="8" cy="12.4" r="1.7"/><path d="M4 5.3V6.4C4 7.5 4.9 8.4 6 8.4H10C11.1 8.4 12 7.5 12 6.4V5.3M8 8.4V10.7"/>',
  star: '<path d="M8 2L9.8 5.9L14 6.3L10.8 9.1L11.7 13.3L8 11.1L4.3 13.3L5.2 9.1L2 6.3L6.2 5.9Z"/>',
};
const activityIcon = (name, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#12c4ab" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" color="#12c4ab" role="img" aria-label="${name}"><title>${name}</title>${inner}</svg>\n`;

/* ---------------------------------------------------------------- footer */
// The site's preloader: a ghost wordmark the texture fills.
function footer() {
  const W = 1280;
  const H = 260;
  const size = 150;
  const t = text("spaceboards", "Suvraneel", { x: W / 2, y: 170, size, anchor: "middle" });
  const box = [W / 2 - t.width / 2, 170 - size * 0.75, t.width, size * 1.2];
  const body = `
<rect width="${W}" height="${H}" rx="24" fill="#000"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="23.5" stroke="rgba(255,255,255,0.1)"/>
${textured({ id: "f", d: t.d, box, rise: 0.3 })}
${p("tasa-text", "Suvraneel Bhuin · Software Engineer & Product Builder", { x: 40, y: 236, size: 15 }, "rgba(255,255,255,0.5)")}`;
  return svg({ width: W, height: H, title: "Suvraneel", desc: "Footer wordmark, after the portfolio's preloader.", body, style: TEXTURE_CSS });
}

for (const [name, opts] of BUTTONS) write(name, button(opts));
for (const [name, opts] of SECTIONS) {
  write(name, section(opts, "dark"));
  write(name.replace(".svg", "-light.svg"), section(opts, "light"));
}
for (const [name, d] of Object.entries(ACTIVITY_ICONS)) write(`icons/${name}.svg`, activityIcon(name, d));
write("stack.svg", stack());
write("footer.svg", footer());
