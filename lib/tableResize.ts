// Kéo giãn độ rộng cột / chiều cao hàng bằng tay kéo (.cell-resize-handle / .row-resize-handle).
// Dùng ỦY QUYỀN SỰ KIỆN trên vùng soạn thảo: tay kéo nào có mặt trong DOM (kể cả ô vừa dán, ô khôi phục từ bản lưu)
// đều kéo được, không phụ thuộc trình nghe gắn riêng cho từng tay kéo.

type Opts = { isEditable: () => boolean; onChange: () => void };

function gridColOf(cell: HTMLTableCellElement): number {
  const table = cell.closest('table'); if (!table) return -1;
  const rows = Array.from(table.rows); const occ: boolean[][] = [];
  for (let r = 0; r < rows.length; r++) {
    occ[r] = occ[r] || []; let col = 0;
    for (const td of Array.from(rows[r].cells)) {
      while (occ[r][col]) col++;
      const rs = td.rowSpan || 1, cs = td.colSpan || 1;
      if (td === cell) return col;
      for (let i = 0; i < rs; i++) { occ[r + i] = occ[r + i] || []; for (let j = 0; j < cs; j++) occ[r + i][col + j] = true; }
      col += cs;
    }
  }
  return -1;
}

// Tỉ lệ hiển thị thật / kích thước CSS (khác 1 khi trang đang phóng to/thu nhỏ bằng zoom) để chuột kéo đúng bằng số px hiển thị.
function scaleOf(el: HTMLElement): number {
  const w = el.offsetWidth; if (!w) return 1;
  const k = el.getBoundingClientRect().width / w;
  return isFinite(k) && k > 0.05 ? k : 1;
}

// Bảng trang tính/bảng đã cố định lưới nhưng thiếu <colgroup> (vd. sau khi dán): dựng lại từ độ rộng đang hiển thị.
function ensureColgroup(table: HTMLTableElement) {
  if (table.querySelector(':scope > colgroup > col')) return;
  const rows = Array.from(table.rows); const occ: boolean[][] = []; const pos = new Map<HTMLTableCellElement, number>(); let n = 0;
  rows.forEach((row, r) => { occ[r] = occ[r] || []; let col = 0; Array.from(row.cells).forEach((td) => { while (occ[r][col]) col++; pos.set(td, col); const cs = td.colSpan || 1, rs = td.rowSpan || 1; for (let dr = 0; dr < rs; dr++) { occ[r + dr] = occ[r + dr] || []; for (let dc = 0; dc < cs; dc++) occ[r + dr][col + dc] = true; } col += cs; n = Math.max(n, col); }); });
  if (!n) return;
  const k = scaleOf(table);
  const w: (number | undefined)[] = new Array(n).fill(undefined);
  pos.forEach((gc, td) => { if ((td.colSpan || 1) === 1 && td.offsetWidth > 0 && w[gc] === undefined) w[gc] = td.getBoundingClientRect().width / k; });
  const widths = w.map((x) => Math.max(24, Math.round(x || 64)));
  table.querySelectorAll(':scope > colgroup').forEach((x) => x.remove());
  const cg = document.createElement('colgroup');
  widths.forEach((x) => { const c = document.createElement('col'); c.style.width = x + 'px'; cg.appendChild(c); });
  table.insertBefore(cg, table.firstChild);
  table.style.tableLayout = 'fixed'; table.style.width = widths.reduce((a, b) => a + b, 0) + 'px'; table.style.maxWidth = 'none';
}

function dragColumn(c: HTMLTableCellElement, startX: number, onChange: () => void) {
  const table = c.closest('table') as HTMLTableElement | null; if (!table) return;
  const k = scaleOf(table);
  const grid = table.dataset.qmsSheet === '1' || table.dataset.qmsFrozen === '1';
  if (grid) {
    ensureColgroup(table);
    const gi = gridColOf(c) + (c.colSpan || 1) - 1;
    const col = gi >= 0 ? (table.querySelectorAll(':scope > colgroup > col')[gi] as HTMLElement | undefined) : undefined;
    if (col) {
      const startW = parseFloat(col.style.width) || c.getBoundingClientRect().width / k;
      const startTW = parseFloat(table.style.width) || table.getBoundingClientRect().width / k;
      const move = (ev: PointerEvent) => { const w = Math.max(24, startW + (ev.clientX - startX) / k); col.style.width = `${w}px`; table.style.width = `${Math.max(24, startTW + (w - startW))}px`; };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointercancel', up); onChange(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true }); window.addEventListener('pointercancel', up, { once: true });
      return;
    }
  }
  // bảng Word chưa cố định lưới: đặt độ rộng cho các ô cùng cột
  const row = c.parentElement; const idx = row ? Array.from(row.children).indexOf(c) : -1;
  const cells = idx >= 0 ? (Array.from(table.querySelectorAll('tr')).map((tr) => tr.children[idx] as HTMLElement).filter(Boolean)) : [c];
  const start = c.getBoundingClientRect().width / k;
  const move = (ev: PointerEvent) => { const w = Math.max(28, start + (ev.clientX - startX) / k); cells.forEach((x) => { x.style.width = `${w}px`; x.style.minWidth = `${w}px`; }); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointercancel', up); onChange(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true }); window.addEventListener('pointercancel', up, { once: true });
}

function dragRow(c: HTMLTableCellElement, startY: number, onChange: () => void) {
  const rowEl = c.parentElement as HTMLElement | null; if (!rowEl) return;
  const k = scaleOf(c.closest('table') as HTMLElement || c);
  const start = rowEl.getBoundingClientRect().height / k;
  const move = (ev: PointerEvent) => { rowEl.style.height = `${Math.max(18, start + (ev.clientY - startY) / k)}px`; };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointercancel', up); onChange(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true }); window.addEventListener('pointercancel', up, { once: true });
}

// Gắn 1 trình nghe duy nhất cho vùng soạn thảo (gọi lại nhiều lần vẫn an toàn).
export function bindResizeDelegate(root: HTMLElement, opts: Opts) {
  const w = root as HTMLElement & { __qmsResize?: Opts };
  w.__qmsResize = opts;
  if (root.dataset.qmsResizeBound === '1') return;
  root.dataset.qmsResizeBound = '1';
  root.addEventListener('pointerdown', (e) => {
    const o = w.__qmsResize; if (!o || !o.isEditable()) return;
    const t = e.target as HTMLElement | null; if (!t || !t.closest) return;
    const handle = t.closest('.cell-resize-handle,.row-resize-handle') as HTMLElement | null; if (!handle) return;
    const cell = handle.parentElement as HTMLTableCellElement | null; if (!cell || !(cell instanceof HTMLTableCellElement)) return;
    e.preventDefault(); e.stopPropagation();
    if (handle.classList.contains('cell-resize-handle')) dragColumn(cell, e.clientX, o.onChange); else dragRow(cell, e.clientY, o.onChange);
  }, true);
  root.addEventListener('dragstart', (e) => { const t = e.target as HTMLElement | null; if (t && t.closest && t.closest('.cell-resize-handle,.row-resize-handle')) e.preventDefault(); }, true);
}

// Tạo tay kéo cho mọi ô (không gắn trình nghe riêng — đã có ủy quyền ở bindResizeDelegate).
export function addHandles(root: HTMLElement) {
  root.querySelectorAll('.cell-resize-handle,.row-resize-handle').forEach((x) => x.remove());
  root.querySelectorAll('td,th').forEach((cell) => {
    const c = cell as HTMLElement; c.style.position = 'relative';
    const h = document.createElement('span'); h.className = 'cell-resize-handle'; h.contentEditable = 'false'; h.title = 'Kéo để đổi độ rộng cột'; c.appendChild(h);
    const rh = document.createElement('span'); rh.className = 'row-resize-handle'; rh.contentEditable = 'false'; rh.title = 'Kéo để đổi chiều cao hàng'; c.appendChild(rh);
  });
}
