# Relay connection recovery — 2026-10-13

Root cause: deployed server required old invitation-based authentication for every v2 route, lacked the connection-check route, and its running environment lacked the relay key file and egress IP settings. HTTP 401 occurred before WeChat credential validation. The server-stored credentials for the affected account were accepted by the read-only stable-token probe.

Recovery: updated the standalone bridge source, configured its public fixed egress IPv4, and enabled the plugin routing code for the two existing server-configured accounts only. Existing v1 account data and Bridge token were retained. Source and environment backups were made before restart; credentials were never printed or copied into Git.

Verification: nine focused Node bridge tests passed. A separate staging process on the production Node 18 runtime passed public egress, both real read-only WeChat connection checks, legacy v1 account listing and unauthorized rejection. After deployment, the public HTTPS egress endpoint returned 200, and both authenticated /v2/wechat/check requests returned 200/ok. Legacy v1 accounts remained available. Deployed bridge source SHA256: 52792837bed1906eb06ab7035d8a9227da977dd2bd6e02788851ca85cb8549d9.

Plugin 0.1.3 distinguishes configuration/service errors (503), relay authorization (401), missing/old routes (404), limits (429), and WeChat credential/IP/permission errors. HTML proxy errors retain the HTTP diagnosis; upstream errors are redacted against the request credentials. Typecheck, 42 tests and production build passed. Regression tests reproduced the old failure before the fix.

No drafts, materials or public articles were created. Actual draft delivery and arbitrary new-account onboarding are outside this recovery verification. GitHub CI, final official preview scan, native reload and public asset checks are recorded in PR/release notes after the frozen candidate is pushed.
