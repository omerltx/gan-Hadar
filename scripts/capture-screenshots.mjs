import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const base = process.env.BASE_URL ?? "http://127.0.0.1:43123";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir =
  process.env.SCREENSHOT_DIR ??
  path.join(__dirname, "..", "docs", "screenshots");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

await page.goto(base, { waitUntil: "networkidle" });
await page.screenshot({
  path: path.join(outDir, "ui-home.png"),
  fullPage: true,
});

await page.fill("#fb-url", "https://www.facebook.com/share/r/19rcQJjK4r/");
await page.click('button[type="submit"]');
await page.waitForSelector('text=ההורדה מוכנה', { timeout: 120_000 });
await page.screenshot({
  path: path.join(outDir, "ui-success.png"),
  fullPage: true,
});

await page.goto(base, { waitUntil: "networkidle" });
await page.fill("#fb-url", "https://www.facebook.com/reel/000000000000000/");
await page.click('button[type="submit"]');
await page.waitForSelector("text=לא נתמך להורדה", { timeout: 60_000 });
await page.screenshot({
  path: path.join(outDir, "ui-unsupported.png"),
  fullPage: true,
});

await browser.close();
console.log("Screenshots saved to", outDir);