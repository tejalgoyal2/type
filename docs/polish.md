# type: polish brief

## Kickoff prompt (paste this into the new chat)

```
You're polishing type: https://type.tgoyal.me, source github.com/tejalgoyal2/type.
It's my silent typing playground: one canvas where every letter lands like it has
weight. No timer, no score, no judging. This is a polish, not a rewrite, but I
think type can be a great thing, so I'm giving you a free hand. Be bold, be
creative, don't hold back on look, feel or ideas. Ask me only about things that
speak for me (copy, what to feature) and anything that touches deploys,
Cloudflare settings or commit dates.

Before anything else, read these two files in full:
- /Users/tejalgoyal/Desktop/Vibin/plans/type-polish.md (what type is, what's
  broken, the plan in rounds, a pile of ideas, the rules)
- /Users/tejalgoyal/Desktop/Vibin/plans/STUDY-the-press.md (how I like to work)

Then clone the repo to /Users/tejalgoyal/Desktop/Vibin/type, make a branch and
start Round 1. Pushing to main deploys to production, so never push or merge to
main without asking me. Commit as me only (details in the brief), with no
Co-Authored-By and no mention of Claude or AI anywhere. Give me a preview I can
open each round, show me screenshots, wait for my notes, fix every one, repeat.
```

---

## What type is today

Facts from the code at `main` (v1.2.0, 39 commits, May 20 to Aug 2, 2026).

**Stack.** Vite + TypeScript, no runtime libraries except the JetBrains Mono
variable font (`@fontsource-variable/jetbrains-mono`). About 2,700 lines across
10 files; 1,836 of them are `src/engine.ts`. Deployed as Cloudflare Workers
static assets (worker `type-tgoyal`). `.github/workflows/deploy.yml` runs
`wrangler deploy` on every push to `main`; `ci.yml` typechecks and builds every
branch. There are no tests.

**How it renders.** One full-viewport 2D canvas with the `desynchronized` hint,
redrawn every frame (`Engine.frame` -> `draw`). Typewriter model: the active
line sits at 58% of the viewport height; Enter bakes it into an offscreen
"static" canvas and history slides up 170 ms. No DOM is created while typing.
`main.ts` waits up to 2.5 s for two font weights before starting the engine.

**What you can do.**
- Type. Letters land on a closed-form underdamped spring (`springs.ts`
  `landCurve`). Hold time sets weight on the font's `wght` axis: 430 rising to
  760 over 450 ms while the key is down (capitals +55), relaxing over 10 s to a
  permanent "record" weight of `400 + (peak - 430) / 2`, so settled text spans
  roughly 400 to 565. Fresh ink is the accent colour and dries to ink over 9 s.
- The stamp: hold a letter 280 ms or more and release; it pulses and fires a
  shockwave in the shape of its own letterform, and the page thumps.
- The page has mass: an `impact` spring kicked by every key, harder on Enter.
- The caret squashes, leans with velocity, smears when it moves fast, glows
  with flow, tints while Shift is held.
- Flow (`rhythm.ts`): 3 s window, 8+ keys, mean gap under 260 ms, coefficient
  of variation under 0.85. Drives "heat": caret glow, Print misregistration,
  particle counts, and a tilted comic sticker showing WPM (top right).
- Streaks: no Backspace and no 2.5 s pause; milestones 50, 100, 250 ... 5000
  slam the sticker. One "NEW BEST n WPM" per session once your best is 40+.
- Six styles on F4 (`styles.ts`): Print (default: fresh ink out of register,
  snapping true as it dries, halftone bands top and bottom), Clean, Ember
  (sparks rise), Tide (rings), Frost (flecks fall), Gale (leaves blow).
- Fourteen palettes on F2/F3 (`palettes.ts`), seven light (Pressroom default)
  and seven dark.
- Secret words, checked at each space or Enter: fire/ember, water/tide,
  ice/frost, wind/gale, ink/print, plain/clean switch style; any palette id
  switches palette; `zen` hides all chrome.
- Writing surface: faint rules on every line, the active rule tinted and lit
  under the caret, line numbers in the margin.
- Seismograph of the last 12 s along the bottom (F5). Quiet controls strip top
  left (F9). Motion full / subtle / off (F7; OS reduced motion starts at
  subtle). Odometer overlay (F8): lifetime keys, session keys, best flow,
  longest streak, top five keys. Help overlay (F1). Both are drawn on canvas.
- Backspace runs its own accelerating repeat; Backspace at the start of a line
  pulls the previous line back. Tab types two spaces. Left/Right/Home/End move
  within the active line only.
- Esc clears the sheet (with a slide-away wipe); Ctrl/Cmd+Z brings back the
  last clear; Ctrl/Cmd+C copies the sheet; Ctrl/Cmd+S downloads a "rhythm
  print": a 1200x1500 PNG where the last 900 keystrokes are ticks on a
  sunflower spiral (`rhythmprint.ts`; length = gap before the key, thickness =
  settled weight).
- Everything persists in localStorage (`store.ts`: `typef.odometer.v1`,
  `typef.prefs.v1`, `typef.sheet.v1`), saved every 6 s and when the tab hides.

**Measured today** (live site, Playwright Chromium and WebKit, Oct 20 2026).
- Lighthouse mobile 95 / 100 / 81 / 91 (FCP 1.9 s, LCP 2.8 s, TBT 0, CLS 0).
  Desktop 100 / 100 / 81 / 91.
- First load: HTML 2.5 KB, JS 39 KB, CSS 2 KB, font 40 KB. Cloudflare also
  injects its Web Analytics beacon (32 KB) and its bot-detection script (24 KB
  plus a hidden iframe), more script than the app itself.
- Keydown to next frame: about 12 ms median in both engines. Idle: 60 fps.

## What's already wonderful

- The premise and its restraint. No supplied words, no timer, nothing to win.
  The welcome copy ("no test, no timer, no sound. just your words, with
  physics.") is plain and his.
- Hold time as ink weight on a real variable axis. It's an honest signal from
  the hands, not a canned animation.
- The stamp shockwave is the letter's own outline, so the word stays the hero
  even at peak impact. That's a real design idea.
- Print. Misregistration that snaps into register as the ink dries is the best
  thing here, and it belongs to the same world as the portfolio ("the press";
  this palette is even called Pressroom).
- The engineering taste: analytic particles and closed-form springs with no
  per-frame state, a typewriter model whose cost doesn't grow with the text,
  the low-latency canvas hint, try/catch around all storage, zero dependencies.
- Small mechanical joys: accelerating backspace, the un-Enter, the comic
  sticker, the seismograph, Shift tinting the caret.
- The rhythm print idea: the same session always makes the same poster.

## What's rough or broken

Everything under "Broken" was reproduced in a real browser.

### Broken

1. **The glow leaks and the canvas state stack grows forever.** In
   `drawActiveLine` (`src/engine.ts`), `if (glowing) { ctx.save(); ... }` has
   no matching `restore()`. After about 40 s of typing through Ember, Tide and
   Frost the save stack was 15,188 deep, and `shadowBlur` stayed non-zero for
   the rest of the session. Every later draw gets a halo: history, the help
   card, the odometer, the sticker. Easy to see in screenshots. In Chromium on
   an M4 Pro GPU, typing in the elemental styles fell to about 25 fps, and it
   stays slow until you reload. Fix the pairing, reset shadow state at the
   start of each frame, and add a test that the save depth is 0 at frame end.
2. **Elemental fresh ink is broken on all seven light palettes, including the
   default.** On light paper `fx()` returns `mixHex(...)` output, which is an
   `rgb(...)` string. `drawActiveLine` then calls `mixHex(fx.fresh, p.ink,
   dryT)`, which parses hex and gets `rgb(NaN,NaN,NaN)`. The canvas ignores
   invalid colours, so glyphs take whatever fill was set last. "Letters land
   hot and cool as they dry" never happens on light paper. Keep colours as
   numbers and use one mixer.
3. **Long writing gets thrown away.** `commitLine` trims `baked` to the lines
   that fit above the typing line (`keep = ceil(typingY / lineHeight) + 4`).
   After 30 lines, both localStorage and Ctrl+C held only the last 14 or 15.
   Help promises "copy everything you typed". Line numbers come from
   `baked.length`, so they restart too (screenshot: "line 20" numbered 1).
   Keep a full document model and window only the rendering.
4. **Words split mid-word.** `insertChar` commits the line as soon as
   `active.length >= maxCols`, giving "supercalifragilisticexpia / lidocious".
   Carry the trailing word to the next line.
5. **Secret words hijack ordinary prose.** Typing "i spilled water", "had to
   clean it" and "watched the dusk" switched to Tide, then Clean, then the dark
   Dusk palette; "zen calm" hid the chrome. ink, print, plain, ice, wind, fire,
   sage and slate are everyday words too. Make the trigger deliberate (for
   example, the word alone on its line, then Enter).
6. **Esc is a one-key wipe, and the undo doesn't survive a reload.** Vim people
   hit Esc on reflex. Esc, then reload, then Ctrl+Z restored nothing: the undo
   slot lives only in memory and the empty sheet saves when the page hides.
   Persist the undo, or make clearing deliberate (hold Esc, or press it twice).
7. **Phones are a dead end.** There's no input element, so a tap never opens a
   keyboard (iPhone 15 WebKit and Pixel 7 Chromium: zero inputs, focus stays
   on `body`). At 393 px the welcome runs off the right edge, and it tells a
   phone to "press F1".
8. **IME, dead keys and Option characters are lost.** `onKeyDown` returns on
   `isComposing` and ignores any printable key with `altKey`. On a Mac that
   means no em dash (Option+Shift+-), no trademark sign, no degree sign, and no
   Japanese, Chinese or Korean input, emoji picker, dictation or paste. The fix
   for this and for phones is the same: a hidden textarea taking
   `beforeinput`/`input`, with keydown/keyup kept only for timing.
9. **Keys stick after focus loss.** Nothing resets `bsHeld`, `shiftHeld` or
   held glyphs (`upAt === null`) on `blur`. Hold Backspace and Cmd+Tab away:
   the keyup never arrives, the window stays visible so rAF keeps running, and
   deletion keeps accelerating through the sheet. Held letters also stay "wet"
   and heavy until that key is pressed again. Tab's two spaces carry code
   `Space`, so they close only on the next Space keyup.

### Rough

- **The F-row is the only menu.** On Mac laptops and many keyboards F1 to F12
  are brightness and media keys unless you hold fn. F3, F5, F6 and F7 have
  browser jobs too. A MacBook visitor can't open help without knowing about fn,
  and the controls strip shows keys but can't be clicked.
- **History runs under the chrome.** Old lines fade only to 30% alpha
  (`rebuildStatic`), so they print over the controls strip and the sticker.
- **Accessibility is effectively zero.** A bare `<canvas>`: no role, no label,
  no text in the DOM. Lighthouse scores 100 only because there's nothing for it
  to check. Screen readers get nothing; help and the odometer are pixels. The
  strip (`#B9B0A0` at 40% on `#F4EFE6`) and the line numbers are far below
  4.5:1. Reduced motion only scales motion to 45%; it isn't a calm version
  someone designed.
- **Dark OS, light page.** `<meta name="color-scheme" content="light dark">`,
  but the default is always Pressroom. No `theme-color`.
- **Pressure is too subtle.** A normal tap records about 400 to 430, a long
  hold 565, so a finished paragraph looks nearly uniform. (Side note for
  Tejal, not this repo: the portfolio card says "how hard you strike a key",
  but it's how long you hold it.)
- **No measure cap.** Font size stops at 34 px but the columns keep growing:
  about 110 columns on a 2560 px screen.
- **Frame-rate-dependent easing** (`captionA += ... * 0.12` per frame runs
  faster at 120 Hz). The page redraws every frame forever, even when only the
  caret is blinking.
- **Slow first words.** The font is requested only once the JS calls
  `document.fonts.load` (no preload), then the welcome waits another 600 ms.
- **The rhythm print** is tasteful but thin: a short session reads as sparse
  dashes, the footer is low contrast, and none of your actual words appear.

### Housekeeping

- **The README describes features that are gone:** the Echo ghost, F10, Ctrl+E
  share links, the aurora, and the `echo` secret word were all removed in July
  (`ab5828d`, `241597f`). `Rhythm.flow().even` is computed but unused.
  `echo.ts` is now only a recorder.
- **Hosting (ask Tejal first; these are zone and account settings):** the
  injected beacon and bot-detection scripts cause Best Practices 81
  (deprecated APIs). `not_found_handling: "single-page-application"` serves
  HTML for `/robots.txt` (SEO 91) and every 404. Hashed `/assets/*` are served
  `max-age=0`; a `public/_headers` with `immutable` fixes that. There's no
  Open Graph card and no apple-touch-icon.
- **No tests.** CI only typechecks and builds.

---

## Polish plan, in rounds

Show Tejal each round on a preview: screenshots in both engines, light and
dark, phone, reduced motion. Take his notes, fix every one, answer every
question, then move on.

### Round 1: make it trustworthy

Fix every "Broken" item from 1 to 9 except phones and IME (those are Round 2),
plus the history-under-chrome fade and an honest README. Set up Playwright in
the repo (Chromium + WebKit, desktop + phone + reduced motion) with one
regression test per bug, and run it in CI.

Done looks like:
- 10 minutes of typing through all six styles holds 60 fps, with save depth 0
  and `shadowBlur` 0 at the end of every frame.
- Ember on Pressroom visibly lands hot and cools.
- 200 typed lines: Ctrl+C returns all 200, the line numbers are right, and a
  reload brings back all 200.
- No word splits at the margin.
- "i spilled water on the desk" changes nothing.
- Esc, reload, Ctrl+Z restores the sheet.
- Hold Backspace, Cmd+Tab away: deletion stops.
- Lighthouse no worse than today.

### Round 2: every door open

- An input layer: a hidden, focused textarea for text (IME, dead keys, Option
  characters, emoji, dictation, paste), with keydown/keyup kept for hold
  timing.
- A touch version that's designed, not shrunk: tap the paper to raise the
  keyboard, keep the typing line above it with `visualViewport`, a phone
  layout and welcome, and weight from cadence when hold time isn't available.
- A way in without F-keys: a `/` command line at the start of an empty line,
  or a leader key, shown in help, with F-keys kept as aliases.
- Real accessibility: the textarea is the labelled textbox; help and the
  odometer also exist as DOM dialogs; announcements are off by default;
  contrast fixed; a calm reduced-motion version that expresses rhythm through
  ink and colour instead of movement.
- Follow the OS colour scheme on first visit, with a dark default designed as
  carefully as Pressroom.

Done looks like:
- He types a paragraph on his iPhone and on an Android phone.
- VoiceOver reads back what was typed.
- Option+Shift+- prints an em dash, and Japanese IME works.
- A MacBook user without fn reaches every control.
- A first visit on a dark OS lands on the dark default.

### Round 3: the feel pass

- Make pressure legible: a wider settled-weight range, maybe a second axis
  (see Recursive below).
- Give each style one moment of its own, so they stop being a recolour plus
  particles.
- Make Print the hero.
- Rebuild the rhythm print so it's worth framing.
- Idle redraws at a lower cadence when nothing but the caret moves.
- Preload the font, and cap the measure on wide screens.

Done looks like:
- Tap and hold read differently at a glance in finished text.
- Each style has something that makes Tejal grin.
- Light and dark versions of every style look designed, not flipped.
- Mobile Lighthouse performance is 98 or better.

### Round 4: bigger swings

Pick two or three from the list below with Tejal: probably one new style, one
sharing or export piece, and the secrets checklist. Prototype each one behind
a flag before polishing it.

Done looks like: they ship without the first load growing past budget (see
Guardrails).

---

## Experiments and ideas

Tags: `[cheap]` = an afternoon, `[medium]` = a round, `[ambitious]` = a
project. `[ask]` = bends the "no timer, no score, no judging, silent" soul, so
it needs Tejal's call first.

### New styles
- **Carriage** `[cheap]`. The caret stays put and the paper slides left under
  it like a real typewriter carriage; Enter throws the carriage back with a
  spring. Near the right margin, a silent visual "ding" appears in the margin.
- **Ribbon** `[cheap]`. A typewriter with a two-colour ribbon: Caps Lock
  prints red. Each key gets its own fixed baseline wobble and ink density, like
  worn typebars, seeded by key code so your "e" is always slightly low.
- **Tumble** `[ambitious]`. Backspace doesn't erase: letters drop off the line
  and pile up at the bottom in a tiny rigid-body sim (boxes, sleeping bodies,
  hard cap). Esc tips the pile off the page. The purest form of "the text
  itself has physics".
- **Letterpress** `[ambitious]`. Real WebGL: a normal map from each glyph's
  distance field and one real light, so letters sit pressed into the paper;
  hold time sets the impression depth. In the dark version the ink is foil and
  a sheen sweeps across on Enter. Real lighting, not a fake inner shadow.
- **Chalk** `[medium]`. Coloured sidewalk chalk on warm concrete for light;
  a slate board for dark. Backspace dusts, Esc is an eraser smear.
- **Drip** `[medium]`. Spray stencil. Holding a key loads more paint, and long
  holds drip down until the drip meets the next rule.
- **Cipher** `[cheap]`, a secret style. Text renders as Braille cells, Morse
  or binary, while copy still gives plain text.

### Typography
- **Recursive** `[medium]`. Swap in or add Recursive Mono (axes wght, CASL,
  slnt, CRSV), subset to what's needed. Hold time keeps weight; speed drives
  CASL, so fast typing gets loose and handwritten and careful typing prints
  linear. Rhythm literally changes the letterforms. Check its size.
- **Smart typing in Print** `[cheap]`. Curly quotes, `--` becomes an em dash,
  `...` becomes an ellipsis, and a drop cap for the first letter of a sheet
  (he loved the drop cap on the portfolio).
- **A cadence line per row** `[cheap]`. Swap the line numbers for a tiny
  sparkline of that line's rhythm, so the margin becomes a record of how each
  line was typed.
- **Ligatures done right** `[cheap]`. History runs get JetBrains Mono's
  ligatures but the active line, drawn per glyph, doesn't. Pick one behaviour.
- **Book mode** `[ambitious]`. A proportional variable serif with real
  layout. Leaves the monospace grid, so prototype it first.

### The life layer (the mouse is optional, but it can play)
- **Click ripple** `[cheap]`. A click sends a wave through the printed letters
  outward from the pointer, like the Claude desktop background he loved.
- **Lift** `[cheap]`. Letters lean or lift slightly as the pointer passes.

### Keyboard-nerd features (descriptive, never comparative)
- **Rollover sticker** `[cheap]`. Count keys held down at the same time and
  show "4-key roll" when someone rolls a word. NKRO people will love it.
- **Keyboard heatmap** `[medium]`. The odometer draws your keyboard coloured
  by presses. It uses `navigator.keyboard.getLayoutMap()` where available
  (Colemak/Dvorak aware) and falls back to ANSI and ISO shapes.
- **Spec sheet** `[cheap]`. Average dwell and flight time per key, your fastest
  bigram ("th 48 ms"): facts about your hands, not a grade.
- **Vim jokes** `[cheap]`. `:w` saves a print, `:q` clears (with undo).
- **Live favicon** `[cheap]`. The tab icon shows the last letter typed, or a
  tiny seismograph.

### Sharing and export
- **Proof sheet** `[medium]`. A second print: the actual words set as a
  letterpress proof, with the weights you pressed, the misregistration frozen,
  crop marks and a colophon (date, keys, style). Keep the spiral as the
  rhythm print.
- **Replay link** `[medium]` `[ask]`. Text, weights and timing compressed into
  the URL hash (it never reaches a server), and the link types the piece back
  at its original cadence. He removed Echo sharing in July, so ask why first.
- **Clip** `[medium]`. MediaRecorder captures the last 15 s of the canvas as a
  shareable video.
- **Open Graph card** `[cheap]`. A designed static card, so links don't
  unfurl blank.
- **Plain export** `[cheap]`. Ctrl+Shift+S saves .txt or .md.

### Honest pressure and sound
- **Listen to the switches** `[ambitious]` `[ask]`. An opt-in mic mode where
  the loudness of each real keystroke sets the weight, so a thocky board prints
  heavier. The keyboard is the instrument and the page listens, literally.
  Fully on-device, never recorded, permission asked once. It doesn't add
  sound; it uses the sound already in the room.
- **Opt-in page sound** `[ask]`. It breaks "silent on purpose", so only raise
  it if he asks.

### Little secrets (with a checklist that ticks itself off)
- **The secrets checklist** `[cheap]`. The odometer shows "secrets: 3 of 12",
  each name hidden until found. He loved this on the portfolio.
- **"lights out"** `[cheap]`, alone on a line: an F1 start sequence (five red
  lights, then out) and the next line races in. **"box box"**: a pit stop
  that changes palette in 2.3 s.
- **"scramble"** `[medium]`: the last line scrambles into cube-sticker colours
  and solves itself back, move by move.
- **"abracadabra"** `[cheap]`: your last word vanishes, then turns up
  somewhere else on the page.
- **A pangram in one sheet** `[cheap]`: all 26 letters light up in a margin
  ribbon.
- **Home row chord** `[cheap]`: holding asdf jkl; at once sends a ripple.
- **A full line in caps** `[cheap]`: the page shouts, with double mass.
- **Tree rings** `[medium]`: the lifetime odometer drawn as a cross-section
  of a trunk, one ring per day typed, ring width = keys that day. A quiet nod
  to the trees.
- **Odometer roll** `[cheap]`: at round numbers the counter rolls over like a
  mechanical counter.
- **Pasted ink** `[cheap]`: pasted text lands in a flat grey "not typed" ink.
  Honest, a little cheeky.

### Writing, without becoming an editor
- **Sheets** `[medium]`. Ctrl+N starts a fresh sheet; old sheets go into a
  drawer you can flip through. Everything stays local.
- **Word sticker** `[ask]`. The sticker could say a word instead of a number
  in flow ("rolling", "locked in"), if he ever wants WPM gone.

### Performance
- Precompute colour ramps instead of building colour strings per glyph per
  frame, cache font strings, skip redraws when nothing changed, and draw the
  caret blink on a cheap path.

---

## Guardrails

- **Branch and preview.** Work on a branch, never on `main`. Pushing to `main`
  deploys production through `deploy.yml`, so never push or merge to `main`
  without asking. For previews, propose a non-main workflow running `wrangler
  versions upload --preview-alias <branch>`, but ask before adding it: it needs
  preview URLs turned on for the worker. Until then, use `npm run build &&
  npm run preview` for the review and stop it afterwards.
- **Commits.** Author and committer must both be `Tejal Goyal
  <132282123+tejalgoyal2@users.noreply.github.com>`. Set this in the repo's
  local git config. Older commits use a different address; don't rewrite
  history. No `Co-Authored-By`, and no mention of Claude or AI in commits, code
  comments, the README or PR bodies, even if the tooling adds it by default.
  Messages stay short and lowercase, like the existing ones ("engine: ...",
  "docs: ...").
- **Dates.** The existing history is spread about one commit every two days.
  Ask Tejal what he wants for commit dates before backdating or spreading
  anything.
- **Light and fast.** No frameworks or animation libraries. App JS stays under
  50 KB gzipped. Any new font or WebGL code loads lazily, only when its style
  is chosen. Every wow stays light. Keep the low-latency canvas, and keep
  keydown-to-frame at about 12 ms.
- **Three designs per piece:** desktop, touch, reduced motion. Light mode is
  designed first, and dark is designed too, not inverted. Real WebGL or real
  CSS 3D only; no faked depth.
- **Verify like a user.** Use Playwright in Chromium and WebKit, at desktop
  and phone sizes, with reduced motion. Record video and read it frame by
  frame for motion bugs. Write an e2e test for every bug he reports.
  Lighthouse (mobile and desktop) before every stop; today's baseline is
  95/100/81/91 mobile and 100/100/81/91 desktop.
- **Never leave dev or preview servers running.**
- **Don't change Cloudflare zone or account settings, DNS, CI secrets or
  analytics without asking.**
- **Don't edit the portfolio repo.** If its type card goes stale (six styles,
  "how hard you strike a key"), tell him.
- **Voice.** Copy is lowercase, plain and wry, like the welcome. Ask before
  writing copy that speaks for him. Never his birth year, employer or city.
- **Don't use his Chibi or Rizzual skills.**
- **Make the big calls on look and motion yourself.** Ask about identity and
  content.
