// Usage: node tools/shot.mjs <url-path> <out.png> [waitMs] [script.js]
// script.js (optional) is evaluated in the page once it is ready.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [path = '', out = 'shots/shot.png', wait = '2500', script] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5173/${path}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 30000 }).catch(() => logs.push('not ready'));
if (script) await page.evaluate(readFileSync(script, 'utf8'));
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('[vite]')).slice(0, 20).join('\n'));
await browser.close();
