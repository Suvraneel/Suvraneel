#!/usr/bin/env node
// Rewrites the "Recent activity" table in README.md from the public Events API.
//
// Replaces the old github-activity-readme action, which printed "Made NaN commits"
// once GitHub trimmed PushEvent payloads (commit counts and summaries were removed
// from the Events API in October 2025). Counts now come from the compare API, and
// pull-request titles are looked up when the event no longer carries them.
//
//   GITHUB_TOKEN=... node scripts/update-activity.mjs          (writes README.md)
//   node scripts/update-activity.mjs --fixture events.json --dry
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/brand.mjs";

const LOGIN = process.env.GH_LOGIN || "Suvraneel";
const MAX_ROWS = 5;
const MAX_LOOKUPS = 16;
const TZ = "Asia/Kolkata";
const START = "<!--START_SECTION:activity-->";
const END = "<!--END_SECTION:activity-->";
const SKIP_REPOS = new Set([`${LOGIN}/${LOGIN}`]); // this profile repo's own churn

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

let lookups = 0;
const seen = new Set();
const mergedPRs = new Set();
async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": `${LOGIN}-readme`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}
async function lookup(path) {
  if (lookups >= MAX_LOOKUPS) return null;
  lookups++;
  try {
    return await api(path);
  } catch {
    return null;
  }
}

const repoLink = (name) => `[${name}](https://github.com/${name})`;
// Titles come from other people's issues and PRs: shorten first, then make them
// inert inside a markdown table cell (no HTML, no emphasis, no broken links).
const clip = (s, max = 64) => {
  let t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length > max) t = `${t.slice(0, max - 1).trimEnd()}…`;
  return t.replace(/[&<>|[\]`*_~\\]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "|": "&#124;", "[": "(", "]": ")", "`": "'", "*": "\\*", _: "\\_", "~": "\\~", "\\": "\\\\" })[c]);
};
const when = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
const icon = (name, alt) => `<img src="assets/brand/icons/${name}.svg" width="16" height="16" alt="${alt}">`;

async function pushCount(e) {
  const p = e.payload;
  if (Number.isFinite(p.size)) return p.size;
  if (Number.isFinite(p.distinct_size)) return p.distinct_size;
  if (Array.isArray(p.commits) && p.commits.length) return p.commits.length;
  if (!p.before || /^0+$/.test(p.before) || !p.head) return null;
  const cmp = await lookup(`/repos/${e.repo.name}/compare/${p.before}...${p.head}?per_page=1`);
  return cmp?.total_commits ?? null;
}

async function prDetails(e) {
  const p = e.payload;
  const num = p.number ?? p.pull_request?.number;
  let pr = p.pull_request ?? {};
  if ((!pr.title || pr.merged === undefined) && num) pr = { ...pr, ...((await lookup(`/repos/${e.repo.name}/pulls/${num}`)) ?? {}) };
  return { num, title: pr.title, url: pr.html_url ?? `https://github.com/${e.repo.name}/pull/${num}`, merged: pr.merged };
}

async function describe(e) {
  const p = e.payload ?? {};
  const repo = e.repo.name;
  switch (e.type) {
    case "PushEvent": {
      const branch = (p.ref || "").replace("refs/heads/", "");
      const count = await pushCount(e);
      const what = count ? `Pushed ${count} commit${count === 1 ? "" : "s"}` : "Pushed";
      return { icon: icon("push", "push"), text: `${what} to \`${clip(branch, 32)}\``, repo };
    }
    case "PullRequestEvent": {
      // Decide before any lookup, so label/assign noise doesn't spend the lookup budget.
      if (!["opened", "reopened", "closed", "merged"].includes(p.action)) return null;
      const pr = await prDetails(e);
      const verb = p.action === "merged" || (p.action === "closed" && pr.merged) ? "Merged" : p.action === "closed" ? "Closed" : p.action === "opened" ? "Opened" : "Reopened";
      // A merge can arrive as both "merged" and "closed": keep one outcome row per PR.
      if (verb === "Merged" || verb === "Closed") {
        const key = `${repo}#${pr.num}`;
        if (seen.has(key) || (verb === "Closed" && mergedPRs.has(key))) return null;
        seen.add(key);
      }
      const title = pr.title ? ` ${clip(pr.title)}` : "";
      return { icon: icon(verb === "Merged" ? "merge" : "pr", "pull request"), text: `${verb} PR [#${pr.num}${title}](${pr.url})`, repo };
    }
    case "PullRequestReviewEvent": {
      if (p.action && p.action !== "created") return null;
      const pr = await prDetails(e);
      return { icon: icon("review", "review"), text: `Reviewed [#${pr.num}${pr.title ? ` ${clip(pr.title)}` : ""}](${pr.url})`, repo };
    }
    case "IssuesEvent": {
      if (!["opened", "closed", "reopened"].includes(p.action)) return null;
      const i = p.issue ?? {};
      const verb = p.action[0].toUpperCase() + p.action.slice(1);
      return { icon: icon("issue", "issue"), text: `${verb} issue [#${i.number}${i.title ? ` ${clip(i.title)}` : ""}](${i.html_url})`, repo };
    }
    case "IssueCommentEvent": {
      const i = p.issue ?? {};
      const url = p.comment?.html_url ?? i.html_url;
      return { icon: icon("comment", "comment"), text: `Commented on [#${i.number}${i.title ? ` ${clip(i.title)}` : ""}](${url})`, repo };
    }
    case "CreateEvent":
      if (p.ref_type === "repository") return { icon: icon("repo", "repository"), text: "Created a new repository", repo };
      if (p.ref_type === "tag") return { icon: icon("release", "tag"), text: `Tagged \`${clip(p.ref, 32)}\``, repo };
      return null;
    case "ReleaseEvent":
      if (p.action !== "published") return null;
      return { icon: icon("release", "release"), text: `Released [${clip(p.release?.name || p.release?.tag_name)}](${p.release?.html_url})`, repo };
    case "PublicEvent":
      return { icon: icon("repo", "repository"), text: "Open-sourced the repository", repo };
    case "ForkEvent":
      return { icon: icon("fork", "fork"), text: "Forked", repo };
    case "WatchEvent":
      return { icon: icon("star", "star"), text: "Starred", repo };
    default:
      return null;
  }
}

async function main() {
  let events;
  if (flag("--fixture")) events = JSON.parse(readFileSync(flag("--fixture"), "utf8"));
  else {
    events = [];
    for (let page = 1; page <= 3 && events.length < 300; page++) {
      const batch = await api(`/users/${LOGIN}/events/public?per_page=100&page=${page}`);
      events.push(...batch);
      if (batch.length < 100) break;
    }
  }

  for (const e of events) {
    const num = e.payload?.number ?? e.payload?.pull_request?.number;
    if (e.type === "PullRequestEvent" && (e.payload?.action === "merged" || e.payload?.pull_request?.merged)) mergedPRs.add(`${e.repo?.name}#${num}`);
  }

  // Fold consecutive pushes to one branch into a single row.
  const folded = [];
  for (const e of events) {
    if (SKIP_REPOS.has(e.repo?.name)) continue;
    const prev = folded[folded.length - 1];
    const createdBranch = /^0+$/.test(e.payload?.before ?? "");
    if (e.type === "PushEvent" && !createdBranch && prev?.type === "PushEvent" && prev.repo.name === e.repo.name && prev.payload.ref === e.payload.ref) {
      // The run's commit count comes from comparing its oldest base to its newest head.
      prev.payload = { ...prev.payload, before: e.payload.before, size: undefined, distinct_size: undefined, commits: undefined };
      continue;
    }
    if (e.type === "PushEvent") folded.push({ ...e, payload: { ...e.payload } });
    else folded.push(e);
  }

  const rows = [];
  for (const e of folded) {
    if (rows.length >= MAX_ROWS) break;
    const d = await describe(e).catch(() => null);
    if (d) rows.push({ ...d, at: e.created_at });
  }

  const table = rows.length
    ? [
        "| | Activity | Repository | When |",
        "| :-: | :-- | :-- | --: |",
        ...rows.map((r) => `| ${r.icon} | ${r.text} | ${repoLink(r.repo)} | ${when(r.at)} |`),
      ].join("\n")
    : "_Quiet week. Check back soon._";

  const readmePath = join(ROOT, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error("Activity markers not found in README.md");
  const next = `${readme.slice(0, a + START.length)}\n${table}\n${readme.slice(b)}`;
  if (args.includes("--dry")) {
    console.log(table);
    return;
  }
  if (next !== readme) {
    writeFileSync(readmePath, next);
    console.log(`README.md: ${rows.length} activity rows`);
  } else console.log("README.md: activity unchanged");
}

main().catch((err) => {
  console.error(`::error::${err.message}`);
  process.exit(1);
});
