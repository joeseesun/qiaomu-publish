import { type App, PluginSettingTab, setIcon, Setting } from "obsidian";
import type QiaomuPublishPlugin from "./main";
import { WechatTransportRouter } from "./transport-router";
import { ConnectionModal } from "./connection-modal";
import { CoverEditor } from "./cover-editor";
import { ThemePicker } from "./theme-picker";
import { resolveWechatTheme } from "./export-html";
import type { WechatConnection } from "./types";

type Section = "accounts" | "style" | "about";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "accounts", label: "公众号" },
  { id: "style", label: "排版与封面" },
  { id: "about", label: "关于" },
];

const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" };

export class QiaomuPublishSettingTab extends PluginSettingTab {
  private section: Section = "accounts";
  private cleanups: (() => void)[] = [];
  private sampleTitle = "向阳乔木的新工具";

  constructor(app: App, private readonly plugin: QiaomuPublishPlugin) { super(app, plugin); }

  override display(): void {
    this.runCleanups();
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("qiaomu-publish-settings");

    const header = containerEl.createDiv({ cls: "qp-header" });
    const identity = header.createDiv({ cls: "qp-identity" });
    setIcon(identity.createSpan({ attr: { "aria-hidden": "true" } }), "send");
    new Setting(identity).setName("乔木 Publish").setHeading();
    const tabs = header.createDiv({ cls: "qp-tabs", attr: { role: "tablist" } });
    for (const [index, item] of SECTIONS.entries()) {
      const selected = this.section === item.id;
      const button = tabs.createEl("button", { text: item.label, cls: "qp-tab", attr: { type: "button", role: "tab", "aria-selected": String(selected), tabindex: selected ? "0" : "-1" } });
      if (selected) button.addClass("is-active");
      const go = (id: Section) => { this.section = id; this.display(); this.containerEl.querySelector<HTMLElement>("[role=tab][aria-selected=true]")?.focus(); };
      button.addEventListener("click", () => go(item.id));
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        go(SECTIONS[(index + (event.key === "ArrowRight" ? 1 : SECTIONS.length - 1)) % SECTIONS.length]!.id);
      });
    }

    const body = containerEl.createDiv({ cls: "qp-body", attr: { role: "tabpanel" } });
    if (this.section === "accounts") this.renderAccounts(body);
    else if (this.section === "style") this.renderStyle(body);
    else this.renderAbout(body);
  }

  override hide(): void { this.runCleanups(); super.hide(); }

  private runCleanups(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
  }

  // ---------- shared pieces ----------

  private head(parent: HTMLElement, title: string, hint: string): HTMLElement {
    const head = parent.createDiv({ cls: "qp-head" });
    const text = head.createDiv({ cls: "qp-head-text" });
    new Setting(text).setName(title).setHeading();
    text.createEl("p", { text: hint });
    return head.createDiv({ cls: "qp-head-actions" });
  }

  private button(parent: HTMLElement, label: string, icon: string, primary = false): HTMLButtonElement {
    const button = parent.createEl("button", { cls: primary ? "qp-button is-primary" : "qp-button", attr: { type: "button" } });
    setIcon(button.createSpan({ cls: "qp-button-icon", attr: { "aria-hidden": "true" } }), icon);
    button.createSpan({ text: label });
    return button;
  }

  // ---------- 公众号 ----------

  private renderAccounts(body: HTMLElement): void {
    const wechat = this.plugin.settings.wechat;
    const section = body.createDiv({ cls: "qp-section" });
    const actions = this.head(section, "公众号", "连接后可把笔记发到草稿箱，不会直接群发；不连接也能复制公众号格式。可以连接多个公众号，发布时选择。");
    this.button(actions, "添加公众号", "plus", true).addEventListener("click", () => this.openConnection(null));

    const list = section.createDiv({ cls: "qp-list" });
    if (wechat.connections.length === 0) {
      const empty = list.createDiv({ cls: "qp-empty" });
      setIcon(empty.createSpan({ attr: { "aria-hidden": "true" } }), "newspaper");
      empty.createEl("strong", { text: "还没有连接公众号" });
      empty.createEl("p", { text: "准备好 AppID 和 AppSecret，点「添加公众号」，一分钟内可以完成。" });
      this.button(empty, "添加公众号", "plus").addEventListener("click", () => this.openConnection(null));
    }
    for (const connection of wechat.connections) this.renderAccountRow(list, connection);

    this.renderPublishDefaults(body);
    this.renderBridge(body);
  }

  private renderAccountRow(list: HTMLElement, connection: WechatConnection): void {
    const wechat = this.plugin.settings.wechat;
    const isDefault = wechat.defaultAccountId === connection.id;
    const row = list.createDiv({ cls: "qp-row" });
    const main = row.createEl("button", { cls: "qp-row-main", attr: { type: "button" } });
    setIcon(main.createSpan({ cls: "qp-row-icon", attr: { "aria-hidden": "true" } }), connection.mode === "relay" ? "cloud" : "monitor-smartphone");
    const text = main.createDiv({ cls: "qp-row-text" });
    const name = text.createDiv({ cls: "qp-row-name" });
    name.createSpan({ text: connection.name });
    if (isDefault) name.createSpan({ cls: "qp-badge", text: "默认" });
    const tail = connection.appId ? ` · AppID …${connection.appId.slice(-4)}` : "";
    const hasSecret = Boolean(this.app.secretStorage.getSecret(connection.appSecretId));
    const sub = text.createDiv({ cls: `qp-row-sub${connection.appId && hasSecret ? "" : " is-attention"}` });
    sub.setText(`${connection.mode === "relay" ? "固定 IP 中转" : "当前设备直连"}${tail}${connection.appId && hasSecret ? "" : " · 信息不完整，点开补充"}`);
    setIcon(main.createSpan({ cls: "qp-chevron", attr: { "aria-hidden": "true" } }), "chevron-right");
    main.addEventListener("click", () => this.openConnection(connection));
    if (!isDefault) {
      const make = row.createEl("button", { cls: "qp-row-action", text: "设为默认", attr: { type: "button" } });
      make.addEventListener("click", () => void (async () => { wechat.defaultAccountId = connection.id; await this.plugin.saveSettings(); this.display(); })());
    }
  }

  private openConnection(connection: WechatConnection | null): void {
    this.plugin.showModal(new ConnectionModal(this.app, this.plugin, connection, () => this.display()));
  }

  private renderPublishDefaults(body: HTMLElement): void {
    const wechat = this.plugin.settings.wechat;
    const section = body.createDiv({ cls: "qp-section" });
    this.head(section, "发布", "新笔记的默认值；每篇笔记的属性可以覆盖。");
    const list = section.createDiv({ cls: "qp-list qp-settings" });
    if (wechat.connections.length > 1) {
      new Setting(list).setName("默认公众号").setDesc("打开发布窗口时预选的公众号。")
        .addDropdown((dropdown) => {
          for (const connection of wechat.connections) dropdown.addOption(connection.id, connection.name);
          dropdown.setValue(wechat.connections.some((item) => item.id === wechat.defaultAccountId) ? wechat.defaultAccountId : wechat.connections[0]!.id)
            .onChange(async (value) => { wechat.defaultAccountId = value; await this.plugin.saveSettings(); this.display(); });
        });
    }
    new Setting(list).setName("默认作者").setDesc("笔记属性 author 或 作者 优先。")
      .addText((text) => text.setValue(wechat.author).onChange(async (value) => { wechat.author = value.trim(); await this.plugin.saveSettings(); }));
    new Setting(list).setName("打开留言").addToggle((toggle) => toggle.setValue(wechat.openComment).onChange(async (value) => { wechat.openComment = value; await this.plugin.saveSettings(); }));
    new Setting(list).setName("记录到笔记属性").setDesc("成功后写入 wechat_media_id、wechat_draft_at 和 wechat_account，下次默认更新同一篇草稿。")
      .addToggle((toggle) => toggle.setValue(wechat.recordInNote).onChange(async (value) => { wechat.recordInNote = value; await this.plugin.saveSettings(); }));
  }

  /** The original server-side Bridge keeps working, but is folded away for everyone else. */
  private renderBridge(body: HTMLElement): void {
    const wechat = this.plugin.settings.wechat;
    const details = body.createEl("details", { cls: "qp-advanced" });
    details.open = Boolean(wechat.bridgeUrl);
    details.createEl("summary", { text: "高级：自建 Bridge（已有部署才需要）" });
    const list = details.createDiv({ cls: "qp-list qp-settings" });
    new Setting(list).setName("Bridge 地址").setDesc("例如 https://bridge.example.com；必须是 https。")
      .addText((text) => text.setPlaceholder("https://").setValue(wechat.bridgeUrl).onChange(async (value) => { wechat.bridgeUrl = value.trim(); await this.plugin.saveSettings(); }));
    new Setting(list).setName("访问令牌").setDesc("即 Bridge 的 BRIDGE_TOKEN，保存在 Obsidian SecretStorage，不写入 data.json。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.app.secretStorage.getSecret(wechat.secretId) ?? "");
        text.onChange((value) => this.app.secretStorage.setSecret(wechat.secretId, value.trim()));
      });
    const account = new Setting(list).setName("Bridge 上的默认公众号").setDesc(wechat.defaultAccountId ? `当前：${wechat.defaultAccountId}` : "点「加载」读取 Bridge 的公众号。");
    account.addButton((button) => button.setButtonText("加载").onClick(async () => {
      button.setDisabled(true);
      try {
        const router = new WechatTransportRouter(this.app, wechat);
        const accounts = await router.listAccounts();
        if (accounts.length === 0) throw new Error(router.errors.join("；") || "尚未配置可用公众号");
        if (!accounts.some((item) => item.id === wechat.defaultAccountId)) wechat.defaultAccountId = accounts[0]!.id;
        account.setDesc(`已加载 ${accounts.length} 个公众号。${router.errors.join("；")}`);
        account.controlEl.querySelector("select")?.remove();
        account.addDropdown((dropdown) => {
          for (const item of accounts) dropdown.addOption(item.id, item.name);
          dropdown.setValue(wechat.defaultAccountId).onChange(async (value) => { wechat.defaultAccountId = value; await this.plugin.saveSettings(); });
        });
        await this.plugin.saveSettings();
      } catch (error) { account.setDesc(`连接失败：${error instanceof Error ? error.message : String(error)}`); }
      finally { button.setDisabled(false); }
    }));
  }

  // ---------- 排版与封面 ----------

  private renderStyle(body: HTMLElement): void {
    const wechat = this.plugin.settings.wechat;
    const theme = body.createDiv({ cls: "qp-section" });
    this.head(theme, "排版主题", "新笔记默认使用的样式。在预览里点齿轮可以单独调整某一篇，并可「设为默认」。");
    const themeList = theme.createDiv({ cls: "qp-list qp-settings" });
    const themeSetting = new Setting(themeList).setName("默认主题").setDesc(resolveWechatTheme(wechat.themeId).description);
    const picker = new ThemePicker(themeSetting.controlEl, (themeId) => {
      wechat.themeId = themeId;
      picker.setValue(themeId, wechat.articleStyle.primaryColor);
      themeSetting.setDesc(resolveWechatTheme(themeId).description);
      void this.plugin.saveSettings();
    }, "field");
    picker.setValue(resolveWechatTheme(wechat.themeId).id, wechat.articleStyle.primaryColor);
    this.cleanups.push(() => picker.destroy());

    const cover = body.createDiv({ cls: "qp-section" });
    this.head(cover, "标题封面", "笔记里没有图片时，发布会自动生成这样一张封面。");
    const card = cover.createDiv({ cls: "qp-card" });
    const title = new Setting(card).setName("试试你的标题").setDesc("只用于预览，不会保存。");
    let editor: CoverEditor | null = null;
    title.addText((text) => text.setValue(this.sampleTitle).onChange((value) => { this.sampleTitle = value; editor?.sync(); }));
    editor = new CoverEditor(card, {
      title: () => this.sampleTitle,
      style: () => wechat.cover,
      update: (style) => { wechat.cover = style; void this.plugin.saveSettings(); },
    });
    this.cleanups.push(() => editor?.destroy());
  }

  // ---------- 关于 ----------

  private renderAbout(body: HTMLElement): void {
    const about = body.createDiv({ cls: "qp-about" });

    const hero = about.createDiv({ cls: "qp-hero" });
    const release = hero.createDiv({ cls: "qp-release" });
    release.createSpan({ cls: "qp-label", text: "当前版本" });
    release.createSpan({ cls: "qp-version", text: `v${this.plugin.manifest.version}` });
    const actions = hero.createDiv({ cls: "qp-hero-actions" });
    for (const [label, icon, href] of [
      ["更新日志", "history", "https://github.com/joeseesun/qiaomu-publish/releases"],
      ["反馈问题", "bug", "https://github.com/joeseesun/qiaomu-publish/issues/new"],
      ["使用说明", "book-open", "https://github.com/joeseesun/qiaomu-publish#readme"],
    ] as const) {
      const link = actions.createEl("a", { cls: "qp-action", href, attr: EXTERNAL });
      setIcon(link.createSpan({ attr: { "aria-hidden": "true" } }), icon);
      link.createSpan({ text: label });
    }

    const support = about.createDiv({ cls: "qp-support" });
    const qr = (icon: string, label: string, hint: string, src: string, alt: string) => {
      const card = support.createEl("figure", { cls: "qp-qr" });
      card.createDiv({ cls: "qp-qr-image" }).createEl("img", { attr: { src, alt, loading: "lazy", width: "148", height: "148" } });
      const caption = card.createEl("figcaption");
      const name = caption.createDiv({ cls: "qp-qr-title" });
      setIcon(name.createSpan({ attr: { "aria-hidden": "true" } }), icon);
      name.createSpan({ text: label });
      caption.createDiv({ cls: "qp-qr-hint", text: hint });
    };
    qr("newspaper", "关注公众号", "微信搜索「向阳乔木推荐看」", "https://radio.qiaomu.ai/assets/qiaomu_wechat_public_account_qr.jpg", "向阳乔木推荐看公众号二维码");
    qr("coffee", "请我喝杯咖啡", "微信扫码，支持持续更新", "https://radio.qiaomu.ai/assets/qiaomu_reward_qr.png", "向阳乔木打赏二维码");

    const footer = about.createDiv({ cls: "qp-footer" });
    const links = footer.createDiv({ cls: "qp-links" });
    for (const [label, href] of [["qiaomu.ai", "https://qiaomu.ai/"], ["博客", "https://blog.qiaomu.ai/"], ["X", "https://x.com/vista8"], ["GitHub", "https://github.com/joeseesun"], ["邮箱", "mailto:vista8@gmail.com"]] as const) {
      links.createEl("a", { text: label, href, attr: EXTERNAL });
    }
    footer.createEl("p", { text: "只有你主动发送草稿时，正文与图片才会发给你选择的连接。AppSecret 和 Bridge 令牌保存在本机 SecretStorage，不写入同步的插件数据；乔木共享接入码随插件公开，不是私密凭据。" });
    footer.createEl("p", { text: "© 向阳乔木 · MIT 许可 · 第三方许可见 GitHub 的 THIRD_PARTY_NOTICES.md" });
  }
}
