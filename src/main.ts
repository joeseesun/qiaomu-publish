import { UpdateNotes } from './update-notes';
import { UPDATE_ENTRIES } from './update-notes-release';
import { Menu, type Modal, normalizePath, Notice, Platform, Plugin, TAbstractFile, TFile } from "obsidian";
import { DEFAULT_SETTINGS, legacyAgentSettings, normalizeSettings } from "./defaults";
import { QiaomuPublishSettingTab } from "./settings-tab";
import type { QiaomuPublishSettings, WechatArticleAppearance } from "./types";
import { WechatPublishModal } from "./publish-modal";
import { ExternalPublishModal } from "./external-publish-modal";
import { TARGET_LABEL, type PublishTargetId } from "./bridge/protocol";
import type { PublishChoice } from "./platform-switch";
import { WechatPreviewView, WECHAT_PREVIEW_VIEW } from "./preview-view";

export default class QiaomuPublishPlugin extends Plugin {
  updateNotes!: UpdateNotes;
  override settings: QiaomuPublishSettings = normalizeSettings(DEFAULT_SETTINGS);
  private saveQueue: Promise<void> = Promise.resolve();
  private appearanceListeners = new Set<() => void>();
  private modals = new Set<Modal>();

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(WECHAT_PREVIEW_VIEW, (leaf) => new WechatPreviewView(leaf, this));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const styles = this.settings.wechat.noteStyles;
      let changed = false;
      for (const path of Object.keys(styles)) {
        if (path !== oldPath && !path.startsWith(`${oldPath}/`)) continue;
        styles[`${file.path}${path.slice(oldPath.length)}`] = styles[path]!;
        delete styles[path];
        changed = true;
      }
      if (changed) void this.saveSettings().catch(() => new Notice("排版设置保存失败，请在预览中重试保存"));
    }));
    this.updateNotes = new UpdateNotes(this, UPDATE_ENTRIES, () => 'zh');
    this.addSettingTab(new QiaomuPublishSettingTab(this.app, this));
    this.addRibbonIcon("smartphone", "预览公众号排版", () => {
      const file = this.app.workspace.getActiveFile();
      if (file?.extension === "md") void this.openWechatPreview(file);
      else new Notice("请先打开一篇 Markdown 笔记");
    });

    this.addCommand({
      id: "publish-wechat-draft",
      name: "发布当前笔记到公众号草稿箱",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file?.extension !== "md") return false;
        if (!checking) this.openWechatPublish(file);
        return true;
      },
    });
    for (const target of ["x", "zhihu", "xhs"] as const) {
      this.addCommand({
        id: `publish-${target}-draft`,
        name: `发布当前笔记到${TARGET_LABEL[target]}草稿`,
        checkCallback: (checking) => {
          const file = this.app.workspace.getActiveFile();
          if (file?.extension !== "md") return false;
          if (!checking) this.openExternalPublish(file, target);
          return true;
        },
      });
    }
    this.addCommand({
      id: "preview-wechat-note",
      name: "实时预览当前笔记的公众号排版",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file?.extension !== "md") return false;
        if (!checking) void this.openWechatPreview(file);
        return true;
      },
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        menu.addItem((item) => item.setTitle("预览公众号排版").setIcon("smartphone").setSection("action").onClick(() => void this.openWechatPreview(file)));
        menu.addItem((item) => item.setTitle("发布到公众号草稿箱").setIcon("send").setSection("action").onClick(() => this.openWechatPublish(file)));
        for (const target of ["x", "zhihu", "xhs"] as const) menu.addItem((item) => item.setTitle(`发布到${TARGET_LABEL[target]}草稿`).setIcon("send").setSection("action").onClick(() => this.openExternalPublish(file, target)));
      })
    );
  }

  async saveSettings(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.settings)) as QiaomuPublishSettings;
    for (const listener of this.appearanceListeners) listener();
    const task = this.saveQueue.catch(() => {}).then(() => this.saveData(snapshot));
    this.saveQueue = task;
    await task;
  }

  onAppearanceChange(listener: () => void): () => void {
    this.appearanceListeners.add(listener);
    return () => this.appearanceListeners.delete(listener);
  }

  async saveNoteAppearance(path: string, appearance: WechatArticleAppearance | null): Promise<void> {
    if (appearance) this.settings.wechat.noteStyles[path] = { themeId: appearance.themeId, style: { ...appearance.style } };
    else delete this.settings.wechat.noteStyles[path];
    await this.saveSettings();
  }

  async setDefaultAppearance(appearance: WechatArticleAppearance): Promise<void> {
    this.settings.wechat.themeId = appearance.themeId;
    this.settings.wechat.articleStyle = { ...appearance.style };
    await this.saveSettings();
  }

  /** Opens this plugin's page in Obsidian settings (the host has no documented API for it). */
  openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    if (!setting) { new Notice("请在 设置 → 第三方插件 → Qiaomu Publish 中管理公众号连接"); return; }
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  openWechatPublish(file: TFile): void {
    this.showModal(new WechatPublishModal(this.app, file, this));
  }

  /** Opens the publish window for `choice`; the switch row inside every window calls this to hop between platforms. */
  openPublish(file: TFile, choice: PublishChoice): void {
    if (choice === "wechat") this.openWechatPublish(file);
    else this.openExternalPublish(file, choice);
  }

  openExternalPublish(file: TFile, target: PublishTargetId): void {
    this.showModal(new ExternalPublishModal(this.app, file, this, target));
  }

  showModal(modal: Modal): void {
    const close = modal.onClose.bind(modal);
    modal.onClose = () => { this.modals.delete(modal); close(); };
    this.modals.add(modal);
    modal.open();
  }

  override onunload(): void {
    for (const modal of this.modals) modal.close();
    this.modals.clear();
    this.appearanceListeners.clear();
  }

  async openWechatPreview(file: TFile): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(WECHAT_PREVIEW_VIEW)[0];
    if (!leaf) {
      leaf = Platform.isDesktopApp ? this.app.workspace.getRightLeaf(false) ?? undefined : this.app.workspace.getLeaf("tab");
      await leaf?.setViewState({ type: WECHAT_PREVIEW_VIEW, active: true });
    }
    if (!leaf) { new Notice("无法打开公众号预览"); return; }
    if (leaf.view instanceof WechatPreviewView) leaf.view.setFile(file);
    await this.app.workspace.revealLeaf(leaf);
  }

  private async loadSettings(): Promise<void> {
    const saved: unknown = await this.loadData();
    if (saved) { this.settings = normalizeSettings(saved); return; }
    const imported = await this.readAgentSettings();
    this.settings = imported ?? normalizeSettings(null);
    if (!imported) return;
    await this.saveSettings();
    new Notice("已从乔木 Agent 导入公众号设置");
  }

  /** First run only: earlier Qiaomu Agent builds stored the publishing settings in their own data.json. */
  private async readAgentSettings(): Promise<QiaomuPublishSettings | null> {
    const path = normalizePath(`${this.app.vault.configDir}/plugins/qiaomu-agent/data.json`);
    try {
      if (!(await this.app.vault.adapter.exists(path))) return null;
      return legacyAgentSettings(JSON.parse(await this.app.vault.adapter.read(path)));
    } catch {
      return null;
    }
  }
}
