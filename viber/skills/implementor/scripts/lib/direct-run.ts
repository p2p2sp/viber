/*
 * direct-run.ts - one call of direct.ts: keeps what differed from HEAD before
 * the build, hands the commit skill the change the coders reported and names
 * what the build left uncommitted. The contract lives in the header of
 * ../direct.ts.
 */

import type { Tree } from "../../../planner/scripts/lib/ports.ts";
import { changePaths, commitLine, leftLines, pathsOf, runDirty } from "../../../simple-implementor/scripts/lib/simple-commit.ts";
import type { Fs, Git } from "../../../spec-implementor/scripts/lib/ports.ts";

const USAGE = ["usage: direct.sh <session-id> start", "       direct.sh <session-id> <done|stopped> [<FILES>]", "       direct.sh <session-id> committed"].join("\n");

export interface Result {
  stdout: string;
  stderr: string;
  exit: number;
}

interface Ports {
  fs: Fs;
  git: Git;
  tree: Tree;
}

interface State {
  /** The repo-relative paths that differed from HEAD at `start`: the user's own files. Null outside a git repository with a commit. */
  before: string[] | null;
  /** The paths of the FILES value of `done` or `stopped`. */
  reported: string[];
  /** The paths handed to the commit skill. */
  paths: string[];
  /** HEAD when they were handed over. */
  head: string;
}

const refuse = (text: string): Result => ({ stdout: "", stderr: `${text}\n`, exit: 2 });
const print = (...out: string[]): Result => ({ stdout: `${out.join("\n")}\n`, stderr: "", exit: 0 });

/** One call of direct.ts. Never throws. */
export function runDirect(argv: string[], rawCwd: string, ports: Ports): Result {
  const { fs, git, tree } = ports;
  const word = argv[1] ?? "";
  const files = word === "done" || word === "stopped";
  if (!["start", "done", "stopped", "committed"].includes(word) || argv.length > (files ? 3 : 2)) return refuse(USAGE);
  const session = argv[0].trim();
  if (!/^[A-Za-z0-9._-]+$/.test(session) || /^\.+$/.test(session)) return refuse(`direct.sh: ${argv[0]} is no session id`);
  const root = tree.root(rawCwd.replaceAll("\\", "/").replace(/\/$/, ""));
  const stateFile = `${root}/.temp/viber/${session}/direct/state.json`;
  const dirty = (): string[] => runDirty(git.dirty(root, ["."]));
  const save = (state: State): boolean => fs.writeText(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  const unsaved = (): Result => refuse(`direct.sh: cannot write ${stateFile}`);

  if (word === "start") {
    // No resume: a start replaces what an earlier build of this session kept.
    const state: State = { before: git.head(root) === null ? null : dirty(), reported: [], paths: [], head: "" };
    return save(state) ? print("STARTED") : unsaved();
  }

  let state: State | null = null;
  try {
    state = JSON.parse(fs.readText(stateFile) ?? "null");
  } catch {
    return refuse(`direct.sh: cannot read ${stateFile}`);
  }
  if (state === null) return refuse(`direct.sh: no build of this session: call 'direct.sh <session-id> start' first`);
  const { before } = state;
  if (before === null) return print("END", "No git repository with a commit: nothing is committed.");
  const end = (made: string): Result => print("END", made, ...leftLines(dirty(), before, state.reported, state.paths));

  if (word === "committed") return end(state.paths.length === 0 ? "Nothing to commit." : commitLine("The change is", state.head, git.head(root)));
  state.reported = pathsOf(root, argv[2] ?? "");
  state.paths = word === "done" ? changePaths(dirty(), before, state.reported, []) : [];
  state.head = git.head(root) ?? "";
  if (!save(state)) return unsaved();
  if (word === "stopped") return end("Nothing is committed: the build stopped.");
  return state.paths.length === 0 ? end("Nothing to commit.") : print("SKILL: viber:commit", state.paths.join(" "));
}
