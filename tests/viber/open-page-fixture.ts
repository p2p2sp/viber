/*
 * open-page-fixture.ts - the helpers open-page.test.ts and
 * open-page.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/open-page.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { slash } from "../harness/paths.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/open-page.sh");

export type Stub = [name: string, body: string];

/** Nests one `withStub` per entry and hands `fn` every stub dir. */
export async function withStubs<T>(stubs: Stub[], fn: (dirs: string[]) => T, dirs: string[] = []): Promise<T> {
  if (stubs.length === 0) return fn(dirs);
  const [[name, body], ...rest] = stubs;
  return await withStub(name, body, (dir) => withStubs(rest, fn, [...dirs, dir]));
}

/** A stub body that writes its argv, one per line, to `log`. */
export function logArgs(log: string, exit = 0): string {
  return `printf '%s\\n' "$@" > "${slash(log)}"\nexit ${exit}`;
}

/** `settle` runs after the script exits but before the stubs are removed: an
 *  opener the script started in the background may not have exec'd its stub
 *  yet, and deleting the stub dir first would leave it nothing to run. */
export function run(dir: string, stubs: Stub[], env: Record<string, string> = {}, settle: () => void | Promise<void> = () => {}) {
  const page = path.join(dir, "page.html");
  fs.writeFileSync(page, "<!doctype html>");
  return withStubs(stubs, async (stubDirs) => {
    const result = await runScript(SUT, [page], { cwd: dir, env: { PATH: coreUtilsPath(), ...env }, stubDirs });
    await settle();
    return result;
  });
}
