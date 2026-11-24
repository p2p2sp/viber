/*
 * tree-record.ts - the tree-record core: records by name the paths the working
 * tree has changed and names every path changed since. The contract lives in
 * the header of ../skills/fixer/scripts/tree-record.ts.
 */

import { byteOrder } from "./byte-order.ts";
import type { Fs, Git } from "./ports.ts";
import { repoPrefix } from "./repo-prefix.ts";

export interface TreeRecordResult {
  stdout: string;
  stderr: string;
  exit: number;
}

const DIR = ".temp/viber/fixer";
const RECORD = `${DIR}/tree-record`;

function fail(reason: string): TreeRecordResult {
  return { stdout: "", stderr: `error: ${reason}\n`, exit: 2 };
}

const answer = (lines: string[]): TreeRecordResult => ({ stdout: lines.map((line) => `${line}\n`).join(""), stderr: "", exit: 0 });

/** A drive letter in lower case: c:/x for C:/x. */
const lowerDrive = (path: string): string => path[0].toLowerCase() + path.slice(1);

/**
 * The repo-relative form of a path: a leading ./ dropped once; under a drive
 * root an absolute C:/ or C:\ path below the root loses the root, the case of
 * the drive letter ignored; a relative path gains the prefix of the cwd. An
 * absolute path outside the root stays as given.
 */
function repoRelative(given: string, top: string, prefix: string): string {
  let path = given.startsWith("./") ? given.slice(2) : given;
  let root = top;
  if (/^[A-Za-z]:\//.test(root)) {
    if (/^[A-Za-z]:[\\/]/.test(path)) path = lowerDrive(path.replaceAll("\\", "/"));
    root = lowerDrive(root);
  }
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  return path.startsWith("/") || /^[A-Za-z]:\//.test(path) ? path : prefix + path;
}

/** The stdout, stderr and exit code of one tree-record call. Never throws. */
export function runTreeRecord(argv: string[], cwd: string, ports: { fs: Fs; git: Git }): TreeRecordResult {
  const mode = argv[0] ?? "";
  if (mode === "--save") {
    if (argv.length !== 1) return fail("--save takes no argument");
  } else if (mode === "--check") {
    if (argv.length > 2) return fail("--check takes at most one argument: the reproduction test path");
  } else if (mode === "") {
    return fail("no mode: tree-record.sh --save | --check [<reproduction test path>]");
  } else {
    return fail(`unknown mode: ${mode}`);
  }

  const here = cwd.replaceAll("\\", "/");
  const root = ports.git.repoRoot(here);
  if (root === null) return fail("not inside a git repository");
  const top = root.replace(/\/$/, "");
  const changed = [...new Set(ports.git.status(root).map((entry) => entry.path))].filter((path) => path !== "" && !path.startsWith(".temp/")).sort(byteOrder);

  if (mode === "--save") {
    if (!ports.fs.makeDir(`${top}/${DIR}`)) return fail(`cannot create ${DIR}`);
    const text = changed.map((path) => `${path}\n`).join("");
    if (!ports.fs.writeBytes(`${top}/${RECORD}`, new TextEncoder().encode(text))) return fail(`cannot write ${RECORD}`);
    return answer(["NEXT: trace", ...changed.map((path) => `recorded: ${path}`)]);
  }

  if (ports.fs.kind(`${top}/${RECORD}`) !== "file") return fail("no record file: run tree-record.sh --save before the first edit");
  const recorded = new Set((ports.fs.readText(`${top}/${RECORD}`) ?? "").split("\n"));
  const given = (argv[1] ?? "") === "" ? "" : repoRelative(argv[1], top, repoPrefix(here, root, ports.fs));
  const extra = changed.filter((path) => path !== given && !recorded.has(path));
  if (extra.length === 0) return answer(["NEXT: handoff"]);
  return answer(["STOP: changed since the record - revert before the handoff", ...extra.map((path) => `path: ${path}`)]);
}
