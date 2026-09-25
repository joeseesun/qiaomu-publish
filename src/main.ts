import { Menu, normalizePath, Notice, Platform, Plugin, TAbstractFile, TFile } from "obsidian";
import { DEFAULT_SETTINGS, legacyAgentSettings, normalizeSettings } from "./defaults";
import { QiaomuPublishSettingTab } from "./settings-tab";
import type { QiaomuPublishSettings } from "./types";
import { WechatPublishModal } from "./publish-modal";
import { WechatPreviewView, WECHAT_PREVIEW_VIEW } from "./preview-view";

export default class QiaomuPublishPlugin extends Plugin {
  override settings: QiaomuPublishSettings = normalizeSettings(DEFAULT_SETTINGS);

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(WECHAT_PREVIEW_VIEW, (leaf) => new WechatPreviewView(leaf, this));
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
      })
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  openWechatPublish(file: TFile): void {
    new WechatPublishModal(this.app, file, this.settings.wechat).open();
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
