/*
 * synthesize-fixture.ts - what synthesize.critical.test.ts uses to seed a
 * case and run viber/skills/code-auditor/scripts/synthesize.sh. It holds no
 * case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/synthesize.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export interface Finding {
  /** `<hunt id>-<k>`, k 1 to 3. */
  id: string;
  title?: string;
  loc?: string;
  cls?: string;
  sev?: string;
  conf?: string;
  /** Absent: no verdict file at all. */
  verdict?: string;
  observed?: string;
  crit?: string;
  /** Replaces the whole verdict file, for a file with no `VERDICT:` line. */
  verdictBody?: string;
}

export interface Fixture {
  scope?: string;
  units?: string[];
  findings?: Finding[];
  /** Hunts whose only report is `<id>-0.md`. */
  zeros?: string[];
  /** Hunts the ledger names and no report file exists for. */
  bare?: string[];
  /** Extra files under reports/, name -> content. */
  files?: Record<string, string>;
  angles?: string[];
}

export function huntOf(id: string): string {
  return id.replace(/-\d$/, "");
}

export function put(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function report(f: Finding): string {
  return [
    `# ${f.title ?? `Title ${f.id}`}`,
    `LOCATION: ${f.loc ?? `src/${f.id}.ts:L10-L20`}`,
    `CLASS: ${f.cls ?? `bugs: class ${f.id}`}`,
    `SEVERITY: ${f.sev ?? "6.0"}`,
    `CONFIDENCE: ${f.conf ?? "medium"}`,
    `HUNT: ${huntOf(f.id)}`,
    "",
    "## Root cause",
    "The body is never read by the script.",
    "",
  ].join("\n");
}

export function verdictFile(f: Finding): string {
  return [
    `VERDICT: ${f.verdict}`,
    "COMMAND: sh repro.sh",
    `OBSERVED: ${f.observed ?? "it failed"}`,
    `SEVERITY: ${f.crit ?? f.sev ?? "6.0"}`,
    "",
  ].join("\n");
}

export function huntLine(id: string): string {
  const unit = /^(R-)?U\d+$/.test(id) ? id.replace(/^R-/, "") : "none";
  const angle = id.startsWith("A-") ? id.slice(2) : "none";
  return `hunt: ${id} | wave: ${id.startsWith("R-") ? 2 : 1} | unit: ${unit} | angle: ${angle}`;
}

/** Builds a run workspace under `dir` and returns its path. */
export function build(dir: string, fx: Fixture, name = "20260101-000000"): string {
  const ws = path.join(dir, name);
  const lensFile = path.join(dir, "bugs.md");
  const angles = fx.angles ?? ["first", "second"];
  put(lensFile, ["# Bugs lens", "", "## Hunts", ...angles.flatMap((a) => [`### ${a}`, "text", ""]), "## Excluded", "- nothing", ""].join("\n"));
  const units = fx.units ?? [];
  put(
    path.join(ws, "run.md"),
    [
      "Lens: bugs",
      `Lens file: ${lensFile}`,
      `Scope: ${fx.scope ?? "repo"}`,
      "Target root: /repo",
      "",
      "## Map",
      "## Conventions",
      "none",
      "",
      "## Units",
      ...units.map((u) => `- ${u} | src/${u}.ts | why`),
      "",
    ].join("\n"),
  );
  const findings = fx.findings ?? [];
  const hunts: string[] = [];
  for (const id of [...findings.map((f) => huntOf(f.id)), ...(fx.zeros ?? []), ...(fx.bare ?? [])]) {
    if (!hunts.includes(id)) hunts.push(id);
  }
  put(path.join(ws, "ledger.md"), hunts.map(huntLine).join("\n") + "\n");
  for (const f of findings) {
    put(path.join(ws, "reports", `${f.id}.md`), report(f));
    if (f.verdictBody !== undefined) put(path.join(ws, "verdicts", `${f.id}.md`), f.verdictBody);
    else if (f.verdict !== undefined) put(path.join(ws, "verdicts", `${f.id}.md`), verdictFile(f));
  }
  for (const id of fx.zeros ?? []) put(path.join(ws, "reports", `${id}-0.md`), "NO FINDING\nchecked: src\n");
  for (const [name, content] of Object.entries(fx.files ?? {})) put(path.join(ws, "reports", name), content);
  return ws;
}

export async function synthesize(shell: Shell, ws: string, args: string[] = []): Promise<RunResult> {
  return await runScript(SUT, [ws, ...args], { shell, cwd: path.dirname(ws) });
}

/** Builds the fixture, runs the script, hands both to `check`. */
export async function scenario(fx: Fixture, check: (ws: string, result: RunResult, findings: string) => void) {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-synth-", async (dir) => {
      const ws = build(dir, fx);
      const result = await synthesize(shell, ws);
      assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
      check(ws, result, fs.readFileSync(path.join(ws, "findings.md"), "utf8"));
    });
  });
}

export function verified(id: string, extra: Partial<Finding> = {}): Finding {
  return { id, verdict: "VERIFIED", ...extra };
}
