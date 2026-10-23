import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { readFile } from "node:fs/promises";
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

test("Ctrl+S pulls a rhythm proof", async ({ page }) => {
  await open(page);
  await page.keyboard.type("a few honest words under the moon\nand a second line", { delay: 20 });
  const download = page.waitForEvent("download");
  await page.keyboard.press(`${MOD}+s`);
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^type-proof-\d{8}\.png$/);
  const png = PNG.sync.read(await readFile((await d.path())!));
  expect([png.width, png.height]).toEqual([1500, 2000]);
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
