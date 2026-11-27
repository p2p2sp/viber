# Example

One body with the recurring flaws, then the fix for each. Derive the new body from the rules, never from the shape of this file.

BAD
```
# CSV to JSON Conversion Skill

This skill helps you convert CSV files into JSON format. CSV is a common
format for tabular data, while JSON is widely used in web apps and APIs.

When a user uploads a CSV, read the file carefully to understand its
structure. Look at the header row to determine the column names, then map
every value to its column, building a JSON object per row. You can use `jq`
to format the output. Edge cases should be handled appropriately.
```

Flaws and fixes:

- Explains CSV and JSON, which the model knows -> cut; keep only the deltas from default behaviour, such as empty cell -> null.
- Maps rows by hand -> a bundled script converts; the body runs it, returns its output and forbids hand-parsing.
- "When a user uploads a CSV" sits in the body -> when to use goes in `description:` only.
- "Edge cases should be handled appropriately" -> name each edge case with its outcome, or drop the line.
- `jq` -> clean bash, or a named runtime the script checks for.
- No failure rule -> state the action on failure in the rule itself: print stderr verbatim, no fallback.
