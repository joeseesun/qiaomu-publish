import { requestUrl } from "obsidian";

/** IPv4 only: this lookup deliberately uses ipify's IPv4 endpoint. */
export function publicIpv4(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value.trim())) return null;
  const ip = value.trim();
  const octets = ip.split(".").map(Number);
  if (octets.some((part) => part > 255)) return null;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a! >= 224 ||
    (a === 100 && b! >= 64 && b! <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)) return null;
  return octets.join(".");
}

export class WechatIpWhitelistError extends Error {
  constructor(readonly ip: string | null) {
    super(ip ? `微信拒绝当前出口 IP ${ip}。请在公众号后台把该 IP 加入 API 白名单。` : "微信拒绝当前出口 IP。请在公众号后台查看 API 白名单，并确认当前网络的出口 IP。");
    this.name = "WechatIpWhitelistError";
  }
}

/** Optional, credential-free lookup. WeChat's own 40164 response takes precedence. */
export async function queryDirectPublicIp(): Promise<string> {
  let timeout: number | undefined;
  try {
    const response = await Promise.race([
      requestUrl({ url: "https://api.ipify.org?format=json", method: "GET", throw: false }),
      new Promise<never>((_, reject) => { timeout = window.setTimeout(() => reject(new Error("查询超时，请重试或直接测试公众号连接。")), 10_000); }),
    ]);
    if (response.status !== 200) throw new Error("公网 IP 查询暂不可用，请重试或直接测试公众号连接。");
    const payload: unknown = response.json;
    const ip = publicIpv4(payload && typeof payload === "object" && "ip" in payload ? payload.ip : null);
    if (!ip) throw new Error("查询未返回有效公网 IPv4，请直接测试公众号连接，以微信提示为准。");
    return ip;
  } finally { if (timeout !== undefined) window.clearTimeout(timeout); }
}
