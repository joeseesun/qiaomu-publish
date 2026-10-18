# Public relay onboarding — 2026-10-18

The deployed relay previously allowed the public `qiaomu` routing code for two preconfigured AppIDs only. Ordinary accounts received 401 before WeChat could validate their credentials. The live entry now accepts any AppID; valid WeChat credentials, API permissions and the fixed-egress IP allowlist remain required. This server deployment takes effect for the existing plugin package.

Verified through the public HTTPS endpoint:

- A new synthetic AppID receives the upstream WeChat invalid-AppID response (`40013`, HTTP 502), rather than relay 401. This proves it passed relay authorization, not that its credentials are valid.
- Both existing real official accounts pass read-only connection checks with 200/ok through the same wildcard entry.
- Invalid routing codes still return 401; direct v2 HTTP and forged proxy headers return 403.
- A bounded burst of 40 public egress-IP requests returned 32 successes and 8 client-compatible JSON/429 responses.
- Legacy v1 remains available. The plugin's local installed files and release assets were not changed.

Daily relay limits remain 100 requests per AppID, reset at UTC midnight, with counters persisted across service restarts. Fourteen focused backend tests passed locally and on the production Node 18 runtime; backend lint, 307 repository tests and production build passed.

No drafts, materials or public articles were created. A third-party user's real draft delivery is not covered by this verification.

## Quota policy update, 08:11 Asia/Shanghai

The subsequent user-authorized policy replaces the initial 100-request allowance above: ordinary accounts now receive **200 relay requests per UTC day**. The two server-configured owner accounts are exempt from daily quotas only when both their exact private-list AppID and server-stored AppSecret match. Authorization, HTTPS and short-term burst limits still apply.

Eighteen focused backend tests passed locally and on production Node 18.19.1. Tests cover the 200/201 boundary across restart, owner exemptions, forged owner credentials and retained burst limits; backend lint, 307 repository tests and production build also passed. An isolated production-host process verified both real owners still connect with deliberately exhausted counters and ordinary requests stop at 201. After deployment, public HTTPS checks confirmed both real owners connect without incrementing daily usage; ordinary access, legacy v1 and HTTPS enforcement remain working. No real drafts or materials were created.
