import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGES: Record<string, LanguageFn> = { bash, c, cpp, csharp, css, diff, dockerfile, go, java, javascript, json, kotlin, markdown, php, python, ruby, rust, sql, swift, typescript, xml, yaml };
for (const [name, definition] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, definition);
const ALIASES: Record<string, string> = {
  sh: "bash", shell: "bash", zsh: "bash", console: "bash", js: "javascript", jsx: "javascript", mjs: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", rs: "rust", golang: "go", html: "xml", svg: "xml", vue: "xml", yml: "yaml", md: "markdown", "c++": "cpp", "c#": "csharp", cs: "csharp", kt: "kotlin", patch: "diff",
};

type Role = "comment" | "keyword" | "string" | "number" | "title" | "type" | "attr" | "meta";

export interface CodeTheme {
  id: string;
  name: string;
  bg: string;
  fg: string;
  border: string;
  lineNumber: string;
  roles: Record<Role, string>;
}

const theme = (id: string, name: string, bg: string, fg: string, border: string, lineNumber: string, roles: [string, string, string, string, string, string, string, string]): CodeTheme => ({
  id, name, bg, fg, border, lineNumber,
  roles: { comment: roles[0], keyword: roles[1], string: roles[2], number: roles[3], title: roles[4], type: roles[5], attr: roles[6], meta: roles[7] },
});

export const CODE_THEMES: CodeTheme[] = [
  theme("github-light", "GitHub 浅色", "#f6f8fa", "#24292f", "#d0d7de", "#8c959f", ["#6e7781", "#cf222e", "#0a3069", "#0550ae", "#8250df", "#953800", "#0550ae", "#116329"]),
  theme("github-dark", "GitHub 深色", "#0d1117", "#c9d1d9", "#30363d", "#6e7681", ["#8b949e", "#ff7b72", "#a5d6ff", "#79c0ff", "#d2a8ff", "#ffa657", "#79c0ff", "#7ee787"]),
  theme("one-light", "One Light", "#fafafa", "#383a42", "#e5e5e6", "#9d9d9f", ["#a0a1a7", "#a626a4", "#50a14f", "#986801", "#4078f2", "#c18401", "#986801", "#e45649"]),
  theme("one-dark", "One Dark", "#282c34", "#abb2bf", "#3a3f4b", "#636d83", ["#5c6370", "#c678dd", "#98c379", "#d19a66", "#61afef", "#e6c07b", "#d19a66", "#e06c75"]),
  theme("solarized-light", "Solarized 浅色", "#fdf6e3", "#657b83", "#eee8d5", "#93a1a1", ["#93a1a1", "#859900", "#2aa198", "#d33682", "#268bd2", "#b58900", "#268bd2", "#cb4b16"]),
  theme("monokai", "Monokai", "#272822", "#f8f8f2", "#3e3d32", "#90908a", ["#75715e", "#f92672", "#e6db74", "#ae81ff", "#a6e22e", "#66d9ef", "#a6e22e", "#fd971f"]),
  theme("dracula", "Dracula", "#282a36", "#f8f8f2", "#44475a", "#6272a4", ["#6272a4", "#ff79c6", "#f1fa8c", "#bd93f9", "#50fa7b", "#8be9fd", "#50fa7b", "#ffb86c"]),
  theme("nord", "Nord", "#2e3440", "#d8dee9", "#3b4252", "#616e88", ["#616e88", "#81a1c1", "#a3be8c", "#b48ead", "#88c0d0", "#8fbcbb", "#8fbcbb", "#d08770"]),
  theme("tokyo-night", "Tokyo Night", "#1a1b26", "#a9b1d6", "#2f334d", "#565f89", ["#565f89", "#bb9af7", "#9ece6a", "#ff9e64", "#7aa2f7", "#2ac3de", "#73daca", "#f7768e"]),
];

export function getCodeTheme(id: string | undefined): CodeTheme | undefined {
  return CODE_THEMES.find((item) => item.id === id);
}

const ROLE_BY_CLASS: Record<string, Role> = {
  "hljs-comment": "comment", "hljs-quote": "comment",
  "hljs-keyword": "keyword", "hljs-selector-tag": "keyword", "hljs-doctag": "keyword", "hljs-formula": "keyword",
  "hljs-string": "string", "hljs-regexp": "string", "hljs-addition": "string", "hljs-symbol": "string", "hljs-template-tag": "string",
  "hljs-number": "number", "hljs-literal": "number", "hljs-bullet": "number",
  "hljs-title": "title", "hljs-section": "title", "hljs-selector-id": "title", "hljs-selector-class": "title",
  "hljs-built_in": "type", "hljs-type": "type", "hljs-class": "type",
  "hljs-attr": "attr", "hljs-attribute": "attr", "hljs-variable": "attr", "hljs-template-variable": "attr", "hljs-property": "attr", "hljs-params": "attr",
  "hljs-meta": "meta", "hljs-tag": "meta", "hljs-name": "meta", "hljs-deletion": "meta", "hljs-link": "meta",
};

function roleOf(classNames: string): Role | undefined {
  // "hljs-title class_" resolves to a type; "hljs-title function_" stays a title.
  if (/\bclass_\b/.test(classNames)) return "type";
  for (const name of classNames.split(/\s+/)) {
    const role = ROLE_BY_CLASS[name];
    if (role) return role;
  }
  return undefined;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', amp: "&", "#x27": "'", "#39": "'" };

export interface CodeSegment { text: string; color?: string }

/** Highlights code into per-line colour segments; null when the language is unknown. */
export function highlightCodeLines(code: string, language: string, palette: CodeTheme): CodeSegment[][] | null {
  const name = ALIASES[language] ?? language;
  if (!name || !hljs.getLanguage(name)) return null;
  let html: string;
  try { html = hljs.highlight(code, { language: name, ignoreIllegals: true }).value; } catch { return null; }
  const lines: CodeSegment[][] = [[]];
  const stack: (string | undefined)[] = [];
  const token = /<span class="([^"]*)">|<\/span>|\n|[^<\n]+/g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html))) {
    const part = match[0];
    if (part === "\n") lines.push([]);
    else if (part === "</span>") stack.pop();
    else if (match[1] !== undefined) {
      // Inner spans without their own role inherit the nearest coloured ancestor.
      const role = roleOf(match[1]);
      stack.push(role ? palette.roles[role] : stack[stack.length - 1]);
    } else {
      const text = part.replace(/&(lt|gt|quot|amp|#x27|#39);/g, (_, entity: string) => ENTITIES[entity]!);
      lines[lines.length - 1]!.push({ text, color: stack[stack.length - 1] });
    }
  }
  return lines;
}

/** Block, bar and line-number colours; selectors mirror the clean-reading override so they beat the dark compat layer. */
export function codeThemeCss(palette: CodeTheme | undefined): string {
  if (!palette) return "";
  const scope = ".wechat-export-root .wechat-export-article .wechat-export-content";
  return `
    ${scope} pre.code__pre, ${scope} .hljs.code__pre, ${scope} pre { background: ${palette.bg} !important; border-color: ${palette.border} !important; }
    ${scope} pre.code__pre > .mac-sign, ${scope} .hljs.code__pre > .mac-sign, ${scope} pre > .mac-sign { background: ${palette.bg} !important; }
    ${scope} pre.code__pre > code, ${scope} .hljs.code__pre > code, ${scope} pre > code { color: ${palette.fg} !important; }
    ${scope} .wechat-code-lines { color: ${palette.fg} !important; }
    ${scope} .wechat-code-line-number { color: ${palette.lineNumber} !important; }
  `;
}
