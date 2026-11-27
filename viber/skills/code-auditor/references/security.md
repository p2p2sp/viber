# security

Exploitable flaws: attacker-controlled input reaching a sink, a missing or wrong authorization, a credential check an attacker guesses or fails past, a leaked secret, broken cryptography. Elsewhere: a wrong result or logic error with no attacker (bugs), a slow path (runtime-performance, web-performance), a weak test (tests), structure with no exploit (design).

## Hunts

- `injection`: SQL and NoSQL, OS command, `eval`, template (SSTI), expression language, LDAP, XPath, header (CRLF), XXE, XSS. Trace each sink back to an entry point: source, propagators, sanitizer, sink. A sink with no source an attacker controls is no finding.
- `access-control`: an object ID read from the request with no ownership check; a route left out of the auth middleware; session fixation; CSRF on a state-changing route; CORS reflecting any `Origin` with credentials; a `postMessage` handler with no origin check; mass assignment; a business rule the server takes from the client or lets a direct call skip: a price, quantity or discount read from the request, a payment, approval or verification step a request bypasses, a single-use or limit check (coupon, balance, invite, code) parallel requests pass more than once. Compare each route or GraphQL resolver with its siblings: the outlier is the bug.
- `authentication`: a login, OTP, password-reset, token or signature check an attacker beats: no attempt limit or lockout on a password or a short code (GraphQL aliases and batching count as attempts); a check that fails open (a caught exception, a timeout, a missing claim or an unreachable auth service lets the request through); JWT `alg` or key confusion, or `exp`, `iss` or `aud` unchecked; OAuth or OIDC without `state`, nonce or PKCE, or a `redirect_uri` matched by prefix; a webhook accepted without verifying its signature; a reset link built from the request's `Host` header. Name the guess count or the failure that opens the check.
- `untrusted-data-to-machinery`: path traversal (checked before canonicalizing, or through archive entries or symlinks); unrestricted upload; SSRF where the attacker picks host or scheme, or an allowlist checked on the raw string, before DNS resolution or before redirects; unsafe deserialization (`pickle`, `yaml.load`, `ObjectInputStream`, `unserialize`, `BinaryFormatter`, `Marshal.load`, `TypeNameHandling`). In C, C++, unsafe Rust or cgo: an attacker-controlled length, index or format string reaching a copy, an allocation or pointer arithmetic.
- `secrets-crypto-and-supply-chain`: committed live credentials and private keys; weak or attacker-chosen algorithms, ECB, a static IV or nonce, tokens from a non-CSPRNG, TLS verification off, `==` on a MAC, a dangerous default (an empty key that skips the check); secrets or PII in logs and responses; debug endpoints left on; a CI workflow running untrusted PR code with secrets (`pull_request_target` or `workflow_run` plus a checkout of the PR head or its artifacts) or interpolating an attacker-set `${{ github.event.* }}` field into `run:` or a script; install scripts fetching unpinned code.
- `llm-and-agents`: untrusted text (a message, page, file, issue, email or tool result) reaching a model that can call a tool with side effects or read data its sender may not, with no allowlist or human approval on that call; user input in a system prompt; model output reaching a shell, `eval`, SQL, a path or rendered HTML or markdown (a remote image URL exfiltrates). In agent, skill, hook and CI configs: an unrestricted shell or write tool, or a wildcard trigger, on a flow that reads untrusted content.

## Excluded

- Denial of service, resource exhaustion, resource leaks, rate limiting (an attempt limit on a credential or code check excepted): a crash or hang is bugs; time and memory growth, ReDoS included, is runtime-performance.
- Missing hardening, best practice or input validation with no concrete exploit.
- Version-only dependency findings.
- Memory safety in memory-safe code: safe Rust, pure Go, managed languages.
- Code used only by tests; documentation files, except a markdown file a tool runs or loads as agent instructions (skill, agent, command, hook).
- Log spoofing, missing audit logs.
- Regex injection; SSRF controlling only the path; user content in a prompt of a model that holds no tool, secret or data beyond its sender's own.
- Auth checks missing from client-side code.
- XSS in React or Angular without `dangerouslySetInnerHTML`, `bypassSecurityTrust*` or similar.
- A race or TOCTOU with no proof that parallel requests or an attacker-written value hit the window; a timing attack other than a byte-wise compare of a MAC or token.
- Attacks needing control of env vars, CLI flags or install-time config.
- Secrets on disk that are otherwise secured; guessing UUIDs.
- Tabnabbing, XS-Leaks, prototype pollution and open redirect, unless the chain is concrete.
- Shell scripts, notebooks and CI workflows, unless untrusted input demonstrably reaches them.

## Proof

- The claim in one sentence: source, path, sink, impact, attacker position.
- The path traced back from the sink: every hop quoted, and every validator, sanitizer, framework auto-escape and auth check on it.
- The payload followed hop by hop to the sink, with the lines showing nothing on the path stops it.
- An authorization claim quotes where the intended rule comes from: a sibling route's check, a test, a doc or an owner field. None: drop the finding.
- A hop that cannot be read (reflection, DI wiring, generated code, a proxy, WAF or config outside the repository): drop the finding.
- A pattern match alone is no proof.

## Severity

- 9-10: pre-auth RCE; auth bypass to admin; cross-tenant read or write at scale; a committed credential in a recognized provider format, not a placeholder or test fixture; prompt injection that makes an agent run a shell or send other users' data out; a CI workflow running attacker code that holds write tokens or release secrets.
- 7-8: authenticated RCE or injection; IDOR across users; SSRF to internal hosts or cloud metadata; stored XSS in a privileged view; arbitrary file read or write; unlimited guesses on a reset or OTP code; a paid or approved action obtained without paying or approval.
- 4-6: needs user interaction or a specific precondition: reflected XSS, CSRF (7-8 when it changes credentials or the account email), unlimited password guesses, weak crypto on moderately sensitive data, a leak of internal details.
- 1-3: reachable only by an already-privileged or local actor, or defense in depth only.
