# Replay sample of done clauses

Each line is one done clause for a replay of the plan author and the coder: a `bad` clause
breaks `Observable` by the test rule named after it and must not be written, a `good` clause
holds, and a `read` clause holds too: the coder writes no test for it and the task reviewer
judges its code.
Line format: - <bad|good|read> | <test rule, or none> | <TDD value> | <clause>

- bad | Earned | required | the key test covers `menuIcons` with its eight keys
- bad | Public | required | every constant of `Scopes` is listed, read by reflection
- bad | Earned | required | the message dictionary has no `loadMore` key
- bad | Earned | required | the module exports exactly the values of C6
- bad | Source | required | a structural guard confirms that `migrate` calls `issueToken`
- bad | State | required | starting an activity calls the save hook exactly once
- bad | State | required | every query passes `keepStale: false` to the query hook
- bad | Earned | none | the contract tests pin the members of `StatusKind` in order
- bad | Public | none | a reflection test proves the handler class is sealed with a private parameterless constructor
- bad | Earned | required | the route is mapped as POST with the `RateLimited` metadata
- good | none | required | an order over the credit limit is rejected with `credit-limit-exceeded`
- good | none | required | a declined payment leaves no order stored
- good | none | required | the list answers its second page with items 21 to 40
- good | none | required | saving a second user with the same email fails on the unique index
- good | none | none | the README names the `--dry-run` flag
- read | Earned | required | a request with an empty name is rejected with `name-required`
- read | Earned | required | a new order starts in the `draft` state
- read | Earned | required | the upload size limit is 10 MB
- bad | Earned | required | a test pins the value of the retry limit constant
- read | Earned | required | an order built without a currency does not compile
- bad | Earned | required | a test proves the type checker refuses a call passing a string where the handler takes an `UploadRequest`
