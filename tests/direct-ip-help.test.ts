// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DirectIpHelp } from "../src/direct-ip-help";
import { WechatIpWhitelistError } from "../src/direct-ip";
import { setRequestUrlHandler } from "./obsidian-stub";

// The host's element helpers; requests and user actions still exercise the real component.
beforeAll(() => {
  Object.assign(HTMLElement.prototype, {
    createEl(this: HTMLElement, tag: string, options: { cls?: string; text?: string; attr?: Record<string, string> } = {}) {
      const el = document.createElement(tag);
      el.className = options.cls ?? "";
      el.textContent = options.text ?? "";
      for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
      this.appendChild(el); return el;
    },
    createDiv(this: HTMLElement, options: object) { return this.createEl("div", options); },
    setText(this: HTMLElement, text: string) { this.textContent = text; },
    toggleClass(this: HTMLElement, name: string, active: boolean) { this.classList.toggle(name, active); },
  });
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); setRequestUrlHandler(async () => { throw new Error("unexpected request"); }); });
function setup() {
  const help = new DirectIpHelp(document.body);
  help.setActive(true);
  const buttons = help.el.querySelectorAll("button");
  return { help, query: buttons[0]!, copy: buttons[1]!, value: help.el.querySelector(".qp-direct-ip-value")! };
}
async function settled() { await new Promise((resolve) => setTimeout(resolve, 0)); }

describe("direct IP assistance", () => {
  it("queries only on click, prevents duplicate queries, and copies just the IP", async () => {
    let resolve!: (value: unknown) => void;
    const request = vi.fn(() => new Promise((done) => { resolve = done; }));
    setRequestUrlHandler(request);
    const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { help, query, copy, value } = setup();
    expect(request).not.toHaveBeenCalled(); expect(copy.disabled).toBe(true);
    query.click(); query.click(); expect(request).toHaveBeenCalledTimes(1);
    resolve({ status: 200, json: { ip: "8.8.4.4" } }); await settled();
    expect(value.textContent).toBe("8.8.4.4"); copy.click(); await settled();
    expect(clipboard).toHaveBeenCalledWith("8.8.4.4"); expect(help.el.textContent).toContain("已复制 IP");
  });

  it("keeps WeChat's authoritative address when an older lookup arrives late", async () => {
    let resolve!: (value: unknown) => void;
    setRequestUrlHandler(() => new Promise((done) => { resolve = done; }));
    const { help, query, value } = setup(); query.click();
    help.showWechatError(new WechatIpWhitelistError("11.22.33.44"));
    resolve({ status: 200, json: { ip: "8.8.4.4" } }); await settled();
    expect(value.textContent).toBe("11.22.33.44"); expect(query.disabled).toBe(false);
  });

  it.each(["switch", "close"])("ignores a late lookup after %s", async (action) => {
    let resolve!: (value: unknown) => void;
    setRequestUrlHandler(() => new Promise((done) => { resolve = done; }));
    const { help, query, value, copy } = setup(); query.click();
    if (action === "switch") { help.setActive(false); help.setActive(true); } else help.destroy();
    resolve({ status: 200, json: { ip: "8.8.4.4" } }); await settled();
    expect(value.textContent).not.toBe("8.8.4.4"); expect(copy.disabled).toBe(true);
  });

  it("clears stale addresses on refresh failure and permits retry", async () => {
    const { help, query, value, copy } = setup();
    help.showWechatError(new WechatIpWhitelistError("11.22.33.44"));
    setRequestUrlHandler(async () => { throw new Error("offline"); }); query.click(); await settled();
    expect(value.textContent).toBe("暂时无法查询"); expect(copy.disabled).toBe(true); expect(query.disabled).toBe(false);
  });

  it("keeps the value and shows manual-copy instructions if clipboard access fails", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    const { help, value, copy } = setup(); help.showWechatError(new WechatIpWhitelistError("11.22.33.44"));
    copy.click(); await settled(); expect(value.textContent).toBe("11.22.33.44"); expect(help.el.textContent).toContain("复制失败，请手动复制：11.22.33.44");
  });
});
