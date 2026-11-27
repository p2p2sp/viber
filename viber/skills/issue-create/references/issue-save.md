# Issue save steps

Input: the `STATUS=ready` block of `issue-templates.sh` and `content:`, what fills the title and the body of the issue.

`<root>` is the project root. The body file is written with `Write` to an absolute path under `<root>/.temp/viber/issue-create/` and passed to its script by that same path: a multi-line text never rides a Bash line.

Result: `ISSUE_URL=<url>` reported, or no issue.

1. Pick the template from the block. No `--- template` line in the block -> the issue takes no template: skip step 2. One template -> take it. Several -> one `AskUserQuestion`, the one that fits the content best first, at most four options, any further one by free text.
2. `Read` the chosen template file (the path on its `--- template` line). Fill each `body` entry that is not `type: markdown` from the content: `dropdown` only with one of its `options`, `checkboxes` only with its option labels. A `validations.required: true` entry the content does not answer -> ask for it in prose, one per message, before the preview. Never invent a value.
3. Title: a one-line statement of the content in the user's language.
4. Body, the format GitHub itself renders from an issue form: per filled entry in template order, `### <attributes.label>`, a blank line, the content, a blank line. `textarea` and `input` take the text; `dropdown` the chosen option; `checkboxes` one `- [x] <label>` or `- [ ] <label>` line per option. An optional entry left empty reads `_No response_`. A `markdown` entry is left out. With no template the body is the content as plain Markdown. No secrets, credentials or file contents: the issue may be public. No Claude or Claude Code attribution.
5. Preview: `Write` the body to `<root>/.temp/viber/issue-create/issue-body-<stamp>.md`, `<stamp>` the output of `date +%Y-%m-%d-%H-%M-%S`. Print, never the body text, the lines `Title: <title>`, `Type: <type or ->`, `Labels: <list or ->`, `Assignees: <list or ->`, `Projects: <list or ->`, `Parent: #<N>` only when the issue has one, `Attachments: <list>` only when the issue has any and `Body: <absolute path of the body file>`.
   - The issue has attachments when the content asks to attach files or http(s) links: each file as an absolute path, each link as given. `Create` approves their upload too.
   - The issue has a parent when the content names one (a number, or an issue URL of the block's `REPO`).
   - A content naming an issue URL of another repository gets one line saying it cannot be attached and no `Parent` line.
   - Then ask through one `AskUserQuestion`: `Create` or `Do not create`, a correction travelling through its free-text field. A correction -> apply it, `Write` the same file again and preview again. Anything but `Create` or a correction -> no issue.
6. On `Create` run `"${CLAUDE_SKILL_DIR}/scripts/issue-create.sh" "<file>" "<title>"`, `<file>` the body file of step 5, with the values appended on the same line: when a template was picked and the user corrected none of the preview's `Type`, `Labels`, `Assignees` or `Projects`, `--template "<path>"`, the chosen template's path from its `--- template` line, and none of the four flags; when they corrected any of them or the issue takes no template, no `--template` but `--type "<type>"` when the preview's `Type` is not `-`, one `--label "<L>"` per `Labels` item, one `--assignee "<A>"` per `Assignees` item and one `--project "<P>"` per `Projects` item, each as the preview shows it. Either way `--parent "<N>"` when the preview carries a `Parent` line.
   - Exit 0 -> report `ISSUE_URL=`. `TYPE=dropped` or `TYPE=error` -> one line naming the type left off and its `TYPE_ERROR=`; the issue stands. `PARENT=error` -> one line saying the issue was not attached under `#<N>` and its `PARENT_ERROR=`; the issue stands.
   - Exit 0 and the preview carries an `Attachments` line -> dispatch `viber:attach` through `Skill` once, args the `ISSUE_URL=` value then each `Attachments` item in double quotes, and report its return unchanged. Never dispatch it again, on no other exit.
   - Exit 1 -> report its `ERROR` line and say whether an issue landed is unknown. Never retry. No issue URL is known.
   - Exit 2 -> report its `ERROR` line. No issue URL is known.
