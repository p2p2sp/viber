/*
 * app-wait-fixture.ts - the helpers app-wait.test.ts and
 * app-wait.critical.test.ts share: what both tiers need to seed a case and run
 * viber/skills/e2e/scripts/app-wait.sh. It holds no case of its own.
 */

import path from "node:path";
import { withStub } from "../harness/stub.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/e2e/scripts/app-wait.sh");

/** Runs `fn` with a `curl` stub answering `code` and a `sleep` that returns at once. */
export async function withApp<T>(code: string, fn: (stubDirs: string[]) => Promise<T>): Promise<T> {
  return withStub("curl", `printf '%s' ${code}`, (curlDir) =>
    withStub("sleep", "exit 0", (sleepDir) => fn([curlDir, sleepDir])),
  );
}
