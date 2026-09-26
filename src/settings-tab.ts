import { type App, PluginSettingTab, Setting } from "obsidian";
import type QiaomuPublishPlugin from "./main";
import { WechatDirectClient } from "./direct-client";
import { WechatRelayClient, knownRelayEgressIps, relayEgressIps } from "./relay-client";
import { WechatTransportRouter } from "./transport-router";
import { listWechatThemes } from "./export-html";
import { QIAOMU_RELAY_CODE, QIAOMU_RELAY_URL } from "./defaults";

export class QiaomuPublishSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: QiaomuPublishPlugin) { super(app, plugin); }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("qiaomu-publish-settings");
    this.renderPublishSection(containerEl);
    this.renderAboutSection(containerEl);
  }

  private renderAboutSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "关于" });
    new Setting(containerEl).setName(`当前版本 ${this.plugin.manifest.version}`).setDesc("在 Obsidian 第三方插件中检查并安装更新。");
    for (const [name, label, href] of [
      ["反馈 Bug", "在 GitHub 提交问题", "https://github.com/joeseesun/qiaomu-publish/issues/new"],
      ["使用说明", "打开说明", "https://github.com/joeseesun/qiaomu-publish#readme"],
      ["向阳乔木", "qiaomu.ai", "https://qiaomu.ai/"],
    ] as const) {
      new Setting(containerEl).setName(name).controlEl.createEl("a", { text: label, href, attr: { target: "_blank", rel: "noopener noreferrer" } });
    }
    new Setting(containerEl).setName("隐私").setDesc("只有你主动发送草稿时，正文与图片才会发给你选择的连接。AppSecret 和 Bridge 令牌保存在本机 SecretStorage，不写入同步的插件数据。乔木共享接入码随插件公开，不是私密凭据。");
  }

  private renderPublishSection(containerEl: HTMLElement): void {
    const wechat = this.plugin.settings.wechat;
    containerEl.createEl("h3", { text: "公众号草稿箱" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "连接自己的公众号后可发送到草稿箱；不配置连接也能复制公众号格式。不会直接群发。",
    });
    this.renderWechatConnections(containerEl);
    containerEl.createEl("h4", { text: "自建 Bridge（现有连接）" });
    new Setting(containerEl)
      .setName("Bridge 地址")
      .setDesc("例如 https://bridge.example.com；必须是 https。")
      .addText((text) => text.setPlaceholder("https://").setValue(wechat.bridgeUrl).onChange(async (value) => {
        wechat.bridgeUrl = value.trim();
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName("访问令牌")
      .setDesc("即 Bridge 的 BRIDGE_TOKEN，保存在 Obsidian SecretStorage，不写入 data.json。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.app.secretStorage.getSecret(wechat.secretId) ?? "");
        text.onChange((value) => this.app.secretStorage.setSecret(wechat.secretId, value.trim()));
      });
    const accountSetting = new Setting(containerEl).setName("默认公众号").setDesc(wechat.defaultAccountId ? `当前：${wechat.defaultAccountId}` : "加载连接后选择。");
    accountSetting.addButton((button) => button.setButtonText("加载公众号").onClick(async () => {
      button.setDisabled(true);
      try {
        const router = new WechatTransportRouter(this.app, wechat);
        const accounts = await router.listAccounts();
        if (accounts.length === 0) throw new Error(router.errors.join("；") || "尚未配置可用公众号");
        accountSetting.setDesc(`已加载 ${accounts.length} 个公众号。${router.errors.join("；")}`);
        if (!accounts.some((account) => account.id === wechat.defaultAccountId)) wechat.defaultAccountId = accounts[0]!.id;
        accountSetting.controlEl.querySelector("select")?.remove();
        accountSetting.addDropdown((dropdown) => {
          for (const account of accounts) dropdown.addOption(account.id, account.name);
          dropdown.setValue(wechat.defaultAccountId).onChange(async (value) => {
            wechat.defaultAccountId = value;
            await this.plugin.saveSettings();
          });
        });
        await this.plugin.saveSettings();
      } catch (error) {
        accountSetting.setDesc(`连接失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        button.setDisabled(false);
      }
    }));
    new Setting(containerEl).setName("排版主题").setDesc("与乔木博客的公众号主题一致，发布时可临时切换。").addDropdown((dropdown) => {
      for (const theme of listWechatThemes()) dropdown.addOption(theme.id, theme.name);
      dropdown.setValue(wechat.themeId).onChange(async (value) => {
        wechat.themeId = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName("默认作者").setDesc("笔记属性 author 或 作者 优先。").addText((text) => text.setValue(wechat.author).onChange(async (value) => {
      wechat.author = value.trim();
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName("打开留言").addToggle((toggle) => toggle.setValue(wechat.openComment).onChange(async (value) => {
      wechat.openComment = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl)
      .setName("记录到笔记属性")
      .setDesc("成功后写入 wechat_media_id、wechat_draft_at 和 wechat_account。")
      .addToggle((toggle) => toggle.setValue(wechat.recordInNote).onChange(async (value) => {
        wechat.recordInNote = value;
        await this.plugin.saveSettings();
      }));
  }

  private renderWechatConnections(containerEl: HTMLElement): void {
    const wechat = this.plugin.settings.wechat;
    new Setting(containerEl).setName("添加公众号连接").setDesc("直连需要当前设备出口 IP 在公众号白名单；乔木中转需要把服务器的固定出口 IP 加入白名单。")
      .addButton((button) => button.setButtonText("直连微信").onClick(async () => {
        const id = `direct:${crypto.randomUUID()}`;
        wechat.connections.push({ id, name: "新公众号", mode: "direct", appId: "", appSecretId: `qiaomu-wechat-secret-${id}` });
        wechat.defaultAccountId = id;
        await this.plugin.saveSettings(); this.display();
      }))
      .addButton((button) => button.setButtonText("乔木中转").onClick(async () => {
        const id = `relay:${crypto.randomUUID()}`;
        wechat.connections.push({ id, name: "新公众号", mode: "relay", appId: "", appSecretId: `qiaomu-wechat-secret-${id}`, relayUrl: QIAOMU_RELAY_URL });
        wechat.defaultAccountId = id;
        await this.plugin.saveSettings(); this.display();
      }));
    for (const connection of wechat.connections) {
      const group = containerEl.createDiv({ cls: "qiaomu-wechat-connection" });
      group.createEl("h4", { text: connection.mode === "direct" ? "直连公众号" : "乔木中转公众号" });
      new Setting(group).setName("名称").addText((input) => input.setValue(connection.name).onChange(async (value) => {
        connection.name = value.trim(); await this.plugin.saveSettings();
      }));
      new Setting(group).setName("AppID").addText((input) => input.setValue(connection.appId).onChange(async (value) => {
        connection.appId = value.trim(); await this.plugin.saveSettings();
      }));
      new Setting(group).setName("AppSecret").setDesc("保存在本机 Obsidian SecretStorage，不写入同步的插件数据。")
        .addText((input) => {
          input.inputEl.type = "password";
          input.setValue(this.app.secretStorage.getSecret(connection.appSecretId) ?? "");
          input.onChange((value) => this.app.secretStorage.setSecret(connection.appSecretId, value.trim()));
        });
      if (connection.mode === "relay") {
        new Setting(group).setName("中转地址").setDesc("必须使用 HTTPS；仅本机调试允许 localhost。")
          .addText((input) => input.setPlaceholder("https://").setValue(connection.relayUrl ?? "").onChange(async (value) => {
            connection.relayUrl = value.trim();
            const ips = knownRelayEgressIps(connection.relayUrl);
            status.setDesc(ips.length ? `公众号 API IP 白名单：${ips.join("、")}。测试连接不会创建草稿。` : "测试时会调用微信只读接口，不会创建草稿。");
            await this.plugin.saveSettings();
          }));
      }
      const knownIps = connection.mode === "relay" ? knownRelayEgressIps(connection.relayUrl ?? "") : [];
      const status = new Setting(group).setName("连接状态").setDesc(knownIps.length ? `公众号 API IP 白名单：${knownIps.join("、")}。测试连接不会创建草稿。` : "测试时会调用微信只读接口，不会创建草稿。");
      if (connection.mode === "relay") status.addButton((button) => button.setButtonText("查看白名单 IP").onClick(async () => {
        button.setDisabled(true);
        try {
          const ips = await relayEgressIps(connection.relayUrl ?? "");
          status.setDesc(ips.length ? `在公众号后台把 ${ips.join("、")} 加入 API IP 白名单。` : "中转尚未配置固定出口 IP。");
        } catch (error) { status.setDesc(`读取失败：${error instanceof Error ? error.message : String(error)}`); }
        finally { button.setDisabled(false); }
      }));
      status.addButton((button) => button.setButtonText("测试连接").onClick(async () => {
        button.setDisabled(true);
        try {
          const account = { id: connection.id, name: connection.name };
          const secret = this.app.secretStorage.getSecret(connection.appSecretId) ?? "";
          if (connection.mode === "direct") {
            await new WechatDirectClient(account, connection.appId, secret).testConnection();
            status.setDesc("连接成功。当前设备出口 IP 已获微信接受。");
          } else {
            const ips = await new WechatRelayClient(account, connection.appId, secret, this.app.secretStorage.getSecret(connection.inviteSecretId ?? "") || QIAOMU_RELAY_CODE, connection.relayUrl ?? "").testConnection();
            status.setDesc(ips.length ? `连接成功。微信已接受中转出口 IP ${ips.join("、")}。` : "连接成功，但中转未返回固定出口 IP。");
          }
        } catch (error) { status.setDesc(`连接失败：${error instanceof Error ? error.message : String(error)}`); }
        finally { button.setDisabled(false); }
      }));
      let pendingRemove = false;
      status.addButton((button) => button.setButtonText("移除连接").onClick(async () => {
        if (!pendingRemove) { pendingRemove = true; button.setButtonText("确认移除"); return; }
        wechat.connections = wechat.connections.filter((item) => item.id !== connection.id);
        if (wechat.defaultAccountId === connection.id) wechat.defaultAccountId = "";
        this.app.secretStorage.setSecret(connection.appSecretId, "");
        if (connection.inviteSecretId) this.app.secretStorage.setSecret(connection.inviteSecretId, "");
        await this.plugin.saveSettings(); this.display();
      }));
    }
  }
}
