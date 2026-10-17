import { Setting } from "obsidian";
import { FontPicker } from "./font-picker";
import { CARD_TEMPLATES, cardPalette, cardTemplate, paletteSwatch } from "./external/card-styles";
import type { ExternalPublishSettings } from "./types";

/**
 * Template, colour, font and pagination for the Xiaohongshu cards. One definition serves the publish window and the settings page;
 * `changed` runs after every choice has been written to `settings`.
 */
export function renderCardControls(parent: HTMLElement, settings: ExternalPublishSettings, changed: () => void): () => void {
  let picker: FontPicker | null = null;
  const chosen = () => cardTemplate(settings.cardTemplate);

  const style = new Setting(parent).setName("样式").setDesc(chosen().note);
  const chips = style.controlEl.createDiv({ cls: "qiaomu-card-chips" });
  const colour = new Setting(parent).setName("配色");
  const swatches = colour.controlEl.createDiv({ cls: "qiaomu-card-swatches" });
  const fontSetting = new Setting(parent).setName("字体");

  const fontId = () => settings.cardFont || chosen().font;
  const renderChips = () => {
    chips.empty();
    for (const template of CARD_TEMPLATES) {
      const button = chips.createEl("button", { cls: "qiaomu-platform-chip", text: template.name, attr: { type: "button", "aria-pressed": String(template.id === settings.cardTemplate) } });
      if (template.id === settings.cardTemplate) button.addClass("is-active");
      button.addEventListener("click", () => {
        if (template.id === settings.cardTemplate) return;
        settings.cardTemplate = template.id;
        settings.cardPalette = template.palettes[0]!.id;
        style.setDesc(template.note);
        refresh();
        changed();
      });
    }
  };
  const renderSwatches = () => {
    swatches.empty();
    const template = chosen();
    const current = cardPalette(template, settings.cardPalette).id;
    for (const palette of template.palettes) {
      const button = swatches.createEl("button", { cls: "qiaomu-card-swatch", attr: { type: "button", "aria-pressed": String(palette.id === current) } });
      button.setCssProps({ "--qiaomu-swatch": paletteSwatch(palette) });
      button.createSpan({ cls: "qiaomu-wechat-sr-only", text: palette.name });
      if (palette.id === current) button.addClass("is-active");
      button.addEventListener("click", () => { settings.cardPalette = palette.id; renderSwatches(); changed(); });
    }
  };
  const refresh = () => { renderChips(); renderSwatches(); picker?.setValue(fontId()); };

  picker = new FontPicker(fontSetting.controlEl, (font) => { settings.cardFont = font === chosen().font ? "" : font; changed(); }, "卡片字体");
  refresh();
  return () => picker?.destroy();
}
