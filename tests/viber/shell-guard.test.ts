/*
 * shell-guard.test.ts - proves viber/hooks/scripts/shell-guard.sh, the PreToolUse
 * hook on Bash that refuses the coder's and the reviewers' forbidden shell and
 * git commands.
 *
 * What it must do: for viber:task-coder, refuse with the one-line deny object a
 * chained command (an unquoted ;, && or ||), the git subcommands stash, checkout,
 * restore and clean, rm, and a file write through Bash (sed -i, perl -pi, a
 * redirect or tee onto a relative path outside .temp/), and inline interpreter
 * code or a .temp/ script run through an interpreter (python -c, node -e,
 * ruby -e, perl -e, bash .temp/x.sh); for viber:task-reviewer
 * and viber:final-reviewer, only the four git subcommands; for every viber
 * agent, a cd or pushd to a glob, variable or command substitution target.
 * Every other command,
 * every other caller and unreadable input print nothing, every deny reason opens
 * with the "viber guard: " marker, and every case exits 0. The last cases pin
 * its registration and description in hooks/hooks.json and the rationale in the
 * script header.
 *
 * Payloads are built as JS objects through JSON.stringify, never hand-escaped:
 * the script reads raw text and has to unescape the command itself.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/shell-guard.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SUT, deny, R1_TEXT, R1, r1With, R4, R6, run, runCommand, CODER, r4With } from "./shell-guard-fixture.ts";

const HOOKS_JSON = path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json");
const R3 = deny("remove a file or directory with git rm -r -q -- <path>, never rm.");

const chained: Array<[string, string]> = [
  ["git status && git diff", "Run instead, one call each: `git status` then `git diff`."],
  ["make build && make test", "Run instead, one call each: `make build` then `make test`."],
  ["a; b", "Run instead, one call each: `a` then `b`."],
  ["grep 'a;b' f && ls | wc", "Run instead, one call each: `grep 'a;b' f` then `ls | wc`."],
  ["(a) && b", "Run instead, one call each: `(a)` then `b`."],
  ["npm test && cd x", "Run instead, one call each: `npm test` then `cd x`."],
];

for (const [command, suffix] of chained) {
  test(`DoD.1: from viber:task-coder, ${JSON.stringify(command)} is refused with the R1 reason ending on the separate calls`, async () => {
    assert.equal(await runCommand(command, CODER), r1With(suffix));
  });
}

test("DoD.2: a part holding a backslash reaches the reason JSON-escaped and the output parses as JSON", async () => {
  const out = await runCommand("printf 'x\\y' && ls", CODER);
  assert.equal(
    JSON.parse(out).hookSpecificOutput.permissionDecisionReason,
    `viber guard: ${R1_TEXT} Run instead, one call each: \`printf 'x\\y'\` then \`ls\`.`,
  );
});

const R4_TEXT = "Bash never writes a file - change it with Edit or Write, and redirect scratch output only under .temp/.";

// Each row: the refused command, then the reason JSON.parse must give back, the backslashes of the
// suggested command kept (bash 5.2 runs with patsub_replacement on, where a backslash in a
// replacement string is eaten).
const backslashRows: Array<[string, string, string]> = [
  ["DoD.1", 'grep -n "a\\.b" src/x.ts && ls', `${R1_TEXT} Run instead, one call each: \`grep -n "a\\.b" src/x.ts\` then \`ls\`.`],
  ["DoD.2", "echo a\\ b && ls", `${R1_TEXT} Run instead, one call each: \`echo a\\ b\` then \`ls\`.`],
  ["DoD.3", 'grep -rn "foo\\|bar" src > hits.txt', `${R4_TEXT} Run instead: \`grep -rn "foo\\|bar" src > .temp/hits.txt\`.`],
];

for (const [clause, command, reason] of backslashRows) {
  test(`${clause}: ${JSON.stringify(command)} gets deny output that parses as JSON with every backslash of the suggested command kept`, async () => {
    const out = await runCommand(command, CODER);
    assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecisionReason, `viber guard: ${reason}`);
  });
}

const chainedNoSuffix = ["a && b\nc", "a &&\nb", "a;\tb\tc && d", "ls;", ";ls", "(a && b)", "echo $(a && b) && c", "echo `a; b` && c", "(a; b) || c"];

for (const command of chainedNoSuffix) {
  test(`DoD.3: from viber:task-coder, ${JSON.stringify(command)} is refused with today's R1 reason alone`, async () => {
    assert.equal(await runCommand(command, CODER), R1);
  });
}

// A split of these chains would change what runs (an || guard, a cd, export, source or assignment
// feeding a later part), so the refusal carries no "Run instead" suffix.
const chainedSplitChangesMeaning = [
  "test -f a.txt || echo missing",
  "a && b || c; d",
  "cd packages/api && npm test",
  "cd x && make && make test",
  "make && cd x && make test",
  "pushd x && ls",
  "export NODE_ENV=test && npm test",
  "source env.sh && make",
  ". env.sh && make",
  "FOO=1 && make",
];

for (const command of chainedSplitChangesMeaning) {
  test(`DoD.1: from viber:task-coder, ${JSON.stringify(command)} is refused with the R1 reason alone (splitting it would change what runs)`, async () => {
    assert.equal(await runCommand(command, CODER), R1);
  });
}

const rmForbidden = [
  "ls | xargs rm",
  "ls | xargs -r rm",
  "xargs -n 1 -I {} rm {}",
  "echo x\nrm y",
  "echo $(rm y)",
  "rm *.log",
  "rm a?.log",
  "rm a[12].log",
  "rm $TARGET",
  'rm "a b"',
  "rm 'a'",
  "rm a\\ b",
  "rm -rf",
  "rm -rf --",
  "rm a > removed.log",
  "rm a | cat",
];

for (const command of rmForbidden) {
  test(`DoD.2: from viber:task-coder, ${JSON.stringify(command)} is refused with today's R3 reason alone`, async () => {
    assert.equal(await runCommand(command, CODER), R3);
  });
}

const redirectWithSuffix: Array<[string, string, string]> = [
  ["DoD.1", "npm test > out.log", "Run instead: `npm test > .temp/out.log`."],
  ["DoD.2", "ls > ./out.log", "Run instead: `ls > .temp/out.log`."],
  ["DoD.1", "echo x >> notes.md", "Run instead: `echo x >> .temp/notes.md`."],
  ["DoD.1", "echo x >| out.txt", "Run instead: `echo x >| .temp/out.txt`."],
  ["DoD.1", "echo x &> out.txt", "Run instead: `echo x &> .temp/out.txt`."],
  ["DoD.1", "echo x 2> err.log", "Run instead: `echo x 2> .temp/err.log`."],
  ["DoD.1", "echo x >out.txt", "Run instead: `echo x >.temp/out.txt`."],
  ["DoD.1", "ls | wc > count.txt", "Run instead: `ls | wc > .temp/count.txt`."],
];

for (const [clause, command, suffix] of redirectWithSuffix) {
  test(`${clause}: from viber:task-coder, ${JSON.stringify(command)} is refused with the R4 reason ending on the command with its target under .temp/`, async () => {
    assert.equal(await runCommand(command, CODER), r4With(suffix));
  });
}

const writeForbidden = [
  "sed -i 's/a/b/' f",
  "sed --in-place=.bak 's/a/b/' f",
  "perl -pi -e 's/a/b/' f",
  "perl -i.bak -ne 'print' f",
  "sed -i s/a/b/ f.txt",
  "echo x | tee f.txt",
  "echo x > src/a.ts",
  "echo x >> src/a.ts",
  "echo x > ../other/a.ts",
  "ls > ../out.log",
  "ls > logs/out.log",
  'ls > "out file.log"',
  "ls > 'out.log'",
  "ls > out\\ file.log",
  "npm test > out.log 2>&1",
  "echo x > a.txt 2> b.txt",
  "echo x > a.txt | tee c.txt",
  "echo x > out$N.log",
  "echo hi >&out.txt",
  "echo hi >& out.txt",
  "echo hi 1>&out.txt",
  "cat f | tee src/a.ts",
  "tee -a notes.md",
];

for (const command of writeForbidden) {
  test(`DoD.3: from viber:task-coder, ${JSON.stringify(command)} is refused with today's R4 reason alone`, async () => {
    assert.equal(await runCommand(command, CODER), R4);
  });
}

for (const agent of ["viber:task-reviewer", "viber:final-reviewer", "viber:test-runner", "Explore", undefined]) {
  for (const command of ["node -e 'x'", "python3 .temp/probe.py"]) {
    test(`DoD.3: from ${agent ?? "the main session"}, ${JSON.stringify(command)} prints nothing (only the task coder is held to R5)`, async () => {
      assert.equal(await runCommand(command, agent), "");
    });
  }
}

for (const agent of ["viber:task-reviewer", "viber:final-reviewer"]) {
  for (const command of ["a && b", "rm x", "echo x > src/a.ts", "sed -i s/a/b/ f"]) {
    test(`DoD.9: from ${agent}, ${JSON.stringify(command)} prints nothing (a reviewer is held to the git rule alone)`, async () => {
      assert.equal(await runCommand(command, agent), "");
    });
  }
}

const everyGuardedCommand = ["a && b", "git stash", "rm x", "sed -i s/a/b/ f", "echo x > src/a.ts"];

for (const command of everyGuardedCommand) {
  test(`DoD.10: ${JSON.stringify(command)} from the main session prints nothing`, async () => {
    assert.equal(await runCommand(command), "");
  });

  test(`DoD.10: ${JSON.stringify(command)} from a non-viber agent prints nothing`, async () => {
    assert.equal(await runCommand(command, "Explore"), "");
  });

  test(`DoD.10: ${JSON.stringify(command)} from viber:test-runner prints nothing`, async () => {
    assert.equal(await runCommand(command, "viber:test-runner"), "");
  });
}

const cdResolved = [
  "cd /repo/docs/_specs/2026-11-24-19-29-03_slug; ls . tasks work",
  "cd",
  "cd -",
  "cd ..",
  "cd ~/x",
  "cd 'docs/run*'",
  'cd "docs/run*"',
  "cd docs/run\\*",
  "cd '$RUN'",
  "cd docs && ls *.md",
  "ls docs/run*",
  "echo cd docs/run*",
];

for (const command of cdResolved) {
  test(`from viber:task-reviewer, ${JSON.stringify(command)} prints nothing (a literal cd target, or no cd at all, is no R6 case)`, async () => {
    assert.equal(await runCommand(command, "viber:task-reviewer"), "");
  });
}

for (const agent of ["Explore", undefined]) {
  test(`from ${agent ?? "the main session"}, a cd to a glob path prints nothing (R6 is for viber agents)`, async () => {
    assert.equal(await runCommand("cd docs/run*", agent), "");
  });
}

test("from viber:test-runner, a cd to a glob path is refused as R6 (the one rule holding an agent outside the coder and the reviewers)", async () => {
  assert.equal(await runCommand("cd docs/run*", "viber:test-runner"), R6);
});

test("a command quoting agent_type text does not make a main-session call a coder one (only the top-level key counts)", async () => {
  assert.equal(await runCommand('echo "agent_type":"viber:task-coder"', undefined), "");
});

test("DoD.11: malformed JSON prints nothing", async () => {
  assert.equal(await run('{"agent_type":"viber:task-coder","tool_input":{"command":"git stash'), "");
});

test("DoD.11: empty stdin prints nothing", async () => {
  assert.equal(await run(""), "");
});

test("a guarded agent payload with no command prints nothing", async () => {
  assert.equal(await run(JSON.stringify({ agent_type: CODER, tool_input: {} })), "");
});

test("DoD.12: a very long command still exits 0 with the deny object", async () => {
  const first = "echo " + "x".repeat(20000);
  assert.equal(await runCommand(first + "; rm y", CODER), r1With(`Run instead, one call each: \`${first}\` then \`rm y\`.`));
});

const markerRows: Array<[string, string]> = [
  ["R1", "a && b"],
  ["R2", "git stash"],
  ["R3", "rm x"],
  ["R4", "tee a.txt"],
  ["R5", "node -e x"],
  ["R6", "cd docs/run*"],
];

for (const [rule, command] of markerRows) {
  test(`DoD.13: the ${rule} deny reason opens with the viber guard marker`, async () => {
    assert.match(await runCommand(command, CODER), /"permissionDecisionReason":"viber guard: [^"]+"\}\}\n$/);
  });
}

// The header comment is the rationale's documentation, the product DoD.14 names: its text is the behaviour.
const headerPhrases = [
  "one stash stack serves every coder sharing the tree",
  "one refused part refuses a whole chained call",
  "a scripted substitution missing its pattern exits 0 on unchanged code",
  "an unquoted newline is deliberately not refused",
  "a file edit by another route",
  "R5 interpreter",
  "a cd whose target it cannot resolve",
];

for (const phrase of headerPhrases) {
  test(`DoD.14: the script header states "${phrase}"`, () => {
    const header = fs.readFileSync(SUT, "utf8").split("\nset -u")[0];
    assert.ok(header.includes(phrase), `missing from the header: ${phrase}`);
  });
}

test("DoD.15: hooks.json holds a PreToolUse Bash entry running shell-guard.sh through bash with timeout 10, beside kill-guard.sh", () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).hooks.PreToolUse as Array<{
    matcher: string;
    hooks: Array<{ type: string; command: string; timeout: number }>;
  }>;
  const entries = hooks.filter((h) => h.matcher === "Bash").flatMap((h) => h.hooks);
  const guard = entries.find((x) => x.command === 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/shell-guard.sh"');
  assert.equal(guard?.timeout, 10);
  assert.ok(entries.some((x) => x.command === 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/kill-guard.sh"'));
});

test("DoD.15: the hooks.json description names shell-guard.sh, says every hook fails open and still names planning.outside-plan-review and the schema note", () => {
  const description: string = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).description;
  assert.match(description, /shell-guard\.sh/);
  assert.match(description, /Every hook fails open/);
  assert.match(description, /planning\.outside-plan-review/);
  assert.match(description, /schema note/);
});

test("DoD.4: the hooks.json description names the R5 refusal (inline interpreter code and a .temp/ script run through an interpreter)", () => {
  const description: string = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).description;
  assert.match(description, /inline interpreter code/);
  assert.match(description, /\.temp\/ script/);
});

test("DoD.4: the script header contract lists the R5 refusal and the rule order up to R6", () => {
  const header = fs.readFileSync(SUT, "utf8").split("\nset -u")[0];
  assert.ok(header.includes("R5 (coder):"));
  assert.ok(header.includes("Rules are tried in the order R1, R2, R3, R4, R5, R6."));
});
