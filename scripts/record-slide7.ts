/**
 * Record slide 7's terminal animation as PNG frames using Puppeteer.
 *
 * Loads docs/presentation-slides.html, advances to slide 7 (which auto-starts
 * the terminal animation), and captures one PNG per frame at the configured
 * frame rate for the configured duration.
 *
 * Frames land in /tmp/persona-frames/. Use scripts/frames-to-gif.sh to stitch.
 */

import puppeteer from "puppeteer";
import { resolve } from "path";

const HTML_PATH = "file://" + resolve("docs/presentation-slides.html");
const FRAMES_DIR = "/tmp/persona-frames";
const FPS = 10;
const DURATION_S = 25;
const TOTAL_FRAMES = FPS * DURATION_S;
const FRAME_INTERVAL_MS = 1000 / FPS;
const VIEWPORT = { width: 1280, height: 800 };

async function main() {
  console.log(`Recording ${DURATION_S}s @ ${FPS}fps = ${TOTAL_FRAMES} frames`);

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(HTML_PATH, { waitUntil: "domcontentloaded" });

  // Advance to slide 7 (6 ArrowRight presses) — this triggers
  // startTerminalAnimation() via the existing nav handler.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("ArrowRight");
    await new Promise(r => setTimeout(r, 50));
  }

  // Wait one tick for the slide transition to finish + animation to begin.
  await new Promise(r => setTimeout(r, 300));

  console.log("Capturing frames...");
  const startTime = Date.now();
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const frameStart = Date.now();
    const path = `${FRAMES_DIR}/frame-${String(i).padStart(4, "0")}.png`;
    await page.screenshot({ path: path as `${string}.png`, type: "png" });
    const elapsed = Date.now() - frameStart;
    const wait = Math.max(0, FRAME_INTERVAL_MS - elapsed);
    if (i % 25 === 0) {
      console.log(`  frame ${i}/${TOTAL_FRAMES}  (capture ${elapsed}ms)`);
    }
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  }
  console.log(`Done. Total recording wall-time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
