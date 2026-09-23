import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPuzzle } from "../js/puzzle.js";
import { isValidPuzzleId, listPuzzleIds } from "./generate-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`validated ${ids.length} puzzle(s)`);
