import { contrastRatio } from "./themes";
import type { WechatCoverFont, WechatCoverStyle } from "./types";

export const COVER_WIDTH = 900;
export const COVER_HEIGHT = 383;

export interface CoverBackground { id: string; name: string; colors: string[] }

/** One colour is a flat fill, several are an evenly spaced diagonal gradient. */
export const COVER_BACKGROUNDS: CoverBackground[] = [
  { id: "paper", name: "米白", colors: ["#f5f3ef"] },
  { id: "ink", name: "墨黑", colors: ["#161616"] },
  { id: "forest", name: "松绿", colors: ["#173a2e"] },
  { id: "navy", name: "深蓝", colors: ["#14213d"] },
  { id: "sunset", name: "日落", colors: ["#ff9a8b", "#ff6a88"] },
  { id: "peach", name: "蜜桃", colors: ["#ffecd2", "#fcb69f"] },
  { id: "mint", name: "薄荷", colors: ["#d4fc79", "#96e6a1"] },
  { id: "ocean", name: "海洋", colors: ["#2193b0", "#6dd5ed"] },
  { id: "aurora", name: "极光", colors: ["#7f7fd5", "#91eae4"] },
  { id: "violet", name: "紫罗兰", colors: ["#667eea", "#764ba2"] },
];

export const COVER_FONTS: Record<string, { name: string; stack: string; weight: number }> = {
  sans: { name: "黑体", stack: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', weight: 700 },
  serif: { name: "宋体", stack: '"Songti SC", STSong, "Noto Serif CJK SC", "Source Han Serif SC", serif', weight: 700 },
  kai: { name: "楷体", stack: '"Kaiti SC", STKaiti, KaiTi, "Noto Serif CJK SC", serif', weight: 400 },
};

export const COVER_SIZE = { min: 28, max: 80, step: 1 } as const;
const HEX = /^#[0-9a-f]{6}$/i;

/** Deep blue with a brush-style title; the text colour stays automatic so it adapts if the background changes. */
export const DEFAULT_COVER_STYLE: WechatCoverStyle = { background: "navy", font: "kai" };

/** A preset id keeps its tuned stack; any other name is used as an installed family with a Chinese fallback. */
export function coverFont(font: string): { stack: string; weight: number } {
  const preset = COVER_FONTS[font];
  if (preset) return preset;
  const family = font.replace(/["\\]/g, "");
  return { stack: `"${family}", ${COVER_FONTS.sans!.stack}`, weight: 700 };
}

export function normalizeCoverStyle(raw: unknown): WechatCoverStyle {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const customBackground = typeof data.background === "string" && /^custom:#[0-9a-f]{6}$/i.test(data.background);
  const style: WechatCoverStyle = {
    background: customBackground ? (data.background as string).toLowerCase() : COVER_BACKGROUNDS.some((item) => item.id === data.background) ? data.background as string : DEFAULT_COVER_STYLE.background,
    font: typeof data.font === "string" && data.font.trim() && data.font.length <= 80 ? data.font.trim() : DEFAULT_COVER_STYLE.font,
  };
  if (typeof data.size === "number" && Number.isFinite(data.size)) style.size = Math.round(Math.min(COVER_SIZE.max, Math.max(COVER_SIZE.min, data.size)));
  if (typeof data.color === "string" && HEX.test(data.color)) style.color = data.color.toLowerCase();
  return style;
}

export function coverBackground(id: string): CoverBackground {
  if (id.startsWith("custom:")) return { id, name: "自定义", colors: [id.slice(7)] };
  return COVER_BACKGROUNDS.find((item) => item.id === id) ?? COVER_BACKGROUNDS[0]!;
}

/** Whichever of near-black or white reads better on the weakest point of the background. */
export function coverInk(colors: string[]): "#ffffff" | "#1a1a1a" {
  const worst = (ink: string) => Math.min(...colors.map((color) => contrastRatio(ink, color)));
  return worst("#ffffff") >= worst("#1a1a1a") ? "#ffffff" : "#1a1a1a";
}

/** Greedy wrap, then narrowed so the lines come out even instead of one long and one orphaned. */
export function wrapTitle(title: string, measure: (text: string) => number, maxWidth: number): string[] {
  const greedy = (width: number) => {
    const lines: string[] = [];
    let line = "";
    for (const char of Array.from(title.trim().replace(/\s+/g, " "))) {
      if (line && measure(line + char) > width) { lines.push(line); line = char === " " ? "" : char; }
      else line += char;
    }
    if (line) lines.push(line);
    return lines;
  };
  const first = greedy(maxWidth);
  if (first.length < 2) return first;
  let low = Math.max(...first.map(measure)) / 2;
  let high = maxWidth;
  let best = first;
  for (let step = 0; step < 12; step++) {
    const mid = (low + high) / 2;
    const attempt = greedy(mid);
    if (attempt.length <= first.length) { best = attempt; high = mid; } else low = mid;
  }
  return best;
}

const SIZES = [58, 52, 46, 40, 36];
const MAX_TEXT_WIDTH = 640;

export function drawTitleCover(context: CanvasRenderingContext2D, title: string, style: WechatCoverStyle): void {
  const background = coverBackground(style.background);
  const font = coverFont(style.font);
  const ink = style.color ?? coverInk(background.colors);
  if (background.colors.length === 1) context.fillStyle = background.colors[0]!;
  else {
    const gradient = context.createLinearGradient(0, 0, COVER_WIDTH, COVER_HEIGHT);
    background.colors.forEach((color, index) => gradient.addColorStop(index / (background.colors.length - 1), color));
    context.fillStyle = gradient;
  }
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

  // A chosen size is respected (up to four lines); automatic size shrinks until three lines fit.
  const candidates = style.size ? [style.size] : SIZES;
  const maxLines = style.size ? 4 : 3;
  let lines: string[] = [];
  let size = candidates[candidates.length - 1]!;
  for (const candidate of candidates) {
    context.font = `${font.weight} ${candidate}px ${font.stack}`;
    lines = wrapTitle(title, (text) => context.measureText(text).width, MAX_TEXT_WIDTH);
    size = candidate;
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = `${lines[maxLines - 1]!.slice(0, -1)}…`;
  }
  const lineHeight = Math.round(size * 1.38);
  const top = (COVER_HEIGHT - lines.length * lineHeight) / 2;
  context.fillStyle = ink;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${font.weight} ${size}px ${font.stack}`;
  lines.forEach((text, index) => context.fillText(text, COVER_WIDTH / 2, top + index * lineHeight + lineHeight / 2));
}

export async function renderTitleCover(title: string, style: WechatCoverStyle): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备无法生成标题封面，请为笔记指定封面图片");
  drawTitleCover(context, title, style);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("生成标题封面失败，请为笔记指定封面图片");
  return blob.arrayBuffer();
}
