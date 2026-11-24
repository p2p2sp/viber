/*
 * viber - skills/code-auditor/scripts/strip-tag.ts
 * Deletes the write-call artefact at the end of a file an agent wrote: a last
 * line that is nothing but a closing tag. The entry holds no logic:
 * viber/lib/strip-tag.ts finds and cuts the line.
 *
 * Why it exists: a writer agent sometimes leaks the closing tag of its own Write
 * call (`</content>`, `</parameter>`) into the value as a last line. A hunter
 * report, a claim sidecar or a findings file carrying it breaks every script that
 * reads the file, and a model re-reading its own file to catch it spends tokens
 * on a check one script does the same way every run. The keep-units and
 * hunt-return cores call the same core in process; the wrapper strip-tag.sh runs
 * this entry.
 *
 * Contract:
 *   argv   : <file>... - the files to clean. A path that is not a regular file
 *            (missing, a directory) is skipped; no argument at all does nothing.
 *   cwd    : irrelevant: every path comes from argv, so cwd only resolves a
 *            relative one.
 *   env    : none.
 *   files  : each file whose last line is a bare closing tag (`</name>` with
 *            optional spaces or tabs around it and an optional carriage return
 *            at the end) is rewritten without that line, every byte before it
 *            unchanged, invalid UTF-8 included. Any other file is not opened for
 *            writing, so it stays byte-identical. A tag inside a line, text
 *            before it on its line, or a tag on a line that is not the last one
 *            never counts.
 *   stdout : nothing.
 *   exit   : 0, whatever the files hold. The core never throws.
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { runStripTag } from "../../../lib/strip-tag.ts";

runStripTag(process.argv.slice(2), { fs: nodeFs });
