// @vitest-environment happy-dom
import { createRequire } from "node:module";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startBridgeRun } from "../src/bridge/session";
import { BRIDGE_VERSION, type BridgeJob, type BridgeStatus } from "../src/bridge/protocol";

const job: BridgeJob = { v: BRIDGE_VERSION, id: "j", target: "xhs", title: "标题", noteName: "n", content: { text: "正文", cards: ["card1"] }, assets: [{ id: "card1", name: "card-01.png", mime: "image/png", bytes: 4 }] };

function call(port: number, path: string, options: { method?: string; token?: string; origin?: string; body?: string } = {}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host: `127.0.0.1:${port}` };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.origin) headers.origin = options.origin;
    if (options.body) headers["content-type"] = "application/json";
    const request = http.request({ host: "127.0.0.1", port, path, method: options.method ?? "GET", headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: response.headers }));
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

const parseUrl = (url: string) => { const [, port, token] = /#qp=(\d+)\.([0-9a-f]+)$/.exec(url)!; return { port: Number(port), token: token! }; };

describe("bridge session over a real loopback socket", () => {
  beforeEach(() => { (window as unknown as { require: NodeRequire }).require = createRequire(import.meta.url); });
  afterEach(() => { delete (window as unknown as { require?: unknown }).require; });

  it("serves one extension from pickup to done, then stops listening", async () => {
    const seen: BridgeStatus[] = [];
    let opened = "";
    const run = await startBridgeRun({ job, readAsset: async (id) => id === "card1" ? { data: new Uint8Array([9, 8, 7, 6]).buffer, mime: "image/png" } : null, open: (url) => { opened = url; }, onStatus: (status) => seen.push(status) });
    const { port, token } = parseUrl(opened);
    expect(run.url).toBe(opened);
    expect(opened.startsWith("https://creator.xiaohongshu.com/")).toBe(true);

    const page = await call(port, "/v1/job", { token, origin: "https://creator.xiaohongshu.com" });
    expect(page.status).toBe(403);
    const taken = await call(port, "/v1/job", { token, origin: "chrome-extension://abcdef" });
    expect(taken.status).toBe(200);
    expect(taken.headers["access-control-allow-origin"]).toBeUndefined();
    const { session } = JSON.parse(taken.body) as { session: string };
    expect((await call(port, "/v1/job", { token, origin: "chrome-extension://abcdef" })).status).toBe(410);

    const asset = await call(port, "/v1/asset/card1", { token: session, origin: "chrome-extension://abcdef" });
    expect(asset.status).toBe(200);
    const progress = await call(port, "/v1/status", { method: "POST", token: session, origin: "chrome-extension://abcdef", body: JSON.stringify({ state: "running", text: "上传图片 1/1" }) });
    expect(JSON.parse(progress.body)).toEqual({ ok: true, cancel: false });
    run.cancel();
    const afterCancel = await call(port, "/v1/status", { method: "POST", token: session, origin: "chrome-extension://abcdef", body: JSON.stringify({ state: "running" }) });
    expect(JSON.parse(afterCancel.body).cancel).toBe(true);
    await call(port, "/v1/status", { method: "POST", token: session, origin: "chrome-extension://abcdef", body: JSON.stringify({ state: "done", text: "好了", url: "https://creator.xiaohongshu.com/publish/publish" }) });

    expect(await run.done).toMatchObject({ state: "done", text: "好了" });
    expect(seen.map((status) => status.state)).toEqual(["running", "running", "done"]);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await expect(call(port, "/v1/job", { token, origin: "chrome-extension://abcdef" })).rejects.toThrow();
  });

  it("reports a missing extension when nobody picks the job up", async () => {
    const run = await startBridgeRun({ job, readAsset: async () => null, open: () => {}, onStatus: () => {}, pickupTimeoutMs: 80 });
    expect(await run.done).toMatchObject({ state: "error", error: { code: "no-extension" } });
  });
});
