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

export interface Prefs {
  palette: number;
  finish: "print" | "clean";
  seismo: boolean;
  caption: boolean;
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

export function loadPrefs(): Prefs {
  const p = read<Partial<Prefs>>(PREFS_KEY);
  return {
    palette: typeof p?.palette === "number" ? p.palette : 0,
    finish: p?.finish === "clean" ? "clean" : "print",
    seismo: p?.seismo !== false,
    caption: p?.caption !== false,
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
