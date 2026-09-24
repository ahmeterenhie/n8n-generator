// Quality check for workflow generation against a real model.
//
//   EVAL_PROVIDER=gemini EVAL_API_KEY=AIza... npm run eval
//
// Optional: EVAL_MODEL, EVAL_ONLY=id1,id2, EVAL_DELAY_MS (pause between
// cases, e.g. 20000 on free tiers). Results are written to eval-results/.
// Run it before and after changing prompts, the catalog or the validator,
// and compare the pass rate.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClarifyAnswer } from "@/lib/clarify";
import { BASE_PREFIX } from "@/lib/n8n/catalog";
import { generateDirect } from "@/lib/pipeline";

interface Case {
  id: string;
  lang: "tr" | "en";
  request: string;
  answers?: ClarifyAnswer[];
  /** Node names (without the n8n-nodes-base. prefix) the workflow should contain */
  expect: string[];
}

interface CaseResult {
  id: string;
  ok: boolean;
  errors: number;
  warnings: number;
  repairRounds: number;
  nodes: number;
  workflows?: number;
  missingExpected: string[];
  seconds: number;
  failure?: string;
  errorDetails?: string[];
}

const provider = (process.env.EVAL_PROVIDER ?? "gemini") as "gemini" | "anthropic" | "openai";
const apiKey = process.env.EVAL_API_KEY;
const model = process.env.EVAL_MODEL;
const delay = Number(process.env.EVAL_DELAY_MS ?? 0);
const only = process.env.EVAL_ONLY?.split(",").map((s) => s.trim());

const cases = (JSON.parse(readFileSync(join(process.cwd(), "scripts", "eval-cases.json"), "utf8")) as Case[]).filter(
  (c) => !only || only.includes(c.id)
);

async function runCase(c: Case): Promise<CaseResult> {
  const started = Date.now();
  try {
    // Plans and generates without the review step, like "generate directly"
    const { workflows } = await generateDirect({
      provider,
      apiKey,
      model,
      request: c.request,
      answers: c.answers ?? [],
      lang: c.lang,
    });
    const types = new Set(
      workflows.flatMap((w) => (w.workflow.nodes as { type: string }[]).map((n) => n.type.replace(BASE_PREFIX, "")))
    );
    const missingExpected = c.expect.filter((e) => !types.has(e));
    const errors = workflows.flatMap((w) => w.validation.errors.map((e) => `${w.name} / ${e.node ?? ""}: ${e.message}`));
    return {
      id: c.id,
      ok: errors.length === 0 && missingExpected.length === 0,
      errors: errors.length,
      warnings: workflows.reduce((n, w) => n + w.validation.warnings.length, 0),
      repairRounds: workflows.reduce((n, w) => n + w.validation.repairRounds, 0),
      nodes: types.size,
      workflows: workflows.length,
      missingExpected,
      seconds: (Date.now() - started) / 1000,
      errorDetails: errors,
    };
  } catch (err) {
    return {
      id: c.id,
      ok: false,
      errors: -1,
      warnings: 0,
      repairRounds: 0,
      nodes: 0,
      missingExpected: c.expect,
      seconds: (Date.now() - started) / 1000,
      failure: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`Evaluating ${cases.length} cases with ${provider}${model ? ` (${model})` : ""}\n`);
  const results: CaseResult[] = [];
  for (const [i, c] of cases.entries()) {
    if (i > 0 && delay) await new Promise((r) => setTimeout(r, delay));
    const r = await runCase(c);
    results.push(r);
    const status = r.ok ? "PASS" : r.failure ? "FAIL (call)" : "FAIL";
    const detail = r.failure
      ? r.failure.slice(0, 120)
      : `workflows ${r.workflows}, errors ${r.errors}, repairs ${r.repairRounds}, node types ${r.nodes}${r.missingExpected.length ? `, missing ${r.missingExpected.join("/")}` : ""}`;
    console.log(`${status.padEnd(12)} ${c.id.padEnd(24)} ${r.seconds.toFixed(0).padStart(4)}s  ${detail}`);
  }

  const passed = results.filter((r) => r.ok).length;
  const valid = results.filter((r) => r.errors === 0).length;
  console.log(`\nPassed ${passed}/${results.length} · valid (no errors) ${valid}/${results.length}`);

  mkdirSync(join(process.cwd(), "eval-results"), { recursive: true });
  const file = join("eval-results", `${new Date().toISOString().replace(/[:.]/g, "-")}-${provider}.json`);
  writeFileSync(join(process.cwd(), file), JSON.stringify({ provider, model, passed, valid, total: results.length, results }, null, 2));
  console.log(`Details: ${file}`);
}

main();
