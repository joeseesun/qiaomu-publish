// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { setRequestUrlHandler } from "./obsidian-stub";
import { publicIpv4, queryDirectPublicIp, WechatIpWhitelistError } from "../src/direct-ip";
import { WechatDirectClient } from "../src/direct-client";

afterEach(() => { vi.useRealTimers(); setRequestUrlHandler(async () => { throw new Error("unexpected request"); }); });

describe("direct public IP lookup", () => {
  it("makes only a credential-free HTTPS IPv4 lookup", async () => {
    const calls: unknown[] = [];
    setRequestUrlHandler(async (options) => { calls.push(options); return { status: 200, json: { ip: " 8.8.4.4 " } }; });
    expect(await queryDirectPublicIp()).toBe("8.8.4.4");
    expect(calls).toEqual([{ url: "https://api.ipify.org?format=json", method: "GET", throw: false }]);
  });

  it.each(["192.168.1.1", "10.0.0.1", "172.16.0.1", "127.0.0.1", "169.254.0.1", "100.64.0.1", "198.18.0.1", "203.0.113.1", "255.255.255.255", "999.1.2.3", "<b>8.8.8.8</b>", "::1", null])("does not present %s as a public whitelist address", (ip) => {
    expect(publicIpv4(ip)).toBeNull();
  });

  it.each([{ status: 503, json: {} }, { status: 200, json: { ip: "192.168.1.1" } }, { status: 200, json: {} }])("rejects unavailable or invalid lookup responses", async (response) => {
    setRequestUrlHandler(async () => response);
    await expect(queryDirectPublicIp()).rejects.toThrow();
  });

  it("times out and ignores a late network response", async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    setRequestUrlHandler(() => new Promise((done) => { resolve = done; }));
    const outcome = expect(queryDirectPublicIp()).rejects.toThrow("查询超时");
    await vi.advanceTimersByTimeAsync(10_000);
    await outcome;
    resolve({ status: 200, json: { ip: "8.8.8.8" } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("exposes WeChat's observed source IP without exposing credentials or the full server response", async () => {
    setRequestUrlHandler(async () => ({ status: 200, json: { errcode: 40164, errmsg: "invalid ip 11.22.33.44 ipv6 ::ffff:11.22.33.44, not in whitelist secret-value" } }));
    try {
      await new WechatDirectClient({ id: "test", name: "Test" }, "wx-test", "secret-value").testConnection();
      throw new Error("expected a whitelist rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(WechatIpWhitelistError);
      expect((error as WechatIpWhitelistError).ip).toBe("11.22.33.44");
      expect((error as Error).message).not.toContain("secret-value");
    }
  });
});
