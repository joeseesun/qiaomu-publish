import { sanitizeHTMLToDom } from "obsidian";
import { coverFont } from "../title-cover";
import { cardPalette, cardTemplate } from "./card-styles";
import { type CardLayout, type CardPagination, type CardSpec, layoutCards, rasterizeCard } from "./card-layout";
import { bundledFontFaceCss, ensureBundledFont, usesBundledFont } from "./bundled-font";

export interface CardOptions {
  title: string;
  subtitle: string;
  meta: string[];
  /** Article HTML whose pictures are already data URLs. */
  html: string;
  template: string;
  palette: string;
  /** Font preset id or installed family; empty uses the template's own. */
  font: string;
  pagination: CardPagination;
}

export function cardSpec(options: Pick<CardOptions, "template" | "palette" | "font">): CardSpec {
  const template = cardTemplate(options.template);
  return { template, palette: cardPalette(template, options.palette), font: coverFont(options.font || template.font) };
}

/** Lays the article out as cards (live DOM, 1080 x 1440 each). Cheap enough to redo on every edit; no pictures are drawn yet. */
export async function layoutXhsCards(options: CardOptions): Promise<CardLayout> {
  const spec = cardSpec(options);
  if (usesBundledFont(spec.font.stack)) await ensureBundledFont();
  return layoutCards(activeDocument, spec, { title: options.title, subtitle: options.subtitle, meta: options.meta, fragment: sanitizeHTMLToDom(options.html), pagination: options.pagination });
}

/** Draws the kept cards into PNGs. This is the slow part, so it runs when the person presses send, not while they edit. */
export async function renderCardBlobs(cards: readonly HTMLElement[], options: Pick<CardOptions, "template" | "palette" | "font">, onProgress?: (done: number, total: number) => void): Promise<Blob[]> {
  const fontCss = usesBundledFont(cardSpec(options).font.stack) ? bundledFontFaceCss() : "";
  const blobs: Blob[] = [];
  for (const [index, card] of cards.entries()) {
    onProgress?.(index, cards.length);
    blobs.push(await rasterizeCard(activeDocument, card.cloneNode(true) as HTMLElement, fontCss));
  }
  onProgress?.(cards.length, cards.length);
  return blobs;
}
