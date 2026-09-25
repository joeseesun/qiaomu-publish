# Third-party notices

## qmblog WeChat export (same author)

`src/themes.ts`, `export-style.ts`, `list-markers.ts`, `publishing-enhancements.ts`, `publish-limits.ts`, `publish-inspect.ts` and parts of `normalize.ts` are ported from the author's own qmblog repository (`lib/wechat-*.ts`, `lib/code-highlight.ts`). Local modifications: strict-index TypeScript fixes, cross-window `nodeType` document checks, and removal of juice/KaTeX/highlight.js/html2pdf dependencies in favour of a CSSOM inliner (`inline-css.ts`).

Studied for design only, no code copied: note-to-mp (MIT) for the Obsidian-to-WeChat workflow.

## Mermaid

Not bundled. Diagrams are rendered with the Mermaid copy that Obsidian ships (`loadMermaid()`), themed per diagram with an init directive so Obsidian's global configuration is not changed. Output is rasterized to PNG for WeChat export.

## MathJax

Not bundled. Formulas use the MathJax copy that Obsidian ships (`loadMathJax()`).
