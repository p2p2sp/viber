/*
 * hunt-return.ts - the hunt-return core: answers the return of a hunter or a
 * critic of a code-auditor run with the critic blocks of its claims, its one
 * retry or nothing to dispatch. The contract lives in the header of
 * ../skills/code-auditor/scripts/hunt-return.ts.
 */

import { answer, fail, hunterBlock, linesOf, openRun, record, seedLines, testRulesLine, unitId, unitLines, worktreeLines, type HuntResult } from "./hunt-brief.ts";
import type { Fs } from "./ports.ts";
import { runStripTag } from "./strip-tag.ts";

const USAGE = "usage: hunt-return.sh <ws> hunter <hunt id> | <ws> critic <hunt id>-<k>";
const NONE = answer(["NEXT: none"]);
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The text after the first marker, the whole line without one. */
function after(line: string, marker: string): string {
  const at = line.indexOf(marker);
  return at < 0 ? line : line.slice(at + marker.length);
}

/** The stdout, stderr and exit code of one hunt-return call, script being the path its entry was started by. Never throws. */
export function runHuntReturn(argv: string[], script: string, ports: { fs: Fs }): HuntResult {
  const { fs } = ports;
  const [workspace = "", mode = "", given = ""] = argv;
  if (workspace === "" || (mode !== "hunter" && mode !== "critic")) return fail(USAGE);
  if (!/^[A-Za-z0-9._-]+$/.test(given)) return fail(`bad hunt id: ${given}`);
  if (mode === "critic" && !/.-[0-9]$/.test(given)) return fail(`bad critic id: ${given}`);
  const id = mode === "critic" ? given.slice(0, -2) : given;

  const run = openRun(workspace, script, fs);
  if (typeof run === "string") return fail(run);
  const ledger = linesOf(fs, run.ledger);
  const hunt = ledger.find((line) => line.startsWith(`hunt: ${id} | `))?.replace(/\r$/, "");
  if (hunt === undefined) return fail(`hunt not in the ledger: ${id}`);
  const wave = after(hunt, "| wave: ").split(" ")[0];
  const named = (value: string): string => (value === "none" ? "" : value);
  const unit = named(after(hunt, "| unit: ").split(" ")[0]);
  const angle = named(after(hunt, "| angle: "));

  const criticBlock = (claim: string, retry: boolean): string[] => [
    `NEXT: critic | id: ${claim} | background${retry ? " | retry" : ""}`,
    `Claim: ${run.ws}/reports/${claim}.claim.md`,
    `Run file: ${run.runFile}`,
    `Lens file: ${run.lensFile}`,
    `Out: ${run.ws}/verdicts/${claim}.md`,
    ...worktreeLines(run, `critic-${claim}${retry ? "-retry" : ""}`),
    ...(run.lens === "tests" ? [testRulesLine(run)] : []),
    ...(wave === "2" ? ["Variant: yes"] : []),
  ];

  if (mode === "critic") {
    const verdict = `${run.ws}/verdicts/${given}.md`;
    runStripTag([verdict], ports);
    const judged = linesOf(fs, verdict).some((line) => /^VERDICT: (VERIFIED|REFUTED|PARTIALLY VERIFIED|INCONCLUSIVE)[ \t]*\r?$/.test(line));
    if (judged || ledger.includes(`critic-retried: ${given}`)) return NONE;
    record(run, `critic-retried: ${given}`, fs);
    return answer(criticBlock(given, true));
  }

  // The reports of this hunt and no other: a file of a longer id is neither stripped nor counted.
  const reports = DIGITS.map((k) => `${run.ws}/reports/${id}-${k}`);
  runStripTag(reports.flatMap((report) => [`${report}.md`, `${report}.claim.md`]), ports);
  const claims = DIGITS.filter((k) => fs.kind(`${reports[k]}.claim.md`) === "file");
  if (claims.length > 0) return answer(claims.flatMap((k) => criticBlock(`${id}-${k}`, false)));
  if (reports.some((report) => fs.kind(`${report}.md`) === "file")) return NONE;

  // No report at all: the one retry, then the recorded miss.
  const missed = ledger.includes(`no-report: ${id}`);
  if (ledger.includes(`retried: ${id}`) && !missed) record(run, `no-report: ${id}`, fs);
  if (ledger.includes(`retried: ${id}`) || missed) return NONE;
  const unitLine = unit === "" ? "" : unitLines(run, fs).find((line) => unitId(line) === unit);
  if (unitLine === undefined) return fail(`unit not in ${run.mapFile}: ${unit}`);
  const all = wave === "2" ? seedLines(run, fs) : [];
  const nth = Number.parseInt(id.replace(/^V-/, ""), 10);
  const seeds = unit === "" ? all.filter((_, index) => index + 1 === nth) : all;
  record(run, `retried: ${id}`, fs);
  return answer(hunterBlock(run, { id, unitLine, angle, seeds }, true));
}
