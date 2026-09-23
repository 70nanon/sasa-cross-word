import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPuzzle } from "../js/puzzle.js";
import { createManifest, isValidPuzzleId, listPuzzleIds } from "./generate-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

const problems = [];
const ids = listPuzzleIds(root);

if (!fs.existsSync(path.join(root, "puzzles"))) {
  problems.push("puzzles ディレクトリがありません");
}

for (const id of ids) {
  const dir = path.join(root, "puzzles", id);
  if (!isValidPuzzleId(id)) {
    problems.push(`${id}: フォルダ名は英数字、ハイフン、アンダースコアだけにしてください`);
  }
  const gridPath = path.join(dir, "grid.csv");
  const cluesPath = path.join(dir, "clues.csv");
  if (!fs.existsSync(gridPath)) problems.push(`${id}: grid.csv がありません`);
  if (!fs.existsSync(cluesPath)) problems.push(`${id}: clues.csv がありません`);
  const metaPath = path.join(dir, "meta.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
        problems.push(`${id}: meta.json はオブジェクトにしてください`);
      }
    } catch (cause) {
      problems.push(`${id}: meta.json を読めません (${cause.message})`);
    }
  }
  if (fs.existsSync(gridPath) && fs.existsSync(cluesPath)) {
    const built = buildPuzzle(fs.readFileSync(gridPath, "utf8"), fs.readFileSync(cluesPath, "utf8"));
    if (!built.ok) {
      for (const item of built.errors) problems.push(`${id}: ${item.message}`);
    }
  }
}

const manifestPath = path.join(root, "puzzles", "manifest.json");
if (!fs.existsSync(manifestPath)) {
  problems.push("puzzles/manifest.json がありません。npm run manifest を実行してください。");
} else {
  const actual = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const expected = createManifest(root);
  if (JSON.stringify(sortKeys(actual)) !== JSON.stringify(sortKeys(expected))) {
    problems.push("puzzles/manifest.json が最新ではありません。npm run manifest を実行してください。");
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`validated ${ids.length} puzzle(s)`);
