import esbuild from "esbuild";
import process from "node:process";
import { readFileSync } from "node:fs";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: `/*! highlight.js\n${readFileSync(new URL("./node_modules/highlight.js/LICENSE", import.meta.url), "utf8")}*/` },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view"],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: production,
  outfile: "main.js",
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
