function prefix() {
  const directory = new URL(".", document.baseURI);
  return `sasa-crossword:v1:${directory.pathname}:`;
}

function keyFor(id) {
  return `${prefix()}${id}`;
}

function read(id) {
  try {
    const raw = localStorage.getItem(keyFor(id));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !Array.isArray(data.letters)) return null;
    return data;
  } catch {
    return null;
  }
}

export function loadProgress(id, rows, cols) {
  const data = read(id);
  if (!data || data.rows !== rows || data.cols !== cols || data.letters.length !== rows * cols) {
    return null;
  }
  const entries = [];
  for (let row = 0; row < rows; row += 1) {
    entries.push(data.letters.slice(row * cols, (row + 1) * cols).map((letter) => (typeof letter === "string" ? letter : "")));
  }
  return entries;
}

export function saveProgress(id, entries) {
  const rows = entries.length;
  const cols = rows ? entries[0].length : 0;
  const letters = entries.flat();
  if (letters.every((letter) => !letter)) {
    clearProgress(id);
    return;
  }
  const payload = JSON.stringify({ v: 1, rows, cols, letters });
  try {
    localStorage.setItem(keyFor(id), payload);
  } catch {
    // プライベートモードなどで保存できない場合もプレイは続ける。
  }
}

export function clearProgress(id) {
  try {
    localStorage.removeItem(keyFor(id));
  } catch {
    // 保存領域に触れなくてもリセット自体は画面上で完結させる。
  }
}
