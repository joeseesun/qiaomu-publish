// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { CoverPicker } from "../src/cover/cover-picker";
import { askCrop } from "../src/cover/crop-modal";
import { decodeSource, type CoverSource } from "../src/cover/source";
import { renderCover } from "../src/cover/crop";
import { COVER_SPECS, type CoverSpec } from "../src/cover/spec";
import { wechatSquareCrop } from "../src/cover/share-crop";

vi.mock("obsidian", () => ({ Menu: class {}, Notice: class {}, setIcon: vi.fn() }));
vi.mock("../src/cover/crop-modal", () => ({ askCrop: vi.fn() }));
vi.mock("../src/cover/source", () => ({ decodeSource: vi.fn(), chooseImageFile: vi.fn() }));
vi.mock("../src/cover/crop", async () => ({ ...await vi.importActual<typeof import("../src/cover/crop")>("../src/cover/crop"), renderCover: vi.fn() }));

type ElementOptions = { cls?: string; text?: string; attr?: Record<string, string> };
const source: CoverSource = { data: new ArrayBuffer(1), mime: "image/jpeg", name: "fixture.jpg", origin: "test fixture" };
type PickerActions = { adjust(): Promise<void>; setSource(source: CoverSource, askIfNeeded: boolean): Promise<boolean> };
let picker: CoverPicker;

function installHostDom(): void {
  Object.defineProperties(HTMLElement.prototype, {
    createEl: { configurable: true, value(this: HTMLElement, tag: string, options: ElementOptions = {}) {
      const el = document.createElement(tag);
      if (options.cls) el.className = options.cls;
      if (options.text) el.textContent = options.text;
      for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
      this.append(el);
      return el;
    } },
    createDiv: { configurable: true, value(this: HTMLElement, options?: ElementOptions) { return this.createEl("div", options); } },
    createSpan: { configurable: true, value(this: HTMLElement, options?: ElementOptions) { return this.createEl("span", options); } },
    setCssProps: { configurable: true, value(this: HTMLElement, props: Record<string, string>) { for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value); } },
    addClass: { configurable: true, value(this: HTMLElement, ...classes: string[]) { this.classList.add(...classes); } },
    removeClass: { configurable: true, value(this: HTMLElement, ...classes: string[]) { this.classList.remove(...classes); } },
    empty: { configurable: true, value(this: HTMLElement) { this.replaceChildren(); } },
  });
}
async function make(spec: CoverSpec = COVER_SPECS.wechat): Promise<PickerActions> {
  picker = new CoverPicker(document.body, { app: {} as App, spec, candidates: () => [], initial: async () => source, onDesign: vi.fn(), onChange: vi.fn() });
  await picker.start();
  // Exercise the asynchronous actions directly so the test can await their completed result.
  return picker as unknown as PickerActions;
}

beforeEach(() => {
  document.body.replaceChildren(); installHostDom();
  vi.mocked(askCrop).mockReset();
  vi.mocked(decodeSource).mockImplementation(async () => ({ width: 1600, height: 900, close: vi.fn() }) as unknown as ImageBitmap);
  vi.mocked(renderCover).mockResolvedValue({ data: new ArrayBuffer(2), mime: "image/jpeg", width: 900, height: 383, quality: 0.92 });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { picker?.destroy(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("share-square picker state", () => {
  it("starts centered and carries the chosen position into the next crop dialog", async () => {
    const actions = await make();
    expect((await picker.result())?.pic_crop_1_1).toBe(wechatSquareCrop(0.5, 900, 383));
    vi.mocked(askCrop).mockResolvedValueOnce({ crop: null, sharePosition: 0.9 });
    await actions.adjust();
    expect((await picker.result())?.pic_crop_1_1).toBe(wechatSquareCrop(0.9, 900, 383));
    vi.mocked(askCrop).mockResolvedValueOnce(null);
    await actions.adjust();
    expect(askCrop).toHaveBeenLastCalledWith(expect.anything(), source, COVER_SPECS.wechat, null, 0.9);
    expect((await picker.result())?.pic_crop_1_1).toBe(wechatSquareCrop(0.9, 900, 383));
  });

  it("resets to center on replacement, but a cancelled replacement keeps both previous selections", async () => {
    const actions = await make();
    const crop = { x: 30, y: 20, width: 1500, height: 1500 / COVER_SPECS.wechat.ratio };
    vi.mocked(askCrop).mockResolvedValueOnce({ crop, sharePosition: 0.1 });
    await actions.adjust();
    const previous = await picker.result();
    vi.mocked(askCrop).mockResolvedValueOnce(null);
    expect(await actions.setSource({ ...source, name: "cancelled-replacement.jpg" }, true)).toBe(false);
    expect(await picker.result()).toBe(previous);
    await actions.setSource({ ...source, name: "replacement.jpg" }, false);
    expect((await picker.result())?.pic_crop_1_1).toBe(wechatSquareCrop(0.5, 900, 383));
  });

  it("adopts a new source's selected square along with its wide crop", async () => {
    const actions = await make();
    vi.mocked(askCrop).mockResolvedValueOnce({ crop: null, sharePosition: 1 });
    expect(await actions.setSource({ ...source, name: "replacement.jpg" }, true)).toBe(true);
    expect((await picker.result())?.pic_crop_1_1).toBe(wechatSquareCrop(1, 900, 383));
    expect(renderCover).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ width: expect.any(Number) }), COVER_SPECS.wechat);
  });

  it.each(["x", "zhihu"] as const)("does not add WeChat metadata to %s", async platform => {
    await make(COVER_SPECS[platform]);
    expect(await picker.result()).not.toHaveProperty("pic_crop_1_1");
  });
});
