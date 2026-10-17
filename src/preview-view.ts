import { ItemView, MarkdownView, Menu, Notice, sanitizeHTMLToDom, setIcon, TFile, type WorkspaceLeaf } from "obsidian";
import type QiaomuPublishPlugin from "./main";
import { buildWechatHtml, resolveWechatTheme } from "./export-html";
import { renderNoteForWechat, type RenderedNote } from "./render-note";
import { copyWechatHtml } from "./copy-html";
import { articleStats, exportHtmlFile, exportLongImage } from "./export-file";
import { mapScrollTop } from "./scroll-sync";
import { setName } from "./accessible-name";
import { ArticleStylePanel } from "./article-style-panel";
import { resolveArticleAppearance } from "./article-style";
import { STYLE_TEXT } from "./style-text";
import { ThemePicker } from "./theme-picker";

export const WECHAT_PREVIEW_VIEW = "qiaomu-wechat-preview";
const TOOLBAR_AUTO_KEY = "qiaomu-publish:toolbar-auto";

/** A live, read-only companion to the current Markdown note. */
export class WechatPreviewView extends ItemView {
  private file: TFile | null = null;
  private note: RenderedNote | null = null;
  private timer: number | null = null;
  private generation = 0;
  private wechatHtml = "";
  private frame!: HTMLElement;
  private shadow!: ShadowRoot;
  private status!: HTMLElement;
  private scrollSync = true;
  private sourceView: MarkdownView | null = null;
  private pendingSourceTop = -1;
  private pendingPreviewTop = -1;
  private stylePanel!: ArticleStylePanel;
  private styleAction!: HTMLButtonElement;
  private copyAction!: HTMLButtonElement;
  private publishAction!: HTMLButtonElement;
  private pinAction!: HTMLButtonElement;
  private empty!: HTMLElement;
  private root!: HTMLElement;
  private toolbarAuto = false;
  private hideTimer: number | null = null;
  private picker!: ThemePicker;
  private paper!: HTMLElement;
  private ready = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: QiaomuPublishPlugin) { super(leaf); }
  getViewType(): string { return WECHAT_PREVIEW_VIEW; }
  getDisplayText(): string { return "公众号预览"; }
  override getIcon(): string { return "smartphone"; }

  override async onOpen(): Promise<void> {
    // The host pads every view; the preview wants the full pane.
    this.contentEl.addClass("qiaomu-wechat-preview-host");
    const root = this.contentEl.createDiv({ cls: "qiaomu-wechat-live-preview" });
    // Sidebar leaves can hide the host view-header and all ItemView.addAction controls,
    // so the same row is drawn inside the view, styled as a native header.
    const toolbar = root.createDiv({ cls: "qiaomu-wechat-preview-toolbar" });
    this.picker = new ThemePicker(toolbar, (themeId) => {
      if (!this.ready || !this.file) return;
      const { style } = this.appearance();
      void this.plugin.saveNoteAppearance(this.file.path, { themeId, style }).catch((error) => this.status.setText(`${STYLE_TEXT.saveFailed}：${error instanceof Error ? error.message : String(error)}`));
    });
    toolbar.createDiv({ cls: "qiaomu-wechat-toolbar-spacer" });
    const action = (icon: string, name: string, callback: (event: MouseEvent) => void, label?: string): HTMLButtonElement => {
      const button = toolbar.createEl("button", { cls: label ? "qiaomu-wechat-toolbar-text" : "qiaomu-wechat-toolbar-icon-button", attr: { type: "button", "data-qm-tip": name } });
      setName(button, name);
      setIcon(button.createSpan({ cls: "qiaomu-wechat-toolbar-icon" }), icon);
      if (label) button.createSpan({ text: label });
      this.registerDomEvent(button, "click", callback);
      return button;
    };
    this.styleAction = action("type", STYLE_TEXT.action, () => {
      if (!this.ready) return;
      const open = this.stylePanel.el.hidden;
      this.styleAction.setAttribute("aria-expanded", String(open));
      this.stylePanel.show(open);
    });
    this.styleAction.setAttribute("aria-expanded", "false");
    action("ellipsis", "更多", (event) => this.openOptions(event));
    this.copyAction = action("copy", "复制公众号格式", () => void this.copy(), "复制");
    this.publishAction = action("send", "发布到公众号草稿箱", () => { if (this.file) this.plugin.openWechatPublish(this.file); }, "发布");
    this.publishAction.addClass("mod-cta");
    this.pinAction = action("pin", "", () => this.setToolbarAuto(!this.toolbarAuto));
    const handle = root.createEl("button", { cls: "qiaomu-wechat-toolbar-handle", attr: { type: "button" } });
    setName(handle, "显示工具栏");
    this.root = root;
    this.registerDomEvent(handle, "pointerenter", () => this.revealToolbar(true));
    this.registerDomEvent(handle, "pointerleave", () => this.hideToolbarSoon());
    this.registerDomEvent(handle, "click", () => this.revealToolbar(!root.hasClass("is-toolbar-open")));
    this.registerDomEvent(toolbar, "pointerleave", () => this.hideToolbarSoon());
    this.registerDomEvent(toolbar, "pointerenter", () => this.revealToolbar(true));
    this.setToolbarAuto(this.app.loadLocalStorage(TOOLBAR_AUTO_KEY) === "1", false);
    this.stylePanel = new ArticleStylePanel(root, {
      change: (appearance) => this.plugin.saveNoteAppearance(this.file!.path, appearance),
      reset: () => this.plugin.saveNoteAppearance(this.file!.path, null),
      makeDefault: () => this.plugin.setDefaultAppearance(this.appearance()),
      retry: () => this.plugin.saveSettings(),
      close: () => {
        this.stylePanel.show(false);
        this.styleAction.setAttribute("aria-expanded", "false");
        this.styleAction.focus();
      },
    });
    this.registerDomEvent(root, "mousedown", (event) => {
      if (this.stylePanel.el.hidden) return;
      const target = event.target as Node;
      if (this.stylePanel.el.contains(target) || this.styleAction.contains(target)) return;
      this.stylePanel.show(false);
      this.styleAction.setAttribute("aria-expanded", "false");
    });
    this.frame = root.createDiv({ cls: "qiaomu-wechat-preview-frame" });
    this.paper = this.frame.createDiv({ cls: "qiaomu-wechat-preview-paper" });
    // Word count and messages sit after the article, so they never take height from it.
    this.status = this.frame.createDiv({ cls: "qiaomu-wechat-preview-status", attr: { role: "status" } });
    this.empty = this.frame.createDiv({ cls: "qiaomu-wechat-empty" });
    this.shadow = this.paper.attachShadow({ mode: "open" });
    this.register(this.plugin.onAppearanceChange(() => this.updateAppearance()));
    this.registerDomEvent(this.frame, "scroll", this.onPreviewScroll, { passive: true });
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.bindMatchingSource()));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file.path !== this.file?.path) return;
      this.file = null;
      this.generation++;
      this.wechatHtml = "";
      this.note?.dispose();
      this.note = null;
      this.shadow.replaceChildren();
      this.showEmpty();
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => { if (file.path === this.file?.path) this.schedule(); }));
    this.picker.setValue(this.plugin.settings.wechat.themeId, this.plugin.settings.wechat.articleStyle.primaryColor);
    this.setReady(false);
    this.followActiveFile();
  }

  /** Auto mode tucks the toolbar away to give the article the full height; it slides back on hover, focus or tap. */
  private setToolbarAuto(auto: boolean, persist = true): void {
    this.toolbarAuto = auto;
    this.root.toggleClass("is-toolbar-auto", auto);
    this.root.toggleClass("is-toolbar-open", false);
    this.pinAction.empty();
    setIcon(this.pinAction.createSpan({ cls: "qiaomu-wechat-toolbar-icon" }), auto ? "pin-off" : "pin");
    const name = auto ? "固定工具栏" : "自动隐藏工具栏";
    this.pinAction.setAttribute("data-qm-tip", name);
    setName(this.pinAction, name);
    this.pinAction.setAttribute("aria-pressed", String(!auto));
    if (persist) this.app.saveLocalStorage(TOOLBAR_AUTO_KEY, auto ? "1" : null);
  }

  private revealToolbar(open: boolean): void {
    if (this.hideTimer !== null) { window.clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (this.toolbarAuto) this.root.toggleClass("is-toolbar-open", open);
  }

  private hideToolbarSoon(): void {
    if (!this.toolbarAuto) return;
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      const busy = !this.stylePanel.el.hidden || this.root.querySelector(".qiaomu-wechat-picker-pop:not([hidden])") || this.root.querySelector(".qiaomu-wechat-preview-toolbar:focus-within");
      if (!busy) this.root.toggleClass("is-toolbar-open", false);
    }, 450);
  }

  private openOptions(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("同步滚动").setIcon("arrow-down-up").setChecked(this.scrollSync).onClick(() => {
      this.scrollSync = !this.scrollSync;
      if (this.scrollSync) this.syncFromSource();
    }));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("公众号设置").setIcon("settings").onClick(() => this.plugin.openSettings()));
    menu.addItem((item) => item.setTitle("导出 HTML 文件").setIcon("file-code").onClick(() => void this.exportAs("html")));
    menu.addItem((item) => item.setTitle("导出长图 PNG").setIcon("image-down").onClick(() => void this.exportAs("image")));
    menu.showAtMouseEvent(event);
  }

  private updateStatus(): void {
    if (this.note?.imageErrors?.length) { this.status.setText(this.note.imageErrors.join("\n")); return; }
    const warnings = this.note?.warnings.length ?? 0;
    const stats = this.note ? articleStats(this.note.html) : null;
    this.status.setText([
      stats ? `${stats.words.toLocaleString()} 字 · 约 ${stats.minutes} 分钟读完` : "",
      warnings ? `${warnings} 条排版提醒` : "",
    ].filter(Boolean).join(" · "));
  }

  private async exportAs(kind: "html" | "image"): Promise<void> {
    if (!this.ready || !this.note || !this.wechatHtml) return;
    this.status.setText("正在导出…");
    try {
      if (kind === "html") new Notice(`已导出 ${await exportHtmlFile(this.app, this.note.title, this.wechatHtml, this.note.images, this.note.imageErrors)}`);
      else {
        const result = await exportLongImage(this.app, this.note.title, this.wechatHtml, this.note.images, this.note.imageErrors);
        new Notice(result.reduced ? `已导出 ${result.name}（文章较长，清晰度已降低）` : `已导出 ${result.name}`);
      }
      this.updateStatus();
    } catch (error) {
      this.status.setText(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getSourceScroller(): HTMLElement | null {
    const view = this.sourceView;
    if (!view || view.file?.path !== this.file?.path) return null;
    const selector = view.getMode() === "preview" ? ".markdown-preview-view" : ".cm-scroller";
    const scroller = view.containerEl.querySelector<HTMLElement>(selector);
    return scroller?.clientHeight ? scroller : null;
  }

  private bindSource(view: MarkdownView | null): void {
    if (view === this.sourceView) return;
    this.sourceView?.containerEl.removeEventListener("scroll", this.onSourceScroll, true);
    this.sourceView = view;
    this.pendingSourceTop = -1;
    this.pendingPreviewTop = -1;
    view?.containerEl.addEventListener("scroll", this.onSourceScroll, { capture: true, passive: true });
    if (view) this.syncFromSource();
  }

  private bindMatchingSource(): void {
    const file = this.file;
    if (!file) return;
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file?.path === file.path) { this.bindSource(active); return; }
    if (this.getSourceScroller()) return;
    const matching = this.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === file.path)
      .find((view) => {
        const selector = view.getMode() === "preview" ? ".markdown-preview-view" : ".cm-scroller";
        return Boolean(view.containerEl.querySelector<HTMLElement>(selector)?.clientHeight);
      });
    this.bindSource(matching ?? null);
  }

  private readonly onSourceScroll = (event: Event): void => {
    if (!this.scrollSync || event.target !== this.getSourceScroller()) return;
    const source = event.target as HTMLElement;
    if (this.pendingSourceTop >= 0 && Math.abs(source.scrollTop - this.pendingSourceTop) < 2) {
      this.pendingSourceTop = -1;
      return;
    }
    this.pendingSourceTop = -1;
    this.syncFromSource();
  };

  private readonly onPreviewScroll = (): void => {
    if (!this.scrollSync) return;
    if (this.pendingPreviewTop >= 0 && Math.abs(this.frame.scrollTop - this.pendingPreviewTop) < 2) {
      this.pendingPreviewTop = -1;
      return;
    }
    this.pendingPreviewTop = -1;
    const source = this.getSourceScroller();
    if (!source) return;
    const target = mapScrollTop(this.frame.scrollTop, this.frame.scrollHeight - this.frame.clientHeight, source.scrollHeight - source.clientHeight);
    if (Math.abs(source.scrollTop - target) < 2) return;
    this.pendingSourceTop = target;
    source.scrollTop = target;
  };

  private syncFromSource(): void {
    if (!this.scrollSync || !this.wechatHtml) return;
    const source = this.getSourceScroller();
    if (!source) return;
    const target = mapScrollTop(source.scrollTop, source.scrollHeight - source.clientHeight, this.frame.scrollHeight - this.frame.clientHeight);
    if (Math.abs(this.frame.scrollTop - target) < 2) return;
    this.pendingPreviewTop = target;
    this.frame.scrollTop = target;
  }

  private async copy(): Promise<void> {
    if (!this.note || !this.wechatHtml) return;
    this.status.setText("正在准备复制…");
    try {
      await copyWechatHtml(this.app, this.wechatHtml, this.note.images, this.note.imageErrors);
      this.status.setText(this.note.images.some(image => image.kind !== "remote") ? "已复制排版；发送到草稿箱可自动上传图片。" : "已复制，可粘贴到公众号编辑器。");
    } catch (error) {
      this.status.setText(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  override async onClose(): Promise<void> {
    this.generation++;
    this.bindSource(null);
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.note?.dispose();
    this.note = null;
    this.picker?.destroy();
    this.contentEl.empty();
  }

  setFile(file: TFile): void {
    if (file.path !== this.file?.path) this.stylePanel?.clearStatus();
    this.file = file;
    this.frame.removeClass("is-empty");
    if (this.publishAction) this.publishAction.disabled = false;
    this.bindMatchingSource();
    this.schedule();
  }

  private followActiveFile(): void {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = active?.file ?? this.app.workspace.getActiveFile();
    if (file?.extension !== "md") { if (!this.file) this.showEmpty(); return; }
    if (file.path !== this.file?.path) this.setFile(file);
    else if (active) this.bindSource(active);
  }

  private schedule(): void {
    this.generation++;
    this.setReady(false);
    this.wechatHtml = "";
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = null; void this.refresh(); }, 350);
  }

  /** Nothing to preview yet: a quiet explanation and the notes opened most recently. */
  private showEmpty(): void {
    if (!this.frame || !this.frame.isConnected) return;
    this.frame.addClass("is-empty");
    this.publishAction.disabled = true;
    this.setReady(false);
    this.empty.empty();
    setIcon(this.empty.createDiv({ cls: "qiaomu-wechat-empty-icon" }), "smartphone");
    this.empty.createEl("h3", { text: "打开一篇笔记，开始预览" });
    this.empty.createEl("p", { text: "在左侧打开任意 Markdown 笔记，这里会按公众号排版实时显示，改文字也会同步。" });
    const recent = this.app.workspace.getLastOpenFiles()
      .map((path) => this.app.vault.getAbstractFileByPath(path))
      .filter((file): file is TFile => file instanceof TFile && file.extension === "md")
      .slice(0, 4);
    if (!recent.length) return;
    this.empty.createDiv({ cls: "qiaomu-wechat-empty-label", text: "最近的笔记" });
    const list = this.empty.createDiv({ cls: "qiaomu-wechat-empty-list" });
    for (const file of recent) {
      const row = list.createEl("button", { cls: "qiaomu-wechat-empty-row", attr: { type: "button" } });
      setIcon(row.createSpan({ cls: "qiaomu-wechat-empty-file" }), "file-text");
      row.createSpan({ cls: "qiaomu-wechat-empty-name", text: file.basename });
      if (file.parent && !file.parent.isRoot()) row.createSpan({ cls: "qiaomu-wechat-empty-folder", text: file.parent.name });
      row.addEventListener("click", () => void this.app.workspace.getLeaf("tab").openFile(file));
    }
  }

  private setReady(ready: boolean): void {
    this.ready = ready;
    this.styleAction?.setAttribute("aria-disabled", String(!ready));
    if (this.styleAction) this.styleAction.disabled = !ready;
    if (this.copyAction) this.copyAction.disabled = !ready;
    this.picker?.setEnabled(ready);
    this.stylePanel?.setEnabled(ready);
  }

  /** Let the theme's own page colour fill the paper so dark themes show no white band. */
  private paintPaper(): void {
    const root = this.shadow.querySelector<HTMLElement>(".wechat-export-root");
    const color = root ? this.shadow.ownerDocument.defaultView?.getComputedStyle(root).backgroundColor : "";
    this.paper.setCssProps({ "--qiaomu-paper-color": color && color !== "rgba(0, 0, 0, 0)" ? color : "#ffffff" });
  }

  private appearance() {
    return resolveArticleAppearance(this.plugin.settings.wechat, this.file!.path, this.note?.frontmatter);
  }

  private updateAppearance(): void {
    if (!this.ready || !this.note || !this.file) return;
    try {
      const appearance = this.appearance();
      const html = buildWechatHtml(this.note.html, resolveWechatTheme(appearance.themeId), undefined, appearance.style);
      if (html !== this.wechatHtml) {
        const fraction = this.frame.scrollTop / Math.max(1, this.frame.scrollHeight - this.frame.clientHeight);
        this.wechatHtml = html;
        this.shadow.replaceChildren(sanitizeHTMLToDom(html));
        this.paintPaper();
        this.pendingPreviewTop = Math.round(fraction * Math.max(0, this.frame.scrollHeight - this.frame.clientHeight));
        this.frame.scrollTop = this.pendingPreviewTop;
        this.syncFromSource();
      }
      this.stylePanel.sync(appearance, this.shadow);
      this.picker.setValue(appearance.themeId, appearance.style.primaryColor);
    } catch (error) {
      this.wechatHtml = "";
      this.status.setText(`预览失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async refresh(): Promise<void> {
    const file = this.file;
    if (!file || !this.frame?.isConnected) { if (this.status) this.status.setText("打开一篇 Markdown 笔记以预览。"); return; }
    const generation = ++this.generation;
    this.setReady(false);
    this.wechatHtml = "";
    this.status.setText(`正在排版：${file.basename}`);
    try {
      const note = await renderNoteForWechat(this.app, file, this);
      if (generation !== this.generation || !this.frame.isConnected) { note.dispose(); return; }
      const appearance = resolveArticleAppearance(this.plugin.settings.wechat, file.path, note.frontmatter);
      const html = buildWechatHtml(note.html, resolveWechatTheme(appearance.themeId), undefined, appearance.style);
      this.note?.dispose();
      this.note = note;
      this.wechatHtml = html;
      this.shadow.replaceChildren(sanitizeHTMLToDom(html));
      this.paintPaper();
      this.setReady(true);
      this.stylePanel.sync(appearance, this.shadow);
      this.picker.setValue(appearance.themeId, appearance.style.primaryColor);
      this.updateStatus();
      this.syncFromSource();
    } catch (error) { if (generation === this.generation) this.status.setText(`预览失败：${error instanceof Error ? error.message : String(error)}`); }
  }
}
