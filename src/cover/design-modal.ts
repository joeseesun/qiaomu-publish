import { type App, Modal, Setting } from "obsidian";
import { CoverEditor } from "../cover-editor";
import type { WechatCoverStyle } from "../types";
import type { CoverSpec } from "./spec";

export interface DesignRequest {
  spec: CoverSpec;
  /** The window's title; the cover uses it unless other cover text is written. */
  title: string;
  coverText: string;
  style: () => WechatCoverStyle;
  updateStyle: (style: WechatCoverStyle) => void;
}

export interface DesignChoice { coverText: string }

/** Cover designer in its own window: today the text cover (background, font, size, colour), at the platform's shape. Resolves null when cancelled. */
export function askDesign(app: App, request: DesignRequest): Promise<DesignChoice | null> {
  return new Promise((resolve) => new CoverDesignModal(app, request, resolve).open());
}

class CoverDesignModal extends Modal {
  private editor: CoverEditor | null = null;
  private text: string;
  private readonly startStyle: WechatCoverStyle;
  private done = false;

  constructor(app: App, private readonly request: DesignRequest, private readonly resolve: (choice: DesignChoice | null) => void) {
    super(app);
    this.text = request.coverText;
    this.startStyle = { ...request.style() };
  }

  override onOpen(): void {
    // The editor's own styles are scoped to the publish window class; the second class sizes this window.
    this.modalEl.addClass("qiaomu-wechat-modal", "qiaomu-design-modal");
    this.setTitle(`设计${this.request.spec.label}`);
    const { contentEl } = this;
    new Setting(contentEl).setName("封面文字").setDesc("留空则用标题。封面上的大字可以比标题更短、更有冲击力。")
      .addText((text) => text.setValue(this.text).setPlaceholder(this.request.title).onChange((value) => { this.text = value.trim(); this.editor?.sync(); }));
    this.editor = new CoverEditor(contentEl, {
      title: () => this.text || this.request.title,
      style: this.request.style,
      update: this.request.updateStyle,
      size: { width: this.request.spec.width, height: this.request.spec.height },
    });
    const actions = contentEl.createDiv({ cls: "qiaomu-wechat-actions qiaomu-design-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const ok = actions.createEl("button", { text: "使用这个封面", cls: "mod-cta" });
    ok.addEventListener("click", () => { this.done = true; this.resolve({ coverText: this.text }); this.close(); });
  }

  override onClose(): void {
    // Style changes are saved as they are made; cancelling puts the style back as it was.
    if (!this.done) { this.request.updateStyle(this.startStyle); this.resolve(null); }
    this.editor?.destroy();
    this.contentEl.empty();
  }
}
