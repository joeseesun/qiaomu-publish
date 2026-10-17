# Browser-platform integration candidate 0.3.0

Updated 2026-10-17. Candidate from PR #7 plus current main (the 0.2.1 image fixes); companion Clipper main `2cabb0184276b8fdb288b38f93f0d239e8ecaf40` includes PR #85 and cancellation/upload fixes from PR #86.

## Fixes during integration

- Keep the cover-selection UI and the blocking missing-image checks together when resolving the publish-modal conflict.
- Apply the same missing-image and local SVG handling to X, Zhihu and Xiaohongshu. Do not silently remove untracked images.
- Deduplicate X/Zhihu attachment assets while replacing every body occurrence with the same asset ID.
- Preserve GIF bytes within the configured limit. Reject oversized GIFs instead of flattening them into JPEG. Reject animated SVG with an explanation; static SVG becomes PNG. Xiaohongshu cards explicitly warn that they are still images.
- Prevent stale prepared text from being sent while Markdown edits are pending or after preparation fails. Disable edits during an active handoff and validate the final cover/media count again.
- Distinguish Xiaohongshu editor prefill from a saved remote draft. The creator platform's Save draft / Publish action remains with the user.

## Verified

- `npm run check`: TypeScript, 334 tests across 20 files, production build.
- Installed candidate in isolated Obsidian 1.14.4, without changing the user's rockfish installation.
- 24 actual-host preparation cases: X/Zhihu/Xiaohongshu × wikilink, reference Markdown, raw HTML, vault file URL, nested same-name image, SVG, repeated image, missing image. All seven readable cases prepared; each missing case blocked. No app/file URL leaked into the prepared content.
- Installed dialogs for all three platforms rendered, remained within their content widths and enabled the send action only for valid input. Actual Xiaohongshu cards rendered to 1080 × 1440 PNGs (49,440 and 47,890 bytes); output opened and inspected.
- Missing-image dialogs disabled sending on all three platforms. A pending Markdown edit remained blocked, a failed edit could not reuse the previous prepared content, and correcting the reference restored readiness.
- Clipper's actual BridgeClient, compiled from the companion commit, fetched a native Obsidian job and binary asset over a real loopback socket, then reported cancellation. The repeated JPEG appeared twice in the article but only once in the asset list; the 8,428-byte transfer SHA256 was `23cc881906bd29ee8c4ce3b8b73637faf6ca72db34bb99dcead613822043e6e3`. This is transport evidence, not a real platform draft.
- Clipper `check:dev-base`, production store build and fixed-entry delivery checks passed (716 tests passed, 7 skipped in delivery regression). Fixed entry now contains 1.18.7 at `/Users/joe/Documents/乔木剪藏测试/extension`; actual browser reload is a separate step.

Machine-readable results: [platforms.json](2026-10-17-platforms.json).

## Release blockers / not verified

- Real X, Zhihu and Xiaohongshu drafts: all three pages in the dedicated Chrome test profile require sign-in. Awaiting the user's sign-in and extension reload. Do not call this end-to-end acceptance or publish 0.3.0 until those results are checked.
- Browser security policy rejected automatic access to the extension manager (`chrome://` is blocked), so the user must perform that reload. No alternative automation was used to bypass the rejection.
- Mobile device behavior, native file-picker and drag-to-crop gestures are not yet covered by this integration run.
- Public release, final official preview scan, release-asset installation and official directory update remain separate gates. 0.2.1 is the current public version and its formal scan completed, including byte-for-byte build verification.

Do not replace the public 0.2.1 assets. If candidate source changes after a preview scan or asset build, rebuild and scan the new commit.
