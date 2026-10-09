/**
 * Save/load storage layer.
 * Full save game lives in IndexedDB (idb-keyval) — no size limits like
 * localStorage, no WASM bootstrap like sql.js. Export/import moves the same
 * GameSave as JSON files.
 */
import { get, set, del } from "idb-keyval";
import type { GameSave } from "@/types";

const SAVE_KEY = "fm-continental-save-v1";
const SAVE_VERSION = 1;

const hasBrowser = typeof window !== "undefined";

export async function initDatabase(): Promise<void> {
  // idb-keyval creates the store on demand; nothing else to do
  return Promise.resolve();
}

export async function saveGame(save: GameSave): Promise<void> {
  if (!hasBrowser) return;
  const payload: GameSave = { ...save, version: SAVE_VERSION, savedAt: Date.now() };
  await set(SAVE_KEY, payload);
}

export async function loadGame(): Promise<GameSave | undefined> {
  if (!hasBrowser) return undefined;
  const save = await get<GameSave>(SAVE_KEY);
  if (!save || save.version !== SAVE_VERSION) return undefined;
  return save;
}

export async function hasSave(): Promise<boolean> {
  if (!hasBrowser) return false;
  const save = await get<GameSave>(SAVE_KEY);
  return !!save && save.version === SAVE_VERSION;
}

export async function deleteSave(): Promise<void> {
  if (!hasBrowser) return;
  await del(SAVE_KEY);
}

/** Serialize a save to a JSON string (for manual file export). */
export function exportDatabase(save: GameSave): string {
  return JSON.stringify({ ...save, version: SAVE_VERSION, savedAt: Date.now() });
}

/** Parse + validate JSON imported from a file. Throws on bad data. */
export function importDatabase(json: string): GameSave {
  const data = JSON.parse(json) as GameSave;
  if (!data || typeof data !== "object") throw new Error("Invalid save file");
  if (data.version !== SAVE_VERSION) throw new Error("Unsupported save version");
  if (!data.world || !data.world.players || !data.userClubId) {
    throw new Error("Save file is missing world data");
  }
  return data;
}

/** Trigger a browser download of the save as JSON. */
export function downloadSave(save: GameSave, filename = "fm-continental-save.json"): void {
  if (!hasBrowser) return;
  const blob = new Blob([exportDatabase(save)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
