/*
 * file-guard.ts - viber / PreToolUse hook on Edit and Write: refuses the edit a
 * task coder makes to a file another unfinished task of the run claims. The
 * entry holds no logic: viber/lib/file-guard.ts does all of it, and the wrapper
 * file-guard.sh beside it runs this file only for a viber:task-coder call.
 *
 * Why a hook: coders of one build share the working tree. A coder that edits a
 * file another task still has to write hands that task a file it did not expect,
 * and the task commit refuses the path only after the work is done. The rule in
 * the coder made it read every other task file to know what it may not touch;
 * the guard answers at the edit itself, with the step to take.
 *
 * Contract:
 *   argv   : none - every input arrives on stdin.
 *   cwd    : irrelevant; every path comes from the payload.
 *   env    : PATH must resolve `git` to find the repository root; without it the
 *            payload's cwd is the root. The platform decides how two paths
 *            compare: on darwin and win32, whose default file systems ignore
 *            case, src/A.ts and src/a.ts are one path; elsewhere two.
 *   stdin  : PreToolUse JSON. Read: the top-level "agent_type" (only
 *            viber:task-coder is judged), "agent_id", "cwd", "transcript_path",
 *            "agent_transcript_path" when present, and "tool_input.file_path".
 *   reads  : the coder's task: the value of the first line opening on `task:`
 *            in the dispatch prompt, which is the message.content of the first
 *            record of the coder's own transcript, a user record whose agentId
 *            equals agent_id. The transcript is, first found: agent_transcript_path;
 *            <transcript_path less ".jsonl">/subagents/agent-<agent_id>.jsonl;
 *            transcript_path itself when it is named agent-<agent_id>.jsonl. The
 *            task file <run>/tasks/<id>.md names the run directory; a relative
 *            one is read against the repository root, then the cwd.
 *            Then <run>/status.md (its done: and skipped: lines), the
 *            `- Files:` line of every <run>/tasks/<id>.md and the lines of
 *            <run>/work/<id>-extra.md and <run>/work/<id>-extra-review.md.
 *   writes : <repository root>/.temp/viber/guard/<agent_id>, one line, the
 *            absolute path of the task file found, read back first on a later
 *            call so the transcript is read once per coder. Best effort.
 *   refuses: the edited path, made repo-relative (a backslash read as a slash,
 *            /c/x as C:/x under a drive root, the links above its last name
 *            resolved), when a task other than the coder's that is on neither
 *            done: nor skipped: lists it in its Files or in one of its two
 *            extras files, and the coder's own task lists it in neither. A
 *            skipped task claims nothing: it never finishes, so the WAIT the
 *            refusal asks for could not end. Of several claimants the
 *            lowest-numbered is named, and <path> in the refusal is the
 *            spelling that task lists.
 *   stdout : nothing, or exactly one line:
 *            {"hookSpecificOutput":{"hookEventName":"PreToolUse",
 *             "permissionDecision":"deny","permissionDecisionReason":"viber guard:
 *             <path> belongs to task <id>, which is not finished. Leave it as it
 *             is, finish every DoD clause that does not need it, then return
 *             VERDICT: FAIL with WAIT: <path>."}}
 *            Nothing for everything else: a path no open task claims, the coder's
 *            own path, a path outside the repository, a dispatch with no task
 *            line, and any input that is missing or cannot be read (no agent_id,
 *            no transcript, a first record of another shape, no status.md).
 *            The hook never answers allow.
 *   exit   : 0 always (fail-open: a broken guard must never block an edit).
 */

import { nodeFs } from "../../lib/adapters/fs.ts";
import { gitCommand } from "../../lib/adapters/git.ts";
import { runFileGuard } from "../../lib/file-guard.ts";

let payload = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  payload += chunk;
});
process.stdin.on("end", () => {
  const caseless = process.platform === "darwin" || process.platform === "win32";
  process.stdout.write(runFileGuard(payload, { fs: nodeFs, git: gitCommand }, { caseless }));
});
