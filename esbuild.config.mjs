import esbuild from "esbuild";
import process from "process";
import builtinModules from "builtin-modules";
import { copyFileSync } from "fs";

const dev = process.argv.includes("--dev");
const banner = `/*
  Obsidian Pensieve — AI-enhanced note management
  https://github.com/sebastienlevert/obsidian-pensieve
*/`;

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtinModules.map((m) => `node:${m}`),
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: dev ? "inline" : false,
  treeShaking: true,
  outfile: "main.js",
  platform: "node",
  loader: {
    ".css": "text",
  },
  minify: !dev,
});

if (dev) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();

  copyFileSync("src/styles.css", "styles.css");
  console.log("Copied styles.css to root");
}
