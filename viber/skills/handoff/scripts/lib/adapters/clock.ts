/*
 * clock.ts - the system clock adapter of the Clock port.
 */

import type { Clock } from "../ports.ts";

export const systemClock: Clock = {
  now() {
    return new Date();
  },
};
