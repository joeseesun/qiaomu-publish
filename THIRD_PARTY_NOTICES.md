# Third-party notices

## qmblog WeChat export (same author)

`src/themes.ts`, `export-style.ts`, `list-markers.ts`, `publishing-enhancements.ts`, `publish-limits.ts`, `publish-inspect.ts` and parts of `normalize.ts` are ported from the author's own qmblog repository (`lib/wechat-*.ts`, `lib/code-highlight.ts`). Local modifications: strict-index TypeScript fixes, cross-window `nodeType` document checks, and removal of juice/KaTeX/html2pdf dependencies in favour of a CSSOM inliner (`inline-css.ts`).

Studied for design only, no code copied: note-to-mp (MIT) for the Obsidian-to-WeChat workflow.

## Zhuque Fangsong (bundled font subset)

`fonts/QiaomuReadingFangsong.woff2` is a reading subset of Zhuque Fangsong v0.212 (technical preview) by Zhejiang JadeFoci Technology Co. LTD (upstream: https://github.com/TrionesType/zhuque), 7,554 codepoints (GB2312 plus Latin, punctuation and full-width characters), glyph outlines and layout features retained. It is embedded in `main.js` and used only as the CSS family `QP Zhuque Fangsong` for card and cover text; characters outside the subset fall back to an installed Zhuque Fangsong or the system 仿宋. Licensed under the SIL Open Font License 1.1 (`fonts/OFL.txt`, also in the `main.js` banner). The subset was produced by `scripts/build-reading-font.py` from the upstream `ZhuqueFangsong-Regular.ttf` (SHA-256 `558c62730844fe54ba220146ed62f859d4e2880188d92d985f8921c6e3743bc4`) and is not an upstream release; it is shared with the author's Qiaomu Reader plugin.

## Mermaid

Not bundled. Diagrams are rendered with the Mermaid copy that Obsidian ships (`loadMermaid()`), themed per diagram with an init directive so Obsidian's global configuration is not changed. Output is rasterized to PNG for WeChat export.

## MathJax

Not bundled. Formulas use the MathJax copy that Obsidian ships (`loadMathJax()`).

## highlight.js

Selected language grammars are bundled for code highlighting. The full license is also included in the distributed main.js.

```text
BSD 3-Clause License

Copyright (c) 2006, Ivan Sagalaev.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
