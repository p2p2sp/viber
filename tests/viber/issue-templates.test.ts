/*
 * issue-templates.test.ts - proves viber/scripts/issue-templates.sh's
 * `issue-templates.sh` (no arguments) contract against a real git repo
 * fixture and a stubbed `gh`: the three skip checks run in order (templates
 * exist, gh on PATH, `gh repo view` resolves a repository), a ready run
 * prints `TITLE_PATTERN=` (config.sh's `github.issue-title`) after `REPO=` and
 * lists every `.github/ISSUE_TEMPLATE/*.yml|*.yaml` template but
 * `config.yml`/`config.yaml` and any `.md` file, in file name order, each
 * with its top-level `name`/`description`/`type`/`title`/`labels`/
 * `assignees`/`projects` fields read regardless of whether a list is written
 * inline (`[a, "b"]`), as a block of `- a` lines, or as one comma string,
 * surrounding quotes and CR stripped either way.
 *
 * issue-templates.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell, never executed directly. `gh` is
 * always a withStub, or absent - this test never shells out to the real gh.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/issue-templates.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo } from "../harness/tmp.ts";
import { coreUtilsPath } from "../harness/stub.ts";
import { assertPosix, writeTemplates, runStubbed } from "./issue-templates-fixture.ts";

const ghOnCorePath = coreUtilsPath()
  .split(path.delimiter)
  .some((dir) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(dir, n))));

function writeConfig(repoDir: string, content: string): void {
  fs.mkdirSync(path.join(repoDir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(repoDir, ".claude", "viber.yml"), content);
}

// --- bad arguments ----------------------------------------------------------------

test("any argument exits 2, gh never called", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, { "bug.yml": "name: Bug\ndescription: File a bug\n" });
      for (const args of [["x"], ["--help"]]) {
        const { result, calls } = await runStubbed(shell, repo.dir, repo.env, args, { GH_STDOUT: "https://github.com/acme/widgets\n" });
        assert.equal(result.status, 2, `args ${JSON.stringify(args)}: ${result.stderr}`);
        assert.equal(calls.length, 0);
      }
    });
  });
});

// --- skip reasons, in order ---------------------------------------------------------

test("no ISSUE_TEMPLATE directory: STATUS=skip REASON=no-templates, gh never called", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const { result, calls } = await runStubbed(shell, repo.dir, repo.env);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        "STATUS=skip\nREASON=no-templates\nSAY=no issue form template in .github/ISSUE_TEMPLATE\n",
      );
      assert.equal(calls.length, 0);
    });
  });
});

test("only config.yml/config.yaml and a .md file present: STATUS=skip REASON=no-templates", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, {
        "config.yml": "blank_issues_enabled: false\n",
        "config.yaml": "blank_issues_enabled: false\n",
        "readme.md": "# not a form\n",
      });
      const { result, calls } = await runStubbed(shell, repo.dir, repo.env);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        "STATUS=skip\nREASON=no-templates\nSAY=no issue form template in .github/ISSUE_TEMPLATE\n",
      );
      assert.equal(calls.length, 0);
    });
  });
});

test(
  "templates exist but gh is not on PATH: STATUS=skip REASON=no-gh",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        writeTemplates(repo.dir, { "bug.yml": "name: Bug\ndescription: File a bug\n" });
        const { result, calls } = await runStubbed(shell, repo.dir, repo.env, [], {}, true);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(
          result.stdout,
          "STATUS=skip\nREASON=no-gh\nSAY=the GitHub command line tool gh is not installed\n",
        );
        assert.equal(calls.length, 0);
      });
    });
  },
);

test("gh is on PATH but `gh repo view` resolves no repository: STATUS=skip REASON=no-repo", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, { "bug.yml": "name: Bug\ndescription: File a bug\n" });
      const { result, calls } = await runStubbed(shell, repo.dir, repo.env, [], { GH_EXIT: "1", GH_STDERR: "no remote\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        "STATUS=skip\nREASON=no-repo\nSAY=no GitHub repository is reachable from here\n",
      );
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].slice(0, 2), ["repo", "view"]);
    });
  });
});

// --- ready ---------------------------------------------------------------------

test("ready: TITLE_PATTERN= follows REPO= carrying the github.issue-title of .claude/viber.yml", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, { "bug.yml": "name: Bug report\ndescription: File a bug\n" });
      writeConfig(repo.dir, 'github:\n  issue-title: "[{template-title}] {summary}"\n');
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(result.stdout.split("\n").slice(1, 3), [
        "REPO=https://github.com/acme/widgets",
        "TITLE_PATTERN=[{template-title}] {summary}",
      ]);
    });
  });
});

test("ready: with no .claude/viber.yml TITLE_PATTERN= carries the default {summary}", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, { "bug.yml": "name: Bug report\ndescription: File a bug\n" });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^TITLE_PATTERN=\{summary\}$/m);
    });
  });
});

test("skip with a configured github.issue-title still prints only STATUS=skip, REASON= and SAY= (no TITLE_PATTERN= outside a ready run)", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, { "bug.yml": "name: Bug\ndescription: File a bug\n" });
      writeConfig(repo.dir, "github:\n  issue-title: {summary}\n");
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_EXIT: "1", GH_STDERR: "no remote\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        "STATUS=skip\nREASON=no-repo\nSAY=no GitHub repository is reachable from here\n",
      );
    });
  });
});

test("ready: a template with no labels/assignees/projects/type/title prints them empty", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, { "bug.yml": "name: Bug report\ndescription: File a bug\n" });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        "STATUS=ready\n" +
          "REPO=https://github.com/acme/widgets\n" +
          "TITLE_PATTERN={summary}\n" +
          "--- template .github/ISSUE_TEMPLATE/bug.yml ---\n" +
          "NAME=Bug report\n" +
          "DESCRIPTION=File a bug\n" +
          "TYPE=\n" +
          "TITLE=\n" +
          "LABELS=\n" +
          "ASSIGNEES=\n" +
          "PROJECTS=\n",
      );
    });
  });
});

test("ready: inline [a, \"b\"] list syntax is parsed into a comma-joined LABELS/ASSIGNEES/PROJECTS line", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, {
        "bug.yml":
          'name: Bug report\ndescription: File a bug\nlabels: [bug, "needs triage"]\nassignees: ["octocat", "hubot"]\nprojects: [octo-org/1]\n',
      });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^LABELS=bug, needs triage$/m);
      assert.match(result.stdout, /^ASSIGNEES=octocat, hubot$/m);
      assert.match(result.stdout, /^PROJECTS=octo-org\/1$/m);
    });
  });
});

test("ready: a block of '- item' lines under a list key is parsed the same as the inline form", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, {
        "bug.yml":
          "name: Bug report\ndescription: File a bug\nlabels:\n  - bug\n  - \"needs triage\"\nassignees:\n  - octocat\ntitle: Bug\n",
      });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^LABELS=bug, needs triage$/m);
      assert.match(result.stdout, /^ASSIGNEES=octocat$/m);
      assert.match(result.stdout, /^TITLE=Bug$/m);
    });
  });
});

test("ready: a block of '- item' lines in the key's own column (unindented) is parsed the same as the indented form", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, {
        "bug.yml": "name: Bug report\ndescription: File a bug\nlabels:\n- bug\n- \"needs triage\"\nassignees:\n- octocat\ntitle: Bug\n",
      });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^LABELS=bug, needs triage$/m);
      assert.match(result.stdout, /^ASSIGNEES=octocat$/m);
      assert.match(result.stdout, /^TITLE=Bug$/m);
    });
  });
});

test("ready: one comma-separated string is parsed the same as the inline/block list forms", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, { "bug.yml": "name: Bug report\ndescription: File a bug\nlabels: bug, needs triage\n" });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^LABELS=bug, needs triage$/m);
    });
  });
});

test("ready: surrounding quotes are stripped from scalar values and CRLF line endings are tolerated", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const dir = path.join(repo.dir, ".github", "ISSUE_TEMPLATE");
      fs.mkdirSync(dir, { recursive: true });
      const content = ['name: "Bug report"', "description: 'File a bug'", 'type: "bug"', 'title: "[BUG]"', ""].join("\r\n");
      fs.writeFileSync(path.join(dir, "bug.yml"), content);
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^NAME=Bug report$/m);
      assert.match(result.stdout, /^DESCRIPTION=File a bug$/m);
      assert.match(result.stdout, /^TYPE=bug$/m);
      assert.match(result.stdout, /^TITLE=\[BUG\]$/m);
      assert.doesNotMatch(result.stdout, /\r/);
    });
  });
});

test("ready: a trailing YAML comment is cut from a scalar and from an inline list", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, {
        "bug.yml": 'name: Bug report\ndescription: File a bug\ntype: Bug # x\nlabels: ["bug", "triage"] # y\n',
      });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^TYPE=Bug$/m);
      assert.match(result.stdout, /^LABELS=bug, triage$/m);
    });
  });
});

test("ready: a full-line comment before the items of a block list does not end the list", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, {
        "bug.yml": "name: Bug report\ndescription: File a bug\nlabels:\n  # the labels\n  - bug\n  # more\n  - triage\n",
      });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^LABELS=bug, triage$/m);
    });
  });
});

test("ready: a flow list opened with [ and closed on a later line is read whole", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, {
        "bug.yml": 'name: Bug report\ndescription: File a bug\nlabels: [\n  "bug", # first\n  triage\n]\nassignees: [octocat]\n',
      });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^LABELS=bug, triage$/m);
      assert.match(result.stdout, /^ASSIGNEES=octocat$/m);
    });
  });
});

test("ready: a quoted title keeps its brackets, colon and a # inside the quotes", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, {
        "bug.yml": 'name: Bug report\ndescription: File a bug\ntitle: "[Bug]: #1 " # c\n',
      });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^TITLE=\[Bug\]: #1 $/m);
    });
  });
});

test("cwd inside a subdirectory of the repository still resolves the templates via the repo root", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, { "bug.yml": "name: Bug report\ndescription: File a bug\n" });
      const sub = path.join(repo.dir, "some", "sub", "dir");
      fs.mkdirSync(sub, { recursive: true });
      const { result } = await runStubbed(shell, sub, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout.split("\n")[0], "STATUS=ready");
      assert.match(result.stdout, /^--- template \.github\/ISSUE_TEMPLATE\/bug\.yml ---$/m);
    });
  });
});
