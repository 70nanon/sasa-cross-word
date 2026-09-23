import { buildPuzzle, directionLabel, graphemes, sameAnswer } from "./puzzle.js";
import { clearProgress, loadProgress, saveProgress } from "./storage.js";

const app = document.querySelector("#app");
const title = document.querySelector("#title");
const backButton = document.querySelector("#back");
const checkButton = document.querySelector("#check");
const resetButton = document.querySelector("#reset");
const progress = document.querySelector("#progress");
const status = document.querySelector("#status");
const dock = document.querySelector("#dock");
const dockClue = document.querySelector("#dock-clue");
const dirButton = document.querySelector("#dir-button");
const entry = document.querySelector("#entry");
const dialog = document.querySelector("#dialog");
const dialogTitle = document.querySelector("#dialog-title");
const dialogBody = document.querySelector("#dialog-body");
const dialogActions = document.querySelector("#dialog-actions");

const state = {
  puzzleId: null,
  meta: null,
  puzzle: null,
  entries: [],
  marks: [],
  cursor: null,
  direction: "across",
  clueTab: "across",
  clearShown: false,
  userSelected: false,
};

let routeToken = 0;
let composing = false;
let skipInput = false;
let recentText = "";

function asset(path) {
  return new URL(path, document.baseURI);
}

function setStatus(message) {
  status.textContent = message || "";
}

function setChrome({ playing, controls }) {
  document.body.classList.toggle("playing", Boolean(playing));
  backButton.hidden = !playing;
  checkButton.hidden = !controls;
  resetButton.hidden = !controls;
  progress.hidden = !controls;
  if (!controls) {
    dock.hidden = true;
    if (!document.body.contains(dock)) document.body.append(dock);
  }
}

function paragraph(text, className) {
  const element = document.createElement("p");
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function closeDialog() {
  if (dialog.open) dialog.close();
}

function openDialog({ title: heading, body, actions }) {
  entry.blur();
  dialogTitle.textContent = heading;
  dialogBody.textContent = body;
  dialogActions.replaceChildren();
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.primary ? "primary" : "ghost-button";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      closeDialog();
      action.onClick?.();
    });
    dialogActions.append(button);
  }
  if (dialog.open) dialog.close();
  dialog.showModal();
}

function renderMessage(heading, message) {
  const panel = document.createElement("section");
  panel.className = "panel";
  const h2 = document.createElement("h2");
  h2.textContent = heading;
  panel.append(h2, paragraph(message));
  app.replaceChildren(panel);
}

function renderErrors(errors) {
  const panel = document.createElement("section");
  panel.className = "panel";
  const h2 = document.createElement("h2");
  h2.textContent = "問題データを確認してください";
  const list = document.createElement("ul");
  list.className = "error-list";
  for (const item of errors) {
    const li = document.createElement("li");
    li.textContent = item.message;
    list.append(li);
  }
  panel.append(h2, paragraph("盤面は、位置を推測せずに表示を止めています。"), list);
  app.replaceChildren(panel);
}

async function fetchText(path) {
  const response = await fetch(asset(path), { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${path} を読み込めません（${response.status}）`);
  }
  return response.text();
}

function renderList(puzzles) {
  const intro = paragraph("遊びたい問題を選んでください。入力は問題ごとにこのブラウザへ保存されます。", "intro");
  const catalog = document.createElement("div");
  catalog.className = "catalog";
  if (puzzles.length === 0) {
    catalog.append(paragraph("問題がまだありません。puzzles フォルダに grid.csv と clues.csv を追加してください。"));
  }
  for (const puzzle of puzzles) {
    const card = document.createElement("article");
    card.className = "card";
    const id = paragraph(puzzle.id, "card-id");
    const heading = document.createElement("h2");
    heading.textContent = puzzle.title || puzzle.id;
    card.append(id, heading);
    if (puzzle.description) card.append(paragraph(puzzle.description));
    const meta = paragraph("", "card-meta");
    if (puzzle.error || puzzle.rows == null) {
      meta.textContent = "データを確認してください";
    } else {
      meta.textContent = `${puzzle.rows}×${puzzle.cols} ・ ヨコ ${puzzle.across} ・ タテ ${puzzle.down}`;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary";
    button.textContent = puzzle.error ? "内容を確認" : "遊ぶ";
    button.addEventListener("click", () => {
      location.hash = `#/p/${encodeURIComponent(puzzle.id)}`;
    });
    card.append(meta, button);
    catalog.append(card);
  }
  app.replaceChildren(intro, catalog);
}

async function showList() {
  const current = ++routeToken;
  closeDialog();
  setChrome({ playing: false, controls: false });
  setStatus("");
  title.textContent = "問題を選ぶ";
  document.title = "ささクロスワード";
  state.puzzle = null;
  app.replaceChildren(paragraph("読み込み中…", "intro"));
  try {
    const response = await fetch(asset("puzzles/manifest.json"), { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("puzzles/manifest.json を読み込めません。npm run manifest を実行してください。");
    }
    const manifest = await response.json();
    if (current !== routeToken) return;
    renderList(Array.isArray(manifest.puzzles) ? manifest.puzzles : []);
  } catch (cause) {
    if (current !== routeToken) return;
    renderMessage("問題一覧を読み込めません", cause.message);
  }
}

function emptyMatrix(puzzle, fill) {
  return puzzle.grid.map((row) => row.map(() => fill));
}

function sanitizeEntries() {
  const { grid } = state.puzzle;
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col] === "#") {
        state.entries[row][col] = "";
        continue;
      }
      const parts = graphemes(state.entries[row][col] || "").filter((part) => part.trim());
      state.entries[row][col] = parts[0] || "";
    }
  }
}

function persist() {
  saveProgress(state.puzzleId, state.entries);
}

function clueAt(row, col, direction) {
  return state.puzzle.clues.find((clue) => (
    clue.direction === direction
    && clue.cells.some((cell) => cell.row === row && cell.col === col)
  )) || null;
}

function chooseDirection(row, col, preferred) {
  const across = clueAt(row, col, "across");
  const down = clueAt(row, col, "down");
  if (preferred === "across" && across) return "across";
  if (preferred === "down" && down) return "down";
  if (across) return "across";
  if (down) return "down";
  return null;
}

function currentClue() {
  if (!state.cursor || !state.puzzle) return null;
  return clueAt(state.cursor.row, state.cursor.col, state.direction);
}

function selectCell(row, col, { toggle = false } = {}) {
  const preferred = toggle && state.userSelected
    ? (state.direction === "across" ? "down" : "across")
    : state.direction;
  const direction = chooseDirection(row, col, preferred);
  if (!direction) return;
  state.cursor = { row, col };
  state.direction = direction;
  state.clueTab = direction;
  state.userSelected = true;
  if (!composing) entry.value = "";
  updateBoard();
  entry.focus({ preventScroll: true });
}

function selectClue(clue) {
  const target = clue.cells.find((cell) => !state.entries[cell.row][cell.col]) || clue.cells[0];
  state.direction = clue.direction;
  state.clueTab = clue.direction;
  state.cursor = { row: target.row, col: target.col };
  state.userSelected = true;
  if (!composing) entry.value = "";
  updateBoard();
  entry.focus({ preventScroll: true });
}

function step(delta) {
  const clue = currentClue();
  if (!clue || !state.cursor) return;
  const index = clue.cells.findIndex((cell) => cell.row === state.cursor.row && cell.col === state.cursor.col);
  const next = clue.cells[index + delta];
  if (next) state.cursor = { row: next.row, col: next.col };
}

function moveBy(dRow, dCol) {
  if (!state.cursor) return;
  let row = state.cursor.row + dRow;
  let col = state.cursor.col + dCol;
  const { rows, cols, grid } = state.puzzle;
  while (row >= 0 && col >= 0 && row < rows && col < cols && grid[row][col] === "#") {
    row += dRow;
    col += dCol;
  }
  if (row < 0 || col < 0 || row >= rows || col >= cols) return;
  const direction = chooseDirection(row, col, dRow === 0 ? "across" : "down");
  if (!direction) return;
  state.cursor = { row, col };
  state.direction = direction;
  state.clueTab = direction;
  state.userSelected = true;
  updateBoard();
}

function toggleDirection() {
  if (!state.cursor) return;
  const next = state.direction === "across" ? "down" : "across";
  const direction = chooseDirection(state.cursor.row, state.cursor.col, next);
  if (!direction || direction === state.direction) return;
  state.direction = direction;
  state.clueTab = direction;
  updateBoard();
}

function jumpClue(delta) {
  const list = state.puzzle.clues.filter((clue) => clue.direction === state.direction);
  if (list.length === 0 || !state.cursor) return;
  const current = clueAt(state.cursor.row, state.cursor.col, state.direction);
  let index = list.indexOf(current);
  if (index < 0) index = 0;
  else index = (index + delta + list.length) % list.length;
  selectClue(list[index]);
}

function commitText(text) {
  const parts = graphemes(text).map((part) => part.trim()).filter((part) => part && part !== "#");
  if (!state.cursor || parts.length === 0) return;
  const signature = parts.join("");
  if (signature === recentText) return;
  recentText = signature;
  setTimeout(() => {
    if (recentText === signature) recentText = "";
  }, 50);
  for (const part of parts) {
    const { row, col } = state.cursor;
    state.entries[row][col] = part;
    state.marks[row][col] = "";
    step(1);
  }
  setStatus("");
  persist();
  updateBoard();
  maybeCelebrate();
}

function backspace() {
  if (!state.cursor) return;
  const { row, col } = state.cursor;
  if (state.entries[row][col]) {
    state.entries[row][col] = "";
    state.marks[row][col] = "";
  } else {
    step(-1);
    if (state.cursor.row !== row || state.cursor.col !== col) {
      state.entries[state.cursor.row][state.cursor.col] = "";
      state.marks[state.cursor.row][state.cursor.col] = "";
    }
  }
  state.clearShown = false;
  setStatus("");
  persist();
  updateBoard();
}

function isSolved() {
  const { grid } = state.puzzle;
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col] === "#") continue;
      if (!sameAnswer(state.entries[row][col], grid[row][col])) return false;
    }
  }
  return true;
}

function markSolved() {
  const { grid } = state.puzzle;
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col] !== "#") state.marks[row][col] = "correct";
    }
  }
}

function openClear() {
  const name = state.meta?.title || "クロスワード";
  openDialog({
    title: "クリア！",
    body: `「${name}」を最後まで解けました。`,
    actions: [
      { label: "閉じる" },
      { label: "一覧へ", primary: true, onClick: () => { location.hash = "#/"; } },
    ],
  });
}

function maybeCelebrate() {
  if (!state.puzzle || !isSolved()) {
    state.clearShown = false;
    return;
  }
  markSolved();
  updateBoard();
  setStatus("すべて正解です");
  if (state.clearShown) return;
  state.clearShown = true;
  openClear();
}

function judge() {
  if (!state.puzzle) return;
  let empty = false;
  let wrong = false;
  const { grid } = state.puzzle;
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col] === "#") continue;
      const letter = state.entries[row][col];
      if (!letter) {
        empty = true;
        state.marks[row][col] = "";
        continue;
      }
      if (sameAnswer(letter, grid[row][col])) state.marks[row][col] = "correct";
      else {
        state.marks[row][col] = "wrong";
        wrong = true;
      }
    }
  }
  updateBoard();
  if (!empty && !wrong) {
    state.clearShown = true;
    setStatus("すべて正解です");
    openClear();
    return;
  }
  if (empty && wrong) setStatus("未入力のマスと、赤いマスを確認してください");
  else if (empty) setStatus("未入力のマスがあります");
  else setStatus("赤いマスを確認してください");
}

function resetPuzzle() {
  if (!state.puzzle) return;
  clearProgress(state.puzzleId);
  state.entries = emptyMatrix(state.puzzle, "");
  state.marks = emptyMatrix(state.puzzle, "");
  state.clearShown = false;
  setStatus("");
  updateBoard();
}

function filledCount() {
  let total = 0;
  let filled = 0;
  const { grid } = state.puzzle;
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col] === "#") continue;
      total += 1;
      if (state.entries[row][col]) filled += 1;
    }
  }
  return { filled, total };
}

function fitGrid(wrap) {
  const grid = wrap.querySelector(".grid");
  if (!grid || !state.puzzle) return;
  const styles = getComputedStyle(grid);
  const gap = Number.parseFloat(styles.columnGap) || 0;
  const border = grid.offsetWidth - grid.clientWidth;
  const available = wrap.clientWidth - border;
  const raw = Math.floor((available - gap * (state.puzzle.cols - 1)) / state.puzzle.cols);
  const size = Math.max(32, Math.min(64, raw));
  wrap.style.setProperty("--cell", `${size}px`);
}

function renderGrid() {
  const { puzzle } = state;
  const wrap = document.createElement("div");
  wrap.className = "grid-wrap";
  const grid = document.createElement("div");
  grid.className = "grid";
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", "クロスワード盤面");
  grid.style.gridTemplateColumns = `repeat(${puzzle.cols}, var(--cell))`;
  grid.style.gridTemplateRows = `repeat(${puzzle.rows}, var(--cell))`;

  for (let row = 0; row < puzzle.rows; row += 1) {
    for (let col = 0; col < puzzle.cols; col += 1) {
      const black = puzzle.grid[row][col] === "#";
      const cell = document.createElement(black ? "div" : "button");
      cell.className = black ? "cell black" : "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      if (!black) {
        cell.type = "button";
        cell.tabIndex = -1;
        const num = document.createElement("span");
        num.className = "num";
        num.textContent = puzzle.labels[row][col].join(" ");
        const letter = document.createElement("span");
        letter.className = "letter";
        cell.append(num, letter);
      }
      grid.append(cell);
    }
  }

  grid.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell || cell.classList.contains("black")) return;
    event.preventDefault();
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const same = state.cursor?.row === row && state.cursor?.col === col;
    selectCell(row, col, { toggle: same });
  });

  wrap.append(grid);
  const observer = new ResizeObserver(() => fitGrid(wrap));
  observer.observe(wrap);
  requestAnimationFrame(() => fitGrid(wrap));
  return wrap;
}

function renderClueButton(clue) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "clue-button";
  button.dataset.direction = clue.direction;
  button.dataset.id = clue.id;
  const id = document.createElement("span");
  id.className = "clue-id";
  id.textContent = clue.id;
  const text = document.createElement("span");
  text.className = "clue-text";
  text.textContent = clue.clue;
  const length = document.createElement("span");
  length.className = "clue-len";
  length.textContent = `（${clue.cells.length}）`;
  button.append(id, text, length);
  button.addEventListener("click", () => selectClue(clue));
  return button;
}

function renderClues() {
  const column = document.createElement("div");
  column.className = "clue-column";
  const tabs = document.createElement("div");
  tabs.className = "clue-tabs";
  tabs.setAttribute("role", "tablist");
  const panels = document.createElement("div");
  panels.className = "clue-panels";

  for (const direction of ["across", "down"]) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.dataset.tab = direction;
    tab.setAttribute("role", "tab");
    tab.textContent = directionLabel(direction);
    tab.addEventListener("click", () => {
      state.clueTab = direction;
      updateBoard();
    });
    tabs.append(tab);

    const panel = document.createElement("section");
    panel.className = "clue-panel";
    panel.dataset.panel = direction;
    const heading = document.createElement("h2");
    heading.textContent = directionLabel(direction);
    const list = document.createElement("ol");
    list.className = "clue-list";
    for (const clue of state.puzzle.clues.filter((item) => item.direction === direction)) {
      const item = document.createElement("li");
      item.append(renderClueButton(clue));
      list.append(item);
    }
    panel.append(heading, list);
    panels.append(panel);
  }

  column.append(tabs, panels);
  return column;
}

function renderPlay() {
  const layout = document.createElement("div");
  layout.className = "play-layout";
  const board = document.createElement("div");
  board.className = "board-column";
  const banner = document.createElement("p");
  banner.id = "current-banner";
  banner.className = "current-banner";
  board.append(banner, renderGrid(), dock);
  layout.append(board, renderClues());
  app.replaceChildren(layout);
  dock.hidden = false;
}

function updateBoard() {
  if (!state.puzzle) return;
  const clue = currentClue();
  const banner = document.querySelector("#current-banner");
  const bannerText = clue
    ? `${clue.id} ${directionLabel(clue.direction)}　${clue.clue}（${clue.cells.length}）`
    : "マスを選んでください";
  if (banner) banner.textContent = bannerText;
  dockClue.textContent = clue
    ? `${clue.id} ${directionLabel(clue.direction)} ${clue.clue}`
    : "マスを選んでください";

  const across = state.cursor ? clueAt(state.cursor.row, state.cursor.col, "across") : null;
  const down = state.cursor ? clueAt(state.cursor.row, state.cursor.col, "down") : null;
  dirButton.disabled = !(across && down);
  dirButton.textContent = state.direction === "down" ? "タテ" : "ヨコ";
  dirButton.title = across && down ? "同じマスをもう一度タップしても方向を切り替えられます" : "";

  const activeCells = new Set((clue?.cells || []).map((cell) => `${cell.row}:${cell.col}`));
  for (const cell of app.querySelectorAll(".cell:not(.black)")) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    cell.querySelector(".letter").textContent = state.entries[row][col] || "";
    cell.classList.toggle("in-word", activeCells.has(`${row}:${col}`));
    cell.classList.toggle("current", state.cursor?.row === row && state.cursor?.col === col);
    cell.classList.toggle("correct", state.marks[row][col] === "correct");
    cell.classList.toggle("wrong", state.marks[row][col] === "wrong");
    const labels = state.puzzle.labels[row][col];
    const prefix = labels.length ? `${labels.join("、")}、` : "";
    cell.setAttribute("aria-label", `${prefix}${row + 1}行${col + 1}列、${state.entries[row][col] || "空"}`);
  }

  for (const button of app.querySelectorAll(".clue-button")) {
    const match = state.puzzle.clues.find((item) => item.direction === button.dataset.direction && item.id === button.dataset.id);
    const active = match && clue && match.direction === clue.direction && match.id === clue.id;
    if (active) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
    const filled = match?.cells.every((cell) => state.entries[cell.row][cell.col]) ?? false;
    button.classList.toggle("filled", filled);
  }

  for (const tab of app.querySelectorAll(".tab")) {
    tab.setAttribute("aria-selected", tab.dataset.tab === state.clueTab ? "true" : "false");
  }
  for (const panel of app.querySelectorAll(".clue-panel")) {
    panel.classList.toggle("is-hidden", panel.dataset.panel !== state.clueTab);
  }

  const active = app.querySelector('.clue-button[aria-current="true"]');
  const panel = active?.closest(".clue-panel");
  if (active && panel && panel.scrollHeight > panel.clientHeight + 1) {
    const panelBox = panel.getBoundingClientRect();
    const clueBox = active.getBoundingClientRect();
    if (clueBox.top < panelBox.top) panel.scrollTop -= panelBox.top - clueBox.top;
    else if (clueBox.bottom > panelBox.bottom) panel.scrollTop += clueBox.bottom - panelBox.bottom;
  }

  const count = filledCount();
  progress.textContent = `${count.filled}/${count.total}`;
}

async function showPuzzle(id) {
  const current = ++routeToken;
  closeDialog();
  setChrome({ playing: true, controls: false });
  setStatus("");
  state.puzzle = null;
  title.textContent = "読み込み中";
  document.title = "ささクロスワード";
  app.replaceChildren(paragraph("読み込み中…", "intro"));
  try {
    const response = await fetch(asset("puzzles/manifest.json"), { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("puzzles/manifest.json を読み込めません。npm run manifest を実行してください。");
    }
    const manifest = await response.json();
    if (current !== routeToken) return;
    const meta = (manifest.puzzles || []).find((puzzle) => puzzle.id === id);
    if (!meta) {
      title.textContent = "問題が見つかりません";
      renderMessage("問題が見つかりません", "一覧に戻って選び直すか、npm run manifest で一覧を更新してください。");
      return;
    }
    state.meta = meta;
    title.textContent = meta.title || id;
    document.title = `${meta.title || id} · ささクロスワード`;
    const [gridText, cluesText] = await Promise.all([
      fetchText(`puzzles/${id}/grid.csv`),
      fetchText(`puzzles/${id}/clues.csv`),
    ]);
    if (current !== routeToken) return;
    const built = buildPuzzle(gridText, cluesText);
    if (!built.ok) {
      renderErrors(built.errors);
      return;
    }
    state.puzzleId = id;
    state.puzzle = built.puzzle;
    state.entries = loadProgress(id, built.puzzle.rows, built.puzzle.cols) || emptyMatrix(built.puzzle, "");
    sanitizeEntries();
    state.marks = emptyMatrix(built.puzzle, "");
    state.direction = "across";
    state.clueTab = "across";
    state.clearShown = false;
    state.userSelected = false;
    state.cursor = null;
    renderPlay();
    setChrome({ playing: true, controls: true });
    const first = built.puzzle.clues.find((clue) => clue.direction === "across") || built.puzzle.clues[0];
    if (first) {
      const target = first.cells.find((cell) => !state.entries[cell.row][cell.col]) || first.cells[0];
      state.cursor = { row: target.row, col: target.col };
      state.direction = first.direction;
      state.clueTab = first.direction;
    }
    updateBoard();
    maybeCelebrate();
  } catch (cause) {
    if (current !== routeToken) return;
    renderMessage("問題を読み込めません", cause.message);
  }
}

function route() {
  const hash = location.hash || "#/";
  const match = hash.match(/^#\/p\/([A-Za-z0-9_-]+)$/);
  if (match) showPuzzle(decodeURIComponent(match[1]));
  else showList();
}

function bindEntry() {
  entry.addEventListener("compositionstart", () => {
    composing = true;
  });
  entry.addEventListener("compositionend", (event) => {
    composing = false;
    skipInput = true;
    const text = event.data || entry.value;
    entry.value = "";
    if (text) commitText(text);
    setTimeout(() => {
      skipInput = false;
    }, 0);
  });
  entry.addEventListener("input", (event) => {
    if (composing || event.isComposing || skipInput) {
      if (skipInput) entry.value = "";
      return;
    }
    const text = entry.value;
    if (!text) return;
    entry.value = "";
    commitText(text);
  });
  entry.addEventListener("keydown", (event) => {
    if (!state.puzzle || !state.cursor) return;
    if (event.isComposing || composing || event.key === "Process" || event.keyCode === 229) return;
    if (event.key === "Backspace") {
      event.preventDefault();
      backspace();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveBy(0, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveBy(0, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveBy(-1, 0);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveBy(1, 0);
    } else if (event.key === "Tab") {
      event.preventDefault();
      jumpClue(event.shiftKey ? -1 : 1);
    } else if (event.key === " ") {
      event.preventDefault();
      toggleDirection();
    }
  });
}

function bindViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const apply = () => {
    const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty("--keyboard-offset", `${offset}px`);
  };
  viewport.addEventListener("resize", apply);
  viewport.addEventListener("scroll", apply);
  apply();
}

backButton.addEventListener("click", () => {
  location.hash = "#/";
});
checkButton.addEventListener("click", judge);
resetButton.addEventListener("click", () => {
  openDialog({
    title: "最初からやり直す",
    body: "この問題の入力と答え合わせを消します。",
    actions: [
      { label: "キャンセル" },
      { label: "消す", primary: true, onClick: resetPuzzle },
    ],
  });
});
dirButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  toggleDirection();
  entry.focus({ preventScroll: true });
});

bindEntry();
bindViewport();
window.addEventListener("hashchange", route);
route();
