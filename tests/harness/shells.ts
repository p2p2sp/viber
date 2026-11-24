/*
 * shells.ts - discovers the real shell binaries present on THIS machine, so
 * a script test can exercise every one that is actually here and skip (never
 * fail) the ones that are not.
 *
 * Scope, per the plan: a `#!/usr/bin/env bash` script always runs under
 * bash, so it is exercised under every distinct bash MAJOR present (macOS
 * ships 3.2, Linux/Git-Bash ship 5.x - that's where real divergence lives).
 * A `#!/bin/sh` script goes through every POSIX shell present: `/bin/sh`,
 * `dash`, `busybox sh` and `bash --posix`. `busybox sh` and `bash --posix`
 * are two-token invocations ("busybox sh script", "bash --posix script"),
 * so a resolved shell is an ARGV - either a bare interpreter path or a
 * [path, ...prefixArgs] tuple - which `RunOpts.shell` accepts as-is. No
 * generated wrapper script is involved: an extensionless shim is not
 * spawnable on Windows, where `bash --posix` is the only POSIX shell there
 * is.
 *
 * Which runs take the full matrix (every shell, every bash major): a critical
 * file (`*.critical.test.ts`) when `CI` is set to `true` or `1` - GitHub
 * Actions sets it on every job - and every file when `P2P2_SHELL_MATRIX=full`,
 * which the legacy workflow (`legacy.yml`) sets. Any other run takes the first shell that
 * resolves and records every other candidate as a `ShellSkip`: a spawned
 * shell is the suite's dominant cost, so the many logic cases pay for one
 * shell and the few critical ones for all of them. `P2P2_SHELL_MATRIX=first`
 * forces one shell everywhere.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** Whether a run of `file` under `env` takes the full shell matrix. */
export function fullShellMatrix(env: Record<string, string | undefined>, file: string | undefined): boolean {
  if (env.P2P2_SHELL_MATRIX === "full") return true;
  if (env.P2P2_SHELL_MATRIX === "first") return false;
  const ci = env.CI === "true" || env.CI === "1";
  return ci && /\.critical\.test\.ts$/.test(file ?? "");
}

/** True when every shell present runs; false runs only the first one. */
export const FULL_SHELL_MATRIX = fullShellMatrix(process.env, process.argv[1]);

/** An interpreter path, or [path, ...prefixArgs] for a two-token shell. */
export type Shell = string | string[];

export interface ShellSkip {
  kind: "bash" | "posix";
  name: string;
  reason: string;
}

/** The executable of a resolved shell, whichever form it takes. */
export function shellBin(shell: Shell): string {
  return Array.isArray(shell) ? shell[0] : shell;
}

function isExecutable(candidate: string): boolean {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/* Discovery is memoised per PATH: `forEachShell` runs once per test case, and
 * re-scanning PATH (plus a `bash --version` probe per hit) hundreds of times
 * costs more than every script under test put together on Windows, where
 * process creation is the suite's dominant cost. */
const onPathCache = new Map<string, string[]>();
let bashShellsCache: { path: string; shells: string[] } | null = null;

/** Every executable named `name` found across PATH's directories (Windows:
 *  also `name.exe`/`name.cmd`/`name.bat`). */
function candidatesOnPath(name: string): string[] {
  const key = `${name}\u0000${process.env.PATH ?? ""}`;
  const cached = onPathCache.get(key);
  if (cached) return cached;
  const found = scanPath(name);
  onPathCache.set(key, found);
  return found;
}

function scanPath(name: string): string[] {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const exeNames = process.platform === "win32" ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name] : [name];
  const found: string[] = [];
  for (const dir of dirs) {
    for (const exe of exeNames) {
      const candidate = path.join(dir, exe);
      if (isExecutable(candidate)) found.push(candidate);
    }
  }
  return found;
}

function bashMajorVersion(bashPath: string): string | null {
  const result = spawnSync(bashPath, ["--version"], { encoding: "utf-8" });
  if (result.status !== 0 || !result.stdout) return null;
  const match = result.stdout.match(/version (\d+)\./);
  return match ? match[1] : null;
}

/** Every distinct bash on this machine, deduplicated by reported `--version`
 *  major (so bash 5.1 and 5.2 on the same box count once). Outside the full
 *  matrix it stops at the first working bash, so no other candidate is
 *  probed. */
export function bashShells(): string[] {
  const pathEnv = process.env.PATH ?? "";
  if (bashShellsCache !== null && bashShellsCache.path === pathEnv) return bashShellsCache.shells;
  const candidates = new Set<string>([...candidatesOnPath("bash"), "/bin/bash"]);
  const seenMajors = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    if (!isExecutable(candidate)) continue;
    const major = bashMajorVersion(candidate);
    if (major === null || seenMajors.has(major)) continue;
    seenMajors.add(major);
    result.push(candidate);
    if (!FULL_SHELL_MATRIX) break;
  }
  bashShellsCache = { path: pathEnv, shells: result };
  return result;
}

interface ShellCandidate {
  name: string;
  resolve: () => Shell | null;
}

function posixCandidates(): ShellCandidate[] {
  return [
    { name: "/bin/sh", resolve: () => (isExecutable("/bin/sh") ? "/bin/sh" : null) },
    { name: "dash", resolve: () => candidatesOnPath("dash")[0] ?? null },
    {
      name: "busybox sh",
      resolve: () => {
        const busybox = candidatesOnPath("busybox")[0];
        return busybox ? [busybox, "sh"] : null;
      },
    },
    {
      name: "bash --posix",
      resolve: () => {
        const bash = bashShells()[0];
        return bash ? [bash, "--posix"] : null;
      },
    },
  ];
}

/** Every POSIX shell present on this machine (see module doc for the list). */
export function posixShells(): Shell[] {
  return posixCandidates()
    .map((candidate) => candidate.resolve())
    .filter((resolved): resolved is Shell => resolved !== null);
}

function bashCandidates(): ShellCandidate[] {
  const found = bashShells();
  if (found.length === 0) {
    return [{ name: "bash", resolve: () => null }];
  }
  return found.map((bashPath) => ({ name: bashPath, resolve: () => bashPath }));
}

/** The binary a resolved shell runs plus its prefix args, symlinks followed:
 *  two candidates sharing it are one shell (`/bin/sh` is `dash` on Ubuntu). */
function shellIdentity(shell: Shell): string {
  const [bin, ...prefix] = Array.isArray(shell) ? shell : [shell];
  let real = bin;
  try {
    real = fs.realpathSync(bin);
  } catch {
    // an unresolvable path stays its own identity
  }
  return [real, ...prefix].join("\u0000");
}

/** Calls `fn(shellPath)` for every shell of `kind` present on this machine -
 *  only the first one outside the full matrix; records a `ShellSkip` (never
 *  throws) for each one that is absent, not run or the same binary as one
 *  already run. */
export async function forEachShell(
  kind: "bash" | "posix",
  fn: (shell: Shell) => void | Promise<void>,
): Promise<ShellSkip[]> {
  const candidates = kind === "bash" ? bashCandidates() : posixCandidates();
  const skips: ShellSkip[] = [];
  const seen = new Map<string, string>();
  for (const candidate of candidates) {
    if (seen.size > 0 && !FULL_SHELL_MATRIX) {
      skips.push({ kind, name: candidate.name, reason: "the full shell matrix runs only for critical files in CI" });
      continue;
    }
    const resolved = candidate.resolve();
    if (resolved === null) {
      skips.push({ kind, name: candidate.name, reason: "not found on this machine" });
      continue;
    }
    const identity = shellIdentity(resolved);
    const twin = seen.get(identity);
    if (twin !== undefined) {
      skips.push({ kind, name: candidate.name, reason: `the same binary as ${twin}` });
      continue;
    }
    seen.set(identity, candidate.name);
    await fn(resolved);
  }
  return skips;
}
