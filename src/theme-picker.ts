import { setIcon } from "obsidian";
import { listWechatThemes } from "./export-html";
import { type PickerItem, SearchPicker } from "./search-picker";
import { setName } from "./accessible-name";
import { themeAccents, type WechatExportTheme } from "./themes";

const HEX = /^#[0-9a-f]{3,8}$/i;

/** Up to six hex swatches: what the article really looks like, with the user's primary colour applied. */
export function themeSwatches(theme?: WechatExportTheme, primary?: string): string[] {
  const colors = (theme?.swatches ?? []).map((color) => color.trim()).filter((color) => HEX.test(color)).slice(0, 6);
  const shown = colors.length ? colors : ["#ffffff", "#141413", "#c96442"];
  if (!primary || !theme) return shown;
  const accents = themeAccents(theme).accents.map((color) => color.toLowerCase());
  return shown.map((color) => accents.includes(color.toLowerCase()) ? primary : color);
}

function strip(parent: HTMLElement, theme?: WechatExportTheme, primary?: string): HTMLElement {
  const el = parent.createSpan({ cls: "qiaomu-wechat-swatches", attr: { "aria-hidden": "true" } });
  for (const color of themeSwatches(theme, primary)) el.createSpan().setCssProps({ "--qiaomu-swatch-color": color });
  return el;
}

interface ThemeItem extends PickerItem { theme: WechatExportTheme }

/** Searchable style list whose rows start with the theme's colour strip. */
export class ThemePicker extends SearchPicker<ThemeItem> {
  private readonly themes = listWechatThemes().map((theme) => ({ id: theme.id, label: theme.name, theme }));
  private primary: string | undefined;

  constructor(parent: HTMLElement, private readonly onPick: (themeId: string) => void, variant: "bar" | "field" = "bar") {
    super(parent, { variant, placeholder: "搜索样式", listName: "公众号样式", width: 320 });
  }

  protected items(): ThemeItem[] { return this.themes; }
  protected override matches(item: ThemeItem, query: string): boolean { return `${item.label} ${item.theme.description} ${item.id}`.toLowerCase().includes(query); }
  protected override summary(count: number, query: string): string { return query ? `${count} 个匹配` : `${count} 个样式`; }
  protected renderLabel(button: HTMLElement): void {
    const item = this.themes.find((entry) => entry.id === this.value) ?? this.themes[0]!;
    strip(button, item.theme, this.primary);
    button.createSpan({ cls: "qiaomu-wechat-picker-name", text: item.label });
    setIcon(button.createSpan({ cls: "qiaomu-wechat-picker-chevron" }), "chevron-down");
    setName(button, `选择公众号样式，当前 ${item.label}`);
  }
  protected renderItem(row: HTMLElement, item: ThemeItem): void {
    strip(row, item.theme, this.primary);
    row.createSpan({ cls: "qiaomu-wechat-picker-name", text: item.label });
  }
  protected choose(id: string): void { if (id !== this.value) this.onPick(id); }

  setValue(themeId: string, primary?: string): void {
    this.value = themeId;
    this.primary = primary;
    this.refreshLabel();
  }
}
