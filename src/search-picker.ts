import { setIcon } from "obsidian";
import { setName } from "./accessible-name";

export interface PickerItem { id: string; label: string }

/**
 * A searchable dropdown whose list floats above everything: it is attached to the page body and
 * placed from the button's rectangle, so it never changes the height of the window or pane it is used in.
 */
export abstract class SearchPicker<T extends PickerItem> {
  readonly el: HTMLElement;
  protected readonly button: HTMLButtonElement;
  protected readonly search: HTMLInputElement;
  protected readonly list: HTMLElement;
  protected readonly note: HTMLElement;
  protected value = "";
  private readonly pop: HTMLElement;
  private shown: T[] = [];
  private active = 0;
  private open = false;

  constructor(parent: HTMLElement, private readonly options: { variant: "bar" | "field"; placeholder: string; listName: string; width?: number }) {
    this.el = parent.createDiv({ cls: options.variant === "field" ? "qiaomu-wechat-picker is-field" : "qiaomu-wechat-picker" });
    this.button = this.el.createEl("button", { cls: "qiaomu-wechat-picker-button", attr: { type: "button", "aria-haspopup": "listbox", "aria-expanded": "false" } });
    // Built detached; it is mounted in <body> only while open.
    this.pop = this.el.ownerDocument.createElement("div");
    this.pop.className = "qiaomu-wechat-picker-pop";
    this.search = this.pop.createEl("input", { cls: "qiaomu-wechat-picker-search", attr: { type: "search", placeholder: options.placeholder } });
    setName(this.search, options.placeholder);
    this.list = this.pop.createDiv({ cls: "qiaomu-wechat-picker-list", attr: { role: "listbox" } });
    setName(this.list, options.listName);
    this.note = this.pop.createDiv({ cls: "qiaomu-wechat-picker-count" });
    this.button.addEventListener("click", () => void this.toggle(!this.open));
    this.search.addEventListener("input", () => this.render());
    this.pop.addEventListener("keydown", (event) => this.onKey(event));
    this.button.addEventListener("keydown", (event) => { if (this.open && event.key === "Escape") this.onKey(event); });
  }

  protected abstract items(): T[];
  protected abstract renderLabel(button: HTMLElement): void;
  protected abstract renderItem(row: HTMLElement, item: T, selected: boolean): void;
  protected abstract choose(id: string): void;
  /** Rows that depend on the query (e.g. "use this font name"). */
  protected extraItems(_query: string): T[] { return []; }
  protected matches(item: T, query: string): boolean { return item.label.toLowerCase().includes(query); }
  protected summary(count: number, query: string): string { return query ? `${count} 个匹配` : `共 ${count} 项`; }
  protected async onOpen(): Promise<void> {}

  destroy(): void { this.close(false); }

  setEnabled(enabled: boolean): void {
    this.button.disabled = !enabled;
    if (!enabled) this.close(false);
  }

  protected refreshLabel(): void {
    this.button.empty();
    this.renderLabel(this.button);
  }

  private readonly onOutside = (event: MouseEvent): void => {
    const target = event.target as Node;
    if (!this.pop.contains(target) && !this.button.contains(target)) this.close(false);
  };
  private readonly reposition = (): void => { if (this.open) this.place(); };
  private readonly onResize = (): void => this.close(false);

  private async toggle(open: boolean): Promise<void> {
    if (!open) { this.close(true); return; }
    this.open = true;
    this.button.setAttribute("aria-expanded", "true");
    const doc = this.el.ownerDocument;
    doc.body.appendChild(this.pop);
    this.search.value = "";
    this.render();
    this.place();
    this.search.focus();
    doc.addEventListener("mousedown", this.onOutside, true);
    doc.addEventListener("scroll", this.reposition, true);
    doc.defaultView?.addEventListener("resize", this.onResize);
    await this.onOpen();
    if (this.open) { this.render(); this.place(); }
  }

  private close(refocus: boolean): void {
    if (!this.open) return;
    this.open = false;
    this.button.setAttribute("aria-expanded", "false");
    const doc = this.el.ownerDocument;
    doc.removeEventListener("mousedown", this.onOutside, true);
    doc.removeEventListener("scroll", this.reposition, true);
    doc.defaultView?.removeEventListener("resize", this.onResize);
    this.pop.remove();
    if (refocus) this.button.focus();
  }

  /** Below the button when there is room, otherwise above; never taller than the space available. */
  private place(): void {
    const view = this.el.ownerDocument.defaultView;
    if (!view) return;
    const rect = this.button.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(Math.max(this.options.width ?? 320, rect.width), view.innerWidth - margin * 2);
    // Line up with the button's left edge; if that would run off-screen, line up with its right edge instead.
    const left = rect.left + width > view.innerWidth - margin ? rect.right - width : rect.left;
    const below = view.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const useBelow = below >= 260 || below >= above;
    const room = Math.max(160, (useBelow ? below : above) - 6);
    this.pop.setCssProps({
      left: `${Math.min(Math.max(margin, left), view.innerWidth - width - margin)}px`,
      width: `${width}px`,
      top: useBelow ? `${rect.bottom + 6}px` : "auto",
      bottom: useBelow ? "auto" : `${view.innerHeight - rect.top + 6}px`,
      "--qm-pop-max": `${Math.min(440, room)}px`,
    });
  }

  private render(): void {
    const query = this.search.value.trim().toLowerCase();
    this.shown = [...this.items().filter((item) => !query || this.matches(item, query)), ...(query ? this.extraItems(this.search.value.trim()) : [])];
    this.active = Math.max(0, this.shown.findIndex((item) => item.id === this.value));
    this.list.empty();
    this.shown.forEach((item, index) => {
      const selected = item.id === this.value;
      const row = this.list.createDiv({ cls: "qiaomu-wechat-picker-row", attr: { role: "option", "aria-selected": String(selected), "data-index": String(index) } });
      this.renderItem(row, item, selected);
      if (selected) setIcon(row.createSpan({ cls: "qiaomu-wechat-picker-check" }), "check");
      row.addEventListener("click", () => this.pick(item.id));
    });
    this.note.setText(this.summary(this.shown.length, query));
    this.markActive();
  }

  private markActive(): void {
    this.list.querySelectorAll<HTMLElement>(".qiaomu-wechat-picker-row").forEach((row, index) => {
      row.toggleClass("is-active", index === this.active);
      if (index === this.active) row.scrollIntoView({ block: "nearest" });
    });
  }

  private pick(id: string): void {
    this.close(true);
    this.choose(id);
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.open) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.close(true); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.active = Math.min(this.shown.length - 1, Math.max(0, this.active + (event.key === "ArrowDown" ? 1 : -1)));
      this.markActive();
    } else if (event.key === "Enter" && this.shown[this.active]) { event.preventDefault(); this.pick(this.shown[this.active]!.id); }
  }
}
