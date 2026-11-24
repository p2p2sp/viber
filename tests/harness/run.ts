/*
 * run.ts - runs a shipped script as a real subprocess and hands back its
 * stdout/stderr/exit status, the way an end user (or a SKILL.md `!` preload)
 * would invoke it: through an interpreter, never `import`ed. Asynchronous, so
 * the cases of one file run concurrently.
 *
 * Interpreter resolution:
 *   - `opts.shell` set        -> `<shell> <script> ...args` (used to force a
 *     script through a specific bash/POSIX shell binary, see shells.ts).
 *     A two-token shell ("bash --posix") is passed as an argv array and its
 *     prefix args are kept ahead of the script.
 *   - script ends in a JS/TS
 *     extension                -> `<node> <script> ...args` (works
 *     identically on every OS - no shebang involved).
 *   - otherwise, on win32      -> the OS does not honour a `#!` line, so the
 *     script's own shebang is read and the matching interpreter
 *     (bash/sh/node/...) is resolved from PATH by name. A bare command name
 *     is first looked up in `opts.stubDirs`, because CreateProcess only ever
 *     appends `.exe` and would otherwise walk straight past an extensionless
 *     stub to the real binary (see stub.ts).
 *   - otherwise (POSIX,
 *     no explicit shell)       -> the script (or bare command name, e.g.
 *     "git") is executed directly; the OS/exec resolves its shebang or PATH.
 *
 * Argument transport: argv is passed straight through, except on win32 for an
 * argument carrying a newline or carriage return - a control character no
 * CreateProcess command line survives. Those arguments are carried in the
 * environment and restored to argv by a shell preamble, so a test can exercise
 * a multi-line argument on every OS. See the `P2P2_ARGV` block below. On win32
 * an argv holding a glob character (`*`, `?`, `[`) runs under `MSYS=noglob`, and
 * one holding a double quote as well takes the environment route too, so both
 * reach the script verbatim.
 *
 * Crash retry: on win32 a run whose exit status is an NTSTATUS crash code
 * (0x80000000 or above, see `isWindowsCrash`) is started once more.
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface RunOpts {
  /** Absolute interpreter path, or [path, ...prefixArgs] for a two-token
   *  shell - when set, invoke `shell script ...args`. */
  shell?: string | string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Piped to the child's stdin. */
  input?: string;
  /** Prepended to PATH, in order, ahead of the sanitised base PATH. */
  stubDirs?: string[];
  /** Milliseconds; default 60000 - generous on purpose, because CI runs the
   *  files more concurrently than the runner has cores, so a spawn-heavy
   *  script can take several times its unloaded wall time. */
  timeout?: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  /** `null` when the process was killed by a signal (e.g. the timeout). */
  status: number | null;
}

/** Env vars a subprocess needs to run at all, kept minimal on purpose so a
 *  test's `opts.env` is the only source of script-specific configuration. */
const BASE_ENV_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SystemRoot",
  "windir",
  "ProgramFiles",
  "ComSpec",
  "PATHEXT",
  "LANG",
  "LC_ALL",
];

function sanitisedBaseEnv(): Record<string, string> {
  const base: Record<string, string> = {};
  for (const key of BASE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) base[key] = value;
  }
  return base;
}

function isExecutableFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** Reads a script's `#!` line and returns the interpreter to invoke it with
 *  by name (e.g. "bash", "sh", "node"), or `null` when there is none - used
 *  only on win32, where the shebang itself is never honoured by the OS. */
function shebangInterpreter(script: string): string | null {
  let firstLine: string;
  try {
    const contents = fs.readFileSync(script, "utf-8");
    firstLine = contents.split("\n", 1)[0];
  } catch {
    return null;
  }
  if (!firstLine.startsWith("#!")) return null;
  const parts = firstLine.slice(2).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const bin = path.basename(parts[0]).replace(/\.exe$/i, "");
  if (bin === "env") return parts[1] ?? null;
  return bin;
}

/** The shell to route an argv rewrite through: an explicit `opts.shell`, or
 *  a `#!` line naming one. `null` when the script runs any other way, which
 *  leaves the rewrite impossible. */
function shellInterpreter(script: string, opts: RunOpts): string[] | null {
  if (opts.shell) return Array.isArray(opts.shell) ? [...opts.shell] : [opts.shell];
  const interpreter = shebangInterpreter(script);
  return interpreter === "bash" || interpreter === "sh" ? [interpreter] : null;
}

/** A `withStub` stub matching the bare command name `script`, if any of
 *  `stubDirs` holds one - win32 only, where CreateProcess would ignore it. */
function stubbedCommand(script: string, stubDirs: string[]): string | null {
  if (script.includes("/") || script.includes("\\")) return null;
  for (const dir of stubDirs) {
    const candidate = path.join(dir, script);
    if (isExecutableFile(candidate) && shebangInterpreter(candidate)) return candidate;
  }
  return null;
}

function resolveCommand(script: string, args: string[], opts: RunOpts): { cmd: string; args: string[] } {
  if (opts.shell) {
    const [cmd, ...prefix] = Array.isArray(opts.shell) ? opts.shell : [opts.shell];
    return { cmd, args: [...prefix, script, ...args] };
  }
  if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(script)) {
    return { cmd: process.execPath, args: [script, ...args] };
  }
  if (process.platform === "win32") {
    const stub = stubbedCommand(script, opts.stubDirs ?? []);
    const target = stub ?? script;
    if (isExecutableFile(target)) {
      const interpreter = shebangInterpreter(target);
      if (interpreter) {
        return { cmd: interpreter, args: [target, ...args] };
      }
    }
  }
  return { cmd: script, args };
}

/** Runs `script` as a real subprocess, honoring its shebang (or PATH lookup
 *  for a bare command name like "git") on every OS. */
export function runScript(script: string, args: string[] = [], opts: RunOpts = {}): Promise<RunResult> {
  const env = { ...sanitisedBaseEnv(), ...(opts.env ?? {}) };
  if (opts.stubDirs && opts.stubDirs.length > 0) {
    env.PATH = [...opts.stubDirs, env.PATH ?? ""].filter(Boolean).join(path.delimiter);
  }
  // Windows only: an argument carrying a newline or carriage return cannot
  // reach a child through argv at all - a CreateProcess command line is ONE
  // string the child re-parses, and the control character truncates it there.
  // The environment block has no such limit, so such arguments travel as
  // `P2P2_ARGV<n>` and a one-line shell preamble restores them to argv before
  // the script runs, byte for byte. Only a shell can do that, so a script
  // invoked any other way is left alone (its caller must skip the case).
  // POSIX hands argv over as a real array and is never rewritten.
  // The same route carries an argv holding both a glob character and a double
  // quote: MSYS expands the first unless `noglob` is set, and under `noglob` it
  // no longer reads the `\"` node writes for the second (see the else branch).
  const globArg = args.some((arg) => /[*?[]/.test(arg));
  const quoteArg = args.some((arg) => arg.includes('"'));
  const controlCharArg = args.some((arg) => /[\r\n]/.test(arg));
  const needsEnvRoute = process.platform === "win32" && (controlCharArg || (globArg && quoteArg));
  const viaEnv = needsEnvRoute ? shellInterpreter(script, opts) : null;
  let cmd: string;
  let fullArgs: string[];
  if (viaEnv) {
    // Backslashes are what a shell cannot take here: dash resolves an `exec`
    // target through execve and rejects "C:\...", while every Win32 call
    // accepts "C:/..." just as readily - so both paths cross into the
    // preamble slash-separated. The child still receives the same file.
    const slashed = (target: string) => target.replace(/\\/g, "/");
    const [bin, ...prefix] = viaEnv;
    env.P2P2_ARGV_SHELL = slashed(bin);
    env.P2P2_ARGV_SCRIPT = slashed(script);
    const refs = args.map((arg, index) => {
      env[`P2P2_ARGV${index}`] = arg;
      return `"$P2P2_ARGV${index}"`;
    });
    // The preamble re-invokes the shell ON the script rather than `exec`ing
    // the script itself: a native Windows script path is something a shell
    // opens happily as an argument, but dash's `exec` (and `.`) resolve it
    // through execve and fail on the backslashes. The prefix tokens are this
    // harness's own ("--posix", "sh"), never test data.
    const prefixLiteral = prefix.map((token) => `"${token}"`).join(" ");
    cmd = bin;
    fullArgs = [
      ...prefix,
      "-c",
      `exec "$P2P2_ARGV_SHELL" ${prefixLiteral} "$P2P2_ARGV_SCRIPT" ${refs.join(" ")}`,
    ];
  } else {
    ({ cmd, args: fullArgs } = resolveCommand(script, args, opts));
    // Windows only: the MSYS runtime of a bash.exe expands "*", "?" and "[...]" in
    // an argument its native parent (node) hands it, so 'app/[id]/page.tsx' would
    // reach the script as 'app/i/page.tsx'. noglob keeps argv verbatim, as on POSIX.
    // Set only when no argument holds a double quote: noglob also changes how the
    // runtime splits a quoted command line, so an argv holding both travels by the
    // preamble route above, and reaches here only for a script no shell runs.
    if (process.platform === "win32" && globArg && !quoteArg && env.MSYS === undefined) env.MSYS = "noglob";
  }
  const spawnOpts = { cwd: opts.cwd, env, input: opts.input, timeout: opts.timeout ?? 60000 };
  return spawnCollect(cmd, fullArgs, spawnOpts).then((result) =>
    isWindowsCrash(result.status) ? spawnCollect(cmd, fullArgs, spawnOpts) : result,
  );
}

/** Windows only: an exit status of 0x80000000 or above is an NTSTATUS the OS
 *  set when the process crashed (an MSYS shell under a loaded runner dies with
 *  0x80000004 before running a line), never a code a script can exit with
 *  (POSIX exit codes stop at 255). Such a run says nothing about the script,
 *  so runScript starts it once more. */
export function isWindowsCrash(status: number | null, platform: string = process.platform): boolean {
  return platform === "win32" && status !== null && status >= 0x80000000;
}

/** Spawns without blocking the event loop, so the cases of one file can run
 *  concurrently (see test.ts). Settles once: on `close`, or on a spawn
 *  `error` for a child that never started. */
function spawnCollect(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env: Record<string, string>; input?: string; timeout: number },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (status: number | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stderr = Buffer.concat(err).toString("utf-8");
      resolve({
        stdout: Buffer.concat(out).toString("utf-8"),
        stderr: error && !stderr ? `${error.message}\n` : stderr,
        status,
      });
    };
    let child: ChildProcess;
    try {
      child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env });
    } catch (error) {
      settle(null, error as Error);
      return;
    }
    timer = setTimeout(() => child.kill("SIGTERM"), opts.timeout);
    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      if (child.pid === undefined) settle(null, error);
    });
    child.on("close", (code) => settle(code));
    child.stdin?.on("error", () => {});
    child.stdin?.end(opts.input);
  });
}
