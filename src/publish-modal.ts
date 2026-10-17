import { type App, Component, Modal, Notice, sanitizeHTMLToDom, setIcon, Setting, type TFile } from "obsidian";
import type { WechatPublishSettings } from "./types";
import type { WechatAccount } from "./bridge-client";
import { WechatTransportRouter } from "./transport-router";
import { setName } from "./accessible-name";
import { buildWechatHtml, resolveWechatTheme } from "./export-html";
import { type DraftMeta, metaFromFrontmatter, preflight, publishDraft, recordDraft, resolveCover } from "./publisher";
import { renderNoteForWechat, type ArticleImage, type RenderedNote } from "./render-note";
import { copyWechatHtml } from "./copy-html";
import { WechatDirectClient } from "./direct-client";
import { WechatRelayClient, knownRelayEgressIps, relayEgressIps } from "./relay-client";
import type QiaomuPublishPlugin from "./main";
import { QIAOMU_RELAY_CODE, QIAOMU_RELAY_URL } from "./defaults";
import { resolveArticleAppearance } from "./article-style";
import type { WechatArticleStyle } from "./types";
import { CoverSection } from "./cover/cover-section";
import { COVER_SPECS } from "./cover/spec";
import { loadArticleImage } from "./external/assets";
import { noteImageCandidates } from "./external/prepare";
import { ThemePicker } from "./theme-picker";
import { connectionSecretId } from "./secret-storage";
import { renderPlatformSwitch } from "./platform-switch";

export class WechatPublishModal extends Modal {
  private readonly component = new Component();
  private note: RenderedNote | null = null;
  private meta: DraftMeta | null = null;
  private themeId: string;
  private articleStyle: WechatArticleStyle = {};
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
  private cover: CoverSection | null = null;
  private picker!: ThemePicker;
  private paper!: HTMLElement;
  private screen!: HTMLElement;
  private previewTimer: number | null = null;
  private checksTimer: number | null = null;

  private readonly settings: WechatPublishSettings;

  constructor(app: App, private readonly file: TFile, private readonly plugin: QiaomuPublishPlugin) {
    super(app);
    this.settings = plugin.settings.wechat;
    this.themeId = this.settings.themeId;
  }

  override onOpen(): void {
    this.component.load();
    this.modalEl.addClass("qiaomu-wechat-modal");
    this.setTitle("发布");
    renderPlatformSwitch(this.contentEl, "wechat", (choice) => { this.close(); this.plugin.openPublish(this.file, choice); });
    this.statusEl = this.contentEl.createDiv({ cls: "qiaomu-wechat-status", text: "正在排版…" });
    this.statusEl.setAttribute("role", "status");
    this.statusEl.setAttribute("aria-live", "polite");
    void this.load();
  }

  override onClose(): void {
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
    if (this.checksTimer !== null) window.clearTimeout(this.checksTimer);
    this.cover?.destroy();
    this.picker?.destroy();
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
      const appearance = resolveArticleAppearance(this.settings, this.file.path, note.frontmatter);
      this.themeId = appearance.themeId;
      this.articleStyle = appearance.style;
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
    const body = contentEl.createDiv({ cls: "qiaomu-wechat-body" });

    if (this.accounts.length === 0) {
      this.renderConnectionForm(body.createDiv({ cls: "qiaomu-wechat-form" }));
      let previewError = "";
      try { this.wechatHtml = buildWechatHtml(note.html, resolveWechatTheme(this.themeId), undefined, this.articleStyle); }
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

    const columns = body.createDiv({ cls: "qiaomu-wechat-columns" });
    const form = columns.createDiv({ cls: "qiaomu-wechat-form" });
    const phone = columns.createDiv({ cls: "qiaomu-wechat-phone" });
    this.screen = phone.createDiv({ cls: "qiaomu-wechat-phone-screen" });
    const bar = this.screen.createDiv({ cls: "qiaomu-wechat-phone-bar", attr: { "aria-hidden": "true" } });
    bar.createSpan({ cls: "qiaomu-wechat-phone-time", text: "9:41" });
    bar.createSpan({ cls: "qiaomu-wechat-phone-island" });
    const status = bar.createSpan({ cls: "qiaomu-wechat-phone-icons" });
    for (const icon of ["signal", "wifi", "battery-full"]) setIcon(status.createSpan(), icon);
    const scroll = this.screen.createDiv({ cls: "qiaomu-wechat-phone-scroll", attr: { role: "region" } });
    setName(scroll, "公众号排版预览");
    this.paper = scroll.createDiv({ cls: "qiaomu-wechat-preview-paper" });
    this.previewRoot = this.paper.attachShadow({ mode: "open" });
    this.screen.createDiv({ cls: "qiaomu-wechat-phone-home", attr: { "aria-hidden": "true" } });

    const accountSetting = new Setting(form).setName("公众号");
    const draftChoiceHost = form.createDiv();
    accountSetting.addDropdown((dropdown) => {
      for (const account of this.accounts) dropdown.addOption(account.id, account.name);
      dropdown.setValue(meta.accountId).onChange((value) => { meta.accountId = value; draftChoiceHost.empty(); this.renderDraftChoice(draftChoiceHost); this.refreshChecks(); });
    });
    accountSetting.addButton((button) => button.setButtonText("管理连接").onClick(() => { this.close(); this.plugin.openSettings(); }));
    this.renderDraftChoice(draftChoiceHost);

    const themeSetting = new Setting(form).setName("排版主题");
    this.picker = new ThemePicker(themeSetting.controlEl, (themeId) => {
      this.themeId = themeId;
      this.picker.setValue(themeId, this.articleStyle.primaryColor);
      this.renderPreviewSoon();
    }, "field");
    this.picker.setValue(resolveWechatTheme(this.themeId).id, this.articleStyle.primaryColor);

    new Setting(form).setName("标题").addText((text) => {
      text.setValue(meta.title).onChange((value) => { meta.title = value.trim(); this.cover?.syncTitle(); this.scheduleChecks(); });
      text.inputEl.addClass("qiaomu-wechat-wide");
    });
    new Setting(form).setName("作者").addText((text) => text.setValue(meta.author).onChange((value) => { meta.author = value.trim(); this.scheduleChecks(); }));
    new Setting(form).setName("摘要").setDesc("留空时公众号自动截取正文开头。").addTextArea((area) => {
      area.setValue(meta.digest).onChange((value) => { meta.digest = value.trim(); this.scheduleChecks(); });
      area.inputEl.rows = 2;
      area.inputEl.addClass("qiaomu-wechat-wide");
    });
    this.cover?.destroy();
    this.cover = new CoverSection(form, {
      app: this.app, spec: COVER_SPECS.wechat, title: () => this.meta?.title ?? "",
      candidates: () => noteImageCandidates(this.app, note),
      initial: async () => {
        const found = resolveCover(this.app, this.file.path, meta, note.images);
        if (!found) return null;
        const loaded = await loadArticleImage(this.app, found.kind === "url" ? { id: "cover", kind: "remote", name: found.url.split("/").pop() || "cover", url: found.url } : found.image);
        return { ...loaded, origin: meta.cover ? "笔记属性 cover" : "笔记第一张图" };
      },
      allowNone: false,
      fallbackMode: "title",
      style: () => this.settings.cover,
      updateStyle: (style) => { this.settings.cover = style; void this.plugin.saveSettings().catch(() => new Notice("封面样式保存失败")); },
      coverText: meta.coverText,
      onCoverText: (text) => { meta.coverText = text; },
      onChange: () => this.scheduleChecks(),
    });
    void this.cover.start();

    this.checksEl = form.createEl("ul", { cls: "qiaomu-wechat-checks" });
    setName(this.checksEl, "发布前检查");

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
    // Show the form first; laying out a long article is the slow part.
    this.showPreviewPlaceholder();
    this.renderPreviewSoon(30);
  }

  private showPreviewPlaceholder(): void {
    const hint = this.paper.parentElement!.createDiv({ cls: "qiaomu-wechat-preview-loading" });
    hint.textContent = "正在排版预览…";
    this.previewRoot.replaceChildren();
  }

  private renderPreviewSoon(delay = 90): void {
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => { this.previewTimer = null; if (this.contentEl.isConnected) this.renderPreview(); }, delay);
  }

  /** Validation reads the whole article, so typing must not trigger it on every keystroke. */
  private scheduleChecks(): void {
    if (this.checksTimer !== null) window.clearTimeout(this.checksTimer);
    this.checksTimer = window.setTimeout(() => { this.checksTimer = null; if (this.contentEl.isConnected) this.refreshChecks(); }, 250);
  }

  private renderPreview(): void {
    if (!this.note) return;
    this.paper.parentElement?.querySelector(".qiaomu-wechat-preview-loading")?.remove();
    try {
      this.wechatHtml = buildWechatHtml(this.note.html, resolveWechatTheme(this.themeId), undefined, this.articleStyle);
    } catch (error) {
      this.wechatHtml = "";
      this.statusEl.setText(`排版失败：${error instanceof Error ? error.message : String(error)}`);
    }
    const fragment = sanitizeHTMLToDom(this.wechatHtml);
    for (const image of Array.from(fragment.querySelectorAll("img"))) { image.decoding = "async"; image.loading = "lazy"; }
    this.previewRoot.replaceChildren(fragment);
    const root = this.previewRoot.querySelector<HTMLElement>(".wechat-export-root");
    const computed = root ? this.previewRoot.ownerDocument.defaultView?.getComputedStyle(root).backgroundColor : "";
    const paper = computed && computed !== "rgba(0, 0, 0, 0)" ? computed : "#ffffff";
    const channels = (paper.match(/\d+/g) ?? ["255", "255", "255"]).slice(0, 3).map(Number);
    const dark = (0.299 * channels[0]! + 0.587 * channels[1]! + 0.114 * channels[2]!) < 140;
    this.paper.setCssProps({ "--qiaomu-paper-color": paper });
    this.screen.setCssProps({ "--qm-paper": paper, "--qm-ink": dark ? "#f5f5f5" : "#111111" });
    this.refreshChecks();
  }

  private refreshChecks(): void {
    if (!this.note || !this.meta) return;
    if (!this.checksEl || !this.publishButton) {
      if (this.copyButton) this.copyButton.disabled = !this.wechatHtml || this.busy;
      return;
    }
    const hasCover = true; // A text-only note receives a generated title cover.
    const checks = preflight(this.meta, this.wechatHtml, hasCover, this.note.warnings, this.note.imageErrors);
    if (this.meta.cover && !this.cover?.hasImage && this.cover?.mode !== "title" && !resolveCover(this.app, this.file.path, this.meta, this.note.images)) {
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
    const input = { mode: "relay" as "relay" | "direct", name: "", appId: "", appSecret: "", relayUrl: QIAOMU_RELAY_URL };
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
      .addText((text) => text.setValue(QIAOMU_RELAY_URL).onChange((value) => { input.relayUrl = value.trim(); showIps(knownRelayEgressIps(input.relayUrl)); }));
    const ipButton = relayFields.createEl("button", { text: "刷新白名单 IP" });
    const ipStatus = relayFields.createDiv({ cls: "qiaomu-wechat-connect-status" });
    ipStatus.setAttribute("role", "status");
    const showIps = (ips: string[]) => {
      ipStatus.empty();
      ipStatus.createSpan({ text: `在公众号后台的 API IP 白名单加入：${ips.join("、") || "中转未配置固定出口 IP"} ` });
      if (ips.length) ipStatus.createEl("button", { text: "复制 IP" }).addEventListener("click", () => void navigator.clipboard.writeText(ips.join("\n")).then(() => ipStatus.setText(`已复制 ${ips.join("、")}，请粘贴到公众号后台 API IP 白名单。`)).catch(() => ipStatus.setText(`复制失败，请手动复制：${ips.join("、")}`)));
    };
    showIps(knownRelayEgressIps(input.relayUrl));
    new Setting(panel).setName("名称（可选）").setDesc("只用来在这里区分多个公众号；留空会自动命名。").addText((text) => text.setPlaceholder("例如：乔木的公众号").onChange((value) => { input.name = value.trim(); }));
    new Setting(panel).setName("AppID").addText((text) => text.setPlaceholder("在公众号后台获取").onChange((value) => { input.appId = value.trim(); }));
    new Setting(panel).setName("AppSecret").addText((text) => {
      text.inputEl.type = "password";
      text.onChange((value) => { input.appSecret = value.trim(); });
    });
    const status = panel.createDiv({ cls: "qiaomu-wechat-connect-status" });
    status.setAttribute("role", "status");
    new Setting(panel).setName("更多连接选项").setDesc("多个公众号、直连或自建 Bridge 可在插件设置中管理。").addButton((button) => button.setButtonText("打开插件设置").onClick(() => { this.close(); this.plugin.openSettings(); }));
    const actions = panel.createDiv({ cls: "qiaomu-wechat-connect-actions" });
    const connectButton = actions.createEl("button", { text: "测试并连接", cls: "mod-cta" });
    const account = { id: "new", name: "新公众号" };
    const relay = () => new WechatRelayClient(account, input.appId, input.appSecret, QIAOMU_RELAY_CODE, input.relayUrl);
    ipButton.addEventListener("click", () => void (async () => {
      ipButton.disabled = true;
      try {
        const ips = await relayEgressIps(input.relayUrl);
        showIps(ips);
      } catch (error) { ipStatus.setText(`读取失败：${error instanceof Error ? error.message : String(error)}`); }
      finally { ipButton.disabled = false; }
    })());
    connectButton.addEventListener("click", () => void (async () => {
      connectButton.disabled = true;
      panel.inert = true;
      status.setText("正在检查公众号连接…");
      try {
        if (!input.appId || !input.appSecret) throw new Error("请填写 AppID 和 AppSecret");
        if (input.mode === "relay") await relay().testConnection();
        else await new WechatDirectClient(account, input.appId, input.appSecret).testConnection();
        if (!this.contentEl.isConnected) return;
        const id = `${input.mode}:${crypto.randomUUID()}`;
        const appSecretId = connectionSecretId(id);
        this.app.secretStorage.setSecret(appSecretId, input.appSecret);
        const previousDefault = this.settings.defaultAccountId;
        this.settings.connections.push({ id, name: input.name || `我的公众号 ${input.appId.slice(-4)}`, mode: input.mode, appId: input.appId, appSecretId, relayUrl: input.mode === "relay" ? input.relayUrl : undefined });
        this.settings.defaultAccountId = id;
        try { await this.plugin.saveSettings(); }
        catch (error) {
          this.settings.connections = this.settings.connections.filter((item) => item.id !== id);
          this.settings.defaultAccountId = previousDefault;
          this.app.secretStorage.setSecret(appSecretId, "");
          throw error;
        }
        this.clientError = "";
        this.client = new WechatTransportRouter(this.app, this.settings);
        this.accounts = await this.client.listAccounts();
        this.meta!.accountId = id;
        this.contentEl.empty();
        this.renderForm();
      } catch (error) { status.setText(`连接失败：${error instanceof Error ? error.message : String(error)}`); }
      finally { connectButton.disabled = false; panel.inert = false; }
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
    const body = this.contentEl.querySelector<HTMLElement>(".qiaomu-wechat-body");
    if (body) body.inert = busy;
    this.statusEl.setText(message);
    this.refreshChecks();
  }

  private async copy(): Promise<void> {
    if (this.busy) return;
    this.flushPreview();
    if (!this.note || !this.wechatHtml) return;
    this.setBusy(true, "正在准备复制…");
    try {
      await copyWechatHtml(this.app, this.wechatHtml, this.note.images, this.note.imageErrors);
      this.setBusy(false, this.note.images.some(image => image.kind !== "remote") ? "已复制排版；发送到草稿箱可自动上传图片。" : "已复制，可粘贴到公众号编辑器。");
    } catch (error) {
      this.setBusy(false, `复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async publish(): Promise<void> {
    if (this.busy || !this.note || !this.meta || !this.client) return;
    this.flushPreview();
    this.refreshChecks();
    if (this.publishButton.disabled) return;
    const meta = { ...this.meta };
    const html = this.wechatHtml;
    const cover = { ...this.settings.cover };
    let coverImage: { data: ArrayBuffer; mime: string; name: string } | undefined;
    try { coverImage = (await this.cover?.result()) ?? undefined; } catch (error) { this.setBusy(false, `封面生成失败：${error instanceof Error ? error.message : String(error)}`); return; }
    const recordInNote = this.settings.recordInNote;
    const existing = this.draftAction === "update" ? this.existingMediaId() : "";
    const mediaId = existing && this.client.canUpdateDraft(meta.accountId) ? existing : "";
    this.abort = new AbortController();
    this.setBusy(true, "准备发送…");
    try {
      if (mediaId) {
        try {
          await this.client.getDraft(meta.accountId, mediaId);
        } catch (error) {
          throw new Error(`无法确认原草稿：${error instanceof Error ? error.message : String(error)}。可选择「另建一篇草稿」后重试。`);
        }
      }
      const result = await publishDraft({
        app: this.app,
        client: this.client,
        note: this.note,
        file: this.file,
        wechatHtml: html,
        meta,
        existingMediaId: mediaId || undefined,
        signal: this.abort.signal,
        cover,
        coverImage,
        onProgress: (message) => { if (this.contentEl.isConnected) this.statusEl.setText(message); },
      });
      let saved = true;
      if (recordInNote) {
        try { await recordDraft(this.app, this.file, meta.accountId, result.mediaId); }
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

  private flushPreview(): void {
    if (this.previewTimer === null) return;
    window.clearTimeout(this.previewTimer);
    this.previewTimer = null;
    this.renderPreview();
  }
}
