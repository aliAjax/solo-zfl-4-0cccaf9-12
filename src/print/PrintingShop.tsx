import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Printer, FileDown, RotateCw, CheckSquare, Square, Loader2,
  FileText, ListOrdered, Newspaper,
} from 'lucide-react';
import type { SmellMemory } from '../utils/constants';
import { getSmellTypeInfo } from '../utils/constants';
import { formatDate } from '../utils/helpers';
import {
  composeReport, reportToStandaloneHtml,
  sortMemoriesForReport, truncateReportTitle,
  type ComposedReport,
} from './layout';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 当前可选记忆（即首页经过筛选后的记忆） */
  memories: SmellMemory[];
}

type Status =
  | { kind: 'empty-archive' }
  | { kind: 'empty-selection' }
  | { kind: 'composing' }
  | { kind: 'done'; report: ComposedReport; fingerprint: string };

const TITLE_MAX = 40;
const PREVIEW_GAP = 28;

function sanitizeFileName(s: string): string {
  return (s || '气味记忆报告')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || '气味记忆报告';
}

/**
 * 印刷台：选中记忆 → 两遍排版 → 固定版面预览 → 直接打印 / 导出一份文件。
 * 排版完全由 (标题, 选中记忆) 决定，不读时间、不随机，重复结果一致。
 */
export default function PrintingShop({ open, onClose, memories }: Props) {
  // 报告记忆的稳定顺序（与正文一致：created_at 升序）
  const ordered = useMemo(() => sortMemoriesForReport(memories), [memories]);

  const [title, setTitle] = useState('气味记忆报告');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>(
    memories.length === 0 ? { kind: 'empty-archive' } : { kind: 'empty-selection' },
  );
  const [scale, setScale] = useState(0.6);

  // 打开时默认全选当前记忆
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(ordered.map((m) => m.id)));
    setTitle('气味记忆报告');
  }, [open, ordered]);

  // 键盘 ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const selectedOrdered = useMemo(
    () => ordered.filter((m) => selected.has(m.id)),
    [ordered, selected],
  );

  // ---- 排版（两遍） ----
  const composeTimer = useRef<number | null>(null);
  const compose = useCallback(
    (memList: SmellMemory[], reportTitle: string) => {
      if (memList.length === 0) {
        setStatus({ kind: 'empty-selection' });
        return;
      }
      setStatus({ kind: 'composing' });
      // 下一帧再排，让 composing 态先渲染
      requestAnimationFrame(() => {
        const report = composeReport({ title: reportTitle, memories: memList });
        setStatus({ kind: 'done', report, fingerprint: report.fingerprint });
      });
    },
    [],
  );

  // 选中或标题变化后自动重新排版（防抖），保证预览始终对应当前输入
  useEffect(() => {
    if (!open) return;
    if (ordered.length === 0) {
      setStatus({ kind: 'empty-archive' });
      return;
    }
    if (selectedOrdered.length === 0) {
      setStatus({ kind: 'empty-selection' });
      return;
    }
    if (composeTimer.current) window.clearTimeout(composeTimer.current);
    composeTimer.current = window.setTimeout(() => {
      compose(selectedOrdered, truncateReportTitle(title));
    }, 120);
    return () => { if (composeTimer.current) window.clearTimeout(composeTimer.current); };
  }, [open, ordered.length, selectedOrdered, title, compose]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = ordered.length > 0 && selected.size === ordered.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(ordered.map((m) => m.id)));
  };

  // ---- 打印 ----
  const [printing, setPrinting] = useState(false);
  const handlePrint = () => {
    if (status.kind !== 'done') return;
    setPrinting(true);
    document.body.classList.add('printing-shop');
    // 等样式与滚动布局应用后再调起打印
    requestAnimationFrame(() => {
      const done = () => {
        document.body.classList.remove('printing-shop');
        setPrinting(false);
        window.removeEventListener('afterprint', done);
      };
      window.addEventListener('afterprint', done);
      // 兜底：部分环境 afterprint 不触发
      window.setTimeout(done, 120000);
      window.print();
    });
  };

  // ---- 导出一份独立 HTML 文件 ----
  const handleExport = () => {
    if (status.kind !== 'done') return;
    const html = reportToStandaloneHtml(status.report, title);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFileName(title)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ---- 预览自适应缩放 ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageW = status.kind === 'done' ? status.report.geom.pageW : 0;
  useEffect(() => {
    if (!open || status.kind !== 'done') return;
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const avail = el.clientWidth - 56;
      setScale(Math.min(1, Math.max(0.3, avail / pageW)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, status.kind, pageW]);

  if (!open) return null;

  return createPortal(
    <div
      className="rps-overlay fixed inset-0 z-[70] overflow-y-auto"
      style={{ background: 'rgba(42,33,24,0.55)', backdropFilter: 'blur(3px)' }}
    >
      <div className="rps-overlay-inner min-h-screen flex flex-col">
        {/* 顶栏（不打印） */}
        <div className="rps-toolbar-layer rps-noprint sticky top-0 z-20 bg-paper-50/95 backdrop-blur border-b border-paper-300 shadow-paper">
          <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 mr-2">
              <div className="w-9 h-9 rounded-xl bg-ochre-500 text-paper-50 flex items-center justify-center shadow-paper">
                <Newspaper className="w-5 h-5" />
              </div>
              <div>
                <div className="font-serif text-lg font-bold text-ink-800 leading-tight">印刷台</div>
                <div className="text-[11px] text-ink-700/60 leading-tight">两遍排版 · A4 固定版面 · 目录页码对齐正文</div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
              <ListOrdered className="w-4 h-4 text-ochre-600 shrink-0" />
              <input
                value={title}
                onChange={(e) => setTitle(truncateReportTitle(e.target.value))}
                maxLength={TITLE_MAX + 6}
                placeholder="报告标题（页眉显示）"
                className="scent-input !py-2 text-sm"
              />
              <span className="text-[11px] text-ink-700/50 shrink-0 tabular-nums">
                {Array.from(title.trim()).length}/{TITLE_MAX}
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handlePrint}
                disabled={status.kind !== 'done' || printing}
                className="btn-primary !py-2 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                直接打印
              </button>
              <button
                onClick={handleExport}
                disabled={status.kind !== 'done'}
                className="btn-secondary !py-2 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileDown className="w-4 h-4" />
                导出文件
              </button>
              <button
                onClick={onClose}
                className="btn-ghost !px-3 !py-2"
                title="关闭印刷台"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="rps-body-grid flex-1 max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* 左：记忆选择 */}
          <aside className="rps-noprint">
            <div className="bg-paper-50 rounded-2xl border border-paper-300 shadow-paper p-4 lg:sticky lg:top-24">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-hand text-xl text-ochre-600">选择记忆</h3>
                <button
                  onClick={toggleAll}
                  disabled={ordered.length === 0}
                  className="text-xs text-ochre-600 hover:text-ochre-700 inline-flex items-center gap-1 disabled:opacity-40"
                >
                  {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  {allSelected ? '取消全选' : '全选'}
                </button>
              </div>
              <div className="text-[11px] text-ink-700/50 mb-3">
                共 {ordered.length} 条 · 已选 <b className="text-ochre-600">{selected.size}</b> 条 · 按封存时间排序
              </div>

              <div className="space-y-1.5 max-h-[52vh] lg:max-h-[60vh] overflow-y-auto pr-1">
                {ordered.length === 0 && (
                  <div className="text-sm text-ink-700/60 py-8 text-center">
                    🍂 档案里还没有记忆
                  </div>
                )}
                {ordered.map((m, i) => {
                  const checked = selected.has(m.id);
                  const stype = getSmellTypeInfo(m.smell_type);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleOne(m.id)}
                      className={`w-full text-left rounded-xl border px-3 py-2 transition-all duration-150 flex items-start gap-2 ${
                        checked
                          ? 'bg-ochre-50 border-ochre-200 ring-1 ring-ochre-200'
                          : 'bg-paper-100/60 border-paper-200 hover:bg-paper-100'
                      }`}
                    >
                      <span className={`mt-0.5 shrink-0 ${checked ? 'text-ochre-600' : 'text-paper-400'}`}>
                        {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[10px] text-ink-700/50 tabular-nums">
                          <span className="text-ochre-500">#{String(i + 1).padStart(2, '0')}</span>
                          <span>{formatDate(m.created_at)}</span>
                        </span>
                        <span className="block text-sm font-medium text-ink-800 truncate">
                          <span className="mr-1" style={{ color: stype.color }}>{stype.emoji}</span>
                          {m.location || '未命名地点'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* 右：预览 */}
          <section>
            <div
              ref={scrollRef}
              className="rps-preview-scroll rounded-2xl border border-paper-300 shadow-inner overflow-auto"
              style={{ background: '#5C5346', minHeight: '70vh' }}
            >
              <div className="rps-preview-inner py-7 flex flex-col items-center">
                {status.kind === 'empty-archive' && (
                  <EmptyPreview
                    icon="🍂"
                    title="档案是空的"
                    desc="先回到气味档案，封存第一段气味，再上印刷台排成可打印版面。"
                  />
                )}
                {status.kind === 'empty-selection' && (
                  <EmptyPreview
                    icon="📝"
                    title="还没有选中任何记忆"
                    desc="在左侧勾选要收入报告的记忆（可全选）。每条记忆一个不跨页的区块，超长正文会自动续页。"
                  />
                )}
                {status.kind === 'composing' && (
                  <EmptyPreview
                    icon={<Loader2 className="w-8 h-8 animate-spin text-paper-200" />}
                    title="正在两遍排版…"
                    desc="第一遍排正文记录起始页，第二遍生成对齐页码的目录。"
                    spinner
                  />
                )}
                {status.kind === 'done' && (
                  <>
                    <div className="rps-noprint mb-4 flex items-center gap-3 text-paper-200 text-xs">
                      <span className="inline-flex items-center gap-1.5 bg-black/25 rounded-full px-3 py-1">
                        <FileText className="w-3.5 h-3.5" />
                        共 {status.report.totalPages} 页（封面 1 · 目录 {status.report.tocPageCount} · 正文 {status.report.bodyPageCount}）
                      </span>
                      <span className="inline-flex items-center gap-1.5 bg-black/25 rounded-full px-3 py-1">
                        <RotateCw className="w-3.5 h-3.5" />
                        同输入重复排版结果一致
                      </span>
                    </div>
                    {status.report.pages.map((page, i) => (
                      <div
                        key={i}
                        className="rps-paper-slot"
                        style={{
                          width: status.report.geom.pageW * scale,
                          height: status.report.geom.pageH * scale,
                          marginBottom: i < status.report.pages.length - 1 ? PREVIEW_GAP : 0,
                        }}
                      >
                        <div
                          className="rps-page-scale"
                          style={{
                            width: status.report.geom.pageW,
                            height: status.report.geom.pageH,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                          }}
                          ref={(node) => {
                            if (node && node.firstChild !== page) {
                              node.innerHTML = '';
                              node.appendChild(page);
                            }
                          }}
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EmptyPreview({
  icon, title, desc, spinner,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  spinner?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-24">
      <div className={spinner ? 'text-paper-200' : 'text-5xl'}>{icon}</div>
      <h3 className="font-serif text-xl text-paper-100 mt-4 mb-2">{title}</h3>
      <p className="text-sm text-paper-200/70 max-w-sm leading-relaxed">{desc}</p>
    </div>
  );
}
