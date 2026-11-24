/*
 * shell-guard.critical.test.ts - the critical tier of
 * viber/hooks/scripts/shell-guard.sh: a task coder is refused a chain, a git
 * state change, rm, a file write and an inline interpreter with the right rule
 * winning and JSON-escaped reasons, while its ordinary commands and a
 * lookalike agent type are let through; every viber agent is refused a cd to
 * a glob, variable or command substitution target and let through a literal one.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by shell-guard.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/shell-guard.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { deny, R1_TEXT, R1, r1With, R4, R6, runCommand, CODER, r4With } from "./shell-guard-fixture.ts";

const R2 = deny("git is read-only here (status, diff, log, show) - compare with git show HEAD:<path> or git diff instead.");
const R5 = deny("Bash never runs inline or scratch interpreter code - change a file with Edit or Write, and run tests and project scripts by their own command.");
const GUARDED = [CODER, "viber:task-reviewer", "viber:final-reviewer"];

test("DoD.2: a part holding a double quote reaches the reason JSON-escaped and the output parses as JSON", async () => {
  const out = await runCommand('echo "a b" && ls', CODER);
  assert.equal(out, r1With('Run instead, one call each: `echo \\"a b\\"` then `ls`.'));
  assert.equal(
    JSON.parse(out).hookSpecificOutput.permissionDecisionReason,
    `viber guard: ${R1_TEXT} Run instead, one call each: \`echo "a b"\` then \`ls\`.`,
  );
});

const gitForbidden = ["git stash", "git -C sub checkout main", "git restore x", "git clean -fd"];

for (const agent of GUARDED) {
  for (const command of gitForbidden) {
    test(`DoD.3: from ${agent}, ${JSON.stringify(command)} is refused with the R2 deny object`, async () => {
      assert.equal(await runCommand(command, agent), R2);
    });
  }
}

const gitForms = [
  "git -c core.x=y stash pop",
  "git --git-dir=.git --work-tree=. restore x",
  "git --no-pager checkout -b new",
  "git --git-dir .git stash",
  "cd sub\ngit stash",
  "(git clean -fd)",
  "echo $(git stash list)",
  "ls | git restore --stdin",
];

for (const command of gitForms) {
  test(`${JSON.stringify(command)} is refused with the R2 deny object (git in command position behind global options, a newline, a substitution or a pipe)`, async () => {
    assert.equal(await runCommand(command, CODER), R2);
  });
}

const r3With = (suffix: string): string => deny(`remove a file or directory with git rm -r -q -- <path>, never rm. ${suffix}`);

const rmWithSuffix: Array<[string, string]> = [
  ["rm -rf build/out a.txt", "Run instead: `git rm -r -q -- build/out a.txt`."],
  ["rm x", "Run instead: `git rm -r -q -- x`."],
  ["rm -f -- -odd.txt a.txt", "Run instead: `git rm -r -q -- -odd.txt a.txt`."],
  ["rm   -r  dir/  # old", "Run instead: `git rm -r -q -- dir/`."],
];

for (const [command, suffix] of rmWithSuffix) {
  test(`DoD.1: from viber:task-coder, ${JSON.stringify(command)} is refused with the R3 reason ending on the git rm form`, async () => {
    assert.equal(await runCommand(command, CODER), r3With(suffix));
  });
}

test("a chain holding rm is refused as R1 first (the first matching rule gives the one deny)", async () => {
  assert.equal(await runCommand("true || rm x", CODER), R1);
});

test("a command matching R2 and R3 is refused as R2 (rule order, not position in the command)", async () => {
  assert.equal(await runCommand("rm x | git stash", CODER), R2);
});

test("DoD.1: a command holding a double quote reaches the R4 reason JSON-escaped and the output parses as JSON", async () => {
  const out = await runCommand('echo "a b" > out.log', CODER);
  assert.equal(out, r4With('Run instead: `echo \\"a b\\" > .temp/out.log`.'));
  assert.equal(
    JSON.parse(out).hookSpecificOutput.permissionDecisionReason,
    'viber guard: Bash never writes a file - change it with Edit or Write, and redirect scratch output only under .temp/. Run instead: `echo "a b" > .temp/out.log`.',
  );
});

const interpreterForbidden = [
  "python -c 'print(1)'",
  "python2 -c 'print 1'",
  "python3 -c 'import os'",
  "python3 -Bc 'print(1)'",
  "python3 -B -c 'print(1)'",
  "python3 -u -W ignore -c 'print(1)'",
  "node -e 'console.log(1)'",
  "node --eval 'console.log(1)'",
  "node --eval=1",
  "node -p '1+1'",
  "node --print '1+1'",
  "node -pe '1+1'",
  "node -r ts-node/register -e 'x()'",
  "node --import tsx -e 'x()'",
  "ruby -e 'puts 1'",
  "ruby -we 'puts 1'",
  "ruby -I lib -e 'puts 1'",
  "perl -e 'print 1'",
  "perl -E 'say 1'",
  "perl -ne 'print' f",
  "perl -le 'print 1'",
  "perl -MList::Util -e 'print 1'",
  "perl -I lib -e 'print 1'",
  "python .temp/viber/T1/probe.py",
  "python3 -B ./.temp/probe.py",
  "python2 .temp/p.py",
  "node .temp/viber/T1/probe.mjs",
  "node --test .temp/viber/T1/x.test.js",
  "node -r ts-node/register .temp/p.js",
  "ruby .temp/p.rb",
  "perl ./.temp/p.pl",
  "bash .temp/viber/T1/run.sh",
  "sh ./.temp/run.sh",
  "bash -x .temp/run.sh",
  "bash -o pipefail .temp/run.sh",
  "echo go | python -c 'print(1)'",
  "(node -e 'x')",
  "ls\nnode -e 'x'",
  "node -e 'x' > .temp/out.log",
];

for (const command of interpreterForbidden) {
  test(`DoD.1-2: from viber:task-coder, ${JSON.stringify(command)} is refused with the R5 deny object`, async () => {
    assert.equal(await runCommand(command, CODER), R5);
  });
}

test("DoD.1: perl -pi -e stays R4 (rule order: the write rule is tried before the interpreter rule)", async () => {
  assert.equal(await runCommand("perl -pi -e 's/a/b/' f", CODER), R4);
});

test("DoD.1: a chain holding inline interpreter code is refused as R1 first", async () => {
  assert.equal(await runCommand("ls && node -e 'x'", CODER), r1With("Run instead, one call each: `ls` then `node -e 'x'`."));
});

const allowed = [
  'grep -n "a;b" f',
  "grep -n 'a && b' f",
  "echo a\\;b",
  "find . -name x -exec cat {} \\;",
  "ls | grep a",
  "git rm -r -q -- old",
  "git update-index --chmod=+x -- s.sh",
  "git status",
  "git diff HEAD~1",
  "git show HEAD:a.ts",
  "git log --oneline -5",
  "grep -n rm notes.md",
  "rmdir build",
  "npm test > /dev/null 2>&1",
  "npm test > /tmp/log.txt",
  "npm test > .temp/viber/T1/log.txt",
  "npm test > ./.temp/viber/T1/log.txt 2>&1",
  "npm test 2>&1",
  "echo x >&2",
  "echo x >&-",
  "echo x >&.temp/x",
  "echo x > $OUT",
  "echo x > ~/log.txt",
  'echo "x > src/a.ts"',
  "echo 'sed -i x'",
  "sed -n 's/a/b/p' f",
  "echo x | tee /tmp/a.txt",
  "python -m pytest",
  "python -m pytest -c pytest.ini",
  "python -B -m pytest -c pytest.ini",
  "python3 tools/gen.py",
  "python3 tools/gen.py -c conf",
  "python3 -W ignore tools/gen.py",
  "python3 --version",
  "node --test",
  "node scripts/x.js",
  "node scripts/x.js -e prod",
  "node -r ts-node/register scripts/x.js -p 3",
  "node --import tsx scripts/x.js --print",
  "ruby -Itest test/x_test.rb",
  "ruby -rdebug x.rb",
  "ruby -I lib x.rb -e foo",
  "perl -Ilib t/a.t",
  "perl -MTest::More t/a.t",
  "perl t/a.t -e foo",
  "bash scripts/run.sh",
  "sh -x scripts/run.sh",
  "bash -o pipefail scripts/run.sh",
  'bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/shell-guard.sh"',
  "bash -c '.temp/x.sh'",
  "python - < .temp/x.py",
  "echo python -c x",
  "grep -n 'node -e' notes.md",
  "git commit -m 'git stash and rm x'",
  "echo a\nls",
  "# a; b",
  "ls # a && b",
];

for (const command of allowed) {
  test(`DoD.6-8: from viber:task-coder, ${JSON.stringify(command)} prints nothing`, async () => {
    assert.equal(await runCommand(command, CODER), "");
  });
}

test("a bare viber:task-coder prefix match (viber:task-coder-extra) is not a guarded agent", async () => {
  assert.equal(await runCommand("git stash", "viber:task-coder-extra"), "");
});

const REVIEWER = "viber:task-reviewer";

// The first row is the call a harness deny rule refused whole: the permission check
// could not tell where the relative `tasks` lay after the glob cd.
const cdUnresolved = [
  "cd /repo/docs/_specs/2026-11-24-19-29-03*; ls . tasks work; cat tasks/T10.md | head -30",
  "cd docs/_specs/2026-11-24*/tasks && grep -n x T1.md",
  "cd $RUN",
  'cd "$RUN/tasks"',
  "cd $(git rev-parse --show-toplevel)",
  "cd `pwd`/docs",
  "cd docs/$(date +%Y)",
  "cd -P docs/run?",
  "cd -- docs/[rs]un",
  "pushd docs/run*",
  "ls; cd docs/run*",
];

// The rule holds every viber agent, so the last rows name the coder and three
// agents no other rule guards.
const cdRefused: Array<[string, string]> = [
  ...cdUnresolved.map((command): [string, string] => [command, REVIEWER]),
  ...[CODER, "viber:test-runner", "viber:closeout", "viber:critic"].map((agent): [string, string] => ["cd docs/run*", agent]),
];

for (const [command, agent] of cdRefused) {
  test(`from ${agent}, ${JSON.stringify(command)} is refused as R6 (a cd the harness cannot resolve ends the run on DENIED)`, async () => {
    assert.equal(await runCommand(command, agent), R6);
  });
}
