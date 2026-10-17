import { setIcon } from "obsidian";
import { ensureBundledFont } from "./external/bundled-font";
import { setName } from "./accessible-name";
import { type PickerItem, SearchPicker } from "./search-picker";
import { listSystemFonts } from "./system-fonts";
import { COVER_FONTS, coverFont } from "./title-cover";

interface FontItem extends PickerItem { css: string }

const PRESETS: FontItem[] = Object.entries(COVER_FONTS).map(([id, font]) => ({ id, label: font.name, css: font.stack }));
const cssFor = (family: string) => coverFont(family).stack;

/** Installed fonts, each row set in its own typeface. The system list loads the first time it is opened. */
export class FontPicker extends SearchPicker<FontItem> {
  private fonts: FontItem[] = [...PRESETS];
  private loaded = false;
  private complete = true;

  constructor(parent: HTMLElement, private readonly onPick: (font: string) => void, private readonly label = "封面字体") {
    super(parent, { variant: "field", placeholder: "搜索或输入字体名", listName: "字体", width: 300 });
  }

  protected items(): FontItem[] { return this.fonts; }
  protected override extraItems(query: string): FontItem[] {
    return this.fonts.some((item) => item.label.toLowerCase() === query.toLowerCase()) ? [] : [{ id: query, label: `使用「${query}」`, css: cssFor(query) }];
  }
  protected override summary(count: number, query: string): string {
    if (!this.loaded) return "正在读取系统字体…";
    if (!this.complete && !query) return "未能读取全部系统字体，已列出常用字体；也可以直接输入字体名";
    return query ? `${count} 个匹配` : `${this.fonts.length} 个字体`;
  }
  protected renderLabel(button: HTMLElement): void {
    const item = this.fonts.find((entry) => entry.id === this.value) ?? { id: this.value, label: this.value, css: cssFor(this.value) };
    button.createSpan({ cls: "qiaomu-wechat-picker-name", text: item.label }).setCssProps({ "--qiaomu-picker-font": item.css });
    setIcon(button.createSpan({ cls: "qiaomu-wechat-picker-chevron" }), "chevron-down");
    setName(button, `${this.label}，当前 ${item.label}`);
  }
  protected renderItem(row: HTMLElement, item: FontItem): void {
    row.createSpan({ cls: "qiaomu-wechat-picker-name", text: item.label }).setCssProps({ "--qiaomu-picker-font": item.css });
  }
  protected choose(id: string): void { this.setValue(id); this.onPick(id); }

  protected override async onOpen(): Promise<void> {
    void ensureBundledFont();
    if (this.loaded) return;
    const { fonts, complete } = await listSystemFonts();
    const known = new Set(PRESETS.map((item) => item.id));
    this.fonts = [...PRESETS, ...fonts.filter((family) => !known.has(family)).map((family) => ({ id: family, label: family, css: cssFor(family) }))];
    this.complete = complete;
    this.loaded = true;
  }

  setValue(id: string): void {
    this.value = id;
    this.refreshLabel();
  }
}
