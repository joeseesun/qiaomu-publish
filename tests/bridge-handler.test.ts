import { describe, expect, it, vi } from "vitest";
import { BridgeHandler, type BridgeRequest } from "../src/bridge/handler";
import { BRIDGE_VERSION, landingUrl, type BridgeJob } from "../src/bridge/protocol";

const job: BridgeJob = { v: BRIDGE_VERSION, id: "job-1", target: "x", title: "T", noteName: "note", content: { markdown: "# hi" }, assets: [{ id: "img0", name: "a.png", mime: "image/png", bytes: 3 }] };

function make() {
  const hooks = { onFetched: vi.fn(), onStatus: vi.fn() };
  const handler = new BridgeHandler({
    job, token: "one-time", session: "session-token", port: () => 4321, hooks,
    readAsset: async (id) => id === "img0" ? { data: new Uint8Array([1, 2, 3]).buffer, mime: "image/png" } : null,
  });
  return { handler, hooks };
}

const ask = (overrides: Partial<BridgeRequest> & { auth?: string } = {}): BridgeRequest => ({
  method: "GET", path: "/v1/job", body: "",
  headers: { host: "127.0.0.1:4321", origin: "chrome-extension://abc", authorization: `Bearer ${overrides.auth ?? "one-time"}` },
  ...overrides,
});

describe("bridge handler", () => {
  it("hands the job out once and then requires the session token", async () => {
    const { handler, hooks } = make();
    const first = await handler.handle(ask());
    expect(first.status).toBe(200);
    expect(JSON.parse(first.body as string)).toMatchObject({ session: "session-token", job: { id: "job-1" } });
    expect(hooks.onFetched).toHaveBeenCalledOnce();
    expect((await handler.handle(ask())).status).toBe(410);
    expect((await handler.handle(ask({ path: "/v1/asset/img0" }))).status).toBe(401);
    const asset = await handler.handle(ask({ path: "/v1/asset/img0", auth: "session-token" }));
    expect(asset.status).toBe(200);
    expect(Array.from(asset.body as Uint8Array)).toEqual([1, 2, 3]);
    expect((await handler.handle(ask({ path: "/v1/asset/missing", auth: "session-token" }))).status).toBe(404);
  });

  it("refuses a wrong token, an ordinary web page and a rebinding host", async () => {
    const { handler, hooks } = make();
    expect((await handler.handle(ask({ auth: "guess" }))).status).toBe(401);
    expect((await handler.handle({ ...ask(), headers: { host: "127.0.0.1:4321", origin: "https://x.com", authorization: "Bearer one-time" } })).status).toBe(403);
    expect((await handler.handle({ ...ask(), headers: { host: "evil.example:4321", authorization: "Bearer one-time" } })).status).toBe(403);
    expect((await handler.handle({ ...ask(), headers: { host: "127.0.0.1:9999", authorization: "Bearer one-time" } })).status).toBe(403);
    expect(hooks.onFetched).not.toHaveBeenCalled();
  });

  it("never returns CORS headers, so a page cannot read a reply", async () => {
    const { handler } = make();
    const reply = await handler.handle(ask());
    expect(Object.keys(reply.headers).some((name) => name.toLowerCase().startsWith("access-control"))).toBe(false);
  });

  it("records status and tells the extension when to stop", async () => {
    const { handler, hooks } = make();
    await handler.handle(ask());
    const post = (state: string) => handler.handle(ask({ method: "POST", path: "/v1/status", auth: "session-token", body: JSON.stringify({ state, text: "x" }) }));
    expect(JSON.parse((await post("running")).body as string)).toEqual({ ok: true, cancel: false });
    handler.requestCancel();
    expect(JSON.parse((await post("running")).body as string).cancel).toBe(true);
    expect((await handler.handle(ask({ method: "POST", path: "/v1/status", auth: "session-token", body: "{" }))).status).toBe(400);
    expect((await post("weird")).status).toBe(400);
    await post("done");
    expect(handler.isFinished).toBe(true);
    expect(hooks.onStatus).toHaveBeenCalledTimes(3);
  });

  it("puts only the port and token in the fragment", () => {
    expect(landingUrl("zhihu", 4321, "abc")).toBe("https://zhuanlan.zhihu.com/write#qp=4321.abc");
  });
});
