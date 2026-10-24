/**
 * Boot: wait (briefly) for the variable font so the first measure is the
 * real face, then start.
 */
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource-variable/jetbrains-mono/wght-italic.css";
import { App } from "./app";

async function boot(): Promise<void> {
  const canvas = document.getElementById("stage");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const fonts = Promise.all([
    document.fonts.load('450 16px "JetBrains Mono Variable"'),
    document.fonts.load('italic 450 16px "JetBrains Mono Variable"')
  ]);
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);
  const app = new App(canvas);
  if (new URLSearchParams(location.search).has("probe")) (window as unknown as { __next: App }).__next = app;
}

void boot();
