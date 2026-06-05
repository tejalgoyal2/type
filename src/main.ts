/**
 * Boot. The only async work is waiting for the variable font, because the
 * engine measures the monospace advance once and the canvas must not
 * measure a fallback face. A 2.5 s race guards against a stalled font load;
 * the engine re-measures on resize, so a late font self-heals on the next
 * resize at worst.
 */
import "@fontsource-variable/jetbrains-mono";
import { Engine } from "./engine";

async function boot(): Promise<void> {
  const canvas = document.getElementById("stage");
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const fonts = Promise.all([
    document.fonts.load('430 16px "JetBrains Mono Variable"'),
    document.fonts.load('760 16px "JetBrains Mono Variable"')
  ]);
  const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
  await Promise.race([fonts, timeout]);

  new Engine(canvas);
}

void boot();
