import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../js/csv.js";
import { buildPuzzle, normalizeAnswer, sameAnswer } from "../js/puzzle.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("parses quotes, commas, newlines, escapes, CRLF, and BOM", () => {
  const text = `\uFEFFid,clue\r\n1,"雨の日にさす、道具"\r\n2,"行が\n分かれる""引用"""\n`;
  assert.deepEqual(parseCsv(text), [
    ["id", "clue"],
    ["1", "雨の日にさす、道具"],
    ["2", "行が\n分かれる\"引用\""],
  ]);
});

test("normalizes kana width and choon marks without collapsing つ and っ", () => {
  assert.equal(normalizeAnswer("ネコ"), "ねこ");
  assert.equal(normalizeAnswer("ｳﾐ"), "うみ");
  assert.equal(normalizeAnswer("か－"), "かー");
  assert.equal(normalizeAnswer("カー"), "かー");
  assert.equal(sameAnswer("ネコ", "ねこ"), true);
  assert.equal(sameAnswer("つ", "っ"), false);
  assert.equal(sameAnswer("", "ね"), false);
});

test("builds the sample puzzle at the expected positions", () => {
  const grid = fs.readFileSync(path.join(root, "puzzles/001/grid.csv"), "utf8");
  const clues = fs.readFileSync(path.join(root, "puzzles/001/clues.csv"), "utf8");
  const result = buildPuzzle(grid, clues);
  assert.equal(result.ok, true, result.errors?.map((error) => error.message).join("\n"));
  const placed = Object.fromEntries(result.puzzle.clues.map((clue) => [`${clue.id}:${clue.direction}`, [clue.row, clue.col, clue.answer]]));
  assert.deepEqual(placed["1:across"], [0, 0, "かわ"]);
  assert.deepEqual(placed["1:down"], [0, 0, "かさ"]);
  assert.deepEqual(placed["2:down"], [0, 1, "わか"]);
  assert.deepEqual(placed["3:across"], [0, 3, "そら"]);
  assert.deepEqual(placed["4:across"], [1, 0, "さかな"]);
  assert.deepEqual(placed["5:down"], [1, 2, "なつめ"]);
  assert.deepEqual(placed["6:across"], [2, 2, "つき"]);
  assert.deepEqual(placed["7:across"], [3, 1, "あめ"]);
  assert.deepEqual(placed["7:down"], [3, 1, "あな"]);
  assert.deepEqual(placed["8:down"], [3, 4, "ゆみ"]);
  assert.deepEqual(placed["9:across"], [4, 0, "はな"]);
  assert.deepEqual(placed["10:across"], [4, 3, "うみ"]);
  assert.deepEqual(result.puzzle.labels[0][0], ["1"]);
  assert.deepEqual(result.puzzle.labels[3][1], ["7"]);
  assert.equal(result.puzzle.clues.length, 12);
});

test("matches katakana clues to a hiragana grid", () => {
  const result = buildPuzzle(
    "ね,こ\nい,ぬ\n",
    "id,direction,clue,answer\n1,across,a,ネコ\n2,across,b,イヌ\n1,down,c,ネイ\n2,down,d,コヌ\n",
  );
  assert.equal(result.ok, true, result.errors?.map((error) => error.message).join("\n"));
  assert.equal(result.puzzle.clues.find((clue) => clue.id === "1" && clue.direction === "across").answer, "ねこ");
});

test("does not guess when the same answer appears twice", () => {
  const result = buildPuzzle(
    "あ,い\nあ,い\n",
    "id,direction,clue,answer\n1,across,x,あい\n1,down,p,ああ\n2,down,q,いい\n",
  );
  assert.equal(result.ok, false);
  assert.equal(result.puzzle, null);
  const ambiguous = result.errors.find((error) => error.code === "clue-ambiguous");
  assert.ok(ambiguous);
  assert.match(ambiguous.message, /行1列1/);
  assert.match(ambiguous.message, /行2列1/);
});

test("uses optional row and col to disambiguate", () => {
  const result = buildPuzzle(
    "あ,い\nあ,い\n",
    "id,direction,clue,answer,row,col\n1,across,x,あい,1,1\n2,across,y,あい,2,1\n1,down,p,ああ,1,1\n2,down,q,いい,1,2\n",
  );
  assert.equal(result.ok, true, result.errors?.map((error) => error.message).join("\n"));
  const across = result.puzzle.clues.filter((clue) => clue.direction === "across");
  assert.deepEqual(across.map((clue) => [clue.id, clue.row]), [["1", 0], ["2", 1]]);
});

test("accepts headerless rows and Japanese direction names", () => {
  const result = buildPuzzle(
    "ね,こ\nい,ぬ\n",
    "1,ヨコ,a,ねこ\n2,ヨコ,b,いぬ\n1,タテ,c,ねい\n2,タテ,d,こぬ\n",
  );
  assert.equal(result.ok, true, result.errors?.map((error) => error.message).join("\n"));
});

test("reports a missing clue instead of dropping the word", () => {
  const result = buildPuzzle("ね,こ\nい,ぬ\n", "id,direction,clue,answer\n1,across,a,ねこ\n");
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "word-unclued"));
});

test("rejects a ragged grid and a multi-character cell", () => {
  const ragged = buildPuzzle("ね,こ\nい\n", "id,direction,clue,answer\n");
  assert.ok(ragged.errors.some((error) => error.code === "grid-ragged" || error.code === "clue-header" || error.code === "grid-cell"));
  const wide = buildPuzzle("ねこ\n", "id,direction,clue,answer\n");
  assert.ok(wide.errors.some((error) => error.code === "grid-cell"));
});

test("reports a conflicting second clue for the same word", () => {
  const result = buildPuzzle(
    "ね,こ\nい,ぬ\n",
    "id,direction,clue,answer\n1,across,a,ねこ\n2,across,b,ねこ\n1,down,c,ねい\n2,down,d,こぬ\n",
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "word-conflict"));
});
