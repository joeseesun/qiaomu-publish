// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { setRequestUrlHandler } from "./obsidian-stub";
import { WechatDirectClient } from "../src/direct-client";
import { WechatTransportRouter } from "../src/transport-router";
import { WechatRelayClient } from "../src/relay-client";
import type { WechatPublishSettings } from "../src/types";

afterEach(() => setRequestUrlHandler(async () => { throw new Error("unexpected request"); }));

describe("WeChat direct transport", () => {
  it("refreshes an expired token once and retries the same read-only request", async () => {
    const urls: string[] = [];
    setRequestUrlHandler(async (options) => {
      const url = String(options.url);
      urls.push(url);
      if (url.endsWith("/stable_token")) return { status: 200, json: { access_token: urls.filter((item) => item.endsWith("/stable_token")).length === 1 ? "old" : "new", expires_in: 7200 } };
      if (url.includes("get_api_domain_ip") && url.includes("old")) return { status: 200, json: { errcode: 40001 } };
      return { status: 200, json: { ip_list: ["1.2.3.4"] } };
    });
    await new WechatDirectClient({ id: "direct:1", name: "测试号" }, "wx-test", "secret-value").testConnection();
    expect(urls.filter((url) => url.endsWith("/stable_token"))).toHaveLength(2);
    expect(urls.filter((url) => url.includes("get_api_domain_ip"))).toHaveLength(2);
    expect(urls.join(" ")).not.toContain("secret-value");
  });

  it("explains the IP whitelist error without recommending an open whitelist", async () => {
    setRequestUrlHandler(async (options) => String(options.url).endsWith("/stable_token")
      ? { status: 200, json: { access_token: "token", expires_in: 7200 } }
      : { status: 200, json: { errcode: 40164, errmsg: "invalid ip 11.22.33.44" } });
    await expect(new WechatDirectClient({ id: "direct:1", name: "测试号" }, "wx-test", "secret").testConnection())
      .rejects.toThrow("11.22.33.44");
  });

  it("rejects body images that cannot be uploaded through the direct transport", async () => {
    const client = new WechatDirectClient({ id: "direct:1", name: "测试号" }, "wx-test", "secret");
    for (const src of ["http://example.com/pic.jpg", "data:image/png;base64,AAAA"]) {
      await expect(client.createDraft({ account_id: "direct:1", title: "测试", content_html: `<img src="${src}">`, thumb_media_id: "cover", publish_now: false }))
        .rejects.toThrow("正文图片必须使用公网 HTTPS");
    }
  });

  it("checks and updates the recorded draft without calling draft/add", async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    setRequestUrlHandler(async (options) => {
      const url = String(options.url);
      calls.push({ url, body: typeof options.body === "string" ? options.body : undefined });
      if (url.endsWith("/stable_token")) return { status: 200, json: { access_token: "token", expires_in: 7200 } };
      if (url.includes("/draft/get")) return { status: 200, json: { news_item: [{ title: "旧标题" }] } };
      if (url.includes("/draft/update")) return { status: 200, json: { errcode: 0 } };
      throw new Error("unexpected request");
    });
    const client = new WechatDirectClient({ id: "direct:1", name: "测试号" }, "wx-test", "secret");
    expect(await client.getDraft("direct:1", "draft-1")).toEqual({ title: "旧标题" });
    expect((await client.updateDraft("draft-1", { account_id: "direct:1", title: "新标题", content_html: "<p>正文</p>", thumb_media_id: "cover", publish_now: false })).media_id).toBe("draft-1");
    expect(calls.some(({ url }) => url.includes("/draft/add"))).toBe(false);
    const update = calls.find(({ url }) => url.includes("/draft/update"));
    expect(JSON.parse(update?.body ?? "{}")).toMatchObject({ media_id: "draft-1", index: 0, articles: { title: "新标题" } });
  });
});

describe("mixed account routing", () => {
  it("keeps existing Bridge accounts while adding a separately keyed direct account", async () => {
    setRequestUrlHandler(async (options) => {
      if (String(options.url).endsWith("/v1/accounts")) return { status: 200, json: { accounts: [{ id: "old", name: "原有账号" }] } };
      throw new Error("unexpected request");
    });
    const settings: WechatPublishSettings = { bridgeUrl: "https://bridge.example.com", secretId: "bridge-token", defaultAccountId: "old", themeId: "qiaomu-podcast", author: "", openComment: true, recordInNote: true, connections: [{ id: "direct:new", name: "新账号", mode: "direct", appId: "wx-new", appSecretId: "new-secret" }] };
    const app = { secretStorage: { getSecret: (id: string) => ({ "bridge-token": "bridge-key", "new-secret": "app-secret" })[id] ?? "" } } as never;
    const router = new WechatTransportRouter(app, settings);
    expect(await router.listAccounts()).toEqual([{ id: "old", name: "原有账号" }, { id: "direct:new", name: "新账号" }]);
    expect(router.errors).toEqual([]);
  });
});

describe("invited relay", () => {
  it("shows the fixed egress IP before checking WeChat and updates a known draft", async () => {
    const paths: string[] = [];
    let egressHeaders: unknown;
    setRequestUrlHandler(async (options) => {
      const url = String(options.url);
      paths.push(new URL(url).pathname);
      if (url.endsWith("/v2/egress-ip")) { egressHeaders = options.headers; return { status: 200, json: { ips: ["8.8.8.8"] } }; }
      if (url.endsWith("/v2/wechat/check")) return { status: 200, json: { ok: true } };
      if (url.endsWith("/v2/wechat/draft/get")) return { status: 200, json: { title: "旧标题" } };
      if (url.endsWith("/v2/wechat/draft")) return { status: 200, json: { media_id: "draft-1" } };
      throw new Error("unexpected request");
    });
    const client = new WechatRelayClient({ id: "relay:1", name: "我的号" }, "wx-test", "app-secret", "invite", "https://relay.example.com");
    expect(await client.getEgressIps()).toEqual(["8.8.8.8"]);
    expect(paths).toEqual(["/v2/egress-ip"]);
    expect(egressHeaders).toBeUndefined();
    expect(await client.testConnection()).toEqual(["8.8.8.8"]);
    expect(await client.getDraft("relay:1", "draft-1")).toEqual({ title: "旧标题" });
    expect((await client.updateDraft("draft-1", { account_id: "relay:1", title: "新标题", content_html: "<p>正文</p>", thumb_media_id: "cover", publish_now: false })).media_id).toBe("draft-1");
    expect(paths).not.toContain("/cgi-bin/freepublish/submit");
  });
});
