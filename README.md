# type

A place to press keys. Lives at [type.tgoyal.me](https://type.tgoyal.me).

Not a typing test. No timer, no supplied words, no judging. You bring the
keyboard and the words; the page makes typing them feel as good on screen as
it does under your fingers. Everything is silent on purpose: the keyboard is
the instrument, the page just listens.

## What it does

- The text itself has physics. Glyphs land with a small spring settle, and
  variable-font weight records how each key was pressed: tap a key and it
  prints light, hold it and it prints heavier. The page remembers.
- The caret is alive. It compresses on each keystroke, leans into speed,
  glows when you are in flow, and sweeps back on Enter like a carriage
  return.
- Six styles, cycled with F4. Print (the default): fresh ink prints
  slightly out of register while you are typing fast and snaps into
  registration as it dries. Clean: just the physics. Then four elemental
  styles where keystrokes shed matter proportional to your flow: Ember
  (letters land hot, sparks rise, ink cools as it dries), Tide (letters
  ripple in, rings spread from each landing), Frost (letters crystallize,
  flecks drift down), and Gale (letters blow in with speed lines of wind).
  Nothing is a canned animation; everything scales with your rhythm.
- The page has mass. Every keystroke imparts a real impulse to the sheet
  on a spring: ordinary typing barely registers, heavy flow makes the page
  visibly absorb your rhythm, and Enter lands a thump.
- The stamp. Hold a key past a beat and release: the letter pulses down,
  fires a shockwave shaped like its own letterform, and thumps the page in
  proportion to how long you held. Pressure has a payoff.
- Streaks. Consecutive keystrokes without backspacing build a streak;
  milestones (50, 100, 250, 500, 1000...) slam the caption, flash the
  seismograph, and thump the page. Beating your all-time best flow is
  celebrated once per session. Longest streak lives in the odometer.
- Secret words. The page listens to what you write: type fire, water,
  ice, or wind and the style changes mid-sentence. Palettes answer to
  their names. Type zen and the chrome disappears.
- A comic-style caption shows your WPM only during sustained flow, then
  gets out of the way.
- A seismograph in the bottom margin traces your last 12 seconds of rhythm.
- A quiet controls strip sits top-left so the basics are always one glance
  away. It dims while you type and F9 hides it entirely.
- Backspace has momentum: hold it and deletion accelerates.
- An odometer (F8) counts lifetime keystrokes, your most-pressed keys, and
  your best flow. Stored locally in your browser; nothing leaves the page.
- Your sheet survives reloads (localStorage). Esc clears it, Ctrl+Z brings
  it back.

## Controls

Everything is keyboard-driven. There is no menu and the mouse is never
needed.

| Key      | Action                                              |
| -------- | --------------------------------------------------- |
| F1       | Help: what this is and every control                 |
| F2 / F3  | Previous / next palette                              |
| F4       | Cycle style: Print, Clean, Ember, Tide, Frost, Gale  |
| F5       | Seismograph on/off                                   |
| F6       | Flow caption on/off                                  |
| F7       | Motion: full / subtle / off                          |
| F8       | Odometer and stats                                   |
| F9       | Controls strip show/hide                             |
| Esc      | Clear the sheet                                      |
| Ctrl+Z   | Restore the cleared sheet                            |
| Ctrl+C   | Copy everything you typed                            |

F11 (browser fullscreen) is left to the browser on purpose; it makes the
page better. Motion defaults to "subtle" if your OS asks for reduced motion.

## Development

Requires Node 22 (pinned in `.nvmrc`).

```sh
nvm use            # or install Node 22 any way you like
npm install
npm run dev        # Vite dev server
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build locally
```

The only runtime dependency is the JetBrains Mono variable font, bundled
from npm. The engine (canvas renderer, springs, halftone) is hand-rolled
with no libraries.

## Deploying

The site deploys to Cloudflare Workers static assets (the current
recommended path for static sites; Pages is the legacy route).

### Option A: GitHub Actions (recommended)

1. Create the repo and push.
2. In the repo settings, add two secrets:
   - `CLOUDFLARE_API_TOKEN`: create at Cloudflare dashboard, My Profile,
     API Tokens, using the "Edit Cloudflare Workers" template.
   - `CLOUDFLARE_ACCOUNT_ID`: shown on the Workers and Pages overview page.
3. Push to `main`. The Deploy workflow builds with Node 22 and uploads
   `dist/` with wrangler.

Because the build runs in GitHub Actions with the Node version pinned in
`.nvmrc`, Cloudflare never builds anything; it only serves files. The
"Cloudflare build image uses the wrong Node version" class of failure
cannot happen with this setup. If you ever switch to Cloudflare's own git
integration instead, set a `NODE_VERSION` environment variable on the
project to match `.nvmrc`.

### Option B: Manual from your machine

```sh
npm run build
npx wrangler deploy
```

Wrangler will prompt for login on first use.

### Custom domain

After the first deploy: Cloudflare dashboard, Workers and Pages, select
`type-tgoyal`, Settings, Domains and Routes, add `type.tgoyal.me`. Since
`tgoyal.me` is already a zone in the same account, Cloudflare creates the
DNS record automatically.

## Architecture notes

- One full-viewport 2D canvas created with the `desynchronized` hint for
  the lowest available input-to-paint latency, with automatic fallback
  where unsupported. No DOM nodes are created while typing.
- Typewriter model: the active line sits at a fixed position; on Enter it
  is baked into an offscreen static layer and history slides up. Per-frame
  cost is independent of how much has been typed.
- Glyph landing uses a closed-form underdamped spring evaluated from glyph
  age, so animation state is free. The caret uses two integrated springs
  (position, squash).
- Flow detection uses a rolling 3-second window: mean inter-key gap and
  coefficient of variation, tuned for the 70 to 90 WPM range where real
  typing mixes 60 to 90 ms rolls with 250 ms+ word boundaries.
- All persistence is localStorage with try/catch guards; the site works
  fully without it.
