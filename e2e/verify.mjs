import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:4173/';
const OUT = path.resolve('./e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const PASS = [], FAIL = [];
function check(name, cond, extra = '') {
  if (cond) { PASS.push(name); console.log('  ✅', name); }
  else { FAIL.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌', name, extra); }
}

const STORE_KEY = 'scent-memory-storage';
function mem(over = {}) {
  return {
    id: 'm' + Math.random().toString(36).slice(2, 8),
    location: '某地',
    source_guess: '来源',
    intensity: 5,
    humidity: 5,
    season: 'autumn',
    smell_type: 'woody',
    memory_text: '正文',
    color_association: '#8B5A2B',
    emotion: 'nostalgic',
    want_again: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

async function seed(page, memories) {
  await page.addInitScript(([key, data]) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem(key, JSON.stringify({ state: { memories: data }, version: 0 }));
  }, [STORE_KEY, memories]);
}

const browser = await chromium.launch();
const errors = [];

/** 每个用例独立浏览器上下文，彻底隔离 localStorage/cookie */
async function newPage() {
  const c = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await c.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // 关闭页面时一并关闭其上下文
  const origClose = page.close.bind(page);
  page.close = async () => { await origClose(); await c.close(); };
  return page;
}

async function openShop(page) {
  await page.getByRole('button', { name: /上印刷台/ }).click();
  await page.waitForSelector('.rps-paper, .rps-overlay .flex.flex-col.items-center.justify-center', { timeout: 8000 });
  await page.waitForTimeout(400); // 等防抖排版
}

async function paperData(page) {
  return page.$$eval('.rps-paper', (papers) => papers.map((p) => {
    const c = p.querySelector('.rps-content');
    return {
      page: Number(p.dataset.page),
      heads: [...p.querySelectorAll('.rps-block-head')].map((h) => h.dataset.memoryId),
      toc: [...p.querySelectorAll('.rps-toc-item[data-memory-id]')].map((t) => ({
        id: t.dataset.memoryId,
        pg: t.querySelector('.rps-toc-pg').textContent.trim(),
        loc: t.querySelector('.rps-toc-loc').textContent.trim(),
      })),
      cont: [...p.querySelectorAll('.rps-cont-hd')].map((e) => e.textContent.trim()),
      next: p.querySelectorAll('.rps-next-mark').length,
      titleMore: p.querySelectorAll('.rps-title-more').length,
      truncatedTitles: [...p.querySelectorAll('.rps-block-title')].map((h) => ({
        id: h.closest('.rps-block-head').dataset.memoryId,
        text: h.textContent.trim(),
        clipped: h.scrollWidth > h.clientWidth + 1,
      })),
      footer: p.querySelector('.rps-foot')?.textContent.replace(/\s+/g, '').trim(),
      running: p.querySelector('.rps-running')?.textContent.replace(/\s+/g, ' ').trim(),
      overflow: { sw: c.scrollWidth, cw: c.clientWidth, sh: c.scrollHeight, ch: c.clientHeight },
    };
  }));
}

async function paperHtml(page) {
  return page.$eval('.rps-preview-inner', (el) => el.innerHTML);
}

// =====================================================================
console.log('\n[0] 页面加载无控制台错误');
{
  const page = await newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForSelector('article');
  await page.waitForTimeout(800);
  check('8 条 mock 记忆渲染为卡片', (await page.$$('article')).length === 8);
  check('无 JS 报错', errors.length === 0, errors.join(' | '));
  await page.close();
}

// =====================================================================
console.log('\n[1] 空档案（在 UI 中删光所有记忆）');
{
  const page = await newPage();
  await seed(page, [mem({ id: 'only-empty', location: '马上删除', created_at: '2026-03-01T08:00:00.000Z' })]);
  await page.goto(BASE);
  await page.waitForSelector('article');

  // 在 UI 中删除唯一记忆（应用设计：空档案由“删光”到达）
  page.once('dialog', (d) => d.accept());
  await page.locator('article').getByRole('button').filter({ has: page.locator('svg.lucide-trash-2') }).first().click();
  await page.waitForTimeout(400);
  const homeTxt = await page.locator('main').innerText();
  check('删光后首页出现空档案文案', /还没有封存任何气味/.test(homeTxt), homeTxt.slice(0, 60));

  await page.getByRole('button', { name: /上印刷台/ }).click();
  await page.waitForTimeout(500);
  const txt = await page.locator('.rps-preview-scroll').innerText();
  check('空档案给出明确空态', /档案是空的|还没有/.test(txt), txt.slice(0, 80));
  const printDisabled = await page.locator('.rps-toolbar-layer').getByRole('button', { name: /直接打印/ }).isDisabled();
  check('空档案禁用打印按钮', printDisabled);
  await page.close();
}

// =====================================================================
console.log('\n[2] 单条记忆');
{
  const page = await newPage();
  await seed(page, [mem({ id: 'only-1', location: '一间小屋', created_at: '2026-03-01T08:00:00.000Z' })]);
  await page.goto(BASE);
  await openShop(page);
  const data = await paperData(page);
  check('单条报告 = 封面+目录+正文 = 3 页', data.length === 3, `实际 ${data.length}`);
  const toc = data.flatMap((d) => d.toc);
  check('目录列出 1 条地点与起始页', toc.length === 1 && toc[0].loc === '一间小屋' && toc[0].pg === 'P.3', JSON.stringify(toc));
  const starts = {};
  data.forEach((d) => d.heads.forEach((id) => { if (!(id in starts)) starts[id] = d.page; }));
  check('目录页码与正文实际页一致', toc.every((t) => t.pg === `P.${starts[t.id]}`), JSON.stringify({ toc, starts }));
  check('页脚为 “— N / 3 —” 递增', data.every((d, i) => d.footer === `—${i + 1}/3—`), data.map((d) => d.footer).join(' | '));
  check('页眉写报告标题', data.every((d) => d.running.includes('气味记忆报告')), data[0].running);
  check('版心不溢出', data.every((d) => d.overflow.sh <= d.overflow.ch && d.overflow.sw <= d.overflow.cw), JSON.stringify(data.map((d) => d.overflow)));
  await page.close();
}

// =====================================================================
console.log('\n[3] 超长正文：续页标记、块不拆、不溢出');
{
  const page = await newPage();
  const longText = [
    '第一段开头。' + '樟木与旧毛衣的气味混在一起'.repeat(120),
    '',
    '第二段：' + 'The quick brown fox jumps over the lazy dog. '.repeat(60) +
      ' supercalifragilisticexpialidocious-'.repeat(60),
    '',
    '尾段：' + '雨'.repeat(1400),
  ].join('\n');
  await seed(page, [mem({ id: 'long-1', location: '超长地点', memory_text: longText, created_at: '2026-02-02T00:00:00.000Z' })]);
  await page.goto(BASE);
  await openShop(page);
  const data = await paperData(page);
  check('超长正文跨多页', data.length > 4, `总页数 ${data.length}`);
  const headCount = data.reduce((n, d) => n + d.heads.length, 0);
  check('记忆区块只有一个块头（块头不跨页）', headCount === 1, `块头数 ${headCount}`);
  // 正文页：第 3 页起
  const bodyPages = data.filter((d) => d.page >= 3);
  const nextSet = new Set(bodyPages.filter((d) => d.next > 0).map((d) => d.page));
  const contSet = new Set(bodyPages.filter((d) => d.cont.length).map((d) => d.page));
  check('每个“续下页”后一页都有“承上页”', [...nextSet].every((p) => contSet.has(p + 1)), `next=${[...nextSet]} cont=${[...contSet]}`);
  check('至少出现 2 次续页', nextSet.size >= 2, `next 页数 ${nextSet.size}`);
  check('所有页版心不溢出', data.every((d) => d.overflow.sh <= d.overflow.ch && d.overflow.sw <= d.overflow.cw),
    data.map((d, i) => `p${i + 1}:${d.overflow.sh}/${d.overflow.ch},${d.overflow.sw}/${d.overflow.cw}`).join(' '));
  // 页脚总页数一致
  check('页脚总页数正确', data.every((d) => d.footer?.endsWith(`/${data.length}—`)), data.map((d) => d.footer).join(' | '));
  await page.screenshot({ path: path.join(OUT, 'long-body.png'), fullPage: true });
  await page.close();
}

// =====================================================================
console.log('\n[4] 长标题收起提示');
{
  const page = await newPage();
  const longTitle = '这是一个非常非常非常非常非常非常非常非常非常非常非常长的地点标题用来验证印刷台的长标题收起逻辑是否正常工作一二三四五六七八九十一二三四五六七八九十';
  await seed(page, [
    mem({ id: 't1', location: '短标题', created_at: '2026-01-01T00:00:00.000Z' }),
    mem({ id: 't2', location: longTitle, created_at: '2026-01-02T00:00:00.000Z', memory_text: '内容' }),
  ]);
  await page.goto(BASE);
  await openShop(page);
  const data = await paperData(page);
  check('出现“标题过长已收起”标记', data.some((d) => d.titleMore > 0));
  const clipped = data.flatMap((d) => d.truncatedTitles).filter((t) => t.id === 't2');
  check('长标题单行省略号且不溢出', clipped.length === 1 && /…$/.test(clipped[0].text) && !clipped[0].clipped, JSON.stringify(clipped));
  const shortT = data.flatMap((d) => d.truncatedTitles).filter((t) => t.id === 't1');
  check('短标题不被误截断', shortT.length === 1 && shortT[0].text === '短标题' && !shortT[0].clipped, JSON.stringify(shortT));
  check('所有页版心不溢出', data.every((d) => d.overflow.sh <= d.overflow.ch && d.overflow.sw <= d.overflow.cw));
  await page.close();
}

// =====================================================================
console.log('\n[5] 排序、目录页码一致性、空选择、确定性');
{
  const page = await newPage();
  const mk = (id, day, textLen = 40, loc) => mem({
    id, location: loc || `地点${id}`,
    created_at: `2026-05-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    memory_text: '回忆'.repeat(textLen),
  });
  const memories = [mk('c', 20, 300), mk('a', 2, 120), mk('b', 10, 400), mk('e', 28, 60), mk('d', 25, 260)];
  await seed(page, memories);
  await page.goto(BASE);
  await openShop(page);
  let data = await paperData(page);

  // 排序：按 created_at 升序 → a,b,c,d,e；第一处出现块头的页序列
  const order = [];
  data.forEach((d) => d.heads.forEach((id) => { if (!order.includes(id)) order.push(id); }));
  check('正文按 created_at 升序', order.join(',') === 'a,b,c,d,e', order.join(','));

  // 目录页码 = 实际起始页
  const starts = {};
  data.forEach((d) => d.heads.forEach((id) => { if (!(id in starts)) starts[id] = d.page; }));
  const toc = data.flatMap((d) => d.toc);
  check('每条目录页码与正文实际所在页一致', toc.every((t) => t.pg === `P.${starts[t.id]}`),
    toc.map((t) => `${t.id}:${t.pg}/${starts[t.id]}`).join(' '));
  check('目录顺序也是时间升序', toc.map((t) => t.id).join(',') === 'a,b,c,d,e', toc.map((t) => t.id).join(','));
  check('目录列出地点', toc.every((t) => /^地点/.test(t.loc)));
  check('所有页版心不溢出', data.every((d) => d.overflow.sh <= d.overflow.ch && d.overflow.sw <= d.overflow.cw));

  const html1 = await paperHtml(page);
  // 关闭再打开，结果一致
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await openShop(page);
  const html2 = await paperHtml(page);
  check('同一份档案重复排版结果一致（DOM 完全相同）', html1 === html2);
  data = await paperData(page);
  const toc2 = data.flatMap((d) => d.toc);
  check('重复排版页码一致', JSON.stringify(toc) === JSON.stringify(toc2));

  // 取消全选 → 空选择明确结果
  await page.getByRole('button', { name: /取消全选|全选/ }).first().click();
  await page.waitForTimeout(400);
  const t = await page.locator('.rps-preview-scroll').innerText();
  check('未选记忆时给出明确提示', /没有选中|勾选/.test(t), t.slice(0, 80));
  await page.close();
}

// =====================================================================
console.log('\n[6] 导出一份文件：独立 HTML 可打开且分页正确');
{
  const page = await newPage();
  const memories = [
    mem({ id: 'x1', location: '导出测试一', created_at: '2026-04-01T00:00:00.000Z', memory_text: '甲'.repeat(300) }),
    mem({ id: 'x2', location: '导出测试二', created_at: '2026-04-02T00:00:00.000Z', memory_text: '乙'.repeat(2600) }),
  ];
  await seed(page, memories);
  await page.goto(BASE);
  await openShop(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /导出文件/ }).click(),
  ]);
  const filePath = path.join(OUT, 'report.html');
  await download.saveAs(filePath);
  const html = fs.readFileSync(filePath, 'utf8');
  check('导出为单一 HTML 文件', html.startsWith('<!doctype html>') && !/<script/.test(html));
  check('导出文件内含全部纸张', (html.match(/class="rps-paper"/g) || []).length >= 4);

  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page2 = await ctx2.newPage();
  await page2.goto('file://' + filePath);
  await page2.waitForSelector('.rps-paper');
  const d2 = await paperData(page2);
  check('导出文件仍含页眉/页脚/目录', d2.length >= 4 && d2.every((d) => d.footer && d.running));
  const starts = {};
  d2.forEach((d) => d.heads.forEach((id) => { if (!(id in starts)) starts[id] = d.page; }));
  const toc = d2.flatMap((d) => d.toc);
  check('导出文件目录页码仍正确', toc.every((t) => t.pg === `P.${starts[t.id]}`));

  // 打印媒体下生成 PDF
  await page2.emulateMedia({ media: 'print' });
  await page2.evaluate(() => document.body.classList.add('printing-shop'));
  const pdfPath = path.join(OUT, 'standalone.pdf');
  await page2.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  const pdf = fs.readFileSync(pdfPath);
  const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('导出文件打印 PDF 页数 = 报告页数', pageCount === d2.length, `pdf=${pageCount} doc=${d2.length}`);
  await page2.close();
  await page.close();
}

// =====================================================================
console.log('\n[7] 应用内直接打印：A4 逐页');
{
  const page = await newPage();
  const memories = [
    mem({ id: 'p1', location: '打印甲', created_at: '2026-06-01T00:00:00.000Z', memory_text: '甲'.repeat(200) }),
    mem({ id: 'p2', location: '打印乙', created_at: '2026-06-02T00:00:00.000Z', memory_text: '乙'.repeat(2200) }),
    mem({ id: 'p3', location: '打印丙', created_at: '2026-06-03T00:00:00.000Z', memory_text: '丙'.repeat(160) }),
  ];
  await seed(page, memories);
  await page.goto(BASE);
  await openShop(page);
  const d = await paperData(page);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.body.classList.add('printing-shop'));
  await page.waitForTimeout(300);
  // 打印态下工具栏被隐藏、纸张恢复 A4
  const toolHidden = await page.$eval('.rps-toolbar-layer', (el) => getComputedStyle(el).display === 'none');
  const paperSize = await page.$eval('.rps-paper', (el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('打印态隐藏工具栏', toolHidden);
  check('打印态纸张为 A4 像素尺寸 (794×1123)', paperSize.w === 794 && paperSize.h === 1123, JSON.stringify(paperSize));
  const pdfPath = path.join(OUT, 'print.pdf');
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  const pdf = fs.readFileSync(pdfPath);
  const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('应用内打印 PDF 页数 = 报告页数', pageCount === d.length, `pdf=${pageCount} doc=${d.length}`);
  check('应用内打印 PDF 为 A4 尺寸', (() => {
    const s = pdf.toString('latin1');
    const mb = s.match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/);
    if (!mb) return false;
    const w = Number(mb[1]); const h = Number(mb[2]);
    return Math.abs(w - 595.3) < 2 && Math.abs(h - 841.9) < 2;
  })());
  await page.close();
}

// =====================================================================
console.log('\n[8] 原有浏览 / 筛选 / 卡片 / 编辑照常可用');
{
  const page = await newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE);
  await page.waitForSelector('article');

  // 筛选：只选 花香（筛选面板的第一个 select 为气味类型）
  await page.locator('main select').first().selectOption({ label: '🌺 花香' });
  await page.waitForTimeout(300);
  check('筛选后只剩花香卡片(mock-006)', (await page.$$('article')).length === 1, `实际 ${(await page.$$('article')).length}`);
  await page.getByRole('button', { name: /重置/ }).click();
  await page.waitForTimeout(200);
  check('重置后恢复全部卡片', (await page.$$('article')).length === 8);

  // 展开卡片
  const card = page.locator('article', { hasText: '外婆家的老衣柜' }).first();
  await card.getByRole('button', { name: /展开回忆/ }).click();
  await page.waitForTimeout(200);
  check('卡片展开显示完整回忆', (await card.innerText()).includes('小时候每次打开'));

  // 编辑
  await card.locator('button:has-text("编辑")').first().click();
  await page.waitForTimeout(200);
  await page.locator('input[placeholder*="外婆家"]').fill('外婆家的老衣柜（已改名）');
  await page.getByRole('button', { name: /保存修改/ }).click();
  await page.waitForTimeout(300);
  check('编辑后卡片标题更新', (await page.locator('article', { hasText: '已改名' }).count()) >= 1);

  // 新增
  await page.getByRole('button', { name: /封存一段气味/ }).first().click();
  await page.waitForTimeout(200);
  await page.locator('input[placeholder="例如：外婆家的老衣柜"]').fill('印刷台冒烟测试地点');
  await page.getByRole('button', { name: /封存这段记忆/ }).click();
  await page.waitForTimeout(400);
  check('新增记忆出现在档案中', (await page.locator('article', { hasText: '印刷台冒烟测试地点' }).count()) >= 1);
  check('全程无 JS 报错', errors.length === 0, errors.join(' | '));
  await page.close();
}

// =====================================================================
console.log(`\n================ 结果 ================`);
console.log(`通过 ${PASS.length} / ${PASS.length + FAIL.length}`);
if (FAIL.length) {
  console.log('\n失败项：');
  FAIL.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('全部通过 🎉');
await browser.close();
