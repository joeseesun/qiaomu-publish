# Qiaomu Publish

[中文](README.md) · **English**

**Your note should not need formatting twice.**

Write in Obsidian, preview your WeChat Official Account article, then copy the formatted result or send it to drafts. Your Markdown stays in your vault.

![Markdown beside the live article preview](docs/assets/live-preview.png)

[**Install from the official community directory**](https://community.obsidian.md/plugins/qiaomu-publish) · [Release notes](https://github.com/joeseesun/qiaomu-publish/releases) · [Report an issue](https://github.com/joeseesun/qiaomu-publish/issues)

## Start without an account

Requires Obsidian **1.11.4+**.

1. Open the [official community listing](https://community.obsidian.md/plugins/qiaomu-publish), click **Add to Obsidian**, then **Install → Enable** in Obsidian.
2. Open a Markdown note and run **实时预览当前笔记的公众号排版** from the command palette, or click the smartphone ribbon icon.

Alternatively, open **Settings → Community plugins → Browse**, search for **Qiaomu Publish**, and install and enable it.

Check for future updates under **Settings → Community plugins**. The plugin UI is currently Chinese. Preview, formatting, copying and exports work without configuring an account.

<details>
<summary>Alternative: manual installation</summary>

Download `main.js`, `manifest.json` and `styles.css` from the same [GitHub release](https://github.com/joeseesun/qiaomu-publish/releases/latest), place them in `<vault>/.obsidian/plugins/qiaomu-publish/`, restart Obsidian and enable Qiaomu Publish under Community plugins. Preserve `data.json` when updating manually.

</details>

## What it removes from your workflow

| Repetitive work | Qiaomu Publish |
| --- | --- |
| Formatting again after pasting | Live preview and the same inlined styles for copy, export and drafts |
| Setting typography for every article | Per-note styles, reusable defaults and 42 searchable themes |
| Making a cover for a text-only note | Generated title covers with editable text, background, font and colour |
| Moving technical content between editors | Code highlighting and line numbers; formulas and Mermaid diagrams rasterized to images |
| Accumulating duplicate drafts after edits | Update the existing draft with direct and Qiaomu relay connections |
| Preparing a separate shareable version | Standalone HTML and long PNG exports |

![Typography controls](docs/assets/typography.png)

![Generated title cover and draft preview](docs/assets/draft-and-cover.png)

Screenshots show the real plugin in an isolated Obsidian vault. The account shown is a local demonstration account, not evidence of delivery to a live WeChat account.

## Send to drafts when ready

Add a connection from the publish window or plugin settings. You need a WeChat Official Account AppID, AppSecret, the relevant API permissions and IP allowlisting. Choose the Qiaomu fixed-IP relay, direct API access from your device, or an existing self-hosted qmblog Bridge. Multiple accounts are supported. The current Bridge integration creates new drafts only.

The plugin uses an explicit `cover` image, otherwise the first article image, otherwise a generated title cover. A missing explicit cover blocks sending. Successful sends can record the account and draft ID in note frontmatter so the next send updates the original. The plugin never performs mass publication; review and publish in WeChat yourself.

## X Articles, Zhihu and Xiaohongshu

The desktop publishing window also hands drafts to **Qiaomu Clipper 1.18.7+** in Chrome. Sign in to the chosen platform first. X requires article access; X and Zhihu receive editable article content, images and an optional cropped or generated cover. Xiaohongshu receives 3:4 cards, title, body and topics in its creator editor: review and choose Save draft or Publish yourself. The plugin never clicks public publication.

Markdown edits in the X/Zhihu window apply only to that send. GIFs within the configured limits retain their bytes; oversized GIFs fail with a compression prompt rather than becoming still JPEGs. Xiaohongshu cards are static images. Animated SVGs must first be exported to a format the destination supports, or PNG if a still image is intended.

For each handoff, the plugin opens a temporary random loopback port at `127.0.0.1`. Clipper exchanges a one-time token for the article and media, then uploads them through the signed-in platform page. The port closes when the task ends. This does not use the WeChat relay or collect platform passwords. Do not share a pending handoff link.

## Privacy and limits

Credentials use Obsidian SecretStorage, not synchronized `data.json`. Sending uploads article content and media through the selected connection. The optional Qiaomu relay receives credentials and content over HTTPS to call WeChat's API. Previewing remote images contacts their hosts; exports download and embed remote images. Connection checks, refreshing the egress IP, loading Bridge accounts and About-page QR images also use the network. Local text formatting does not require networking.

First-run migration reads the older Qiaomu Agent publishing settings in the same vault without modifying Agent files. Audio, video and embedded web pages require manual insertion in WeChat. Installed fonts and dark rendering may differ on readers' devices. Very long PNG exports reduce resolution with a notice.

## Verification

Version 0.2.0 was exercised in isolated macOS Obsidian: preview, light/dark and narrow layouts, keyboard typography changes, persisted settings, actual HTML/PNG exports, and upgrade preservation from 0.1.2. Draft creation, updating and note writeback were tested against a controlled local service, not a live WeChat account. iOS and Android devices have not been tested.

```bash
npm ci
npm run check
npm run dev
```

[QA record](docs/qa/2026-10-17-release.md) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [MIT license](LICENSE)

By 向阳乔木 — [qiaomu.ai](https://qiaomu.ai/) · [Blog](https://blog.qiaomu.ai/) · [X @vista8](https://x.com/vista8). Theme names describe visual inspiration and do not imply brand affiliation.

### Local images in 0.2.1

Wikilinks, inline/reference Markdown images, vault HTML images and attachments in embedded notes resolve to the file actually shown by Obsidian. Repeated local attachments upload once per draft operation. Static local SVGs become PNGs; SVGs with external resources must be exported first. Animated SVGs need a supported animation format, or PNG if a still image is intended. Missing images block copy, export and draft submission with a repair message. Copy embeds local image bytes but does not upload them to WeChat; use Send to drafts for automatic uploads.
