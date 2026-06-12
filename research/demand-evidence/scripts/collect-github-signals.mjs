#!/usr/bin/env node
// Collects GitHub demand signals for PocketClaw's market research:
//  1. Incumbent traction — repo metadata for the closest open-source
//     comparables (slopus/happy, omnara-ai/omnara).
//  2. Feature-gap demand — keyword searches over slopus/happy issues for the
//     exact capabilities PocketClaw ships (lock-screen approvals, Live
//     Activities, notifications, self-hosting).
//  3. Spot-checked pain points — specific issues that motivated PocketClaw's
//     self-hosted, LAN-first design.
//
// Usage: node collect-github-signals.mjs [--out <dir>]
// Auth:  unauthenticated by default; set GITHUB_TOKEN for higher rate limits.

import {
  fetchJson,
  githubHeaders,
  resolveOutDir,
  run,
  sleep,
  writeSnapshot,
} from "./lib.mjs";

const API = "https://api.github.com";
const COMPARABLE_REPOS = ["slopus/happy", "omnara-ai/omnara"];
const KEYWORDS = [
  "lock screen",
  "live activity",
  "notification",
  "approve",
  "self-host",
  "self hosted",
];
const SPOT_CHECK_ISSUES = [
  { repo: "slopus/happy", number: 953 },
  { repo: "slopus/happy", number: 1123 },
];
// Unauthenticated search API allows 10 requests/min — pace the keyword loop.
const SEARCH_DELAY_MS = 1500;

function pickRepoFields(r) {
  return {
    full_name: r.full_name,
    html_url: r.html_url,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    open_issues: r.open_issues_count,
    created_at: r.created_at,
    pushed_at: r.pushed_at,
    license: r.license?.spdx_id ?? null,
  };
}

async function fetchRepo(slug) {
  const headers = githubHeaders();
  const { status, json } = await fetchJson(`${API}/repos/${slug}`, {
    headers,
    okStatuses: [200, 404],
  });
  if (status === 200) return pickRepoFields(json);

  // Slug not found — try to locate it via the search API before dropping it.
  const name = slug.split("/").pop();
  console.warn(`warn: ${slug} returned 404; searching for "${name}" instead`);
  const { json: search } = await fetchJson(
    `${API}/search/repositories?q=${encodeURIComponent(name)}&per_page=1`,
    { headers },
  );
  const hit = search.items?.[0];
  if (!hit) return { full_name: slug, error: "not found and no search match" };
  console.warn(`warn: using closest match ${hit.full_name}`);
  return pickRepoFields(hit);
}

async function searchIssues(repo, keyword) {
  const q = encodeURIComponent(`"${keyword}" repo:${repo}`);
  const { json } = await fetchJson(
    `${API}/search/issues?q=${q}&advanced_search=true&per_page=5`,
    { headers: githubHeaders() },
  );
  return {
    keyword,
    total_count: json.total_count,
    top_issues: (json.items ?? []).map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      comments: i.comments,
      html_url: i.html_url,
    })),
  };
}

async function fetchIssue({ repo, number }) {
  const { status, json } = await fetchJson(`${API}/repos/${repo}/issues/${number}`, {
    headers: githubHeaders(),
    okStatuses: [200, 404],
  });
  if (status === 404) return { repo, number, exists: false };
  return {
    repo,
    number,
    exists: true,
    title: json.title,
    state: json.state,
    comments: json.comments,
    created_at: json.created_at,
    html_url: json.html_url,
  };
}

run(async () => {
  const outDir = resolveOutDir();
  console.log(`PocketClaw demand evidence — GitHub signals (${process.env.GITHUB_TOKEN ? "authenticated" : "unauthenticated"})\n`);

  const repos = [];
  for (const slug of COMPARABLE_REPOS) {
    const repo = await fetchRepo(slug);
    repos.push(repo);
    if (repo.error) {
      console.log(`  ${repo.full_name}: ${repo.error}`);
    } else {
      console.log(
        `  ${repo.full_name}: ${repo.stars} stars, ${repo.forks} forks, ` +
          `${repo.open_issues} open issues, license ${repo.license}, last push ${repo.pushed_at}`,
      );
    }
  }

  console.log(`\nKeyword demand in slopus/happy issues:`);
  const keywordHits = [];
  for (const keyword of KEYWORDS) {
    const result = await searchIssues("slopus/happy", keyword);
    keywordHits.push(result);
    console.log(`  "${keyword}": ${result.total_count} issues`);
    for (const issue of result.top_issues.slice(0, 3)) {
      console.log(`     #${issue.number} [${issue.state}] ${issue.title}`);
    }
    await sleep(SEARCH_DELAY_MS);
  }

  console.log(`\nSpot-checked pain-point issues:`);
  const spotChecks = [];
  for (const ref of SPOT_CHECK_ISSUES) {
    const issue = await fetchIssue(ref);
    spotChecks.push(issue);
    console.log(
      issue.exists
        ? `  ${issue.repo}#${issue.number} [${issue.state}] ${issue.title}`
        : `  ${ref.repo}#${ref.number}: not found`,
    );
  }

  const payload = {
    schema: "pocketclaw.demand-evidence/github-signals@1",
    fetchedAt: new Date().toISOString(),
    source: {
      api: "https://api.github.com (REST v3, X-GitHub-Api-Version 2022-11-28)",
      authenticated: Boolean(process.env.GITHUB_TOKEN),
    },
    comparableRepos: repos,
    issueKeywordSearch: { repo: "slopus/happy", results: keywordHits },
    spotCheckedIssues: spotChecks,
  };
  const file = await writeSnapshot(outDir, "github-signals.json", payload);
  console.log(`\nwrote ${file}`);
});
