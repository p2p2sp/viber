# viber/scripts - editing the GitHub comment and issue wrappers

Read for a change to `qa-comment.sh`, `pr-threads.sh`, `pr-reply.sh`, `issue-facts.sh` or `post-comment.sh`: what each posts or lists, and the grammar and stubs they share. The node holds the wrappers' common rules.

## Contracts

- `qa-comment.sh` posts on the run's issue, the frontmatter `issue:` of the `spec.md` beside the qa file, and on the `--pr` or same-repository branch pull request (a cross-repository one is never the target) only when the run has none. It posts at most once per run: the body's first line `<!-- viber:qa <path> -->` marks the run key (the qa file's parent directory name), and a comment already carrying the same key, from the run directory or its archive, yields `STATUS=skip`, `REASON=exists`.
- `pr-threads.sh` lists only unresolved review threads and lists nothing (`REASON=wrong-branch`, no threads file) unless the checked-out branch is the pull request's head branch. A ready run replaces `.temp/viber/pr-feedback/<N>/threads.md`. A thread whose latest comment opens with the reply marker is left out and counted in `SKIPPED=`.
- `pr-reply.sh` replies only through the `.../pulls/<N>/comments/<id>/replies` endpoint, `<id>` the thread's first comment (GitHub has no reply to a reply), at most once per comment: the body is the reply marker `<!-- viber:pr-feedback <id> -->`, a blank line and the reply file, kept in `.temp/viber/pr-feedback/<N>/posted/<id>.md`; the newest reply to `<id>` opening with the marker yields `STATUS=skip`, `REASON=exists`. A relative reply file resolves from the cwd, unlike `qa-comment.sh`.

## Change together

- The issue reference grammar (`<N>`, `#<N>`, or `https://<host>/<owner>/<repo>/issues/<N>` with any `#...` fragment or `?...` query dropped) is parsed the same way in `issue-facts.sh` and `post-comment.sh`; `qa-comment.sh` applies it to the run's `issue:` and to `--pr` pull request URLs.
- The reply marker `<!-- viber:pr-feedback <comment-id> -->` is matched in `pr-threads.sh` (its awk block) and written and matched in `pr-reply.sh`; the `--jq` output shape of each (`pr-threads.sh`: `T`/`C`/`B` tab lines; `pr-reply.sh`: `<in_reply_to_id> <first body line>`) is emulated by the stub of `tests/viber/pr-threads.test.ts` / `pr-reply.test.ts`, so a filter change changes the stub. The pull request reference grammar is parsed the same way in both.
