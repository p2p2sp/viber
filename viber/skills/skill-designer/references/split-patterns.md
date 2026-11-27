# Split patterns

Pick the pattern matching the shape of the responsibilities.

## Non-overlapping branches

N modes with disjoint instructions are N responsibilities. Only the branch taken may reach the model.

- Heavy branches: one `context: fork` sub-skill per branch. The entry skill resolves the branch and dispatches it via the `Skill` tool, passing resolved inputs as args.
- Parsable selector: a router script reads the selector from `$ARGUMENTS` and prints only the chosen playbook; the entry skill `!`-injects its output.
- Choose the script when a parsable argument selects the branch, forked sub-skills when each branch is heavy work that gains from running out of the main context.

## Interactive skill

`AskUserQuestion` runs only in the main session, so asking plus heavy work pins the whole body to the main context for the whole session.

- Entry skill (main context): asks every question, resolves all ambiguity, hands off. Keep it small.
- Worker (`context: fork` + `user-invocable: false`): takes resolved inputs, does the heavy work, never asks the user.
- Hand off via args: short fields inline, large or multiline content as a path.

## Co-occurring responsibilities

Several can apply to the same task at once (style, consistency, links over one editing job): neither one skill nor a shared dispatcher fits.

- One specialist skill per responsibility, each with its own `description:` trigger.
- Several fire independently for the same task, each inside its own context budget.

## Locate-then-change over a large set

Never scan the repo in the main context.

- Fan out forked skills in parallel, each pinned to a cheap `model:` (an unpinned one runs on the session model) and locating or scoring one file or shard. Each returns one compact tagged line (path + verdict), never file dumps.
- Gate and rank the hits with a script, then dispatch expensive workers only into the located shards.
- The main context keeps the shard list, never the search: token cost stays flat as the repo grows.
