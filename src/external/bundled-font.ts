import fontBase64 from "../../fonts/QiaomuReadingFangsong.woff2";

/** CSS family the bundled Zhuque Fangsong subset is registered and embedded under (never the upstream name, which is reserved for the real font). */
export const BUNDLED_FAMILY = "QP Zhuque Fangsong";

let loading: Promise<boolean> | null = null;
let ready = false;

/** True once the subset is registered, so canvas drawing can rely on it without waiting. */
export const bundledFontReady = (): boolean => ready;

function toBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** True when a font stack asks for the bundled font. */
export const usesBundledFont = (stack: string): boolean => stack.includes(BUNDLED_FAMILY);

/** Registers the subset with the document once, so measuring and drawing in Obsidian see it. Safe to call repeatedly. */
export function ensureBundledFont(doc: Document = activeDocument): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      try {
        const face = new FontFace(BUNDLED_FAMILY, toBytes(fontBase64).buffer as ArrayBuffer, { style: "normal", weight: "400" });
        await face.load();
        doc.fonts.add(face);
        ready = true;
        return true;
      } catch { loading = null; return false; }
    })();
  }
  return loading;
}

/** The same font as a CSS rule, for pictures drawn through an SVG: those cannot see the document's fonts. */
export function bundledFontFaceCss(): string {
  return `@font-face{font-family:"${BUNDLED_FAMILY}";src:url(data:font/woff2;base64,${fontBase64}) format("woff2");font-style:normal;font-weight:400}`;
}
