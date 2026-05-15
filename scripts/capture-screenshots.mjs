// scripts/capture-screenshots.mjs
// Run: node scripts/capture-screenshots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SITES = [
  { name: "site-1", url: "https://wordpress-1595966-6262657.cloudwaysapps.com/" },
  { name: "site-2", url: "https://wordpress-1595966-6260284.cloudwaysapps.com/" },
  { name: "site-3", url: "https://wordpress-1595966-6257070.cloudwaysapps.com/" },
  { name: "true-beef", url: "https://true-beef.com/" },
  { name: "site-5", url: "https://wordpress-1595966-6256024.cloudwaysapps.com/" },
  { name: "novalux", url: "https://novalux2.websitereveals.com/" },
  { name: "clubhouse-cards", url: "https://clubhousecards.net/" },
];

const outDir = path.join(__dirname, "../public/portfolio");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const site of SITES) {
  console.log(`Capturing: ${site.url}`);
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  try {
    await page.goto(site.url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(outDir, `${site.name}.png`),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    console.log(`  ✓ Saved ${site.name}.png`);
  } catch (e) {
    console.error(`  ✗ Failed ${site.name}:`, e.message);
  }

  await page.close();
}

await browser.close();
console.log("Done!");
