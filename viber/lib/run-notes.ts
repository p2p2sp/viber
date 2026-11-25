/*
 * run-notes.ts - the run-notes core: lists what became of every open item the
 * plan review left in a landed plan, every ruling the build made, every path a
 * task commit refused and every pair of tasks the build put in sequence, one
 * line each, for the outcome of the run. The contract lives in the header of
 * ../scripts/run-notes.ts.
 */

import { absolutePath } from "./abs-path.ts";
import { answer, fail, type MapAnswer } from "./map-answer.ts";
import { readPlan } from "./plan-index/read.ts";
import { readState } from "./plan-index/state.ts";
import { linesOf, openItemsOf } from "./plan-text.ts";
import type { Fs } from "./ports.ts";
import { claims, repoPath, sequencedOf } from "./task-ready.ts";

/** The text of each `N<k>:` line of a coder's notes file, by k; a line with no text is none. */
function coderLines(text: string | null): Map<number, string> {
  const found = new Map<number, string>();
  for (const line of linesOf(text ?? "")) {
    const note = /^(?:- )?N([1-9][0-9]*):[ \t]*(.*\S)[ \t]*$/.exec(line);
    if (note !== null && !found.has(Number(note[1]))) found.set(Number(note[1]), note[2]);
  }
  return found;
}

/** What commit-task.sh writes for a blank or a percent sign of a refused path, the key being a list split on blanks. */
const ESCAPED: Record<string, string> = { "%20": " ", "%09": "\t", "%25": "%" };

/** The `<task id>:<path>` entries of the last `refused:` line of status.md, each path with its blanks read back; none for an absent or empty key. */
function refusedOf(status: string | null): { id: string; path: string }[] {
  const line = linesOf(status ?? "").findLast((entry) => entry.startsWith("refused:")) ?? "";
  return line
    .slice("refused:".length)
    .split(/[ \t\r]+/)
    .flatMap((entry) => {
      const cut = entry.indexOf(":");
      return cut > 0 && cut < entry.length - 1 ? [{ id: entry.slice(0, cut), path: entry.slice(cut + 1).replace(/%(?:20|09|25)/g, (code) => ESCAPED[code]) }] : [];
    });
}

/** The stdout, stderr and exit code of one run-notes call. Never throws. */
export function runRunNotes(argv: string[], cwd: string, ports: { fs: Pick<Fs, "kind" | "readText" | "realPath"> }): MapAnswer {
  const { fs } = ports;
  if (argv.length !== 1 || argv[0] === "") return fail("usage: run-notes.sh <plan-file>");
  const root = cwd.replaceAll("\\", "/").replace(/(.)\/+$/, "$1");
  const plan = absolutePath(argv[0].replaceAll("\\", "/"), root);
  const text = fs.kind(plan) === "file" ? fs.readText(plan) : null;
  if (text === null) return fail(`plan file not found: ${argv[0]}`);

  const dir = plan.slice(0, plan.lastIndexOf("/"));
  const state = readState(dir, fs);
  const items = openItemsOf(linesOf(text));
  const notes = items.filter((item) => item.kind === "note");

  // A task note carries the number plan-index.sh --split gave it in the task file: from 1 per task, in section order.
  const numbers = new Map<string, number>();
  const coders = new Map<string, Map<number, string>>();
  const taskNotes = notes
    .filter((item) => item.where !== "plan")
    .map((item) => {
      const number = (numbers.get(item.where) ?? 0) + 1;
      numbers.set(item.where, number);
      if (!coders.has(item.where)) coders.set(item.where, coderLines(fs.readText(`${dir}/work/${item.where}-coder.md`)));
      const outcome = state.skipped.has(item.where) ? "task skipped" : (coders.get(item.where)?.get(number) ?? "no coder line");
      return `- note | ${item.where} | N${number} | ${item.text} | ${outcome}`;
    });

  // status.md keeps who was refused which path; who claims it is read back from the plan and the extras files.
  const refused = refusedOf(fs.readText(`${dir}/status.md`));
  const tasks = refused.length === 0 ? [] : readPlan(linesOf(text), null).tasks.filter((task) => task.id !== "");
  const refusedLines = refused.map(({ id, path }) => {
    const claimant = tasks.find((task) => task.id !== id && claims(task.id, task.files, repoPath(path, root, fs), dir, root, fs))?.id;
    return `- refused | ${id} | ${path} | claimed by ${claimant === undefined ? "another task" : `task ${claimant}`}`;
  });

  return answer([
    ...items.filter((item) => item.kind === "critical").map((item) => `- critical | ${item.where} | ${item.text} | open`),
    ...taskNotes,
    ...notes.filter((item) => item.where === "plan").map((item) => `- note | plan | ${item.text} | for the user`),
    ...state.rulings.map((ruling) => `- ruling | ${ruling}`),
    ...refusedLines,
    ...sequencedOf(state.decisions).map((pair) => `- sequenced | ${pair.id} | after ${pair.after} | ${pair.path}`),
  ]);
}
