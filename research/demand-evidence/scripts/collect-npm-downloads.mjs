#!/usr/bin/env node
// Collects npm download counts as market-size proxies for PocketClaw:
//  - @anthropic-ai/claude-code: every PocketClaw user is by definition a
//    Claude Code user, so its install volume bounds the addressable market.
//  - happy + happy-coder: the CLI of Happy (slopus/happy), the closest
//    open-source comparable — its volume shows real willingness to adopt a
//    mobile client. The package was renamed happy-coder -> happy, so both
//    names are tracked.
//  - omnara: tracked for completeness, but flagged — the npm package is a
//    deprecated redirect (distribution moved to a curl installer), so its
//    npm counts understate actual usage.
//
// Usage: node collect-npm-downloads.mjs [--out <dir>]

import { fetchJson, resolveOutDir, run, writeSnapshot } from "./lib.mjs";

const REGISTRY = "https://registry.npmjs.org";
const DOWNLOADS = "https://api.npmjs.org/downloads/point";
const PACKAGES = [
  { name: "@anthropic-ai/claude-code", role: "market-size proxy (host CLI PocketClaw drives)" },
  { name: "happy", role: "incumbent comparable (Happy's CLI, github.com/slopus/happy)" },
  { name: "happy-coder", role: "incumbent comparable (former name of 'happy'; deprecated rename stub)" },
  { name: "omnara", role: "incumbent comparable (npm package deprecated; counts understate usage)" },
];

async function verifyPackage(name) {
  const { status, json } = await fetchJson(`${REGISTRY}/${name}`, {
    okStatuses: [200, 404],
  });
  if (status === 404) return { exists: false };
  const latestVersion = json["dist-tags"]?.latest ?? null;
  const latest = latestVersion ? json.versions?.[latestVersion] : null;
  return {
    exists: true,
    description: json.description ?? null,
    latestVersion,
    deprecated: typeof latest?.deprecated === "string" ? latest.deprecated : null,
    repository: json.repository?.url ?? null,
  };
}

async function downloadsFor(name, period) {
  const { status, json } = await fetchJson(`${DOWNLOADS}/${period}/${name}`, {
    okStatuses: [200, 404],
  });
  return status === 200 ? json.downloads : null;
}

run(async () => {
  const outDir = resolveOutDir();
  console.log("PocketClaw demand evidence — npm download counts\n");

  const packages = [];
  for (const { name, role } of PACKAGES) {
    const meta = await verifyPackage(name);
    if (!meta.exists) {
      console.log(`  ${name}: NOT FOUND on registry.npmjs.org — skipped`);
      packages.push({ name, role, exists: false });
      continue;
    }
    const [lastWeek, lastMonth] = [
      await downloadsFor(name, "last-week"),
      await downloadsFor(name, "last-month"),
    ];
    packages.push({
      name,
      role,
      exists: true,
      description: meta.description,
      latestVersion: meta.latestVersion,
      deprecated: meta.deprecated,
      downloads: { lastWeek, lastMonth },
    });
    console.log(
      `  ${name}@${meta.latestVersion}: ${lastMonth?.toLocaleString("en-US") ?? "n/a"} downloads last month, ` +
        `${lastWeek?.toLocaleString("en-US") ?? "n/a"} last week` +
        (meta.deprecated ? " [DEPRECATED on npm]" : ""),
    );
  }

  const payload = {
    schema: "pocketclaw.demand-evidence/npm-downloads@1",
    fetchedAt: new Date().toISOString(),
    source: {
      registry: "https://registry.npmjs.org (package existence + metadata)",
      downloads: "https://api.npmjs.org/downloads/point/<period>/<package>",
    },
    packages,
  };
  const file = await writeSnapshot(outDir, "npm-downloads.json", payload);
  console.log(`\nwrote ${file}`);
});
