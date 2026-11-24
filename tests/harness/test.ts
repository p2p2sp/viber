/*
 * test.ts - the `test()` every test file imports instead of node:test's own.
 * node:test runs a file's top-level tests one after another; this one collects
 * them and, once the file has finished loading, registers them inside one
 * suite named after the file with `concurrency` set, so a file's cases run in
 * parallel while each still reports, skips and filters (`--test-name-pattern`)
 * under its own name. Needs every case to be registered synchronously at load
 * (no top-level `await` before a `test()` call) and to share no mutable state
 * with another case of its file.
 *
 * Concurrency per file: `P2P2_TEST_CONCURRENCY` when set, else 4. It
 * multiplies with `--test-concurrency` (files at once).
 */

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { suite, test as nodeTest, type TestContext, type TestOptions } from "node:test";

type TestFn = (t: TestContext) => void | Promise<void>;

interface Case {
  name: string;
  options: TestOptions;
  fn: TestFn;
}

export function layerOf(fileName: string, hasCriticalSibling: boolean): "unit" | "integration" | "legacy" | null {
  const base = fileName.replaceAll("\\", "/").split("/").pop() ?? "";
  if (base.endsWith(".unit.test.ts")) return "unit";
  if (base.endsWith(".integration.test.ts")) return "integration";
  if (base.endsWith(".critical.test.ts") || base === "release.test.ts") return "legacy";
  if (base.endsWith(".test.ts") && hasCriticalSibling) return "legacy";
  return null;
}

/** Throws for a name layerOf gives null for. */
export function refuseUnmarked(fileName: string, hasCriticalSibling: boolean): void {
  if (layerOf(fileName, hasCriticalSibling) !== null) return;
  throw new Error(`${fileName} carries no layer marker: name it *.unit.test.ts or *.integration.test.ts`);
}

function guardFile(file: string): void {
  refuseUnmarked(file, fs.existsSync(file.replace(/\.test\.ts$/, ".critical.test.ts")));
  if (layerOf(file, false) !== "unit") return;
  net.Socket.prototype.connect = function connect(): never {
    throw new Error("unit tests stay off the network: open the connection in an integration test");
  };
}

if (process.argv[1]) guardFile(process.argv[1]);

const CONCURRENCY = Math.max(1, Number(process.env.P2P2_TEST_CONCURRENCY) || Math.min(4, os.availableParallelism()));

const cases: Case[] = [];

export function test(name: string, fn: TestFn): void;
export function test(name: string, options: TestOptions, fn: TestFn): void;
export function test(name: string, optionsOrFn: TestOptions | TestFn, maybeFn?: TestFn): void {
  const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn!;
  const options = typeof optionsOrFn === "function" ? {} : optionsOrFn;
  if (cases.push({ name, options, fn }) > 1) return;
  queueMicrotask(() => {
    void suite(path.basename(process.argv[1] ?? "tests"), { concurrency: CONCURRENCY }, () => {
      for (const c of cases) void nodeTest(c.name, c.options, c.fn);
    });
  });
}
