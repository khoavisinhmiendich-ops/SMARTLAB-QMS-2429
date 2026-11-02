// Tay nắm để chỉnh hình vẽ do người dùng chèn (tab "Hình vẽ"): kéo 8 điểm để đổi dài/ngắn/to/nhỏ, kéo 2 đầu đường thẳng/mũi tên
// để đổi độ dài và hướng, kéo tay xoay để xoay tự do (giữ Shift để xoay theo bước 15°), kéo tay ✥ để di chuyển.
// Khung tay nắm là lớp riêng gắn vào <body> (position: fixed) nên không bị cắt bởi hình (overflow, clip-path), không nằm trong nội dung và không bị lưu.
const LINE_KINDS = ['line', 'arrow', 'double-arrow', 'dashed-arrow', 'connector'];
const MIN = 16;

type Opts = {
  getRoot: () => HTMLElement | null;
  isEditable: () => boolean;
  allowImages?: () => boolean; // cho phép chọn/kéo giãn cả ảnh và hình vẽ lại từ Word (ảnh PNG)
  onSelect: (el: HTMLElement | null) => void;
  onChange: () => void;
};

function zoomOf(shape: HTMLElement): number {
  const pc = shape.closest('.preview-content') as HTMLElement | null;
  const z = parseFloat(pc?.style.zoom || '100');
  return Number.isFinite(z) && z > 0 ? z / 100 : 1;
}
function angleOf(shape: HTMLElement): number {
  const m = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(shape.style.transform || '');
  return m ? parseFloat(m[1]) : 0;
}

// Vị trí left/top hiện tại theo px (docx-preview ghi left/top theo pt nên không đọc trực tiếp từ style.left được).
function pxOf(el: HTMLElement, prop: 'left' | 'top'): number {
  const v = parseFloat(getComputedStyle(el)[prop]);
  return Number.isFinite(v) ? v : 0;
}

export function mountShapeHandles(opts: Opts): () => void {
  const frame = document.createElement('div');
  frame.setAttribute('data-qms-handles', '1');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none;display:none;box-sizing:border-box;border:1px dashed #0b8994;';
  const mk = (id: string, cursor: string, round = false) => {
    const h = document.createElement('div');
    h.setAttribute('data-h', id);
    h.style.cssText = `position:absolute;width:11px;height:11px;margin:-6px 0 0 -6px;box-sizing:border-box;background:#fff;border:2px solid #0b8994;${round ? 'border-radius:50%;' : 'border-radius:2px;'}pointer-events:auto;touch-action:none;cursor:${cursor};`;
    frame.appendChild(h); return h;
  };
  const pos: Record<string, [string, string, string]> = {
    nw: ['0%', '0%', 'nwse-resize'], n: ['50%', '0%', 'ns-resize'], ne: ['100%', '0%', 'nesw-resize'], e: ['100%', '50%', 'ew-resize'],
    se: ['100%', '100%', 'nwse-resize'], s: ['50%', '100%', 'ns-resize'], sw: ['0%', '100%', 'nesw-resize'], w: ['0%', '50%', 'ew-resize'],
  };
  const hs: Record<string, HTMLElement> = {};
  Object.entries(pos).forEach(([id, [x, y, c]]) => { const h = mk(id, c); h.style.left = x; h.style.top = y; hs[id] = h; });
  const rot = mk('rot', 'grab', true); rot.style.left = '50%'; rot.style.top = '-26px'; rot.style.background = '#0b8994'; rot.title = 'Xoay (giữ Shift: bước 15°)';
  const stem = document.createElement('div'); stem.style.cssText = 'position:absolute;left:50%;top:-22px;height:22px;border-left:1px solid #0b8994;pointer-events:none;'; frame.appendChild(stem);
  const mov = mk('move', 'move', true); mov.style.left = '50%'; mov.style.top = '100%'; mov.style.marginTop = '12px'; mov.textContent = '✥'; mov.title = 'Kéo để di chuyển hình';
  mov.style.cssText += 'width:18px;height:18px;margin:12px 0 0 -9px;display:flex;align-items:center;justify-content:center;font:12px Arial;color:#0b8994;';
  document.body.appendChild(frame);

  let current: HTMLElement | null = null; let raf = 0; let dragging = false;

  const isLine = (s: HTMLElement) => LINE_KINDS.includes(s.dataset.qmsKind || '');
  const place = () => {
    raf = 0;
    const s = current; const root = opts.getRoot();
    if (!s || !root || !root.contains(s) || !opts.isEditable()) { frame.style.display = 'none'; if (s && (!root || !root.contains(s))) current = null; }
    else {
      const z = zoomOf(s); const r = s.getBoundingClientRect(); const ang = angleOf(s);
      const w = s.offsetWidth * z, h = s.offsetHeight * z;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      frame.style.display = 'block';
      frame.style.width = w + 'px'; frame.style.height = h + 'px';
      frame.style.left = cx - w / 2 + 'px'; frame.style.top = cy - h / 2 + 'px';
      frame.style.transform = `rotate(${ang}deg)`;
      const line = isLine(s);
      Object.entries(hs).forEach(([id, el]) => { el.style.display = line ? (id === 'w' || id === 'e' ? 'block' : 'none') : 'block'; });
      frame.style.borderColor = line ? 'transparent' : '#0b8994';
    }
    if (current || dragging) raf = requestAnimationFrame(place);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(place); };

  const select = (s: HTMLElement | null) => { current = s; opts.onSelect(s); if (s) kick(); else frame.style.display = 'none'; };

  const onDocDown = (ev: PointerEvent) => {
    const t = ev.target as Element | null; if (!t) return;
    if (frame.contains(t)) return;
    const root = opts.getRoot();
    const img = t instanceof HTMLImageElement && opts.allowImages?.() ? t : null;
    const shape = img || (t.closest?.('[data-qms-shape="true"]') as HTMLElement | null);
    if (shape && root && root.contains(shape) && opts.isEditable()) { if (shape !== current) select(shape); return; }
    if (root && root.contains(t) && current) select(null); // bấm vào chỗ khác trong tài liệu → bỏ chọn
  };

  const begin = (ev: PointerEvent) => {
    const hEl = (ev.target as HTMLElement).closest('[data-h]') as HTMLElement | null; const s = current;
    if (!hEl || !s || !opts.isEditable()) return;
    ev.preventDefault(); ev.stopPropagation();
    const id = hEl.dataset.h as string; const z = zoomOf(s);
    const rect0 = s.getBoundingClientRect(); const cx0 = rect0.left + rect0.width / 2, cy0 = rect0.top + rect0.height / 2;
    const w0 = s.offsetWidth, h0 = s.offsetHeight; const ang0 = angleOf(s); const th = ang0 * Math.PI / 180;
    if (getComputedStyle(s).position === 'static') s.style.position = 'relative'; // ảnh nằm cùng dòng chữ: cần relative để dịch/kéo giãn được
    const isImg = s instanceof HTMLImageElement;
    if (isImg && id !== 'move' && id !== 'rot') { s.style.maxWidth = 'none'; s.style.width = s.offsetWidth + 'px'; s.style.height = s.offsetHeight + 'px'; }
    const left0 = pxOf(s, 'left'), top0 = pxOf(s, 'top');
    const sx = ev.clientX, sy = ev.clientY; dragging = true; kick();
    const setPos = (l: number, t: number) => { s.dataset.dragLeft = String(l); s.dataset.dragTop = String(t); s.style.left = l + 'px'; s.style.top = t + 'px'; };
    const line = isLine(s);
    // Chuẩn bị cho đường thẳng: giữ cố định đầu đối diện
    const S = { x: cx0 - (w0 * z / 2) * Math.cos(th), y: cy0 - (w0 * z / 2) * Math.sin(th) };
    const E = { x: cx0 + (w0 * z / 2) * Math.cos(th), y: cy0 + (w0 * z / 2) * Math.sin(th) };
    const staticCx = cx0 - left0 * z, staticCy = cy0 - top0 * z; // tâm khi chưa dịch (hệ toạ độ màn hình)

    const move = (mv: PointerEvent) => {
      const dxs = mv.clientX - sx, dys = mv.clientY - sy;
      if (id === 'move') { setPos(left0 + dxs / z, top0 + dys / z); return; }
      if (id === 'rot') {
        let a = Math.atan2(mv.clientY - cy0, mv.clientX - cx0) * 180 / Math.PI + 90;
        if (mv.shiftKey) a = Math.round(a / 15) * 15;
        a = Math.round(a * 10) / 10; if (a > 180) a -= 360;
        s.style.transform = `rotate(${a}deg)`; return;
      }
      if (line && (id === 'w' || id === 'e')) {
        const fixed = id === 'e' ? S : E; const P = { x: mv.clientX, y: mv.clientY };
        const dx = P.x - fixed.x, dy = P.y - fixed.y; let len = Math.hypot(dx, dy) / z; if (len < MIN) len = MIN;
        let a = Math.atan2(dy, dx) * 180 / Math.PI; if (id === 'w') a += 180;
        if (mv.shiftKey) a = Math.round(a / 15) * 15;
        a = Math.round(a * 10) / 10; while (a > 180) a -= 360; while (a <= -180) a += 360;
        const ar = a * Math.PI / 180; const sgn = id === 'e' ? 1 : -1;
        const nc = { x: fixed.x + sgn * (len * z / 2) * Math.cos(ar), y: fixed.y + sgn * (len * z / 2) * Math.sin(ar) };
        s.style.width = len + 'px'; s.style.minWidth = MIN + 'px'; s.style.transform = `rotate(${a}deg)`;
        // vị trí tĩnh mới: mép trái giữ nguyên nên tâm tĩnh dịch nửa phần thay đổi chiều rộng
        const scx = staticCx + (len - w0) * z / 2, scy = staticCy;
        setPos((nc.x - scx) / z, (nc.y - scy) / z); return;
      }
      // Kéo giãn hộp theo trục của hình (đã tính xoay)
      const dx = dxs / z, dy = dys / z; const c = Math.cos(-th), sn = Math.sin(-th);
      const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
      let nw = w0, nh = h0, dxc = 0, dyc = 0;
      if (id.includes('e')) { nw = w0 + lx; }
      if (id.includes('w')) { nw = w0 - lx; }
      if (id.includes('s')) { nh = h0 + ly; }
      if (id.includes('n')) { nh = h0 - ly; }
      if ((mv.shiftKey || isImg) && id.length === 2) { const k = Math.max(nw / w0, nh / h0); nw = w0 * k; nh = h0 * k; }
      nw = Math.max(MIN, nw); nh = Math.max(MIN, nh);
      const dw = nw - w0, dh = nh - h0;
      if (id.includes('e')) dxc = dw / 2; if (id.includes('w')) dxc = -dw / 2;
      if (id.includes('s')) dyc = dh / 2; if (id.includes('n')) dyc = -dh / 2;
      const wx = Math.cos(th) * dxc - Math.sin(th) * dyc, wy = Math.sin(th) * dxc + Math.cos(th) * dyc;
      if (id.includes('e') || id.includes('w')) { s.style.width = nw + 'px'; s.style.minWidth = MIN + 'px'; }
      if (id.includes('s') || id.includes('n')) { s.style.height = nh + 'px'; s.style.minHeight = MIN + 'px'; }
      setPos(left0 + wx - (id.includes('e') || id.includes('w') ? dw / 2 : 0), top0 + wy - (id.includes('s') || id.includes('n') ? dh / 2 : 0));
    };
    const up = () => {
      dragging = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      opts.onChange(); kick();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const onKey = (ev: KeyboardEvent) => {
    const s = current; if (!s || !opts.isEditable()) return;
    const inText = (ev.target as HTMLElement | null)?.closest?.('[data-qms-shape="true"]') === s && document.activeElement === s && window.getSelection()?.anchorNode && s.contains(window.getSelection()!.anchorNode);
    if (inText) return; // đang gõ chữ trong hình: không bắt phím mũi tên
    const step = ev.shiftKey ? 10 : 1; let dx = 0, dy = 0;
    if (ev.key === 'ArrowLeft') dx = -step; else if (ev.key === 'ArrowRight') dx = step; else if (ev.key === 'ArrowUp') dy = -step; else if (ev.key === 'ArrowDown') dy = step; else return;
    ev.preventDefault();
    if (getComputedStyle(s).position === 'static') s.style.position = 'relative';
    const l = pxOf(s, 'left') + dx, t = pxOf(s, 'top') + dy;
    s.dataset.dragLeft = String(l); s.dataset.dragTop = String(t); s.style.left = l + 'px'; s.style.top = t + 'px'; opts.onChange();
  };

  frame.addEventListener('pointerdown', begin);
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', kick, true); window.addEventListener('resize', kick);
  return () => {
    document.removeEventListener('pointerdown', onDocDown, true); document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', kick, true); window.removeEventListener('resize', kick);
    if (raf) cancelAnimationFrame(raf); frame.remove();
  };
}

// Chọn hình từ bên ngoài (vd. ngay sau khi chèn) để tay nắm hiện ra.
export function selectShapeHandles(shape: HTMLElement) {
  shape.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
}
