// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readArticleImage } from "../src/image-assets";
import { WechatDirectClient } from "../src/direct-client";
import { WechatRelayClient } from "../src/relay-client";
import { WechatBridgeClient } from "../src/bridge-client";
import { prepareRelayImage } from "../src/image-upload";
import { setRequestUrlHandler } from "./obsidian-stub";

const MiB = 1024 * 1024;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setRequestUrlHandler(async () => { throw new Error("unexpected request"); }); });

function mockEncoder() {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" })));
  return close;
}

describe("larger source images", () => {
  it.each([21 * MiB, 50 * MiB])("reads a %s-byte local image unchanged", async size => {
    const data = new ArrayBuffer(size);
    const result = await readArticleImage({ vault: { readBinary: async () => data } } as never, { id: "image", kind: "vault", name: "large.png", file: { name: "large.png" } as never });
    expect(result.data).toBe(data);
  });
  it("rejects files beyond 50 MiB with the new limit", async () => {
    await expect(readArticleImage({ vault: { readBinary: async () => new ArrayBuffer(50 * MiB + 1) } } as never, { id: "image", kind: "vault", name: "large.png", file: { name: "large.png" } as never })).rejects.toThrow("50 MB");
  });
  it.each(["direct", "relay", "bridge"])("compresses a 21 MiB source before %s uploads it", async mode => {
    const close = mockEncoder();
    const bodies: Array<string | ArrayBuffer | undefined> = [];
    setRequestUrlHandler(async options => {
      if (String(options.url).endsWith("/stable_token")) return { status: 200, json: { access_token: "test-token" } };
      bodies.push(options.body as string | ArrayBuffer | undefined);
      expect(String(options.contentType)).toMatch(mode === "direct" ? /^multipart\/form-data/ : /^image\/jpeg$/);
      return { status: 200, json: { url: "https://mmbiz.qpic.cn/test" } };
    });
    const account = { id: "test", name: "test" };
    const client = mode === "direct" ? new WechatDirectClient(account, "appid", "secret") : mode === "relay" ? new WechatRelayClient(account, "appid", "secret", "invite", "https://relay.example") : new WechatBridgeClient("https://bridge.example", "token");
    await expect(client.uploadImage("test", "content", "large.png", "image/png", new ArrayBuffer(21 * MiB))).resolves.toMatchObject({ url: "https://mmbiz.qpic.cn/test" });
    expect(bodies).toHaveLength(1);
    expect((bodies[0] as ArrayBuffer).byteLength).toBeLessThan(MiB);
    expect(close).toHaveBeenCalledOnce();
  });
});


describe("relay upload boundaries", () => {
  it.each([75 * 1024, 76 * 1024, 20 * MiB])("preserves %s-byte uploads without re-encoding", async size => {
    const data = new ArrayBuffer(size);
    expect(await prepareRelayImage("original.png", "image/png", data)).toEqual({ name: "original.png", type: "image/png", data });
  });
  it.each([0, 50 * MiB + 1])("blocks invalid %s-byte uploads before a request", async size => {
    const request = vi.fn(); setRequestUrlHandler(request);
    const client = new WechatRelayClient({ id: "test", name: "test" }, "appid", "secret", "invite", "https://relay.example");
    await expect(client.uploadImage("test", "content", "bad.png", "image/png", new ArrayBuffer(size))).rejects.toThrow("50 MB");
    expect(request).not.toHaveBeenCalled();
  });
  it("does not flatten an oversized animated GIF", async () => {
    const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
    await expect(prepareRelayImage("animated.gif", "image/gif", new ArrayBuffer(20 * MiB + 1))).rejects.toThrow("GIF");
    expect(decode).not.toHaveBeenCalled();
  });
  it("does not upload if compression cannot satisfy the limit", async () => {
    const close = mockEncoder();
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(null));
    await expect(prepareRelayImage("large.bmp", "image/bmp", new ArrayBuffer(21 * MiB))).rejects.toThrow("图片转换后仍超过");
    expect(close).toHaveBeenCalledOnce();
  });
});
