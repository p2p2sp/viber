/*
 * state.ts - the state of a run beside its plan: status.md, one key per line
 * with "none" for an empty one, and the register of rulings.
 */

import type { Fs } from "../ports.ts";
import { linesOf, trim, words } from "./text.ts";

export interface RunState {
  /** A status.md stands beside the plan: it has landed, and it is frozen. */
  landed: boolean;
  done: Set<string>;
  skipped: Set<string>;
  /** The entries as written; empty for none. */
  skippedText: string;
  unreviewed: string;
  deferred: string;
  closed: string;
  /** The "decision:" lines, as they stand there. */
  decisions: string[];
  /** The "- " entries of rulings.md, the dash dropped. */
  rulings: string[];
}

/** dir: the run directory on disk. */
export function readState(dir: string, fs: Pick<Fs, "kind" | "readText">): RunState {
  const linesAt = (name: string): string[] => (fs.kind(`${dir}/${name}`) === "file" ? linesOf(fs.readText(`${dir}/${name}`) ?? "").map((line) => line.replace(/\r$/, "")) : []);
  const status = linesAt("status.md");
  const value = (key: string): string => {
    const text = trim(status.findLast((line) => line.startsWith(`${key}:`))?.slice(key.length + 1) ?? "");
    return text === "none" || text === "-" ? "" : text;
  };
  const ids = (key: string): Set<string> => new Set(words(value(key)).filter((id) => id !== "-"));
  return {
    landed: fs.kind(`${dir}/status.md`) === "file",
    done: ids("done"),
    skipped: ids("skipped"),
    skippedText: value("skipped"),
    unreviewed: value("unreviewed"),
    deferred: value("deferred"),
    closed: value("closed"),
    decisions: status.filter((line) => line.startsWith("decision:")),
    rulings: linesAt("rulings.md").filter((line) => line.startsWith("- ")).map((line) => line.slice(2)),
  };
}
