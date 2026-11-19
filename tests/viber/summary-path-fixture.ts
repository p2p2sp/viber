/*
 * summary-path-fixture.ts - the helpers summary-path.test.ts and
 * summary-path.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/intent/scripts/summary-path.sh. It holds no case of its
 * own.
 */

import path from "node:path";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/intent/scripts/summary-path.sh");
