import { expect, type Page } from "@playwright/test";

export interface Probe {
  text: string;
  rows: string[];
  marks: string[][];
  activeMarks: string[];
  found: string[];
  bestRoll: number;
  active: string;
  activeLineNo: number;
  lineNos: number[];
  prefs: {
    palette: number;
    style: string;
    seismo: boolean;
    caption: boolean;
    chrome: boolean;
    motion: 0 | 1 | 2;
  };
  layout: {
    marginX: number;
    typingY: number;
    advance: number;
    fs: number;
    lineHeight: number;
    maxCols: number;
  };
  canUndo: boolean;
  rafSkew: number;
  blooms: number;
  cine: { focus: number; laps: number; zone: number; zoom: number };
  world: string | null;
}

declare global {
  interface Window {
    __type: { probe(): Probe };
    __clip: string;
    __canvasDepth(ctx: CanvasRenderingContext2D): number;
  }
}

interface OpenOptions {
  prefs?: Partial<Probe["prefs"]>;
}

/**
 * Open the page with the test probe on. Seeds prefs once per test (not on
 * reload), counts canvas save/restore depth, and captures clipboard writes
 * so copy can be checked in every engine.
 */
export async function open(page: Page, opts: OpenOptions = {}): Promise<void> {
  await page.addInitScript((prefs) => {
    if (prefs && !sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem(
        "typef.prefs.v1",
        JSON.stringify({
          palette: 0,
          style: "print",
          seismo: true,
          caption: true,
          chrome: true,
          motion: 2,
          ...prefs
        })
      );
    }
    const depth = new WeakMap<CanvasRenderingContext2D, number>();
    const proto = CanvasRenderingContext2D.prototype;
    const save = proto.save;
    const restore = proto.restore;
    proto.save = function (this: CanvasRenderingContext2D) {
      depth.set(this, (depth.get(this) ?? 0) + 1);
      return save.call(this);
    };
    proto.restore = function (this: CanvasRenderingContext2D) {
      depth.set(this, Math.max(0, (depth.get(this) ?? 0) - 1));
      return restore.call(this);
    };
    window.__canvasDepth = (ctx) => depth.get(ctx) ?? 0;
    window.__clip = "";
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (t: string) => {
            window.__clip = t;
            return Promise.resolve();
          }
        }
      });
    } catch {
      /* the test that needs it will fail loudly */
    }
  }, opts.prefs ?? null);
  await page.goto("/?probe");
  await page.waitForFunction(() => !!window.__type);
  await page.locator("#stage").click({ position: { x: 5, y: 5 } }).catch(() => {});
}

export function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => window.__type.probe());
}

export async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => !!window.__type);
}

/** Ctrl on Linux/Windows, Meta in WebKit on a Mac; the page accepts both. */
export const MOD = "Control";

export async function expectText(page: Page, text: string): Promise<void> {
  await expect.poll(async () => (await probe(page)).text).toBe(text);
}
