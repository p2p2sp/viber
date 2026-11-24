- Tied to an issue -> post the conclusions as a comment on the issue, hand off to `intent`, or comment then hand off.
- Not tied -> hand off to `intent`, or stop. Stop -> name the mockup path and stop.

The only file you write in this skill is that issue comment, with `Write`.

On each option that posts the comment, before writing it, once per post, run `"${CLAUDE_PLUGIN_ROOT}/scripts/artifact-create.sh" "<URL>" "<mockup path>"`, `<URL>` being the `URL=` value. Exit 0 -> the comment's mockup section holds the `CREATED=` link. Any other exit -> the mockup section says the mockup is attached by hand; report the `REASON=` value or the `ERROR` line and the mockup path, and ask the user to attach that file to the comment in the browser. The comment is posted either way.

Posting the comment: fill `${CLAUDE_SKILL_DIR}/templates/comment.md`, read at this step, from the conclusions, with no Claude or Claude Code attribution. `Write` it to `<root>/.temp/viber/prototype/<N>.md`, `<N>` being the `NUMBER=` value, then run `"${CLAUDE_PLUGIN_ROOT}/scripts/post-comment.sh" "<URL>" "<file>"`, `<URL>` being the `URL=` value and `<file>` that same path.

- Exit 0 -> report the `COMMENT_URL=` value.
- Exit 1 -> report its `ERROR` line and say whether a comment landed is unknown. Never retry.
- Exit 2 -> report its `ERROR` line.

Comment alone -> stop. Comment then intent -> the next step, whatever the exit.
