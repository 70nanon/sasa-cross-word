import { parseCsv } from "./csv.js";

const MAX_SIZE = 40;

const HEADER_ALIASES = {
  id: ["id", "number", "番号"],
  direction: ["direction", "dir", "方向"],
  clue: ["clue", "ヒント", "カギ", "かぎ"],
  answer: ["answer", "答え", "正解"],
  row: ["row", "行"],
  col: ["col", "column", "列"],
};

const DIRECTION_ALIASES = new Map([
  ["across", "across"],
  ["down", "down"],
  ["ヨコ", "across"],
  ["よこ", "across"],
  ["横", "across"],
  ["タテ", "down"],
  ["たて", "down"],
  ["縦", "down"],
]);

const CHOON_PATTERN = /[\u002D\u30FC\uFF0D\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE63\uFF70\u301C\uFF5E]/g;

export function graphemes(value) {
  const text = String(value ?? "");
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
  }
  return [...text];
}

/** 判定用の正規化。表示用の文字列は変えない。 */
export function normalizeAnswer(value) {
  let text = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
  text = text.replace(/[\u30A1-\u30F6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
  text = text.replace(CHOON_PATTERN, "ー");
  return text.toLowerCase();
}

export function sameAnswer(left, right) {
  const a = normalizeAnswer(left);
  const b = normalizeAnswer(right);
  return a.length > 0 && a === b;
}

export function directionLabel(direction) {
  return direction === "down" ? "タテ" : "ヨコ";
}

function error(code, message) {
  return { code, message };
}

function positionLabel(row, col) {
  return `行${row + 1}列${col + 1}`;
}

function parseGrid(text) {
  let table;
  try {
    table = parseCsv(text);
  } catch (cause) {
    return { errors: [error("csv", `grid.csv: ${cause.message}`)] };
  }

  const rows = table.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) {
    return { errors: [error("grid-empty", "grid.csv に盤面がありません")] };
  }
  if (rows.length > MAX_SIZE) {
    return { errors: [error("grid-size", `盤面が大きすぎます（最大 ${MAX_SIZE} 行）`)] };
  }

  const width = rows[0].length;
  if (width === 0 || width > MAX_SIZE) {
    return { errors: [error("grid-size", `盤面が大きすぎます（最大 ${MAX_SIZE} 列）`)] };
  }

  const errors = [];
  const grid = [];

  rows.forEach((row, rowIndex) => {
    if (row.length !== width) {
      errors.push(error("grid-ragged", `grid.csv の行の長さが揃っていません（1行目は${width}列、${rowIndex + 1}行目は${row.length}列）`));
      return;
    }
    const parsed = [];
    row.forEach((cell, colIndex) => {
      const value = cell.trim();
      if (value === "#") {
        parsed.push("#");
        return;
      }
      const parts = graphemes(value);
      if (parts.length !== 1) {
        errors.push(error("grid-cell", `grid.csv の${positionLabel(rowIndex, colIndex)}は1文字にしてください（いま: ${JSON.stringify(value || "")}）`));
        parsed.push("");
        return;
      }
      parsed.push(parts[0]);
    });
    grid.push(parsed);
  });

  if (errors.length > 0) return { errors };
  return { grid };
}

function headerIndex(headerRow) {
  const names = headerRow.map((cell) => cell.trim().toLowerCase());
  const index = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const found = names.findIndex((name) => aliases.includes(name));
    if (found >= 0) index[key] = found;
  }
  return index;
}

function isHeaderRow(row) {
  const index = headerIndex(row);
  return index.direction != null && index.answer != null;
}

function cellAt(row, index) {
  if (index == null || index >= row.length) return "";
  return row[index] ?? "";
}

function parseOptionalNumber(raw, label, line) {
  const value = raw.trim();
  if (value === "") return { value: null };
  if (!/^[1-9]\d*$/.test(value)) {
    return { error: error("clue-field", `clues.csv ${line}行目の${label}は1以上の整数にしてください`) };
  }
  return { value: Number(value) };
}

function parseClues(text) {
  let table;
  try {
    table = parseCsv(text);
  } catch (cause) {
    return { errors: [error("csv", `clues.csv: ${cause.message}`)] };
  }

  const records = table
    .map((row, index) => ({ row, line: index + 1 }))
    .filter(({ row }) => row.some((cell) => String(cell).trim() !== ""));
  if (records.length === 0) {
    return { errors: [error("clue-empty", "clues.csv にカギがありません")] };
  }

  const errors = [];
  const clues = [];
  let start = 0;
  let columns;

  if (isHeaderRow(records[0].row)) {
    columns = headerIndex(records[0].row);
    for (const key of ["id", "direction", "clue", "answer"]) {
      if (columns[key] == null) {
        errors.push(error("clue-header", `clues.csv の見出しに ${key} 列がありません`));
      }
    }
    start = 1;
  }

  if (errors.length > 0) return { errors };

  for (let index = start; index < records.length; index += 1) {
    const row = records[index].row;
    const line = records[index].line;
    let id;
    let directionRaw;
    let clueText;
    let answer;
    let rowRaw = "";
    let colRaw = "";

    if (columns) {
      id = cellAt(row, columns.id).trim();
      directionRaw = cellAt(row, columns.direction).trim();
      clueText = cellAt(row, columns.clue).trim();
      answer = cellAt(row, columns.answer).trim();
      rowRaw = cellAt(row, columns.row);
      colRaw = cellAt(row, columns.col);
    } else if (row.length === 4 || row.length === 6) {
      id = row[0].trim();
      directionRaw = row[1].trim();
      clueText = row[2].trim();
      answer = row[3].trim();
      if (row.length === 6) {
        rowRaw = row[4];
        colRaw = row[5];
      }
    } else {
      errors.push(error("clue-field", `clues.csv ${line}行目の列数が正しくありません（id,direction,clue,answer の4列、または row,col を足した6列）`));
      continue;
    }

    if (!id || !directionRaw || !clueText || !answer) {
      errors.push(error("clue-field", `clues.csv ${line}行目の id / direction / clue / answer は空にできません`));
      continue;
    }

    const directionKey = DIRECTION_ALIASES.get(directionRaw.toLowerCase()) || DIRECTION_ALIASES.get(directionRaw);
    if (!directionKey) {
      errors.push(error("clue-direction", `clues.csv ${line}行目の方向「${directionRaw}」は across または down にしてください`));
      continue;
    }

    const rowNumber = parseOptionalNumber(rowRaw, "row", line);
    const colNumber = parseOptionalNumber(colRaw, "col", line);
    if (rowNumber.error) errors.push(rowNumber.error);
    if (colNumber.error) errors.push(colNumber.error);
    if (rowNumber.error || colNumber.error) continue;
    if ((rowNumber.value == null) !== (colNumber.value == null)) {
      errors.push(error("clue-field", `clues.csv ${line}行目は row と col を両方指定してください`));
      continue;
    }

    clues.push({
      id,
      direction: directionKey,
      clue: clueText,
      answer,
      row: rowNumber.value,
      col: colNumber.value,
      line,
    });
  }

  return { clues, errors };
}

function extractWords(grid) {
  const words = [];
  const height = grid.length;
  const width = grid[0].length;

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (grid[row][col] === "#") continue;

      const acrossStart = col === 0 || grid[row][col - 1] === "#";
      if (acrossStart) {
        let answer = "";
        let cursor = col;
        while (cursor < width && grid[row][cursor] !== "#") {
          answer += grid[row][cursor];
          cursor += 1;
        }
        if (graphemes(answer).length >= 2) {
          words.push({ direction: "across", row, col, answer });
        }
      }

      const downStart = row === 0 || grid[row - 1][col] === "#";
      if (downStart) {
        let answer = "";
        let cursor = row;
        while (cursor < height && grid[cursor][col] !== "#") {
          answer += grid[cursor][col];
          cursor += 1;
        }
        if (graphemes(answer).length >= 2) {
          words.push({ direction: "down", row, col, answer });
        }
      }
    }
  }

  return words;
}

function cellsFor(word) {
  const length = graphemes(word.answer).length;
  const cells = [];
  for (let offset = 0; offset < length; offset += 1) {
    cells.push(word.direction === "across"
      ? { row: word.row, col: word.col + offset }
      : { row: word.row + offset, col: word.col });
  }
  return cells;
}

function wordKey(word) {
  return `${word.direction}:${word.row}:${word.col}`;
}

/**
 * grid.csv と clues.csv から遊べる問題を作る。
 * 開始位置は答えの照合で決める。同じ方向に同じ答えが複数あるときは
 * row/col（1始まり）が無ければエラーにし、勝手に選ばない。
 */
export function buildPuzzle(gridText, cluesText) {
  const gridResult = parseGrid(gridText);
  const clueResult = parseClues(cluesText);
  const errors = [...(gridResult.errors ?? []), ...(clueResult.errors ?? [])];
  if (!gridResult.grid || !clueResult.clues) {
    return { ok: false, errors, puzzle: null };
  }

  const grid = gridResult.grid;
  const words = extractWords(grid);
  if (words.length === 0) {
    errors.push(error("grid-empty", "2文字以上の単語が盤面にありません"));
  }

  const seenIds = new Set();
  const placed = [];
  const used = new Set();

  for (const clue of clueResult.clues ?? []) {
    const idKey = `${clue.direction}:${clue.id}`;
    if (seenIds.has(idKey)) {
      errors.push(error("clue-duplicate", `カギ番号 ${clue.id}（${directionLabel(clue.direction)}）が重複しています`));
      continue;
    }
    seenIds.add(idKey);

    const wanted = normalizeAnswer(clue.answer);
    let candidates = words.filter((word) => word.direction === clue.direction && normalizeAnswer(word.answer) === wanted);

    if (clue.row != null && clue.col != null) {
      const row = clue.row - 1;
      const col = clue.col - 1;
      const atPosition = candidates.filter((word) => word.row === row && word.col === col);
      if (atPosition.length === 0) {
        const where = candidates.map((word) => positionLabel(word.row, word.col)).join("、");
        errors.push(error(
          "clue-position",
          where
            ? `カギ ${clue.id}（${directionLabel(clue.direction)}）の開始位置 ${positionLabel(row, col)} には「${clue.answer}」がありません。候補は ${where} です`
            : `カギ ${clue.id}（${directionLabel(clue.direction)}）の答え「${clue.answer}」が盤面にありません`,
        ));
        continue;
      }
      candidates = atPosition;
    }

    if (candidates.length === 0) {
      errors.push(error("clue-unmatched", `カギ ${clue.id}（${directionLabel(clue.direction)}）の答え「${clue.answer}」が盤面の${directionLabel(clue.direction)}に見つかりません`));
      continue;
    }

    if (candidates.length > 1) {
      const where = candidates.map((word) => positionLabel(word.row, word.col)).join("、");
      errors.push(error("clue-ambiguous", `カギ ${clue.id}（${directionLabel(clue.direction)}）の答え「${clue.answer}」が複数あります（${where}）。row と col で開始位置を指定してください`));
      continue;
    }

    const word = candidates[0];
    const key = wordKey(word);
    if (used.has(key)) {
      errors.push(error("word-conflict", `${directionLabel(word.direction)}「${word.answer}」（${positionLabel(word.row, word.col)}）に複数のカギが対応しています`));
      continue;
    }
    used.add(key);
    placed.push({
      id: clue.id,
      direction: word.direction,
      clue: clue.clue,
      answer: word.answer,
      row: word.row,
      col: word.col,
      cells: cellsFor(word),
    });
  }

  for (const word of words) {
    if (!used.has(wordKey(word))) {
      errors.push(error("word-unclued", `${directionLabel(word.direction)}の語「${word.answer}」（${positionLabel(word.row, word.col)}）に対応するカギがありません`));
    }
  }

  if (errors.length > 0) return { ok: false, errors, puzzle: null };

  const labels = Array.from({ length: grid.length }, () => Array.from({ length: grid[0].length }, () => []));
  for (const clue of placed) {
    const bucket = labels[clue.row][clue.col];
    if (!bucket.includes(clue.id)) bucket.push(clue.id);
  }
  for (const row of labels) {
    for (const bucket of row) {
      bucket.sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
    }
  }

  placed.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === "across" ? -1 : 1;
    return a.id.localeCompare(b.id, "ja", { numeric: true });
  });

  return {
    ok: true,
    errors: [],
    puzzle: {
      rows: grid.length,
      cols: grid[0].length,
      grid,
      labels,
      clues: placed,
    },
  };
}
