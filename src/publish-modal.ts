import { type App, Component, Modal, Notice, setIcon, Setting, type TFile } from "obsidian";
import type { WechatPublishSettings } from "./types";
import type { WechatAccount } from "./bridge-client";
import { WechatTransportRouter } from "./transport-router";
import { buildWechatHtml, listWechatThemes, resolveWechatTheme } from "./export-html";
import { type DraftMeta, metaFromFrontmatter, preflight, publishDraft, recordDraft, resolveCover } from "./publisher";
import { renderNoteForWechat, type ArticleImage, type RenderedNote } from "./render-note";
import { copyWechatHtml } from "./copy-html";
import { WechatDirectClient } from "./direct-client";
import { WechatRelayClient, relayEgressIps } from "./relay-client";
import type QiaomuPublishPlugin from "./main";
import { QIAOMU_RELAY_URL } from "./defaults";

const PREVIEW_CSS = `:host{display:block}.frame{max-width:677px;margin:0 auto;padding:16px 12px;background:#fff;color:#1a1a1a}img{max-width:100%}`;

export class WechatPublishModal extends Modal {
  private readonly component = new Component();
  private note: RenderedNote | null = null;
  private meta: DraftMeta | null = null;
  private themeId: string;
  private wechatHtml = "";
  private accounts: WechatAccount[] = [];
  private client: WechatTransportRouter | null = null;
  private clientError = "";
  private abort: AbortController | null = null;
  private busy = false;
  private checksEl!: HTMLElement;
  private previewRoot!: ShadowRoot;
  private statusEl!: HTMLElement;
  private publishButton!: HTMLButtonElement;
  private copyButton!: HTMLButtonElement;
  private draftAction: "update" | "new" = "update";
  private coverPreviewTitle: HTMLElement | null = null;

  private readonly settings: WechatPublishSettings;

  constructor(app: App, private readonly file: TFile, private readonly plugin: QiaomuPublishPlugin) {
    super(app);
    this.settings = plugin.settings.wechat;
    this.themeId = this.settings.themeId;
  }

  override onOpen(): void {
    this.component.load();
    this.modalEl.addClass("qiaomu-wechat-modal");
    this.setTitle("发布到公众号草稿箱");
    this.statusEl = this.contentEl.createDiv({ cls: "qiaomu-wechat-status", text: "正在排版…" });
    this.statusEl.setAttribute("role", "status");
    this.statusEl.setAttribute("aria-live", "polite");
    void this.load();
  }

  override onClose(): void {
    this.abort?.abort();
    this.note?.dispose();
    this.component.unload();
    this.contentEl.empty();
  }

  private async load(): Promise<void> {
    try {
      this.client = new WechatTransportRouter(this.app, this.settings);
      const [note, accounts] = await Promise.all([
        renderNoteForWechat(this.app, this.file, this.component),
        this.client.listAccounts().catch((error: unknown) => {
          this.clientError = `无法连接公众号：${error instanceof Error ? error.message : String(error)}`;
          return [] as WechatAccount[];
        }),
      ]);
      if (!this.contentEl.isConnected) { note.dispose(); return; }
      this.note = note;
      this.accounts = accounts;
      if (!accounts.length) this.clientError ||= this.client.errors.join("；") || "尚未连接公众号";
      this.meta = metaFromFrontmatter(note.frontmatter, note.title, {
        accountId: this.settings.defaultAccountId,
        author: this.settings.author,
        openComment: this.settings.openComment,
      });
      if (this.accounts.length && !this.accounts.some((account) => account.id === this.meta!.accountId)) this.meta.accountId = this.accounts[0]!.id;
      const themeField = [note.frontmatter.wechat_theme, note.frontmatter["公众号主题"]].find((value) => typeof value === "string");
      if (typeof themeField === "string" && listWechatThemes().some((theme) => theme.id === themeField)) this.themeId = themeField;
      this.renderForm();
    } catch (error) {
      this.statusEl.setText(`排版失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private renderForm(): void {
    const note = this.note!;
    const meta = this.meta!;
    this.statusEl.remove();
    const { contentEl } = this;
    const form = contentEl.createDiv({ cls: "qiaomu-wechat-form" });

    if (this.accounts.length === 0) {
      this.renderConnectionForm(form);
      let previewError = "";
      try { this.wechatHtml = buildWechatHtml(note.html, resolveWechatTheme(this.themeId)); }
      catch (error) { this.wechatHtml = ""; previewError = `排版失败：${error instanceof Error ? error.message : String(error)}`; }
      const footer = contentEl.createDiv({ cls: "qiaomu-wechat-footer" });
      this.statusEl = footer.createDiv({ cls: "qiaomu-wechat-status" });
      this.statusEl.setAttribute("role", "status");
      this.statusEl.setText(previewError);
      const actions = footer.createDiv({ cls: "qiaomu-wechat-actions" });
      this.copyButton = actions.createEl("button", { text: "先复制公众号格式" });
      this.copyButton.disabled = !this.wechatHtml;
      this.copyButton.addEventListener("click", () => void this.copy());
      actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
      return;
    }

    const accountSetting = new Setting(form).setName("公众号");
    const draftChoiceHost = form.createDiv();
    accountSetting.addDropdown((dropdown) => {
      if (this.accounts.length === 0) dropdown.addOption("", this.clientError ? "未连接" : "无可用公众号");
      for (const account of this.accounts) dropdown.addOption(account.id, account.name);
      dropdown.setValue(meta.accountId).onChange((value) => { meta.accountId = value; draftChoiceHost.empty(); this.renderDraftChoice(draftChoiceHost); this.refreshChecks(); });
      dropdown.setDisabled(this.accounts.length === 0);
    });
    this.renderDraftChoice(draftChoiceHost);
    new Setting(form).setName("排版主题").addDropdown((dropdown) => {
      for (const theme of listWechatThemes()) dropdown.addOption(theme.id, theme.name);
      dropdown.setValue(resolveWechatTheme(this.themeId).id).onChange((value) => { this.themeId = value; this.renderPreview(); });
    });
    new Setting(form).setName("标题").addText((text) => {
      text.setValue(meta.title).onChange((value) => { meta.title = value.trim(); this.coverPreviewTitle?.setText(meta.title); this.refreshChecks(); });
      text.inputEl.addClass("qiaomu-wechat-wide");
    });
    new Setting(form).setName("作者").addText((text) => text.setValue(meta.author).onChange((value) => { meta.author = value.trim(); this.refreshChecks(); }));
    new Setting(form).setName("摘要").setDesc("留空时公众号自动截取正文开头。").addTextArea((area) => {
      area.setValue(meta.digest).onChange((value) => { meta.digest = value.trim(); this.refreshChecks(); });
      area.inputEl.rows = 2;
      area.inputEl.addClass("qiaomu-wechat-wide");
    });
    const coverSetting = new Setting(form).setName("封面").setDesc(this.coverLabel(note.images));
    this.coverPreviewTitle = null;
    if (!resolveCover(this.app, this.file.path, meta, note.images)) {
      const cover = coverSetting.controlEl.createDiv({ cls: "qiaomu-title-cover-preview" });
      this.coverPreviewTitle = cover.createDiv({ text: meta.title });
    }

    this.checksEl = contentEl.createEl("ul", { cls: "qiaomu-wechat-checks" });
    this.checksEl.setAttribute("aria-label", "发布前检查");
    const preview = contentEl.createDiv({ cls: "qiaomu-wechat-preview" });
    preview.setAttribute("aria-label", "公众号排版预览");
    this.previewRoot = preview.attachShadow({ mode: "open" });

    const footer = contentEl.createDiv({ cls: "qiaomu-wechat-footer" });
    this.statusEl = footer.createDiv({ cls: "qiaomu-wechat-status" });
    this.statusEl.setAttribute("role", "status");
    this.statusEl.setAttribute("aria-live", "polite");
    const actions = footer.createDiv({ cls: "qiaomu-wechat-actions" });
    this.copyButton = actions.createEl("button", { text: "复制公众号格式" });
    this.copyButton.addEventListener("click", () => void this.copy());
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    this.publishButton = actions.createEl("button", { text: "发到草稿箱", cls: "mod-cta" });
    this.publishButton.addEventListener("click", () => void this.publish());
    this.renderPreview();
  }

  private coverLabel(images: ArticleImage[]): string {
    const cover = resolveCover(this.app, this.file.path, this.meta!, images);
    if (!cover && this.meta!.cover) return `找不到封面「${this.meta!.cover}」，请检查笔记属性 cover。`;
    if (!cover) return "这篇笔记没有图片，发送时会自动生成标题封面。";
    if (this.meta!.cover) return `属性 cover：${this.meta!.cover}`;
    return `正文第一张图片：${cover.kind === "url" ? cover.url : cover.image.name}`;
  }

  private renderPreview(): void {
    if (!this.note) return;
    try {
      this.wechatHtml = buildWechatHtml(this.note.html, resolveWechatTheme(this.themeId));
    } catch (error) {
      this.wechatHtml = "";
      this.statusEl.setText(`排版失败：${error instanceof Error ? error.message : String(error)}`);
    }
    this.previewRoot.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = PREVIEW_CSS;
    const frame = document.createElement("div");
    frame.className = "frame";
    frame.innerHTML = this.wechatHtml;
    this.previewRoot.append(style, frame);
    this.refreshChecks();
  }

  private refreshChecks(): void {
    if (!this.note || !this.meta) return;
    if (!this.checksEl || !this.publishButton) {
      if (this.copyButton) this.copyButton.disabled = !this.wechatHtml || this.busy;
      return;
    }
    const hasCover = true; // A text-only note receives a generated title cover.
    const checks = preflight(this.meta, this.wechatHtml, hasCover, this.note.warnings);
    if (this.meta.cover && !resolveCover(this.app, this.file.path, this.meta, this.note.images)) {
      checks.unshift({ level: "error", message: `找不到指定封面：${this.meta.cover}`, fix: "请修正 cover 属性，或删除它以生成标题封面。" });
    }
    if (this.clientError) checks.unshift({ level: "error", message: this.clientError, fix: "请在上方连接公众号；也可以先复制公众号格式。" });
    this.checksEl.empty();
    for (const check of checks) {
      const item = this.checksEl.createEl("li", { cls: `is-${check.level}` });
      const icon = item.createSpan({ cls: "qiaomu-wechat-check-icon" });
      setIcon(icon, check.level === "error" ? "circle-x" : check.level === "warning" ? "triangle-alert" : "info");
      icon.setAttribute("aria-hidden", "true");
      item.createSpan({ text: check.fix ? `${check.message} ${check.fix}` : check.message });
    }
    this.checksEl.toggleClass("is-empty", checks.length === 0);
    const blocked = checks.some((check) => check.level === "error") || !this.wechatHtml;
    this.publishButton.disabled = blocked || this.busy;
    this.copyButton.disabled = !this.wechatHtml || this.busy;
  }

  private renderConnectionForm(container: HTMLElement): void {
    const panel = container.createDiv({ cls: "qiaomu-wechat-connect" });
    panel.createEl("h3", { text: "连接你的公众号" });
    panel.createEl("p", { text: "连接一次，以后打开笔记就能直接发到自己的草稿箱。" });
    const input = { mode: "relay" as "relay" | "direct", appId: "", appSecret: "", relayUrl: QIAOMU_RELAY_URL, inviteKey: "" };
    panel.createEl("a", { text: "前往公众号后台获取 AppID 和 AppSecret", href: "https://mp.weixin.qq.com/", attr: { target: "_blank", rel: "noopener noreferrer" } });
    const mode = new Setting(panel).setName("连接方式").addDropdown((dropdown) => {
      dropdown.addOption("relay", "固定 IP 中转（推荐）");
      dropdown.addOption("direct", "当前设备直连");
      dropdown.onChange((value) => { input.mode = value as "relay" | "direct"; relayFields.toggleClass("is-hidden", value !== "relay"); });
    });
    mode.setDesc("直连要求当前设备的公网出口 IP 已加入公众号 API 白名单。");
    const relayFields = panel.createDiv();
    relayFields.createEl("p", { text: "通过乔木服务器访问微信；AppSecret 只在请求期间经 HTTPS 传输，不保存在中转服务器。" });
    new Setting(relayFields).setName("乔木中转地址").setDesc("填 HTTPS 地址；公众号后台的 API 白名单要填下方显示的固定公网 IP。")
      .addText((text) => text.setValue(QIAOMU_RELAY_URL).onChange((value) => { input.relayUrl = value.trim(); }));
    const ipButton = relayFields.createEl("button", { text: "查看白名单 IP" });
    const ipStatus = relayFields.createDiv({ cls: "qiaomu-wechat-connect-status" });
    ipStatus.setAttribute("role", "status");
    new Setting(relayFields).setName("邀请密钥").setDesc("由乔木发放；只保存在本机 SecretStorage。")
      .addText((text) => { text.inputEl.type = "password"; text.onChange((value) => { input.inviteKey = value.trim(); }); });
    new Setting(panel).setName("AppID").addText((text) => text.setPlaceholder("在公众号后台获取").onChange((value) => { input.appId = value.trim(); }));
    new Setting(panel).setName("AppSecret").addText((text) => {
      text.inputEl.type = "password";
      text.onChange((value) => { input.appSecret = value.trim(); });
    });
    const status = panel.createDiv({ cls: "qiaomu-wechat-connect-status" });
    status.setAttribute("role", "status");
    const actions = panel.createDiv({ cls: "qiaomu-wechat-connect-actions" });
    const connectButton = actions.createEl("button", { text: "测试并连接", cls: "mod-cta" });
    const account = { id: "new", name: "新公众号" };
    const relay = () => new WechatRelayClient(account, input.appId, input.appSecret, input.inviteKey, input.relayUrl);
    ipButton.addEventListener("click", () => void (async () => {
      ipButton.disabled = true;
      try {
        const ips = await relayEgressIps(input.relayUrl);
        ipStatus.empty();
        ipStatus.createSpan({ text: `在公众号后台的 API IP 白名单加入：${ips.join("、") || "中转未配置固定出口 IP"} ` });
        if (ips.length) ipStatus.createEl("button", { text: "复制 IP" }).addEventListener("click", () => void navigator.clipboard.writeText(ips.join("\n")).then(() => ipStatus.setText(`已复制 ${ips.join("、")}，请粘贴到公众号后台 API IP 白名单。`)).catch(() => ipStatus.setText(`复制失败，请手动复制：${ips.join("、")}`)));
      } catch (error) { ipStatus.setText(`读取失败：${error instanceof Error ? error.message : String(error)}`); }
      finally { ipButton.disabled = false; }
    })());
    connectButton.addEventListener("click", () => void (async () => {
      connectButton.disabled = true;
      status.setText("正在检查公众号连接…");
      try {
        if (!input.appId || !input.appSecret) throw new Error("请填写 AppID 和 AppSecret");
        if (input.mode === "relay") await relay().testConnection();
        else await new WechatDirectClient(account, input.appId, input.appSecret).testConnection();
        const id = `${input.mode}:${crypto.randomUUID()}`;
        const appSecretId = `qiaomu-wechat-secret-${id}`;
        const inviteSecretId = input.mode === "relay" ? `qiaomu-wechat-invite-${id}` : undefined;
        this.app.secretStorage.setSecret(appSecretId, input.appSecret);
        if (inviteSecretId) this.app.secretStorage.setSecret(inviteSecretId, input.inviteKey);
        const previousDefault = this.settings.defaultAccountId;
        this.settings.connections.push({ id, name: `我的公众号 ${input.appId.slice(-4)}`, mode: input.mode, appId: input.appId, appSecretId, relayUrl: input.mode === "relay" ? input.relayUrl : undefined, inviteSecretId });
        this.settings.defaultAccountId = id;
        try { await this.plugin.saveSettings(); }
        catch (error) {
          this.settings.connections = this.settings.connections.filter((item) => item.id !== id);
          this.settings.defaultAccountId = previousDefault;
          this.app.secretStorage.setSecret(appSecretId, "");
          if (inviteSecretId) this.app.secretStorage.setSecret(inviteSecretId, "");
          throw error;
        }
        this.clientError = "";
        this.client = new WechatTransportRouter(this.app, this.settings);
        this.accounts = await this.client.listAccounts();
        this.meta!.accountId = id;
        this.contentEl.empty();
        this.renderForm();
      } catch (error) { status.setText(`连接失败：${error instanceof Error ? error.message : String(error)}`); }
      finally { connectButton.disabled = false; }
    })());
  }

  private existingMediaId(): string {
    const frontmatter = this.note?.frontmatter;
    return frontmatter?.wechat_account === this.meta?.accountId && typeof frontmatter?.wechat_media_id === "string"
      ? frontmatter.wechat_media_id.trim() : "";
  }

  private renderDraftChoice(container: HTMLElement): void {
    const mediaId = this.existingMediaId();
    if (!mediaId) return;
    if (!this.client?.canUpdateDraft(this.meta!.accountId)) {
      new Setting(container).setName("这篇笔记已有草稿").setDesc("当前自建 Bridge 不支持更新，发送后会另建一篇草稿。");
      return;
    }
    new Setting(container).setName("这篇笔记已有草稿").setDesc("默认更新原草稿，避免在后台生成重复文章。")
      .addDropdown((dropdown) => dropdown.addOption("update", "更新原草稿").addOption("new", "另建一篇草稿")
        .setValue(this.draftAction).onChange((value) => { this.draftAction = value as "update" | "new"; }));
  }

  private setBusy(busy: boolean, message = ""): void {
    this.busy = busy;
    this.statusEl.setText(message);
    this.refreshChecks();
  }

  private async copy(): Promise<void> {
    if (!this.note || !this.wechatHtml) return;
    this.setBusy(true, "正在准备复制…");
    try {
      await copyWechatHtml(this.app, this.wechatHtml, this.note.images);
      this.setBusy(false, "已复制，可粘贴到公众号编辑器。");
    } catch (error) {
      this.setBusy(false, `复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async publish(): Promise<void> {
    if (this.busy || !this.note || !this.meta || !this.client) return;
    this.abort = new AbortController();
    this.setBusy(true, "准备发送…");
    try {
      const mediaId = this.draftAction === "update" ? this.existingMediaId() : "";
      if (mediaId && this.client.canUpdateDraft(this.meta.accountId)) {
        try {
          await this.client.getDraft(this.meta.accountId, mediaId);
        } catch (error) {
          throw new Error(`无法确认原草稿：${error instanceof Error ? error.message : String(error)}。可选择「另建一篇草稿」后重试。`);
        }
      }
      const result = await publishDraft({
        app: this.app,
        client: this.client,
        note: this.note,
        file: this.file,
        wechatHtml: this.wechatHtml,
        meta: this.meta,
        existingMediaId: mediaId && this.client.canUpdateDraft(this.meta.accountId) ? mediaId : undefined,
        signal: this.abort.signal,
        onProgress: (message) => { if (this.contentEl.isConnected) this.statusEl.setText(message); },
      });
      let saved = true;
      if (this.settings.recordInNote) {
        try { await recordDraft(this.app, this.file, this.meta.accountId, result.mediaId); }
        catch { saved = false; }
      }
      new Notice(saved ? `已${mediaId ? "更新" : "发送"}到「${result.accountName}」草稿箱，请在公众号后台检查后发布。` : `草稿已发送到「${result.accountName}」，但没能写回笔记记录，请到公众号后台确认。`);
      this.close();
    } catch (error) {
      if (this.contentEl.isConnected) this.setBusy(false, `发送失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.abort = null;
    }
  }
}
