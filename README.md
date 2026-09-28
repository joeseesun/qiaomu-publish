# Qiaomu Publish

在 Obsidian 里实时预览公众号排版，复制公众号格式，或发送到公众号草稿箱。

## 使用

- **预览**：命令面板「实时预览当前笔记的公众号排版」、左侧栏手机图标或文件菜单「预览公众号排版」。预览随笔记更新，可与笔记同步滚动；右上角可切换手机与宽幅、深色模拟、复制公众号格式或打开草稿弹窗。
- **发布**：命令面板「发布当前笔记到公众号草稿箱」或文件菜单「发布到公众号草稿箱」。弹窗里可以选公众号和排版主题，修改标题、作者、摘要，查看发布前检查和排版预览，然后发到草稿箱；也可以只复制公众号格式。

- 排版复用乔木博客的公众号主题和规范化代码，CSS 用浏览器 CSSOM 内联，不引入 juice。
- 本地图片、公式（MathJax → MathML → PNG）和 Mermaid 图（Obsidian 内置 Mermaid → PNG）通过所选连接上传，换成公众号图床地址。
- 属性：`title/标题`、`author/作者`、`digest/摘要`、`cover/封面`、`wechat_account/公众号`、`wechat_theme/公众号主题`、`source_url/原文链接`。成功后写回 `wechat_media_id`、`wechat_draft_at`、`wechat_account`。
- 所有连接只创建草稿，不执行正式群发。深色预览只是模拟，最终排版需在公众号后台核对。首次使用建议先用测试公众号执行一次完整草稿流程。

## 连接公众号

在「设置 → Qiaomu Publish」添加连接：

- **直连微信**：当前设备出口 IP 需要在公众号 API 白名单中。
- **乔木中转**：需要邀请密钥，并将中转服务器的固定出口 IP 加入白名单。
- **自建 qmblog Bridge**：需要包含 `POST /v1/wechat/images` 接口的版本。

不配置连接也能预览和复制公众号格式。

## 从乔木 Agent 迁移

早期版本的乔木 Agent 内置了公众号发布。首次启用本插件时，如果本插件还没有设置，会自动导入乔木 Agent 中的公众号设置。已保存的 AppSecret、邀请密钥和 Bridge 令牌沿用原来的 SecretStorage 条目，不需要重新填写。

## 隐私与网络

- 只有你主动发送草稿或测试连接时才会联网。直连方式从当前设备向微信 API 发送；自建 Bridge 方式发到你配置的 Bridge；乔木中转方式将 AppID、AppSecret、正文与图片经 HTTPS 传至乔木服务器，再由服务器调用微信 API。乔木中转不持久保存 AppSecret 或公众号账号。
- AppSecret、邀请密钥和 Bridge 令牌保存在 Obsidian SecretStorage，不写入同步的插件数据。
- 首次启动时读取同一仓库中 `qiaomu-agent/data.json` 的公众号设置用于迁移，只读不写。

## 开发

```bash
npm install
npm run dev
```

`npm run check` 依次执行类型检查、测试和生产构建。

## License

MIT

## English

Qiaomu Publish previews an Obsidian note as a WeChat Official Account article. Open the preview from the command palette, ribbon, or file menu; copy the formatted HTML, or explicitly send the article to your account's draft box. It never performs a mass publication. Preview and copying work without an account or connection.

To create drafts, configure a WeChat Official Account through the direct WeChat API, an invitation-based Qiaomu relay, or your own qmblog Bridge. Account credentials and IP allowlisting may be required. Draft creation uploads the selected article and images through that connection. The Qiaomu relay receives the AppID, AppSecret, article and images over HTTPS to call WeChat's API. External images in a preview may load from their original hosts; connection tests and draft uploads also use the network. Credentials use Obsidian SecretStorage rather than synchronized plugin settings.

On first setup, the plugin can read the older Qiaomu Agent publishing configuration from the same vault to migrate it without modifying Agent's files. The plugin is MIT licensed.
