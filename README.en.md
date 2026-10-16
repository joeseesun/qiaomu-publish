# Qiaomu Publish

[中文](README.md) · **English**

**Your note should not need formatting twice.**

Write in Obsidian, preview your WeChat Official Account article, then copy the formatted result or send it to drafts. Your Markdown stays in your vault.

![Markdown beside the live article preview](docs/assets/live-preview.png)

[Download the latest release](https://github.com/joeseesun/qiaomu-publish/releases/latest) · [Community directory](https://community.obsidian.md/plugins/qiaomu-publish) · [Report an issue](https://github.com/joeseesun/qiaomu-publish/issues)

## Start without an account

Requires Obsidian **1.11.4+**. Download `main.js`, `manifest.json` and `styles.css` from the same release, place them in `<vault>/.obsidian/plugins/qiaomu-publish/`, restart Obsidian and enable Qiaomu Publish under Community plugins. Preserve `data.json` when updating. If the community listing is not yet available in your client, use this manual path.

Open a Markdown note and run **实时预览当前笔记的公众号排版** from the command palette, or click the smartphone ribbon icon. The plugin UI is currently Chinese. Preview, formatting, copying and exports work without configuring an account.

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
