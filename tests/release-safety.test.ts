// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({
  Modal: class { constructor(public app: unknown) {} close() {} },
  Notice: class {}, Setting: class {}, TFile: class {}, getLinkpath: (path: string) => path,
}));
import { publishDraft, resolveCover, type DraftMeta } from "../src/publisher";
import { ConnectionModal } from "../src/connection-modal";
import { COVER_HEIGHT, drawTitleCover } from "../src/title-cover";
import { normalizeSettings } from "../src/defaults";

describe("release safety", () => {
  it("rejects a missing explicit cover instead of silently selecting the first article image", () => {
    const app = { metadataCache: { getFirstLinkpathDest: () => null } };
    expect(resolveCover(app as never, "note.md", { cover: "missing.png" } as DraftMeta,
      [{ id: "image", kind: "remote", name: "first", url: "https://example.com/first.jpg" }])).toBeNull();
  });

  it("keeps the chosen account and title stable while an upload is pending", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const createDraft = vi.fn(async (_body: Record<string, unknown>) => ({ media_id: "draft" }));
    const client = { uploadImage: vi.fn(async (_account: string) => { await waiting; return { url: "https://mmbiz.qpic.cn/image", media_id: "cover" }; }), createDraft };
    const meta: DraftMeta = { accountId: "account-a", title: "Original", author: "", digest: "", sourceUrl: "", cover: "", coverText: "", openComment: true };
    const pending = publishDraft({ app: {} as never, client: client as never, file: { path: "note.md" } as never, meta, wechatHtml: "<p>Article</p>",
      note: { title: "Original", html: "", warnings: [], frontmatter: {}, dispose() {}, images: [{ id: "image", kind: "generated", name: "image.png", blob: new Blob(["image"], { type: "image/png" }) }] } });
    await vi.waitFor(() => expect(client.uploadImage).toHaveBeenCalledOnce());
    meta.accountId = "account-b"; meta.title = "Changed";
    release(); await pending;
    expect(createDraft.mock.calls[0]?.[0]).toMatchObject({ account_id: "account-a", title: "Original" });
    expect(client.uploadImage.mock.calls.every((call) => call[0] === "account-a")).toBe(true);
  });

  it("retains the account and secret if removing a connection cannot be saved", async () => {
    const connection = { id: "relay:1", name: "Account", mode: "relay", appId: "wx-test", appSecretId: "saved-secret" };
    const settings = normalizeSettings({ wechat: { connections: [connection], defaultAccountId: connection.id } });
    const secrets = new Map([["saved-secret", "test-value"]]);
    const app = { secretStorage: { getSecret: (id: string) => secrets.get(id), setSecret: (id: string, value: string) => { secrets.set(id, value); } } };
    const done = vi.fn();
    const modal = new ConnectionModal(app as never, { settings, saveSettings: async () => { throw new Error("disk full"); } } as never, settings.wechat.connections[0]!, done);
    const internal = modal as unknown as { pendingDelete: boolean; status: { setText: (text: string) => void }; primary: HTMLButtonElement; forceSave: HTMLButtonElement; remove: (button: HTMLButtonElement) => Promise<void> };
    internal.pendingDelete = true;
    internal.status = { setText: vi.fn() };
    internal.primary = document.createElement("button"); internal.forceSave = document.createElement("button");
    await internal.remove(document.createElement("button"));
    expect(settings.wechat.connections).toHaveLength(1);
    expect(settings.wechat.defaultAccountId).toBe(connection.id);
    expect(secrets.get("saved-secret")).toBe("test-value");
    expect(done).not.toHaveBeenCalled();
  });

  it("keeps large cover titles inside the image", () => {
    const ys: number[] = [];
    const context = { font: "", fillRect() {}, measureText(text: string) { return { width: text.length * 80 }; }, fillText(_text: string, _x: number, y: number) { ys.push(y); } };
    drawTitleCover(context as never, "长标题内容".repeat(10), { background: "navy", font: "sans", size: 80 });
    expect(ys.every((y) => y - 40 >= 0 && y + 40 <= COVER_HEIGHT)).toBe(true);
  });
});
