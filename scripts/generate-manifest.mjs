import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPuzzle } from "../js/puzzle.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function isValidPuzzleId(id) {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

function readMeta(dir) {
  const file = path.join(dir, "meta.json");
  if (!fs.existsSync(file)) return { title: "", description: "", error: false };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { title: "", description: "", error: true };
    }
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const titleInvalid = data.title != null && typeof data.title !== "string";
    const descriptionInvalid = data.description != null && typeof data.description !== "string";
    return { title, description, error: titleInvalid || descriptionInvalid };
  } catch {
    return { title: "", description: "", error: true };
  }
}

export function listPuzzleIds(root = repoRoot) {
  const puzzlesDir = path.join(root, "puzzles");
  if (!fs.existsSync(puzzlesDir)) return [];
  return fs.readdirSync(puzzlesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

function puzzleFiles(root, id) {
  const dir = path.join(root, "puzzles", id);
  return {
    dir,
    gridPath: path.join(dir, "grid.csv"),
    cluesPath: path.join(dir, "clues.csv"),
  };
}

export function listIncompletePuzzleIds(root = repoRoot) {
  return listPuzzleIds(root).filter((id) => {
    const { gridPath, cluesPath } = puzzleFiles(root, id);
    return fs.existsSync(gridPath) !== fs.existsSync(cluesPath);
  });
}

export function createManifest(root = repoRoot) {
  const puzzles = [];
  for (const id of listPuzzleIds(root)) {
    const { dir, gridPath, cluesPath } = puzzleFiles(root, id);
    const hasGrid = fs.existsSync(gridPath);
    const hasClues = fs.existsSync(cluesPath);
    if (!hasGrid || !hasClues) continue;

    const meta = readMeta(dir);
    const entry = {
      id,
      title: meta.title || id,
      description: meta.description || "",
      rows: null,
      cols: null,
      across: null,
      down: null,
      error: false,
    };
    if (!isValidPuzzleId(id) || meta.error) {
      entry.error = true;
      puzzles.push(entry);
      continue;
    }
    const built = buildPuzzle(fs.readFileSync(gridPath, "utf8"), fs.readFileSync(cluesPath, "utf8"));
    if (!built.ok) {
      entry.error = true;
      puzzles.push(entry);
      continue;
    }
    entry.rows = built.puzzle.rows;
    entry.cols = built.puzzle.cols;
    entry.across = built.puzzle.clues.filter((clue) => clue.direction === "across").length;
    entry.down = built.puzzle.clues.filter((clue) => clue.direction === "down").length;
    puzzles.push(entry);
  }
  return { puzzles };
}

export function writeManifest(root = repoRoot) {
  const manifest = createManifest(root);
  const puzzlesDir = path.join(root, "puzzles");
  fs.mkdirSync(puzzlesDir, { recursive: true });
  fs.writeFileSync(path.join(puzzlesDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const id of listIncompletePuzzleIds(root)) {
    console.log(`${id}: grid.csv と clues.csv が揃うまで一覧に出しません`);
  }
  const errors = manifest.puzzles.filter((puzzle) => puzzle.error).map((puzzle) => puzzle.id);
  if (errors.length > 0) {
    console.log(`データエラーとして公開する問題: ${errors.join(", ")}`);
  }
  console.log(`catalog: ${manifest.puzzles.map((puzzle) => puzzle.id).join(", ") || "(none)"}`);
  return manifest;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const manifest = writeManifest();
  console.log(`wrote puzzles/manifest.json (${manifest.puzzles.length} puzzles)`);
}
