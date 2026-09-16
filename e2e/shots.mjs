import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const OUT = path.resolve('./e2e/out');
fs.mkdirSync(OUT, { recursive: true });

function mem(over = {}) {
  return {
    id: 'm' + Math.random().toString(36).slice(2, 8),
    location: '某地', source_guess: '来源', intensity: 5, humidity: 5,
    season: 'autumn', smell_type: 'woody', memory_text: '正文',
    color_association: '#8B5A2B', emotion: 'nostalgic', want_again: true,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.addInitScript(([key, data]) => {
  localStorage.clear();
  localStorage.setItem(key, JSON.stringify({ state: { memories: data }, version: 0 }));
}, ['scent-memory-storage', [
  mem({ id: 'a', location: '外婆家的老衣柜', created_at: '2026-05-02T00:00:00.000Z', memory_text: '小时候每次打开那个深棕色的大衣柜，都会被一股厚重的樟木味包裹。外婆把晒过太阳的毛衣叠得整整齐齐，味道里还混着淡淡的皂角香。现在衣柜还在，只是开门的人换了一批又一批。' }),
  mem({ id: 'b', location: '高中教室雨后的走廊', created_at: '2026-05-10T00:00:00.000Z', memory_text: '高二那年的梅雨季，雨水打在瓷砖上，空气里是水泥被浸润的腥甜味。\n\nThe rain smelled of wet concrete and distant grass, a quiet afternoon that seemed to last forever.\n\n同桌在写情书，我在闻雨。' }),
  mem({ id: 'c', location: '爷爷的中药铺', created_at: '2026-05-20T00:00:00.000Z', memory_text: '苦味'.repeat(900) }),
]]);
await page.goto('http://localhost:4173/');
await page.getByRole('button', { name: /上印刷台/ }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, 'shop-overview.png') });

// 逐页截封面/目录/前几页正文
const count = await page.$$eval('.rps-paper', (els) => els.length);
for (let i = 0; i < count; i++) {
  const slot = page.locator('.rps-paper-slot').nth(i);
  await slot.scrollIntoViewIfNeeded();
  await slot.screenshot({ path: path.join(OUT, `page-${i + 1}.png`) });
}
console.log('pages:', count);
await browser.close();
