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
  styles where keystrokes shed matter in proportion to your flow: Ember
  (letters land hot, sparks rise, ink cools as it dries), Tide (letters
  ripple in, rings spread from each landing), Frost (letters crystallize,
  flecks drift down), and Gale (letters blow in, leaves drift off).
  Nothing is a canned animation; everything scales with your rhythm.
- Fourteen palettes on F2 / F3, seven light and seven dark. Switching
  palette or style blooms out from the caret like a drop of ink spreading
  through damp paper.
- The page has mass. Every keystroke kicks the sheet on a spring:
  ordinary typing barely registers, heavy flow makes the page visibly
  absorb your rhythm, and Enter lands a thump.
- The stamp. Hold a key past a beat and release: the letter pulses down,
  fires a shockwave shaped like its own letterform, and thumps the page in
  proportion to how long you held.
- Streaks. Keystrokes without a backspace or a long pause build a streak;
  milestones (50, 100, 250, 500, 1000...) slam the caption, flash the
  seismograph, and thump the page. Beating your all-time best flow is
  celebrated once per session.
- Secret words. Write fire, water, ice or wind alone on a line and press
  Enter, and the style changes. Palettes answer to their names the same
  way, and zen hides the chrome. A word only counts when it stands alone,
  so ordinary sentences about water stay sentences.
- Some words draw themselves. Finish a word like sun, coffee, rain, cube,
  f1 or cat and a little pen drawing inks itself above it, does its one
  thing (the sun turns, the bird flies off, the car takes the line like a
  straight), then settles into that line's margin as a doodle. There are
  42 to find; the odometer (F8) keeps a checklist that fills in as you go.
- Click or tap the paper and a wave runs out through the printed letters.
- Words wrap whole. When a word reaches the margin it hops down to the
  next line in one piece.
- The writing surface. The page is a faint ruled sheet with a line under
  every row. The active line is a living horizon that lights up under the
  caret with every keystroke. Line numbers run down the left margin, and
  older lines fade out as they climb, gone before they reach the controls.
- A comic-style sticker shows your pace. Once you start it stays: live
  while you type, holding your last pace when you pause, loudest in flow.
  Roll three or more keys at once and it says so.
- A seismograph in the bottom margin traces your last 12 seconds of rhythm.
- A quiet controls strip sits top left. It dims while you type and F9
  hides it.
- Backspace has momentum: hold it and deletion accelerates. Backspace at
  the start of a line pulls the line above back down.
- An odometer (F8) counts lifetime keystrokes, your most-pressed keys, your
  best flow and your longest streak.
- Worlds. The page listens to what you write, and each world has its own
  personality. Rain (or night) is a lofi window: city lights out of focus
  behind the glass, rain slanting past, lightning if it storms. Matrix
  pours code down the page, every letter lets a stream fall from where it
  landed and decodes out of noise. Terminal is an amber phosphor tube that
  boots when you open it: scanlines, a rolling refresh, glowing ink.
  Sakura is spring in an anime: light pouring in, petals fluttering edge
  on, sparkles where your keys land. Wind turns the page to a pencil
  sketch, snow piles on your letters, sun, fire and sea have their own
  light. Each world blooms in from the word that called it, your typing
  speed drives its weather, and it lets go about a minute after you stop
  mentioning it.
- The camera. The page is filmed: the lens leans toward the pen and
  pushes in as you speed up, focus racks onto the line you are writing,
  and on a long pause the camera drifts over what you wrote.
- The proof. Ctrl+S shows what your hands drew: every word as one stroke
  across the keyboard, through the keys it was typed on. Quick bursts in
  the fresh color, slow words bow wider, later words darker. Your doodles
  sit under it. It opens over the page; save it if you want it.
- Everything you write is kept, however long, and survives reloads. Hold
  Esc to clear the sheet; Ctrl+Z brings it back, even after a reload.
  Nothing leaves your browser.

## Controls

Everything is keyboard-driven. The mouse is never needed.

| Key      | Action                                                |
| -------- | ----------------------------------------------------- |
| F1       | Help: what this is and every control                  |
| F2 / F3  | Previous / next palette                               |
| F4       | Cycle style: Print, Clean, Ember, Tide, Frost, Gale   |
| F5       | Seismograph on/off                                    |
| F6       | Flow caption on/off                                   |
| F7       | Motion: full / subtle / off                           |
| F8       | Odometer and stats                                    |
| F9       | Controls strip show/hide                              |
| hold Esc | Clear the sheet (a tap does nothing)                  |
| Ctrl+Z   | Bring back the cleared sheet (press again to swap back) |
| Ctrl+C   | Copy everything you typed                             |
| Ctrl+S   | Show the proof of this session (save it from there)   |
| click    | Send a ripple through the letters                     |

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
npm test           # end-to-end tests (Playwright)
```

The end-to-end tests drive the production build in Chromium and WebKit, at
desktop and phone sizes and with reduced motion. Each bug that has been
fixed has a test so it stays fixed. `TYPE_BROWSERS=chromium npm test` runs
one engine. The page exposes a read-only state probe only when the URL has
`?probe`, which is how the tests see the document.

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
  joins the document and history slides up. The whole document is kept,
  but only the rows that fit on screen are drawn into an offscreen layer,
  so per-frame cost does not grow with how much has been typed.
- Every frame starts from a reset canvas state (alpha, composite, shadow),
  and the tests check the save/restore stack is empty between frames.
- Colors are parsed once and mixed as numbers; CSS strings are made only
  when the canvas needs one.
- Glyph landing uses a closed-form underdamped spring evaluated from glyph
  age, so animation state is free. The caret, the page and the Esc lift
  use small integrated springs.
- Flow detection uses a rolling 3-second window: mean inter-key gap and
  coefficient of variation, tuned for the 70 to 90 WPM range where real
  typing mixes 60 to 90 ms rolls with 250 ms+ word boundaries.
- The session recorder keeps a bounded stream of keystrokes (character,
  gap, settled weight) for the rhythm print. Backspaces are not recorded.
- The ink bloom freezes the previous frame and draws it over the new one
  through a growing, lobed hole, with a tide line stroked along its edge.
- Doodles are SVG path data on a 24 unit grid, stroked with Path2D and a
  moving line dash so they draw on like a pen. Their motion is closed form
  from age, like the glyphs. Margin doodles are stored with each line.
- Click waves redraw the history layer in small tiles, each pushed by the
  passing wave, only while a wave is alive.
- Worlds draw in two layers, one behind the ink and one in front, and
  cost nothing when no world is open. Rain beads refract a third-size copy
  of the frame, taken once per frame only while it rains.
- The proof is a one-shot off-screen render encoded with toBlob. It never
  runs on the hot path.
- The render loop schedules its next frame before doing any work, so one
  bad frame can never freeze the page.
- All persistence is localStorage with try/catch guards; the site works
  fully without it. Sheets are stored compactly (text plus one character
  of weight per glyph), so long pieces fit easily.
