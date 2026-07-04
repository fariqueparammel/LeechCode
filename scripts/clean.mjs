import { readdir, rm } from "node:fs/promises";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
await rm(new URL("../demo/generated-web-app", import.meta.url), { recursive: true, force: true });
await rm(new URL("../demo/chatgpt-generated-web-app", import.meta.url), { recursive: true, force: true });

const root = new URL("../", import.meta.url);
const entries = await readdir(root);

await Promise.all(
  entries
    .filter((entry) => entry.endsWith(".vsix"))
    .map((entry) => rm(new URL(entry, root), { force: true }))
);
