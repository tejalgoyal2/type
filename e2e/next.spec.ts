import { test, expect, type Page } from "@playwright/test";

type Probe = { text: string; sw: string; way: string; finds: string[]; kro: number; board: boolean; tested: number; az: number };
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __next: { probe(): Probe } }).__next.probe());

test.beforeEach(async ({ page }) => {
  await page.goto("/next/?probe");
  await page.waitForFunction(() => "__next" in window);
});

test("typing prints, morphs and reads markup without errors", async ({ page, isMobile }) => {
  test.skip(isMobile, "hardware keys");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.keyboard.type("# hi\nwait -- what... :) **yes** ~no~ 42!", { delay: 15 });
  const p = await probe(page);
  expect(p.text).toBe("# hi\nwait — what… :) **yes** ~no~ 42!");
  for (const id of ["head", "dash", "dots", "smile", "bold", "wavy", "digits", "jump"]) expect(p.finds).toContain(id);
  expect(errors).toEqual([]);
});

test("keys that are not letters each do their job", async ({ page, isMobile }) => {
  test.skip(isMobile, "hardware keys");
  const before = await probe(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("PageDown");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(250);
  await page.keyboard.up("ArrowRight");
  for (const k of ["KeyA", "KeyS", "KeyD", "KeyF"]) await page.keyboard.down(k);
  for (const k of ["KeyA", "KeyS", "KeyD", "KeyF"]) await page.keyboard.up(k);
  await page.keyboard.type("strike me", { delay: 10 });
  await page.keyboard.press("Delete");
  const p = await probe(page);
  expect(p.sw).not.toBe(before.sw);
  expect(p.way).not.toBe(before.way);
  expect(p.az).toBeGreaterThan(before.az);
  expect(p.kro).toBeGreaterThanOrEqual(4);
  for (const id of ["switch", "color", "light", "kro4", "strike"]) expect(p.finds).toContain(id);
});

test("holding esc clears, ctrl+z brings it back, and the page survives a reload", async ({ page, isMobile }) => {
  test.skip(isMobile, "hardware keys");
  await page.keyboard.type("keep this", { delay: 10 });
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => "__next" in window);
  expect((await probe(page)).text).toBe("keep this");
  await page.keyboard.down("Escape");
  await page.waitForTimeout(1100);
  await page.keyboard.up("Escape");
  expect((await probe(page)).text).toBe("");
  await page.keyboard.press("Control+z");
  expect((await probe(page)).text).toBe("keep this");
});

test("on a phone the twin keyboard stays out of the way and taps type", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phones only");
  expect((await probe(page)).board).toBe(false);
  await page.locator("#stage").tap({ position: { x: 100, y: 200 } });
  await page.locator("#sink").pressSequentially("hey", { delay: 20 });
  expect((await probe(page)).text).toBe("hey");
});
