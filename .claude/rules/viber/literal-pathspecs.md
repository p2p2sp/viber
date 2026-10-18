---
paths:
  - "viber/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
---

# Export GIT_LITERAL_PATHSPECS where a script hands a named path to git

- A script that passes a path the caller named (a selector, a `--with` file, a run key) to `git add`, `git commit`, `git ls-files` or `git diff` exports `GIT_LITERAL_PATHSPECS=1` before its first git call, with a comment saying why. Git otherwise reads `*`, `?` and `[...]` in a pathspec as a glob, and a Next.js App Router path (`app/[id]/page.tsx`) is made of brackets, so a sibling such as `app/i/page.tsx` would be committed with it. `viber/skills/commit/scripts/commit.sh:42` shows the shape:

  ```
  # Every selector token is a literal path: without this git reads "[id]" or "*" in
  # a pathspec as a glob, so 'app/[id]/page.tsx' would also take app/i/page.tsx.
  export GIT_LITERAL_PATHSPECS=1
  ```

  The same export sits in `viber/skills/commit/scripts/commit-context.sh:39`, `viber/scripts/commit-task.sh:261` and `viber/scripts/archive-run.sh:82`. A glob-shaped selector (`src/*.ts`) is a literal path, never an expansion.
