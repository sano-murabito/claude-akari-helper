import type { Board } from './types';

const AUTO_SAVE_KEY = 'akari-autosave';
const NAMED_SAVES_KEY = 'akari-named-saves';

interface AutoSaveData {
  board: Board;
  savedAt: string;
}

export interface NamedSave {
  name: string;
  board: Board;
  savedAt: string;
}

export function autoSave(board: Board): void {
  const data: AutoSaveData = { board, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable (e.g. private browsing quota exceeded)
  }
}

export function loadAutoSave(): { board: Board; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutoSaveData;
  } catch {
    return null;
  }
}

export function listNamedSaves(): NamedSave[] {
  try {
    const raw = localStorage.getItem(NAMED_SAVES_KEY);
    return raw ? (JSON.parse(raw) as NamedSave[]) : [];
  } catch {
    return [];
  }
}

export function namedSave(name: string, board: Board): void {
  const saves = listNamedSaves().filter(s => s.name !== name);
  saves.unshift({ name, board, savedAt: new Date().toISOString() });
  try {
    localStorage.setItem(NAMED_SAVES_KEY, JSON.stringify(saves));
  } catch {
    // ignore
  }
}

export function deleteNamedSave(name: string): void {
  const saves = listNamedSaves().filter(s => s.name !== name);
  try {
    localStorage.setItem(NAMED_SAVES_KEY, JSON.stringify(saves));
  } catch {
    // ignore
  }
}
