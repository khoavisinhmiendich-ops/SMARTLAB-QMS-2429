// Đọc định dạng ô (phông, màu nền, viền, căn lề, xuống dòng) và ảnh chèn của tệp .xlsx trực tiếp từ XML trong tệp.
// Lý do: SheetJS bản miễn phí không trả về style ô nên bảng xem trước mất toàn bộ định dạng của tệp gốc.
// Chỉ dùng ở trình duyệt. Tệp không phải .xlsx dạng ZIP (vd. .xls cũ đổi đuôi) → trả về null, trình xem giữ cách hiển thị cũ.
import JSZip from 'jszip';

type Rgb = string; // '#rrggbb'
export type XFont = { name?: string; sz?: number; b?: boolean; i?: boolean; u?: boolean; strike?: boolean; color?: Rgb };
export type XBorderSide = { style: string; color: Rgb };
export type XXf = {
  font?: XFont; fill?: Rgb;
  border?: { left?: XBorderSide; right?: XBorderSide; top?: XBorderSide; bottom?: XBorderSide };
  h?: string; v?: string; wrap?: boolean; indent?: number;
};
export type XImage = { dataUrl: string; col: number; colOff: number; row: number; rowOff: number; toCol?: number; toColOff?: number; toRow?: number; toRowOff?: number; cx?: number; cy?: number };
export type XSheet = { cells: Map<string, number>; cols: Map<number, number>; rows: Map<number, number>; images: XImage[] };
export type XlsxInfo = { xfs: XXf[]; sheet: (name: string) => Promise<XSheet> };

const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const parse = (t: string) => new DOMParser().parseFromString(t, 'application/xml');
const kids = (el: Element | null | undefined, name: string) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] as Element | undefined;
const num = (v: string | null | undefined, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

const INDEXED = ['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','800000','008000','000080','808000','800080','008080','C0C0C0','808080','9999FF','993366','FFFFCC','CCFFFF','660066','FF8080','0066CC','CCCCFF','000080','FF00FF','FFFF00','00FFFF','800080','800000','008080','0000FF','00CCFF','CCFFFF','CCFFCC','FFFF99','99CCFF','FF99CC','CC99FF','FFCC99','3366FF','33CCCC','99CC00','FFCC00','FF9900','FF6600','666699','969696','003366','339966','003300','333300','993300','993366','333399','333333'];
const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
const DEFAULT_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];

function applyTint(hex: string, tint: number): string {
  if (!tint) return '#' + hex;
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const f = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  let rr = l, gg = l, bb = l;
  if (s) { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; rr = f(p, q, h + 1 / 3); gg = f(p, q, h); bb = f(p, q, h - 1 / 3); }
  const x = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return '#' + x(rr) + x(gg) + x(bb);
}

function colorOf(el: Element | null | undefined, theme: string[]): Rgb | undefined {
  if (!el) return undefined;
  if (el.getAttribute('auto') === '1') return undefined;
  const tint = num(el.getAttribute('tint'));
  const rgb = el.getAttribute('rgb');
  if (rgb) return applyTint(rgb.slice(-6), tint);
  const th = el.getAttribute('theme');
  if (th !== null && theme[num(th)]) return applyTint(theme[num(th)], tint);
  const ix = el.getAttribute('indexed');
  if (ix !== null && INDEXED[num(ix)]) return applyTint(INDEXED[num(ix)], tint);
  return undefined;
}

function parseTheme(xml: string | null): string[] {
  const out = DEFAULT_THEME.slice();
  if (!xml) return out;
  const clr = parse(xml).getElementsByTagNameNS('*', 'clrScheme')[0];
  if (!clr) return out;
  THEME_ORDER.forEach((n, i) => {
    const e = kid(clr, n); const c = e && (e.firstElementChild as Element | null);
    if (c) { const v = c.getAttribute('val') || c.getAttribute('lastClr'); if (v && /^[0-9a-f]{6}$/i.test(v)) out[i] = v; }
  });
  return out;
}

function parseStyles(xml: string, theme: string[]): XXf[] {
  const doc = parse(xml); const root = doc.documentElement;
  const fonts: XFont[] = kids(kid(root, 'fonts'), 'font').map((f) => {
    const on = (n: string) => { const e = kid(f, n); return !!e && e.getAttribute('val') !== '0' && e.getAttribute('val') !== 'false'; };
    const u = kid(f, 'u');
    return { name: kid(f, 'name')?.getAttribute('val') || undefined, sz: num(kid(f, 'sz')?.getAttribute('val')) || undefined, b: on('b'), i: on('i'), strike: on('strike'), u: !!u && u.getAttribute('val') !== 'none', color: colorOf(kid(f, 'color'), theme) };
  });
  const fills: (Rgb | undefined)[] = kids(kid(root, 'fills'), 'fill').map((f) => {
    const p = kid(f, 'patternFill'); if (!p || p.getAttribute('patternType') !== 'solid') return undefined;
    return colorOf(kid(p, 'fgColor'), theme) || colorOf(kid(p, 'bgColor'), theme);
  });
  const borders = kids(kid(root, 'borders'), 'border').map((b) => {
    const side = (n: string): XBorderSide | undefined => { const e = kid(b, n); const st = e?.getAttribute('style'); if (!e || !st) return undefined; return { style: st, color: colorOf(kid(e, 'color'), theme) || '#000000' }; };
    return { left: side('left'), right: side('right'), top: side('top'), bottom: side('bottom') };
  });
  return kids(kid(root, 'cellXfs'), 'xf').map((x) => {
    const al = kid(x, 'alignment');
    const xf: XXf = {
      font: fonts[num(x.getAttribute('fontId'))], fill: fills[num(x.getAttribute('fillId'))], border: borders[num(x.getAttribute('borderId'))],
      h: al?.getAttribute('horizontal') || undefined, v: al?.getAttribute('vertical') || undefined,
      wrap: al?.getAttribute('wrapText') === '1' || al?.getAttribute('wrapText') === 'true', indent: num(al?.getAttribute('indent')) || undefined,
    };
    return xf;
  });
}

const dir = (p: string) => p.slice(0, p.lastIndexOf('/') + 1);
function resolve(base: string, target: string) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dir(base) + target).split('/'); const out: string[] = [];
  for (const s of parts) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }
  return out.join('/');
}
async function rels(zip: JSZip, partPath: string): Promise<Map<string, { target: string; type: string }>> {
  const m = new Map<string, { target: string; type: string }>();
  const f = zip.file(dir(partPath) + '_rels/' + partPath.slice(partPath.lastIndexOf('/') + 1) + '.rels'); if (!f) return m;
  Array.from(parse(await f.async('string')).getElementsByTagName('Relationship')).forEach((r) => m.set(r.getAttribute('Id') || '', { target: resolve(partPath, r.getAttribute('Target') || ''), type: r.getAttribute('Type') || '' }));
  return m;
}
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };

export async function loadXlsxInfo(buf: ArrayBuffer): Promise<XlsxInfo | null> {
  try {
    if (new Uint8Array(buf, 0, 2)[0] !== 0x50) return null; // không phải ZIP (vd. .xls cũ)
    const zip = await JSZip.loadAsync(buf);
    const wbf = zip.file('xl/workbook.xml'), stf = zip.file('xl/styles.xml'); if (!wbf || !stf) return null;
    const themeF = zip.file('xl/theme/theme1.xml');
    const theme = parseTheme(themeF ? await themeF.async('string') : null);
    const xfs = parseStyles(await stf.async('string'), theme);
    const wbRels = await rels(zip, 'xl/workbook.xml');
    const paths = new Map<string, string>();
    Array.from(parse(await wbf.async('string')).getElementsByTagName('sheet')).forEach((s) => {
      const rid = s.getAttributeNS(NS_REL, 'id') || s.getAttribute('r:id') || ''; const r = wbRels.get(rid);
      if (r) paths.set(s.getAttribute('name') || '', r.target);
    });
    const cache = new Map<string, XSheet>();
    const sheet = async (name: string): Promise<XSheet> => {
      const hit = cache.get(name); if (hit) return hit;
      const out: XSheet = { cells: new Map(), cols: new Map(), rows: new Map(), images: [] };
      cache.set(name, out);
      const path = paths.get(name); const f = path && zip.file(path); if (!f) return out;
      const doc = parse(await f.async('string'));
      Array.from(doc.getElementsByTagName('col')).forEach((c) => { const st = c.getAttribute('style'); if (st === null) return; for (let i = num(c.getAttribute('min')); i <= Math.min(num(c.getAttribute('max')), num(c.getAttribute('min')) + 200); i++) out.cols.set(i - 1, num(st)); });
      Array.from(doc.getElementsByTagName('row')).forEach((r) => {
        const rn = num(r.getAttribute('r')); if (r.getAttribute('customFormat') === '1' && r.getAttribute('s') !== null) out.rows.set(rn - 1, num(r.getAttribute('s')));
        Array.from(r.children).forEach((c) => { if (c.localName === 'c') { const s = c.getAttribute('s'); if (s !== null && c.getAttribute('r')) out.cells.set(c.getAttribute('r')!, num(s)); } });
      });
      const dr = doc.getElementsByTagName('drawing')[0];
      if (dr) {
        const rid = dr.getAttributeNS(NS_REL, 'id') || dr.getAttribute('r:id') || '';
        const dpath = (await rels(zip, path)).get(rid)?.target; const df = dpath && zip.file(dpath);
        if (df && dpath) {
          const drels = await rels(zip, dpath); const ddoc = parse(await df.async('string'));
          for (const a of Array.from(ddoc.documentElement.children)) {
            if (!['twoCellAnchor', 'oneCellAnchor', 'absoluteAnchor'].includes(a.localName)) continue;
            const blip = a.getElementsByTagNameNS('*', 'blip')[0]; if (!blip) continue;
            const emb = blip.getAttributeNS(NS_REL, 'embed') || blip.getAttribute('r:embed') || '';
            const mp = drels.get(emb)?.target; const mf = mp && zip.file(mp); if (!mf || !mp) continue;
            const ext = (mp.split('.').pop() || '').toLowerCase(); if (!MIME[ext]) continue;
            const b64 = await mf.async('base64');
            const pos = (el: Element | undefined) => ({ col: num(kid(el, 'col')?.textContent), colOff: num(kid(el, 'colOff')?.textContent), row: num(kid(el, 'row')?.textContent), rowOff: num(kid(el, 'rowOff')?.textContent) });
            const from = kid(a, 'from'), to = kid(a, 'to'), ex = kid(a, 'ext');
            const img: XImage = { dataUrl: `data:${MIME[ext]};base64,${b64}`, col: 0, colOff: 0, row: 0, rowOff: 0 };
            if (from) { const p = pos(from); Object.assign(img, p); }
            if (to) { const p = pos(to); img.toCol = p.col; img.toColOff = p.colOff; img.toRow = p.row; img.toRowOff = p.rowOff; }
            if (ex) { img.cx = num(ex.getAttribute('cx')); img.cy = num(ex.getAttribute('cy')); }
            out.images.push(img);
          }
        }
      }
      return out;
    };
    return { xfs, sheet };
  } catch { return null; }
}

const BORDER_W: Record<string, string> = { hair: '1px', thin: '1px', dotted: '1px', dashed: '1px', dashDot: '1px', dashDotDot: '1px', slantDashDot: '1px', medium: '2px', mediumDashed: '2px', mediumDashDot: '2px', mediumDashDotDot: '2px', thick: '3px', double: '3px' };
const BORDER_S: Record<string, string> = { dotted: 'dotted', hair: 'dotted', dashed: 'dashed', mediumDashed: 'dashed', dashDot: 'dashed', dashDotDot: 'dashed', mediumDashDot: 'dashed', mediumDashDotDot: 'dashed', slantDashDot: 'dashed', double: 'double' };

// Gắn style của xf vào ô. Thuộc tính đã có sẵn trên ô (do người dùng sửa) được giữ nguyên.
export function applyXf(td: HTMLElement, xf: XXf | undefined) {
  if (!xf) return;
  const set = (k: string, v: string) => { if (!td.style.getPropertyValue(k)) td.style.setProperty(k, v); };
  const f = xf.font;
  if (f) {
    if (f.name) set('font-family', `"${f.name}", "Times New Roman", serif`);
    if (f.sz) set('font-size', f.sz + 'pt');
    if (f.b) set('font-weight', '700');
    if (f.i) set('font-style', 'italic');
    const deco = [f.u ? 'underline' : '', f.strike ? 'line-through' : ''].filter(Boolean).join(' ');
    if (deco) set('text-decoration', deco);
    if (f.color) set('color', f.color);
  }
  if (xf.fill) set('background-color', xf.fill);
  const bd = xf.border;
  if (bd) (['left', 'right', 'top', 'bottom'] as const).forEach((s) => { const b = bd[s]; if (b) set('border-' + s, `${BORDER_W[b.style] || '1px'} ${BORDER_S[b.style] || 'solid'} ${b.color}`); });
  const H: Record<string, string> = { left: 'left', center: 'center', right: 'right', justify: 'justify', centerContinuous: 'center', distributed: 'justify', fill: 'left' };
  if (xf.h && H[xf.h]) set('text-align', H[xf.h]);
  set('vertical-align', xf.v === 'center' ? 'middle' : xf.v === 'top' ? 'top' : 'bottom');
  set('white-space', xf.wrap ? 'pre-wrap' : 'pre');
  if (xf.indent) set('padding-left', 4 + xf.indent * 9 + 'px');
}

const colNum = (letters: string) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const colName = (n: number) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

// Áp style của tệp gốc lên bảng trang tính đã dựng bằng SheetJS (mỗi ô có id "<prefix>-A1") và vẽ ảnh chèn theo đúng vị trí neo.
// startRow/startCol: ô đầu của vùng dữ liệu (0-based). Không làm thay đổi nội dung chữ; ảnh nằm trong lớp riêng [data-qms-overlay] không được lưu.
export async function decorateXlsxSheet(info: XlsxInfo, name: string, body: HTMLElement, prefix: string, startRow: number, startCol: number) {
  const sh = await info.sheet(name);
  const table = body.querySelector('table') as HTMLTableElement | null; if (!table) return;
  const idPrefix = prefix + '-';
  table.querySelectorAll('td[id],th[id]').forEach((n) => {
    const td = n as HTMLTableCellElement; if (!td.id.startsWith(idPrefix)) return;
    const m = /^([A-Z]+)(\d+)$/.exec(td.id.slice(idPrefix.length)); if (!m) return;
    const c = colNum(m[1]), r = Number(m[2]) - 1;
    const idx = sh.cells.get(m[1] + m[2]) ?? sh.rows.get(r) ?? sh.cols.get(c);
    const xf = idx !== undefined ? info.xfs[idx] : undefined;
    applyXf(td, xf);
    const cs = td.colSpan || 1, rs = td.rowSpan || 1;
    if (cs > 1 || rs > 1) { // ô gộp: viền phải/dưới lấy từ ô cuối của vùng gộp
      const last = sh.cells.get(colName(c + cs - 1) + (r + rs)); const lx = last !== undefined ? info.xfs[last] : undefined;
      if (lx?.border) {
        const set = (k: string, b?: XBorderSide) => { if (b) td.style.setProperty(k, `${BORDER_W[b.style] || '1px'} ${BORDER_S[b.style] || 'solid'} ${b.color}`); };
        set('border-right', lx.border.right); set('border-bottom', lx.border.bottom);
      }
    }
  });
  // Excel chỉ cho chữ không xuống dòng tràn sang ô bên cạnh khi ô đó TRỐNG; nếu không thì chữ bị cắt tại biên ô.
  table.querySelectorAll('td').forEach((n) => {
    const td = n as HTMLTableCellElement; if (td.style.whiteSpace !== 'pre' || !td.textContent) return;
    const empty = (c: Element | null) => !c || !(c.textContent || '').trim();
    const left = td.style.textAlign === '' || td.style.textAlign === 'left';
    const spillOk = left ? empty(td.nextElementSibling) : empty(td.nextElementSibling) && empty(td.previousElementSibling);
    if (!spillOk) { td.style.overflow = 'hidden'; td.style.textOverflow = 'clip'; }
  });
  body.querySelectorAll('[data-qms-overlay]').forEach((x) => x.remove());
  if (!sh.images.length) return;
  body.style.position = 'relative'; // phải đặt TRƯỚC khi đo để toạ độ tính theo đúng khung chứa
  const cols = Array.from(table.querySelectorAll(':scope > colgroup > col')) as HTMLElement[];
  const colX = (c: number, off: number) => { let x = 0; for (let i = 0; i < c - startCol && i < cols.length; i++) x += parseFloat(cols[i].style.width) || 0; return x + off / 9525; };
  const rowY = (r: number, off: number) => { const tr = table.rows[r - startRow]; return (tr ? tr.offsetTop : table.offsetHeight) + off / 9525; };
  const over = document.createElement('div');
  over.setAttribute('data-qms-overlay', '1'); over.contentEditable = 'false';
  over.style.cssText = `position:absolute;left:${table.offsetLeft}px;top:${table.offsetTop}px;width:0;height:0;pointer-events:none;`;
  sh.images.forEach((im) => {
    const x = colX(im.col, im.colOff), y = rowY(im.row, im.rowOff);
    let w = (im.cx || 0) / 9525, h = (im.cy || 0) / 9525;
    if (im.toCol !== undefined && im.toRow !== undefined) { w = colX(im.toCol, im.toColOff || 0) - x; h = rowY(im.toRow, im.toRowOff || 0) - y; }
    if (!(w > 0 && h > 0)) return;
    const img = document.createElement('img'); img.src = im.dataUrl; img.alt = '';
    img.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;max-width:none;pointer-events:none;`;
    over.appendChild(img);
  });
  if (over.childElementCount) { body.style.position = 'relative'; body.appendChild(over); }
}
