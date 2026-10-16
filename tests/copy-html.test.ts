// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { embedWechatImages } from "../src/copy-html";
import { setRequestUrlHandler } from "./obsidian-stub";

describe("standalone image export", () => {
  it("embeds and deduplicates remote images for HTML and canvas exports", async () => {
    let calls = 0;
    setRequestUrlHandler(async () => { calls++; return { status: 200, headers: { "Content-Type": "image/png" }, arrayBuffer: new TextEncoder().encode("image").buffer }; });
    const html = '<img src="https://example.com/image.png"><img src="https://example.com/image.png">';
    const result = await embedWechatImages({} as never, html, [], true);
    expect(result.match(/data:image\/png;base64,/g)).toHaveLength(2);
    expect(calls).toBe(1);
  });
  it("rejects failed remote images instead of silently producing an incomplete export", async () => {
    setRequestUrlHandler(async () => ({ status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0) }));
    await expect(embedWechatImages({} as never, '<img src="https://example.com/missing.png">', [], true)).rejects.toThrow("远程图片无法导出");
  });
  it("keeps regular clipboard copying independent of remote downloads", async () => {
    setRequestUrlHandler(async () => { throw new Error("unexpected request"); });
    expect(await embedWechatImages({} as never, '<img src="https://example.com/image.png">', [])).toContain('src="https://example.com/image.png"');
  });
});
