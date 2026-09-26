# 让普通用户把任意笔记发到自己的公众号草稿箱

调研日期：2026-09-26。结论：**Go，但先完成中转部署与真实账号验收，再承诺“填地址即可用”**。这里的“发布”指创建公众号后台草稿，正式发表仍由用户在微信公众平台操作。

## 2026-09-26 开发进展

- 插件已加入发布弹窗内首次绑定、固定出口 IP 查询与复制、连接测试、纯文字笔记自动生成标题封面、已有草稿更新或另建的选择；直连与旧 Bridge 入口保留。开发分支为 `codex/wechat-onboarding`，已在本地 Obsidian 测试仓库打开首次绑定界面，并通过类型检查、22 个测试及生产构建。
- 乔木博客 Bridge 的邀请中转新增公开出口 IP 查询、连接检查、草稿查询和更新，代码在 [PR #8](https://github.com/joeseesun/qmblog/pull/8)。这只证明代码和本地测试，不代表线上服务已启用。
- 插件预填 `https://wx.qiaomu.ai` 以减少输入，但当前生产中转仍未启用受邀用户配置；向用户发放邀请码或承诺可用前，须完成下方生产部署与外部账号验收。未使用真实公众号凭据发送草稿。

## 目标与外部前提

期望路径：用户取得自己公众号的 AppID/AppSecret 和接口权限 → 在公众号后台把乔木中转服务器的**固定公网出口 IP** 加入 API IP 白名单 → 在插件中填连接信息 → 测试 → 打开任意笔记 → 预览并发送到自己的草稿箱。Bridge 的 HTTPS 地址是插件要填的服务地址，**不能代替公众号后台要填的出口 IP**。

“任何人”不能理解成任何微信账号均可调用草稿 API。公众号必须在自己的管理后台取得 AppSecret 和所需接口权限；账号类型、认证状态和接口权限应由向导检查并明确报错，不能由插件或代理绕过。用户本身没有管理权限时，也不能代替其设置白名单。

## 现有工具与可借鉴处

| 项目与固定版本 | 当前路径 | 对本目标的启发 |
| --- | --- | --- |
| [NoteToMP](https://github.com/sunbooshi/note-to-mp/tree/34abe3cd174697b28f2052ffead6b33b6757f5a7)（MIT） | 排版、复制、发草稿；有自有服务及会员功能。核心渲染有私有子模块，公开仓库不能视为完整可复用实现。 | 单篇笔记从预览直接进入发草稿；中文属性兼容。不要照搬未验证的 token 中转假设。 |
| [WeChat Publisher](https://github.com/RanceLee233/wechat-publisher/tree/72d7a57b2223cd4d91ae82eaf42724bbd8bde543)（MIT） | 本机直连，向导显示微信实际看到的出口 IP；账号默认封面；再次发送更新原草稿。 | 白名单报错要告诉用户具体 IP；纯文字笔记也应能选默认封面；避免重复草稿。 |
| [MP Publisher](https://github.com/joeytoday/obsidian-mp-publisher/tree/a92868692ac2492db66f7d1d3c99d1cbbf82f5e1)（AGPL-3.0） | 直连草稿，提供排版主题；文档建议开放式 IP 白名单。 | 只看交互和能力，不复用 AGPL 代码；**不建议开放式白名单**。 |
| [WeChat Multi Publisher](https://github.com/Kianzzz/wechatPB/tree/2d11eabb5e90fdd759a1be16e6a608b2b8a584a9)（MIT） | 多账号、代理、密钥放 SecretStorage；桌面端。 | 多账号和代理可作为高级需求，首发不需要批量发布。 |
| [Obsidian WeChat Converter](https://github.com/DavidLam-oss/obsidian-wechat-converter/tree/3fef6122d07f405cc4459102d0545551c7bc50bb)（MIT） | 直连或可选 API 代理，另有多平台草稿。 | 不扩展多平台；代理必须验证固定出口 IP，Cloudflare Worker 地址本身不保证固定出口。 |
| [乔木博客 Bridge](https://github.com/joeseesun/qmblog/pull/8)（PR `fcc963e`） | `/v2` 中转已有邀请密钥、按 AppID 限制、请求期间处理 Secret、固定出口 IP 配置、图片上传和草稿创建。 | 复用服务器实现，先完成 HTTPS、固定出口、邀请密钥与部署验收。PR 仍开放；生产可用性未证实。 |

检索范围：Obsidian 社区插件、上述 GitHub 仓库与本地乔木博客/Publish 源码；这是代表性竞品集，不声称穷尽所有插件。未复制第三方代码。

## 本插件的实际缺口

1. `src/settings-tab.ts` 有直连、中转、自建 Bridge 三种入口，但首次使用要自己判断模式、手填中转地址和邀请码。默认连接体验没有向导，也没有从发布弹窗进入配置的直接路径。
2. `src/relay-client.ts` 的“测试连接”调用 `/v2/egress-ip`。Bridge 会取 token 再调用微信只读接口，因此能检查密钥、AppID/Secret、白名单和部分接口权限；**不能证明图片上传与 `draft/add` 权限**。结果应拆成“中转可用 / 微信连接可用 / 草稿创建已验收”，不要显示笼统成功。
3. `src/publisher.ts` 强制从 `cover` 属性或正文第一张图取得封面。纯文字笔记没有图就无法发送，和“任意笔记”冲突。应支持每个账号的默认封面，必要时在发送弹窗选择本地图片；若不自动生成占位封面，就要明确用户必须选封面。
4. `recordDraft` 已写回 `wechat_media_id`，但再次点击仍调用新建草稿。应先核对微信端该 ID 和账号，再让用户选择更新或新建；远端草稿不存在时给恢复入口，防止盲目重复。
5. 中转服务在 `qmblog` PR #8。2026-09-26 只读核对发现生产 `https://wx.qiaomu.ai/health` 返回 200，线上 `server.mjs` 与该 PR 原始提交的 SHA-256 一致，服务器实际公网出口为 `207.148.115.69`；但进程未配置 `WECHAT_RELAY_KEYS_FILE` 与 `WECHAT_RELAY_EGRESS_IPS`，因此**受邀用户中转仍未启用**。公网还可直接访问明文 HTTP `:8788`，在对外发放密钥前需查清现有调用依赖并关闭或限制该入口。
6. 当前插件只有 `draft/add` 返回 `media_id` 即宣布发送成功；下一阶段应在受控测试中调用 `draft/get` 读回标题、封面、正文图，区分 API 接受与后台实际可见。不要因网络重试无条件再发一次。

## 推荐改造顺序

### P0：让首次绑定走通

1. 完成 Bridge PR #8 的代码/安全审查、合并与部署；确认固定出口 IP、HTTPS 域名、反向代理日志不记录凭据、邀请密钥发放和撤销。先用一个**非乔木自有**测试公众号完整跑 `egress-ip → 图片 → draft/add → draft/get`；记录实际账号权限与错误码。插件虽预填域名，但在部署和验收前不得对外声称中转可用。
2. 设置页提供一条主路径“连接我的公众号”：AppID、AppSecret、邀请密钥、Bridge HTTPS 地址、固定出口 IP 的复制按钮、打开公众号后台、分步测试。高级选项保留直连和自建 Bridge。邀请密钥仍手动发放；若将来追求完全自助，再单独设计申请/审核/配额服务，不能靠公开共享密钥。
3. 测试反馈逐项显示：地址或密钥错误、AppID/Secret 错误、40164 白名单错误及实际出口 IP、接口无权限、频率/配额限制。**白名单填公网 IP，插件填 HTTPS 地址**，在界面上分开。
4. 未连接时，预览和复制照常可用；点击“发到草稿箱”出现连接入口，完成后回到原笔记和原发送资料。

### P1：兑现“任意一篇文章”

5. 账号默认封面、单篇封面选择与上传；纯文字笔记用默认封面。保留正文第一张图自动推断，但发送前显示最终封面。
6. `wechat_media_id` 对应同一账号时先查询草稿并提供“更新这篇草稿 / 新建一篇”；服务端 `/v2` 需增加严格限制的 `draft/get` 和 `draft/update`，仍不开放正式发布接口。更新前确认源文件与远端草稿身份，失败时不覆盖笔记原记录。
7. 用纯文字、本地图片、远程图片、GIF、公式、Mermaid、长文和嵌入/内部链接各跑至少一篇真实草稿；对不能还原的内容在预检中明确提示，而不是声称任意 Obsidian 内容无损发布。

### 后续

单独评估公众号第三方平台授权（扫码授权/OAuth）是否可替代手填 AppSecret。它涉及平台主体、权限集、审核和运营，不应混进当前“用户自有 AppID/Secret + 固定 IP 中转”的 MVP。

## 验收门槛

- 新用户只看向导，能明确区分 Bridge HTTPS 地址与公众号 API 白名单 IP；错误可以按提示自行修复。
- 外部测试号：提交纯文字和带本地图片两篇笔记，`draft/get` 读回媒体 ID、标题、封面及正文图，并在公众号后台看到草稿。
- 错误路径：错密钥、错 Secret、未加 IP、无接口权限、断网、重试、超额、重复发送均给具体恢复动作；不能产生未经提示的重复草稿。
- 旧直连/自建 Bridge 设置和 SecretStorage 键继续可用；AppSecret 和邀请密钥不写入 `data.json` 或服务日志。

## 官方依据与证据限制

- [微信 API IP 白名单](https://developers.weixin.qq.com/doc/oplatform/developers/basic_func/ip_whitelist.html)、[新建草稿](https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html)：官方页面在本轮抓取工具返回错误；白名单要求依据此前项目调研与现有实现，正式上线前需在微信开发者后台重查当时规则。
- [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies) 与 [插件 API](https://github.com/obsidianmd/obsidian-api)：插件只在主动测试/发送时联网，密钥继续使用 SecretStorage。
- 当前结论是产品和工程评估；未在本轮动用用户公众号凭据，未部署服务，也未对外部账号创建草稿。
