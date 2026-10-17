import { BLOCK_GAP, CARD_HEIGHT, CARD_WIDTH, type CardFontSpec, type CardPalette, type CardTemplate, cardCss, titleSizeFor } from "./card-styles";

/** Everything here works on a plain DOM, so the same code lays out cards inside Obsidian and in a browser preview page. */
export type CardPagination = "flow" | "h2";

export interface CardSpec {
  template: CardTemplate;
  palette: CardPalette;
  font: CardFontSpec;
}

export interface CardContent {
  title: string;
  /** One or two sentences under the title on the first card; empty hides it. */
  subtitle: string;
  /** Date first, then author when there is one. */
  meta: string[];
  fragment: ParentNode;
  pagination: CardPagination;
}

export interface CardLayout {
  /** One detached element per card, ready to serialize. */
  cards: HTMLElement[];
  /** 1-based card numbers whose content was taller than a card and got cut off. */
  clipped: number[];
}

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function root(doc: Document, spec: CardSpec, content: CardContent, extraClass = ""): HTMLElement {
  const wrapper = el(doc, "div");
  wrapper.append(el(doc, "style", undefined, cardCss(spec.template)));
  const card = el(doc, "div", `qp-card t-${spec.template.id}${extraClass ? ` ${extraClass}` : ""}`);
  const { palette, font, template } = spec;
  const vars: Record<string, string> = {
    "--bg": palette.bg, "--ink": palette.ink, "--muted": palette.muted, "--accent": palette.accent, "--line": palette.line,
    "--panel": palette.panel, "--code": palette.code, "--font": font.stack, "--title-weight": String(font.weight < 600 ? 600 : font.weight),
    "--title-size": `${titleSizeFor(content.title, template.titleSize)}px`,
    "--img-max": `${CARD_HEIGHT - template.inset.top - template.inset.bottom - BLOCK_GAP}px`,
    "--panel-ink": "#26262b", "--panel-muted": "#7b7b84",
  };
  for (const [name, value] of Object.entries(vars)) card.style.setProperty(name, value);
  wrapper.append(card);
  return wrapper;
}

const cardOf = (wrapper: HTMLElement): HTMLElement => wrapper.querySelector<HTMLElement>(".qp-card")!;

function bubbles(doc: Document, card: HTMLElement): void {
  for (const [size, left, top] of [[520, 640, -140], [360, -120, 980], [220, 780, 1080]] as const) {
    const bubble = el(doc, "div", "qp-bubble");
    bubble.style.cssText = `width:${size}px;height:${size}px;left:${left}px;top:${top}px`;
    card.append(bubble);
  }
}

/** First card: the title and, depending on the template, a rule or seal, the subtitle and the date and author. */
export function buildTitleCard(doc: Document, spec: CardSpec, content: CardContent): HTMLElement {
  const wrapper = root(doc, spec, content, "qp-title-card");
  const card = cardOf(wrapper);
  const [date = "", author = ""] = content.meta;
  const sub = () => content.subtitle ? el(doc, "div", "qp-sub", content.subtitle) : null;
  const add = (...nodes: (HTMLElement | null)[]) => { for (const node of nodes) if (node) card.append(node); };
  const metaRow = () => { const row = el(doc, "div", "qp-meta"); row.append(el(doc, "span", undefined, date), el(doc, "span", undefined, author)); return row; };

  switch (spec.template.id) {
    case "memo":
      add(el(doc, "div", "qp-holes"), el(doc, "div", "qp-meta", date), el(doc, "div", "qp-title", content.title), sub());
      break;
    case "magazine": {
      const top = el(doc, "div", "qp-top");
      top.append(el(doc, "span", undefined, "NOTES"), el(doc, "span", undefined, date));
      add(top, el(doc, "div", "qp-title", content.title), el(doc, "div", "qp-rule"), sub(), el(doc, "div", "qp-issue", author || "READ"));
      break;
    }
    case "poem":
      add(el(doc, "div", "qp-frame"), el(doc, "div", "qp-title", content.title), el(doc, "div", "qp-rule", Array.from(author)[0] ?? "记"), sub(), el(doc, "div", "qp-meta", [date, author].filter(Boolean).join("　")));
      break;
    case "gradient":
      bubbles(doc, card);
      add(el(doc, "div", "qp-chip", date || "NOTES"), el(doc, "div", "qp-title", content.title), sub(), metaRow());
      break;
    case "dark":
      add(el(doc, "div", "qp-dots"), el(doc, "div", "qp-label", "// NOTE"), el(doc, "div", "qp-title", content.title), el(doc, "div", "qp-rule"), sub(), metaRow());
      break;
    default:
      add(el(doc, "div", "qp-title", content.title), el(doc, "div", "qp-rule"), sub(), metaRow());
  }
  return wrapper;
}

function buildPage(doc: Document, spec: CardSpec, content: CardContent, blocks: Block[], index: number, total: number): HTMLElement {
  const wrapper = root(doc, spec, content);
  const card = cardOf(wrapper);
  const [date = ""] = content.meta;
  switch (spec.template.id) {
    case "memo": card.append(el(doc, "div", "qp-holes")); break;
    case "poem": card.append(el(doc, "div", "qp-frame")); break;
    case "dark": card.append(el(doc, "div", "qp-dots")); break;
    case "gradient": bubbles(doc, card); card.append(el(doc, "div", "qp-panel")); break;
    case "magazine": {
      const top = el(doc, "div", "qp-top");
      top.append(el(doc, "span", undefined, "NOTES"), el(doc, "span", undefined, date));
      card.append(top);
      break;
    }
    default: break;
  }
  const body = el(doc, "div", "qp-body");
  for (const block of blocks) { const holder = el(doc, "div", block.tight ? "qp-blk is-tight" : "qp-blk"); holder.append(block.node.cloneNode(true)); body.append(holder); }
  card.append(body);
  const foot = el(doc, "div", "qp-foot");
  foot.append(el(doc, "span", undefined, content.title.length > 16 ? `${content.title.slice(0, 16)}…` : content.title), el(doc, "span", undefined, `${index} / ${total}`));
  card.append(foot);
  return wrapper;
}

interface Block { node: Element; breakBefore: boolean; /** A list item followed by another item of the same list: sits close to it. */ tight: boolean }

function expandLists(doc: Document, node: Element): Element[] {
  const tag = node.tagName.toLowerCase();
  if (tag !== "ul" && tag !== "ol") return [node];
  const items = Array.from(node.children).filter((child) => child.tagName.toLowerCase() === "li");
  if (items.length < 2) return [node];
  let start = tag === "ol" ? Number(node.getAttribute("start") ?? 1) || 1 : 1;
  return items.map((item) => {
    const list = doc.createElement(tag);
    if (tag === "ol") { list.setAttribute("start", String(start)); start += 1; }
    list.append(item.cloneNode(true));
    return list;
  });
}

function toBlocks(doc: Document, fragment: ParentNode, pagination: CardPagination): Block[] {
  const blocks: Block[] = [];
  let pendingBreak = false;
  for (const child of Array.from(fragment.childNodes)) {
    if (!(child instanceof (doc.defaultView as unknown as typeof globalThis).Element)) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === "hr") { pendingBreak = true; continue; }
    const parts = expandLists(doc, child);
    for (const [index, node] of parts.entries()) {
      const heading = pagination === "h2" && tag === "h2" && blocks.length > 0;
      blocks.push({ node, breakBefore: index === 0 && (pendingBreak || heading), tight: parts.length > 1 && index < parts.length - 1 });
      if (index === 0) pendingBreak = false;
    }
  }
  return blocks;
}

/**
 * Lays the article out one block at a time and starts a new card when the next block would not fit. A line holding only `---` always
 * starts a new card. The first card carries the title; the rest carry the text.
 */
export async function layoutCards(doc: Document, spec: CardSpec, content: CardContent): Promise<CardLayout> {
  const stage = el(doc, "div", "qiaomu-publish-card-stage");
  doc.body.append(stage);
  try {
    stage.append(el(doc, "style", undefined, cardCss(spec.template)));
    const measure = el(doc, "div", `qp-card t-${spec.template.id}`);
    measure.style.setProperty("--font", spec.font.stack);
    measure.style.setProperty("--title-weight", String(spec.font.weight < 600 ? 600 : spec.font.weight));
    measure.style.setProperty("--img-max", `${CARD_HEIGHT - spec.template.inset.top - spec.template.inset.bottom - BLOCK_GAP}px`);
    measure.style.setProperty("--accent", spec.palette.accent);
    measure.style.setProperty("--line", spec.palette.line);
    measure.style.setProperty("--panel", spec.palette.panel);
    measure.style.setProperty("--code", spec.palette.code);
    const body = el(doc, "div", "qp-body");
    measure.append(body);
    stage.append(measure);

    const blocks = toBlocks(doc, content.fragment, content.pagination);
    const holders = blocks.map((block) => { const holder = el(doc, "div", block.tight ? "qp-blk is-tight" : "qp-blk"); holder.append(block.node.cloneNode(true)); body.append(holder); return holder; });
    await Promise.all(Array.from(body.querySelectorAll("img")).map((image) => image.decode().catch(() => undefined)));
    await doc.fonts.ready;

    const available = CARD_HEIGHT - spec.template.inset.top - spec.template.inset.bottom;
    const pages: number[][] = [];
    let current: number[] = [];
    let used = 0;
    const isHeading = (index: number) => /^h[1-6]$/i.test(blocks[index]!.node.tagName);
    const heights = holders.map((holder) => Math.ceil(holder.getBoundingClientRect().height));
    holders.forEach((_holder, index) => {
      const height = heights[index]!;
      if (current.length && (blocks[index]!.breakBefore || used + height > available)) {
        // A heading never ends a card on its own: it moves with the text it introduces.
        const carry = current.length > 1 && isHeading(current[current.length - 1]!) && !blocks[index]!.breakBefore ? current.pop()! : null;
        pages.push(current);
        current = carry === null ? [] : [carry];
        used = current.reduce((sum, item) => sum + heights[item]!, 0);
      }
      current.push(index);
      used += height;
    });
    if (current.length) pages.push(current);
    const clipped = pages.flatMap((page, pageIndex) => page.some((index) => holders[index]!.getBoundingClientRect().height > available) ? [pageIndex + 2] : []);

    const total = pages.length + 1;
    const cards = [buildTitleCard(doc, spec, content)];
    pages.forEach((page, pageIndex) => cards.push(buildPage(doc, spec, content, page.map((index) => blocks[index]!), pageIndex + 2, total)));
    return { cards, clipped };
  } finally { stage.remove(); }
}

/** Draws one card (the element returned by layoutCards) into a PNG through an SVG foreignObject. `extraCss` carries @font-face rules: an SVG picture cannot see the document's fonts. */
export async function rasterizeCard(doc: Document, card: HTMLElement, extraCss = ""): Promise<Blob> {
  const holder = el(doc, "div", "qiaomu-publish-card-stage");
  holder.append(card);
  doc.body.append(holder);
  try {
    await Promise.all(Array.from(card.querySelectorAll("img")).map((image) => image.decode().catch(() => undefined)));
    await doc.fonts.ready;
    if (extraCss) card.prepend(el(doc, "style", undefined, extraCss));
    const markup = new XMLSerializer().serializeToString(card);
    // Chromium only keeps the canvas exportable for data: pictures, not blob: ones. Reading the Blob back as a data URL avoids
    // copying a multi-megabyte embedded font through encodeURIComponent for every card.
    const svg = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><foreignObject width="100%" height="100%">`, markup, "</foreignObject></svg>"], { type: "image/svg+xml;charset=utf-8" });
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("读取卡片失败"));
      reader.readAsDataURL(svg);
    });
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = doc.createElement("canvas");
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建画布");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("卡片编码失败")), "image/png"));
  } finally { holder.remove(); }
}
