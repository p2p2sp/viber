/*
 * shell-guard.test.ts - proves viber/hooks/scripts/shell-guard.sh, the PreToolUse
 * hook on Bash that refuses the coder's and the reviewers' forbidden shell and
 * git commands.
 *
 * What it must do: for viber:task-coder, refuse with the one-line deny object a
 * chained command (an unquoted ;, && or ||), the git subcommands stash, checkout,
 * restore and clean, rm, and a file write through Bash (sed -i, perl -pi, a
 * redirect or tee onto a relative path outside .temp/); for viber:task-reviewer
 * and viber:final-reviewer, only the four git subcommands. Every other command,
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

import { runScript } from "../harness/run.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/shell-guard.sh");
const HOOKS_JSON = path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json");

function deny(reason: string): string {
  return `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"viber guard: ${reason}"}}\n`;
}

const R1 = deny("one command per Bash call - run each part of the chain as its own Bash call.");
const R2 = deny("git is read-only here (status, diff, log, show) - compare with git show HEAD:<path> or git diff instead.");
const R3 = deny("remove a file or directory with git rm -r -q -- <path>, never rm.");
const R4 = deny("Bash never writes a file - change it with Edit or Write, and redirect scratch output only under .temp/.");

// hooks.json invokes the script as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/shell-guard.sh"`,
// so the harness runs it through bash the same way.
async function run(input: string): Promise<string> {
  const result = await runScript(SUT, [], { shell: "bash", input });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.doesNotMatch(result.stdout, /"permissionDecision"\s*:\s*"allow"/);
  return result.stdout;
}

async function runCommand(command: string, agentType?: string): Promise<string> {
  const payload: Record<string, unknown> = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } };
  if (agentType !== undefined) payload.agent_type = agentType;
  return await run(JSON.stringify(payload));
}

const CODER = "viber:task-coder";
const GUARDED = [CODER, "viber:task-reviewer", "viber:final-reviewer"];

const chained = ["make build && make test", "a; b", "a || b", "cd sub && ls", "ls;"];

for (const command of chained) {
  test(`DoD.1-2: from viber:task-coder, ${JSON.stringify(command)} is refused with the R1 deny object`, async () => {
    assert.equal(await runCommand(command, CODER), R1);
  });
}

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

const rmForbidden = ["rm -rf build", "ls | xargs -r rm", "xargs -n 1 -I {} rm {}", "echo x\nrm y", "echo $(rm y)"];

for (const command of rmForbidden) {
  test(`DoD.4: from viber:task-coder, ${JSON.stringify(command)} is refused with the R3 deny object`, async () => {
    assert.equal(await runCommand(command, CODER), R3);
  });
}

test("a chain holding rm is refused as R1 first (the first matching rule gives the one deny)", async () => {
  assert.equal(await runCommand("true || rm x", CODER), R1);
});

test("a command matching R2 and R3 is refused as R2 (rule order, not position in the command)", async () => {
  assert.equal(await runCommand("rm x | git stash", CODER), R2);
});

const writeForbidden = [
  "sed -i 's/a/b/' f",
  "sed --in-place=.bak 's/a/b/' f",
  "perl -pi -e 's/a/b/' f",
  "perl -i.bak -ne 'print' f",
  "echo x > src/a.ts",
  "echo x >> src/a.ts",
  "echo x &> out.txt",
  "echo x 2> err.log",
  "echo x >out.txt",
  "echo x > ../other/a.ts",
  "echo hi >&out.txt",
  "echo hi >& out.txt",
  "echo hi 1>&out.txt",
  "cat f | tee src/a.ts",
  "tee -a notes.md",
];

for (const command of writeForbidden) {
  test(`DoD.5: from viber:task-coder, ${JSON.stringify(command)} is refused with the R4 deny object`, async () => {
    assert.equal(await runCommand(command, CODER), R4);
  });
}

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
  "perl -ne 'print' f",
  "perl -MList::Util -e 'print 1'",
  "echo x | tee /tmp/a.txt",
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

test("a bare viber:task-coder prefix match (viber:task-coder-extra) is not a guarded agent", async () => {
  assert.equal(await runCommand("git stash", "viber:task-coder-extra"), "");
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
  assert.equal(await runCommand("echo " + "x".repeat(20000) + "; rm y", CODER), R1);
});

const markerRows: Array<[string, string]> = [
  ["R1", "a && b"],
  ["R2", "git stash"],
  ["R3", "rm x"],
  ["R4", "tee a.txt"],
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

test("DoD.15: the hooks.json description names shell-guard.sh, says every hook fails open and still names planning.plain-plan-review and the schema note", () => {
  const description: string = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).description;
  assert.match(description, /shell-guard\.sh/);
  assert.match(description, /Every hook fails open/);
  assert.match(description, /planning\.plain-plan-review/);
  assert.match(description, /schema note/);
});
