import { test, expect, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { open, probe, reload, expectText, MOD } from "./helpers";

/** Watch every frame boundary for leaked canvas state on the stage. */
async function watchCanvasState(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.getElementById("stage") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const w = window as unknown as { __leak: { depth: number; blur: number; frames: number } };
    w.__leak = { depth: 0, blur: 0, frames: 0 };
    const tick = () => {
      w.__leak.depth = Math.max(w.__leak.depth, window.__canvasDepth(ctx));
      w.__leak.blur = Math.max(w.__leak.blur, ctx.shadowBlur);
      w.__leak.frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function leak(page: Page): Promise<{ depth: number; blur: number; frames: number }> {
  return page.evaluate(
    () => (window as unknown as { __leak: { depth: number; blur: number; frames: number } }).__leak
  );
}

/**
 * RGBA pixels of what is actually on screen in a CSS-pixel rect, read from
 * a real screenshot (canvas readback is not reliable in every engine).
 */
async function pixels(page: Page, x: number, y: number, w: number, h: number): Promise<number[]> {
  const png = PNG.sync.read(
    await page.screenshot({ clip: { x, y, width: w, height: h }, scale: "css" })
  );
  return Array.from(png.data);
}

test("canvas state never leaks between frames, in any style", async ({ page }) => {
  test.slow();
  await open(page, { prefs: { style: "print" } });
  await watchCanvasState(page);
  // Type in flow (even cadence) through all six styles, so glow kicks in.
  // Clicks send waves, words draw doodles, Ctrl+S pulls a proof: all of it
  // has to leave the canvas clean.
  for (let s = 0; s < 6; s++) {
    await page.keyboard.type("the quick brown fox jumps over the lazy dog under the sun ", { delay: 55 });
    await page.mouse.click(300 + s * 40, 200);
    await page.keyboard.press("F4");
  }
  await page.keyboard.type("lights out\n");
  await page.keyboard.press(`${MOD}+s`);
  await page.waitForTimeout(1200);
  const l = await leak(page);
  expect(l.frames).toBeGreaterThan(30);
  expect(l.depth).toBe(0);
  expect(l.blur).toBe(0);
});

test("ember lands hot on light paper", async ({ page }) => {
  // Motion off: no particles, so no stray fill color can stand in for ink.
  await open(page, { prefs: { style: "ember", palette: 0, motion: 0 } });
  await page.keyboard.type("MMMM");
  const { layout } = await probe(page);
  const px = await pixels(
    page,
    layout.marginX,
    layout.typingY - layout.fs,
    layout.advance * 4,
    layout.fs
  );
  // Ember's fresh ink on Pressroom is a burnt orange: red well above blue,
  // and green well above blue too. Dried ink is near black, the quiet grey
  // and the reddish rule tint both have green close to blue.
  let orange = 0;
  let darkest = [255, 255, 255];
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
    if (r - b > 50 && g - b > 30) orange++;
    if (r + g + b < darkest[0]! + darkest[1]! + darkest[2]!) darkest = [r, g, b];
  }
  const { rafSkew } = await probe(page);
  expect(orange, `darkest ink rgb(${darkest.join(",")}), rAF skew ${Math.round(rafSkew)} ms`).toBeGreaterThan(20);
});

test("a long piece survives: copy, line numbers and reload keep every line", async ({ page }) => {
  test.slow();
  await open(page, { prefs: { motion: 0 } });
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
  for (const l of lines) {
    await page.keyboard.type(l);
    await page.keyboard.press("Enter");
  }
  const want = lines.join("\n") + "\n";
  await expectText(page, want);

  const p = await probe(page);
  expect(p.rows).toHaveLength(200);
  expect(p.lineNos[199]).toBe(200);
  expect(p.activeLineNo).toBe(201);

  await page.keyboard.press(`${MOD}+c`);
  await expect.poll(() => page.evaluate(() => window.__clip)).toBe(want);

  await reload(page);
  await expectText(page, want);
  expect((await probe(page)).activeLineNo).toBe(201);
});

test("words never split at the margin", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await open(page, { prefs: { motion: 0 } });
  const text =
    "it was a supercalifragilisticexpialidocious afternoon and the keys kept " +
    "coming one after another until the margin arrived and nothing broke apart";
  await page.keyboard.type(text);
  const p = await probe(page);
  expect(p.text).toBe(text);
  expect(p.rows.length).toBeGreaterThan(1);
  for (const row of p.rows) {
    expect(row.length).toBeLessThanOrEqual(p.layout.maxCols + 1);
    expect(row.endsWith(" "), `row "${row}" ends mid-word`).toBe(true);
  }

  // A word longer than the whole measure still has to break somewhere.
  await page.keyboard.press("Enter");
  const long = "x".repeat(p.layout.maxCols + 5);
  await page.keyboard.type(long);
  expect((await probe(page)).text).toBe(`${text}\n${long}`);
});

test("secret words only answer when written alone on a line", async ({ page }) => {
  await open(page, { prefs: { style: "print", palette: 0 } });
  const before = (await probe(page)).prefs;
  for (const line of ["i spilled water on the desk", "had to clean it", "watched the dusk", "zen calm"]) {
    await page.keyboard.type(line);
    await page.keyboard.press("Enter");
  }
  expect((await probe(page)).prefs).toEqual(before);

  await page.keyboard.type("ember");
  await page.keyboard.press("Enter");
  await page.keyboard.type("dusk");
  await page.keyboard.press("Enter");
  const p = await probe(page);
  expect(p.prefs.style).toBe("ember");
  expect(p.prefs.palette).toBe(12);
  // The word is spent: it does not stay in the writing.
  expect(p.text).not.toContain("ember");
  expect(p.text).not.toMatch(/^dusk$/m);
});

test("Esc must be held to clear, and the undo survives a reload", async ({ page }) => {
  await open(page);
  await page.keyboard.type("keep this\nand this");
  const text = "keep this\nand this";
  await expectText(page, text);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  await expectText(page, text);

  await page.keyboard.down("Escape");
  await page.waitForTimeout(1000);
  await page.keyboard.up("Escape");
  await expectText(page, "");

  await reload(page);
  await expectText(page, "");
  await page.keyboard.press(`${MOD}+z`);
  await expectText(page, text);
});

test("a full Esc hold clears even if no frame lands during it", async ({ page }) => {
  await open(page, { prefs: { motion: 0 } });
  await page.keyboard.type("stalled frames");
  await expectText(page, "stalled frames");
  // Hold every animation frame back, as a busy machine would.
  await page.evaluate(() => {
    const w = window as unknown as { __held: FrameRequestCallback[]; __raf: typeof requestAnimationFrame };
    w.__held = [];
    w.__raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => (w.__held.push(cb), 0);
  });
  await page.waitForTimeout(100);
  await page.keyboard.down("Escape");
  await page.waitForTimeout(900);
  await page.keyboard.up("Escape");
  expect((await probe(page)).text).toBe("");
  await page.evaluate(() => {
    const w = window as unknown as { __held: FrameRequestCallback[]; __raf: typeof requestAnimationFrame };
    window.requestAnimationFrame = w.__raf;
    for (const cb of w.__held) w.__raf(cb);
  });
  await page.keyboard.press(`${MOD}+z`);
  await expectText(page, "stalled frames");
});

test("held keys let go when the window loses focus", async ({ page }) => {
  await open(page, { prefs: { motion: 0 } });
  await page.keyboard.type("a".repeat(40));
  await page.keyboard.down("Backspace");
  await page.waitForTimeout(700);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const atBlur = (await probe(page)).text.length;
  expect(atBlur).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  expect((await probe(page)).text.length).toBe(atBlur);
  await page.keyboard.up("Backspace");
});

test("history fades out before it reaches the controls", async ({ page }) => {
  test.slow();
  await open(page, { prefs: { caption: false, motion: 0 } });
  const { layout } = await probe(page);
  const rows = Math.ceil(layout.typingY / layout.lineHeight) + 6;
  for (let i = 0; i < rows; i++) {
    await page.keyboard.type("WWWWWWWWWWWWWWWWWWWW");
    await page.keyboard.press("Enter");
  }
  // Let the chrome settle to its idle opacity, then sample the top band.
  await page.waitForTimeout(4500);
  const viewport = page.viewportSize()!;
  const withHistory = await pixels(page, 0, 0, viewport.width, 90);
  // Sanity: history is really on screen lower down, so a blank read can't pass.
  const below = await pixels(page, 0, layout.typingY - layout.lineHeight * 2, viewport.width, layout.lineHeight);
  let dark = 0;
  for (let i = 0; i < below.length; i += 4) if (below[i]! < 120) dark++;
  expect(dark).toBeGreaterThan(50);

  await page.keyboard.down("Escape");
  await page.waitForTimeout(1000);
  await page.keyboard.up("Escape");
  await page.waitForTimeout(4500);
  const empty = await pixels(page, 0, 0, viewport.width, 90);

  let diff = 0;
  for (let i = 0; i < empty.length; i++) diff = Math.max(diff, Math.abs(empty[i]! - withHistory[i]!));
  expect(diff).toBeLessThan(8);
});

test("loads clean, with no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await open(page);
  await page.keyboard.type("hello there");
  await page.keyboard.press("Enter");
  await expectText(page, "hello there\n");
  expect(errors).toEqual([]);
});
