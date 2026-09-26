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
        getContext: () => ({ fillStyle: "", font: "", textBaseline: "", fillRect: () => {}, measureText: (text: string) => ({ width: text.length * 32 }), fillText: () => {} }),
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
    const meta: DraftMeta = { accountId: "relay:1", title: "没有配图的笔记", author: "", digest: "", sourceUrl: "", cover: "", openComment: true };
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
