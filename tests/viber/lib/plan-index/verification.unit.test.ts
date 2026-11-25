/*
 * verification.unit.test.ts - what a task's Verification command may not be: one
 * that leaves an integration test of the task unnamed, a git grep over a file the
 * task creates, inline interpreter code, a script under .temp/ or a command
 * wrapped in backticks.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { planBody } from "../../plan-body.ts";
import { answerOf, indexOf, refused } from "./scene.ts";

const verify = (verification: string, files = "src/a.ts", tree: Record<string, string> = {}) => answerOf(indexOf(planBody([{ id: "T1", files, verification }], 1), [], { files: tree }));

const STORE = "backend/A.IntegrationTests/StoreTests.cs";
const PROJECT = "backend/A.IntegrationTests/A.IntegrationTests.csproj";
const layered = (path: string): string => `FIX: task T1: Files writes ${path} under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)`;

for (const verification of [
  "dotnet test backend/Other/Other.csproj -> green",
  "dotnet test backend -> green",
  `grep -c Store ${STORE} src/Store.cs -> 2`,
  `git grep -c Store --untracked ${STORE} -> 1`,
  `rg -c Store ${STORE} -> 1`,
  `dotnet test src/Store.csproj | grep Store ${STORE} -> 1`,
  `dotnet test src/Store.csproj ; grep -c Store ${STORE} -> 1`,
  `dotnet test src/Store.csproj, grep -c Store ${STORE} -> 1`,
  `dotnet test src/Store.csproj && grep -c Store ${STORE} -> 1`,
  `dotnet test src/Store.csproj || grep -c Store ${STORE} -> 1`,
]) {
  test(`"${verification}" leaves the integration test file of its task unnamed`, () => {
    assert.deepEqual(verify(verification, STORE), refused(4, layered(STORE)));
  });
}

for (const verification of [
  `dotnet build ${PROJECT} -> green`,
  `dotnet test ${STORE} --list-tests -> lists them`,
  "dotnet test backend/A.IntegrationTests/ --list-tests -> lists them",
  `grep -c Store src/Store.cs && dotnet build ./${PROJECT} -> green`,
  "PENDING",
]) {
  test(`"${verification}" passes for a task writing an integration test file`, () => {
    assert.equal(verify(verification, STORE).exit, 0);
  });
}

for (const path of ["tests/integration/store.test.ts", "backend/Store.Integration_Tests/store.cs", "backend/store-integrationtest/store.cs", "src/store.integration.test.ts"]) {
  test(`${path} is an integration test file`, () => {
    assert.deepEqual(verify("npm test -> green", path), refused(4, layered(path)));
  });
}

for (const path of ["docs/third-party-integrations.md", "viber/references/integration-tests.md"]) {
  test(`${path}, whose file name alone matches, is no integration test file`, () => {
    assert.equal(verify("npm test -> green", path).exit, 0);
  });
}

const TOOL = "tools/new.ts";
for (const verification of [`git grep -c readRuns -- ${TOOL} -> 1`, `git grep -c readRuns ${TOOL} -> 1`, `npm test && git grep -c readRuns -- ${TOOL} -> 1`, `npm test | git grep -c readRuns -- ${TOOL} -> 1`]) {
  test(`"${verification}" over a file the tree lacks reads nothing`, () => {
    assert.deepEqual(verify(verification, TOOL), refused(4, `FIX: task T1: Verification runs git grep without --untracked over ${TOOL}, which this task creates and git grep never reads - add --untracked or use grep (Provable)`));
  });
}

const READS: Array<[string, string, string, Record<string, string>]> = [
  ["git grep --untracked", `git grep --untracked -c readRuns -- ${TOOL} -> 1`, TOOL, {}],
  ["git grep with --untracked after the pattern", `git grep -c readRuns --untracked -- ${TOOL} -> 1`, TOOL, {}],
  ["plain grep", `grep -c readRuns ${TOOL} -> 1`, TOOL, {}],
  ["a git grep over a path the tree holds", `git grep -c readRuns -- ${TOOL} -> 1`, TOOL, { [TOOL]: "x\n" }],
  ["a git grep over a path the task does not list", `git grep -c readRuns -- ${TOOL} -> 1`, "src/a.ts", {}],
];
for (const [label, verification, files, tree] of READS) {
  test(`${label} passes`, () => {
    assert.equal(verify(verification, files, tree).exit, 0);
  });
}

const TAIL = "run a project test or script instead (Provable)";
const inline = (what: string): string => `FIX: task T1: Verification runs inline interpreter code "${what}" - ${TAIL}`;
const scratch = (path: string): string => `FIX: task T1: Verification runs ${path} under .temp/ - ${TAIL}`;
const REFUSED: Array<[string, string]> = [
  ["`npm test` -> green", "FIX: task T1: Verification is wrapped in backticks - write the command bare (Provable)"],
  ['node -e "process.exit(0)" -> green', inline("node -e")],
  ['python -c "print(1)" -> green', inline("python -c")],
  ['python3 -c "print(1)" -> green', inline("python3 -c")],
  ['ruby -e "puts 1" -> green', inline("ruby -e")],
  ['perl -e "print 1" -> green', inline("perl -e")],
  ['npm test && node --no-warnings -e "1" -> green', inline("node -e")],
  ["bash .temp/run.sh -> green", scratch(".temp/run.sh")],
  ["./.temp/run.sh -> green", scratch("./.temp/run.sh")],
  ["node --no-warnings .temp/run.mjs -> green", scratch(".temp/run.mjs")],
];
for (const [verification, line] of REFUSED) {
  test(`the Verification "${verification}" is refused`, () => {
    assert.deepEqual(verify(verification), refused(4, line));
  });
}

for (const verification of [
  "node --test tests/a.test.ts -> green",
  "grep -c 'node -e' docs/a.md -> 1",
  "grep -c 'a; node -e' docs/a.md -> 1",
  "node --test x > .temp/log -> green",
  "node > .temp/log x -> green",
  "grep x .temp/a.md -> 1",
  "CI=true node --test x -> green",
]) {
  test(`the Verification "${verification}" passes`, () => {
    assert.equal(verify(verification).exit, 0);
  });
}
