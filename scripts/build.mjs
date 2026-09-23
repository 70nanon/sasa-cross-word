import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeManifest } from "./generate-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

writeManifest(root);
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of ["index.html", ".nojekyll", "favicon.svg"]) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}
copyDir(path.join(root, "css"), path.join(dist, "css"));
copyDir(path.join(root, "js"), path.join(dist, "js"));
copyDir(path.join(root, "puzzles"), path.join(dist, "puzzles"));
console.log("built dist/");
