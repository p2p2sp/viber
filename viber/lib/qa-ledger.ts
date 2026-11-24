/*
 * qa-ledger.ts - the qa-ledger core: lists the scenarios of one qa.e2e.md
 * handoff file with their automation state, prints the e2e-writer dispatch
 * block of the next one to handle and draws the table of every scenario. The
 * contract lives in the header of ../skills/e2e/scripts/qa-ledger.ts.
 */

import { absolutePath } from "./abs-path.ts";
import { rootAbove } from "./plugin-root.ts";
import type { Fs } from "./ports.ts";

export interface QaLedgerResult {
  stdout: string;
  stderr: string;
  exit: number;
}

interface Scenario {
  id: string;
  title: string;
  state: "file" | "blocked" | "pending";
  detail: string;
}

const USAGE = "usage: qa-ledger.sh <handoff> list | <handoff> report | <handoff> next --spec-dir <dir> --base-url <url> --accounts <value> [--after QA-<nn>]";
const OPTIONS = ["--spec-dir", "--base-url", "--accounts", "--after"];

function fail(reason: string): QaLedgerResult {
  return { stdout: "", stderr: `error: ${reason}\n`, exit: 2 };
}

/** The scenarios of the handoff text in file order, the not automatable ones left out. */
function scenariosOf(text: string): Scenario[] {
  const found: Array<{ id: string; title: string }> = [];
  const skipped = new Set<string>();
  const recorded = new Map<string, { state: "file" | "blocked"; detail: string }>();
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "").replace(/[ \t]+$/, "");
    if (line.startsWith("## ")) {
      section = line.slice(3).replace(/^[ \t]+/, "");
    } else if (section === "UI scenarios" || section === "API scenarios") {
      if (!/^### QA-[0-9]+([ \t]|$)/.test(line)) continue;
      const rest = line.slice(4);
      const id = rest.replace(/[ \t].*$/s, "");
      found.push({ id, title: rest.slice(id.length).replace(/^[ \t]+/, "") });
    } else if (section === "Not automatable") {
      if (/^- QA-[0-9]+/.test(line)) skipped.add(line.slice(2).replace(/[^A-Za-z0-9-].*$/s, ""));
    } else if (section === "Automation") {
      // The last line of an ID wins.
      const match = /^- (QA-[0-9]+):[ \t]*(file|blocked)(?=[ \t]|$)/.exec(line);
      if (match === null) continue;
      const detail = line.slice(match[0].length).replace(/^[ \t]*/, "").replace(/^-[ \t]+/, "");
      recorded.set(match[1], { state: match[2] as "file" | "blocked", detail });
    }
  }
  return found
    .filter((scenario) => !skipped.has(scenario.id))
    .map((scenario) => ({ ...scenario, state: recorded.get(scenario.id)?.state ?? "pending", detail: recorded.get(scenario.id)?.detail ?? "" }));
}

function countsLine(scenarios: Scenario[]): string {
  const count = (state: Scenario["state"]): number => scenarios.filter((scenario) => scenario.state === state).length;
  return `counts: ${count("file")} file, ${count("blocked")} blocked, ${count("pending")} pending`;
}

/** A length counts characters (code points), never bytes or UTF-16 units. */
const widthOf = (cell: string): number => [...cell].length;

/** The table of every scenario: each column as wide as its widest cell, cells left-aligned. */
function tableOf(scenarios: Scenario[]): string[] {
  const rows = scenarios.map((scenario) => {
    let detail = scenario.state === "pending" || scenario.detail === "" ? "-" : scenario.detail;
    if (scenario.state === "blocked" && widthOf(detail) > 60) detail = `${[...detail].slice(0, 57).join("")}...`;
    return [scenario.id, scenario.state, detail];
  });
  const head = ["ID", "State", "Detail"];
  const widths = head.map((title, column) => Math.max(widthOf(title), ...rows.map((row) => widthOf(row[column]))));
  const rule = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const draw = (cells: string[]): string => `| ${cells.map((cell, column) => cell + " ".repeat(widths[column] - widthOf(cell))).join(" | ")} |`;
  return [rule, draw(head), rule, ...rows.map(draw), rule];
}

/**
 * The stdout, stderr and exit code of one qa-ledger call. script: the path the
 * entry was started by, the plugin root four segments above it. Never throws.
 */
export function runQaLedger(argv: string[], cwd: string, script: string, ports: { fs: Fs }): QaLedgerResult {
  if (argv.length < 2) return fail(USAGE);
  const [handoff, mode, ...rest] = argv;
  const path = absolutePath(handoff.replaceAll("\\", "/"), cwd.replaceAll("\\", "/"));
  // A path ending on a separator names a directory, whatever stands before it.
  const text = !/[/\\]$/.test(handoff) && ports.fs.kind(path) === "file" ? ports.fs.readText(path) : null;
  if (text === null) return fail(`no handoff file at ${handoff}`);

  const given = new Map<string, string>();
  if (mode === "list" || mode === "report") {
    if (rest.length > 0) return fail(`unknown option ${rest[0]} for ${mode}`);
  } else if (mode === "next") {
    for (let i = 0; i < rest.length; i += 2) {
      const option = rest[i];
      if (!OPTIONS.includes(option)) return fail(`unknown option ${option}`);
      const value = rest[i + 1] ?? "";
      if (value === "" || value.startsWith("--")) return fail(`option ${option} needs a value`);
      given.set(option, value);
    }
    for (const option of OPTIONS.slice(0, 3)) if (!given.has(option)) return fail(`next needs ${option}`);
  } else {
    return fail(`unknown mode ${mode}: use list, next or report`);
  }

  const scenarios = scenariosOf(text);
  const answer = (lines: string[]): QaLedgerResult => ({ stdout: `${lines.join("\n")}\n`, stderr: "", exit: 0 });
  if (mode === "list") return answer([...scenarios.map((scenario) => `id: ${scenario.id} | ${scenario.state} | ${scenario.title}`), countsLine(scenarios)]);
  if (mode === "report") return answer([...tableOf(scenarios), countsLine(scenarios)]);

  // The first scenario not yet a file, counted from the one after --after when it is given.
  const after = given.get("--after") ?? "";
  let reached = after === "";
  let found = after === "";
  let next = "";
  for (const scenario of scenarios) {
    if (after !== "" && scenario.id === after) {
      reached = true;
      found = true;
    } else if (reached && scenario.state !== "file" && next === "") {
      next = scenario.id;
    }
  }
  if (!found) return fail(`--after ${after} names no listed scenario`);
  if (next === "") return answer(["NEXT: commit"]);
  return answer([
    `NEXT: dispatch | id: ${next} | agent: viber:e2e-writer`,
    `handoff: ${path}`,
    `id: ${next}`,
    `spec-dir: ${given.get("--spec-dir")}`,
    `base-url: ${given.get("--base-url")}`,
    `accounts: ${given.get("--accounts")}`,
    `refs: ${rootAbove(script, 3)}/references`,
  ]);
}
