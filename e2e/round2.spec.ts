import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { open, probe, reload, expectText, MOD } from "./helpers";

test("words draw doodles that settle into the margin and stay", async ({ page }) => {
  await open(page);
  await page.keyboard.type("on sunday the sun came out ");
  let p = await probe(page);
  // "sunday" is not a doodle word; "sun" is.
  expect(p.activeMarks).toEqual(["sun"]);
  expect(p.found).toContain("sun");

  await page.keyboard.type("and i made coffee.");
  await page.keyboard.press("Enter");
  p = await probe(page);
  // On a phone the sentence wraps, so coffee may sit on the next row.
  const marks = p.marks.flat();
  expect(marks).toEqual(["sun", "coffee"]);
  expect(p.activeMarks).toEqual([]);

  await reload(page);
  p = await probe(page);
  expect(p.marks.flat()).toEqual(marks);
  expect(p.found).toEqual(expect.arrayContaining(["sun", "coffee"]));
});

test("Ctrl+S shows the proof, and only saves when asked", async ({ page }) => {
  await open(page);
  await page.keyboard.type("a few honest words under the moon\nand a second line", { delay: 20 });
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.keyboard.press(`${MOD}+s`);
  const img = page.locator(".proof img");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])).toEqual([1800, 1200]);
  expect(downloads).toBe(0);
  // Keys go to the popup, not the page.
  await page.keyboard.type("xyz");
  expect((await probe(page)).text).not.toContain("xyz");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "save" }).click();
  expect((await download).suggestedFilename()).toMatch(/^type-\d{8}\.png$/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".proof")).toHaveCount(0);
  await page.keyboard.type("!");
  expect((await probe(page)).text.endsWith("!")).toBe(true);
});

test("rolling keys together is noticed", async ({ page }) => {
  await open(page);
  for (const k of ["a", "s", "d", "f"]) await page.keyboard.down(k);
  for (const k of ["a", "s", "d", "f"]) await page.keyboard.up(k);
  expect((await probe(page)).bestRoll).toBe(4);
});

test("lights out and box box are spent, not written", async ({ page }) => {
  await open(page, { prefs: { palette: 0 } });
  await page.keyboard.type("before\n");
  await page.keyboard.type("lights out");
  await page.keyboard.press("Enter");
  await page.keyboard.type("box box");
  await page.keyboard.press("Enter");
  await expectText(page, "before\n");
  await expect.poll(async () => (await probe(page)).prefs.palette, { timeout: 5000 }).toBe(1);
});

test("the pace sticker stays up after you stop typing", async ({ page }) => {
  await open(page, { prefs: { palette: 0 } });
  await page.keyboard.type("steady hands make steady pages", { delay: 60 });
  await page.waitForTimeout(3500);
  const vp = page.viewportSize()!;
  const shot = PNG.sync.read(
    await page.screenshot({ clip: { x: vp.width / 2, y: 0, width: vp.width / 2, height: 140 }, scale: "css" })
  );
  // Pressroom's sticker is yellow; nothing else up there is.
  let yellow = 0;
  for (let i = 0; i < shot.data.length; i += 4) {
    const [r, g, b] = [shot.data[i]!, shot.data[i + 1]!, shot.data[i + 2]!];
    if (r > 200 && g > 160 && b < 140 && r - b > 90) yellow++;
  }
  expect(yellow).toBeGreaterThan(200);
});

test("a style word that merely wrapped onto its own row stays prose", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await open(page, { prefs: { style: "print" } });
  const { layout } = await probe(page);
  // Fill the row so "water" is carried down alone.
  const filler = "a".repeat(layout.maxCols - 3) + " ";
  await page.keyboard.type(filler + "water");
  expect((await probe(page)).active).toBe("water");
  await page.keyboard.press("Enter");
  const p = await probe(page);
  expect(p.prefs.style).toBe("print");
  expect(p.text).toBe(filler + "water\n");
});

test("a narrower window reflows the writing instead of trapping the caret", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await open(page, { prefs: { motion: 0 } });
  const text = "the quick brown fox jumps over the lazy dog and keeps on running far past the edge";
  await page.keyboard.type(text);
  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(async () => (await probe(page)).rows.length).toBeGreaterThan(0);
  let p = await probe(page);
  expect(p.text).toBe(text);
  for (const row of [...p.rows, p.active]) expect(row.length).toBeLessThanOrEqual(p.layout.maxCols + 1);
  // Mid-row editing still works.
  await page.keyboard.press("Home");
  await page.keyboard.type("Z");
  p = await probe(page);
  expect(p.active.startsWith("Z")).toBe(true);
});

test("a space refused at the margin draws nothing", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await open(page);
  const { layout } = await probe(page);
  await page.keyboard.type("sun." + "x".repeat(layout.maxCols - 4));
  await page.keyboard.press("Home");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press(" ");
  const p = await probe(page);
  expect(p.activeMarks).toEqual([]);
  expect(p.active.length).toBe(layout.maxCols);
});

test("quick palette changes stack their blooms instead of cutting each other off", async ({ page }) => {
  await open(page, { prefs: { motion: 2 } });
  await page.keyboard.type("ink");
  await page.keyboard.press("F2");
  await page.waitForTimeout(150);
  await page.keyboard.press("F2");
  await page.waitForTimeout(150);
  await page.keyboard.press("F2");
  expect((await probe(page)).blooms).toBe(3);
  await expect.poll(async () => (await probe(page)).blooms, { timeout: 4000 }).toBe(0);
});

test("a word opens a world, and the page keeps its own colors underneath", async ({ page }) => {
  await open(page, { prefs: { palette: 0 } });
  await page.keyboard.type("the rain came in sideways ");
  expect((await probe(page)).world).toBe("rain");
  await page.keyboard.type("then the snow ");
  expect((await probe(page)).world).toBe("snow");
  // Changing the palette by hand leaves the world.
  await page.keyboard.press("F2");
  const p = await probe(page);
  expect(p.world).toBe(null);
  expect(p.prefs.palette).not.toBe(0);
});

test("speed shifts gears, a line is a timed lap, and easing off shifts down", async ({ page }) => {
  test.slow();
  await open(page, { prefs: { motion: 2 } });
  // An even, quick cadence: about 100 wpm.
  await page.keyboard.type("the quick brown fox jumps over the lazy dog and keeps on going", { delay: 115 });
  await expect.poll(async () => (await probe(page)).race.gear, { timeout: 5000 }).toBeGreaterThan(3);
  await page.keyboard.press("Enter");
  expect((await probe(page)).race.laps).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(3000);
  await expect.poll(async () => (await probe(page)).race.gear, { timeout: 8000 }).toBe(1);
});
