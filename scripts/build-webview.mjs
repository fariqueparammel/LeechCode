import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.env.WATCH === "1";

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(root, "webview-ui/index.tsx")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  jsx: "automatic",
  loader: { ".css": "css", ".svg": "dataurl" },
  outfile: path.join(root, "dist/webview/main.js"),
  minify: !watch,
  sourcemap: watch,
  // React reads process.env.NODE_ENV; esbuild does not replace it automatically, so without this
  // the webview throws "process is not defined" at runtime.
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  logLevel: "info"
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("WebChat webview: watching for changes…");
} else {
  await build(options);
  console.log("WebChat webview bundled -> dist/webview/main.js (+ main.css)");
}
