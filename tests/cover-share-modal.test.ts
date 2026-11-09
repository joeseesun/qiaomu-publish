// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { askCrop } from "../src/cover/crop-modal";
import { decodeSource, type CoverSource } from "../src/cover/source";
import { COVER_SPECS } from "../src/cover/spec";
import type { CropRect } from "../src/cover/crop";

const host = vi.hoisted(() => ({ modals: [] as { contentEl: HTMLElement; close(): void }[] }));
vi.mock("obsidian", () => ({
  Modal: class {
    modalEl = document.createElement("div");
    contentEl = this.modalEl.appendChild(document.createElement("div"));
    constructor(_app: unknown) { host.modals.push(this); }
    setTitle(_title: string): void {}
    onOpen(): void {}
    onClose(): void {}
    open(): void { document.body.append(this.modalEl); this.onOpen(); }
    close(): void { this.onClose(); this.modalEl.remove(); }
  },
}));
vi.mock("../src/cover/source", () => ({ decodeSource: vi.fn() }));

type ElementOptions = { cls?: string; text?: string; attr?: Record<string, string> };
const source: CoverSource = { data: new ArrayBuffer(1), mime: "image/jpeg", name: "fixture.jpg", origin: "test fixture" };
const bitmap = () => ({ width: 1926, height: 817, close: vi.fn() }) as unknown as ImageBitmap;
let draw: ReturnType<typeof vi.fn>;
let currentBitmap: ImageBitmap;

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
    toggleClass: { configurable: true, value(this: HTMLElement, name: string, enabled: boolean) { this.classList.toggle(name, enabled); } },
    setText: { configurable: true, value(this: HTMLElement, text: string) { this.textContent = text; } },
    empty: { configurable: true, value(this: HTMLElement) { this.replaceChildren(); } },
    setPointerCapture: { configurable: true, value: vi.fn() },
    clientWidth: { configurable: true, get(this: HTMLElement) { return this.classList.contains("qiaomu-crop-frame") ? 620 : 0; } },
    clientHeight: { configurable: true, get(this: HTMLElement) { return this.classList.contains("qiaomu-crop-frame") ? 620 / Number(this.style.getPropertyValue("--qiaomu-crop-ratio")) : 0; } },
  });
}

function get<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing control: ${selector}`);
  return el;
}
function button(text: string): HTMLButtonElement {
  const el = [...document.querySelectorAll("button")].find(el => el.textContent === text);
  if (!el) throw new Error(`Missing button: ${text}`);
  return el;
}
function pointer(el: Element, type: string, x: number, id = 1): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: id, clientX: x, clientY: 100 }));
}
function key(el: Element, key: string, shiftKey = false): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, shiftKey }));
}
async function ready(): Promise<void> { await vi.waitFor(() => expect(button("使用这个裁切").disabled).toBe(false)); }
function start(current: CropRect | null = null, sharePosition = 0.5) { return askCrop({} as App, source, COVER_SPECS.wechat, current, sharePosition); }

beforeEach(() => {
  host.modals.length = 0;
  document.body.replaceChildren();
  installHostDom();
  currentBitmap = bitmap();
  vi.mocked(decodeSource).mockResolvedValue(currentBitmap);
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue(undefined);
  draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ clearRect: vi.fn(), drawImage: draw } as unknown as CanvasRenderingContext2D);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  host.modals.forEach(modal => { if (modal.contentEl.isConnected) modal.close(); });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("WeChat independent share-square controls", () => {
  it("drags only the square, clamps at both ends and stops on pointer cancellation", async () => {
    const result = start(); await ready();
    const safe = get(".qiaomu-crop-safe"), frame = get(".qiaomu-crop-frame");
    const image = get<HTMLImageElement>(".qiaomu-crop-image"), originalView = image.style.cssText;
    pointer(safe, "pointerdown", 300);
    pointer(frame, "pointermove", 1000);
    expect(safe.getAttribute("aria-valuenow")).toBe("100");
    expect(get<HTMLInputElement>(".qiaomu-crop-share-position").value).toBe("100");
    expect(image.style.cssText).toBe(originalView);
    pointer(frame, "pointermove", -1000);
    expect(safe.getAttribute("aria-valuenow")).toBe("0");
    pointer(frame, "pointercancel", -1000);
    pointer(frame, "pointermove", 1000);
    expect(safe.getAttribute("aria-valuenow")).toBe("0");
    button("使用这个裁切").click();
    await expect(result).resolves.toEqual({ crop: null, sharePosition: 0 });
  });

  it("ignores a second pointer without interrupting the original drag", async () => {
    const result = start(); await ready();
    const safe = get(".qiaomu-crop-safe"), frame = get(".qiaomu-crop-frame");
    pointer(safe, "pointerdown", 300, 1);
    pointer(safe, "pointerdown", 400, 2);
    pointer(frame, "pointermove", 1000, 2);
    pointer(frame, "pointerup", 1000, 2);
    expect(safe.getAttribute("aria-valuenow")).toBe("50");
    pointer(frame, "pointermove", 1000, 1);
    expect(safe.getAttribute("aria-valuenow")).toBe("100");
    pointer(frame, "pointerup", 1000, 1);
    button("使用这个裁切").click();
    await expect(result).resolves.toEqual({ crop: null, sharePosition: 1 });
  });

  it("supports accessible keyboard and slider adjustments without panning the wide image", async () => {
    const result = start(); await ready();
    const safe = get(".qiaomu-crop-safe"), image = get(".qiaomu-crop-image"), originalView = image.style.cssText;
    expect(safe.getAttribute("role")).toBe("slider");
    key(safe, "End"); expect(safe.getAttribute("aria-valuenow")).toBe("100");
    key(safe, "ArrowLeft", true); expect(safe.getAttribute("aria-valuenow")).toBe("90");
    key(safe, "Home"); key(safe, "ArrowRight"); expect(safe.getAttribute("aria-valuenow")).toBe("1");
    const slider = get<HTMLInputElement>(".qiaomu-crop-share-position");
    slider.value = "75"; slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(safe.getAttribute("aria-valuenow")).toBe("75");
    expect(image.style.cssText).toBe(originalView);
    expect(draw).toHaveBeenCalled();
    const call = draw.mock.calls.at(-1)!;
    expect(Number(call[3])).toBeCloseTo(Number(call[4]), 2);
    button("取消").click(); await expect(result).resolves.toBeNull();
  });

  it("restores both selections when reopened and reset returns them to center", async () => {
    const current = { x: 200, y: 200, width: 1000, height: 1000 / COVER_SPECS.wechat.ratio };
    const first = start(current, 0.8); await ready();
    expect(get(".qiaomu-crop-safe").getAttribute("aria-valuenow")).toBe("80");
    expect(get<HTMLInputElement>(".qiaomu-crop-zoom").value).not.toBe("1");
    button("使用这个裁切").click();
    const selected = await first;
    expect(selected?.sharePosition).toBe(0.8);
    expect(selected?.crop?.x).toBeCloseTo(current.x, 5);
    const second = start(selected!.crop, selected!.sharePosition); await ready();
    button("重置").click();
    expect(get(".qiaomu-crop-safe").getAttribute("aria-valuenow")).toBe("50");
    expect(Number(get<HTMLInputElement>(".qiaomu-crop-zoom").value)).toBeCloseTo(1, 6);
    button("使用这个裁切").click();
    await expect(second).resolves.toEqual({ crop: null, sharePosition: 0.5 });
  });

  it.each(["x", "zhihu"] as const)("keeps %s as a noninteractive guide without share metadata", async platform => {
    const result = askCrop({} as App, source, COVER_SPECS[platform], null); await ready();
    expect(get(".qiaomu-crop-safe").getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector(".qiaomu-crop-share-position")).toBeNull();
    expect(document.querySelector(".qiaomu-crop-share-preview")).toBeNull();
    button("使用这个裁切").click();
    await expect(result).resolves.toEqual({ crop: null });
  });

  it("releases a bitmap that finishes decoding after the dialog was cancelled", async () => {
    let finish!: (value: ImageBitmap) => void;
    vi.mocked(decodeSource).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const result = start();
    expect(button("使用这个裁切").disabled).toBe(true);
    button("取消").click(); await expect(result).resolves.toBeNull();
    finish(currentBitmap);
    await vi.waitFor(() => expect(currentBitmap.close).toHaveBeenCalledOnce());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

it("names share controls without host tooltip attributes", async () => {
  start(); await ready();
  for (const selector of [".qiaomu-crop-safe", "canvas"]) {
    const control = get(selector);
    expect(control.hasAttribute("aria-label")).toBe(false);
    const name = document.getElementById(control.getAttribute("aria-labelledby")!);
    expect(name?.textContent).toContain("分享方图");
  }
});
