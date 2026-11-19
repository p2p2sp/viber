/*
 * check-playwright-fixture.ts - the helpers check-playwright.test.ts and
 * check-playwright.critical.test.ts share: what both tiers need to seed a case
 * and run viber/scripts/check-playwright.sh. It holds no case of its own.
 */

import path from "node:path";

import { runScript } from "../harness/run.ts";
import { coreUtilsPath } from "../harness/stub.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/check-playwright.sh");

export const STUB_VERSION_1_2_3 = 'echo "1.2.3"';

export function run(dir: string, stubDirs: string[] = []) {
  return runScript(SUT, [], { cwd: dir, env: { PATH: coreUtilsPath() }, stubDirs });
}
