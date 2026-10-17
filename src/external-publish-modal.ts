import { type App, Component, Modal, Notice, setIcon, Setting, type TFile } from "obsidian";
import type QiaomuPublishPlugin from "./main";
import type { ExternalPublishSettings } from "./types";
import { setName } from "./accessible-name";
import { renderPlatformSwitch } from "./platform-switch";
import { bridgeAvailable } from "./bridge/server";
import { startBridgeRun, type BridgeRun } from "./bridge/session";
import { TARGET_LABEL, type BridgeJob, type BridgeStatus, type PublishTargetId } from "./bridge/protocol";
import { applyCover, buildJob, buildXhsJob, defaultPublishTitle, firstImageSource, frontmatterCoverSource, layoutXhs, noteImageCandidates, prepareBase, xhsDefaults, type PreparedBase, type PreparedPublish, type XhsLayout } from "./external/prepare";
import type { AssetBag, ImageCache } from "./external/assets";
import { CoverSection } from "./cover/cover-section";
import { COVER_SPECS } from "./cover/spec";
import type { CoverResult } from "./cover/cover-picker";
import { renderCardControls } from "./external-card-controls";
import { ExternalPreview } from "./external-preview";
import { CARD_WIDTH } from "./external/card-styles";
import { checkXhs, normalizeTopics, truncateText, XHS_TEXT_MAX, XHS_TITLE_MAX, xhsBodyLength, xhsTextBudget, ZHIHU_TITLE_MAX, textLength, type ExternalCheck } from "./external/limits";

const INTRO: Record<PublishTargetId, string> = {
  x: "写进 X 文章编辑器，只存为草稿，由你在 X 里检查后再发布。需要 X Premium。",
  zhihu: "写进知乎文章草稿，由你在知乎里检查后再发布。",
  xhs: "把笔记排成 3:4 图文卡片，预填到小红书创作平台，由你检查后再发布。",
};

const RECORD_KEYS: Record<PublishTargetId, { url: string; at: string }> = {
  x: { url: "x_draft_url", at: "x_draft_at" },
  zhihu: { url: "zhihu_draft_url", at: "zhihu_draft_at" },
  xhs: { url: "xhs_editor_url", at: "xhs_prefilled_at" },
};

const THUMB_WIDTH = 96;

interface CardEntry { key: string; card: HTMLElement }

/**
 * One window for every browser-based platform: the form on the left, the platform's own page as a phone on the right, the send
 * buttons pinned at the bottom. The slow work (rendering the note, reading its pictures) happens once when the window opens;
 * editing the title, the copy or a card style only redoes the cheap part.
 */
export class ExternalPublishModal extends Modal {
  private readonly component = new Component();
  private articleTitle: string;
  private readonly card: ExternalPublishSettings;
  private destroyControls: (() => void) | null = null;
  private base: PreparedBase | null = null;
  private prepared: PreparedPublish | null = null;
  private xhs: XhsLayout | null = null;
  private assetUrls = new Map<string, string>();
  private generation = 0;
  private prepareTimer: number | null = null;
  private phoneTimer: number | null = null;
  private run: BridgeRun | null = null;
  private busy = false;
  private preparing = false;
  private entries: CardEntry[] = [];
  private checks: ExternalCheck[] = [];
  private preparationError: ExternalCheck | null = null;
  /** Xiaohongshu copy the person can edit; untouched until they edit, so a re-layout keeps their words. */
  private xhsText = "";
  private xhsTopics: string[] = [];
  private textEdited = false;
  private topicsEdited = false;
  private copyAdopted = false;
  /** Cards taken out of this post, by position and content size so a re-layout that changes nothing keeps them out. */
  private excluded = new Set<string>();
  private preview!: ExternalPreview;
  /** X and Zhihu: the article body as Markdown, editable here; null until edited, when the note itself is rendered. */
  private markdown: string | null = null;
  private markdownArea!: HTMLTextAreaElement;
  private markdownNote!: HTMLElement;
  private markdownTimer: number | null = null;
  private readonly imageCache: ImageCache = new Map();
  private cover: CoverSection | null = null;
  private coverStarted = false;
  private coverResult: CoverResult | null = null;
  private coverUrl = "";
  private titleInput!: HTMLElement;
  private formEl!: HTMLElement;
  private textArea!: HTMLTextAreaElement;
  private counterEl!: HTMLElement;
  private copyNote!: HTMLElement;
  private topicsEl!: HTMLElement;
  private cardsEl!: HTMLElement;
  private checksEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private actionsEl!: HTMLElement;
  private publishButton!: HTMLButtonElement;
  private stopButton!: HTMLButtonElement;
  private copyLinkButton: HTMLButtonElement | null = null;

  constructor(app: App, private readonly file: TFile, private readonly plugin: QiaomuPublishPlugin, private readonly target: PublishTargetId) {
    super(app);
    this.card = plugin.settings.external;
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const own = target === "xhs" ? frontmatter.xhs_title ?? frontmatter["小红书标题"] : undefined;
    this.articleTitle = typeof own === "string" && own.trim() ? own.trim() : defaultPublishTitle(frontmatter, file.basename);
  }

  override onOpen(): void {
    this.component.load();
    this.modalEl.addClass("qiaomu-wechat-modal", "qiaomu-external-modal");
    this.setTitle("发布");
    const { contentEl } = this;

    // The phone starts at the very top of the right column; platform switch and tip live in the left column with the form.
    const body = contentEl.createDiv({ cls: "qiaomu-wechat-body" });
    const columns = body.createDiv({ cls: "qiaomu-wechat-columns" });
    const left = columns.createDiv({ cls: "qiaomu-external-left" });
    this.preview = new ExternalPreview(columns, this.target);
    renderPlatformSwitch(left, this.target, (choice) => { this.close(); this.plugin.openPublish(this.file, choice); });
    this.renderTip(left);
    const form = left.createDiv({ cls: "qiaomu-wechat-form" });
    this.formEl = form;

    new Setting(form).setName("标题").addText((text) => {
      this.titleInput = text.inputEl;
      text.setValue(this.articleTitle).onChange((value) => { this.articleTitle = value.trim(); this.refreshTitleHint(); this.cover?.syncTitle(); this.schedule(this.target === "xhs" ? 500 : 150); });
      text.inputEl.addClass("qiaomu-wechat-wide");
    });
    if (this.target === "xhs") { this.renderCopyFields(form); this.renderCardControls(form); }
    else { this.renderCover(form); this.renderMarkdown(form); }
    this.cardsEl = form.createDiv({ cls: "qiaomu-external-cards is-empty" });
    this.checksEl = form.createEl("ul", { cls: "qiaomu-wechat-checks" });
    setName(this.checksEl, "发布前检查");

    const footer = contentEl.createDiv({ cls: "qiaomu-wechat-footer" });
    this.statusEl = footer.createDiv({ cls: "qiaomu-wechat-status" });
    this.statusEl.setAttribute("role", "status");
    this.statusEl.setAttribute("aria-live", "polite");
    this.actionsEl = footer.createDiv({ cls: "qiaomu-wechat-actions" });
    this.stopButton = this.actionsEl.createEl("button", { text: "取消" });
    this.stopButton.addEventListener("click", () => this.onStop());
    this.publishButton = this.actionsEl.createEl("button", { text: this.target === "xhs" ? "填入编辑器" : "发到草稿", cls: "mod-cta" });
    this.publishButton.addEventListener("click", () => void this.publish());
    this.publishButton.disabled = true;

    if (!bridgeAvailable()) {
      this.statusEl.setText("发到浏览器需要桌面版 Obsidian 和乔木 Clipper 扩展，手机上暂不可用。");
      this.preview.showMessage("手机上暂时无法预览");
      return;
    }
    this.preview.showMessage("正在排版…");
    this.refreshTitleHint();
    this.schedule(0);
  }

  /** One line about what this platform does; closed for good once the person has read it. */
  private renderTip(parent: HTMLElement): void {
    if (this.card.dismissedTips.includes(this.target)) return;
    const tip = parent.createDiv({ cls: "qiaomu-external-tip" });
    setIcon(tip.createSpan({ cls: "qiaomu-external-tip-icon", attr: { "aria-hidden": "true" } }), "info");
    tip.createSpan({ cls: "qiaomu-external-tip-text", text: INTRO[this.target] });
    const close = tip.createEl("button", { cls: "qiaomu-external-tip-close", attr: { type: "button" } });
    setIcon(close.createSpan({ attr: { "aria-hidden": "true" } }), "x");
    close.createSpan({ cls: "qiaomu-wechat-sr-only", text: "关闭提示" });
    close.addEventListener("click", () => {
      tip.remove();
      this.card.dismissedTips = [...new Set([...this.card.dismissedTips, this.target])];
      void this.saveCardChoice();
    });
  }

  // ---------- cover (X and Zhihu) ----------

  private renderCover(form: HTMLElement): void {
    const spec = COVER_SPECS[this.target === "x" ? "x" : "zhihu"];
    this.cover = new CoverSection(form, {
      app: this.app, spec, title: () => this.articleTitle,
      candidates: () => (this.base ? noteImageCandidates(this.app, this.base.note) : []),
      initial: async () => {
        const base = this.base;
        if (!base) return null;
        return (await frontmatterCoverSource(this.app, this.file, base.note)) ?? (this.target === "zhihu" ? await firstImageSource(this.app, base.note) : null);
      },
      allowNone: true,
      fallbackMode: "none",
      style: () => this.plugin.settings.wechat.cover,
      updateStyle: (style) => { this.plugin.settings.wechat.cover = style; void this.plugin.saveSettings(); },
      onChange: () => void this.onCoverChange(),
    });
  }

  /** The person changed the cover: cut it, put it into the job, redraw the phone. */
  private async onCoverChange(): Promise<void> {
    if (!this.cover || !this.base) return;
    try { this.coverResult = await this.cover.result(); } catch (error) { new Notice(`封面生成失败：${error instanceof Error ? error.message : String(error)}`); this.coverResult = null; }
    this.syncCover();
    this.refreshChecks();
  }

  /** Puts the current cover into the shared assets (replacing the old one) and refreshes what depends on it. */
  private syncCover(): void {
    const base = this.base;
    if (!base) return;
    applyCover(base, this.coverResult);
    if (this.coverUrl) URL.revokeObjectURL(this.coverUrl);
    this.coverUrl = this.coverResult ? URL.createObjectURL(new Blob([this.coverResult.data], { type: this.coverResult.mime })) : "";
    if (this.coverUrl) this.assetUrls.set("cover", this.coverUrl); else this.assetUrls.delete("cover");
    this.prepared = buildJob(base, this.articleTitle);
    this.updatePhone();
  }

  // ---------- Markdown body (X and Zhihu) ----------

  /** The article as Markdown, editable for this post only; the note on disk is never touched. */
  private renderMarkdown(form: HTMLElement): void {
    const head = form.createDiv({ cls: "qiaomu-external-md-head" });
    head.createSpan({ cls: "qiaomu-external-md-name", text: "正文（Markdown）" });
    const reset = head.createEl("button", { cls: "qiaomu-external-link", text: "恢复笔记原文", attr: { type: "button" } });
    reset.addClass("is-empty");
    this.markdownArea = form.createEl("textarea", { cls: "qiaomu-external-text is-code", attr: { rows: "14", spellcheck: "false" } });
    setName(this.markdownArea, "正文 Markdown");
    this.markdownNote = form.createDiv({ cls: "qiaomu-external-note", text: "改动只用于这次发布，不会写回笔记。" });
    void this.app.vault.cachedRead(this.file).then((raw) => {
      if (this.markdown === null) this.markdownArea.value = raw.replace(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/, "").replace(/^\s+/, "");
    });
    this.markdownArea.addEventListener("input", () => {
      this.markdown = this.markdownArea.value;
      reset.removeClass("is-empty");
      this.statusEl.setText("正在重新排版…");
      this.publishButton.disabled = true;
      if (this.markdownTimer !== null) window.clearTimeout(this.markdownTimer);
      this.markdownTimer = window.setTimeout(() => { this.markdownTimer = null; this.discardBase(); this.schedule(0); }, 600);
    });
    reset.addEventListener("click", () => {
      this.markdown = null;
      reset.addClass("is-empty");
      void this.app.vault.cachedRead(this.file).then((raw) => { this.markdownArea.value = raw.replace(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/, "").replace(/^\s+/, ""); });
      this.discardBase();
      this.schedule(0);
    });
  }

  /** The text changed, so the rendered note and its pictures are rebuilt; pictures already read come from the cache. */
  private discardBase(): void {
    this.generation++;
    this.base?.dispose();
    this.base = null;
    this.prepared = null;
    this.xhs = null;
    for (const [id, url] of this.assetUrls) if (id !== "cover") { URL.revokeObjectURL(url); this.assetUrls.delete(id); }
  }

  // ---------- Xiaohongshu copy: body, topics, cards ----------

  /** Body text and topics, held to Xiaohongshu's 1000 characters (topics included). */
  private renderCopyFields(form: HTMLElement): void {
    const setting = new Setting(form).setName("正文");
    this.counterEl = setting.descEl;
    this.textArea = form.createEl("textarea", { cls: "qiaomu-external-text", attr: { rows: "7", placeholder: "写给读者的几句话；留空则只发布图片" } });
    setName(this.textArea, "小红书正文");
    this.textArea.addEventListener("input", () => {
      this.xhsText = this.textArea.value;
      this.textEdited = true;
      this.enforceLimit();
      this.refreshChecks();
      this.schedulePhone();
    });
    this.copyNote = form.createDiv({ cls: "qiaomu-external-note is-empty" });
    this.topicsEl = form.createDiv({ cls: "qiaomu-external-topics" });
    this.renderTopics();
  }

  /** Cuts the body back to what is left after the topics; says so when it did. */
  private enforceLimit(source?: string): void {
    const result = truncateText(this.xhsText, xhsTextBudget(this.xhsTopics));
    if (result.truncated) {
      this.xhsText = result.text;
      this.textArea.value = result.text;
      this.copyNote.setText(source ?? `超出 ${XHS_TEXT_MAX} 字（含话题），已自动截取。`);
      this.copyNote.removeClass("is-empty");
    } else if (!source) this.copyNote.addClass("is-empty");
    this.refreshCounter();
  }

  private refreshCounter(): void {
    const used = xhsBodyLength(this.xhsText, this.xhsTopics);
    this.counterEl.setText(`${used} / ${XHS_TEXT_MAX}（含话题）`);
    this.counterEl.toggleClass("is-over", used > XHS_TEXT_MAX);
  }

  private renderTopics(): void {
    this.topicsEl.empty();
    for (const topic of this.xhsTopics) {
      const chip = this.topicsEl.createDiv({ cls: "qiaomu-external-topic" });
      chip.createSpan({ text: `#${topic}` });
      const remove = chip.createEl("button", { cls: "qiaomu-external-topic-remove", attr: { type: "button" } });
      setIcon(remove.createSpan({ attr: { "aria-hidden": "true" } }), "x");
      remove.createSpan({ cls: "qiaomu-wechat-sr-only", text: `删除话题 ${topic}` });
      remove.addEventListener("click", () => { this.xhsTopics = this.xhsTopics.filter((item) => item !== topic); this.topicsEdited = true; this.renderTopics(); this.refreshCounter(); this.refreshChecks(); this.schedulePhone(); });
    }
    const input = this.topicsEl.createEl("input", { cls: "qiaomu-external-topic-input", attr: { type: "text", placeholder: "添加话题，回车确认" } });
    setName(input, "添加话题");
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      const added = normalizeTopics([...this.xhsTopics, input.value], 10);
      if (added.length === this.xhsTopics.length) { input.value = ""; return; }
      this.xhsTopics = added;
      this.topicsEdited = true;
      this.enforceLimit();
      this.renderTopics();
      this.refreshChecks();
      this.schedulePhone();
      this.topicsEl.querySelector<HTMLInputElement>(".qiaomu-external-topic-input")?.focus();
    });
  }

  private renderCardControls(form: HTMLElement): void {
    this.destroyControls = renderCardControls(form, this.card, () => { void this.saveCardChoice(); this.preview.resetCard(); this.schedule(250); });
    new Setting(form).setName("分页").setDesc("--- 单独成行时总是另起一张。").addDropdown((dropdown) => {
      dropdown.addOption("flow", "按内容自动");
      dropdown.addOption("h2", "每个二级标题一张");
      dropdown.setValue(this.card.cardPagination).onChange((value) => { this.card.cardPagination = value === "h2" ? "h2" : "flow"; void this.saveCardChoice(); this.preview.resetCard(); this.schedule(250); });
    });
  }

  private async saveCardChoice(): Promise<void> {
    await this.plugin.saveSettings().catch(() => new Notice("卡片设置保存失败"));
  }

  private refreshTitleHint(): void {
    const limit = this.target === "xhs" ? XHS_TITLE_MAX : this.target === "zhihu" ? ZHIHU_TITLE_MAX : 0;
    if (!limit) return;
    const used = textLength(this.articleTitle);
    this.titleInput.toggleClass("is-over", used > limit);
    const setting = this.titleInput.closest(".setting-item")?.querySelector(".setting-item-description");
    const text = `${used}/${limit}`;
    if (setting) setting.setText(text);
    else this.titleInput.closest(".setting-item")?.querySelector(".setting-item-info")?.createDiv({ cls: "setting-item-description", text });
  }

  // ---------- preparing ----------

  private schedule(delay: number): void {
    if (this.prepareTimer !== null) window.clearTimeout(this.prepareTimer);
    this.prepareTimer = window.setTimeout(() => { this.prepareTimer = null; void this.rebuild(); }, delay);
    this.publishButton.disabled = true;
  }

  private schedulePhone(): void {
    if (this.phoneTimer !== null) window.clearTimeout(this.phoneTimer);
    this.phoneTimer = window.setTimeout(() => { this.phoneTimer = null; this.updatePhone(); }, 120);
  }

  /** The note is rendered and its pictures read once; every later call only redoes the part that depends on the edit. */
  private async rebuild(): Promise<void> {
    if (this.busy) return;
    const generation = ++this.generation;
    this.preparing = true;
    this.preparationError = null;
    try {
      if (!this.base) {
        this.statusEl.setText("正在准备…");
        const base = await prepareBase(this.app, this.file, this.component, this.target, {
          markdown: this.markdown ?? undefined, cache: this.imageCache,
          onProgress: (text) => { if (generation === this.generation) this.statusEl.setText(text); },
        });
        if (generation !== this.generation || !this.contentEl.isConnected) { base.dispose(); return; }
        this.base = base;
        for (const asset of base.assets.list()) this.assetUrls.set(asset.id, URL.createObjectURL(new Blob([base.assets.get(asset.id)!.data], { type: asset.mime })));
        if (this.cover) {
          if (this.coverResult) this.syncCover();
          else if (!this.coverStarted) { this.coverStarted = true; void this.cover.start(); }
        }
      }
      const base = this.base;
      if (this.target === "xhs") {
        const layout = await layoutXhs(base, { title: this.articleTitle, card: this.card, author: this.plugin.settings.wechat.author });
        if (generation !== this.generation || !this.contentEl.isConnected) return;
        this.xhs = layout;
        this.adoptXhsCopy(base);
        this.entries = layout.layout.cards.map((card, index) => ({ key: `${index}:${(card.textContent ?? "").length}`, card }));
        this.excluded = new Set([...this.excluded].filter((key) => this.entries.some((entry) => entry.key === key)));
      } else {
        this.prepared = buildJob(base, this.articleTitle);
      }
      this.renderCards();
      this.updatePhone();
      this.refreshChecks();
      this.statusEl.setText("");
    } catch (error) {
      if (generation !== this.generation) return;
      this.preparing = false;
      this.prepared = null;
      this.xhs = null;
      this.preparationError = { level: "error", message: `准备失败：${error instanceof Error ? error.message : String(error)}`, fix: "" };
      this.checks = [this.preparationError];
      this.renderChecks();
      this.preview.showMessage("没能排版这篇笔记");
      this.statusEl.setText("");
    } finally {
      if (generation === this.generation) { this.preparing = false; this.refreshButtons(); }
    }
  }

  /** The first time (and until the person edits) the copy comes from the note; their own edits survive later re-layouts. */
  private adoptXhsCopy(base: PreparedBase): void {
    const defaults = xhsDefaults(base);
    if (!this.topicsEdited) { this.xhsTopics = defaults.topics; this.renderTopics(); }
    if (!this.textEdited) {
      this.xhsText = defaults.text;
      this.textArea.value = defaults.text;
      const over = textLength(defaults.text) > xhsTextBudget(this.xhsTopics);
      this.enforceLimit(over && !this.copyAdopted ? `笔记正文 ${textLength(defaults.text)} 字，已自动截取到 ${XHS_TEXT_MAX} 字以内，可以继续修改。` : undefined);
    } else this.refreshCounter();
    this.copyAdopted = true;
  }

  private includedCards(): CardEntry[] { return this.entries.filter((entry) => !this.excluded.has(entry.key)); }

  // ---------- cards strip ----------

  private renderCards(): void {
    this.cardsEl.empty();
    this.cardsEl.toggleClass("is-empty", this.target !== "xhs" || this.entries.length === 0);
    if (this.target !== "xhs" || !this.entries.length) return;
    const included = this.includedCards();
    const head = this.cardsEl.createDiv({ cls: "qiaomu-external-cards-head" });
    head.createSpan({ text: `共 ${included.length} 张，鼠标移上去点右上角的 × 可以去掉` });
    if (this.excluded.size) {
      const restore = head.createEl("button", { cls: "qiaomu-external-link", text: `恢复已删除的 ${this.excluded.size} 张`, attr: { type: "button" } });
      restore.addEventListener("click", () => { this.excluded.clear(); this.renderCards(); this.refreshChecks(); this.updatePhone(); });
    }
    const row = this.cardsEl.createDiv({ cls: "qiaomu-external-cards-row" });
    for (const [position, entry] of included.entries()) {
      const figure = row.createDiv({ cls: "qiaomu-external-card" });
      const inner = figure.createDiv({ cls: "qiaomu-external-card-inner" });
      inner.setCssProps({ "--qp-scale": String(THUMB_WIDTH / CARD_WIDTH) });
      inner.append(entry.card.cloneNode(true));
      figure.createSpan({ cls: "qiaomu-external-card-number", text: String(position + 1) });
      const remove = figure.createEl("button", { cls: "qiaomu-external-card-remove", attr: { type: "button" } });
      setIcon(remove.createSpan({ attr: { "aria-hidden": "true" } }), "x");
      remove.createSpan({ cls: "qiaomu-wechat-sr-only", text: `不发第 ${position + 1} 张` });
      remove.addEventListener("click", () => { this.excluded.add(entry.key); this.renderCards(); this.refreshChecks(); this.updatePhone(); });
    }
  }

  // ---------- phone ----------

  private updatePhone(): void {
    const author = this.plugin.settings.wechat.author;
    if (this.target === "xhs") {
      if (!this.xhs) return;
      this.preview.showXhs({ title: this.articleTitle, author, text: this.xhsText, topics: this.xhsTopics, cards: this.includedCards().map((entry) => entry.card) });
    } else if (this.prepared && this.base) {
      this.preview.showArticle({ title: this.articleTitle, author, html: this.prepared.previewHtml, urls: this.assetUrls, coverId: this.base.coverId });
    }
  }

  // ---------- checks and buttons ----------

  private computeChecks(): ExternalCheck[] {
    if (this.target === "xhs") {
      if (!this.xhs) return [];
      return [...checkXhs({ title: this.articleTitle, text: this.xhsText, topics: this.xhsTopics, cards: this.includedCards().length }), ...this.xhs.checks];
    }
    return this.prepared?.checks ?? [];
  }

  private refreshChecks(): void {
    this.checks = this.preparationError ? [this.preparationError] : this.computeChecks();
    this.renderChecks();
    this.refreshButtons();
  }

  private renderChecks(): void {
    this.checksEl.empty();
    for (const check of this.checks) {
      const item = this.checksEl.createEl("li", { cls: `is-${check.level}` });
      const icon = item.createSpan({ cls: "qiaomu-wechat-check-icon" });
      setIcon(icon, check.level === "error" ? "circle-x" : check.level === "warning" ? "triangle-alert" : "info");
      icon.setAttribute("aria-hidden", "true");
      item.createSpan({ text: check.fix ? `${check.message}。${check.fix}` : check.message });
    }
    this.checksEl.toggleClass("is-empty", this.checks.length === 0);
  }

  private refreshButtons(): void {
    const ready = this.target === "xhs" ? !!this.xhs : !!this.prepared;
    const blocked = !this.base || !ready || this.preparing || this.markdownTimer !== null || this.prepareTimer !== null || this.checks.some((check) => check.level === "error");
    this.publishButton.disabled = blocked || this.busy || !bridgeAvailable();
    this.publishButton.setText(this.target === "xhs" ? "填入编辑器" : "发到草稿");
    this.stopButton.setText(this.busy ? "停止" : "取消");
    this.titleInput.toggleAttribute("disabled", this.busy);
    this.formEl.inert = this.busy;
  }

  private onStop(): void {
    if (this.busy && this.run) { this.statusEl.setText("正在停止…"); this.run.cancel(); return; }
    this.close();
  }

  private showStatus(status: BridgeStatus): void {
    if (status.text) this.statusEl.setText(status.text);
    this.removeCopyLink();
  }

  private addCopyLink(url: string): void {
    this.removeCopyLink();
    const button = this.actionsEl.createEl("button", { text: "复制链接" });
    button.addEventListener("click", () => void navigator.clipboard.writeText(url).then(() => new Notice("已复制，请粘贴到装有乔木 Clipper 的浏览器")).catch(() => new Notice("复制失败")));
    this.actionsEl.insertBefore(button, this.publishButton);
    this.copyLinkButton = button;
  }

  private removeCopyLink(): void { this.copyLinkButton?.remove(); this.copyLinkButton = null; }

  // ---------- sending ----------

  /** The job as it will be sent. Xiaohongshu draws its cards here, the one slow step, with progress. */
  private async finalJob(): Promise<{ job: BridgeJob; assets: AssetBag }> {
    const base = this.base!;
    if (this.target !== "xhs") {
      if (this.cover) { this.coverResult = await this.cover.result(); applyCover(base, this.coverResult); }
      const prepared = buildJob(base, this.articleTitle);
      const errors = prepared.checks.filter(check => check.level === "error");
      if (errors.length) throw new Error(errors.map(check => check.message).join("\n"));
      return { job: prepared.job, assets: base.assets };
    }
    return buildXhsJob(base, this.includedCards().map((entry) => entry.card), {
      title: this.articleTitle, text: this.xhsText, topics: this.xhsTopics, card: this.card,
      onProgress: (text) => this.statusEl.setText(text),
    });
  }

  private async publish(): Promise<void> {
    if (!this.base || this.busy) return;
    this.busy = true;
    this.refreshButtons();
    try {
      this.statusEl.setText(this.target === "xhs" ? "正在生成图片…" : "正在打开浏览器…");
      const { job, assets } = await this.finalJob();
      if (!this.contentEl.isConnected) return;
      this.statusEl.setText("正在打开浏览器…");
      this.run = await startBridgeRun({
        job,
        readAsset: async (id) => { const asset = assets.get(id); return asset ? { data: asset.data, mime: asset.mime } : null; },
        open: (url) => { window.open(url, "_blank"); },
        onStatus: (status) => this.showStatus(status),
      });
      this.statusEl.setText("已在浏览器里打开。如果页面没有自动开始，请复制链接到装有乔木 Clipper 的浏览器。");
      this.addCopyLink(this.run.url);
      const final = await this.run.done;
      this.removeCopyLink();
      await this.finish(final);
    } catch (error) {
      this.statusEl.setText(`没能开始：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.run = null;
      this.busy = false;
      if (this.contentEl.isConnected) this.refreshButtons();
    }
  }

  private async finish(status: BridgeStatus): Promise<void> {
    if (status.state === "done") {
      this.statusEl.setText(status.text ?? "草稿已写入，请在浏览器里检查后再发布。");
      await this.record(status);
      new Notice(this.target === "xhs" ? "已填入小红书编辑器，请检查后暂存或发布" : `已写入${TARGET_LABEL[this.target]}草稿`);
      if (status.url) {
        const open = this.actionsEl.createEl("button", { text: "打开草稿" });
        open.addEventListener("click", () => { window.open(status.url!, "_blank"); });
        this.actionsEl.insertBefore(open, this.publishButton);
      }
      this.publishButton.setText("再发一次");
      return;
    }
    if (status.state === "cancelled") { this.statusEl.setText("已停止。平台里可能留下了写到一半的草稿，可以在草稿列表里删除。"); return; }
    const code = status.error?.code;
    this.statusEl.setText(code === "no-extension"
      ? "没有检测到乔木 Clipper。请确认它已在浏览器里启用，并且系统默认浏览器就是装了它的那个。"
      : `没能写入${TARGET_LABEL[this.target]}：${status.error?.message ?? "未知原因"}`);
  }

  private async record(status: BridgeStatus): Promise<void> {
    if (!this.plugin.settings.wechat.recordInNote) return;
    const keys = RECORD_KEYS[this.target];
    try {
      await this.app.fileManager.processFrontMatter(this.file, (frontmatter: Record<string, unknown>) => {
        if (status.url) frontmatter[keys.url] = status.url;
        frontmatter[keys.at] = new Date().toISOString();
      });
    } catch { new Notice("草稿已写入，但没能记录到笔记属性"); }
  }

  override onClose(): void {
    this.generation++;
    if (this.prepareTimer !== null) window.clearTimeout(this.prepareTimer);
    if (this.phoneTimer !== null) window.clearTimeout(this.phoneTimer);
    this.run?.cancel();
    if (this.markdownTimer !== null) window.clearTimeout(this.markdownTimer);
    this.destroyControls?.();
    this.cover?.destroy();
    if (this.coverUrl) URL.revokeObjectURL(this.coverUrl);
    this.preview?.destroy();
    for (const url of this.assetUrls.values()) URL.revokeObjectURL(url);
    this.assetUrls.clear();
    this.base?.dispose();
    this.base = null;
    this.component.unload();
    this.contentEl.empty();
  }
}
