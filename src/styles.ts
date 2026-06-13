/**
 * Styles are full rendering treatments, cycled with F4. Each one changes
 * how glyphs land, what fresh ink looks like, and what (if anything)
 * drifts off the keystrokes. Everything stays proportional to typing
 * rhythm: a style never plays a canned animation, it only changes how the
 * page responds to what the hands are doing.
 */
export type StyleId = "print" | "clean" | "ember" | "tide" | "frost" | "gale";

export interface StyleDef {
  id: StyleId;
  label: string;
  /** One-line description shown in help. */
  tagline: string;
  /** Halftone paper texture bands (Print only). */
  halftone: boolean;
  /** CMYK-style misregistration on fresh glyphs (Print only). */
  misreg: boolean;
  /** How a glyph arrives. */
  land: "drop" | "rise" | "blow" | "crystal" | "ripple";
  /** What drifts off keystrokes, if anything. */
  particles: "ember" | "ring" | "frost" | "leaf" | null;
  /** Fixed accent colors; null means use the palette's own fresh ink. */
  accent: { fresh: string; misA: string; misB: string } | null;
  /** Multiplier on caret/glyph glow. */
  glow: number;
}

export const STYLES: StyleDef[] = [
  {
    id: "print",
    label: "Print",
    tagline: "fresh ink prints out of register, then dries true",
    halftone: true,
    misreg: true,
    land: "drop",
    particles: null,
    accent: null,
    glow: 1
  },
  {
    id: "clean",
    label: "Clean",
    tagline: "just the physics, nothing else",
    halftone: false,
    misreg: false,
    land: "drop",
    particles: null,
    accent: null,
    glow: 0.6
  },
  {
    id: "ember",
    label: "Ember",
    tagline: "letters land hot and cool as they dry",
    halftone: false,
    misreg: false,
    land: "rise",
    particles: "ember",
    accent: { fresh: "#FF8A3D", misA: "#FFC53F", misB: "#E03616" },
    glow: 1.7
  },
  {
    id: "tide",
    label: "Tide",
    tagline: "ink ripples in and settles like water",
    halftone: false,
    misreg: false,
    land: "ripple",
    particles: "ring",
    accent: { fresh: "#4FB3DE", misA: "#8FE0F7", misB: "#2E6FB8" },
    glow: 1.1
  },
  {
    id: "frost",
    label: "Frost",
    tagline: "letters crystallize, flecks drift down",
    halftone: false,
    misreg: false,
    land: "crystal",
    particles: "frost",
    accent: { fresh: "#9AD4EC", misA: "#E8F8FF", misB: "#6FB8D6" },
    glow: 1.3
  },
  {
    id: "gale",
    label: "Gale",
    tagline: "letters blow in with the wind of your typing",
    halftone: false,
    misreg: false,
    land: "blow",
    particles: "leaf",
    accent: { fresh: "#9FBF8A", misA: "#C9D9A8", misB: "#7FA37A" },
    glow: 0.9
  }
];

export function styleOf(id: StyleId): StyleDef {
  return STYLES.find((s) => s.id === id) ?? STYLES[0]!;
}
