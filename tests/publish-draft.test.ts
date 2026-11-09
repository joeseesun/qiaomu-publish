// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishDraft, type DraftMeta } from "../src/publisher";
import type { WechatTransport } from "../src/transport";
import type { WechatDraftRequest } from "../src/bridge-client";

afterEach(() => vi.restoreAllMocks());

describe("text-only note publishing", () => {
  it("generates and uploads a title cover before creating a draft", async () => {
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      if (tagName !== "canvas") return originalCreate(tagName, options);
      return {
        width: 0, height: 0,
        getContext: () => ({ fillStyle: "", font: "", textBaseline: "", textAlign: "", globalAlpha: 1, fillRect: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }), measureText: (text: string) => ({ width: text.length * 32 }), fillText: () => {} }),
        toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(["jpeg-image"], { type: "image/jpeg" })),
      } as unknown as HTMLCanvasElement;
    });
    const uploads: Array<{ kind: string; byteLength: number }> = [];
    let draftBody: WechatDraftRequest | undefined;
    const client: WechatTransport = {
      listAccounts: async () => [{ id: "relay:1", name: "我的号" }],
      uploadImage: async (_accountId, kind, _fileName, _contentType, data) => {
        uploads.push({ kind, byteLength: data.byteLength });
        return { media_id: "cover-1" };
      },
      createDraft: async (body) => { draftBody = body; return { media_id: "draft-1", account: { id: "relay:1", name: "我的号" } }; },
      getDraft: async () => ({ title: "" }),
      updateDraft: async () => { throw new Error("unexpected update"); },
    };
    const meta: DraftMeta = { accountId: "relay:1", title: "没有配图的笔记", author: "", digest: "", sourceUrl: "", cover: "", coverText: "", openComment: true };
    const result = await publishDraft({
      app: {} as never,
      client,
      note: { title: meta.title, html: "<p>正文</p>", images: [], warnings: [], frontmatter: {}, dispose: () => {} },
      file: { path: "文章.md" } as never,
      wechatHtml: "<p>正文</p>",
      meta,
    });
    expect(uploads).toEqual([{ kind: "cover", byteLength: 10 }]);
    expect(draftBody).toMatchObject({ title: meta.title, thumb_media_id: "cover-1", publish_now: false });
    expect(result.mediaId).toBe("draft-1");
  });
});

describe("chosen cover share crop", () => {
  it.each(["create", "update"])("passes the uploaded cover's square coordinates to %s", async (action) => {
    const captured: Array<{ action: string; body: WechatDraftRequest }> = [];
    const client: WechatTransport = {
      listAccounts: async () => [{ id: "relay:1", name: "测试" }],
      uploadImage: async () => ({ media_id: "chosen-cover" }),
      createDraft: async (body) => { captured.push({ action: "create", body }); return { media_id: "draft-1", account: { id: "relay:1", name: "测试" } }; },
      updateDraft: async (_id, body) => { captured.push({ action: "update", body }); return { media_id: "draft-1", account: { id: "relay:1", name: "测试" } }; },
      getDraft: async () => ({ title: "" }),
    };
    const meta: DraftMeta = { accountId: "relay:1", title: "测试", author: "", digest: "", sourceUrl: "", cover: "", coverText: "", openComment: true };
    await publishDraft({
      app: {} as never, client, file: { path: "article.md" } as never, meta,
      note: { title: meta.title, html: "<p>正文</p>", images: [], warnings: [], frontmatter: {}, dispose: () => {} },
      wechatHtml: "<p>正文</p>",
      coverImage: { data: new ArrayBuffer(10), mime: "image/jpeg", name: "cover-wechat.jpg", pic_crop_1_1: "0.574444_0_1_1" },
      existingMediaId: action === "update" ? "draft-1" : undefined,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ action, body: { thumb_media_id: "chosen-cover", pic_crop_1_1: "0.574444_0_1_1", publish_now: false } });
  });

  it("does not add a square field to legacy covers without an explicit selection", async () => {
    let captured: WechatDraftRequest | undefined;
    const client: WechatTransport = {
      listAccounts: async () => [], uploadImage: async () => ({ media_id: "chosen-cover" }),
      createDraft: async (body) => { captured = body; return { media_id: "draft-1", account: { id: "relay:1", name: "测试" } }; },
      getDraft: async () => ({ title: "" }), updateDraft: async () => { throw new Error("unexpected update"); },
    };
    const meta: DraftMeta = { accountId: "relay:1", title: "测试", author: "", digest: "", sourceUrl: "", cover: "", coverText: "", openComment: true };
    await publishDraft({
      app: {} as never, client, file: { path: "article.md" } as never, meta,
      note: { title: meta.title, html: "<p>正文</p>", images: [], warnings: [], frontmatter: {}, dispose: () => {} },
      wechatHtml: "<p>正文</p>", coverImage: { data: new ArrayBuffer(10), mime: "image/jpeg", name: "legacy-cover.jpg" },
    });
    expect(captured).not.toHaveProperty("pic_crop_1_1");
  });
});
