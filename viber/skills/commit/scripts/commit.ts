/*
 * commit.ts - runs the git commit with the message it is handed. The entry
 * holds no logic: lib/commit.ts does all of it over the selector reading
 * of lib/commit-args.ts, and the commit skill runs it through the wrapper
 * commit.sh, which keeps its call line.
 *
 * Usage:
 *   commit.sh <message> [selector...]
 *
 * Contract:
 *   argv   : $1 message (REQUIRED) - the commit's message, used verbatim.
 *            $2.. selector (optional) - what to commit; several args are
 *            joined with spaces into one selector string, read as below. A path
 *            already staged, removed with "git rm" or tracked under an ignored
 *            directory is committed; an untracked path an ignore rule covers is
 *            not.
 *   selector (the keyword is case-insensitive; an existing path WINS over it - a
 *            file or directory named "all" is a path). "Existing" means on disk,
 *            in the git index or in HEAD, so a deleted tracked file and one
 *            removed with "git rm" still count:
 *              the whole string is an existing path -> paths (that one path,
 *                             spaces kept)
 *              "" / all    -> all (every change: modified, new and deleted)
 *              a list      -> paths (split on whitespace and commas; every token
 *                             that is an existing path is kept, the rest
 *                             dropped), ONLY those paths, isolated from any
 *                             other staged change
 *              no token is an existing path, and one of them is path-shaped
 *                (holds a "/" or "\") -> missing (nothing is committed: a caller
 *                             who named paths never gets a commit of everything)
 *              no token is an existing path, none path-shaped -> all (a prose
 *                             description passed by mistake in place of a
 *                             selector)
 *            A path containing a space works only as the sole selector: inside
 *            a list the split cuts it apart.
 *            A "<segment>/.." is cut from a path as text before it is read. A
 *            string whose ".." would cut a segment holding a blank is never
 *            one path: "a.txt x/../b.txt" is the list a.txt, b.txt.
 *            A relative token is read from the repository root alone: the
 *            paths of commit-context's RUN: line are root-relative, so the
 *            caller's directory never stands before them (commit-context tries
 *            the caller's directory first, then the root). An absolute path is handed to git
 *            as given: POSIX, C:/ and C:\ spellings; on Windows a /c/ one is
 *            read as C:/.
 *            Issue references (a GitHub issue link, a bare "#42" with no letter,
 *            digit or underscore beside it) are cut out before the selector is
 *            recognised, so "src/foo #42" is the path src/foo. An existing path
 *            wins over a reference: the whole argument, or a whitespace token,
 *            that is an existing path is never cut. A cut removes only the "#42"
 *            itself, never the characters around it.
 *   cwd    : any directory inside the repository the commit lands in; git runs at
 *            its root and every relative path is read from there.
 *   env    : none read. Git's writes run with GIT_LITERAL_PATHSPECS=1, so a "[",
 *            "*" or "?" in a selector is part of a file name, never a glob.
 *   writes : the index and the commit; the exec bit of a file whose staged mode
 *            differs from HEAD's, set to the staged one; while it commits named
 *            paths, index.viber-commit.<pid> in the git directory.
 *   stdout : exactly one line, the result:
 *              <short sha> | <subject> (VERIFIED) - HEAD moved off the HEAD read
 *                before the commit (an unborn HEAD counts as moved once a commit
 *                exists); <subject> is the message's first line
 *              <short sha> | <subject> (FAILED)   - git exited 0 and HEAD did
 *                not move
 *              Nothing to commit                  - the selected set holds no
 *                staged change
 *            git's own output goes to stderr; a git failure leaves stdout empty.
 *   exit   : 0 on a commit and on "Nothing to commit" alike. 1 on a missing
 *            message (usage on stderr); 3 when the selector names paths and
 *            none of them exists (mode missing - nothing
 *            is committed, never a fallback to every change); otherwise git's
 *            own non-zero status.
 */

import { nodeFs } from "./lib/adapters/fs.ts";
import { gitCommand } from "./lib/adapters/git.ts";
import { gitWriteCommand } from "./lib/adapters/git-write.ts";
import { runCommit } from "./lib/commit.ts";

const result = runCommit(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand, write: gitWriteCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
