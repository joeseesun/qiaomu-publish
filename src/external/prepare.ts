import { type App, type Component, getLinkpath, htmlToMarkdown, TFile } from "obsidian";
import { renderNoteForWechat, type RenderedNote } from "../render-note";
import { embedWechatImages } from "../copy-html";
import { assertImageSources, imageKey } from "../image-assets";
import { BRIDGE_VERSION, type BridgeJob, type PublishTargetId } from "../bridge/protocol";
import { AssetBag, type ImageCache, imageCacheKey, loadArticleImage, normalizeImage } from "./assets";
import type { CoverCandidate, CoverSource } from "../cover/source";
import { checkX, checkZhihu, IMAGE_LIMITS, normalizeTopics, type ExternalCheck } from "./limits";
import { layoutXhsCards, renderCardBlobs } from "./xhs-cards";
import type { CardLayout } from "./card-layout";
import type { ExternalPublishSettings } from "../types";

import { PREVIEW_IMAGE_SCHEME, X_IMAGE_HOST, ZHIHU_IMAGE_SCHEME } from "./schemes";

export interface PreparedPublish {
  job: BridgeJob;
  assets: AssetBag;
  checks: ExternalCheck[];
  warnings: string[];
  /** X and Zhihu: the article body for the phone preview (pictures as `qp-asset://id`). */
  previewHtml: string;
}

/**
 * Everything slow, done once per publish window: the rendered note, its pictures read and normalised, and the text pieces
 * every later step reuses. Editing the title or a card style never repeats this.
 */
export interface PreparedBase {
  target: PublishTargetId;
  note: RenderedNote;
  assets: AssetBag;
  warnings: string[];
  /** Id of the cover picture in `assets` (X and Zhihu): set by `applyCover` once the person's cover is cut. */
  coverId: string | null;
  /** X: the note as Markdown with pictures addressed by asset id. */
  xBody: string;
  previewHtml: string;
  /** Xiaohongshu: the article HTML with every picture embedded, ready to be laid out as cards. */
  embeddedHtml: string;
  plainText: string;
  dispose(): void;
}

export interface PrepareBaseOptions {
  onProgress?: (text: string) => void;
  signal?: AbortSignal;
  /** Render this Markdown instead of the file's (the person edited it in the window). */
  markdown?: string;
  /** Pictures already read and normalised in this window, so editing the text does not read them again. */
  cache?: ImageCache;
}

function frontmatterString(frontmatter: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = frontmatter[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
  }
  return "";
}

function frontmatterList(frontmatter: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = frontmatter[key];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
    if (typeof value === "string" && value.trim()) return value.split(/[,，、\s]+/).filter(Boolean);
  }
  return [];
}

/** Title shown in the window before the person edits it: frontmatter, first heading, then the file name. */
export function defaultPublishTitle(frontmatter: Record<string, unknown>, fileName: string): string {
  return frontmatterString(frontmatter, "title", "标题") || fileName;
}

function plainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,pre,table,img").forEach((node) => node.remove());
  const blocks = Array.from(doc.body.querySelectorAll("p,li,h1,h2,h3,h4,blockquote"));
  const lines = (blocks.length ? blocks : [doc.body]).map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return Array.from(new Set(lines)).join("\n\n");
}

/** The picture the note names as its cover (属性 cover), as the original bytes; null when it names none. Throws when the named file is missing. */
export async function frontmatterCoverSource(app: App, file: TFile, note: RenderedNote): Promise<CoverSource | null> {
  const raw = frontmatterString(note.frontmatter, "cover", "封面", "image").replace(/^!?\[\[(.+?)(?:\|.*)?\]\]$/, "$1");
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return { ...(await loadArticleImage(app, { id: "cover", kind: "remote", name: raw.split("/").pop() || "cover", url: raw })), origin: "笔记属性 cover" };
  const found = app.metadataCache.getFirstLinkpathDest(getLinkpath(raw), file.path);
  if (!(found instanceof TFile)) throw new Error(`找不到指定封面：${raw}`);
  return { ...(await loadArticleImage(app, { id: "cover", kind: "vault", name: found.name, file: found })), origin: "笔记属性 cover" };
}

/** The pictures of the note as cover candidates, loaded only when one is picked. */
export function noteImageCandidates(app: App, note: RenderedNote): CoverCandidate[] {
  return note.images.map((image) => ({ id: image.id, label: image.name, load: async () => ({ ...(await loadArticleImage(app, image)), origin: "笔记图片" }) }));
}

/** The first picture of the note, as a cover source. */
export async function firstImageSource(app: App, note: RenderedNote): Promise<CoverSource | null> {
  const first = note.images[0];
  return first ? { ...(await loadArticleImage(app, first)), origin: "笔记第一张图" } : null;
}

/** Puts the finished cover (or none) into the shared assets under the id `cover`; the job builders pick it up from there. */
export function applyCover(base: PreparedBase, cover: { data: ArrayBuffer; mime: string; name: string } | null): void {
  base.assets.remove("cover");
  if (cover) { base.assets.add("cover", cover.data, cover.mime, cover.name); base.coverId = "cover"; }
  else base.coverId = null;
}

async function collectImages(app: App, note: RenderedNote, target: PublishTargetId, assets: AssetBag, options: PrepareBaseOptions): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const seen = new Map<string | Blob, string>();
  const total = note.images.length;
  for (const [index, image] of note.images.entries()) {
    if (options.signal?.aborted) throw new Error("已取消");
    const identity = imageKey(image);
    const previous = seen.get(identity);
    if (previous) { ids.set(image.id, previous); continue; }
    options.onProgress?.(`准备图片 ${index + 1}/${total}：${image.name}`);
    const key = imageCacheKey(image);
    const normalizedKey = key ? `n:${target}:${key}` : null;
    let normalized = normalizedKey ? options.cache?.get(normalizedKey) : undefined;
    if (!normalized) {
      const loaded = await loadArticleImage(app, image, options.cache);
      normalized = await normalizeImage(loaded.data, loaded.name, loaded.mime, IMAGE_LIMITS[target]);
      if (normalizedKey) options.cache?.set(normalizedKey, normalized);
    }
    assets.add(image.id, normalized.data, normalized.mime, normalized.name);
    seen.set(identity, image.id);
    ids.set(image.id, image.id);
  }
  return ids;
}

function rewriteImages(html: string, address: (id: string) => string): { html: string; ids: string[] } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ids: string[] = [];
  for (const image of Array.from(doc.querySelectorAll("img"))) {
    const id = image.getAttribute("data-qm-image");
    if (!id) throw new Error(`图片「${image.getAttribute("alt") || "未命名"}」未能准备，请检查图片引用后重试。`);
    image.setAttribute("src", address(id));
    image.removeAttribute("data-qm-image");
    image.removeAttribute("style");
    ids.push(id);
  }
  return { html: doc.body.innerHTML, ids };
}

function frontMatterBlock(title: string, coverAddress: string): string {
  const lines = ["---", `title: ${JSON.stringify(title.trim())}`];
  if (coverAddress) lines.push(`cover: ${JSON.stringify(coverAddress)}`);
  lines.push("---", "");
  return lines.join("\n");
}

/** Checklist boxes have no X equivalent; inline TeX that survived rendering becomes code. */
function xMarkdown(html: string): string {
  const markdown = htmlToMarkdown(html)
    .replace(/^(\s*[-*+]\s+)\[x\]\s+/gim, "$1☑ ")
    .replace(/^(\s*[-*+]\s+)\[ \]\s+/gm, "$1☐ ")
    .replace(/\n{3,}/g, "\n\n");
  return markdown.trim();
}

export async function prepareBase(app: App, file: TFile, component: Component, target: PublishTargetId, options: PrepareBaseOptions = {}): Promise<PreparedBase> {
  options.onProgress?.("排版笔记…");
  const note = await renderNoteForWechat(app, file, component, options.markdown);
  const assets = new AssetBag();
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; note.dispose(); };
  try {
    assertImageSources(note.html, note.images, note.imageErrors);
    let coverId: string | null = null;
    let xBody = "";
    let previewHtml = "";
    let embeddedHtml = "";
    if (target === "xhs") {
      options.onProgress?.("读取图片…");
      embeddedHtml = await embedWechatImages(app, note.html, note.images, true, note.imageErrors);
      if (note.images.some(image => /\.gif(?:$|[?#])/i.test(image.name) || (image.kind === "generated" && image.blob.type === "image/gif"))) {
        note.warnings.push("小红书图文卡片是静态图片，GIF 只会显示其中一帧；需要动图时请在小红书中单独上传原文件。");
      }
    } else {
      const ids = await collectImages(app, note, target, assets, options);
      previewHtml = rewriteImages(note.html, (id) => `${PREVIEW_IMAGE_SCHEME}${ids.get(id) ?? id}`).html;
      if (target === "x") xBody = xMarkdown(rewriteImages(note.html, (id) => `${X_IMAGE_HOST}${ids.get(id) ?? id}`).html);
    }
    return { target, note, assets, warnings: [...note.warnings], coverId, xBody, previewHtml, embeddedHtml, plainText: plainText(note.html), dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** X and Zhihu: only the title changes between builds, so this is instant. */
export function buildJob(base: PreparedBase, title: string): PreparedPublish {
  const { target, note } = base;
  const job: BridgeJob = { v: BRIDGE_VERSION, id: crypto.randomUUID(), target, title: title.trim(), noteName: note.title, content: {}, assets: base.assets.list() };
  const checks: ExternalCheck[] = [];
  if (target === "x") {
    job.content.cover = base.coverId ?? undefined;
    job.content.markdown = `${frontMatterBlock(title, base.coverId ? `${X_IMAGE_HOST}${base.coverId}` : "")}\n${base.xBody}\n`;
    const tables = (note.html.match(/<table[\s>]/gi) ?? []).length;
    checks.push(...checkX({ title, media: base.assets.size + tables }));
  } else if (target === "zhihu") {
    job.content.html = base.previewHtml.replaceAll(PREVIEW_IMAGE_SCHEME, ZHIHU_IMAGE_SCHEME);
    job.content.summary = frontmatterString(note.frontmatter, "digest", "摘要", "description", "summary") || undefined;
    job.content.cover = base.coverId ?? undefined;
    checks.push(...checkZhihu({ title }));
  }
  for (const message of base.warnings) checks.push({ level: "warning", message, fix: "" });
  return { job, assets: base.assets, checks, warnings: base.warnings, previewHtml: base.previewHtml };
}

export interface XhsLayout {
  layout: CardLayout;
  /** Warnings about cards whose content did not fit, plus the note's own warnings. */
  checks: ExternalCheck[];
}

/** Default body copy (full length; the window cuts it to the limit), topics from the note's tags, and the line under the title. */
export function xhsDefaults(base: PreparedBase): { text: string; topics: string[]; subtitle: string } {
  const fm = base.note.frontmatter;
  const text = frontmatterString(fm, "xhs_text", "小红书文案") || base.plainText;
  const topics = normalizeTopics(frontmatterList(fm, "xhs_topics", "小红书话题").concat(frontmatterList(fm, "tags")));
  const subtitle = frontmatterString(fm, "digest", "摘要", "description", "summary") || text.split("\n").find((line) => line.trim())?.slice(0, 46) || "";
  return { text, topics, subtitle };
}

/** Xiaohongshu: lays the note out as cards (live DOM, no pictures drawn yet). Redone when the title or a card style changes. */
export async function layoutXhs(base: PreparedBase, options: { title: string; card: Pick<ExternalPublishSettings, "cardTemplate" | "cardPalette" | "cardFont" | "cardPagination">; author: string }): Promise<XhsLayout> {
  const { subtitle } = xhsDefaults(base);
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const layout = await layoutXhsCards({
    title: options.title, subtitle, meta: [date, frontmatterString(base.note.frontmatter, "author", "作者") || options.author], html: base.embeddedHtml,
    template: options.card.cardTemplate, palette: options.card.cardPalette, font: options.card.cardFont, pagination: options.card.cardPagination,
  });
  const checks: ExternalCheck[] = layout.clipped.map((number) => ({ level: "warning" as const, message: `第 ${number} 张内容太长，下半部分被截掉了`, fix: "在笔记里用 --- 拆开这一段" }));
  for (const message of base.warnings) checks.push({ level: "warning", message, fix: "" });
  return { layout, checks };
}

/** Draws the kept cards and wraps them, with the person's final copy, into the job. Runs when they press send. */
export async function buildXhsJob(base: PreparedBase, cards: readonly HTMLElement[], options: { title: string; text: string; topics: string[]; card: Pick<ExternalPublishSettings, "cardTemplate" | "cardPalette" | "cardFont">; onProgress?: (text: string) => void; signal?: AbortSignal }): Promise<{ job: BridgeJob; assets: AssetBag }> {
  const blobs = await renderCardBlobs(cards, { template: options.card.cardTemplate, palette: options.card.cardPalette, font: options.card.cardFont }, (done, total) => options.onProgress?.(`正在生成图片 ${Math.min(done + 1, total)}/${total}…`));
  if (options.signal?.aborted) throw new Error("已取消");
  const assets = new AssetBag();
  const ids: string[] = [];
  for (const [index, blob] of blobs.entries()) ids.push(assets.add(`card${index + 1}`, await blob.arrayBuffer(), "image/png", `card-${String(index + 1).padStart(2, "0")}.png`).id);
  const job: BridgeJob = {
    v: BRIDGE_VERSION, id: crypto.randomUUID(), target: "xhs", title: options.title.trim(), noteName: base.note.title,
    content: { text: options.text.trim(), topics: options.topics, cards: ids }, assets: assets.list(),
  };
  return { job, assets };
}
