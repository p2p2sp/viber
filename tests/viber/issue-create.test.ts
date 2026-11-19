/*
 * issue-create.test.ts - proves viber/scripts/issue-create.sh's
 * `issue-create.sh <body file> <title> [--type <T>] [--label <L>]...
 * [--assignee <A>]... [--project <P>]...` contract against a stubbed `gh`:
 * the body always travels through `--body-file`, every --label/--assignee/
 * --project pair is forwarded to `gh issue create` verbatim and in order,
 * ISSUE_URL/ISSUE_NUMBER are printed only once gh returned a well-formed
 * issue URL, TYPE is none/applied/dropped/error depending on the `gh api`
 * PATCH outcome (and that PATCH always carries `--hostname <host>` for the
 * issue's own host, github.com included), a failed PATCH never removes the
 * created issue, `--parent <N>` looks up the new issue's id and POSTs it to
 * the parent's sub_issues endpoint (PARENT=applied|error|none, a failure never
 * removing the issue), the body file is removed once the issue exists and kept
 * on a failed create, and bad arguments or a missing body file exit 2 with gh
 * never invoked.
 *
 * issue-create.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell, never executed directly. `gh` is
 * always a withStub, or absent - this test never shells out to the real gh.
 * A case run over several inputs registers one test per input row.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/issue-create.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { coreUtilsPath } from "../harness/stub.ts";
import { SUT, assertPosix, ISSUE_URL, runStubbed } from "./issue-create-fixture.ts";

// --- bad arguments ----------------------------------------------------------------

for (const args of [[], ["only-body.md"]]) {
  test(`a missing body file or title argument (${JSON.stringify(args)}): exit 2 and gh is never called`, async () => {
    await assertPosix(async (shell) => {
      const result = await runScript(SUT, args, { shell });
      assert.equal(result.status, 2);
      assert.match(result.stderr, /need <body file> <title>/);
      assert.equal(result.stdout, "");
    });
  });
}

test("a body file that does not exist: exit 2 and gh is never called (nothing half-created)", async () => {
  await assertPosix(async (shell) => {
    const result = await runScript(SUT, ["does-not-exist.md", "A title"], { shell });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^ERROR issue-create\.sh: body file not found: does-not-exist\.md$/m);
    assert.equal(result.stdout, "");
  });
});

for (const args of [["<body>", "A title", "--bogus"], ["<body>", "A title", "--type"], ["<body>", "A title", "--label"]]) {
  test(`an unknown flag or a flag missing its value (${JSON.stringify(args.slice(2))}): exit 2 and gh is never called`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runStubbed(shell, args);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(calls.length, 0);
    });
  });
}

// --- gh missing or create failing --------------------------------------------------

const ghOnCorePath = coreUtilsPath()
  .split(path.delimiter)
  .some((dir) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(dir, n))));

test(
  "gh not on PATH: exit 1 with one ERROR line naming gh",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withTempDir("p2p2-issue-create-", async (cwd) => {
        const body = path.join(cwd, "body.md");
        fs.writeFileSync(body, "body\n");
        const result = await runScript(SUT, [body, "A title"], { shell, cwd, env: { PATH: coreUtilsPath() } });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^ERROR issue-create\.sh: gh not found on PATH$/m);
      });
    });
  },
);

for (const out of ["", "not a url\n", "https://github.com/acme/widgets/pull/42\n"]) {
  test(`gh issue create exits 0 but prints no parsable issue URL (${JSON.stringify(out)}): exit 1, nothing on stdout`, async () => {
    await assertPosix(async (shell) => {
      const { result } = await runStubbed(shell, ["<body>", "A title"], { CREATE_STDOUT: out });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^ERROR issue-create\.sh: gh issue create failed:/);
    });
  });
}

// --- --project <owner>/<number> -------------------------------------------------------

test("--project <owner>/<number> is resolved to the project's title by gh project view and reaches gh issue create as --project <title>", async () => {
  await assertPosix(async (shell) => {
    const { result, calls, body } = await runStubbed(shell, ["<body>", "A title", "--label", "bug", "--project", "octo-org/44"], {
      CREATE_STDOUT: ISSUE_URL + "\n",
      PROJECT_STDOUT: "Roadmap",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], ["project", "view", "44", "--owner", "octo-org", "--format", "json", "--jq", ".title"]);
    assert.deepEqual(calls[1], ["issue", "create", "--title", "A title", "--body-file", body, "--label", "bug", "--project", "Roadmap"]);
  });
});

for (const stub of [
  { PROJECT_EXIT: "1", PROJECT_STDERR: "could not resolve to a ProjectV2" },
  { PROJECT_EXIT: "0", PROJECT_STDOUT: "" },
] as Record<string, string>[]) {
  test(`--project <owner>/<number> whose lookup fails (${JSON.stringify(stub)}): exit 1, the ERROR line on stderr, nothing on stdout and no gh issue create`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls, bodyKept } = await runStubbed(shell, ["<body>", "A title", "--project", "octo-org/44"], {
        CREATE_STDOUT: ISSUE_URL + "\n",
        ...stub,
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "ERROR issue-create.sh: project octo-org/44 not found\n");
      assert.ok(bodyKept, "a failed lookup keeps the body file");
      assert.ok(!calls.some((c) => c[0] === "issue"), "no issue is created");
    });
  });
}

for (const value of ["Roadmap", "octo-org/Roadmap", "a/b/44"]) {
  test(`--project ${value} is not an <owner>/<number> reference: it reaches gh issue create unchanged and no lookup runs`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls, body } = await runStubbed(shell, ["<body>", "A title", "--project", value], { CREATE_STDOUT: ISSUE_URL + "\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(calls, [["issue", "create", "--title", "A title", "--body-file", body, "--project", value]]);
    });
  });
}

// --- success, --type applied on a non-github.com host --------------------------------

test("--type applied: a non-github.com host's issue URL PATCHes repos/<owner>/<repo>/issues/<N> with --hostname <that host>, TYPE=applied", async () => {
  await assertPosix(async (shell) => {
    const url = "https://github.example.com/acme/widgets/issues/7";
    const { result, calls } = await runStubbed(shell, ["<body>", "A title", "--type", "bug"], { CREATE_STDOUT: url + "\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `ISSUE_URL=${url}\nISSUE_NUMBER=7\nTYPE=applied\nPARENT=none\n`);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], ["api", "--hostname", "github.example.com", "-X", "PATCH", "repos/acme/widgets/issues/7", "-f", "type=bug"]);
  });
});

for (const msg of ["issue types are not enabled for this repository", "HTTP 404: Not Found", "HTTP 403: Forbidden"]) {
  test(`--type PATCH fails on a benign reason (${msg}): TYPE=dropped, TYPE_ERROR carries the message, and the issue is never removed`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runStubbed(shell, ["<body>", "A title", "--type", "bug"], {
        CREATE_STDOUT: ISSUE_URL + "\n",
        API_EXIT: "1",
        API_STDERR: msg,
      });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `ISSUE_URL=${ISSUE_URL}\nISSUE_NUMBER=42\nTYPE=dropped\nTYPE_ERROR=${msg}\nPARENT=none\n`);
      assert.ok(!calls.some((c) => c.includes("delete")), "the created issue must never be deleted");
    });
  });
}

// --- --template -----------------------------------------------------------------------

const BUG_TEMPLATE = ".github/ISSUE_TEMPLATE/bug.yml";
const BUG_TEMPLATE_YAML = [
  "name: Bug report",
  "description: Something is broken",
  "type: Bug",
  "labels: [bug, triage]",
  "assignees:",
  "  - octocat",
  "projects: [Roadmap]",
  "body:",
  "  - type: textarea",
  "",
].join("\n");

test("--template applies the template's type, labels, assignees and project: they reach gh issue create, the type is PATCHed and TYPE=applied", async () => {
  await assertPosix(async (shell) => {
    const { result, calls, body } = await runStubbed(
      shell,
      ["<body>", "A title", "--template", BUG_TEMPLATE],
      { CREATE_STDOUT: ISSUE_URL + "\n" },
      { [BUG_TEMPLATE]: BUG_TEMPLATE_YAML },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `ISSUE_URL=${ISSUE_URL}\nISSUE_NUMBER=42\nTYPE=applied\nPARENT=none\n`);
    const create = calls.find((c) => c[0] === "issue");
    assert.deepEqual(create, [
      "issue", "create", "--title", "A title", "--body-file", body,
      "--label", "bug", "--label", "triage", "--assignee", "octocat", "--project", "Roadmap",
    ]);
    assert.deepEqual(calls.find((c) => c[0] === "api"), ["api", "--hostname", "github.com", "-X", "PATCH", "repos/acme/widgets/issues/42", "-f", "type=Bug"]);
  });
});

for (const flag of [["--type", "Bug"], ["--label", "bug"], ["--assignee", "octocat"], ["--project", "Roadmap"]]) {
  test(`--template together with ${flag[0]}: exit 2, one ERROR line and gh is never called`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls, bodyKept } = await runStubbed(
        shell,
        ["<body>", "A title", "--template", BUG_TEMPLATE, ...flag],
        { CREATE_STDOUT: ISSUE_URL + "\n" },
        { [BUG_TEMPLATE]: BUG_TEMPLATE_YAML },
      );
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^ERROR issue-create\.sh: --template cannot be combined with --type, --label, --assignee or --project$/m);
      assert.equal(result.stderr.split("\n").filter((l) => l.length > 0).length, 1, result.stderr);
      assert.ok(bodyKept, "a refused call keeps the body file");
      assert.equal(calls.length, 0);
    });
  });
}

test("--template naming a path no template block holds: exit 2, one ERROR line naming the path, nothing created", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(
      shell,
      ["<body>", "A title", "--template", ".github/ISSUE_TEMPLATE/missing.yml"],
      { CREATE_STDOUT: ISSUE_URL + "\n" },
      { [BUG_TEMPLATE]: BUG_TEMPLATE_YAML },
    );
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^ERROR issue-create\.sh: .*\.github\/ISSUE_TEMPLATE\/missing\.yml/);
    assert.equal(result.stderr.split("\n").filter((l) => l.length > 0).length, 1, result.stderr);
    assert.ok(!calls.some((c) => c[0] === "issue"), "no issue is created");
  });
});

test("--template when issue-templates.sh answers a skip block: exit 2, one ERROR line carrying its SAY sentence, nothing created", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["<body>", "A title", "--template", BUG_TEMPLATE], { CREATE_STDOUT: ISSUE_URL + "\n" });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^ERROR issue-create\.sh: .*no issue form template in \.github\/ISSUE_TEMPLATE/);
    assert.equal(result.stderr.split("\n").filter((l) => l.length > 0).length, 1, result.stderr);
    assert.ok(!calls.some((c) => c[0] === "issue"), "no issue is created");
  });
});

// --- --parent -------------------------------------------------------------------------

for (const args of [
  ["<body>", "A title", "--parent"],
  ["<body>", "A title", "--parent", "abc"],
  ["<body>", "A title", "--parent", "7x"],
  ["<body>", "A title", "--parent", "0"],
  ["<body>", "A title", "--parent", "-3"],
]) {
  test(`--parent with a missing or non-numeric value (${JSON.stringify(args.slice(2))}): exit 2, the ERROR line on stderr and gh is never called`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runStubbed(shell, args);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^ERROR issue-create\.sh: --parent needs an issue number$/m);
      assert.equal(calls.length, 0);
    });
  });
}

test("--parent 7 looks up the new issue's id and POSTs it to repos/<owner>/<repo>/issues/7/sub_issues with --hostname <host>, PARENT=applied", async () => {
  await assertPosix(async (shell) => {
    const url = "https://github.example.com/acme/widgets/issues/42";
    const { result, calls } = await runStubbed(shell, ["<body>", "A title", "--parent", "7"], {
      CREATE_STDOUT: url + "\n",
      LOOKUP_STDOUT: "9001",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `ISSUE_URL=${url}\nISSUE_NUMBER=42\nTYPE=none\nPARENT=applied\n`);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1], ["api", "--hostname", "github.example.com", "repos/acme/widgets/issues/42", "--jq", ".id"]);
    assert.deepEqual(calls[2], ["api", "--hostname", "github.example.com", "-X", "POST", "repos/acme/widgets/issues/7/sub_issues", "-F", "sub_issue_id=9001"]);
  });
});

test("--parent after --type: the TYPE lines come before the PARENT line", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["<body>", "A title", "--parent", "7", "--type", "bug"], {
      CREATE_STDOUT: ISSUE_URL + "\n",
      LOOKUP_STDOUT: "9001",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `ISSUE_URL=${ISSUE_URL}\nISSUE_NUMBER=42\nTYPE=applied\nPARENT=applied\n`);
  });
});

test("--parent: the id lookup fails: PARENT=error with a one-line PARENT_ERROR, exit 0, no POST and the issue never removed", async () => {
  await assertPosix(async (shell) => {
    const msg = "HTTP 500: Internal Server Error";
    const { result, calls, bodyKept } = await runStubbed(shell, ["<body>", "A title", "--parent", "7"], {
      CREATE_STDOUT: ISSUE_URL + "\n",
      LOOKUP_EXIT: "1",
      LOOKUP_STDERR: msg + "\nsecond line",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(bodyKept, false);
    assert.equal(result.stdout, `ISSUE_URL=${ISSUE_URL}\nISSUE_NUMBER=42\nTYPE=none\nPARENT=error\nPARENT_ERROR=${msg} second line\n`);
    assert.equal(calls.length, 2);
    assert.ok(!calls.some((c) => c.includes("delete")), "the created issue must never be deleted");
  });
});

test("--parent: the sub-issue POST fails: PARENT=error with a one-line PARENT_ERROR, exit 0 and the issue never removed", async () => {
  await assertPosix(async (shell) => {
    const msg = "HTTP 422: Validation Failed";
    const { result, calls } = await runStubbed(shell, ["<body>", "A title", "--parent", "7"], {
      CREATE_STDOUT: ISSUE_URL + "\n",
      LOOKUP_STDOUT: "9001",
      POST_EXIT: "1",
      POST_STDERR: msg,
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `ISSUE_URL=${ISSUE_URL}\nISSUE_NUMBER=42\nTYPE=none\nPARENT=error\nPARENT_ERROR=${msg}\n`);
    assert.ok(!calls.some((c) => c.includes("delete")), "the created issue must never be deleted");
  });
});
