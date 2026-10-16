import { type App, Modal, Notice, Setting } from "obsidian";
import type QiaomuPublishPlugin from "./main";
import { WechatDirectClient } from "./direct-client";
import { WechatRelayClient, knownRelayEgressIps, relayEgressIps } from "./relay-client";
import { QIAOMU_RELAY_CODE, QIAOMU_RELAY_URL } from "./defaults";
import { connectionSecretId, isSecretId, optionalSecret } from "./secret-storage";
import type { WechatConnection } from "./types";

type Mode = "relay" | "direct";

/** Adds or edits one official account. Several can coexist; the secret never leaves SecretStorage. */
export class ConnectionModal extends Modal {
  private readonly draft: { name: string; mode: Mode; appId: string; appSecret: string; relayUrl: string };
  private status!: HTMLElement;
  private primary!: HTMLButtonElement;
  private forceSave!: HTMLButtonElement;
  private ips!: HTMLElement;
  private relayBox!: HTMLElement;
  private busy = false;
  private pendingDelete = false;
  private closed = false;

  constructor(app: App, private readonly plugin: QiaomuPublishPlugin, private readonly existing: WechatConnection | null, private readonly onDone: () => void) {
    super(app);
    this.draft = {
      name: existing?.name ?? "",
      mode: existing?.mode ?? "relay",
      appId: existing?.appId ?? "",
      appSecret: existing ? this.app.secretStorage.getSecret(existing.appSecretId) ?? "" : "",
      relayUrl: existing?.relayUrl || QIAOMU_RELAY_URL,
    };
  }

  override onOpen(): void {
    this.modalEl.addClass("qp-modal");
    this.setTitle(this.existing ? "编辑公众号" : "添加公众号");
    const { contentEl } = this;
    const form = contentEl.createDiv({ cls: "qp-modal-form" });
    form.createEl("p", { cls: "qp-hint", text: "AppID 和 AppSecret 在公众号后台「设置与开发 → 基本配置」获取。AppSecret 只保存在本机 SecretStorage，不写入同步的插件数据。" });
    form.createEl("a", { cls: "qp-link", text: "打开公众号后台", href: "https://mp.weixin.qq.com/", attr: { target: "_blank", rel: "noopener noreferrer" } });

    new Setting(form).setName("名称").setDesc("可选，只用来在多个公众号之间区分；留空会自动命名。")
      .addText((text) => text.setPlaceholder("例如：乔木的公众号").setValue(this.draft.name).onChange((value) => { this.draft.name = value.trim(); }));
    new Setting(form).setName("连接方式").setDesc("中转由乔木服务器代为访问微信，IP 固定；直连使用本机网络，需要本机出口 IP 在白名单内。")
      .addDropdown((dropdown) => dropdown.addOption("relay", "固定 IP 中转（推荐）").addOption("direct", "当前设备直连").setValue(this.draft.mode)
        .onChange((value) => { this.draft.mode = value as Mode; this.relayBox.toggleClass("is-hidden", this.draft.mode !== "relay"); }));
    new Setting(form).setName("AppID").addText((text) => text.setPlaceholder("wx 开头").setValue(this.draft.appId).onChange((value) => { this.draft.appId = value.trim(); }));
    const secret = new Setting(form).setName("AppSecret");
    secret.addText((text) => {
      text.inputEl.type = "password";
      text.setValue(this.draft.appSecret).onChange((value) => { this.draft.appSecret = value.trim(); });
      secret.addButton((button) => button.setButtonText("显示").onClick(() => {
        const hidden = text.inputEl.type === "password";
        text.inputEl.type = hidden ? "text" : "password";
        button.setButtonText(hidden ? "隐藏" : "显示");
      }));
    });

    this.relayBox = form.createDiv({ cls: "qp-callout" });
    this.relayBox.toggleClass("is-hidden", this.draft.mode !== "relay");
    this.ips = this.relayBox.createDiv({ cls: "qp-ips" });
    this.showIps(knownRelayEgressIps(this.draft.relayUrl));
    const tools = this.relayBox.createDiv({ cls: "qp-callout-actions" });
    const refresh = tools.createEl("button", { text: "刷新白名单 IP", attr: { type: "button" } });
    refresh.addEventListener("click", () => void (async () => {
      refresh.disabled = true;
      try { this.showIps(await relayEgressIps(this.draft.relayUrl)); }
      catch (error) { this.ips.setText(`读取失败：${error instanceof Error ? error.message : String(error)}`); }
      finally { refresh.disabled = false; }
    })());
    const advanced = this.relayBox.createEl("details", { cls: "qp-advanced" });
    advanced.createEl("summary", { text: "高级：中转地址" });
    new Setting(advanced).setName("中转地址").setDesc("必须使用 HTTPS；仅本机调试允许 localhost。")
      .addText((text) => text.setPlaceholder("https://").setValue(this.draft.relayUrl).onChange((value) => { this.draft.relayUrl = value.trim(); this.showIps(knownRelayEgressIps(this.draft.relayUrl)); }));

    this.status = contentEl.createDiv({ cls: "qp-status", attr: { role: "status" } });
    const footer = contentEl.createDiv({ cls: "qp-modal-footer" });
    if (this.existing) {
      const remove = footer.createEl("button", { cls: "qp-danger", text: "移除", attr: { type: "button" } });
      remove.addEventListener("click", () => void this.remove(remove));
    }
    footer.createDiv({ cls: "qp-spacer" });
    footer.createEl("button", { text: "取消", attr: { type: "button" } }).addEventListener("click", () => this.close());
    this.forceSave = footer.createEl("button", { text: "仍然保存", attr: { type: "button" } });
    this.forceSave.hidden = true;
    this.forceSave.addEventListener("click", () => void this.save(false));
    this.primary = footer.createEl("button", { cls: "mod-cta", text: "测试并保存", attr: { type: "button" } });
    this.primary.addEventListener("click", () => void this.save(true));
  }

  override onClose(): void { this.closed = true; this.contentEl.empty(); }

  private showIps(ips: string[]): void {
    this.ips.empty();
    this.ips.createSpan({ text: `请在公众号后台「API IP 白名单」加入：${ips.join("、") || "中转暂未配置固定出口 IP"}` });
    if (!ips.length) return;
    const copy = this.ips.createEl("button", { cls: "qp-link-button", text: "复制", attr: { type: "button" } });
    copy.addEventListener("click", () => void navigator.clipboard.writeText(ips.join("\n")).then(() => this.status.setText("已复制白名单 IP")).catch(() => this.status.setText(`复制失败，请手动复制：${ips.join("、")}`)));
  }

  private setBusy(busy: boolean, message = ""): void {
    this.busy = busy;
    this.primary.disabled = busy;
    this.forceSave.disabled = busy;
    this.status.setText(message);
    this.contentEl?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((input) => { input.disabled = busy; });
  }

  private async test(): Promise<void> {
    const { mode, appId, appSecret, relayUrl } = this.draft;
    const account = { id: this.existing?.id ?? "new", name: this.draft.name || "新公众号" };
    if (mode === "direct") await new WechatDirectClient(account, appId, appSecret).testConnection();
    else await new WechatRelayClient(account, appId, appSecret, optionalSecret(this.app, this.existing?.inviteSecretId) || QIAOMU_RELAY_CODE, relayUrl).testConnection();
  }

  private async save(test: boolean): Promise<void> {
    if (this.busy) return;
    if (!this.draft.appId || !this.draft.appSecret) { this.status.setText("请填写 AppID 和 AppSecret"); return; }
    this.setBusy(true, test ? "正在检查连接…" : "正在保存…");
    try {
      if (test) await this.test();
      if (this.closed) return;
      const wechat = this.plugin.settings.wechat;
      const previous = JSON.parse(JSON.stringify({ connections: wechat.connections, defaultAccountId: wechat.defaultAccountId })) as { connections: WechatConnection[]; defaultAccountId: string };
      const id = this.existing?.id ?? `${this.draft.mode}:${crypto.randomUUID()}`;
      const appSecretId = this.existing && isSecretId(this.existing.appSecretId) ? this.existing.appSecretId : connectionSecretId(id);
      const previousSecret = this.app.secretStorage.getSecret(appSecretId) ?? "";
      const connection: WechatConnection = {
        id, appSecretId, mode: this.draft.mode, appId: this.draft.appId,
        name: this.draft.name || `我的公众号 ${this.draft.appId.slice(-4)}`,
        relayUrl: this.draft.mode === "relay" ? this.draft.relayUrl : undefined,
        inviteSecretId: this.existing?.inviteSecretId,
      };
      this.app.secretStorage.setSecret(appSecretId, this.draft.appSecret);
      const index = wechat.connections.findIndex((item) => item.id === id);
      if (index >= 0) wechat.connections[index] = connection; else wechat.connections.push(connection);
      if (!wechat.defaultAccountId) wechat.defaultAccountId = id;
      try { await this.plugin.saveSettings(); }
      catch (error) {
        wechat.connections = previous.connections;
        wechat.defaultAccountId = previous.defaultAccountId;
        this.app.secretStorage.setSecret(appSecretId, previousSecret);
        throw error;
      }
      new Notice(`已保存「${connection.name}」`);
      this.onDone();
      this.close();
    } catch (error) {
      this.setBusy(false, `${test ? "连接失败" : "保存失败"}：${error instanceof Error ? error.message : String(error)}`);
      if (test) this.forceSave.hidden = false;
    }
  }

  private async remove(button: HTMLButtonElement): Promise<void> {
    if (!this.existing || this.busy) return;
    if (!this.pendingDelete) { this.pendingDelete = true; button.setText("确认移除"); this.status.setText("再点一次确认移除；对应的 AppSecret 也会从本机删除。"); return; }
    const wechat = this.plugin.settings.wechat;
    const previous = { connections: [...wechat.connections], defaultAccountId: wechat.defaultAccountId };
    this.setBusy(true, "正在移除…");
    button.disabled = true;
    const secretIds = [this.existing.appSecretId, this.existing.inviteSecretId].filter(isSecretId);
    const secrets = secretIds.map((id) => [id, this.app.secretStorage.getSecret(id) ?? ""] as const);
    try {
    wechat.connections = wechat.connections.filter((item) => item.id !== this.existing!.id);
    if (wechat.defaultAccountId === this.existing.id) wechat.defaultAccountId = wechat.connections[0]?.id ?? "";
    for (const [id] of secrets) {
      if (!wechat.connections.some((item) => item.appSecretId === id || item.inviteSecretId === id) && wechat.secretId !== id) this.app.secretStorage.setSecret(id, "");
    }
    await this.plugin.saveSettings();
    this.onDone();
    this.close();
    } catch (error) {
      wechat.connections = previous.connections;
      wechat.defaultAccountId = previous.defaultAccountId;
      for (const [id, value] of secrets) this.app.secretStorage.setSecret(id, value);
      this.setBusy(false, `移除失败：${error instanceof Error ? error.message : String(error)}`);
      button.disabled = false;
    }
  }
}
