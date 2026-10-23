/**
 * Doodles: some words draw themselves. Finish one of these words and a
 * little pen drawing inks itself above it, does its one thing (the sun
 * turns, the bird flies off, the car takes the rule like a straight), and
 * leaves a small copy in the margin of that line, the way notebooks fill
 * up with marginalia.
 *
 * Every doodle is SVG path data on a 24 x 24 grid, drawn as strokes with
 * Path2D, so the whole set costs a few kilobytes and no requests. Strokes
 * after the first can take the other inks (misA, misB) for color.
 */
export type Motion =
  | "float" // drifts up and fades
  | "spin" // turns slowly
  | "sway" // rocks side to side
  | "pulse" // beats
  | "twinkle" // flickers like a star
  | "grow" // rises out of the rule
  | "fly" // flaps off up and to the right
  | "launch" // accelerates straight up and away
  | "drive" // lands on the rule and races off to the right
  | "crawl" // walks along the rule
  | "fall" // sheds drops below it
  | "flip" // turns over like a card
  | "flash" // strikes, with a flash
  | "twist" // a quarter turn, like a cube face
  | "flicker"; // dances like a flame

export interface Doodle {
  id: string;
  /** Words that summon it, lowercase. The first is its name. */
  words: string[];
  /** One path per ink: [main, misA, misB]. */
  paths: string[];
  motion: Motion;
  /** Fill the main path faintly once drawn. */
  fill?: boolean;
}

/** A circle as path data (two arcs, so it draws on like a pen stroke). */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx + r} ${cy}a${r} ${r} 0 1 1 ${-2 * r} 0a${r} ${r} 0 1 1 ${2 * r} 0`;
}

function dot(cx: number, cy: number): string {
  return circle(cx, cy, 0.6);
}

const petals = Array.from({ length: 5 }, (_, i) => {
  const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
  return circle(+(12 + Math.cos(a) * 3.2).toFixed(2), +(9 + Math.sin(a) * 3.2).toFixed(2), 2.1);
}).join("");

const cloud = "M7 17h10.5a3.8 3.8 0 0 0 .4-7.6 5.3 5.3 0 0 0-10.2-1.2A4.4 4.4 0 0 0 7 17Z";
const smallCloud = "M7 13h10.5a3.3 3.3 0 0 0 .3-6.6 4.8 4.8 0 0 0-9.3-1A3.8 3.8 0 0 0 7 13Z";

export const DOODLES: Doodle[] = [
  {
    id: "sun",
    words: ["sun", "sunny", "sunshine", "sunrise", "morning", "summer"],
    paths: [
      circle(12, 12, 4.2),
      "M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"
    ],
    motion: "spin"
  },
  {
    id: "moon",
    words: ["moon", "night", "midnight", "tonight", "goodnight"],
    paths: ["M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1Z", "M17 4.5v2M16 5.5h2M20.5 9v1.4M19.8 9.7h1.4"],
    motion: "sway",
    fill: true
  },
  {
    id: "star",
    words: ["star", "stars", "wish", "shine", "sparkle"],
    paths: ["M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7Z"],
    motion: "twinkle",
    fill: true
  },
  {
    id: "heart",
    words: ["heart", "love", "loved", "loving", "lovely", "crush"],
    paths: ["M12 20s-7.6-4.6-7.6-10.3A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.6 2.4C19.6 15.4 12 20 12 20Z"],
    motion: "pulse",
    fill: true
  },
  {
    id: "cloud",
    words: ["cloud", "clouds", "cloudy", "dreams"],
    paths: [cloud],
    motion: "float"
  },
  {
    id: "rain",
    words: ["rain", "raining", "rainy", "drizzle", "umbrella"],
    paths: [smallCloud, "M8.5 16l-1 2.5M12.5 16l-1 2.5M16.5 16l-1 2.5"],
    motion: "fall"
  },
  {
    id: "storm",
    words: ["storm", "thunder", "lightning", "stormy", "zap"],
    paths: ["M13.5 2L5.5 13.5h6L10 22l8.5-12H12Z"],
    motion: "flash",
    fill: true
  },
  {
    id: "snow",
    words: ["snow", "snowflake", "winter", "freezing", "frozen"],
    paths: [
      "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9",
      "M9.6 4.6L12 6.6l2.4-2M9.6 19.4L12 17.4l2.4 2M4.6 10.4l3.1-.5-1-2.9M19.4 13.6l-3.1.5 1 2.9M4.6 13.6l3.1.5-1 2.9M19.4 10.4l-3.1-.5 1-2.9"
    ],
    motion: "spin"
  },
  {
    id: "tree",
    words: ["tree", "trees", "forest", "planted", "leaves", "nature"],
    paths: [
      "M12 22v-6.5",
      "M12 15.5c-4 0-6.5-2.4-6.5-5.4 0-2 1.3-3.5 2.9-4C8.8 3.9 10.3 2.5 12 2.5s3.2 1.4 3.6 3.6c1.6.5 2.9 2 2.9 4 0 3-2.5 5.4-6.5 5.4Z",
      "M12 18.5l-2.5-2M12 17l2.5-2"
    ],
    motion: "grow"
  },
  {
    id: "flower",
    words: ["flower", "flowers", "bloom", "garden", "rose", "spring"],
    paths: ["M12 22v-9.5M12 18.5c-1.8-1.9-3.8-2.1-5.5-1.2M12 17c1.6-1.6 3.4-1.8 5-1", petals, circle(12, 9, 1.3)],
    motion: "grow"
  },
  {
    id: "coffee",
    words: ["coffee", "tea", "latte", "espresso", "cafe", "chai", "mug"],
    paths: [
      "M5 10h11v4.5a5.5 5.5 0 0 1-5.5 5.5A5.5 5.5 0 0 1 5 14.5ZM16 11.5h1.4a2.6 2.6 0 0 1 0 5.2H15.6M4 21.5h13",
      "M8.5 7.5c-1-1.2 1-2.1 0-3.6M12.5 7.5c-1-1.2 1-2.1 0-3.6"
    ],
    motion: "float"
  },
  {
    id: "music",
    words: ["music", "song", "songs", "singing", "melody", "dancing"],
    paths: ["M9 18V6.2l10-2.2v12", circle(7, 18, 2), circle(17, 16, 2)],
    motion: "float",
    fill: true
  },
  {
    id: "bird",
    words: ["bird", "birds", "flying", "freedom", "wings"],
    paths: ["M2.5 11c2.6-2.6 6.1-2.9 9.5.4 3.4-3.3 6.9-3 9.5-.4", "M8 15.5c1.3-1.2 2.9-1.3 4 .2 1.2-1.5 2.7-1.4 4-.2"],
    motion: "fly"
  },
  {
    id: "fish",
    words: ["fish", "swimming", "aquarium"],
    paths: ["M3 12c3.2-4.4 9.4-5.4 13.5 0-4.1 5.4-10.3 4.4-13.5 0ZM16.5 12l5-3.6v7.2Z", dot(7, 11.2)],
    motion: "sway"
  },
  {
    id: "wave",
    words: ["wave", "waves", "ocean", "sea", "beach", "surf", "tide"],
    paths: [
      "M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2",
      "M2 18.5c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2",
      "M5 9.5c1.2-3 4-4.5 7-4.5"
    ],
    motion: "sway"
  },
  {
    id: "mountain",
    words: ["mountain", "mountains", "hike", "hiking", "climb", "peak", "summit"],
    paths: ["M2 20L9 7.5l4.2 6.2L16 10l6 10Z", "M7.4 10.3L9 12l1.7-1.7"],
    motion: "grow"
  },
  {
    id: "rocket",
    words: ["rocket", "launch", "deploy"],
    paths: [
      "M12 2.5c3 2.6 4.6 6.2 4.4 10.2L14 16h-4l-2.4-3.3C7.4 8.7 9 5.1 12 2.5Z",
      "M10 16l-1.6 3.8M14 16l1.6 3.8M12 16.5v4.5",
      circle(12, 9, 1.6)
    ],
    motion: "launch"
  },
  {
    id: "car",
    words: ["f1", "race", "racing", "car", "cars", "formula"],
    paths: [
      "M2 16.5h3.2l2-3.3h6.6l3 3.3H22V18H2ZM9 13.2l1.2-2.2h3.1",
      circle(6.5, 18.6, 1.9) + circle(17.5, 18.6, 1.9),
      "M20.5 14.2V12h1.5"
    ],
    motion: "drive"
  },
  {
    id: "cube",
    words: ["cube", "cubes", "cubing", "rubik", "rubiks", "speedcube", "puzzle", "solved"],
    paths: [
      "M12 3l8 4.5v9L12 21l-8-4.5v-9ZM4 7.5L12 12l8-4.5M12 12v9",
      "M6.7 9v9M9.3 10.5v9M4 10.5l8 4.5M4 13.5l8 4.5",
      "M14.7 10.5v9M17.3 9v9M20 10.5l-8 4.5M20 13.5l-8 4.5"
    ],
    motion: "twist"
  },
  {
    id: "cat",
    words: ["cat", "cats", "kitten", "kitty", "meow"],
    paths: [
      "M5.5 20v-8.5L4.5 4.5l4.2 3.3h6.6l4.2-3.3-1 7V20Z",
      dot(9.5, 12.5) + dot(14.5, 12.5),
      "M11 15.2l1 .8 1-.8M2.5 14.5l4 .5M2.5 17l4-.3M21.5 14.5l-4 .5M21.5 17l-4-.3"
    ],
    motion: "grow"
  },
  {
    id: "ghost",
    words: ["ghost", "ghosts", "boo", "spooky", "halloween", "haunted"],
    paths: ["M6 21V10.5a6 6 0 0 1 12 0V21l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5Z", dot(9.6, 10.5) + dot(14.4, 10.5)],
    motion: "float"
  },
  {
    id: "pumpkin",
    words: ["pumpkin", "pumpkins", "october", "autumn"],
    paths: [
      "M12 7.5c-5 0-8 2.8-8 6.6S7 21 12 21s8-3.1 8-6.9-3-6.6-8-6.6ZM12 7.5c-2.2 0-3 3-3 6.8s.8 6.7 3 6.7 3-2.9 3-6.7-.8-6.8-3-6.8Z",
      "M12 7.5V4.5c.8-1 2-1.4 3-1"
    ],
    motion: "pulse"
  },
  {
    id: "idea",
    words: ["idea", "ideas", "thinking", "eureka", "clever"],
    paths: [
      "M9.3 18h5.4M10.2 21h3.6M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.3 1 2.1V17h5.2v-1.1c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3Z",
      "M12 0.2v1M3.5 3.5l.8.8M20.5 3.5l-.8.8"
    ],
    motion: "flash"
  },
  {
    id: "book",
    words: ["book", "books", "reading", "stories", "novel", "library"],
    paths: [
      "M12 6.2c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.7c-3-.5-6 0-8 1.5ZM12 6.2v14.3",
      "M6.5 8.5c1.3-.1 2.7.1 3.8.6M6.5 11.5c1.3-.1 2.7.1 3.8.6M13.7 9.1c1.1-.5 2.5-.7 3.8-.6"
    ],
    motion: "flip"
  },
  {
    id: "keyboard",
    words: ["keyboard", "keyboards", "keycap", "keycaps", "mechanical", "switches", "thock", "typing"],
    paths: ["M5.5 5.5h13l-1.6 8.5H7.1ZM3.5 14h17v4.5h-17Z", "M9.5 9.5h5"],
    motion: "pulse"
  },
  {
    id: "clock",
    words: ["clock"],
    paths: [circle(12, 12, 8.5), "M12 7v5l3.5 2"],
    motion: "spin"
  },
  {
    id: "home",
    words: ["house", "cozy"],
    paths: ["M3 11.5L12 4l9 7.5M5.5 9.5V20h13V9.5", "M10 20v-5h4v5", "M16 6.2V3.8h2v4"],
    motion: "grow"
  },
  {
    id: "plane",
    words: ["plane", "travel", "flight", "airport", "vacation", "holiday"],
    paths: ["M2.5 11.5L21.5 3l-6 18.5-3.8-7.7ZM11.7 13.8L21.5 3"],
    motion: "fly"
  },
  {
    id: "mail",
    words: ["mail", "letter", "letters", "email"],
    paths: ["M3 6h18v12H3Z", "M3 6l9 7 9-7"],
    motion: "fly"
  },
  {
    id: "smile",
    words: ["happy", "smile", "smiling", "joy", "yay", "lol", "haha"],
    paths: [circle(12, 12, 9), dot(9, 10) + dot(15, 10), "M8 14.2c2.2 2.6 5.8 2.6 8 0"],
    motion: "pulse"
  },
  {
    id: "sad",
    words: ["sad", "cry", "crying", "tears"],
    paths: [circle(12, 12, 9), dot(9, 10) + dot(15, 10) + "M8.2 16.5c2.2-2.4 5.4-2.4 7.6 0", "M7.8 12.8c-.6 1-.6 1.7 0 2.1.6-.4.6-1.1 0-2.1Z"],
    motion: "fall"
  },
  {
    id: "flame",
    words: ["fire", "flame", "burn", "burning", "candle"],
    paths: ["M12 22c4 0 7-2.7 7-6.5 0-3.5-2.5-5.5-3.5-8.5-1.5 2-2.5 3-3.5 3 0-3-1-5.5-3-7.5 0 4-4 6.5-4 12.5C5 19.3 8 22 12 22Z", "M12 22c-1.8 0-3-1.2-3-2.9 0-2 2-3 3-5.1 1 2.1 3 3.1 3 5.1 0 1.7-1.2 2.9-3 2.9Z"],
    motion: "flicker",
    fill: true
  },
  {
    id: "shuttle",
    words: ["badminton", "shuttle", "shuttlecock", "smash", "racket"],
    paths: [
      "M9.6 17.5L5.5 4h13l-4.1 13.5ZM9 4l1.6 13.5M15 4l-1.6 13.5M12 4v13.5M6.4 7.5h11.2M7.6 11.5h8.8",
      "M9.6 17.5h4.8v1.3a2.4 2.4 0 0 1-4.8 0Z"
    ],
    motion: "launch"
  },
  {
    id: "card",
    words: ["magic", "card", "cards", "trick", "tricks", "ace", "abracadabra"],
    paths: [
      "M6.5 3h11a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3Z",
      "M12 7.5c-2 2.6-3.6 3.7-3.6 5.3a2 2 0 0 0 3.6 1.2 2 2 0 0 0 3.6-1.2c0-1.6-1.6-2.7-3.6-5.3ZM12 14v2.5M10.7 16.5h2.6"
    ],
    motion: "flip"
  },
  {
    id: "cake",
    words: ["cake", "birthday", "bake", "baking", "baked", "bread", "cookie", "cookies", "dessert"],
    paths: [
      "M4 20.5h16v-7H4ZM4 16.5c2 1 4 1 5.3 0s3.4-1 5.3 0 4 1 5.4 0",
      "M12 13.5V9.5",
      "M12 7.2c-.9-1.1-.9-2.1 0-3.2.9 1.1.9 2.1 0 3.2Z"
    ],
    motion: "pulse"
  },
  {
    id: "bug",
    words: ["bug", "bugs", "debug", "debugging", "beetle"],
    paths: [
      "M8 9.5a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0ZM12 9.5v9",
      "M8 12H4.5M19.5 12H16M8 15.5l-3 2M16 15.5l3 2M8.5 8L6.5 5.5M15.5 8l2-2.5"
    ],
    motion: "crawl"
  },
  {
    id: "check",
    words: ["done", "finished", "completed", "nailed"],
    paths: ["M4 12.5l5 5L20 6.5"],
    motion: "pulse"
  },
  {
    id: "rainbow",
    words: ["rainbow", "rainbows", "colour", "colours", "pride"],
    paths: [
      "M3 18a9 9 0 0 1 18 0",
      "M6 18a6 6 0 0 1 12 0",
      "M9 18a3 3 0 0 1 6 0"
    ],
    motion: "grow"
  },
  {
    id: "sleep",
    words: ["sleep", "sleepy", "nap", "zzz", "bedtime"],
    paths: ["M13.5 3.5h6l-6 7h6", "M5 12.5h4.5l-4.5 5.5h4.5"],
    motion: "float"
  },
  {
    id: "coin",
    words: ["money", "coin", "coins", "cash", "dime"],
    paths: [circle(12, 12, 8.5), "M14.5 8.8c-.6-.8-1.5-1.2-2.5-1.2-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2.1 2.6.9 2.6 2.2-1.1 2-2.6 2c-1.1 0-2.1-.4-2.7-1.2M12 6v1.6M12 16.4V18"],
    motion: "flip"
  },
  {
    id: "hello",
    words: ["hello", "hiya", "howdy", "greetings"],
    paths: ["M4 4.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z", "M8.5 8v4.5M8.5 10.3h3M11.5 8v4.5M14.5 8.3v.1M14.5 10v2.5"],
    motion: "pulse"
  },
  {
    id: "pen",
    words: ["poem", "poetry", "pen", "journal"],
    paths: ["M15.5 3.5l5 5L9 20l-5.5.5L4 15Z", "M13.5 5.5l5 5M4 15l5 5"],
    motion: "sway"
  }
];

const BY_WORD = new Map<string, Doodle>();
for (const d of DOODLES) for (const w of d.words) if (!BY_WORD.has(w)) BY_WORD.set(w, d);
const BY_ID = new Map(DOODLES.map((d) => [d.id, d]));

export function doodleForWord(word: string): Doodle | undefined {
  return BY_WORD.get(word);
}

export function doodleById(id: string): Doodle | undefined {
  return BY_ID.get(id);
}

/** Parsed paths, built once per doodle on first use. */
const compiled = new Map<string, Path2D[]>();
export function doodlePaths(d: Doodle): Path2D[] {
  let ps = compiled.get(d.id);
  if (!ps) {
    ps = d.paths.map((s) => new Path2D(s));
    compiled.set(d.id, ps);
  }
  return ps;
}

/** Placement of a doodle at a given age (ms). Closed form, no state. */
export interface Pose {
  dx: number; // in doodle units (24 = one doodle)
  dy: number;
  rot: number;
  sx: number;
  sy: number;
  alpha: number;
  /** Anchor transforms at the bottom center instead of the middle. */
  base: boolean;
}

/** How long a doodle stays in the air before it settles into the margin. */
export const DOODLE_LIFE = 2600;
/** How long the pen takes to draw it. */
export const DOODLE_DRAW = 520;

function fadeOut(t: number, from = 1900): number {
  return t < from ? 1 : Math.max(0, 1 - (t - from) / (DOODLE_LIFE - from));
}

export function pose(m: Motion, t: number, seed: number, mm: number): Pose {
  const p: Pose = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, alpha: fadeOut(t), base: false };
  if (mm === 0) return p;
  const s = t / 1000;
  const after = Math.max(0, t - DOODLE_DRAW) / 1000; // motion starts once drawn
  switch (m) {
    case "float":
      p.dy = -after * 9 * mm;
      p.dx = Math.sin(s * 3 + seed * 6) * 1.2 * mm;
      break;
    case "spin":
      p.rot = s * 1.1 * mm;
      break;
    case "sway":
      p.rot = Math.sin(s * 4 + seed) * 0.18 * mm;
      p.dx = Math.sin(s * 2) * 1.5 * mm;
      break;
    case "pulse": {
      const beat = (u: number) => Math.exp(-((after - u) ** 2) / 0.004);
      const k = 1 + (beat(0.05) * 0.22 + beat(0.32) * 0.16) * mm;
      p.sx = p.sy = k;
      break;
    }
    case "twinkle": {
      const tw = 0.5 + 0.5 * Math.sin(s * 14 + seed * 9);
      p.sx = p.sy = 1 + 0.1 * tw * mm;
      p.rot = Math.sin(s * 2) * 0.12 * mm;
      p.alpha *= 0.7 + 0.3 * tw;
      break;
    }
    case "grow": {
      const g = Math.min(1, t / 520);
      const spring = 1 - Math.exp(-7 * g) * Math.cos(9 * g);
      p.base = true;
      p.sy = 0.2 + 0.8 * (mm < 1 ? Math.min(1, g * 1.2) : spring);
      p.sx = 0.85 + 0.15 * p.sy;
      p.rot = Math.sin(after * 3 + seed) * 0.04 * mm;
      break;
    }
    case "fly": {
      p.dx = after * after * 36 * mm + after * 10 * mm;
      p.dy = -after * after * 16 * mm - Math.sin(s * 9) * 1.2 * mm;
      p.sy = 1 - 0.25 * Math.abs(Math.sin(s * 11)) * mm;
      p.rot = -after * 0.15 * mm;
      p.alpha = t < 2200 ? 1 : Math.max(0, 1 - (t - 2200) / 400);
      break;
    }
    case "launch": {
      const shake = after < 0.25 ? Math.sin(s * 80) * 0.5 * mm : 0;
      p.dx = shake;
      p.dy = -after * after * 70 * mm;
      p.alpha = t < 2200 ? 1 : Math.max(0, 1 - (t - 2200) / 400);
      break;
    }
    case "drive":
      p.base = true;
      p.dx = after * after * 90 * mm;
      p.alpha = t < 2300 ? 1 : Math.max(0, 1 - (t - 2300) / 300);
      break;
    case "crawl":
      p.base = true;
      p.dx = after * 10 * mm;
      p.rot = Math.sin(s * 18) * 0.06 * mm;
      break;
    case "fall":
      p.dy = Math.sin(s * 2) * 0.6 * mm;
      break;
    case "flip": {
      const f = Math.min(1, after / 0.55);
      p.sx = Math.cos(Math.PI * 2 * (1 - (1 - (1 - f) ** 3)) * mm);
      break;
    }
    case "flash": {
      const strike = Math.exp(-after * 9);
      p.dx = Math.sin(s * 70) * strike * 1.4 * mm;
      p.sx = p.sy = 1 + strike * 0.12 * mm;
      break;
    }
    case "twist": {
      const q = Math.min(1, after / 0.45);
      const e = 1 - Math.exp(-6 * q) * Math.cos(7 * q);
      p.rot = (Math.PI / 2) * e * mm;
      break;
    }
    case "flicker":
      p.sx = 1 + Math.sin(s * 23 + seed) * 0.05 * mm;
      p.sy = 1 + Math.sin(s * 17) * 0.08 * mm;
      p.base = true;
      break;
  }
  return p;
}
