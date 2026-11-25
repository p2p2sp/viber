---
paths:
  - "viber/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
---

# Export GIT_LITERAL_PATHSPECS where a script hands a named path to git

- A script that passes a path the caller named (a selector, a `--with` file, a run key) to `git add`, `git commit`, `git ls-files` or `git diff` exports `GIT_LITERAL_PATHSPECS=1` before its first git call, with a comment saying why. Git otherwise reads `*`, `?` and `[...]` in a pathspec as a glob, and a Next.js App Router path (`app/[id]/page.tsx`) is made of brackets, so a sibling such as `app/i/page.tsx` would be committed with it. `viber/scripts/commit-task.sh:313` shows the shape:

  ```
  export GIT_LITERAL_PATHSPECS=1
  ```

  In a ported script the git adapters do it: `viber/lib/adapters/git-write.ts` sets the variable for every write that takes a path, `viber/lib/adapters/git.ts` passes `--literal-pathspecs` on each read that takes one. A glob-shaped selector (`src/*.ts`) is a literal path, never an expansion.
