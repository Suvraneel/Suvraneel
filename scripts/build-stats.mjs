#!/usr/bin/env node
// Renders the README's live GitHub cards in the portfolio's style:
//   assets/generated/contributions.svg   last 12 months, streaks
//   assets/generated/stats.svg           by the numbers
//   assets/generated/languages.svg       top languages by bytes
//   assets/generated/leetcode.svg        solved problems
//
// Zero dependencies (Node 20+). In CI it runs daily with a token that can read
// the user's public profile (secrets.METRICS_TOKEN, falling back to GITHUB_TOKEN):
//   GH_TOKEN=... node scripts/build-stats.mjs
// Local preview without a network:  node scripts/build-stats.mjs --fixture data.json
// Dump the fetched data for later previews:  ... --save data.json
//
// A failed fetch never blanks the README: existing cards are kept, and a card that
// has never been rendered gets a neutral placeholder instead of a broken image.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { C, ROOT, TEXTURE_CSS, svg, textured } from "./lib/brand.mjs";
import { measure, text } from "./lib/text.mjs";

const LOGIN = process.env.GH_LOGIN || "Suvraneel";
const LEETCODE = process.env.LEETCODE_USER || "Suvraneel";
const TZ = "Asia/Kolkata";
// Kept out of the language card, as in the previous README (generated or vendored code).
const HIDDEN_LANGUAGES = new Set(["Jupyter Notebook", "TeX", "C"]);
const OUT = join(ROOT, "assets", "generated");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/* ------------------------------------------------------------- fetching */
// A personal token sees all of the user's public work; the workflow's built-in
// token is the fallback when the personal one is missing or has expired (401).
const tokens = [process.env.GH_TOKEN, process.env.GITHUB_TOKEN].filter(Boolean);
let tokenIndex = 0;
const TIMEOUT = 30_000;

async function gql(query, variables = {}, attempt = 1) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${tokens[tokenIndex]}`, "Content-Type": "application/json", "User-Agent": `${LOGIN}-readme` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && tokenIndex < tokens.length - 1) {
    console.warn("::warning::GitHub token rejected (401); falling back to the next token. Renew METRICS_TOKEN.");
    tokenIndex++;
    return gql(query, variables, attempt);
  }
  if (!res.ok || body.errors) {
    if (attempt < 3 && (res.status >= 500 || res.status === 403 || res.status === 502)) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return gql(query, variables, attempt + 1);
    }
    throw new Error(`GraphQL ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 400)}`);
  }
  return body.data;
}

const PROFILE = `query($login: String!) {
  user(login: $login) {
    login name createdAt
    followers { totalCount }
    repositoriesContributedTo(privacy: PUBLIC, includeUserRepositories: false, contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, PULL_REQUEST_REVIEW]) { totalCount }
    pullRequests { totalCount }
    mergedPullRequests: pullRequests(states: MERGED) { totalCount }
    issues { totalCount }
    publicRepos: repositories(privacy: PUBLIC, ownerAffiliations: OWNER, isFork: false) { totalCount }
    lastYear: contributionsCollection {
      totalCommitContributions totalPullRequestContributions totalIssueContributions
      totalPullRequestReviewContributions restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount weekday } } }
    }
  }
}`;

const REPOS = `query($login: String!, $after: String) {
  user(login: $login) {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: {field: STARGAZERS, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes { name stargazerCount languages(first: 12, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } }
    }
  }
}`;

// One request per year: contribution calendars are slow to compute, and a single
// query with every year in it risks GitHub's query timeout.
const YEAR = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

const isoSeconds = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

async function fetchGitHub() {
  if (!tokens.length) throw new Error("No GH_TOKEN / GITHUB_TOKEN set");
  const now = new Date();
  const { user } = await gql(PROFILE, { login: LOGIN });
  const repos = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const d = await gql(REPOS, { login: LOGIN, after });
    repos.push(...d.user.repositories.nodes);
    if (!d.user.repositories.pageInfo.hasNextPage) break;
    after = d.user.repositories.pageInfo.endCursor;
  }
  const first = new Date(user.createdAt).getUTCFullYear();
  const yearList = Array.from({ length: now.getUTCFullYear() - first + 1 }, (_, i) => first + i);
  const results = await Promise.all(
    yearList.map((y) =>
      gql(YEAR, {
        login: LOGIN,
        from: `${y}-01-01T00:00:00Z`,
        to: y === now.getUTCFullYear() ? isoSeconds(now) : `${y}-12-31T23:59:59Z`,
      })
    )
  );
  const years = Object.fromEntries(yearList.map((y, i) => [`y${y}`, results[i].user.contributionsCollection]));
  return { fetchedAt: isoSeconds(now), user, repos, years };
}

async function fetchLeetCode() {
  const query = `query($u: String!) {
    allQuestionsCount { difficulty count }
    matchedUser(username: $u) { submitStatsGlobal { acSubmissionNum { difficulty count } } profile { ranking } }
  }`;
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Referer: `https://leetcode.com/u/${LEETCODE}/`, "User-Agent": "Mozilla/5.0 (readme-card)" },
    body: JSON.stringify({ query, variables: { u: LEETCODE } }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`LeetCode ${res.status}`);
  const { data } = await res.json();
  if (!data?.matchedUser) throw new Error("LeetCode user not found");
  return data;
}

/* ------------------------------------------------------------ derivation */
function derive({ fetchedAt, user, repos, years }) {
  const days = new Map();
  let allTime = 0;
  for (const coll of Object.values(years)) {
    allTime += coll.contributionCalendar.totalContributions;
    for (const w of coll.contributionCalendar.weeks) for (const d of w.contributionDays) days.set(d.date, Math.max(days.get(d.date) ?? 0, d.contributionCount));
  }
  const dates = [...days.keys()].sort();
  // Streaks over calendar days; today may still be in progress, so a quiet
  // today does not break the current streak.
  let longest = { len: 0, start: null, end: null };
  let run = { len: 0, start: null };
  for (const date of dates) {
    if (days.get(date) > 0) {
      run = run.len ? { len: run.len + 1, start: run.start } : { len: 1, start: date };
      if (run.len > longest.len) longest = { len: run.len, start: run.start, end: date };
    } else run = { len: 0, start: null };
  }
  let current = { len: 0, start: null, end: null };
  let i = dates.length - 1;
  if (i >= 0 && days.get(dates[i]) === 0) i--;
  for (; i >= 0 && days.get(dates[i]) > 0; i--) current = { len: current.len + 1, start: dates[i], end: current.end ?? dates[i] };

  const langBytes = new Map();
  let stars = 0;
  for (const r of repos) {
    stars += r.stargazerCount;
    for (const e of r.languages.edges) {
      if (HIDDEN_LANGUAGES.has(e.node.name)) continue;
      langBytes.set(e.node.name, (langBytes.get(e.node.name) || 0) + e.size);
    }
  }
  const totalBytes = [...langBytes.values()].reduce((a, b) => a + b, 0) || 1;
  const languages = [...langBytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({ name, share: bytes / totalBytes }));

  const ly = user.lastYear;
  const weeks = ly.contributionCalendar.weeks;
  let best = { count: 0, date: null };
  for (const w of weeks) for (const d of w.contributionDays) if (d.contributionCount > best.count) best = { count: d.contributionCount, date: d.date };

  return {
    fetchedAt,
    since: new Date(user.createdAt).getUTCFullYear(),
    allTime,
    lastYearTotal: ly.contributionCalendar.totalContributions,
    commitsLastYear: ly.totalCommitContributions,
    prs: user.pullRequests.totalCount,
    merged: user.mergedPullRequests.totalCount,
    issues: user.issues.totalCount,
    reviewsLastYear: ly.totalPullRequestReviewContributions,
    stars,
    contributedTo: user.repositoriesContributedTo.totalCount,
    followers: user.followers.totalCount,
    publicRepos: user.publicRepos.totalCount,
    languages,
    weeks,
    best,
    current,
    longest,
  };
}

/* -------------------------------------------------------------- helpers */
const n = (v) => new Intl.NumberFormat("en-US").format(v);
const day = (iso, opts = { day: "numeric", month: "short" }) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : "";
const stamp = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const P = (font, str, opts, fill) => `<path d="${text(font, str, opts).d}" fill="${fill}"/>`;

function frame(W, H, inner) {
  return `<rect width="${W}" height="${H}" rx="22" fill="${C.ground}"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="21.5" stroke="rgba(255,255,255,0.12)"/>
${inner}`;
}

function kicker(index, label, x, y, right, W) {
  return `${P("tasa-text-medium", index, { x, y, size: 16, tracking: 0.14 }, C.accent)}
<rect x="${x + 34}" y="${y - 6}" width="32" height="1.2" fill="rgba(255,255,255,0.28)"/>
${P("tasa-text-medium", label.toUpperCase(), { x: x + 80, y, size: 16, tracking: 0.18 }, "rgba(255,255,255,0.62)")}
${right ? P("tasa-text", right, { x: W - x, y, size: 15, anchor: "end" }, "rgba(255,255,255,0.42)") : ""}`;
}

const BASE_CSS = `${TEXTURE_CSS}
.in { animation: in .9s cubic-bezier(.22,1,.36,1) backwards; }
@keyframes in { from { transform: translateY(8px); } }`;

/* ------------------------------------------------------- contributions */
const RAMP = ["rgba(255,255,255,0.07)", "#0f5c53", "#0c8f7e", "#12c4ab", "#1BFCD7"]; // validated, dark surface

function contributions(s) {
  const W = 1280;
  const H = 372;
  const L = 40;
  const counts = s.weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)).filter((c) => c > 0).sort((a, b) => a - b);
  const q = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] || 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (c) => (c <= 0 ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);

  const cell = 13;
  const gap = 3;
  const gx = W - L - s.weeks.length * (cell + gap) + gap;
  const gy = 122;
  let cells = "";
  let months = "";
  let lastMonth = -1;
  s.weeks.forEach((w, wi) => {
    const x = gx + wi * (cell + gap);
    const first = w.contributionDays[0];
    const m = new Date(`${first.date}T12:00:00Z`).getUTCMonth();
    if (m !== lastMonth && wi < s.weeks.length - 2) {
      if (lastMonth !== -1 || w.contributionDays.length === 7) months += P("tasa-text", day(first.date, { month: "short" }), { x, y: gy - 14, size: 15 }, "rgba(255,255,255,0.5)");
      lastMonth = m;
    }
    for (const d of w.contributionDays) {
      const wd = d.weekday ?? new Date(`${d.date}T12:00:00Z`).getUTCDay();
      cells += `<rect x="${x}" y="${gy + wd * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${RAMP[level(d.contributionCount)]}"/>`;
    }
  });
  const weekdays = [["Mon", 1], ["Wed", 3], ["Fri", 5]]
    .map(([t, i]) => P("tasa-text", t, { x: gx - 10, y: gy + i * (cell + gap) + 11.5, size: 14, anchor: "end" }, "rgba(255,255,255,0.4)"))
    .join("");
  const legendX = W - L - measure("tasa-text", "More", 14) - 10 - 5 * (cell + gap) + gap;
  const legendY = gy + 7 * (cell + gap) + 18;
  const legend = `${P("tasa-text", "Less", { x: legendX - 10, y: legendY + 11.5, size: 14, anchor: "end" }, "rgba(255,255,255,0.45)")}
${RAMP.map((c, i) => `<rect x="${legendX + i * (cell + gap)}" y="${legendY}" width="${cell}" height="${cell}" rx="3" fill="${c}"/>`).join("")}
${P("tasa-text", "More", { x: W - L, y: legendY + 11.5, size: 14, anchor: "end" }, "rgba(255,255,255,0.45)")}`;

  const big = text("spaceboards", n(s.lastYearTotal), { x: L, y: 190, size: 72 });
  const stat = (x, y, label, value, sub) =>
    `${P("tasa-text", label.toUpperCase(), { x, y, size: 13, tracking: 0.16 }, "rgba(255,255,255,0.5)")}
${P("tasa-text-medium", value, { x, y: y + 30, size: 26 }, "#fff")}
${sub ? P("tasa-text", sub, { x, y: y + 52, size: 14 }, "rgba(255,255,255,0.45)") : ""}`;
  const range = (r) => (r.len ? `${day(r.start)} – ${day(r.end)}` : "—");

  const inner = `
${kicker("01", "Contributions", L, 50, `Updated ${stamp(s.fetchedAt)}`, W)}
<rect x="${L}" y="72" width="${W - 2 * L}" height="1" fill="${C.hairSoft}"/>
${textured({ id: "big", d: big.d, box: [L, 190 - 54, big.width, 72], ghost: false, tile: 320 })}
${P("tasa-text", "contributions in the last year", { x: L, y: 222, size: 17 }, "rgba(255,255,255,0.62)")}
<g class="in" style="animation-delay:.3s">
${stat(L, 270, "Current streak", `${s.current.len} day${s.current.len === 1 ? "" : "s"}`, range(s.current))}
${stat(L + 160, 270, "Longest streak", `${s.longest.len} days`, range(s.longest))}
</g>
${months}
${weekdays}
${cells}
<defs><linearGradient id="sweepG" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect class="sweep" x="${gx - 140}" y="${gy - 2}" width="120" height="${7 * (cell + gap) + 2}" fill="url(#sweepG)"/>
${legend}
${P("tasa-text", s.best.date ? `Best day: ${n(s.best.count)} contribution${s.best.count === 1 ? "" : "s"} on ${day(s.best.date, { day: "numeric", month: "short", year: "numeric" })}` : "", { x: gx, y: legendY + 11.5, size: 14 }, "rgba(255,255,255,0.45)")}`;

  const style = `${BASE_CSS}
.sweep { animation: sweep 9s cubic-bezier(.65,0,.35,1) infinite; }
@keyframes sweep { 0% { transform: translateX(0); opacity: 0; } 8% { opacity: 1; } 60% { opacity: 1; } 70%, 100% { transform: translateX(${s.weeks.length * 16 + 160}px); opacity: 0; } }`;
  return svg({
    width: W,
    height: H,
    title: `${n(s.lastYearTotal)} contributions in the last year`,
    desc: `Current streak ${s.current.len} days, longest streak ${s.longest.len} days. ${n(s.allTime)} contributions since ${s.since}.`,
    style,
    body: frame(W, H, inner),
  });
}

/* --------------------------------------------------------------- stats */
function stats(s) {
  const W = 620;
  const H = 452;
  const L = 32;
  const tiles = [
    ["All-time", s.allTime, `contributions since ${s.since}`],
    ["Commits", s.commitsLastYear, "in the last 12 months"],
    ["Pull requests", s.prs, `${n(s.merged)} merged`],
    ["Stars earned", s.stars, `across ${n(s.publicRepos)} public repos`],
    ["Contributed to", s.contributedTo, "public repos, past year"],
    ["Followers", s.followers, "on GitHub"],
  ];
  const colW = (W - 2 * L) / 2;
  const rowH = 112;
  const top = 100;
  let numbersD = "";
  let labels = "";
  let minX = Infinity;
  let maxX = 0;
  tiles.forEach(([label, value, sub], i) => {
    const x = L + (i % 2) * colW;
    const y = top + Math.floor(i / 2) * rowH;
    const t = text("spaceboards", n(value), { x, y: y + 58, size: 46 });
    numbersD += t.d;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + t.width);
    labels += `<g class="in" style="animation-delay:${0.08 * i}s">
${P("tasa-text-medium", label.toUpperCase(), { x, y: y + 6, size: 14, tracking: 0.16 }, "rgba(255,255,255,0.62)")}
${P("tasa-text", sub, { x, y: y + 86, size: 15 }, "rgba(255,255,255,0.45)")}
</g>`;
    if (i % 2 === 0 && i < 4) labels += `<rect x="${L}" y="${y + rowH - 6}" width="${W - 2 * L}" height="1" fill="${C.hairSoft}"/>`;
  });
  const inner = `
${kicker("02", "By the numbers", L, 46, `@${LOGIN}`, W)}
<rect x="${L}" y="66" width="${W - 2 * L}" height="1" fill="${C.hairSoft}"/>
<rect x="${L + colW - 16}" y="${top - 12}" width="1" height="${rowH * 3 - 8}" fill="${C.hairSoft}"/>
${textured({ id: "nums", d: numbersD, box: [minX, top, maxX - minX, rowH * 3], ghost: false, tile: 300 })}
${labels}`;
  return svg({
    width: W,
    height: H,
    title: "GitHub by the numbers",
    desc: tiles.map(([l, v, sub]) => `${l}: ${n(v)} ${sub}`).join(". "),
    style: BASE_CSS,
    body: frame(W, H, inner),
  });
}

/* ----------------------------------------------------------- languages */
function languages(s) {
  const W = 620;
  const H = 452;
  const L = 32;
  const top = s.languages.slice(0, 7);
  const rest = s.languages.slice(7).reduce((a, l) => a + l.share, 0);
  if (rest > 0.0005) top.push({ name: "Other", share: rest });
  const max = Math.max(...top.map((l) => l.share), 0.01);
  const barX = 200;
  const barW = W - L - 64 - barX;
  const rowH = 42;
  const y0 = 108;
  const rows = top
    .map((l, i) => {
      const y = y0 + i * rowH;
      const w = Math.max(6, (l.share / max) * barW);
      const pct = l.share >= 0.1 ? `${(l.share * 100).toFixed(0)}%` : `${(l.share * 100).toFixed(1)}%`;
      const fill = l.name === "Other" ? "rgba(255,255,255,0.35)" : C.accent;
      return `<g class="in" style="animation-delay:${0.06 * i}s">
${P("tasa-text", l.name, { x: L, y: y + 6, size: 18 }, "rgba(255,255,255,0.86)")}
<rect x="${barX}" y="${y - 4}" width="${barW}" height="10" rx="5" fill="rgba(255,255,255,0.06)"/>
<rect x="${barX}" y="${y - 4}" width="${w.toFixed(1)}" height="10" rx="5" fill="${fill}"/>
${P("tasa-text-medium", pct, { x: W - L, y: y + 6, size: 17, anchor: "end" }, "rgba(255,255,255,0.72)")}
</g>`;
    })
    .join("\n");
  const style = `${BASE_CSS}
`;
  const inner = `
${kicker("03", "Languages", L, 46, "by bytes, public repos", W)}
<rect x="${L}" y="66" width="${W - 2 * L}" height="1" fill="${C.hairSoft}"/>
${rows}`;
  return svg({
    width: W,
    height: H,
    title: "Top languages",
    desc: top.map((l) => `${l.name} ${(l.share * 100).toFixed(1)}%`).join(", "),
    style,
    body: frame(W, H, inner),
  });
}

/* ------------------------------------------------------------ leetcode */
function leetcode(data, fetchedAt) {
  const W = 1280;
  const H = 236;
  const L = 40;
  const totals = Object.fromEntries(data.allQuestionsCount.map((d) => [d.difficulty, d.count]));
  const solved = Object.fromEntries(data.matchedUser.submitStatsGlobal.acSubmissionNum.map((d) => [d.difficulty, d.count]));
  const big = text("spaceboards", n(solved.All || 0), { x: L, y: 160, size: 72 });
  const levels = ["Easy", "Medium", "Hard"];
  const colX = 420;
  const colW = (W - L - colX) / 3;
  const cols = levels
    .map((lv, i) => {
      const x = colX + i * colW;
      const share = totals[lv] ? (solved[lv] || 0) / totals[lv] : 0;
      const bw = colW - 48;
      return `<g class="in" style="animation-delay:${0.1 * i}s">
${P("tasa-text-medium", lv.toUpperCase(), { x, y: 116, size: 14, tracking: 0.16 }, "rgba(255,255,255,0.58)")}
${P("tasa-text-medium", n(solved[lv] || 0), { x, y: 152, size: 30 }, "#fff")}
${P("tasa-text", `/ ${n(totals[lv] || 0)}`, { x: x + measure("tasa-text-medium", n(solved[lv] || 0), 30) + 8, y: 152, size: 16 }, "rgba(255,255,255,0.42)")}
<rect x="${x}" y="172" width="${bw}" height="8" rx="4" fill="rgba(255,255,255,0.07)"/>
<rect x="${x}" y="172" width="${Math.max(4, share * bw).toFixed(1)}" height="8" rx="4" fill="${C.accent}"/>
</g>`;
    })
    .join("\n");
  const rank = data.matchedUser.profile?.ranking;
  const inner = `
${kicker("04", "LeetCode", L, 50, rank ? `Global rank ${n(rank)} · updated ${stamp(fetchedAt)}` : `Updated ${stamp(fetchedAt)}`, W)}
<rect x="${L}" y="72" width="${W - 2 * L}" height="1" fill="${C.hairSoft}"/>
${textured({ id: "lc", d: big.d, box: [L, 160 - 54, big.width, 72], ghost: false, tile: 320 })}
${P("tasa-text", "problems solved", { x: L, y: 194, size: 17 }, "rgba(255,255,255,0.62)")}
${cols}`;
  const style = `${BASE_CSS}
`;
  return svg({
    width: W,
    height: H,
    title: `${n(solved.All || 0)} LeetCode problems solved`,
    desc: levels.map((lv) => `${lv} ${solved[lv] || 0} of ${totals[lv] || 0}`).join(", "),
    style,
    body: frame(W, H, inner),
  });
}

function placeholder(W, H, title, note = "Refreshing from GitHub. Check back shortly.") {
  const inner = `${P("tasa-text-medium", title.toUpperCase(), { x: 40, y: H / 2 - 8, size: 16, tracking: 0.18 }, "rgba(255,255,255,0.62)")}
${P("tasa-text", note, { x: 40, y: H / 2 + 24, size: 17 }, "rgba(255,255,255,0.42)")}`;
  return svg({ width: W, height: H, title, desc: "This card is waiting for its first refresh.", body: frame(W, H, inner) });
}

/* ------------------------------------------------------------------ main */
mkdirSync(OUT, { recursive: true });
const put = (name, content) => {
  writeFileSync(join(OUT, name), content);
  console.log(`assets/generated/${name}  ${(content.length / 1024).toFixed(1)} KB`);
};
const keepOr = (name, W, H, title, err, note) => {
  console.warn(`::warning::${name}: ${err.message}`);
  if (!existsSync(join(OUT, name))) put(name, placeholder(W, H, title, note));
  else console.warn(`  keeping the previous ${name}`);
};

let failed = false;
const fixture = flag("--fixture") ? JSON.parse(readFileSync(flag("--fixture"), "utf8")) : null;

try {
  const raw = fixture?.github ?? (await fetchGitHub());
  const s = derive(raw);
  put("contributions.svg", contributions(s));
  put("stats.svg", stats(s));
  put("languages.svg", languages(s));
  if (flag("--save")) writeFileSync(flag("--save"), JSON.stringify({ ...(fixture || {}), github: raw }));
} catch (err) {
  failed = true;
  keepOr("contributions.svg", 1280, 372, "Contributions", err);
  keepOr("stats.svg", 620, 452, "By the numbers", err);
  keepOr("languages.svg", 620, 452, "Languages", err);
}

try {
  const lc = fixture?.leetcode ?? (await fetchLeetCode());
  put("leetcode.svg", leetcode(lc, fixture?.github?.fetchedAt ?? new Date().toISOString()));
} catch (err) {
  // LeetCode is best effort: its API is unofficial.
  keepOr("leetcode.svg", 1280, 236, "LeetCode", err, `Solutions and contest history at leetcode.com/u/${LEETCODE}`);
}

if (failed) process.exitCode = 1;
