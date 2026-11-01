# Image source limit — 2026-11-02

## Behavior

- Raise the shared local/generated image and remote copy/export source budget from 20 MiB to 50 MiB; cover file selection increases from 40 MiB to the same 50 MiB budget.
- Direct WeChat uploads accept static sources up to 50 MiB and retain the existing API-specific output compression.
- Relay/Bridge deployments have an independent 20 MiB binary request limit. Before sending a larger static source, the plugin uses the existing JPEG encoder to produce at most 1 MiB, with matching MIME and filename. Smaller requests retain existing server-side normalization. Source attachments and clipboard/export originals are not overwritten.
- GIFs above the relay's 20 MiB input cap fail explicitly instead of being flattened; direct content GIFs retain their existing 10 MiB limit.
- No 75 KiB cap was found in this upload path. The reported failure around 75 KB is not reproduced or explained by this change.

## Evidence

- The six initial tests failed on the old implementation: 21/50 MiB reads were rejected; direct 21 MiB upload was rejected; relay/Bridge forwarded oversized original bytes.
- Latest main baseline: `4fbeae30017e1db4be95b7454620b30eae47ada8` (0.3.3).
- `npm run check`: type check, 413 tests in 23 files, update-note checks and production build passed.
- Real Chromium decoding/Canvas encoding of valid synthetic BMP files using a bundle of the actual `src/image-upload.ts`, with no mocked codec:

| Original bytes | Uploaded JPEG bytes | Decoded output |
| --- | --- | --- |
| 23,520,054 | 24,193 | 2000 × 2000 |
| 50,400,054 | 24,362 | 1952 × 2049 |

These solid-color fixtures verify valid decoding and real output encoding, not arbitrary photographic quality. Transport tests use controlled HTTP responses. No real account draft was created, and no WeChat client/page was automated. Installed Obsidian runtime, mobile hardware, official preview scan and public release are separate unverified gates.

## Follow-up server investigation

Started 2026-11-02 (Asia/Shanghai). Goal: reproduce or bound the reported failure above roughly 75 KB, inspect the live relay, Nginx and ImageMagick, and repair confirmed defects with before/after evidence. Keep production credentials private; do not automate WeChat UI or publish articles. Existing unrelated QA files remain untouched. Nowledge Mem thread search is unavailable (local service refused the connection); current repository records and production state will be used instead.


Confirmed follow-up fixes for 0.3.4: bounded dimension reduction when JPEG quality changes cannot meet the budget; explain proxy HTML 413 responses; retain failed image names and block partial draft creation. Backend repairs separately align static source budgets to 50 MiB and distinguish input, conversion and upstream errors. GIF limits remain unchanged. The release workflow now gates version promotion on anonymously downloadable assets matching a clean production build; the old version pointer stays on main until that check passes.


## Final 0.3.4 candidate validation

- `npm run check`: 417 tests, type checking, offline update-note checks (all supported locales) and production build passed. Four Python public-download checker fixtures passed.
- Obsidian 1.14.5 (installer 1.13.7), existing isolated `qiaomu-home-dashboard-qa`: upgrade from installed 0.1.3 to 0.3.4 loaded without captured errors; `data.json` remained byte-identical (SHA256 `fa7f4d14a9a7a5cea6504c4049fa8fadf20ec337777328687428aa870e961c13`).
- Actual publish dialog rendered a valid 21 MiB padded JPEG attachment and one preview image; clicking Send exercised actual requestUrl and the real Bridge server source on loopback, with only official WeChat HTTP responses controlled. Native JPEG compression reduced the body upload to 6,385 bytes; the final draft contained the uploaded image URL and one image. Cover upload was 2,812 bytes. A controlled upstream 45001 retained the dialog, identified `large-photo.jpg`, kept retry enabled, and created no partial second draft. Temporary in-memory account/secret overrides were restored; settings bytes stayed unchanged.
- Native Obsidian Canvas encoded a genuinely noisy 13,625,344-byte PNG: the 1 MiB budget produced an 850,332-byte 1540 × 1260 JPEG; the 64 KiB budget produced a 46,471-byte 566 × 463 JPEG. These exercise dimension reduction beyond the flat-color fixtures.
- Live production HTTPS relay uploaded a 12,000,054-byte BMP cover and 50,400,054-byte BMP content and cover. A real test draft was created and read back with the expected title. Draft deletion and both cover-material deletions returned WeChat errcode 0. Uploaded content image URLs have no material-delete API and are not exposed in this report.
- Backend `verify:quick`: 309 Vitest tests, 26 Node HTTP/auth/quota tests, lint (six existing warnings, zero errors), and production build passed. The same 26 Node tests passed against the staged source on production Node 22.23.4.
- The local optional tooltip scanner flags existing `meta.title = ...` as a title-attribute match; manual inspection confirms this is a model-field assignment, not an HTML tooltip. Artifact/version audit and official scanner remain separate checks.

Physical mobile devices and the reporter's particular failing image/credentials remain unverified. No WeChat UI was automated. Official pre-scan, draft-asset fresh install/upgrade, anonymous public downloads and directory review are pending at candidate freeze and are tracked in PR #16 / Release 0.3.4.
