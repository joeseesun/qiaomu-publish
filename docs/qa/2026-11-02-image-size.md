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
