import { queryDirectPublicIp, WechatIpWhitelistError } from "./direct-ip";

/** Shared by account settings and first-time publishing. Never persists an IP. */
export class DirectIpHelp {
  readonly el: HTMLElement;
  private readonly value: HTMLElement;
  private readonly status: HTMLElement;
  private readonly query: HTMLButtonElement;
  private readonly copy: HTMLButtonElement;
  private generation = 0;
  private active = false;
  private ip: string | null = null;

  constructor(parent: HTMLElement) {
    this.el = parent.createDiv({ cls: "qp-direct-ip is-hidden" });
    this.el.createEl("strong", { text: "当前公网出口 IP" });
    this.value = this.el.createDiv({ cls: "qp-direct-ip-value", text: "尚未查询" });
    const actions = this.el.createDiv({ cls: "qp-direct-ip-actions" });
    this.query = actions.createEl("button", { text: "查询公网 IP", attr: { type: "button" } });
    this.copy = actions.createEl("button", { text: "复制 IP", attr: { type: "button" } });
    this.copy.disabled = true;
    this.status = this.el.createDiv({ cls: "qp-direct-ip-status", attr: { role: "status" } });
    this.el.createEl("p", { text: "将此 IP 加入公众号后台的 API IP 白名单。换网络或切换 VPN 后请重新查询；代理分流时，以微信测试连接返回的 IP 为准。" });
    this.el.createEl("p", { cls: "qp-direct-ip-source", text: "查询使用 ipify，仅查询公网 IPv4，不发送公众号凭据或文章。" });
    this.query.addEventListener("click", () => void this.refresh());
    this.copy.addEventListener("click", () => void this.copyIp());
  }

  setActive(active: boolean): void {
    this.active = active;
    this.generation++;
    this.ip = null;
    this.el.toggleClass("is-hidden", !active);
    this.value.setText("尚未查询");
    this.status.setText("");
    this.query.disabled = false;
    this.query.setText("查询公网 IP");
    this.copy.disabled = true;
  }

  destroy(): void { this.active = false; this.generation++; }

  showWechatError(error: unknown): void {
    if (!(error instanceof WechatIpWhitelistError) || !this.active || !this.el.isConnected) return;
    // Invalidate any in-flight lookup so an approximate result cannot replace WeChat's IP.
    this.generation++;
    this.ip = error.ip;
    this.value.setText(error.ip ?? "微信未返回可识别的公网 IP");
    this.copy.disabled = !this.ip;
    this.query.disabled = false;
    this.query.setText("重新查询");
    this.status.setText("微信拒绝了当前出口 IP。加入白名单后，再次测试连接。");
  }

  private current(generation: number): boolean {
    return this.active && this.el.isConnected && this.generation === generation;
  }

  private async refresh(): Promise<void> {
    if (!this.active || this.query.disabled) return;
    const generation = ++this.generation;
    this.ip = null;
    this.value.setText("正在查询…");
    this.status.setText("");
    this.query.disabled = true;
    this.copy.disabled = true;
    try {
      const ip = await queryDirectPublicIp();
      if (!this.current(generation)) return;
      this.ip = ip;
      this.value.setText(ip);
      this.copy.disabled = false;
      this.status.setText("查询结果供参考；填入白名单后请测试连接。");
    } catch {
      if (!this.current(generation)) return;
      this.value.setText("暂时无法查询");
      this.status.setText("请重试，或填写 AppID、AppSecret 后测试连接；若微信返回白名单错误，这里会显示它识别到的 IP。");
    } finally {
      if (this.current(generation)) { this.query.disabled = false; this.query.setText("重新查询"); }
    }
  }

  private async copyIp(): Promise<void> {
    if (!this.ip || !this.active) return;
    const ip = this.ip;
    const generation = this.generation;
    try {
      await navigator.clipboard.writeText(ip);
      if (this.current(generation)) this.status.setText("已复制 IP，请粘贴到公众号后台的 API IP 白名单。");
    } catch {
      if (this.current(generation)) this.status.setText(`复制失败，请手动复制：${ip}`);
    }
  }
}
