/**
 * RFC 4180 に沿った CSV パーサ。
 * 引用符、引用符内のカンマ・改行、"" によるエスケープ、CRLF、BOM を扱う。
 */
export function parseCsv(text) {
  let source = String(text ?? "");
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);

  const rows = [];
  let row = [];
  let field = "";
  let mode = "start";
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = "";
    mode = "start";
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (index < source.length) {
    const char = source[index];

    if (mode === "quoted") {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        mode = "bare";
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (mode === "start" && char === '"') {
      mode = "quoted";
      index += 1;
      continue;
    }

    if (char === ",") {
      pushField();
      index += 1;
      continue;
    }

    if (char === "\n" || char === "\r") {
      pushField();
      pushRow();
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      index += 1;
      continue;
    }

    field += char;
    mode = "bare";
    index += 1;
  }

  if (mode === "quoted") {
    const error = new Error("引用符が閉じられていません");
    error.code = "csv";
    throw error;
  }

  if (mode !== "start" || row.length > 0) {
    pushField();
    pushRow();
  }

  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === "") rows.pop();
  }

  return rows;
}
