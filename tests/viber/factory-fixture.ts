/*
 * factory-fixture.ts - the helpers factory.test.ts and
 * factory.critical.test.ts share: what both tiers need to seed a case and run
 * viber/skills/factory/scripts/factory.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withStub } from "../harness/stub.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/factory/scripts/factory.sh");

// Stub argv: -NoProfile -ExecutionPolicy Bypass -File <ps1> -Command <command> -ArgsB64 <base64>
export const STUB = [
  'd="$(dirname "$0")"',
  'echo "$7 $9" >> "$d/calls.log"',
  'if [ -f "$d/fail.txt" ]; then cat "$d/fail.txt"; exit 1; fi',
  'case "$7" in',
  '  pending) cat "$d/pending.txt" ;;',
  '  screen) cat "$d/screen.txt" ;;',
  `  *) n=$(grep -c -v -e '^pending ' -e '^screen ' "$d/calls.log"); cat "$d/after-$n.txt" ;;`,
  "esac",
].join("\n");

export const PENDING = [
  "== pending s1: status waiting (dialog)",
  "tool: AskUserQuestion",
  "Q1 [DB] Which database?",
  "  1. Postgres - relational",
  "  2. SQLite - embedded",
  "  3. MySQL - popular",
].join("\n");

export const HEAD = "== screen s1 (pid 4242), last 40 lines\n Which database?\n";
export const SCREEN_ON_1 = `${HEAD} ❯ 1. Postgres\n   2. SQLite\n   3. MySQL\n   4. Type something.`;
export const SCREEN_ON_3 = `${HEAD}   1. Postgres\n   2. SQLite\n ❯ 3. MySQL\n   4. Type something.`;
export const SCREEN_CLOSED = "== screen s1 (pid 4242), last 40 lines\n Thanks, using MySQL.";

export type Run = { status: number | null; stdout: string; stderr: string; calls: string[] };

export async function drive(args: string[], files: Record<string, string>): Promise<Run> {
  return withStub("powershell.exe", STUB, async (stubDir) => {
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(stubDir, name), text);
    const result = await runScript(SUT, args, { cwd: stubDir, stubDirs: [stubDir], shell: "bash" });
    const logPath = path.join(stubDir, "calls.log");
    const lines = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean) : [];
    const calls = lines.map((line) => {
      const [command, b64 = ""] = line.split(" ");
      const decoded = Buffer.from(b64, "base64").toString("utf8").split("\0").slice(0, -1);
      return `${command}:${decoded.join("|")}`;
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
  });
}
