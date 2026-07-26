/**
 * Palettes are keycap colorways for the page. Each one defines the paper
 * (background), ink (settled text), fresh ink (just-typed text, "wet"),
 * the two misregistration channels used by the Print finish, and the
 * caption box colors.
 */
export interface Palette {
  id: string;
  label: string;
  dark: boolean;
  paper: string;
  ink: string;
  fresh: string;
  sub: string; // seismograph, hints, quiet chrome
  misA: string; // misregistration channel A
  misB: string; // misregistration channel B
  captionBg: string;
  captionInk: string;
}

export const PALETTES: Palette[] = [
  {
    id: "pressroom",
    label: "Pressroom",
    dark: false,
    paper: "#F4EFE6",
    ink: "#1D1A16",
    fresh: "#C13A2B",
    sub: "#B9B0A0",
    misA: "#1FA8C9",
    misB: "#D63E7A",
    captionBg: "#F7C948",
    captionInk: "#1D1A16"
  },
  {
    id: "blueprint",
    label: "Blueprint",
    dark: true,
    paper: "#0F2440",
    ink: "#D9E6F2",
    fresh: "#6FC3FF",
    sub: "#3B587E",
    misA: "#3E8EDE",
    misB: "#A7DBFF",
    captionBg: "#173357",
    captionInk: "#D9E6F2"
  },
  {
    id: "blackout",
    label: "Blackout",
    dark: true,
    paper: "#121212",
    ink: "#E8E4DC",
    fresh: "#F2B544",
    sub: "#3C3A36",
    misA: "#6B6862",
    misB: "#A89F90",
    captionBg: "#1F1E1C",
    captionInk: "#F2B544"
  },
  {
    id: "terminal",
    label: "Terminal",
    dark: true,
    paper: "#0B120C",
    ink: "#9FE8A9",
    fresh: "#4DFF7C",
    sub: "#274430",
    misA: "#1E7A3C",
    misB: "#74FFB4",
    captionBg: "#102417",
    captionInk: "#4DFF7C"
  },
  {
    id: "phosphor",
    label: "Phosphor",
    dark: true,
    paper: "#140F08",
    ink: "#E8B45A",
    fresh: "#FFD27A",
    sub: "#4A3A20",
    misA: "#9C6B1F",
    misB: "#FFE3A8",
    captionBg: "#241A0C",
    captionInk: "#FFD27A"
  },
  {
    id: "sage",
    label: "Sage",
    dark: false,
    paper: "#E9EDDF",
    ink: "#2E3A2B",
    fresh: "#5F8C3E",
    sub: "#B5C0A6",
    misA: "#7FA3B8",
    misB: "#C98A4B",
    captionBg: "#D6E0C2",
    captionInk: "#2E3A2B"
  },
  {
    id: "lavender",
    label: "Lavender",
    dark: false,
    paper: "#ECE8F4",
    ink: "#2E2640",
    fresh: "#7C5CC4",
    sub: "#C2B8D8",
    misA: "#4FA3C7",
    misB: "#D177A8",
    captionBg: "#DCD2F0",
    captionInk: "#2E2640"
  },
  {
    id: "crimson",
    label: "Crimson",
    dark: false,
    paper: "#F4E9DC",
    ink: "#33231E",
    fresh: "#B3263A",
    sub: "#CBB9A6",
    misA: "#2C7A8C",
    misB: "#E0717F",
    captionBg: "#33231E",
    captionInk: "#F4E9DC"
  },
  {
    id: "arctic",
    label: "Arctic",
    dark: false,
    paper: "#EEF3F6",
    ink: "#1F2C36",
    fresh: "#2E7FB8",
    sub: "#BCCAD3",
    misA: "#67B4D8",
    misB: "#8B9CE0",
    captionBg: "#D8E6EE",
    captionInk: "#1F2C36"
  },
  {
    id: "espresso",
    label: "Espresso",
    dark: true,
    paper: "#2A211B",
    ink: "#E3D5C3",
    fresh: "#C98A4B",
    sub: "#55463A",
    misA: "#8A5A30",
    misB: "#E8B98A",
    captionBg: "#3A2E25",
    captionInk: "#E3D5C3"
  },
  {
    id: "bubblegum",
    label: "Bubblegum",
    dark: false,
    paper: "#F8E8EE",
    ink: "#3A2230",
    fresh: "#D9477A",
    sub: "#DEC0CD",
    misA: "#5BB8C9",
    misB: "#F0A1BC",
    captionBg: "#F3CFDD",
    captionInk: "#3A2230"
  },
  {
    id: "fieldnotes",
    label: "Field Notes",
    dark: false,
    paper: "#DDDCCB",
    ink: "#2E2F25",
    fresh: "#8A6A2E",
    sub: "#B3B29C",
    misA: "#6B7B4F",
    misB: "#B3563A",
    captionBg: "#C8C7AE",
    captionInk: "#2E2F25"
  },
  {
    id: "dusk",
    label: "Dusk",
    dark: true,
    paper: "#1A1520",
    ink: "#D4C8E8",
    fresh: "#B07FE8",
    sub: "#3D3450",
    misA: "#7B9EDF",
    misB: "#E88CB0",
    captionBg: "#251F30",
    captionInk: "#D4C8E8"
  },
  {
    id: "slate",
    label: "Slate",
    dark: true,
    paper: "#1C2128",
    ink: "#CDD9E5",
    fresh: "#79C0FF",
    sub: "#3D4756",
    misA: "#56A3D9",
    misB: "#A8D5FF",
    captionBg: "#22262D",
    captionInk: "#CDD9E5"
  }
];

/** Linear interpolation between two hex colors, t in [0, 1]. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
