import type { SmellMemory } from '../utils/constants';
import { getSeasonInfo, getSmellTypeInfo, getEmotionInfo } from '../utils/constants';
import reportCssText from './print.css?inline';
import './print.css';

/**
 * 印刷台排版引擎
 * ---------------------------------------------------------------
 * 设计要点（对应需求）：
 *  - 版面固定页宽页高：A4（210mm × 297mm），版心尺寸由浏览器实际测量，
 *    96dpi 与真实打印 / 导出共用同一组数值。
 *  - 报告按 created_at 升序（早 → 晚），同毫秒用 id 兜底，保证稳定。
 *  - 两遍排版：
 *      第一遍：只排正文，分页并记录每条记忆的起始页（相对正文）；
 *      第二遍：据正文页码生成目录，测量目录真实占页数后，回填每条记忆
 *      在整份报告中的绝对起始页并组装目录。目录页码与正文实际页严格一致。
 *  - 每条记忆是一个不可拆的原子块：块头只属于记忆；正文超长时按栏宽
 *    测量换页，页底带「续下页」、次页块顶带「承上页」标记。
 *  - 所有换行 / 分页均通过真实 DOM 的 offsetHeight 测量（同一套类名，
 *    预览、打印、导出一致）；正文 overflow-wrap:anywhere 保证中英文混排、
 *    长英文串也不溢出栏宽。
 *  - 纯数据流：不读取当前时间、不使用随机数；同一份档案 + 同一标题，
 *    排版结果逐节点一致。
 */

export interface PageGeom {
  pageW: number;
  pageH: number;
  contentX: number;
  contentY: number;
  contentW: number;
  contentH: number;
  headerTop: number;
  footerTop: number;
}

export interface TocEntry {
  index: number;
  memoryId: string;
  location: string;
  startPage: number;
}

export interface ComposedReport {
  pages: HTMLElement[];
  toc: TocEntry[];
  geom: PageGeom;
  bodyPageCount: number;
  tocPageCount: number;
  totalPages: number;
  startPageById: Record<string, number>;
  /** 排版指纹：同输入重复排版应一致 */
  fingerprint: string;
}

export interface ComposeOptions {
  title: string;
  memories: SmellMemory[];
}

// ---- 版心常量（px，基于 96dpi 的 A4 ≈ 794×1123） ----
const PADDING_X = 68;
const PADDING_TOP = 78;
const PADDING_BOTTOM = 70;
const BLOCK_GAP = 14;
const PAR_GAP = 8;
const HEAD_BODY_GAP = 10;
const TITLE_MAX_CHARS = 40;
const EMPTY_TEXT = '（这段记忆没有写下正文）';
/**
 * 每页底部预留的安全余量（px）：吸收“离屏测量取整”与“纸张内实际渲染”
 * 之间的亚像素舍入差，保证任何内容都不会越出版心。
 */
const OVERFLOW_GUARD = 2;

// =================================================================
// 稳定排序与文本工具
// =================================================================

export function sortMemoriesForReport(memories: SmellMemory[]): SmellMemory[] {
  return [...memories].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (ta !== tb) return ta - tb;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

export function truncateReportTitle(raw: string): string {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '气味记忆报告';
  return Array.from(t).slice(0, TITLE_MAX_CHARS).join('');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '日期未知';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function humidityLabel(h: number): string {
  return h <= 3 ? '偏干' : h <= 6 ? '适中' : '偏湿';
}

// =================================================================
// 测量舞台
// =================================================================

/**
 * 排版前等待版面真正使用的字体就绪。
 * 关键点：离屏测量与纸张渲染必须用“同一套”字体度量，否则首次进入（webfont
 * 尚未加载，用后备字体量）与字体就绪后（用 Noto 渲染）会得到不同的换行/行高，
 * 造成切分位置漂移、页底溢出。这里统一 gate 到字体就绪；超时则等一个
 * document.fonts.ready，离线时大家都回落到同一后备字体，结果仍然确定。
 */
let fontsReadyPromise: Promise<void> | null = null;
function ensureReportFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
  // 全局只等一次：字体加载完成（或离线超时回落后备字体）后，
  // 文档内所有后续度量都建立在同一套字体上，结果确定。
  if (fontsReadyPromise) return fontsReadyPromise;

  fontsReadyPromise = (async () => {
    const faces: { font: string; text?: string }[] = [
      { font: '400 13.5px "Noto Serif SC"', text: '气味记忆正文混排 Ag0123，。：…—·' },
      { font: '700 17px "Noto Serif SC"', text: '气味记忆标题地点 Ag0123，。…' },
      { font: '700 40px "Noto Serif SC"', text: '气味记忆报告' },
      { font: '400 10.5px "Noto Serif SC"', text: '承上页续下页目录 Ag0123' },
    ];
    try {
      const tasks = faces.map((f) => {
        const p = document.fonts.load(f.font, f.text);
        return Promise.race([
          p.catch(() => undefined),
          new Promise((r) => window.setTimeout(r, 2500)),
        ]);
      });
      await Promise.all(tasks);
      await Promise.race([
        document.fonts.ready.then(() => undefined),
        new Promise((r) => window.setTimeout(r, 2500)),
      ]);
    } catch {
      /* 字体不可用时统一使用后备字体，仍然确定 */
    }
  })();
  return fontsReadyPromise;
}

interface Stage {
  root: HTMLElement;
  measure: HTMLElement;
  geom: PageGeom;
  nextMarkH: number;
  contHeadH: number;
}

/** 创建一次性测量舞台；compose 结束后 dispose */
function createStage(): Stage {
  const root = document.createElement('div');
  root.className = 'rps-stage-root rps-noprint rps-measure-root';
  root.style.cssText = 'position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;';

  const probe = document.createElement('div');
  probe.className = 'rps-paper';
  probe.style.cssText = 'width:210mm;height:297mm;position:absolute;top:0;left:0;visibility:hidden;';
  root.appendChild(probe);
  document.body.appendChild(root);

  const rect = probe.getBoundingClientRect();
  const pageW = rect.width;
  const pageH = rect.height;
  // 版心宽高向下取整为整数像素：测量容器与正文盒子都用这组整数，
  // 避免亚像素差异导致测量行数与实际渲染不一致。
  const contentW = Math.floor(pageW - PADDING_X * 2);
  const contentH = Math.floor(pageH - PADDING_TOP - PADDING_BOTTOM);

  const measure = document.createElement('div');
  measure.className = 'rps-measure';
  measure.style.width = `${contentW}px`;
  root.appendChild(measure);
  root.removeChild(probe);

  const stage: Stage = {
    root,
    measure,
    geom: {
      pageW,
      pageH,
      contentX: PADDING_X,
      contentY: PADDING_TOP,
      contentW,
      contentH,
      headerTop: PADDING_TOP - 34,
      footerTop: pageH - PADDING_BOTTOM + 18,
    },
    nextMarkH: 0,
    contHeadH: 0,
  };

  // 固定行高的标记，高度与文字无关，量一次即可
  stage.nextMarkH = measureEl(stage, buildNextMark('续下页'));
  stage.contHeadH = measureEl(stage, buildContHead('承上页 · 测量'));
  return stage;
}

function disposeStage(stage: Stage) {
  stage.root.remove();
}

// =================================================================
// 基础节点与测量
// =================================================================

function measureEl(stage: Stage, el: HTMLElement): number {
  stage.measure.appendChild(el);
  const h = el.offsetHeight;
  stage.measure.removeChild(el);
  return h;
}

function buildContHead(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'rps-cont-hd';
  el.textContent = text;
  return el;
}

function buildNextMark(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'rps-next-mark';
  el.textContent = text;
  return el;
}

function buildBodyPara(text: string, empty: boolean): HTMLElement {
  const el = document.createElement('p');
  el.className = empty ? 'rps-body rps-body-empty' : 'rps-body';
  el.textContent = text;
  return el;
}

/** 高度确定的占位间隔（offsetHeight 即给定高度，记账无误差） */
function buildSpacer(h: number): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `height:${h}px;font-size:0;line-height:0;overflow:hidden;`;
  return el;
}

/**
 * 在栏宽内测量文本最多可放多少字符。
 * 溢出时追加「…」，中英文混排 / 长串由 CSS overflow-wrap:anywhere 兜底。
 * count === 0 表示当前高度连一个字都放不下，调用方应换页。
 */
function fitBodyChunk(
  stage: Stage,
  text: string,
  maxH: number,
  empty: boolean,
): { el: HTMLElement; height: number; count: number; done: boolean } {
  const chars = Array.from(text);
  if (empty) {
    const el = buildBodyPara(EMPTY_TEXT, true);
    const height = measureEl(stage, el);
    if (height <= maxH) return { el, height, count: 0, done: true };
    // 当前页放不下 → 换页重试
    return { el, height, count: 0, done: false };
  }
  const make = (n: number) =>
    buildBodyPara(chars.slice(0, n).join('') + (n < chars.length ? '…' : ''), false);

  const fullH = measureEl(stage, make(chars.length));
  if (fullH <= maxH) {
    return { el: make(chars.length), height: fullH, count: chars.length, done: true };
  }
  const oneH = measureEl(stage, make(1));
  if (oneH > maxH) {
    const el = buildBodyPara(chars[0] ?? '', false);
    return { el, height: oneH, count: 0, done: false };
  }
  let lo = 1;
  let hi = chars.length - 1;
  let best = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measureEl(stage, make(mid)) <= maxH) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const el = make(best);
  return { el, height: measureEl(stage, el), count: best, done: false };
}

// =================================================================
// 长标题：单行收起 + 提示
// =================================================================

function fitLocationTitle(
  stage: Stage,
  rawTitle: string,
): { shown: string; truncated: boolean } {
  const title = rawTitle || '未命名地点';
  const chars = Array.from(title);
  const innerW = Math.floor(stage.geom.contentW - 14); // 头部 3px 边条 + 11px 左距

  // 注意：不能给标题盒子设固定宽度再读 scrollWidth——文本比盒子短时
  // scrollWidth 返回的是盒子宽度而非文本宽度。这里用“宽度随内容”的
  // inline-block 探针量真实文本宽度。
  const probe = document.createElement('h4');
  probe.className = 'rps-block-title';
  probe.style.position = 'absolute';
  probe.style.width = 'auto';
  probe.style.minWidth = '0';
  probe.style.flex = 'none';
  stage.measure.appendChild(probe);
  const textW = (s: string) => {
    probe.textContent = s;
    return probe.offsetWidth;
  };

  if (textW(title) <= innerW) {
    stage.measure.removeChild(probe);
    return { shown: title, truncated: false };
  }

  // 量「标题过长已收起」标记的真实宽度
  const tag = document.createElement('span');
  tag.className = 'rps-title-more';
  tag.textContent = '标题过长已收起';
  probe.textContent = '';
  probe.appendChild(tag);
  const tagW = tag.offsetWidth;
  probe.removeChild(tag);

  const reducedW = innerW - tagW - 8;
  let lo = 1;
  let hi = chars.length - 1;
  let best = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (textW(chars.slice(0, mid).join('') + '…') <= reducedW) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const shown = chars.slice(0, best).join('') + '…';
  stage.measure.removeChild(probe);
  return { shown, truncated: true };
}

// =================================================================
// 记忆块头部
// =================================================================

function metaHtml(m: SmellMemory): string {
  const s = getSeasonInfo(m.season);
  const t = getSmellTypeInfo(m.smell_type);
  const e = getEmotionInfo(m.emotion);
  const parts = [
    fmtDate(m.created_at),
    `${s.emoji}${s.label}`,
    `${t.emoji}${t.label}`,
    `${e.emoji}${e.label}`,
    `强度 ${m.intensity}/10`,
    `湿度感 ${humidityLabel(m.humidity)}`,
    m.want_again ? '想再闻' : '留在记忆里',
  ];
  return `<span>${parts.join('</span><span class="rps-dot">·</span><span>')}</span>`;
}

function buildBlockHead(m: SmellMemory, shownTitle: string, titleTruncated: boolean): HTMLElement {
  const t = getSmellTypeInfo(m.smell_type);
  const head = document.createElement('div');
  head.className = 'rps-block-head';
  head.style.setProperty('--rps-c', m.color_association || t.color);
  const more = titleTruncated
    ? `<span class="rps-title-more" title="${escapeHtml(m.location)}">标题过长已收起</span>`
    : '';
  head.dataset.memoryId = m.id;
  head.innerHTML = `
    <div class="rps-block-title-row">
      <h4 class="rps-block-title" title="${escapeHtml(m.location)}">${escapeHtml(shownTitle)}</h4>
      ${more}
    </div>
    ${m.source_guess ? `<p class="rps-block-source">来源猜测：${escapeHtml(m.source_guess)}</p>` : ''}
    <div class="rps-block-meta">${metaHtml(m)}</div>
  `;
  return head;
}

// =================================================================
// 第一遍：正文分页
// =================================================================

interface BodyLayout {
  pages: HTMLElement[];
  /** 每条记忆相对正文的起始页（0-based） */
  bodyStartByIndex: number[];
}

function layBody(stage: Stage, memories: SmellMemory[]): BodyLayout {
  const { contentH } = stage.geom;
  const bodyPages: HTMLElement[] = [];
  const bodyStartByIndex: number[] = [];
  let el = document.createElement('div');
  let used = 0;
  let carried = false; // 块内正文是否已换过页（用于承上页标记）

  const flush = () => {
    bodyPages.push(el);
    el = document.createElement('div');
    used = 0;
    carried = false;
  };
  /** 直接挂载已测节点（其高度已单独量过） */
  const append = (node: HTMLElement, h: number) => {
    el.appendChild(node);
    used += h;
  };
  /** 挂一个确定高度的间隔并计入 */
  const appendGap = (h: number) => {
    if (h <= 0) return;
    el.appendChild(buildSpacer(h));
    used += h;
  };
  // 一行正文的高度，用于判断块头后能否放下至少一行
  const oneLineH = measureEl(stage, buildBodyPara('一行正文Ag', false));

  // 空档案：正文给一整页明确占位（封面 + 空目录之外的明确结果）
  if (memories.length === 0) {
    const notice = document.createElement('div');
    notice.style.cssText =
      'height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#8A7A63;';
    notice.innerHTML = `
      <div style="font-size:40px;margin-bottom:14px;opacity:.6;">🍂</div>
      <div style="font-size:16px;color:#5C3A1D;margin-bottom:6px;">本份报告没有收录任何记忆</div>
      <div style="font-size:12px;">回到气味档案封存第一段气味后，再上印刷台排版</div>`;
    el.appendChild(notice);
    bodyPages.push(el);
    return { pages: bodyPages, bodyStartByIndex };
  }

  // 一页正文的高度上限：版心高减去底部安全余量，吸收离屏测量与纸张内
  // 实际渲染之间的亚像素舍入差，保证任何内容都不越出版心。
  const limit = contentH - OVERFLOW_GUARD;

  for (let mi = 0; mi < memories.length; mi++) {
    const m = memories[mi];

    // —— 块头（标题单行收起） ——
    const titleFit = fitLocationTitle(stage, m.location);
    const head = buildBlockHead(m, titleFit.shown, titleFit.truncated);
    const headH = measureEl(stage, head);

    // 原子块：当前页放不下“块间隔 + 块头 + 头身间隔 + 一行正文”时整块移到次页
    const needHead = (used > 0 ? BLOCK_GAP : 0) + headH + HEAD_BODY_GAP + oneLineH;
    if (used > 0 && used + needHead > limit) flush();

    // 起始页必须在块头换页判定“之后”记录：块头可能因页底放不下被挪到
    // 次页，目录要指向块头实际所在页，否则跨页后每个正文页第一条会少一页。
    bodyStartByIndex[mi] = bodyPages.length;

    if (used > 0) appendGap(BLOCK_GAP);
    append(head, headH);
    appendGap(HEAD_BODY_GAP);

    // —— 正文段落 ——
    const isEmpty = (m.memory_text ?? '').trim().length === 0;
    const rawParas = isEmpty ? [''] : (m.memory_text ?? '').replace(/\r\n?/g, '\n').split('\n');

    for (let pi = 0; pi < rawParas.length; pi++) {
      // 空行用不换行空格占位，保留一个行高
      let remaining = rawParas[pi].length === 0 ? ' ' : rawParas[pi];
      for (;;) {
        const contH = carried ? stage.contHeadH : 0;
        const avail = limit - used - contH;

        // 先尝试整段放进剩余高度（不预留续页标记）
        let fit = fitBodyChunk(stage, remaining, avail, isEmpty);
        if (!fit.done && fit.count === 0) {
          flush();
          carried = true;
          continue;
        }
        let willContinue = !fit.done;
        if (willContinue) {
          // 确定要切开：预留「续下页」标记（内部已含上边距）后重测
          fit = fitBodyChunk(stage, remaining, avail - stage.nextMarkH, false);
          if (!fit.done && fit.count === 0) {
            flush();
            carried = true;
            continue;
          }
          willContinue = !fit.done;
        }

        // 段间距：同一块内非首段、且非切页进入时才加；放不下则先换页
        if (pi > 0 && !carried) {
          if (used + PAR_GAP + fit.height > limit) {
            flush();
            carried = true;
            continue;
          }
          appendGap(PAR_GAP);
        }

        if (carried) {
          append(buildContHead(`承上页 · ${m.location || '未命名地点'}`), stage.contHeadH);
        }
        append(fit.el, fit.height);

        if (willContinue) {
          append(buildNextMark('续下页'), stage.nextMarkH);
          flush();
          carried = true;
          remaining = Array.from(remaining).slice(fit.count).join('');
        } else {
          break;
        }
      }
    }
    carried = false;
  }
  bodyPages.push(el);
  return { pages: bodyPages, bodyStartByIndex };
}

// =================================================================
// 封面
// =================================================================

function buildCover(stage: Stage, title: string, memories: SmellMemory[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rps-cover';
  const times = memories.map((m) => Date.parse(m.created_at)).filter((n) => !Number.isNaN(n));
  const earliest = times.length ? fmtDate(new Date(Math.min(...times)).toISOString()) : '—';
  const latest = times.length ? fmtDate(new Date(Math.max(...times)).toISOString()) : '—';
  wrap.innerHTML = `
    <div class="rps-cover-kicker">SCENT ARCHIVE · 气味档案</div>
    <h1 class="rps-cover-title">${escapeHtml(title)}</h1>
    <div class="rps-cover-rule"></div>
    <div class="rps-cover-meta">
      <div>封存记忆 <b>${memories.length}</b> 段</div>
      <div>最早记录 ${earliest} ／ 最近记录 ${latest}</div>
      <div>按封存时间排列 · 印刷台制</div>
    </div>
    <div class="rps-cover-seal">气味档案</div>
  `;
  // 封面固定一页：测量仅作越界保护（内容按版心设计，标题 40 字内可容两行）
  const h = measureEl(stage, wrap);
  if (h > stage.geom.contentH) {
    wrap.querySelector('.rps-cover-seal')?.remove();
  }
  return wrap;
}

// =================================================================
// 目录（第二遍）
// =================================================================

function buildTocRow(index: number, memoryId: string, location: string, startPage: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'rps-toc-item';
  item.dataset.memoryId = memoryId;
  item.innerHTML = `
    <span class="rps-toc-no">${String(index).padStart(2, '0')}</span>
    <span class="rps-toc-loc" title="${escapeHtml(location)}">${escapeHtml(location) || '未命名地点'}</span>
    <span class="rps-toc-pg">P.${startPage}</span>
  `;
  return item;
}

function buildTocHead(): HTMLElement {
  const head = document.createElement('div');
  head.className = 'rps-toc-head';
  head.innerHTML = `
    <h2 class="rps-toc-title">目 录</h2>
    <div class="rps-toc-sub">CONTENTS · 地点与起始页</div>
  `;
  return head;
}

/**
 * 第二遍：目录条目原子装页（行不跨页拆），页底放「目录续下页」。
 * 起始页此时已确定。目录页数只取决于条目行高（页码位数不影响行高），
 * 因此先探一次得到 tocPageCount、回填页码后再正式组装一次。
 */
function layToc(stage: Stage, toc: TocEntry[]): { pages: HTMLElement[]; count: number } {
  const { contentH } = stage.geom;
  const limit = contentH - OVERFLOW_GUARD;
  const headH = measureEl(stage, buildTocHead());
  const contMarkH = measureEl(stage, (() => {
    const c = document.createElement('div');
    c.className = 'rps-toc-continued';
    c.textContent = '目录续下页';
    return c;
  })());

  const pages: HTMLElement[] = [];
  let page = document.createElement('div');
  page.appendChild(buildTocHead());
  let used = headH;
  let rowsInPage = 0;

  const flushPage = () => {
    const cont = document.createElement('div');
    cont.className = 'rps-toc-continued';
    cont.textContent = '目录续下页';
    page.appendChild(cont);
    pages.push(page);
    page = document.createElement('div');
    page.appendChild(buildTocHead());
    used = headH;
    rowsInPage = 0;
  };

  if (toc.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'rps-toc-item';
    empty.innerHTML = '<span class="rps-toc-no">—</span><span class="rps-toc-loc">本报告未收录任何记忆</span><span class="rps-toc-pg">—</span>';
    page.appendChild(empty);
  }

  for (const e of toc) {
    const row = buildTocRow(e.index, e.memoryId, e.location, e.startPage);
    const h = measureEl(stage, row);
    if (rowsInPage > 0 && used + h + contMarkH > limit) {
      flushPage();
    }
    page.appendChild(row);
    used += h;
    rowsInPage += 1;
  }
  pages.push(page);
  return { pages, count: pages.length };
}

// =================================================================
// 整页组装（页眉报告标题、页脚页码）
// =================================================================

function buildPaper(
  stage: Stage,
  bodyContent: HTMLElement,
  pageNo1Based: number,
  total: number,
  title: string,
): HTMLElement {
  const { geom } = stage;
  const paper = document.createElement('div');
  paper.className = 'rps-paper';
  paper.dataset.page = String(pageNo1Based);
  paper.style.width = `${geom.pageW}px`;
  paper.style.height = `${geom.pageH}px`;

  const running = document.createElement('div');
  running.className = 'rps-running';
  running.style.left = `${geom.contentX}px`;
  running.style.width = `${geom.contentW}px`;
  running.style.top = `${geom.headerTop}px`;
  running.style.height = '20px';
  running.innerHTML = `<span class="rps-running-mark">气味档案</span>${escapeHtml(title)}`;

  const foot = document.createElement('div');
  foot.className = 'rps-foot';
  foot.style.left = `${geom.contentX}px`;
  foot.style.width = `${geom.contentW}px`;
  foot.style.top = `${geom.footerTop}px`;
  foot.style.height = '16px';
  foot.innerHTML = `<span>—</span><span>${pageNo1Based}</span><span class="rps-foot-total">/ ${total}</span><span>—</span>`;

  const content = document.createElement('div');
  content.className = 'rps-content';
  content.style.left = `${geom.contentX}px`;
  content.style.top = `${geom.contentY}px`;
  content.style.width = `${geom.contentW}px`;
  content.style.height = `${geom.contentH}px`;
  content.appendChild(bodyContent);

  paper.appendChild(content);
  paper.appendChild(running);
  paper.appendChild(foot);
  return paper;
}

/** 简单稳定的字符串指纹（FNV-1a） */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// =================================================================
// 入口：composeReport
// =================================================================

export async function composeReport(opts: ComposeOptions): Promise<ComposedReport> {
  const title = truncateReportTitle(opts.title);
  const memories = sortMemoriesForReport(opts.memories);

  // 先等字体就绪再测量，保证离屏测量与纸张渲染同一套字体度量
  await ensureReportFonts();

  const stage = createStage();
  try {
    // —— 第一遍：正文 ——
    const body = layBody(stage, memories);
    const bodyPageCount = body.pages.length;

    // —— 第二遍：目录（回填绝对起始页） ——
    // 页码布局：封面(第1页) + 目录(tocPageCount 页，第2页起) + 正文…
    // 正文相对第 0 页的绝对页 = 2 + tocPageCount
    // 页码位数（P.9 → P.10）理论上可能改变长地点的折行行高，从而改变
    // 目录页数；用不动点迭代直到页数稳定（通常 1~2 次收敛）。
    let tocPageCount = 1;
    let tocEntries: TocEntry[] = [];
    let tocPages: HTMLElement[] = [];
    for (let iter = 0; iter < 16; iter++) {
      tocEntries = memories.map((m, i) => ({
        index: i + 1,
        memoryId: m.id,
        location: m.location || '未命名地点',
        startPage: 2 + tocPageCount + body.bodyStartByIndex[i],
      }));
      const laid = layToc(stage, tocEntries);
      if (laid.count === tocPageCount || iter === 15) {
        tocPages = laid.pages;
        tocPageCount = laid.count;
        break;
      }
      tocPageCount = laid.count;
    }

    // —— 封面 + 组装 ——
    const cover = buildCover(stage, title, memories);
    const total = 1 + tocPageCount + bodyPageCount;

    const pages: HTMLElement[] = [];
    let pageNo = 1;
    pages.push(buildPaper(stage, cover, pageNo++, total, title));
    tocPages.forEach((tp) => pages.push(buildPaper(stage, tp, pageNo++, total, title)));
    body.pages.forEach((bp) => pages.push(buildPaper(stage, bp, pageNo++, total, title)));

    const startPageById: Record<string, number> = {};
    memories.forEach((m, i) => { startPageById[m.id] = tocEntries[i].startPage; });

    const fingerprint = fnv1a(title + '|' + pages.map((p) => p.outerHTML).join(''));

    return {
      pages,
      toc: tocEntries,
      geom: stage.geom,
      bodyPageCount,
      tocPageCount,
      totalPages: total,
      startPageById,
      fingerprint,
    };
  } finally {
    disposeStage(stage);
  }
}

// =================================================================
// 导出一份独立可打印的 HTML 文件
// =================================================================

export function reportToStandaloneHtml(report: ComposedReport, title: string): string {
  const pagesHtml = report.pages
    .map((p) => {
      const clone = p.cloneNode(true) as HTMLElement;
      clone.style.boxShadow = 'none';
      clone.style.margin = '0 auto';
      return clone.outerHTML;
    })
    .join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(truncateReportTitle(title))} · 气味档案</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${reportCssText}
body { margin:0; background:#EDE3CC; font-family: "Noto Serif SC","Songti SC","SimSun","STSong",serif; }
.rps-paper { margin: 0 auto 10px; }
@media print {
  @page { size: A4; margin: 0; }
  body { background:#fff; }
  .rps-paper { margin:0; break-after: page; page-break-after: always; }
  .rps-paper:last-child { break-after:auto; page-break-after:auto; }
  .rps-measure, .rps-noprint, .rps-measure-root { display:none !important; }
}
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}
