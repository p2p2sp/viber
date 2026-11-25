/*
 * commit-context.ts - the commit-context core: prints the directive line and
 * the context the commit fork composes its message from. The contract lives in
 * the header of ../skills/commit/scripts/commit-context.ts.
 */

import { readSelector } from "./commit-args.ts";
import { rootAbove } from "./plugin-root.ts";
import type { Fs, Git } from "./ports.ts";

const MAX_LINES = 400;

/** The issue numbers of the arguments, else the one the branch names as task.<n> or issue.<n>, as the footer line. */
function footer(refs: string[], branch: string): string {
  if (refs.length > 0) return `Refs: ${refs.map((n) => `#${n}`).join(", ")}`;
  const named = new Set([...branch.matchAll(/(?:task|issue)\.([0-9]+)/gi)].map((match) => match[1]));
  return named.size === 1 ? `Refs: #${[...named][0]}` : "none";
}

/** The diff capped so it cannot flood the fork. An empty one beside a non-empty status is new files: the bare line alone was once read as nothing to commit. */
function body(diff: string, status: string): string {
  if (diff === "" && status !== "") return "(no textual diff, but git status above lists changes - they are still committed: run commit.sh)\n";
  if (diff === "") return "(no textual diff for this mode)\n";
  const lines = diff.split("\n");
  const cut = lines.length > MAX_LINES ? `... [diff truncated: showing first ${MAX_LINES} of ${lines.length} lines - run git diff for the rest]\n` : "";
  return `${lines.slice(0, MAX_LINES).join("\n")}\n${cut}`;
}

/** The whole stdout of one commit-context call. script: the path the entry was started by. */
export function runCommitContext(argv: string[], cwd: string, script: string, ports: { fs: Fs; git: Git }): string {
  const { git } = ports;
  const { root, mode, paths, missing, refs } = readSelector(argv[0] ?? "", cwd, ports);
  if (mode === "missing") return `STOP: Nothing committed - paths not found: ${missing}\n`;

  const label = paths.join(" ");
  const named = mode === "paths";
  const scope = named ? paths : null;
  const branch = git.branch(root) ?? (git.commit(root, "HEAD") === null ? "" : "HEAD");
  const trimmed = (kind: "status" | "diff"): string => git.report(root, kind, scope).replace(/\n+$/, "");
  const status = trimmed("status");
  return [
    `RUN: "${rootAbove(script, 3)}/skills/commit/scripts/commit.sh" "<message>"${named ? ` '${label}'` : ""}\n`,
    `## Issue footer (after the subject and one blank line; none -> no footer)\n${footer(refs, branch)}\n`,
    `## Current branch\n${branch}\n`,
    `## Recent commit subjects (match this type/scope style)\n${git.report(root, "log", null)}`,
    `## Changes (git status${named ? ` for paths: ${label}` : ", all untracked files"})\n${status === "" ? "" : `${status}\n`}`,
    `## Overview (git diff HEAD --stat${named ? ` for paths: ${label}` : ""})\n${git.report(root, "stat", scope)}`,
    `## Diff (${named ? `changes vs HEAD for paths: ${label}; a new untracked file appears only in git status above` : "all tracked changes vs HEAD; new untracked files are listed in git status above"})\n${body(trimmed("diff"), status)}`,
  ].join("\n");
}
