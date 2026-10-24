/**
 * Colorways. The page takes its whole look from a keycap set: the desk,
 * the case, alphas, modifiers, the accent keys, and the ink you write in.
 * PageUp / PageDown cycles them; one is hidden.
 */
export type RGB = [number, number, number];

export interface Way {
  id: string;
  dark: boolean;
  desk: RGB;
  desk2: RGB;
  ink: RGB;
  ghost: RGB;
  accent: RGB;
  accent2: RGB;
  plate: RGB;
  edge: RGB;
  alpha: RGB;
  alphaSide: RGB;
  alphaLeg: RGB;
  mod: RGB;
  modSide: RGB;
  modLeg: RGB;
  hot: RGB;
  hotSide: RGB;
  hotLeg: RGB;
  /** What lights the desk. */
  lamp: RGB;
}

const h = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

type Spec = { [K in keyof Way]: K extends "id" ? string : K extends "dark" ? boolean : string };

const make = (s: Spec): Way => {
  const out = { ...s } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(s)) if (typeof v === "string" && v.startsWith("#")) out[k] = h(v);
  return out as unknown as Way;
};

export const WAYS: Way[] = [
  make({
    id: "carbon", dark: true,
    desk: "#16171A", desk2: "#09090B", ink: "#ECEBE8", ghost: "#5A5D62", accent: "#FF6A00", accent2: "#7FB6FF",
    plate: "#0D0E10", edge: "#26282C",
    alpha: "#2C2E32", alphaSide: "#17181B", alphaLeg: "#E4E4E2",
    mod: "#1E2023", modSide: "#0F1012", modLeg: "#8D9299",
    hot: "#FF6A00", hotSide: "#A64400", hotLeg: "#141416",
    lamp: "#FFE2C4"
  }),
  make({
    id: "milk", dark: false,
    desk: "#EFEDE8", desk2: "#DCD8CF", ink: "#1C1B19", ghost: "#A39E94", accent: "#FF4F1A", accent2: "#2F66FF",
    plate: "#D6D2C9", edge: "#BEB9AE",
    alpha: "#FBFAF7", alphaSide: "#D7D2C7", alphaLeg: "#2A2825",
    mod: "#E4E0D7", modSide: "#C2BCAF", modLeg: "#56524B",
    hot: "#FF4F1A", hotSide: "#C4370C", hotLeg: "#FFF3EA",
    lamp: "#FFFFFF"
  }),
  make({
    id: "rose", dark: true,
    desk: "#1B1617", desk2: "#0E0B0C", ink: "#F6E8E9", ghost: "#6F5D60", accent: "#F4A6B6", accent2: "#FFE1E7",
    plate: "#110E0F", edge: "#2C2426",
    alpha: "#2A2325", alphaSide: "#161213", alphaLeg: "#F4A6B6",
    mod: "#F4A6B6", modSide: "#BF7686", modLeg: "#221B1D",
    hot: "#F6EDEE", hotSide: "#C9B6B9", hotLeg: "#221B1D",
    lamp: "#FFD9E0"
  }),
  make({
    id: "retro", dark: false,
    desk: "#E8E0CF", desk2: "#D3C8B0", ink: "#2A251E", ghost: "#9C8F79", accent: "#C8352A", accent2: "#2C5FA0",
    plate: "#CABE9F", edge: "#AFA283",
    alpha: "#F1E8D4", alphaSide: "#CDBE9C", alphaLeg: "#3A3328",
    mod: "#9D958A", modSide: "#7A7366", modLeg: "#F2ECDF",
    hot: "#C8352A", hotSide: "#8D2218", hotLeg: "#F6EADA",
    lamp: "#FFF4DD"
  }),
  make({
    id: "laser", dark: true,
    desk: "#180F30", desk2: "#0A0617", ink: "#EEE7FF", ghost: "#5F5090", accent: "#FF3FD2", accent2: "#3BE9FF",
    plate: "#110A24", edge: "#2E2156",
    alpha: "#2A1E54", alphaSide: "#150E2E", alphaLeg: "#3BE9FF",
    mod: "#45298A", modSide: "#261650", modLeg: "#FF3FD2",
    hot: "#FF3FD2", hotSide: "#A11E84", hotLeg: "#180F30",
    lamp: "#C9A8FF"
  }),
  make({
    id: "sage", dark: false,
    desk: "#E5EAE0", desk2: "#CED7C6", ink: "#1E2A21", ghost: "#8D9A8E", accent: "#3D7A4E", accent2: "#C4683A",
    plate: "#C3CEBA", edge: "#A7B59D",
    alpha: "#F3F1E5", alphaSide: "#D0CCB9", alphaLeg: "#2E5939",
    mod: "#7E9F82", modSide: "#5B7A5F", modLeg: "#F3F1E5",
    hot: "#C4683A", hotSide: "#8C4622", hotLeg: "#F3F1E5",
    lamp: "#FFFBE8"
  }),
  make({
    id: "arctic", dark: true,
    desk: "#1D2330", desk2: "#11151E", ink: "#E6EDF5", ghost: "#5A6780", accent: "#88C0D0", accent2: "#EBCB8B",
    plate: "#151A24", edge: "#2E3747",
    alpha: "#3A4152", alphaSide: "#222837", alphaLeg: "#D8DEE9",
    mod: "#2D3340", modSide: "#191D26", modLeg: "#88C0D0",
    hot: "#88C0D0", hotSide: "#4E7E8D", hotLeg: "#1D2330",
    lamp: "#D6EEFF"
  }),
  make({
    id: "gold", dark: true,
    desk: "#100D08", desk2: "#050403", ink: "#F4E4B8", ghost: "#6D5E3C", accent: "#E9B84B", accent2: "#FFF2C6",
    plate: "#0A0806", edge: "#2A2214",
    alpha: "#1D1911", alphaSide: "#0E0B07", alphaLeg: "#E9B84B",
    mod: "#E9B84B", modSide: "#9B7423", modLeg: "#1D1911",
    hot: "#FFF2C6", hotSide: "#C8B47E", hotLeg: "#1D1911",
    lamp: "#FFE3A0"
  })
];

/** The secret one stays out of the cycle until it is found. */
export const SECRET = "gold";

export const rgb = (c: RGB, a = 1): string =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

export function blend(a: Way, b: Way, t: number): Way {
  if (t >= 1) return b;
  if (t <= 0) return a;
  const out: Record<string, unknown> = { id: b.id, dark: t > 0.5 ? b.dark : a.dark };
  for (const k of Object.keys(b) as (keyof Way)[]) {
    const va = a[k];
    const vb = b[k];
    if (Array.isArray(va) && Array.isArray(vb)) out[k] = mix(va, vb, t);
  }
  return out as unknown as Way;
}
