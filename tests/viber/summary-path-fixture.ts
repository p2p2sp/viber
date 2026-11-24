/*
 * summary-path-fixture.ts - what summary-path.critical.test.ts uses to run
 * viber/skills/intent/scripts/summary-path.sh. It holds no case of its own.
 */

import path from "node:path";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/intent/scripts/summary-path.sh");
