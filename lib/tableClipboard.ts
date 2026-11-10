// Sao chép / dán bảng theo TỪNG Ô (dùng chung cho Excel và Word).
// Mục tiêu: dán một vùng ô từ trang tính khác / tài liệu khác / Excel / Google Sheets vào đúng các ô lưới
// (không tạo bảng lồng nhau, không dồn chữ vào một ô) để mỗi ô vẫn sửa được và kéo giãn được.

export type ClipCell = { r: number; c: number; rs: number; cs: number; html: string; style: string; dataT: string };
export type ClipGrid = { rows: number; cols: number; cells: ClipCell[]; colW: number[]; rowH: number[]; internal: boolean };
type Grid = { map: (HTMLTableCellElement | undefined)[][]; start: Map<HTMLTableCellElement, { r: number; c: number }>; rows: HTMLTableRowElement[]; cols: number };

const HANDLES = '.cell-resize-handle,.row-resize-handle,[data-qms-drag],[data-qms-overlay]';
// Chỉ giữ các thuộc tính định dạng an toàn khi chép/dán giữa các bảng.
const KEEP_STYLE = /^(font-family|font-size|font-weight|font-style|text-decoration(-line)?|color|background(-color)?|text-align|vertical-align|white-space|line-height|border(-(top|right|bottom|left))?(-(width|style|color))?|padding(-(top|right|bottom|left))?)$/;

function gridOf(table: HTMLTableElement): Grid {
  const rows = Array.from(table.rows);
  const map: (HTMLTableCellElement | undefined)[][] = rows.map(() => []);
  const start = new Map<HTMLTableCellElement, { r: number; c: number }>();
  let cols = 0;
  rows.forEach((tr, r) => {
    let c = 0;
    Array.from(tr.cells).forEach((td) => {
      while (map[r][c]) c++;
      const rs = Math.max(1, td.rowSpan || 1), cs = Math.max(1, td.colSpan || 1);
      start.set(td, { r, c });
      for (let i = 0; i < rs && r + i < rows.length; i++) for (let j = 0; j < cs; j++) map[r + i][c + j] = td;
      c += cs; cols = Math.max(cols, c);
    });
  });
  return { map, start, rows, cols };
}

export function cellOf(node: Node | null, root: HTMLElement): HTMLTableCellElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n instanceof HTMLTableCellElement) return n;
    n = n.parentNode;
  }
  return null;
}

function cleanStyle(src: CSSStyleDeclaration | string | null): string {
  const out: string[] = [];
  const tmp = document.createElement('span');
  if (typeof src === 'string') tmp.style.cssText = src;
  const st = typeof src === 'string' ? tmp.style : src;
  if (!st) return '';
  for (let i = 0; i < st.length; i++) {
    const p = st[i];
    if (!KEEP_STYLE.test(p)) continue;
    const v = st.getPropertyValue(p);
    if (!v || /url\(|expression|javascript:/i.test(v)) continue;
    out.push(p + ':' + v);
  }
  return out.join(';');
}

// Gỡ thẻ Office (<o:p>) và thẻ tuỳ biến (<google-sheets-html-origin>): giữ nội dung bên trong, bỏ thẻ bao.
function unwrapForeign(root: Element) {
  Array.from(root.querySelectorAll('*')).filter((e) => e.tagName.includes(':') || e.tagName.includes('-')).forEach((e) => {
    const par = e.parentNode; if (!par) return;
    while (e.firstChild) par.insertBefore(e.firstChild, e);
    e.remove();
  });
}

// Làm sạch nội dung 1 ô: bỏ tay kéo, script, class/id/data-*, giữ chữ + định dạng cơ bản + ảnh.
function cellHtml(td: HTMLElement): string {
  const clone = td.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(HANDLES + ',script,style,link,meta,iframe,object,embed,form,input,button,textarea,select,table').forEach((x) => x.remove());
  const walk = (el: Element) => {
    Array.from(el.children).forEach((ch) => {
      walk(ch);
    });
    Array.from(el.attributes).forEach((a) => {
      const n = a.name.toLowerCase();
      if (n === 'style') { const s = cleanStyle((el as HTMLElement).style); if (s) el.setAttribute('style', s); else el.removeAttribute('style'); }
      else if (n === 'alt' || (n === 'src' && el.tagName === 'IMG' && !/^\s*javascript:/i.test(a.value))) return;
      else el.removeAttribute(a.name);
    });
  };
  unwrapForeign(clone);
  walk(clone);
  let html = clone.innerHTML.replace(/\u200b/g, '');
  if (!(clone.textContent || '').replace(/[\s\u00a0]/g, '') && !clone.querySelector('img')) html = '';
  return html;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cellText = (td: HTMLElement) => {
  const c = td.cloneNode(true) as HTMLElement;
  c.querySelectorAll(HANDLES).forEach((x) => x.remove());
  c.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  c.querySelectorAll('p,div').forEach((b, i) => { if (i > 0 || b.previousSibling) b.before('\n'); });
  return (c.textContent || '').replace(/[\u200b\u00a0]/g, (m) => (m === '\u00a0' ? ' ' : '')).replace(/^\n+|\n+$/g, '');
};
const tsvField = (t: string) => (/[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t);

// ---- Vùng đang chọn -> ô đầu/cuối ------------------------------------------------------
export function selectedCells(root: HTMLElement): HTMLTableCellElement[] {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== root) return [];
  const out: HTMLTableCellElement[] = [];
  root.querySelectorAll('td,th').forEach((n) => { if (range.intersectsNode(n)) out.push(n as HTMLTableCellElement); });
  return out;
}

type Rect = { table: HTMLTableElement; g: Grid; r0: number; c0: number; r1: number; c1: number };
function selectionRect(root: HTMLElement, strict: boolean): Rect | null {
  if (strict) {
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null;
    const rg = sel.getRangeAt(0);
    const sc = cellOf(rg.startContainer, root), ec = cellOf(rg.endContainer, root);
    if (!sc || !ec || sc.closest('table') !== ec.closest('table')) return null;
  }
  const cells = selectedCells(root);
  if (cells.length < 2) return null;
  const first = cells[0];
  const table = first.closest('table') as HTMLTableElement | null;
  if (!table) return null;
  const same = cells.filter((c) => c.closest('table') === table);
  if (same.length < 2) return null;
  const g = gridOf(table);
  let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
  same.forEach((td) => {
    const s = g.start.get(td); if (!s) return;
    r0 = Math.min(r0, s.r); c0 = Math.min(c0, s.c);
    r1 = Math.max(r1, s.r + Math.max(1, td.rowSpan || 1) - 1); c1 = Math.max(c1, s.c + Math.max(1, td.colSpan || 1) - 1);
  });
  if (r1 < 0) return null;
  // mở rộng để không cắt ngang ô gộp
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const td = g.map[r]?.[c]; if (!td) continue;
      const s = g.start.get(td)!; const e = { r: s.r + Math.max(1, td.rowSpan || 1) - 1, c: s.c + Math.max(1, td.colSpan || 1) - 1 };
      if (s.r < r0) { r0 = s.r; changed = true; } if (s.c < c0) { c0 = s.c; changed = true; }
      if (e.r > r1) { r1 = e.r; changed = true; } if (e.c > c1) { c1 = e.c; changed = true; }
    }
  }
  return { table, g, r0, c0, r1, c1 };
}

// Dữ liệu đưa vào clipboard khi sao chép nhiều ô (HTML sạch + TSV để dán sang Excel/Word/Google Sheets).
export function serializeSelection(root: HTMLElement, strict = false): { html: string; text: string } | null {
  const rect = selectionRect(root, strict); if (!rect) return null;
  const { table, g, r0, c0, r1, c1 } = rect;
  const k = table.offsetWidth ? table.getBoundingClientRect().width / table.offsetWidth || 1 : 1;
  const cols = Array.from(table.querySelectorAll(':scope > colgroup > col')) as HTMLElement[];
  let colgroup = '';
  for (let c = c0; c <= c1; c++) {
    let w = parseFloat(cols[c]?.style.width || '');
    if (!(w > 0)) { const td = g.map[r0]?.[c]; w = td && (td.colSpan || 1) === 1 ? td.getBoundingClientRect().width / k : 64; }
    colgroup += `<col style="width:${Math.round(w)}px">`;
  }
  let body = '';
  const lines: string[] = [];
  for (let r = r0; r <= r1; r++) {
    const tr = g.rows[r];
    const h = parseFloat(tr.style.height || '');
    body += `<tr${h > 0 ? ` style="height:${Math.round(h)}px"` : ''}>`;
    const fields: string[] = [];
    for (let c = c0; c <= c1; c++) {
      const td = g.map[r][c]; const s = td ? g.start.get(td)! : null;
      if (!td || !s || s.r !== r || s.c !== c) { fields.push(''); continue; } // vị trí nằm trong ô gộp
      const rs = Math.max(1, td.rowSpan || 1), cs = Math.max(1, td.colSpan || 1);
      const st = cleanStyle(td.style); const dt = td.getAttribute('data-t') || '';
      body += `<${td.tagName.toLowerCase()}${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}${dt ? ` data-t="${esc(dt)}"` : ''}${st ? ` style="${esc(st)}"` : ''}>${cellHtml(td)}</${td.tagName.toLowerCase()}>`;
      fields.push(tsvField(cellText(td)));
    }
    body += '</tr>';
    lines.push(fields.join('\t'));
  }
  const html = `<meta charset="utf-8"><table data-qms-clip="1" style="border-collapse:collapse"><colgroup>${colgroup}</colgroup><tbody>${body}</tbody></table>`;
  return { html, text: lines.join('\n') };
}

// ---- Đọc clipboard -> lưới ------------------------------------------------------------
function tsvToGrid(text: string): ClipGrid | null {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (!/[\t\n]/.test(t)) return null;
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"' && field === '') q = true;
    else if (ch === '\t') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  row.push(field); rows.push(row);
  const cols = Math.max(...rows.map((r) => r.length));
  const cells: ClipCell[] = [];
  rows.forEach((r, ri) => { for (let c = 0; c < cols; c++) cells.push({ r: ri, c, rs: 1, cs: 1, html: esc(r[c] || '').replace(/\n/g, '<br>'), style: '', dataT: '' }); });
  return { rows: rows.length, cols, cells, colW: [], rowH: [], internal: false };
}

export function parseClipboard(html: string, text: string): ClipGrid | null {
  if (html && /<table[\s>]/i.test(html)) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table') as HTMLTableElement | null;
    if (table && table.rows.length) {
      const g = gridOf(table);
      const internal = table.getAttribute('data-qms-clip') === '1';
      const cells: ClipCell[] = [];
      g.start.forEach((s, td) => {
        cells.push({ r: s.r, c: s.c, rs: Math.max(1, td.rowSpan || 1), cs: Math.max(1, td.colSpan || 1), html: cellHtml(td), style: cleanStyle(td.style), dataT: internal ? td.getAttribute('data-t') || '' : '' });
      });
      const colW = internal ? (Array.from(table.querySelectorAll(':scope > colgroup > col')) as HTMLElement[]).map((c) => parseFloat(c.style.width || '') || 0) : [];
      const rowH = internal ? g.rows.map((tr) => parseFloat(tr.style.height || '') || 0) : [];
      return { rows: g.rows.length, cols: g.cols, cells, colW, rowH, internal };
    }
  }
  return text ? tsvToGrid(text) : null;
}

// ---- Dán lưới vào bảng đích ----------------------------------------------------------
function blankCell(from?: HTMLTableCellElement): HTMLTableCellElement {
  const nc = document.createElement(from && from.tagName === 'TH' ? 'th' : 'td');
  nc.innerHTML = '&nbsp;';
  if (from) { nc.style.cssText = from.style.cssText; nc.style.height = ''; nc.style.width = ''; nc.style.minWidth = ''; }
  nc.removeAttribute('colspan'); nc.removeAttribute('rowspan');
  nc.contentEditable = 'true';
  return nc;
}
function growRows(table: HTMLTableElement, need: number) {
  while (table.rows.length < need) {
    const g = gridOf(table); const last = g.rows[g.rows.length - 1];
    const tr = document.createElement('tr'); if (last) tr.style.cssText = last.style.cssText;
    for (let c = 0; c < Math.max(1, g.cols); c++) tr.appendChild(blankCell(g.map[g.rows.length - 1]?.[c]));
    (last?.parentElement || table.tBodies[0] || table).appendChild(tr);
  }
}
function growCols(table: HTMLTableElement, need: number) {
  for (let guard = 0; gridOf(table).cols < need && guard < 400; guard++) {
    const cg = table.querySelector(':scope > colgroup');
    let w = 64;
    if (cg && cg.lastElementChild) w = parseFloat((cg.lastElementChild as HTMLElement).style.width) || 64;
    Array.from(table.rows).forEach((tr) => tr.appendChild(blankCell(tr.cells[tr.cells.length - 1])));
    if (cg) {
      const col = document.createElement('col'); col.style.width = w + 'px'; cg.appendChild(col);
      if (table.dataset.qmsSheet === '1' || table.dataset.qmsFrozen === '1') table.style.width = (parseFloat(table.style.width) || 0) + w + 'px';
    }
  }
}
function splitCell(table: HTMLTableElement, cell: HTMLTableCellElement) {
  const rs = Math.max(1, cell.rowSpan || 1), cs = Math.max(1, cell.colSpan || 1); if (rs < 2 && cs < 2) return;
  const g = gridOf(table); const st = g.start.get(cell); if (!st) return;
  cell.colSpan = 1; cell.rowSpan = 1;
  const extra = new Map<HTMLTableCellElement, number>();
  const colOf = (td: HTMLTableCellElement) => g.start.get(td)?.c ?? extra.get(td) ?? -1;
  for (let r = st.r; r < st.r + rs && r < g.rows.length; r++) {
    const tr = g.rows[r];
    for (let c = st.c; c < st.c + cs; c++) {
      if (r === st.r && c === st.c) continue;
      const nc = blankCell(cell);
      let ref: HTMLTableCellElement | null = null;
      for (const td of Array.from(tr.cells)) { if (colOf(td) < c && colOf(td) >= 0) ref = td; }
      if (ref) ref.after(nc); else tr.insertBefore(nc, tr.firstChild);
      extra.set(nc, c);
    }
  }
}

export function applyGrid(table: HTMLTableElement, anchor: HTMLTableCellElement, src: ClipGrid): HTMLTableCellElement | null {
  const a = gridOf(table).start.get(anchor); if (!a) return null;
  const r0 = a.r, c0 = a.c;
  growRows(table, r0 + src.rows);
  growCols(table, c0 + src.cols);
  // bỏ gộp các ô đích nằm trong vùng dán
  let g = gridOf(table);
  const merged = new Set<HTMLTableCellElement>();
  for (let r = r0; r < r0 + src.rows; r++) for (let c = c0; c < c0 + src.cols; c++) {
    const td = g.map[r]?.[c]; if (td && ((td.rowSpan || 1) > 1 || (td.colSpan || 1) > 1)) merged.add(td);
  }
  merged.forEach((td) => splitCell(table, td));
  g = gridOf(table);
  const cgCols = Array.from(table.querySelectorAll(':scope > colgroup > col')) as HTMLElement[];
  const isGrid = table.dataset.qmsSheet === '1' || table.dataset.qmsFrozen === '1';
  const origins: { td: HTMLTableCellElement; cell: ClipCell }[] = [];
  src.cells.forEach((cell) => {
    const td = g.map[r0 + cell.r]?.[c0 + cell.c]; if (!td) return;
    td.innerHTML = cell.html;
    td.removeAttribute('data-v'); td.removeAttribute('data-z');
    if (cell.dataT) td.setAttribute('data-t', cell.dataT); else td.removeAttribute('data-t');
    const keepPos = td.style.position;
    td.style.cssText = cell.style; if (keepPos) td.style.position = keepPos;
    td.contentEditable = 'true';
    origins.push({ td, cell });
  });
  // áp ô gộp của nguồn
  origins.forEach(({ td, cell }) => {
    if (cell.rs < 2 && cell.cs < 2) return;
    const covered = new Set<HTMLTableCellElement>();
    for (let r = 0; r < cell.rs; r++) for (let c = 0; c < cell.cs; c++) {
      const o = g.map[r0 + cell.r + r]?.[c0 + cell.c + c]; if (o && o !== td) covered.add(o);
    }
    covered.forEach((o) => o.remove());
    td.colSpan = cell.cs; td.rowSpan = cell.rs;
  });
  // độ rộng cột / chiều cao hàng của nguồn: chỉ áp lên cột/hàng đích còn ở mặc định (không đè bố cục đã chỉnh)
  if (src.internal && isGrid && cgCols.length) {
    let delta = 0;
    for (let c = 0; c < src.cols; c++) {
      const col = cgCols[c0 + c]; const w = src.colW[c];
      if (col && w > 0 && Math.round(parseFloat(col.style.width) || 64) === 64 && w !== 64) { delta += w - (parseFloat(col.style.width) || 64); col.style.width = w + 'px'; }
    }
    if (delta) table.style.width = Math.max(24, (parseFloat(table.style.width) || 0) + delta) + 'px';
  }
  if (src.internal) {
    for (let r = 0; r < src.rows; r++) {
      const tr = g.rows[r0 + r]; const h = src.rowH[r];
      if (tr && h > 0 && !tr.style.height) tr.style.height = h + 'px';
    }
  }
  return g.map[r0]?.[c0] || null;
}

// ---- Dán HTML có bảng vào văn bản Word (khi con trỏ không nằm trong ô) --------------------
export function sanitizeHtmlForInsert(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,link,meta,iframe,object,embed,form,input,button,textarea,select,title,head > *').forEach((x) => x.remove());
  doc.querySelectorAll(HANDLES).forEach((x) => x.remove());
  const drop = /^(position|left|top|right|bottom|z-index|resize|overflow(-x|-y)?|cursor|user-select|-webkit-user-modify|pointer-events|float)$/;
  const walk = (el: Element) => {
    Array.from(el.children).forEach((ch) => {
      walk(ch);
    });
    Array.from(el.attributes).forEach((at) => {
      const n = at.name.toLowerCase();
      if (n === 'style') {
        const h = el as HTMLElement;
        Array.from(h.style).forEach((p) => { if (drop.test(p)) h.style.removeProperty(p); });
        if (!h.getAttribute('style')) h.removeAttribute('style');
      } else if (!['colspan', 'rowspan', 'src', 'alt', 'href', 'width', 'height', 'align', 'valign', 'border', 'cellpadding', 'cellspacing'].includes(n)) el.removeAttribute(at.name);
    });
  };
  if (doc.body) { unwrapForeign(doc.body); walk(doc.body); }
  return doc.body ? doc.body.innerHTML : '';
}

// ---- Gắn xử lý sao chép / cắt / dán cho vùng soạn thảo ----------------------------------------
type Hooks = {
  sheet: boolean;                    // true: trang tính Excel; false: tài liệu Word
  isEditable: () => boolean;
  onChange: () => void;              // lưu nội dung
  refresh: (root: HTMLElement) => void; // dựng lại tay kéo / điểm đặt con trỏ sau khi đổi cấu trúc bảng
};

function anchorCell(root: HTMLElement): HTMLTableCellElement | null {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null;
  const cells = selectedCells(root);
  if (cells.length > 1) {
    const table = cells[0].closest('table') as HTMLTableElement | null;
    if (table) {
      const g = gridOf(table); let best: HTMLTableCellElement | null = null; let bs = { r: Infinity, c: Infinity };
      cells.forEach((td) => { const s = g.start.get(td); if (s && td.closest('table') === table && (s.r < bs.r || (s.r === bs.r && s.c < bs.c))) { best = td; bs = s; } });
      if (best) return best;
    }
  }
  return cellOf(sel.anchorNode, root) || cellOf(sel.focusNode, root);
}

function focusCell(td: HTMLTableCellElement) {
  td.focus({ preventScroll: true });
  const sel = window.getSelection(); if (!sel) return;
  const r = document.createRange(); r.selectNodeContents(td); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
}

export function attachTableClipboard(root: HTMLElement, h: Hooks): () => void {
  const onCopy = (ev: ClipboardEvent) => {
    const data = serializeSelection(root, !h.sheet); if (!data || !ev.clipboardData) return;
    ev.clipboardData.setData('text/html', data.html); ev.clipboardData.setData('text/plain', data.text);
    ev.preventDefault();
  };
  const onCut = (ev: ClipboardEvent) => {
    const rect = selectionRect(root, !h.sheet); const data = serializeSelection(root, !h.sheet);
    if (!rect || !data || !ev.clipboardData) return;
    ev.clipboardData.setData('text/html', data.html); ev.clipboardData.setData('text/plain', data.text);
    ev.preventDefault();
    if (!h.isEditable()) return;
    const seen = new Set<HTMLTableCellElement>();
    for (let r = rect.r0; r <= rect.r1; r++) for (let c = rect.c0; c <= rect.c1; c++) { const td = rect.g.map[r]?.[c]; if (td && !seen.has(td)) { seen.add(td); td.innerHTML = ''; td.removeAttribute('data-v'); } }
    h.refresh(root); h.onChange();
  };
  const onPaste = (ev: ClipboardEvent) => {
    if (!h.isEditable()) return;
    const cd = ev.clipboardData; if (!cd) return;
    const html = cd.getData('text/html') || ''; const text = cd.getData('text/plain') || '';
    const hasTable = /<table[\s>]/i.test(html);
    const grid = hasTable || h.sheet ? parseClipboard(html, text) : null;
    if (!grid) return; // dán chữ thường / ảnh: giữ cách dán mặc định
    const anchor = anchorCell(root);
    if (anchor && root.contains(anchor)) {
      const table = anchor.closest('table') as HTMLTableElement | null; if (!table) return;
      ev.preventDefault();
      const first = applyGrid(table, anchor, grid);
      h.refresh(root); h.onChange();
      if (first) focusCell(first);
      return;
    }
    if (!h.sheet && hasTable) { // Word: con trỏ ngoài bảng -> chèn bảng sạch, mỗi ô sửa/kéo giãn được
      ev.preventDefault();
      document.execCommand('insertHTML', false, sanitizeHtmlForInsert(html));
      h.refresh(root); h.onChange();
    }
  };
  root.addEventListener('copy', onCopy); root.addEventListener('cut', onCut); root.addEventListener('paste', onPaste);
  return () => { root.removeEventListener('copy', onCopy); root.removeEventListener('cut', onCut); root.removeEventListener('paste', onPaste); };
}
