/*
 * code-auditor.unit.test.ts - holds the code-auditor skill to what it names and
 * to what the repository still carries:
 *   - the lens files its SKILL.md names exist and are exactly the six lenses of
 *     the `/viber:code-auditor` argument contract;
 *   - every agent its SKILL.md dispatches (`viber:<name>` not preceded by `/`,
 *     which is the command itself) is listed in plugin.json `agents[]` with an
 *     existing file;
 *   - no tracked file outside `docs/`, other than a `CLAUDE.md` node, mentions a
 *     script, agent or reference the skill no longer ships.
 *
 * The forbidden tokens are assembled from fragments, so this file holds none of
 * them whole and the sweep passes over itself. Every rule is a pure function,
 * proven to fire on a synthetic bad input before it is trusted on the real
 * files, so a green run is never vacuous. The only external call is the
 * read-only `git ls-files`.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/code-auditor.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";

const VIBER = path.resolve(import.meta.dirname, "../../viber");
const SKILL = path.join(VIBER, "skills/code-auditor/SKILL.md");
const LENS_DIR = path.join(VIBER, "skills/code-auditor/references/lenses");
const LENSES = ["bugs", "security", "web-performance", "runtime-performance", "tests", "design"];

const join = (...fragments: string[]): string => fragments.join("");

const FORBIDDEN: string[] = [
  join("collect", "_signals"),
  join("collect", "_edges"),
  join("rank", "_edges"),
  join("code-auditor/scripts/", "rank.ts"),
  join("code-auditor/scripts/", "check_", "node.sh"),
  join("edge", "-scout"),
  join("references/", "jobs.md"),
  join("references/", "scoring.md"),
  join("viber:", "profiler"),
  join("viber:", "detective"),
  join("agents/", "profiler.md"),
  join("agents/", "detective.md"),
  join("viber:", "prover"),
  join("agents/", "prover.md"),
  join("intent/references/", "prove.md"),
  join("--", "prove"),
];

const BINARY_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2"];

// ---------------------------------------------------------------------------
// Rules - pure over text
// ---------------------------------------------------------------------------

function namedLenses(skill: string): string[] {
  const names = [...skill.matchAll(/references\/lenses\/([a-z][a-z-]*)\.md/g)].map((m) => m[1]);
  return [...new Set(names)].sort();
}

function dispatchedAgents(skill: string): string[] {
  const names = [...skill.matchAll(/(?<![/\w])viber:([a-z][a-z-]*)/g)].map((m) => m[1]);
  return [...new Set(names)].sort();
}

function registeredAgents(pluginJson: string): string[] {
  return (JSON.parse(pluginJson).agents as string[]).map((entry) => entry.replace(/^\.\//, ""));
}

function unregisteredAgents(skill: string, pluginJson: string, exists: (entry: string) => boolean): string[] {
  const registered = registeredAgents(pluginJson);
  return dispatchedAgents(skill).filter((name) => {
    const entry = `agents/${name}.md`;
    return !registered.includes(entry) || !exists(entry);
  });
}

function staleTokens(text: string): string[] {
  return FORBIDDEN.filter((token) => text.includes(token));
}

// ---------------------------------------------------------------------------
// Self-checks
// ---------------------------------------------------------------------------

test("a SKILL.md naming a lens file twice yields it once, sorted (the lens set is compared as a set)", () => {
  const skill = "`references/lenses/tests.md` then `references/lenses/bugs.md` and `references/lenses/tests.md`";
  assert.deepEqual(namedLenses(skill), ["bugs", "tests"]);
});

test("a dispatched agent is any viber:<name> not preceded by a slash (the /viber:code-auditor command is no agent)", () => {
  const skill = "Run `/viber:code-auditor`, dispatch `viber:mapper` and `viber:hunter`.";
  assert.deepEqual(dispatchedAgents(skill), ["hunter", "mapper"]);
});

test("an agent dispatched but absent from agents[] is reported (a rule that never fires makes the registration check vacuous)", () => {
  const pluginJson = JSON.stringify({ agents: ["./agents/mapper.md"] });
  assert.deepEqual(unregisteredAgents("viber:mapper viber:hunter", pluginJson, () => true), ["hunter"]);
});

test("an agent listed in agents[] whose file is missing is reported", () => {
  const pluginJson = JSON.stringify({ agents: ["./agents/mapper.md", "./agents/hunter.md"] });
  assert.deepEqual(unregisteredAgents("viber:mapper viber:hunter", pluginJson, (entry) => entry === "agents/mapper.md"), ["hunter"]);
});

for (const token of FORBIDDEN) {
  test(`a text holding ${JSON.stringify(token)} is flagged with that token alone (a rule that never fires makes the stale sweep vacuous)`, () => {
    assert.deepEqual(staleTokens(`see ${token} for details`), [token]);
  });
}

test("a text holding none of the forbidden tokens is not flagged", () => {
  assert.deepEqual(staleTokens("viber:mapper reads references/lenses/bugs.md and runs scripts/worktree.sh"), []);
});

// ---------------------------------------------------------------------------
// The real files
// ---------------------------------------------------------------------------

test("the lens files SKILL.md names are exactly the six lenses of the argument contract", () => {
  assert.deepEqual(namedLenses(fs.readFileSync(SKILL, "utf-8")), [...LENSES].sort());
});

test("every lens file SKILL.md names exists", () => {
  const missing = LENSES.filter((name) => !fs.existsSync(path.join(LENS_DIR, `${name}.md`)));
  assert.deepEqual(missing, []);
});

test("every agent SKILL.md dispatches is listed in plugin.json agents[] with an existing file", () => {
  const pluginJson = fs.readFileSync(path.join(VIBER, ".claude-plugin/plugin.json"), "utf-8");
  const skill = fs.readFileSync(SKILL, "utf-8");
  assert.deepEqual(unregisteredAgents(skill, pluginJson, (entry) => fs.existsSync(path.join(VIBER, entry))), []);
});

/** `-z` keeps a non-ASCII path from coming back C-quoted. */
async function sweptFiles(): Promise<{ root: string; files: string[] }> {
  const top = await runScript("git", ["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) throw new Error(`git rev-parse --show-toplevel failed: ${top.stderr}`);
  const root = top.stdout.trim();
  const listed = await runScript("git", ["ls-files", "-z"], { cwd: root });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  const files = listed.stdout
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => !p.startsWith("docs/") && !p.startsWith(".docs/"))
    .filter((p) => path.basename(p) !== "CLAUDE.md")
    .filter((p) => !BINARY_EXTENSIONS.some((ext) => p.toLowerCase().endsWith(ext)))
    .filter((p) => fs.existsSync(path.join(root, p)));
  return { root, files };
}

test("no tracked file outside docs/, other than a CLAUDE.md node, names a removed script, agent or reference", async () => {
  const { root, files } = await sweptFiles();
  const hits = files.flatMap((file) =>
    staleTokens(fs.readFileSync(path.join(root, file), "utf-8")).map((token) => `${file}: ${token}`),
  );
  assert.deepEqual(hits, []);
});
