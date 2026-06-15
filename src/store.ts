/**
 * Persistence. Three small records in localStorage, all wrapped in
 * try/catch because storage can be unavailable (private windows, quota).
 * Nothing here is required for the site to work; it degrades to a
 * fresh-session experience.
 */
export interface Odometer {
  total: number;
  perKey: Record<string, number>;
  bestWpm: number;
}

import type { StyleId } from "./styles";

export interface Prefs {
  palette: number;
  style: StyleId;
  seismo: boolean;
  caption: boolean;
  chrome: boolean;
  motion: 0 | 1 | 2; // off | subtle | full
}

export interface SavedGlyph {
  ch: string;
  w: number;
}

export interface SavedSheet {
  lines: SavedGlyph[][];
  active: SavedGlyph[];
}

const ODO_KEY = "typef.odometer.v1";
const PREFS_KEY = "typef.prefs.v1";
const SHEET_KEY = "typef.sheet.v1";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable; live without it */
  }
}

export function loadOdometer(): Odometer {
  return read<Odometer>(ODO_KEY) ?? { total: 0, perKey: {}, bestWpm: 0 };
}

export function saveOdometer(odo: Odometer): void {
  write(ODO_KEY, odo);
}

const STYLE_IDS: StyleId[] = ["print", "clean", "ember", "tide", "frost", "gale"];

export function loadPrefs(): Prefs {
  const p = read<Partial<Prefs> & { finish?: string }>(PREFS_KEY);
  let style: StyleId = "print";
  if (p?.style && STYLE_IDS.includes(p.style)) style = p.style;
  else if (p?.finish === "clean") style = "clean";
  return {
    palette: typeof p?.palette === "number" ? p.palette : 0,
    style,
    seismo: p?.seismo !== false,
    caption: p?.caption !== false,
    chrome: p?.chrome !== false,
    motion: p?.motion === 0 || p?.motion === 1 ? p.motion : 2
  };
}

export function savePrefs(prefs: Prefs): void {
  write(PREFS_KEY, prefs);
}

export function loadSheet(): SavedSheet | null {
  const s = read<SavedSheet>(SHEET_KEY);
  if (!s || !Array.isArray(s.lines) || !Array.isArray(s.active)) return null;
  return s;
}

export function saveSheet(sheet: SavedSheet): void {
  write(SHEET_KEY, sheet);
}
