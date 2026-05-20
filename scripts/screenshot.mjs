import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const OUT_DIR = path.resolve(process.cwd(), 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.URL || 'http://localhost:5173/?screenshots=true#/' ;

const targets = [
  { name: 'PDV', action: async (page) => { await page.goto(BASE); } },
  { name: 'Gerencia', action: async (page) => { await page.locator('button.sidebar-btn', { hasText: 'Gerencia' }).click(); } },
  { name: 'FluxoDeCaixa', action: async (page) => { await page.locator('button.sidebar-btn', { hasText: 'Fluxo de Caixa' }).click(); } },
  { name: 'Estoque', action: async (page) => { await page.locator('button.sidebar-btn', { hasText: 'Estoque' }).click(); } },
  { name: 'Atendentes', action: async (page) => { await page.locator('button.sidebar-btn', { hasText: 'Atendentes' }).click(); } },
  { name: 'Relatorio', action: async (page) => { await page.locator('button.sidebar-btn', { hasText: 'Relatorio' }).click(); } },
  { name: 'Suporte', action: async (page) => { await page.locator('button.sidebar-btn', { hasText: 'Suporte' }).click(); } },
  { name: 'Extrato', action: async (page) => { await page.goto('http://localhost:5173/?screenshots=true#/extrato'); } },
  { name: 'Retroativo', action: async (page) => { await page.goto('http://localhost:5173/?screenshots=true#/retroativo'); } },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  // Wait a bit for app to hydrate when landing
  for (const t of targets) {
    try {
      console.log('Capturing', t.name);
      // If target action navigates away from current page, ensure on base first for consistent state
      if (t.name === 'PDV') await page.goto(BASE);
      await t.action(page);
      // Enable UI changes for screenshots: remove disabled attrs (if any)
      await page.evaluate(() => {
        document.querySelectorAll('button[disabled]').forEach((b) => b.removeAttribute('disabled'));
      });
      // small wait for UI animations
      await page.waitForTimeout(600);
      const file = path.join(OUT_DIR, `${t.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log('Saved', file);
    } catch (err) {
      console.error('Failed', t.name, err.message || err);
    }
  }

  await browser.close();
  console.log('Done. Screenshots in', OUT_DIR);
})();
