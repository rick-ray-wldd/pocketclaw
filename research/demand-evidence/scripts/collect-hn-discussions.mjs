#!/usr/bin/env node
// Collects Hacker News discussion volume around "drive your coding agent from
// your phone" — a proxy for community-level demand for PocketClaw's category.
// Uses the public HN Algolia Search API (no auth, generous rate limits).
//
// Usage: node collect-hn-discussions.mjs [--out <dir>]

import { fetchJson, resolveOutDir, run, sleep, writeSnapshot } from "./lib.mjs";

const API = "https://hn.algolia.com/api/v1/search";
const QUERIES = [
  "claude code mobile",
  "claude code phone",
  "claude code remote",
  "ai agent approve phone",
];

async function searchStories(query) {
  const url = `${API}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=5`;
  const { json } = await fetchJson(url);
  return {
    query,
    nbHits: json.nbHits,
    topStories: (json.hits ?? []).map((h) => ({
      title: h.title,
      points: h.points,
      num_comments: h.num_comments,
      url: h.url ?? null,
      hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      created_at: h.created_at,
    })),
  };
}

run(async () => {
  const outDir = resolveOutDir();
  console.log("PocketClaw demand evidence — Hacker News discussions\n");

  const results = [];
  for (const query of QUERIES) {
    const result = await searchStories(query);
    results.push(result);
    console.log(`  "${query}": ${result.nbHits} matching stories`);
    for (const s of result.topStories.slice(0, 3)) {
      console.log(
        `     ${s.points} pts / ${s.num_comments} comments — ${s.title} (${s.created_at?.slice(0, 10)})`,
      );
    }
    await sleep(300);
  }

  const payload = {
    schema: "pocketclaw.demand-evidence/hn-discussions@1",
    fetchedAt: new Date().toISOString(),
    source: {
      api: "https://hn.algolia.com/api/v1/search (HN Search API by Algolia)",
      note: "tags=story; hits ranked by Algolia relevance/popularity",
    },
    queries: results,
  };
  const file = await writeSnapshot(outDir, "hn-discussions.json", payload);
  console.log(`\nwrote ${file}`);
});
