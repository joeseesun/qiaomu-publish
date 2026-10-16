/** Fonts that usually exist on the platforms Obsidian runs on; shown first and used when the host cannot list fonts. */
export const COMMON_FONTS = [
  "PingFang SC", "Hiragino Sans GB", "Heiti SC", "Songti SC", "Kaiti SC", "Yuanti SC", "STSong", "STKaiti", "Microsoft YaHei", "SimSun", "KaiTi", "SimHei",
  "Source Han Sans SC", "Source Han Serif SC", "Noto Sans CJK SC", "Noto Serif CJK SC", "Helvetica Neue", "Avenir Next", "Georgia", "Times New Roman", "Arial", "Menlo",
];

interface LocalFontFace { family: string }

/** Every installed family when the host allows it (Chromium's Local Font Access), otherwise the common list. */
export async function listSystemFonts(): Promise<{ fonts: string[]; complete: boolean }> {
  const query = (window as unknown as { queryLocalFonts?: () => Promise<LocalFontFace[]> }).queryLocalFonts;
  if (typeof query === "function") {
    try {
      const faces = await query.call(window);
      const installed = new Set(faces.map((face) => face.family));
      const rest = Array.from(installed).filter((family) => !COMMON_FONTS.includes(family)).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
      const common = COMMON_FONTS.filter((family) => installed.has(family));
      return { fonts: [...common, ...rest], complete: true };
    } catch { /* permission denied or unsupported: fall through */ }
  }
  return { fonts: COMMON_FONTS, complete: false };
}
