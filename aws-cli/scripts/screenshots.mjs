#!/usr/bin/env node
/**
 * Renders every terminal "screenshot" component to screenshots/<topic>/<card-id>.png
 * using Playwright + Chromium. The page's "PNG" toggle then shows these images
 * instead of the live HTML terminals.
 *
 *   npm install            # once (installs playwright; run `npx playwright install chromium` if needed)
 *   node scripts/screenshots.mjs [--topic ec2] [--theme dark|light] [--scale 2] [--out screenshots]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i !== -1 && args[i + 1] ? args[i + 1] : def; };
const ONLY_TOPIC = opt('topic', null);
const THEME = opt('theme', 'dark');
const SCALE = Number(opt('scale', '2'));
const OUT = path.resolve(ROOT, opt('out', 'screenshots'));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try { ({ chromium } = await import('playwright-core')); }
  catch {
    console.error('Playwright is not installed. Run `npm install` in this folder (or `npm i -D playwright`).');
    process.exit(2);
  }
}

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: SCALE, colorScheme: THEME });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });

await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href, { waitUntil: 'load' });
await page.evaluate((theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  const png = document.getElementById('png-toggle');
  if (png && png.checked) { png.checked = false; png.dispatchEvent(new Event('change')); }
  document.getElementById('expand-all').click();
  const style = document.createElement('style');
  style.textContent = '.term-body{max-height:none!important;overflow:visible!important} html{scroll-behavior:auto!important}';
  document.head.appendChild(style);
}, THEME);

const selector = ONLY_TOPIC ? `.topic-section[data-topic="${ONLY_TOPIC}"] .terminal[data-shot]` : '.terminal[data-shot]';
const terminals = await page.locator(selector).all();
if (!terminals.length) { console.error(`No terminals found for selector ${selector}`); await browser.close(); process.exit(1); }

let n = 0;
for (const term of terminals) {
  const shot = await term.getAttribute('data-shot');
  const [topic, card] = shot.split('/');
  const dir = path.join(OUT, topic);
  fs.mkdirSync(dir, { recursive: true });
  await term.scrollIntoViewIfNeeded();
  await term.screenshot({ path: path.join(dir, `${card}.png`), type: 'png' });
  n++;
  if (n % 25 === 0) console.log(`  ${n}/${terminals.length}`);
}
await browser.close();
console.log(`Wrote ${n} screenshots to ${path.relative(ROOT, OUT) || '.'}/`);
if (problems.length) { console.error('Page problems:\n  ' + problems.join('\n  ')); process.exit(1); }
