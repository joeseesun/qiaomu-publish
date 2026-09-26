import { requestUrl, type RequestUrlParam } from "obsidian";
import { normalizeBridgeUrl, type WechatAccount, type WechatDraftRequest, type WechatDraftResult } from "./bridge-client";
import type { WechatTransport } from "./transport";

export async function relayEgressIps(relayUrl: string): Promise<string[]> {
  const baseUrl = normalizeBridgeUrl(relayUrl);
  if (!baseUrl) throw new Error("请填写中转地址");
  const response = await requestUrl({ url: `${baseUrl}/v2/egress-ip`, throw: false });
  if (response.status === 503) throw new Error("乔木中转尚未开放，请稍后再试");
  if (response.status !== 200) throw new Error(`无法读取中转出口 IP（HTTP ${response.status}）`);
  const payload = response.json as { ips?: unknown };
  return Array.isArray(payload?.ips) ? payload.ips.filter((ip): ip is string => typeof ip === "string") : [];
}

/** An invited account uses an allowlisted Qiaomu relay for every WeChat API call. */
export class WechatRelayClient implements WechatTransport {
  private readonly baseUrl: string;
  constructor(private readonly account: WechatAccount, private readonly appId: string, private readonly appSecret: string, private readonly inviteKey: string, relayUrl: string) {
    this.baseUrl = normalizeBridgeUrl(relayUrl);
    if (!this.baseUrl || !appId || !appSecret || !inviteKey) throw new Error("请填写中转地址、AppID、AppSecret 和邀请密钥");
  }

  private async call<T>(path: string, init: Omit<RequestUrlParam, "url"> = {}): Promise<T> {
    const response = await requestUrl({ ...init, url: `${this.baseUrl}${path}`, headers: {
      Authorization: `Bearer ${this.inviteKey}`,
      "X-Qiaomu-Appid": this.appId,
      "X-Qiaomu-Appsecret": this.appSecret,
      ...(init.headers ?? {}),
    }, throw: false });
    const payload = response.json as { error?: string } | null;
    if (response.status < 200 || response.status >= 300) {
      const message = typeof payload?.error === "string" ? payload.error : `中转 HTTP ${response.status}`;
      if (response.status === 401) throw new Error("邀请密钥无效，或此 AppID 未获授权。请核对后重试。");
      if (response.status === 429) throw new Error("今日中转请求额度已用完，请稍后再试。");
      if (/errcode=40164/.test(message)) throw new Error("微信拒绝此中转服务器的出口 IP。请把上方显示的固定公网 IP 加入公众号 API 白名单。");
      if (/errcode=(40013|40125)/.test(message)) throw new Error("公众号 AppID 或 AppSecret 无效，请检查后重试。");
      if (/errcode=48001/.test(message)) throw new Error("此公众号没有调用该微信接口的权限，请在公众号后台检查接口权限。");
      throw new Error(message);
    }
    return payload as T;
  }

  async getEgressIps(): Promise<string[]> {
    return relayEgressIps(this.baseUrl);
  }

  async testConnection(): Promise<string[]> {
    const ips = await this.getEgressIps();
    await this.call("/v2/wechat/check");
    return ips;
  }

  async listAccounts(): Promise<WechatAccount[]> { return [this.account]; }

  async uploadImage(accountId: string, kind: "content" | "cover", fileName: string, contentType: string, data: ArrayBuffer): Promise<{ url?: string; media_id?: string }> {
    if (accountId !== this.account.id) throw new Error("公众号不匹配");
    const query = new URLSearchParams({ kind, filename: fileName });
    return this.call(`/v2/wechat/images?${query}`, { method: "POST", contentType, body: data });
  }

  async createDraft(body: WechatDraftRequest): Promise<WechatDraftResult> {
    if (body.account_id !== this.account.id || body.publish_now !== false) throw new Error("只允许为当前公众号创建草稿");
    const result = await this.call<{ media_id?: string }>("/v2/wechat/draft", { method: "POST", contentType: "application/json", body: JSON.stringify({ ...body, publish_now: false }) });
    if (!result.media_id) throw new Error("中转没有返回草稿 ID");
    return { media_id: result.media_id, account: this.account };
  }

  async getDraft(accountId: string, mediaId: string): Promise<{ title: string }> {
    if (accountId !== this.account.id) throw new Error("公众号不匹配");
    return this.call<{ title: string }>("/v2/wechat/draft/get", { method: "POST", contentType: "application/json", body: JSON.stringify({ media_id: mediaId }) });
  }

  async updateDraft(mediaId: string, body: WechatDraftRequest): Promise<WechatDraftResult> {
    if (body.account_id !== this.account.id || body.publish_now !== false) throw new Error("只允许更新当前公众号的草稿");
    const result = await this.call<{ media_id?: string }>("/v2/wechat/draft", { method: "POST", contentType: "application/json", body: JSON.stringify({ ...body, existing_media_id: mediaId, publish_now: false }) });
    if (result.media_id !== mediaId) throw new Error("中转更新草稿返回了不匹配的 ID");
    return { media_id: mediaId, account: this.account };
  }
}
