/*
 * build-commit.ts - one git write of the build, run as a process of its own so
 * its caller reads what git and its hooks print. The entry holds no logic: the
 * commit skill's git-write adapter does the write.
 *
 * It exists because that adapter relays git's output on the standard error of
 * its process: lib/adapters/git.ts starts this entry with that stream piped
 * and so holds the words of a hook that refused a commit.
 *
 * Contract:
 *   argv   : none.
 *   stdin  : one JSON object: `op` ("stage" | "commit"), `root` (the top level
 *            of the work tree), `paths` (repo-relative, literal) and, for
 *            commit, `message`.
 *   writes : stage: the index entries of the paths. commit: one commit of the
 *            index entries at and below the paths, through a private index, so
 *            whatever else is staged stays out of it.
 *   stdout : nothing.
 *   stderr : what git and its hooks print.
 *   exit   : git's own status, 0 for done.
 */

import fs from "node:fs";
import { gitWriteCommand } from "../../commit/scripts/lib/adapters/git-write.ts";

const call = JSON.parse(fs.readFileSync(0, "utf-8"));
process.exitCode = call.op === "stage" ? gitWriteCommand.stage(call.root, call.paths) : gitWriteCommand.commit(call.root, call.message, call.paths, true);
