#!/usr/bin/env node
// Builds data/n8n-catalog.json.gz from the official n8n-nodes-base package.
//
//   npm run catalog:update            # latest n8n-nodes-base
//   npm run catalog:update -- 1.95.0  # match the n8n version your server runs
//
// Keeps only the default (newest) version of every node, which is what the
// n8n editor adds to new workflows. The n8n-workflow dependency in
// package.json should be on the same release line as the catalog.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const requested = process.argv[2] ?? "latest";
const outFile = join(process.cwd(), "data", "n8n-catalog.json.gz");
const work = mkdtempSync(join(tmpdir(), "n8n-catalog-"));

try {
  console.log(`Downloading n8n-nodes-base@${requested} ...`);
  const tarball = execFileSync("npm", ["pack", `n8n-nodes-base@${requested}`, "--silent"], { cwd: work })
    .toString()
    .trim()
    .split("\n")
    .pop();
  execFileSync("tar", ["-xzf", tarball, "package/package.json", "package/dist/types/nodes.json"], { cwd: work });

  const version = JSON.parse(readFileSync(join(work, "package/package.json"), "utf8")).version;
  const all = JSON.parse(readFileSync(join(work, "package/dist/types/nodes.json"), "utf8"));

  // A node type can have several entries (one per major version); keep the
  // entry that contains the default version.
  const latest = new Map();
  for (const entry of all) {
    const versions = Array.isArray(entry.version) ? entry.version : [entry.version];
    const defaultVersion = entry.defaultVersion ?? Math.max(...versions);
    if (versions.includes(defaultVersion) || !latest.has(entry.name)) {
      latest.set(entry.name, { ...entry, defaultVersion });
    }
  }

  // Drop UI-only fields to keep the file small
  const UI_ONLY = new Set(["iconUrl", "icon", "iconColor", "hint", "placeholder", "documentationUrl", "badge"]);
  const nodes = [...latest.values()].map((entry) => {
    const { codex, ...rest } = entry;
    const clean = JSON.parse(JSON.stringify(rest, (key, value) => (UI_ONLY.has(key) ? undefined : value)));
    return {
      ...clean,
      // Search hints for picking relevant nodes
      alias: codex?.alias ?? [],
      categories: codex?.categories ?? [],
    };
  });

  const catalog = { source: "n8n-nodes-base", version, generatedAt: new Date().toISOString(), nodes };
  writeFileSync(outFile, gzipSync(JSON.stringify(catalog)));
  console.log(`Wrote ${nodes.length} node types from n8n-nodes-base ${version} to data/n8n-catalog.json.gz`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
