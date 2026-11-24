/*
 * run-failures.ts - the run-failures core: reads the review and test reports
 * of a run, writes its failure trail and counts the failures per cause, or
 * names the test-strategy rules its failed reviews raised. The contract lives
 * in the header of ../scripts/run-failures.ts.
 */

import { byteOrder } from "./byte-order.ts";
import { runConfig } from "./config/run.ts";
import type { Fs, Git } from "./ports.ts";

export interface RunFailuresResult {
  stdout: string;
  stderr: string;
  exit: number;
}

/** task, round: of a `review-<task>-<round>` report alone, the one kind whose entries merge; task is empty for any other. */
interface Entry {
  cause: string;
  source: string;
  text: string;
  task: string;
  round: bigint;
}

const CAUSES = ["convention", "place", "plan", "task", "test", "unknown"];
const BLOCKING = /^- (?:\*\*Blocking\*\*|Blocking)(?:[ \t\n\v\f\r](.*))?$/s;
const BRACKET = /^\[([^\]]*)\][ \t\n\v\f\r]*(.*)$/s;
const BLANKS = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g;

function fail(exit: number, reason: string): RunFailuresResult {
  return { stdout: "", stderr: `error: ${reason}\n`, exit };
}

/** The cause and the text of a Blocking first line; null for any other line and for one with no text. */
function finding(line: string): { cause: string; text: string } | null {
  const blocking = BLOCKING.exec(line);
  if (blocking === null) return null;
  const rest = (blocking[1] ?? "").replace(/^[ \t\n\v\f\r]+/, "");
  const bracket = BRACKET.exec(rest);
  const text = bracket === null ? rest : bracket[2];
  // Lower-cased letter by letter: a cause is ASCII, and no other letter may fold into one.
  const word = (bracket?.[1] ?? "").replace(BLANKS, "").replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return text === "" ? null : { cause: CAUSES.slice(0, 4).includes(word) ? word : "unknown", text };
}

/** The stdout, stderr and exit code of one run-failures call. Never throws. */
export function runRunFailures(argv: string[], cwd: string, ports: { fs: Fs; git: Git }): RunFailuresResult {
  const { fs } = ports;
  const lessons = argv.length === 2 && argv[0] === "--lessons";
  const raw = lessons ? argv[1] : argv.length === 1 && argv[0] !== "--lessons" ? argv[0] : "";
  if (raw === "") return fail(2, "usage: run-failures.sh [--lessons] <run-dir>");

  // A relative argument is relative to the repository root, outside a repository to the cwd.
  const here = cwd.replaceAll("\\", "/");
  const base = (ports.git.repoRoot(here) ?? here).replace(/\/$/, "");
  const dir = raw.replaceAll("\\", "/").replace(/\/+$/, "") || "/";
  const full = /^(\/|[A-Za-z]:\/)/.test(dir) ? dir : `${base}/${dir}`;
  if (fs.kind(full) !== "dir") return fail(2, `run directory not found: ${raw}`);
  if (!lessons && fs.kind(`${full}/status.md`) !== "file") return fail(2, `${raw} holds no status.md, so this is not a run directory`);

  const reports = fs
    .listDir(`${full}/work`)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .filter((name) => name.startsWith("review-") || (!lessons && (name.startsWith("final-review-") || /^tests-[0-9]+$/.test(name))))
    .filter((name) => fs.kind(`${full}/work/${name}.md`) === "file")
    .sort(byteOrder);

  const entries: Entry[] = [];
  for (const source of reports) {
    const review = /^review-(.+)-([0-9]+)$/s.exec(source);
    const from = review === null ? { task: "", round: 0n } : { task: review[1], round: BigInt(review[2]) };
    const lines = (fs.readText(`${full}/work/${source}.md`) ?? "").replace(/\n$/, "").split("\n");
    lines.forEach((ended, index) => {
      const line = ended.replace(/\r$/, "");
      if (!source.startsWith("tests-")) {
        const found = finding(line);
        if (found !== null) entries.push({ ...found, source, ...from });
      } else if (!(index === 0 && line.startsWith("status:")) && line.replace(/[ \t\n\v\f\r]/g, "") !== "") {
        entries.push({ cause: "test", source, text: /^[-*] /.test(line) ? line.slice(2) : line, ...from });
      }
    });
  }
  // A finding repeated across the review rounds of one task stays once, in its lowest round.
  const kept = entries.filter((entry) => entry.task === "" || !entries.some((other) => other.task === entry.task && other.cause === entry.cause && other.text === entry.text && other.round < entry.round));

  if (lessons) {
    const counts = new Map<string, number>();
    for (const entry of kept) {
      const named = [...entry.text.matchAll(/test-strategy `([A-Za-z][A-Za-z0-9-]*)`/g)].map((match) => match[1]);
      for (const name of new Set(named)) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const rules = [...counts].sort((a, b) => b[1] - a[1] || byteOrder(a[0], b[0])).map(([name, count]) => `${name} x${count}`);
    return { stdout: `lessons: ${rules.join(", ") || "none"}\n`, stderr: "", exit: 0 };
  }

  // The file exists only while it holds an entry. The messages name it as the argument spelled it.
  const out = `${dir}/failures.md`;
  if (kept.length === 0) {
    if (!fs.remove(`${full}/failures.md`)) return fail(3, `could not remove ${out}`);
  } else {
    const trail = `# Failures\n\n${kept.map((entry) => `- ${entry.cause} | ${entry.source} | ${entry.text}\n`).join("")}`;
    if (fs.kind(`${full}/failures.md`) === "dir") return fail(3, `could not write ${out} - it is a directory`);
    if (!fs.writeBytes(`${full}/failures.md`, new TextEncoder().encode(trail))) return fail(3, `could not write ${out}`);
  }

  // The runs a convention gap stood in: the archived trails holding a convention entry, and this run when it holds one.
  const count = (cause: string): number => kept.filter((entry) => entry.cause === cause).length;
  const archive = `${base}/docs/${runConfig(["--specifications"], base, ports).split("\n")[0]}`;
  const trails = fs
    .listDir(archive)
    .filter((name) => !name.startsWith("."))
    .map((name) => `${archive}/${name}/failures.md`)
    .filter((file) => fs.kind(file) === "file" && (fs.readText(file) ?? "").split("\n").some((line) => line.startsWith("- convention | ")));
  const runs = trails.length + (count("convention") > 0 ? 1 : 0);
  return { stdout: `failures: ${kept.length} ${CAUSES.map((cause) => `${cause} ${count(cause)}`).join(" ")} runs ${runs}\n`, stderr: "", exit: 0 };
}
