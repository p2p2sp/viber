/*
 * harness.unit.test.ts - proves the layer guard of harness/test.ts: which file
 * names carry a layer, the refusal of an unmarked one, and the network ban a
 * unit file runs under.
 */

import assert from "node:assert/strict";
import net from "node:net";
import { layerOf, refuseUnmarked, test } from "./harness/test.ts";

const LAYERS: Array<[string, boolean, string | null]> = [
  ["a.unit.test.ts", false, "unit"],
  ["a.integration.test.ts", false, "integration"],
  ["a.critical.test.ts", false, "legacy"],
  ["a.test.ts", true, "legacy"],
  ["release.test.ts", false, "legacy"],
  ["a.test.ts", false, null],
  ["a.ts", true, null],
];

for (const [name, sibling, layer] of LAYERS) {
  test(`layerOf gives ${layer} for ${name} (critical sibling: ${sibling})`, () => {
    assert.equal(layerOf(name, sibling), layer);
  });
}

test("the refusal of an unmarked test file names the layer markers", () => {
  assert.throws(() => refuseUnmarked("a.test.ts", false), /\*\.unit\.test\.ts.*\*\.integration\.test\.ts/);
});

test("the refusal lets a marked test file through", () => {
  assert.doesNotThrow(() => refuseUnmarked("a.unit.test.ts", false));
});

test("a network connection opened from a unit file fails saying unit tests stay off the network", () => {
  assert.throws(() => net.connect(9, "127.0.0.1"), /unit tests stay off the network/);
});
