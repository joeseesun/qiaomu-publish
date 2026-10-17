# 0.3.0 官方审核失败排查

更新于 2026-10-17。审核对象：0.3.0，提交 `c4538555b2872f135b8af67d2560acd5060ed1c3`。

## 原始证据

- 正式状态为 Failed；唯一 Error 是 `Source review dependency installation failed`，依赖类型相关的源码检查被跳过。
- 同一正式报告的 Build verification 为 Pass：`Build reproduced the release main.js byte-for-byte`。
- 缺少构建来源证明为 Recommendation，不是本次阻断项。README 英文识别、源码和 CSS 的 Warning 也不等于该依赖安装错误。
- 后台未提供 npm 错误日志；不能把失败进一步断言为网络故障或依赖冲突。
- 在相同 tag 的干净 worktree、空 npm 缓存中，`npm ci`、334 项测试、TypeScript 和生产构建均通过。main.js SHA256 为 `5b386db0f4df2cd33b2cf947e0f4527ea3940a99604750fc09561818542fd765`，与公开资产完全一致。

## 修复范围与发布验收

0.3.1 更新版本元数据、发布流程和说明；运行时代码、依赖锁定版本、样式与 0.3.0 相同。新增 tag 工作流在 GitHub Actions 构建并为三个安装文件生成来源证明，只创建草稿，不自动公开。

必须分别记录最终候选预扫描、安装包校验、公开下载、正式扫描和目录状态。不得将 Pending 或客户端升级成功写成官方审核通过。实际预扫描和正式结果记录在对应 PR 与 Release 中。

后台 Check for new releases 返回旧版已扫描；Get help 的新扫描入口也仅导向版本发现，不直接重跑失败的同一版本。本次使用新的补丁版本触发完整正式审核，不覆盖 0.3.0 资产或移动标签。
