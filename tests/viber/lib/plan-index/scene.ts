/*
 * scene.ts - runs the plan-index core on fake ports for the unit files of this
 * directory: one run directory under the repository root, its plan in place. It
 * holds no case.
 */

import { fakeFs, fakeGit, fakeRepository, type FakeRepo, type FakeRepositoryOpts } from "../../../harness/fakes.ts";
import { runPlanIndex } from "../../../../viber/lib/plan-index/run.ts";
import type { Fs } from "../../../../viber/lib/ports.ts";
import { PLAN_DIR, PLAN_REL } from "../../plan-body.ts";

export const ROOT = "/r";
export const PLUGIN = "/plug";

export interface Scene {
  /** The files of the work tree beside the plan, repo-relative; an absolute path as it is. */
  files?: Record<string, string>;
  /** The lines of status.md; left out, no file: the plan never landed. */
  status?: string[];
  /** The text of .claude/viber.yml. */
  config?: string;
  dirs?: string[];
  /** What git answers; left out, no repository. */
  repo?: Partial<FakeRepo>;
  /** A repository git can write instead. */
  writes?: FakeRepositoryOpts;
  fs?: Partial<Fs>;
  cwd?: string;
}

/** One call of the core: argv follows the plan path. */
export function indexOf(plan: string, argv: string[] = [], given: Scene = {}, planArg = PLAN_REL) {
  const files: Record<string, string> = { [PLAN_REL]: plan, ...given.files };
  if (given.status !== undefined) files[`${PLAN_DIR}/status.md`] = ["# status", "", ...given.status, ""].join("\n");
  if (given.config !== undefined) files[".claude/viber.yml"] = given.config;
  const full = Object.entries(files).map(([path, text]): [string, string] => [/^(\/|[A-Z]:)/.test(path) ? path : `${ROOT}/${path}`, text]);
  const fs = { ...fakeFs(Object.fromEntries(full), { dirs: [ROOT, ...(given.dirs ?? [])] }), ...given.fs };
  const repository = fakeRepository(ROOT, fs, given.writes ?? { head: null });
  const git = given.writes !== undefined ? repository.git : fakeGit(given.repo === undefined ? null : { root: ROOT, tracked: [], ...given.repo });
  const call = (...args: string[]) => runPlanIndex(args, given.cwd ?? ROOT, `${PLUGIN}/scripts/plan-index.ts`, { fs, git, write: repository.write });
  const under = (dir: string): string[] => fs.listDir(`${ROOT}/${dir}`).flatMap((name) => (fs.kind(`${ROOT}/${dir}/${name}`) === "dir" ? under(`${dir}/${name}`) : [`${dir}/${name}`]));
  const result = call(...(planArg === "" ? [] : [planArg]), ...argv);
  return {
    ...result,
    lines: result.stdout.split("\n").slice(0, -1),
    fs,
    call,
    commits: repository.commits,
    write: repository.write,
    staged: () => repository.git.stagedFiles(ROOT, null)?.map((file) => file.path),
    /** The text of a file of the run directory. */
    read: (name: string): string | null => fs.readText(`${ROOT}/${PLAN_DIR}/${name}`),
    /** The files below the run directory. */
    run: (): string[] => under(PLAN_DIR).map((path) => path.slice(PLAN_DIR.length + 1)),
  };
}

/** The lines of stdout opening on one of the labels. */
export const labelled = (lines: string[], ...labels: string[]): string[] => lines.filter((line) => labels.some((label) => line.startsWith(`${label}:`)));

export const ok = (lines: string[]) => ({ stdout: lines.map((line) => `${line}\n`).join(""), stderr: "", exit: 0 });
export const refused = (exit: number, ...lines: string[]) => ({ stdout: "", stderr: lines.map((line) => `${line}\n`).join(""), exit });
/** What a call answered, without the rest of the scene. */
export const answerOf = ({ stdout, stderr, exit }: { stdout: string; stderr: string; exit: number }) => ({ stdout, stderr, exit });
