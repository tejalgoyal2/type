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
  bestStreak: number;
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

export interface SavedLine {
  glyphs: SavedGlyph[];
  /** True when the line wrapped at the margin rather than ending in Enter. */
  soft: boolean;
}

export interface SavedSheet {
  lines: SavedLine[];
  active: SavedGlyph[];
}

const ODO_KEY = "typef.odometer.v1";
const PREFS_KEY = "typef.prefs.v1";
const SHEET_KEY_V1 = "typef.sheet.v1";
const SHEET_KEY = "typef.sheet.v2";
const UNDO_KEY = "typef.undo.v2";

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

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function loadOdometer(): Odometer {
  const o = read<Partial<Odometer>>(ODO_KEY);
  return {
    total: typeof o?.total === "number" ? o.total : 0,
    perKey: o?.perKey && typeof o.perKey === "object" ? o.perKey : {},
    bestWpm: typeof o?.bestWpm === "number" ? o.bestWpm : 0,
    bestStreak: typeof o?.bestStreak === "number" ? o.bestStreak : 0
  };
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

/*
 * Sheets are stored compactly so a long piece of writing fits easily:
 * each line is its text plus one character per glyph for the settled
 * weight (400 + 3 * index into a base64url alphabet, which covers the whole
 * 400..589 record range at finer than the font's 10-unit steps).
 */
const W64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

type PackedLine = [text: string, weights: string, soft?: 1];

interface PackedSheet {
  v: 2;
  lines: PackedLine[];
  active: PackedLine;
}

function packGlyphs(gs: SavedGlyph[]): [string, string] {
  let text = "";
  let weights = "";
  for (const g of gs) {
    text += g.ch;
    weights += W64[Math.max(0, Math.min(63, Math.round((g.w - 400) / 3)))];
  }
  return [text, weights];
}

function unpackGlyphs(text: unknown, weights: unknown): SavedGlyph[] {
  if (typeof text !== "string") return [];
  const ws = typeof weights === "string" ? weights : "";
  return Array.from(text).map((ch, i) => {
    const k = W64.indexOf(ws[i] ?? "A");
    return { ch, w: 400 + 3 * Math.max(0, k) };
  });
}

function pack(sheet: SavedSheet): PackedSheet {
  return {
    v: 2,
    lines: sheet.lines.map((l) => {
      const [t, w] = packGlyphs(l.glyphs);
      return l.soft ? [t, w, 1] : [t, w];
    }),
    active: packGlyphs(sheet.active)
  };
}

function unpack(p: PackedSheet | null): SavedSheet | null {
  if (!p || p.v !== 2 || !Array.isArray(p.lines) || !Array.isArray(p.active)) return null;
  return {
    lines: p.lines
      .filter((l) => Array.isArray(l))
      .map((l) => ({ glyphs: unpackGlyphs(l[0], l[1]), soft: l[2] === 1 })),
    active: unpackGlyphs(p.active[0], p.active[1])
  };
}

export function loadSheet(): SavedSheet | null {
  const v2 = unpack(read<PackedSheet>(SHEET_KEY));
  if (v2) return v2;
  // One-time migration from the v1 format (glyph objects, no wrap flag).
  const v1 = read<{ lines: SavedGlyph[][]; active: SavedGlyph[] }>(SHEET_KEY_V1);
  if (!v1 || !Array.isArray(v1.lines) || !Array.isArray(v1.active)) return null;
  return { lines: v1.lines.map((glyphs) => ({ glyphs, soft: false })), active: v1.active };
}

export function saveSheet(sheet: SavedSheet): void {
  write(SHEET_KEY, pack(sheet));
  remove(SHEET_KEY_V1);
}

/** The last cleared sheet, kept so Ctrl+Z still works after a reload. */
export function loadUndo(): SavedSheet | null {
  return unpack(read<PackedSheet>(UNDO_KEY));
}

export function saveUndo(sheet: SavedSheet | null): void {
  if (sheet) write(UNDO_KEY, pack(sheet));
  else remove(UNDO_KEY);
}
