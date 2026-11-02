// Hình vẽ Word kiểu DrawingML (khung chữ, hộp, đường nối, mũi tên, nhóm hình: sơ đồ tổ chức, lưu đồ...) KHÔNG được thư viện docx-preview dựng
// (chỉ dựng bản VML dự phòng rất sơ sài: mất chữ, màu và đường nối). Trước khi dựng, mỗi hình vẽ được vẽ lại bằng canvas thành ảnh PNG
// và thay vào đúng vị trí neo cũ (cùng wp:anchor/wp:inline) NGAY TRONG BỘ NHỚ — tệp gốc trên đĩa không bị thay đổi.
// Mọi lỗi → trả về tệp gốc (không bao giờ làm hỏng việc mở tài liệu). Chỉ dùng ở trình duyệt.
import JSZip from 'jszip';

const NS = {
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  pkgRel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
};
const EMU = 9525; // 1px (96dpi)
const SCALE = 2;  // độ nét ảnh
const parseXml = (t: string) => new DOMParser().parseFromString(t, 'application/xml');
const all = (el: Element | Document, name: string) => Array.from(el.getElementsByTagNameNS('*', name));
const kids = (el: Element | null | undefined, name?: string) => (el ? Array.from(el.children).filter((c) => !name || c.localName === name) : []);
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] as Element | undefined;
const at = (el: Element | null | undefined, n: string) => el?.getAttribute(n) ?? el?.getAttribute('w:' + n) ?? el?.getAttributeNS('*', n) ?? null;
const num = (v: string | null | undefined, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

type Theme = Record<string, string>;
type RGBA = { c: string; a: number };
const DEF_THEME: Theme = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
const SCHEME: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
const PRST: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080' };

function hslAdjust(hex: string, lumMod?: number, lumOff?: number): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  l = Math.max(0, Math.min(1, l * (lumMod ?? 1) + (lumOff ?? 0)));
  const f = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  let rr = l, gg = l, bb = l;
  if (s) { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; rr = f(p, q, h + 1 / 3); gg = f(p, q, h); bb = f(p, q, h - 1 / 3); }
  const x = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return x(rr) + x(gg) + x(bb);
}
// Đọc màu từ phần tử chứa srgbClr/schemeClr/sysClr/prstClr (kèm lumMod, lumOff, shade, tint, alpha).
function colorFrom(holder: Element | null | undefined, theme: Theme): RGBA | null {
  const c = holder && kids(holder).find((k) => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(k.localName));
  if (!c) return null;
  let hex = '000000';
  const v = c.getAttribute('val') || '';
  if (c.localName === 'srgbClr') hex = v;
  else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || (v === 'window' ? 'FFFFFF' : '000000');
  else if (c.localName === 'prstClr') hex = PRST[v] || '000000';
  else hex = theme[SCHEME[v] || v] || DEF_THEME[SCHEME[v] || v] || '000000';
  if (!/^[0-9a-f]{6}$/i.test(hex)) hex = '000000';
  let lm: number | undefined, lo: number | undefined, alpha = 1;
  for (const m of kids(c)) {
    const mv = num(m.getAttribute('val')) / 100000;
    if (m.localName === 'lumMod') lm = mv; else if (m.localName === 'lumOff') lo = mv; else if (m.localName === 'alpha') alpha = mv;
    else if (m.localName === 'shade') { lm = (lm ?? 1) * mv; }
    else if (m.localName === 'tint') { lm = (lm ?? 1) * mv; lo = (lo ?? 0) + (1 - mv); }
  }
  if (lm !== undefined || lo !== undefined) hex = hslAdjust(hex, lm, lo);
  return { c: '#' + hex, a: alpha };
}
const css = (c: RGBA) => { const n = parseInt(c.c.slice(1), 16); return c.a >= 1 ? c.c : `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${c.a})`; };

type Defaults = { sizePt: number; font: string };
type Fmt = { font: string; size: number; b: boolean; i: boolean; u: boolean; strike: boolean; color: string };
type Run = { text: string; fmt: Fmt; br?: boolean };
type Para = { runs: Run[]; align: string; lineMul: number; before: number; after: number; left: number };

function readParas(txbx: Element, def: Defaults, theme: Theme): Para[] {
  const out: Para[] = [];
  for (const p of kids(txbx, 'p')) {
    const ppr = kid(p, 'pPr'); const sp = kid(ppr, 'spacing'); const ind = kid(ppr, 'ind');
    const line = num(at(sp, 'line'), 240), rule = at(sp, 'lineRule');
    const para: Para = { runs: [], align: at(kid(ppr, 'jc'), 'val') || 'left', lineMul: rule === 'auto' || !rule ? line / 240 : 1, before: num(at(sp, 'before')) / 15, after: num(at(sp, 'after')) / 15, left: num(at(ind, 'left')) / 15 };
    if (rule === 'exact' || rule === 'atLeast') para.lineMul = 0;
    const pMark = kid(ppr, 'rPr');
    const fmtOf = (rpr: Element | undefined): Fmt => {
      const on = (n: string) => { const e = kid(rpr, n); return !!e && at(e, 'val') !== '0' && at(e, 'val') !== 'false'; };
      const rf = kid(rpr, 'rFonts'); const col = at(kid(rpr, 'color'), 'val');
      const sz = num(at(kid(rpr, 'sz'), 'val')) / 2 || def.sizePt;
      const ul = kid(rpr, 'u');
      return { font: at(rf, 'ascii') || at(rf, 'hAnsi') || def.font, size: sz * 96 / 72, b: on('b'), i: on('i'), u: !!ul && at(ul, 'val') !== 'none', strike: on('strike'), color: col && /^[0-9a-f]{6}$/i.test(col) ? '#' + col : '#000000' };
    };
    const walk = (node: Element) => {
      for (const r of kids(node)) {
        if (r.localName === 'r') {
          const fmt = fmtOf(kid(r, 'rPr'));
          for (const c of kids(r)) {
            if (c.localName === 't') para.runs.push({ text: c.textContent || '', fmt });
            else if (c.localName === 'tab') para.runs.push({ text: '    ', fmt });
            else if (c.localName === 'br') para.runs.push({ text: '', fmt, br: true });
          }
        } else if (['hyperlink', 'smartTag', 'ins', 'sdt', 'sdtContent', 'fldSimple'].includes(r.localName)) walk(r);
      }
    };
    walk(p);
    (para as Para & { mark?: Fmt }).mark = fmtOf(pMark);
    out.push(para);
  }
  return out;
}

function drawText(ctx: CanvasRenderingContext2D, paras: Para[], x: number, y: number, w: number, h: number, anchor: string) {
  type Line = { items: { t: string; f: Fmt; w: number }[]; w: number; h: number; para: Para };
  const lines: Line[] = [];
  const font = (f: Fmt) => `${f.i ? 'italic ' : ''}${f.b ? 'bold ' : ''}${f.size}px "${f.font}", "Times New Roman", serif`;
  for (const para of paras) {
    const mark = (para as Para & { mark?: Fmt }).mark as Fmt;
    const width = Math.max(10, w - para.left);
    let cur: Line = { items: [], w: 0, h: 0, para };
    const push = () => { if (!cur.h) cur.h = mark.size * 1.15; lines.push(cur); cur = { items: [], w: 0, h: 0, para }; };
    for (const run of para.runs) {
      if (run.br) { push(); continue; }
      ctx.font = font(run.fmt);
      for (const tok of run.text.split(/(\s+)/)) {
        if (!tok) continue;
        const tw = ctx.measureText(tok).width;
        if (cur.w + tw > width && cur.items.length && !/^\s+$/.test(tok)) push();
        if (!cur.items.length && /^\s+$/.test(tok)) continue;
        cur.items.push({ t: tok, f: run.fmt, w: tw }); cur.w += tw;
        cur.h = Math.max(cur.h, run.fmt.size * 1.15 * (para.lineMul || 1));
      }
    }
    push();
    lines[lines.length - 1].h += 0; // đoạn kết thúc
    (lines[lines.length - 1] as Line & { after?: number }).after = para.after;
    (lines.find((l) => l.para === para) as Line & { before?: number }).before = para.before;
  }
  let total = 0; lines.forEach((l) => { total += l.h + ((l as Line & { before?: number }).before || 0) + ((l as Line & { after?: number }).after || 0); });
  // Chữ dài hơn khung: Word căn từ mép trên (chữ tràn xuống dưới), không căn giữa/đáy để chữ không tràn lên phía trên
  let cy = total > h ? y : anchor === 'ctr' ? y + (h - total) / 2 : anchor === 'b' ? y + h - total : y;
  ctx.textBaseline = 'alphabetic';
  for (const l of lines) {
    cy += (l as Line & { before?: number }).before || 0;
    const al = l.para.align; const base = x + l.para.left;
    const avail = Math.max(10, w - l.para.left);
    let cx = al === 'center' ? base + (avail - l.w) / 2 : al === 'right' || al === 'end' ? base + avail - l.w : base;
    for (const it of l.items) {
      ctx.font = font(it.f); ctx.fillStyle = it.f.color;
      const by = cy + l.h * 0.8;
      ctx.fillText(it.t, cx, by);
      if (it.f.u) { ctx.fillRect(cx, by + 2, it.w, Math.max(1, it.f.size / 16)); }
      if (it.f.strike) { ctx.fillRect(cx, by - it.f.size * 0.3, it.w, Math.max(1, it.f.size / 16)); }
      cx += it.w;
    }
    cy += l.h + ((l as Line & { after?: number }).after || 0);
  }
}

type Shape = { el: Element; x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean };
function geomOf(sp: Element) {
  const pg = kid(sp, 'prstGeom'); const prst = pg?.getAttribute('prst') || (kid(sp, 'custGeom') ? 'rect' : 'rect');
  const av: Record<string, number> = {};
  all(pg || sp, 'gd').forEach((g) => { const m = /val\s+(-?\d+)/.exec(g.getAttribute('fmla') || ''); if (m && g.getAttribute('name')) av[g.getAttribute('name')!] = Number(m[1]); });
  return { prst, av };
}

function drawWsp(ctx: CanvasRenderingContext2D, wsp: Element, s: Shape, theme: Theme, def: Defaults) {
  const sp = kid(wsp, 'spPr'); const style = kid(wsp, 'style');
  const { prst, av } = geomOf(sp as Element);
  // fill
  let fill: RGBA | null = null; const noFill = !!kid(sp, 'noFill');
  const sf = kid(sp, 'solidFill'); const gf = kid(sp, 'gradFill');
  if (sf) fill = colorFrom(sf, theme);
  else if (gf) { const gs = kid(kid(gf, 'gsLst'), 'gs'); fill = colorFrom(gs, theme); }
  else if (!noFill && style) { const fr = kid(style, 'fillRef'); if (fr && num(fr.getAttribute('idx')) > 0) fill = colorFrom(fr, theme); }
  // line
  const ln = kid(sp, 'ln'); let stroke: RGBA | null = null; let lw = num(ln?.getAttribute('w'), 9525) / EMU;
  if (ln && kid(ln, 'noFill')) stroke = null;
  else if (ln && kid(ln, 'solidFill')) stroke = colorFrom(kid(ln, 'solidFill'), theme);
  else if (style) { const lr = kid(style, 'lnRef'); if (lr && num(lr.getAttribute('idx')) > 0) { stroke = colorFrom(lr, theme); if (!ln?.getAttribute('w')) lw = num(lr.getAttribute('idx')) * 0.75 * 96 / 72 / 1; } }
  if (prst === 'textNoShape') { stroke = stroke && ln && kid(ln, 'solidFill') ? stroke : null; }
  const isLine = /(^line$|Connector)/.test(prst);
  ctx.save();
  ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
  if (s.rot) ctx.rotate(s.rot * Math.PI / 180);
  ctx.scale(s.flipH ? -1 : 1, s.flipV ? -1 : 1);
  ctx.translate(-s.w / 2, -s.h / 2);
  const w = s.w, h = s.h;
  const path = new Path2D(); let poly: [number, number][] | null = null;
  const A = (n: string, d: number) => (av[n] ?? d) / 100000;
  if (isLine) {
    if (prst === 'bentConnector2') poly = [[0, 0], [w, 0], [w, h]];
    else if (prst === 'bentConnector3' || prst === 'curvedConnector3') { const x = w * A('adj1', 50000); poly = [[0, 0], [x, 0], [x, h], [w, h]]; }
    else if (prst === 'bentConnector4') { const x = w * A('adj1', 50000), y = h * A('adj2', 50000); poly = [[0, 0], [x, 0], [x, y], [w, y], [w, h]]; }
    else if (prst === 'bentConnector5') { const x1 = w * A('adj1', 50000), y = h * A('adj2', 50000), x3 = w * A('adj3', 50000); poly = [[0, 0], [x1, 0], [x1, y], [x3, y], [x3, h], [w, h]]; }
    else poly = [[0, 0], [w, h]];
  } else if (prst === 'ellipse') path.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (prst === 'roundRect' || prst === 'flowChartAlternateProcess' || prst === 'flowChartTerminator') {
    const rad = prst === 'flowChartTerminator' ? Math.min(w, h) / 2 : Math.min(w, h) * A('adj', 16667); path.roundRect(0, 0, w, h, rad);
  } else if (prst === 'diamond' || prst === 'flowChartDecision') poly = [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
  else if (prst === 'triangle') poly = [[w / 2, 0], [w, h], [0, h]];
  else if (prst === 'rightArrow' || prst === 'leftArrow') {
    const bh = h * A('adj1', 50000), hl = Math.min(w, h) * A('adj2', 50000), y0 = (h - bh) / 2;
    poly = prst === 'rightArrow' ? [[0, y0], [w - hl, y0], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, y0 + bh], [0, y0 + bh]] : [[w, y0], [hl, y0], [hl, 0], [0, h / 2], [hl, h], [hl, y0 + bh], [w, y0 + bh]];
  } else if (prst === 'downArrow' || prst === 'upArrow') {
    const bw = w * A('adj1', 50000), hl = Math.min(w, h) * A('adj2', 50000), x0 = (w - bw) / 2;
    poly = prst === 'downArrow' ? [[x0, 0], [x0 + bw, 0], [x0 + bw, h - hl], [w, h - hl], [w / 2, h], [0, h - hl], [x0, h - hl]] : [[x0, h], [x0 + bw, h], [x0 + bw, hl], [w, hl], [w / 2, 0], [0, hl], [x0, hl]];
  } else path.rect(0, 0, w, h);
  if (poly && !isLine) { poly.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); path.closePath(); }
  if (fill && !isLine) { ctx.fillStyle = css(fill); ctx.fill(path); }
  if (stroke) {
    ctx.strokeStyle = css(stroke); ctx.lineWidth = Math.max(0.75, lw); ctx.lineJoin = 'miter';
    const dash = kid(ln, 'prstDash')?.getAttribute('val') || '';
    const u = Math.max(1, lw);
    ctx.setLineDash(/^(dash|lgDash|sysDash)/.test(dash) ? [u * 4, u * 3] : /dot|sysDot/i.test(dash) ? [u, u * 2] : []);
    if (poly && isLine) { ctx.beginPath(); poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    else ctx.stroke(path);
    ctx.setLineDash([]);
    if (poly && isLine) {
      const head = (type: string | null | undefined, p: [number, number], q: [number, number]) => {
        if (!type || type === 'none') return;
        const ang = Math.atan2(p[1] - q[1], p[0] - q[0]); const L = Math.max(7, lw * 4);
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang); ctx.fillStyle = css(stroke!); ctx.beginPath();
        if (type === 'oval') ctx.ellipse(-L / 4, 0, L / 3, L / 3, 0, 0, Math.PI * 2);
        else { ctx.moveTo(0, 0); ctx.lineTo(-L, -L / 2.2); ctx.lineTo(type === 'stealth' ? -L * 0.7 : -L, 0); ctx.lineTo(-L, L / 2.2); ctx.closePath(); }
        ctx.fill(); ctx.restore();
      };
      head(kid(ln, 'headEnd')?.getAttribute('type'), poly[0], poly[1]);
      head(kid(ln, 'tailEnd')?.getAttribute('type'), poly[poly.length - 1], poly[poly.length - 2]);
    }
  }
  // chữ trong hình (không xoay/lật chữ theo hình lật)
  const tb = kid(wsp, 'txbx'); const content = tb && kid(tb, 'txbxContent');
  if (content) {
    const bp = kid(wsp, 'bodyPr');
    const l = num(bp?.getAttribute('lIns'), 91440) / EMU, t = num(bp?.getAttribute('tIns'), 45720) / EMU, r = num(bp?.getAttribute('rIns'), 91440) / EMU, b = num(bp?.getAttribute('bIns'), 45720) / EMU;
    ctx.save();
    if (s.flipH) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    if (s.flipV) { ctx.translate(0, h); ctx.scale(1, -1); }
    drawText(ctx, readParas(content, def, theme), l, t, Math.max(10, w - l - r), Math.max(10, h - t - b), bp?.getAttribute('anchor') || 't');
    ctx.restore();
  }
  ctx.restore();
}

function xfrmOf(sp: Element | undefined, fallbackW: number, fallbackH: number): Shape {
  const xf = kid(sp, 'xfrm'); const off = kid(xf, 'off'), ext = kid(xf, 'ext');
  return { el: sp as Element, x: num(off?.getAttribute('x')) / EMU, y: num(off?.getAttribute('y')) / EMU, w: ext ? num(ext.getAttribute('cx')) / EMU : fallbackW, h: ext ? num(ext.getAttribute('cy')) / EMU : fallbackH, rot: num(xf?.getAttribute('rot')) / 60000, flipH: xf?.getAttribute('flipH') === '1', flipV: xf?.getAttribute('flipV') === '1' };
}

function drawGroup(ctx: CanvasRenderingContext2D, grp: Element, box: { x: number; y: number; w: number; h: number }, theme: Theme, def: Defaults) {
  const gp = kid(grp, 'grpSpPr'); const xf = kid(gp, 'xfrm');
  const chOff = kid(xf, 'chOff'), chExt = kid(xf, 'chExt');
  const cx = num(chOff?.getAttribute('x')) / EMU, cy = num(chOff?.getAttribute('y')) / EMU;
  const cw = num(chExt?.getAttribute('cx')) / EMU || box.w, ch = num(chExt?.getAttribute('cy')) / EMU || box.h;
  const sx = box.w / cw, sy = box.h / ch;
  ctx.save(); ctx.translate(box.x, box.y); ctx.scale(sx, sy); ctx.translate(-cx, -cy);
  for (const k of kids(grp)) {
    if (k.localName === 'wsp') { const sp = kid(k, 'spPr'); drawWsp(ctx, k, xfrmOf(sp, 0, 0), theme, def); }
    else if (k.localName === 'grpSp') {
      const x2 = kid(kid(k, 'grpSpPr'), 'xfrm'); const o = kid(x2, 'off'), e = kid(x2, 'ext');
      drawGroup(ctx, k, { x: num(o?.getAttribute('x')) / EMU, y: num(o?.getAttribute('y')) / EMU, w: num(e?.getAttribute('cx')) / EMU, h: num(e?.getAttribute('cy')) / EMU }, theme, def);
    }
  }
  ctx.restore();
}

async function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

// Bảng nổi (w:tblpPr) gần kín bề ngang trang: thư viện dựng thành "float: left" và bỏ qua căn giữa theo lề, nên bảng rộng hơn vùng chữ bị lệch trái,
// tràn mép phải trang và chữ chạy vòng cạnh bảng. Với bảng rộng (không còn chỗ cho chữ cạnh bên) đổi thành bảng thường căn giữa/phải/trái đúng như Word.
function convertFloatingTables(doc: Document): boolean {
  const body = all(doc, 'body')[0]; if (!body) return false;
  const sects: { idx: number; textW: number }[] = [];
  const kidsArr = Array.from(body.children);
  kidsArr.forEach((el, idx) => {
    const sp = el.localName === 'sectPr' ? el : el.localName === 'p' ? kid(kid(el, 'pPr'), 'sectPr') : undefined;
    if (!sp) return;
    const pg = kid(sp, 'pgSz'), mar = kid(sp, 'pgMar');
    const w = num(at(pg, 'w'), 11906), l = num(at(mar, 'left'), 1440), r = num(at(mar, 'right'), 1440), g = num(at(mar, 'gutter'), 0);
    sects.push({ idx, textW: w - l - r - g });
  });
  let changed = false;
  kidsArr.forEach((el, idx) => {
    if (el.localName !== 'tbl') return;
    const pr = kid(el, 'tblPr'); const pos = kid(pr, 'tblpPr'); if (!pr || !pos) return;
    const sec = sects.find((x) => x.idx >= idx); if (!sec) return;
    let tw = 0; const tblW = kid(pr, 'tblW');
    if (tblW && (at(tblW, 'type') === 'dxa' || !at(tblW, 'type'))) tw = num(at(tblW, 'w'));
    if (!tw) tw = kids(kid(el, 'tblGrid'), 'gridCol').reduce((a, g) => a + num(at(g, 'w')), 0);
    const spec = at(pos, 'tblpXSpec'); if (!tw || at(pos, 'tblpX') !== null && !spec) return;
    if (tw < sec.textW * 0.85) return; // bảng hẹp: giữ chữ chạy vòng cạnh như cũ
    const jc = doc.createElementNS(pr.namespaceURI, (pr.prefix ? pr.prefix + ':' : '') + 'jc');
    jc.setAttributeNS(pr.namespaceURI, (pr.prefix ? pr.prefix + ':' : '') + 'val', spec === 'right' || spec === 'outside' ? 'right' : spec === 'left' || spec === 'inside' ? 'left' : 'center');
    pr.removeChild(pos);
    kids(pr, 'jc').forEach((j) => pr.removeChild(j));
    pr.appendChild(jc); changed = true;
  });
  return changed;
}

export async function renderDocxShapes(file: Blob): Promise<{ blob: Blob; pngs: Uint8Array[] }> {
  const pngs: Uint8Array[] = [];
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const parts = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
    // nhanh: không có hình vẽ DrawingML thì không làm gì
    const texts: Record<string, string> = {};
    for (const p of parts) texts[p] = await zip.file(p)!.async('string');
    const needShapes = parts.some((p) => /wordprocessingShape|wordprocessingGroup/.test(texts[p]));
    const needTables = /tblpPr/.test(texts['word/document.xml'] || '');
    if (!needShapes && !needTables) return { blob: file, pngs };
    const th = zip.file('word/theme/theme1.xml'); const theme: Theme = { ...DEF_THEME };
    if (th) { const cs = all(parseXml(await th.async('string')), 'clrScheme')[0]; if (cs) kids(cs).forEach((e) => { const c = e.firstElementChild; const v = c && (c.getAttribute('val') || c.getAttribute('lastClr')); if (v && /^[0-9a-f]{6}$/i.test(v)) theme[e.localName] = v; }); }
    const def: Defaults = { sizePt: 10, font: 'Times New Roman' };
    const stf = zip.file('word/styles.xml');
    if (stf) {
      const sd = parseXml(await stf.async('string'));
      const dd = all(sd, 'rPrDefault')[0]; const nm = all(sd, 'style').find((s) => s.getAttribute('w:default') === '1' && s.getAttribute('w:type') === 'paragraph');
      for (const rp of [kid(dd, 'rPr'), kid(nm, 'rPr')]) { const sz = num(at(kid(rp, 'sz'), 'val')); if (sz) def.sizePt = sz / 2; const f = at(kid(rp, 'rFonts'), 'ascii'); if (f) def.font = f; }
    }
    let counter = 0; let changed = false;
    for (const part of parts) {
      const doc = parseXml(texts[part]); if (doc.getElementsByTagName('parsererror').length) continue;
      let tablesChanged = false;
      if (needTables && part === 'word/document.xml') tablesChanged = convertFloatingTables(doc);
      const drawings = !needShapes ? [] : all(doc, 'drawing').filter((d) => { const gd = all(d, 'graphicData')[0]; return !!gd && /wordprocessing(Shape|Group)/.test(gd.getAttribute('uri') || ''); });
      if (!drawings.length && !tablesChanged) { continue; }
      if (tablesChanged) changed = true;
      const relPath = part.replace(/([^/]+)$/, '_rels/$1.rels');
      const relFile = zip.file(relPath);
      const relDoc = relFile ? parseXml(await relFile.async('string')) : parseXml(`<Relationships xmlns="${NS.pkgRel}"/>`);
      let partChanged = tablesChanged;
      for (const d of drawings) {
        try {
          const holder = kids(d).find((k) => k.localName === 'anchor' || k.localName === 'inline'); if (!holder) continue;
          const ext = kid(holder, 'extent'); let cx = num(ext?.getAttribute('cx')), cy = num(ext?.getAttribute('cy'));
          const gd = all(holder, 'graphicData')[0]; const content = gd.firstElementChild as Element | null; if (!content) continue;
          // hình có chiều 0 (đường thẳng/mũi tên): nới biên để vẫn thấy nét, bù lại vị trí neo
          const pad = (cx <= 0 || cy <= 0) ? 38100 : 0; const lw0 = pad ? 0 : 0;
          const wpx = (cx + 2 * pad) / EMU, hpx = (cy + 2 * pad) / EMU;
          if (wpx < 1 || hpx < 1 || wpx * hpx * SCALE * SCALE > 36e6) continue;
          const canvas = document.createElement('canvas'); canvas.width = Math.ceil(wpx * SCALE); canvas.height = Math.ceil(hpx * SCALE);
          const ctx = canvas.getContext('2d'); if (!ctx) continue;
          ctx.scale(SCALE, SCALE); ctx.translate(pad / EMU + lw0, pad / EMU);
          if (content.localName === 'wsp') { const s = xfrmOf(kid(content, 'spPr'), cx / EMU, cy / EMU); s.x = 0; s.y = 0; s.w = cx / EMU; s.h = cy / EMU; drawWsp(ctx, content, s, theme, def); }
          else if (content.localName === 'wgp') drawGroup(ctx, content, { x: 0, y: 0, w: cx / EMU, h: cy / EMU }, theme, def);
          else continue;
          const png = await toPng(canvas); if (!png) continue;
          const name = `qmsshape${++counter}.png`; zip.file('word/media/' + name, png); pngs.push(png);
          const rid = 'rIdQmsShape' + counter;
          const rel = relDoc.createElementNS(NS.pkgRel, 'Relationship');
          rel.setAttribute('Id', rid); rel.setAttribute('Type', NS.r + '/image'); rel.setAttribute('Target', 'media/' + name); relDoc.documentElement.appendChild(rel);
          if (pad) {
            if (ext) { ext.setAttribute('cx', String(cx + 2 * pad)); ext.setAttribute('cy', String(cy + 2 * pad)); }
            for (const pos of [kid(holder, 'positionH'), kid(holder, 'positionV')]) { const po = kid(pos, 'posOffset'); if (po) po.textContent = String(num(po.textContent) - pad); }
            cx += 2 * pad; cy += 2 * pad;
          }
          const mk = (ns: string, q: string) => doc.createElementNS(ns, q);
          const gdNew = mk(NS.a, 'a:graphicData'); gdNew.setAttribute('uri', NS.pic);
          const pic = mk(NS.pic, 'pic:pic');
          const nv = mk(NS.pic, 'pic:nvPicPr'); const cnv = mk(NS.pic, 'pic:cNvPr'); cnv.setAttribute('id', String(9000 + counter)); cnv.setAttribute('name', 'qmsshape' + counter); nv.appendChild(cnv); nv.appendChild(mk(NS.pic, 'pic:cNvPicPr')); pic.appendChild(nv);
          const bf = mk(NS.pic, 'pic:blipFill'); const blip = mk(NS.a, 'a:blip'); blip.setAttributeNS(NS.r, 'r:embed', rid); bf.appendChild(blip);
          const st = mk(NS.a, 'a:stretch'); st.appendChild(mk(NS.a, 'a:fillRect')); bf.appendChild(st); pic.appendChild(bf);
          const sp = mk(NS.pic, 'pic:spPr'); const xf = mk(NS.a, 'a:xfrm'); const off = mk(NS.a, 'a:off'); off.setAttribute('x', '0'); off.setAttribute('y', '0');
          const ex = mk(NS.a, 'a:ext'); ex.setAttribute('cx', String(cx)); ex.setAttribute('cy', String(cy)); xf.appendChild(off); xf.appendChild(ex); sp.appendChild(xf);
          const pg = mk(NS.a, 'a:prstGeom'); pg.setAttribute('prst', 'rect'); sp.appendChild(pg); pic.appendChild(sp);
          gdNew.appendChild(pic); gd.parentNode!.replaceChild(gdNew, gd);
          // Choice của mc:AlternateContent → thay cả khối bằng w:drawing đã đổi (bỏ bản VML dự phòng để không vẽ trùng)
          const choice = d.parentElement, alt = choice?.parentElement;
          if (choice?.localName === 'Choice' && alt?.localName === 'AlternateContent' && alt.parentNode) alt.parentNode.replaceChild(d, alt);
          partChanged = true; changed = true;
        } catch { /* bỏ qua hình này, giữ nguyên bản gốc */ }
      }
      if (partChanged) { const ser = new XMLSerializer(); zip.file(part, ser.serializeToString(doc)); zip.file(relPath, ser.serializeToString(relDoc)); }
    }
    if (!changed) return { blob: file, pngs: [] };
    const ctf = zip.file('[Content_Types].xml');
    if (ctf) {
      const cts = await ctf.async('string');
      if (!/Extension="png"/i.test(cts)) zip.file('[Content_Types].xml', cts.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
    }
    const blob = await zip.generateAsync({ type: 'blob', mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return { blob, pngs };
  } catch { return { blob: file, pngs: [] }; }
}

// Phân loại ảnh đã dựng: ảnh nào là ảnh do renderDocxShapes vẽ (so khớp nội dung PNG) để lưu/khôi phục riêng với ảnh gốc của tệp.
export async function markGeneratedImages(imgs: HTMLImageElement[], pngs: Uint8Array[]): Promise<boolean[]> {
  if (!pngs.length) return imgs.map(() => false);
  const sizes = new Map<number, Uint8Array[]>();
  pngs.forEach((b) => sizes.set(b.length, [...(sizes.get(b.length) || []), b]));
  return Promise.all(imgs.map(async (img) => {
    try {
      const src = img.getAttribute('src') || ''; if (!/^(blob|data):/.test(src)) return false;
      const buf = new Uint8Array(await (await fetch(src)).arrayBuffer());
      const cand = sizes.get(buf.length); if (!cand) return false;
      return cand.some((c) => { for (let i = 0; i < c.length; i += Math.max(1, c.length >> 6)) if (c[i] !== buf[i]) return false; return c[c.length - 1] === buf[buf.length - 1]; });
    } catch { return false; }
  }));
}

// Thông tin đánh số trang của tệp Word: chỉ khi tệp có đúng 1 phân đoạn (section) thì mới đánh lại số trang theo trang hiển thị.
export async function docxPageInfo(file: Blob): Promise<{ singleSection: boolean; start: number }> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const f = zip.file('word/document.xml'); if (!f) return { singleSection: false, start: 1 };
    const x = await f.async('string');
    const n = (x.match(/<w:sectPr[\s>]/g) || []).length;
    const m = /<w:pgNumType\b[^>]*\bw:start="(-?\d+)"/.exec(x);
    return { singleSection: n <= 1, start: m ? Number(m[1]) : 1 };
  } catch { return { singleSection: false, start: 1 }; }
}

// Tệp Word ghi sẵn vị trí ngắt trang của lần dàn trang cuối (w:lastRenderedPageBreak) nhưng trình xem bỏ qua chúng (nhất là bên trong bảng).
// Thay mỗi dấu bằng một chuỗi đánh dấu để sau khi dựng có thể chia trang đúng chỗ như bản PDF; hàm paginateAtMarkers trong DocumentPreview sẽ gỡ chuỗi này.
export const PB_SENTINEL = '\u27E6QMSPB\u27E7';
export async function markPageBreaks(file: Blob): Promise<Blob> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const f = zip.file('word/document.xml'); if (!f) return file;
    const x = await f.async('string');
    if (!/<w:lastRenderedPageBreak\s*\/>/.test(x)) return file;
    zip.file('word/document.xml', x.replace(/<w:lastRenderedPageBreak\s*\/>/g, '<w:t>' + PB_SENTINEL + '</w:t>'));
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const blobBuffer = new ArrayBuffer(out.byteLength);
new Uint8Array(blobBuffer).set(out);

return new Blob([blobBuffer], {
  type: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
  } catch { return file; }
}

// Thông tin từng bảng ở mức thân văn bản (theo thứ tự) để dựng lại đúng độ rộng cột của Word: lưới cột (twips), bố cục cố định, thụt lề, căn lề, khổ trang.
export type TableInfo = { grid: number[]; fixed: boolean; ind: number; jc: string; pageW: number; mL: number; mR: number };
export async function docxTableInfo(file: Blob): Promise<TableInfo[]> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const f = zip.file('word/document.xml'); if (!f) return [];
    const doc = parseXml(await f.async('string')); const body = all(doc, 'body')[0]; if (!body) return [];
    const arr = Array.from(body.children);
    const sects: { idx: number; pageW: number; mL: number; mR: number }[] = [];
    arr.forEach((el, idx) => {
      const sp = el.localName === 'sectPr' ? el : el.localName === 'p' ? kid(kid(el, 'pPr'), 'sectPr') : undefined; if (!sp) return;
      const pg = kid(sp, 'pgSz'), mar = kid(sp, 'pgMar');
      sects.push({ idx, pageW: num(at(pg, 'w'), 11906), mL: num(at(mar, 'left'), 1440) + num(at(mar, 'gutter'), 0), mR: num(at(mar, 'right'), 1440) });
    });
    const out: TableInfo[] = [];
    // bảng ở mức thân văn bản, kể cả bảng nằm trong khối nội dung (w:sdt) cấp thân — đúng thứ tự xuất hiện
    const flat: { el: Element; idx: number }[] = [];
    arr.forEach((el, idx) => {
      if (el.localName === 'tbl') flat.push({ el, idx });
      else if (el.localName === 'sdt') kids(kid(el, 'sdtContent'), 'tbl').forEach((t) => flat.push({ el: t, idx }));
    });
    flat.forEach(({ el, idx }) => {
      const pr = kid(el, 'tblPr'); const sec = sects.find((x) => x.idx >= idx) || sects[sects.length - 1] || { pageW: 11906, mL: 1440, mR: 1440 };
      const ind = kid(pr, 'tblInd'); const lay = kid(pr, 'tblLayout'); const jc = kid(pr, 'jc');
      out.push({
        grid: kids(kid(el, 'tblGrid'), 'gridCol').map((g) => num(at(g, 'w'))),
        fixed: at(lay, 'type') === 'fixed',
        ind: ind && (at(ind, 'type') === 'dxa' || !at(ind, 'type')) ? num(at(ind, 'w')) : 0,
        jc: at(jc, 'val') || '',
        pageW: sec.pageW, mL: sec.mL, mR: sec.mR,
      });
    });
    return out;
  } catch { return []; }
}
