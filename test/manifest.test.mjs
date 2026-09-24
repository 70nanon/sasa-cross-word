import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createManifest, listIncompletePuzzleIds } from "../scripts/generate-manifest.mjs";

const grid = "ね,こ\nい,ぬ\n";
const clues = `id,direction,clue,answer
1,across,a,ねこ
2,across,b,いぬ
1,down,c,ねい
2,down,d,こぬ
`;

function writePuzzle(root, id, files) {
  const dir = path.join(root, "puzzles", id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents);
  }
}

test("publishes folders that contain both csv files and skips a half-uploaded folder", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sasa-puzzles-"));
  writePuzzle(root, "002", { "grid.csv": grid, "clues.csv": clues });
  writePuzzle(root, "010", { "grid.csv": grid, "clues.csv": clues });
  writePuzzle(root, "003", { "grid.csv": grid });

  const manifest = createManifest(root);
  assert.deepEqual(manifest.puzzles.map((puzzle) => puzzle.id), ["002", "010"]);
  assert.equal(manifest.puzzles[0].title, "002");
  assert.equal(manifest.puzzles[0].error, false);
  assert.equal(manifest.puzzles[0].rows, 2);
  assert.deepEqual(listIncompletePuzzleIds(root), ["003"]);
});

test("keeps an invalid puzzle in the catalog so the site can show the error", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sasa-puzzles-"));
  writePuzzle(root, "004", { "grid.csv": "ねこ\n", "clues.csv": clues });
  const manifest = createManifest(root);
  assert.equal(manifest.puzzles.length, 1);
  assert.equal(manifest.puzzles[0].id, "004");
  assert.equal(manifest.puzzles[0].error, true);
});
