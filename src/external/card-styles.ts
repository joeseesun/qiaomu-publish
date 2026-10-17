export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1440;
export const BLOCK_GAP = 36;

export interface CardPalette {
  id: string;
  name: string;
  /** CSS background of the whole card: a colour or a gradient. */
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  line: string;
  /** Sheet behind the text (gradient template) and code blocks. */
  panel: string;
  code: string;
  /** Colour shown in the picker. */
  swatch: string;
}

export interface CardFontSpec { stack: string; weight: number }

export interface CardInset { top: number; bottom: number; left: number; right: number }

export interface CardTemplate {
  id: string;
  name: string;
  note: string;
  /** Font preset id from the cover fonts used when the person has not chosen one. */
  font: string;
  palettes: CardPalette[];
  inset: CardInset;
  /** Largest title size for short titles; long titles step down from it. */
  titleSize: number;
  css(): string;
}

const palette = (id: string, name: string, bg: string, ink: string, muted: string, accent: string, line: string, panel: string, code: string, swatch = bg): CardPalette =>
  ({ id, name, bg, ink, muted, accent, line, panel, code, swatch });

const MONO = `"SFMono-Regular", Menlo, Consolas, "PingFang SC", monospace`;

const BASE = `
.qp-card{box-sizing:border-box;width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;position:relative;overflow:hidden;background:var(--bg);color:var(--ink);font-family:var(--font);font-size:40px;line-height:1.75;font-weight:400;letter-spacing:.02em;-webkit-font-smoothing:antialiased}
.qp-card *{box-sizing:border-box}
.qp-body{position:absolute;overflow:hidden}
.qp-blk{padding-bottom:${BLOCK_GAP}px;display:flow-root}
.qp-blk>*{margin:0}
.qp-blk h1,.qp-blk h2,.qp-blk h3,.qp-blk h4{line-height:1.38;font-weight:var(--title-weight);letter-spacing:.01em}
.qp-blk h1{font-size:62px}.qp-blk h2{font-size:54px}.qp-blk h3{font-size:46px}.qp-blk h4{font-size:42px}
.qp-blk p{word-break:break-word}
.qp-blk li p,.qp-blk blockquote p,.qp-blk td p{margin:0}
.qp-blk.is-tight{padding-bottom:12px}
.qp-blk li>ul,.qp-blk li>ol{margin-top:.2em}
.qp-blk strong{font-weight:var(--title-weight)}
.qp-blk ul,.qp-blk ol{padding-left:1.3em}
.qp-blk li::marker{color:var(--accent)}
.qp-blk blockquote{padding:6px 0 6px 30px;border-left:6px solid var(--accent);color:var(--muted)}
.qp-blk pre{padding:30px 34px;border-radius:22px;background:var(--code);font-family:${MONO};font-size:29px;line-height:1.6;white-space:pre-wrap;word-break:break-all}
.qp-blk code{font-family:${MONO};font-size:.82em;background:var(--code);border-radius:8px;padding:2px 9px}
.qp-blk pre code{background:none;padding:0;font-size:inherit}
.qp-blk img{display:block;max-width:100%;max-height:var(--img-max);height:auto;border-radius:18px;margin:0 auto}
.qp-blk table{border-collapse:collapse;width:100%;font-size:32px;line-height:1.5}
.qp-blk th,.qp-blk td{border:2px solid var(--line);padding:12px 18px;text-align:left}
.qp-blk th{background:var(--panel);font-weight:var(--title-weight)}
.qp-blk a{color:inherit;text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:6px}
.qp-blk hr{border:0;border-top:2px solid var(--line)}
.qp-foot{position:absolute;display:flex;justify-content:space-between;align-items:baseline;font-size:27px;color:var(--muted);letter-spacing:.06em;line-height:1}
.qp-title{font-weight:var(--title-weight);word-break:break-word}
.qp-sub{color:var(--muted);word-break:break-word}
.qp-meta{color:var(--muted);letter-spacing:.14em}
`;

const CLEAN = `
.t-clean .qp-body{left:104px;right:104px;top:150px;bottom:170px}
.t-clean .qp-foot{left:104px;right:104px;bottom:74px}
.t-clean .qp-blk h2{padding-left:26px;position:relative}
.t-clean .qp-blk h2::before{content:"";position:absolute;left:0;top:.28em;width:10px;height:.9em;border-radius:5px;background:var(--accent)}
.t-clean.qp-title-card{display:flex;flex-direction:column;justify-content:center;padding:0 104px 150px}
.t-clean .qp-title{font-size:var(--title-size);line-height:1.22;letter-spacing:-.005em}
.t-clean .qp-rule{width:120px;height:10px;border-radius:5px;background:var(--accent);margin:72px 0 56px}
.t-clean .qp-sub{font-size:44px;line-height:1.6;max-width:760px}
.t-clean .qp-meta{position:absolute;left:104px;right:104px;bottom:90px;font-size:28px;display:flex;justify-content:space-between}
`;

const MEMO = `
.t-memo .qp-holes{position:absolute;left:44px;top:0;bottom:0;width:36px;background:radial-gradient(circle at 18px 18px,var(--line) 0 15px,transparent 16px) 0 0/36px 120px repeat-y}
.t-memo .qp-body{left:150px;right:96px;top:170px;bottom:170px}
.t-memo .qp-foot{left:150px;right:96px;bottom:76px}
.t-memo .qp-blk h2{display:inline;background:linear-gradient(transparent 62%,var(--line) 62%);padding:0 6px}
.t-memo.qp-title-card{display:flex;flex-direction:column;justify-content:center;padding:0 96px 130px 150px}
.t-memo .qp-meta{font-size:30px;letter-spacing:.04em;text-align:center;margin-bottom:84px}
.t-memo .qp-title{font-size:var(--title-size);line-height:1.25}
.t-memo .qp-sub{font-size:42px;line-height:1.7;margin-top:56px}
.t-memo .qp-stamp{position:absolute;right:96px;bottom:110px;font-size:28px;color:var(--muted);letter-spacing:.2em}
`;

const MAGAZINE = `
.t-magazine .qp-top{position:absolute;left:96px;right:96px;top:84px;display:flex;justify-content:space-between;font-size:26px;letter-spacing:.3em;color:var(--muted);padding-bottom:22px;border-bottom:6px solid var(--ink)}
.t-magazine .qp-top::after{content:"";position:absolute;left:0;right:0;bottom:-18px;border-bottom:2px solid var(--ink)}
.t-magazine .qp-body{left:96px;right:96px;top:216px;bottom:176px;text-align:justify}
.t-magazine .qp-foot{left:96px;right:96px;bottom:76px;padding-top:24px;border-top:2px solid var(--ink)}
.t-magazine .qp-blk h2{padding-top:18px;border-top:4px solid var(--ink)}
.t-magazine .qp-blk p{line-height:1.85}
.t-magazine.qp-title-card{display:flex;flex-direction:column;justify-content:center;padding:150px 96px 190px}
.t-magazine .qp-title{font-size:var(--title-size);line-height:1.16;letter-spacing:-.01em}
.t-magazine .qp-rule{width:100%;height:0;border-top:2px solid var(--ink);margin:70px 0 50px}
.t-magazine .qp-sub{font-size:44px;line-height:1.65;color:var(--ink);opacity:.78}
.t-magazine .qp-issue{position:absolute;left:96px;bottom:96px;font-size:26px;letter-spacing:.3em;color:var(--accent)}
.t-magazine .qp-meta{position:absolute;right:96px;bottom:96px;font-size:26px}
`;

const POEM = `
.t-poem .qp-frame{position:absolute;left:44px;right:44px;top:44px;bottom:44px;border:2px solid var(--accent);opacity:.9}
.t-poem .qp-frame::after{content:"";position:absolute;left:10px;right:10px;top:10px;bottom:10px;border:1px solid var(--accent);opacity:.55}
.t-poem .qp-body{left:150px;right:150px;top:190px;bottom:200px}
.t-poem .qp-foot{left:150px;right:150px;bottom:112px;justify-content:center;gap:40px;letter-spacing:.3em}
.t-poem .qp-blk p{text-indent:2em;line-height:1.95}
.t-poem .qp-blk li p,.t-poem .qp-blk blockquote p{text-indent:0}
.t-poem .qp-blk h2,.t-poem .qp-blk h3{text-align:center;letter-spacing:.2em;margin-bottom:6px}
.t-poem .qp-blk h2::after{content:"";display:block;width:56px;border-top:3px solid var(--accent);margin:22px auto 0}
.t-poem .qp-blk blockquote{border-left:0;text-align:center;padding:0;color:var(--muted)}
.t-poem.qp-title-card{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 150px;text-align:center}
.t-poem .qp-title{font-size:var(--title-size);line-height:1.34;letter-spacing:.12em;margin-right:-.12em}
.t-poem .qp-rule{width:64px;height:64px;background:var(--accent);color:var(--bg);display:flex;align-items:center;justify-content:center;font-size:38px;letter-spacing:0;margin:84px 0 56px;border-radius:6px;line-height:1}
.t-poem .qp-sub{font-size:38px;line-height:1.9;letter-spacing:.14em;max-width:700px}
.t-poem .qp-meta{position:absolute;left:0;right:0;bottom:116px;font-size:26px;letter-spacing:.3em;text-align:center}
`;

const GRADIENT = `
.t-gradient .qp-panel{position:absolute;left:72px;right:72px;top:96px;bottom:128px;border-radius:56px;background:var(--panel);box-shadow:0 30px 80px rgba(0,0,0,.14)}
.t-gradient .qp-body{left:150px;right:150px;top:190px;bottom:222px;color:var(--panel-ink)}
.t-gradient .qp-body .qp-blk blockquote{color:var(--panel-muted)}
.t-gradient .qp-foot{left:150px;right:150px;bottom:174px;color:var(--panel-muted)}
.t-gradient .qp-blk h2{color:var(--accent)}
.t-gradient .qp-blk code,.t-gradient .qp-blk pre{background:rgba(0,0,0,.06)}
.t-gradient .qp-bubble{position:absolute;border-radius:50%;background:rgba(255,255,255,.28)}
.t-gradient.qp-title-card{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:0 110px 170px}
.t-gradient .qp-title{font-size:var(--title-size);line-height:1.2;color:var(--ink);text-shadow:0 4px 30px rgba(0,0,0,.08)}
.t-gradient .qp-sub{font-size:44px;line-height:1.6;color:var(--ink);opacity:.82;margin-top:60px;max-width:780px}
.t-gradient .qp-meta{position:absolute;left:110px;right:110px;bottom:110px;font-size:28px;color:var(--ink);opacity:.8;display:flex;justify-content:space-between}
.t-gradient .qp-chip{display:inline-block;padding:10px 34px;border-radius:40px;background:rgba(255,255,255,.34);font-size:30px;letter-spacing:.14em;color:var(--ink);margin-bottom:64px}
`;

const DARK = `
.t-dark .qp-dots{position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,.07) 2px,transparent 3px) 0 0/54px 54px}
.t-dark .qp-body{left:104px;right:104px;top:150px;bottom:170px}
.t-dark .qp-foot{left:104px;right:104px;bottom:74px;font-family:${MONO}}
.t-dark .qp-blk h2::before{content:"# ";font-family:${MONO};color:var(--accent)}
.t-dark .qp-blk h3::before{content:"## ";font-family:${MONO};color:var(--accent)}
.t-dark .qp-blk strong{color:var(--accent)}
.t-dark.qp-title-card{display:flex;flex-direction:column;justify-content:center;padding:0 104px 150px}
.t-dark .qp-label{font-family:${MONO};font-size:32px;color:var(--accent);letter-spacing:.1em;margin-bottom:56px}
.t-dark .qp-title{font-size:var(--title-size);line-height:1.2;color:var(--ink)}
.t-dark .qp-rule{width:180px;height:12px;background:var(--accent);margin:72px 0 56px}
.t-dark .qp-sub{font-size:42px;line-height:1.65;max-width:780px}
.t-dark .qp-meta{position:absolute;left:104px;right:104px;bottom:90px;font-family:${MONO};font-size:27px;letter-spacing:.06em;display:flex;justify-content:space-between}
`;

const TEMPLATES: CardTemplate[] = [
  {
    id: "clean", name: "简约", note: "留白多，适合干货和教程", font: "sans", inset: { top: 150, bottom: 170, left: 104, right: 104 }, titleSize: 150,
    palettes: [
      palette("white", "白", "#ffffff", "#171717", "#737373", "#171717", "#e5e5e5", "#fafafa", "#f4f4f5"),
      palette("cream", "米", "#f6f1e7", "#2b241c", "#857a69", "#b4532a", "#e1d8c6", "#efe8d9", "#ece4d4"),
      palette("mist", "雾蓝", "#eef2f7", "#1c2733", "#6b7a8c", "#2f5fd0", "#d6dee9", "#e4eaf2", "#dde5ef"),
      palette("ink", "墨", "#111111", "#f2f2f2", "#9a9a9a", "#f2f2f2", "#2e2e2e", "#1a1a1a", "#1c1c1c"),
      palette("blush", "桃粉", "#fff1f0", "#2d1b1b", "#9a7676", "#e5484d", "#f3d3d1", "#fde4e2", "#fadcda"),
      palette("mint", "薄荷", "#eefaf3", "#14281d", "#5f8470", "#1f9d63", "#cfe9da", "#dcf2e6", "#d5ecdf"),
      palette("lavender", "薰衣草", "#f3f0ff", "#1f1a33", "#7a729c", "#6e56cf", "#dcd5f5", "#e7e1fa", "#e0d9f6"),
    ],
    css: () => CLEAN,
  },
  {
    id: "memo", name: "备忘录", note: "像一页笔记本，亲切随手", font: "sans", inset: { top: 170, bottom: 170, left: 150, right: 96 }, titleSize: 136,
    palettes: [
      palette("yellow", "黄", "#fff6cc", "#2d2a1c", "#9a8f5a", "#d9a400", "#ecdc94", "#fff0a8", "#fbeaa0"),
      palette("paper", "白", "#fbfbf8", "#222222", "#8c8c86", "#e0592a", "#dcdcd4", "#f1f1ec", "#efefe8"),
      palette("pink", "粉", "#ffeef0", "#33202a", "#a07884", "#e5626f", "#f6ccd2", "#ffdde2", "#fbd6dc"),
      palette("green", "绿", "#e8f5ea", "#1c2b20", "#6f8a76", "#2f9a58", "#c4e1ca", "#d6edd9", "#cfe7d3"),
      palette("blue", "蓝", "#e8f1fd", "#16263d", "#6c85a8", "#2f6fdb", "#c6d9f3", "#d6e5f9", "#cfdff5"),
      palette("purple", "紫", "#f1ebfb", "#2a1f3d", "#8574a3", "#8a5cd6", "#dccff2", "#e6dcf6", "#e0d4f3"),
      palette("orange", "橙", "#ffeedd", "#33210f", "#a27d57", "#e8741a", "#f6d5b5", "#fde0c4", "#f9d9ba"),
    ],
    css: () => MEMO,
  },
  {
    id: "magazine", name: "杂志", note: "衬线大标题，像一页专栏", font: "serif", inset: { top: 216, bottom: 176, left: 96, right: 96 }, titleSize: 142,
    palettes: [
      palette("paper", "纸", "#f4efe6", "#1a1a1a", "#6e675b", "#b3261e", "#d9d1c1", "#ebe4d6", "#e7dfce"),
      palette("white", "白", "#ffffff", "#141414", "#6b6b6b", "#d4381f", "#dddddd", "#f4f4f4", "#f0f0f0"),
      palette("night", "墨", "#151515", "#efe9dd", "#9d968a", "#e0a526", "#3a3935", "#1f1f1e", "#232321"),
      palette("green", "青", "#e6efe9", "#14231c", "#5c7266", "#1f6f4a", "#c5d6cb", "#d6e5db", "#cfe0d4"),
      palette("blue", "蓝灰", "#e8edf2", "#142030", "#64768a", "#2a5db0", "#cbd5e0", "#d9e1ea", "#d2dbe5"),
      palette("rose", "玫", "#f6e9e9", "#2c1518", "#92686c", "#a3243b", "#e6cccd", "#eed9da", "#ead2d3"),
    ],
    css: () => MAGAZINE,
  },
  {
    id: "poem", name: "文艺", note: "仿宋加边框，适合随笔和读书", font: "zhuque", inset: { top: 190, bottom: 200, left: 150, right: 150 }, titleSize: 126,
    palettes: [
      palette("xuan", "宣纸", "#f3ead8", "#2a2118", "#85765f", "#b23a2e", "#d9cbb0", "#eadfc7", "#e6d9bd"),
      palette("moon", "月白", "#eef0ec", "#20262a", "#76807f", "#9c3b2f", "#d2d8d2", "#e1e6e1", "#dbe1dc"),
      palette("night", "墨夜", "#17191c", "#e9e4d8", "#948d7f", "#c9553f", "#3a3d42", "#202327", "#23262a"),
      palette("celadon", "青瓷", "#e3ece6", "#1f2d27", "#6a8076", "#2f6b57", "#c5d6cc", "#d4e2d9", "#cddcd3"),
      palette("dai", "黛", "#e9e6ee", "#26222e", "#7d7690", "#6b4c9a", "#d3cde0", "#ddd8e8", "#d7d1e3"),
      palette("rouge", "胭脂", "#f6e6e2", "#33201c", "#9a7770", "#b3322a", "#e9cbc4", "#f0d7d1", "#ecd0c9"),
    ],
    css: () => POEM,
  },
  {
    id: "gradient", name: "渐变", note: "柔和色块，封面抓眼", font: "sans", inset: { top: 190, bottom: 222, left: 150, right: 150 }, titleSize: 148,
    palettes: [
      palette("sunset", "晚霞", "linear-gradient(135deg,#ffb199,#ff6a88)", "#ffffff", "#8b6a70", "#e0425f", "rgba(0,0,0,.08)", "rgba(255,255,255,.93)", "rgba(0,0,0,.06)", "#ff8a95"),
      palette("peach", "蜜桃", "linear-gradient(135deg,#ffecd2,#fcb69f)", "#4a2a1c", "#8d6c5e", "#d2553a", "rgba(0,0,0,.08)", "rgba(255,255,255,.9)", "rgba(0,0,0,.06)", "#fcc9ad"),
      palette("mint", "薄荷", "linear-gradient(135deg,#d4fc79,#96e6a1)", "#17361f", "#587a60", "#1f8a4c", "rgba(0,0,0,.08)", "rgba(255,255,255,.9)", "rgba(0,0,0,.06)", "#b5f08c"),
      palette("ocean", "海洋", "linear-gradient(135deg,#2193b0,#6dd5ed)", "#ffffff", "#5b7f8c", "#13789a", "rgba(0,0,0,.08)", "rgba(255,255,255,.93)", "rgba(0,0,0,.06)", "#48b4cf"),
      palette("violet", "紫罗兰", "linear-gradient(135deg,#667eea,#764ba2)", "#ffffff", "#7a6c98", "#6a4bb0", "rgba(0,0,0,.08)", "rgba(255,255,255,.94)", "rgba(0,0,0,.06)", "#6f66c4"),
      palette("forest", "森林", "linear-gradient(135deg,#134e5e,#71b280)", "#ffffff", "#5c7d77", "#1d7a5a", "rgba(0,0,0,.08)", "rgba(255,255,255,.94)", "rgba(0,0,0,.06)", "#427f6f"),
      palette("night", "夜空", "linear-gradient(135deg,#232526,#414345)", "#ffffff", "#6b6e72", "#3a3f46", "rgba(0,0,0,.08)", "rgba(255,255,255,.94)", "rgba(0,0,0,.06)", "#33363a"),
    ],
    css: () => GRADIENT,
  },
  {
    id: "dark", name: "极客", note: "深色底加高亮色，适合技术内容", font: "sans", inset: { top: 150, bottom: 170, left: 104, right: 104 }, titleSize: 146,
    palettes: [
      palette("green", "荧绿", "#07130d", "#e6f2ea", "#7f9b8b", "#34d399", "#17302a", "#0d1e16", "#0f2219", "#34d399"),
      palette("blue", "科技蓝", "#08111f", "#e6edf7", "#7f90aa", "#60a5fa", "#18283f", "#0f1b2e", "#122136", "#60a5fa"),
      palette("orange", "琥珀", "#150f08", "#f3ebe2", "#9c8b78", "#fb923c", "#33271a", "#1f160d", "#241a10", "#fb923c"),
      palette("violet", "紫", "#120b1f", "#eee9f7", "#9a8cb4", "#c084fc", "#2c2142", "#1b1230", "#201637", "#c084fc"),
      palette("pink", "玫红", "#1a0b13", "#f6e9f0", "#a58595", "#f472b6", "#3a1c2d", "#25121c", "#2b1621", "#f472b6"),
      palette("yellow", "明黄", "#15130a", "#f4f0de", "#9d9876", "#facc15", "#352f14", "#211e0e", "#272311", "#facc15"),
      palette("slate", "石墨", "#1e2227", "#e9ecef", "#8a929b", "#e5e7eb", "#31373e", "#262b31", "#2b3138", "#e5e7eb"),
    ],
    css: () => DARK,
  },
];

export const CARD_TEMPLATES: readonly CardTemplate[] = TEMPLATES;

export function cardTemplate(id: string | undefined): CardTemplate {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0]!;
}

export function cardPalette(template: CardTemplate, id: string | undefined): CardPalette {
  return template.palettes.find((item) => item.id === id) ?? template.palettes[0]!;
}

/** Title size in px: the template's largest for short titles, stepping down so a long title still fits in four or five lines. */
export function titleSizeFor(title: string, largest: number): number {
  const length = Array.from(title.trim()).length;
  const steps: [number, number][] = [[6, 1], [10, 0.87], [16, 0.75], [24, 0.64], [Infinity, 0.53]];
  const factor = steps.find(([max]) => length <= max)![1];
  return Math.round(largest * factor);
}

/** What the colour button shows: a gradient as it is; otherwise the background with the accent beside it, so palettes that differ only in accent still look different. */
export function paletteSwatch(palette: CardPalette): string {
  return palette.bg.includes("gradient") ? palette.bg : `linear-gradient(135deg, ${palette.bg} 0 52%, ${palette.accent} 52% 100%)`;
}

export function cardCss(template: CardTemplate): string { return BASE + template.css(); }
