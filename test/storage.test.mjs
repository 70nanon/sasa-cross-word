import assert from "node:assert/strict";
import test from "node:test";
import { clearProgress, loadProgress, saveProgress } from "../js/storage.js";

const store = new Map();

globalThis.document = { baseURI: "https://example.com/sasa-cross-word/index.html" };
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, value),
  removeItem: (key) => store.delete(key),
};

test("keeps progress per puzzle and drops a save that no longer matches the grid", () => {
  store.clear();
  saveProgress("001", [["ね", ""], ["", ""]]);
  saveProgress("002", [["い"]]);
  assert.deepEqual(loadProgress("001", 2, 2), [["ね", ""], ["", ""]]);
  assert.deepEqual(loadProgress("002", 1, 1), [["い"]]);
  assert.equal(loadProgress("001", 3, 3), null);

  clearProgress("001");
  assert.equal(loadProgress("001", 2, 2), null);
  assert.deepEqual(loadProgress("002", 1, 1), [["い"]]);
});

test("removes the save when every cell is empty", () => {
  store.clear();
  saveProgress("001", [["ね"]]);
  saveProgress("001", [[""]]);
  assert.equal(store.size, 0);
});
