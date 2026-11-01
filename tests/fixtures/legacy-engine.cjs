// Foam nesting engine: SVG import, raster nesting, single-stroke hot-wire path, TAP/SVG output.
// All geometry is in millimetres. Coordinates follow the SVG page: X right, Y down,
// which is exactly how FCNC maps Corel to the machine (TAP Y = SVG y).
(function (root) {
  'use strict';

  /* ---------- small geometry helpers ---------- */
  const FLAT_TOL = 0.04; // mm chord error when flattening curves
  const DENSIFY = 2.5;   // mm max spacing on contours used for bridge search

  const matMul = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const matApply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  function polyArea(p) {
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
    return a / 2;
  }
  function bboxOf(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of p) {
      if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
      if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
    }
    return { x0, y0, x1, y1 };
  }
  function pointInPoly(pt, poly) {
    let inside = false;
    const x = pt[0], y = pt[1];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function segCross(a, b, c, d) {
    const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
    const d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  // Liang-Barsky: does segment a-b touch rectangle r ({x, y, w, h})?
  function segHitsRect(a, b, r) {
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const edges = [[-dx, a[0] - r.x], [dx, r.x + r.w - a[0]], [-dy, a[1] - r.y], [dy, r.y + r.h - a[1]]];
    for (const [p, q] of edges) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  function densify(pts, step) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a);
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d > step) {
        const n = Math.ceil(d / step);
        for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      }
    }
    return out;
  }

  /* ---------- SVG import ---------- */
  const UNIT_MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };
  function lengthMM(s) {
    const m = /^\s*([+-]?[\d.]+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(s || '');
    if (!m || !(m[2].toLowerCase() in UNIT_MM)) return null;
    return parseFloat(m[1]) * UNIT_MM[m[2].toLowerCase()];
  }
  function parseTransform(s) {
    let m = [1, 0, 0, 1, 0, 0];
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let t;
    while ((t = re.exec(s || ''))) {
      const v = (t[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || []).map(Number);
      let n = [1, 0, 0, 1, 0, 0];
      if (t[1] === 'matrix') n = v;
      else if (t[1] === 'translate') n = [1, 0, 0, 1, v[0], v[1] || 0];
      else if (t[1] === 'scale') n = [v[0], 0, 0, v[1] === undefined ? v[0] : v[1], 0, 0];
      else if (t[1] === 'rotate') {
        const r = v[0] * Math.PI / 180, c = Math.cos(r), z = Math.sin(r);
        n = [c, z, -z, c, 0, 0];
        if (v.length > 2) n = matMul(matMul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
      } else if (t[1] === 'skewX') n = [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0];
      else n = [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0];
      m = matMul(m, n);
    }
    return m;
  }
  function flatCubic(out, p0, p1, p2, p3, depth) {
    const dx = p3[0] - p0[0], dy = p3[1] - p0[1], len = Math.hypot(dx, dy);
    const d1 = len > 1e-9 ? Math.abs((p1[0] - p3[0]) * dy - (p1[1] - p3[1]) * dx) / len : Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const d2 = len > 1e-9 ? Math.abs((p2[0] - p3[0]) * dy - (p2[1] - p3[1]) * dx) / len : Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
    if (depth > 12 || d1 + d2 <= FLAT_TOL * 1.5) { out.push(p3); return; }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const a = mid(p0, p1), b = mid(p1, p2), c = mid(p2, p3), e = mid(a, b), f = mid(b, c), g = mid(e, f);
    flatCubic(out, p0, a, e, g, depth + 1);
    flatCubic(out, g, f, c, p3, depth + 1);
  }
  function arcPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if (rx === 0 || ry === 0) return [[x2, y2]];
    rx = Math.abs(rx); ry = Math.abs(ry);
    const c = Math.cos(phi), s = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const xp = c * dx + s * dy, yp = -s * dx + c * dy;
    const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const den = rx * rx * yp * yp + ry * ry * xp * xp;
    let co = den ? Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den)) : 0;
    if (fa === fs) co = -co;
    const cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx;
    const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
    const ang = (ux, uy) => Math.atan2(uy, ux);
    const t1 = ang((xp - cxp) / rx, (yp - cyp) / ry);
    let dt = ang((-xp - cxp) / rx, (-yp - cyp) / ry) - t1;
    if (!fs && dt > 0) dt -= 2 * Math.PI;
    if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 32)));
    const out = [];
    for (let i = 1; i <= n; i++) {
      const t = t1 + dt * i / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      out.push([c * ex - s * ey + cx, s * ex + c * ey + cy]);
    }
    return out;
  }
  // Returns closed polygons (mm) for one path "d"; openCount counts subpaths that had no z.
  function pathToPolys(d, m, res) {
    const tok = d.match(/[a-df-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0, cur = null, prev = '';
    const num = () => parseFloat(tok[i++]);
    const finish = closed => {
      if (cur && cur.length > 2) { res.polys.push(cur); if (!closed) res.open++; }
      cur = null;
    };
    const ensure = () => { if (!cur) cur = [matApply(m, x, y)]; };
    while (i < tok.length) {
      if (/^[a-z]$/i.test(tok[i])) cmd = tok[i++];
      const rel = cmd >= 'a', C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === 'Z') { finish(true); x = sx; y = sy; prev = C; cmd = ''; continue; }
      if (!cmd) { i++; continue; }
      if (C === 'M') {
        finish(false);
        x = num() + ox; y = num() + oy; sx = x; sy = y;
        cur = [matApply(m, x, y)];
        cmd = rel ? 'l' : 'L';
      } else if (C === 'L') {
        ensure(); x = num() + ox; y = num() + oy; cur.push(matApply(m, x, y));
      } else if (C === 'H') {
        ensure(); x = num() + ox; cur.push(matApply(m, x, y));
      } else if (C === 'V') {
        ensure(); y = num() + oy; cur.push(matApply(m, x, y));
      } else if (C === 'C' || C === 'S') {
        ensure();
        let x1, y1;
        if (C === 'C') { x1 = num() + ox; y1 = num() + oy; }
        else { x1 = (prev === 'C' || prev === 'S') ? 2 * x - cx : x; y1 = (prev === 'C' || prev === 'S') ? 2 * y - cy : y; }
        const x2 = num() + ox, y2 = num() + oy, ex = num() + ox, ey = num() + oy;
        flatCubic(cur, matApply(m, x, y), matApply(m, x1, y1), matApply(m, x2, y2), matApply(m, ex, ey), 0);
        cx = x2; cy = y2; x = ex; y = ey;
      } else if (C === 'Q' || C === 'T') {
        ensure();
        let x1, y1;
        if (C === 'Q') { x1 = num() + ox; y1 = num() + oy; }
        else { x1 = (prev === 'Q' || prev === 'T') ? 2 * x - qx : x; y1 = (prev === 'Q' || prev === 'T') ? 2 * y - qy : y; }
        const ex = num() + ox, ey = num() + oy;
        const a = [x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y)], b = [ex + 2 / 3 * (x1 - ex), ey + 2 / 3 * (y1 - ey)];
        flatCubic(cur, matApply(m, x, y), matApply(m, a[0], a[1]), matApply(m, b[0], b[1]), matApply(m, ex, ey), 0);
        qx = x1; qy = y1; x = ex; y = ey;
      } else if (C === 'A') {
        ensure();
        const rx = num(), ry = num(), rot = num() * Math.PI / 180, fa = num(), fs = num(), ex = num() + ox, ey = num() + oy;
        for (const q of arcPoints(x, y, rx, ry, rot, !!fa, !!fs, ex, ey)) cur.push(matApply(m, q[0], q[1]));
        x = ex; y = ey;
      } else { i++; }
      prev = C;
    }
    finish(false);
  }

  function parseAttrs(s) {
    const a = {}, re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(s))) a[m[1]] = m[2] !== undefined ? m[2] : m[3];
    return a;
  }
  function parseSVG(text) {
    const css = {};
    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let sm;
    while ((sm = styleRe.exec(text))) {
      const body = sm[1].replace(/<!\[CDATA\[|\]\]>/g, '');
      const ruleRe = /\.([\w-]+)\s*\{([^}]*)\}/g;
      let r;
      while ((r = ruleRe.exec(body))) css[r[1]] = (css[r[1]] || '') + ';' + r[2];
    }
    const fillOf = a => {
      let f = a.fill;
      const scan = s => { const m = /(?:^|;)\s*fill\s*:\s*([^;]+)/.exec(s || ''); if (m) f = m[1].trim(); };
      (a.class || '').split(/\s+/).forEach(c => scan(css[c]));
      scan(a.style);
      return f;
    };
    const res = { polys: [], open: 0 };
    const shapes = [], markers = [];
    let textCount = 0, imageCount = 0, useCount = 0;
    let page = null;
    const stack = [[1, 0, 0, 1, 0, 0]];
    let skip = 0;
    const SKIP = /^(defs|clipPath|mask|symbol|pattern|metadata|style|title|desc|marker|linearGradient|radialGradient)$/i;
    const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([a-zA-Z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
    let t;
    while ((t = tagRe.exec(text))) {
      if (!t[2]) continue;
      const closing = t[1] === '/', name = t[2].replace(/^.*:/, ''), selfClose = t[4] === '/';
      if (closing) {
        if (skip) { if (SKIP.test(name)) skip--; continue; }
        if (name === 'g' || name === 'svg' || name === 'a') stack.pop();
        continue;
      }
      if (skip) { if (SKIP.test(name) && !selfClose) skip++; continue; }
      if (SKIP.test(name)) { if (!selfClose) skip++; continue; }
      const a = parseAttrs(t[3] || '');
      const base = stack[stack.length - 1];
      const own = a.transform ? matMul(base, parseTransform(a.transform)) : base;
      if (name === 'svg') {
        let m = own;
        const vb = (a.viewBox || '').trim().split(/[\s,]+/).map(Number);
        const wmm = lengthMM(a.width), hmm = lengthMM(a.height);
        if (!page) {
          if (vb.length === 4 && vb[2] > 0) {
            const sx = wmm ? wmm / vb[2] : UNIT_MM.px, sy = hmm ? hmm / vb[3] : sx;
            m = matMul(matMul(m, [sx, 0, 0, sy, 0, 0]), [1, 0, 0, 1, -vb[0], -vb[1]]);
            page = { w: wmm || vb[2] * sx, h: hmm || vb[3] * sy };
          } else {
            const k = UNIT_MM.px;
            m = matMul(m, [k, 0, 0, k, 0, 0]);
            page = { w: wmm || 0, h: hmm || 0 };
          }
        }
        if (!selfClose) stack.push(m);
        continue;
      }
      if (name === 'g' || name === 'a') { if (!selfClose) stack.push(own); continue; }
      const num = k => parseFloat(a[k]) || 0;
      let local = { polys: [], open: 0 };
      if (name === 'path') pathToPolys(a.d || '', own, local);
      else if (name === 'rect') {
        const x = num('x'), y = num('y'), w = num('width'), h = num('height');
        local.polys.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(q => matApply(own, q[0], q[1])));
      } else if (name === 'circle' || name === 'ellipse') {
        const rx = name === 'circle' ? num('r') : num('rx'), ry = name === 'circle' ? num('r') : num('ry');
        const k = 0.5522847498, cx = num('cx'), cy = num('cy');
        const dd = `M${cx + rx} ${cy}C${cx + rx} ${cy + k * ry} ${cx + k * rx} ${cy + ry} ${cx} ${cy + ry}` +
          `C${cx - k * rx} ${cy + ry} ${cx - rx} ${cy + k * ry} ${cx - rx} ${cy}` +
          `C${cx - rx} ${cy - k * ry} ${cx - k * rx} ${cy - ry} ${cx} ${cy - ry}` +
          `C${cx + k * rx} ${cy - ry} ${cx + rx} ${cy - k * ry} ${cx + rx} ${cy}Z`;
        pathToPolys(dd, own, local);
      } else if (name === 'polygon' || name === 'polyline') {
        const v = (a.points || '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || [];
        const p = [];
        for (let i = 0; i + 1 < v.length; i += 2) p.push(matApply(own, +v[i], +v[i + 1]));
        if (p.length > 2) local.polys.push(p);
      } else if (name === 'text' || name === 'tspan') { if (name === 'text') textCount++; continue; }
      else if (name === 'image') { imageCount++; continue; }
      else if (name === 'use') { useCount++; continue; }
      else continue;
      const box = local.polys[0] && bboxOf(local.polys[0]);
      const isMarker = name === 'rect' && fillOf(a) === 'none' && box && box.x1 - box.x0 <= 120 && box.y1 - box.y0 <= 120;
      res.open += local.open;
      for (const p of local.polys) (isMarker ? markers : shapes).push(p);
    }
    // A rectangle drawn around the whole page is a frame, not something to cut.
    const pg = page || { w: 0, h: 0 };
    const isFrame = p => {
      if (!pg.w || !pg.h || p.length > 6) return false;
      const b = bboxOf(p);
      return b.x1 - b.x0 >= pg.w * 0.9 && b.y1 - b.y0 >= pg.h * 0.9;
    };
    const kept = shapes.filter(p => !isFrame(p));
    const frames = kept.length ? shapes.length - kept.length : 0;
    return { page: pg, shapes: frames ? kept : shapes, markers, open: res.open, textCount, imageCount, useCount, frames };
  }

  /* ---------- group contours into parts (outer + holes) ---------- */
  function cleanPoly(p) {
    const out = [];
    for (const q of p) {
      const l = out[out.length - 1];
      if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.01) out.push(q);
    }
    while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.01) out.pop();
    return out;
  }
  function contoursCross(A, B) {
    const ba = A.bbox, bb = B.bbox;
    const x0 = Math.max(ba.x0, bb.x0), x1 = Math.min(ba.x1, bb.x1), y0 = Math.max(ba.y0, bb.y0), y1 = Math.min(ba.y1, bb.y1);
    if (x0 > x1 || y0 > y1) return false;
    const pick = P => {
      const s = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        if (Math.max(a[0], b[0]) >= x0 && Math.min(a[0], b[0]) <= x1 && Math.max(a[1], b[1]) >= y0 && Math.min(a[1], b[1]) <= y1) s.push([a, b]);
      }
      return s;
    };
    const sa = pick(A.pts), sb = pick(B.pts);
    for (const p of sa) for (const q of sb) {
      if (Math.max(p[0][0], p[1][0]) < Math.min(q[0][0], q[1][0]) || Math.max(q[0][0], q[1][0]) < Math.min(p[0][0], p[1][0])) continue;
      if (segCross(p[0], p[1], q[0], q[1])) return true;
    }
    return false;
  }
  // Returns parts [{outer, holes, area, bbox}] plus issue counts.
  function buildParts(polys) {
    const list = [];
    let tiny = 0, dupes = 0;
    const seen = new Map();
    for (const raw of polys) {
      const pts = cleanPoly(raw);
      if (pts.length < 3) continue;
      const area = Math.abs(polyArea(pts));
      if (area < 1) { tiny++; continue; }
      const bbox = bboxOf(pts);
      const key = [bbox.x0, bbox.y0, bbox.x1, bbox.y1, area].map(v => Math.round(v * 2)).join('|');
      if (seen.has(key)) { dupes++; continue; }
      seen.set(key, 1);
      list.push({ pts, area, bbox, parent: -1, depth: 0 });
    }
    list.sort((a, b) => b.area - a.area);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      for (let j = i - 1; j >= 0; j--) { // smallest enclosing contour first
        const p = list[j], b = p.bbox;
        if (c.bbox.x0 < b.x0 || c.bbox.x1 > b.x1 || c.bbox.y0 < b.y0 || c.bbox.y1 > b.y1) continue;
        if (pointInPoly(c.pts[0], p.pts)) { c.parent = j; c.depth = p.depth + 1; break; }
      }
    }
    // Overlapping (not welded) contours must stay together as one piece.
    const uf = list.map((_, i) => i);
    const find = i => { while (uf[i] !== i) i = uf[i] = uf[uf[i]]; return i; };
    let overlaps = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (contoursCross(list[i], list[j])) {
        overlaps++;
        const a = list[i].depth % 2 ? list[i].parent : i, b = list[j].depth % 2 ? list[j].parent : j;
        uf[find(a)] = find(b);
      }
    }
    const byRoot = new Map();
    list.forEach((c, i) => {
      if (c.depth % 2 === 0) {
        const r = find(i);
        if (!byRoot.has(r)) byRoot.set(r, { contours: [], holes: [] });
        byRoot.get(r).contours.push(c.pts);
      }
    });
    list.forEach(c => {
      if (c.depth % 2 === 1) byRoot.get(find(c.parent)).holes.push(c.pts);
    });
    const parts = [];
    for (const g of byRoot.values()) {
      const all = g.contours.concat(g.holes);
      const bb = bboxOf([].concat(...g.contours));
      const area = g.contours.reduce((s, p) => s + Math.abs(polyArea(p)), 0) - g.holes.reduce((s, p) => s + Math.abs(polyArea(p)), 0);
      parts.push({ outers: g.contours, holes: g.holes, all, area, bbox: bb });
    }
    return { parts, tiny, dupes, overlaps };
  }

  /* ---------- raster nesting ---------- */
  // Shape raster: rows of [x0,x1) spans, one list per row, relative to the rotated bbox.
  function rotatePart(part, deg) {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const rot = q => [q[0] * c - q[1] * s, q[0] * s + q[1] * c];
    const outers = part.outers.map(p => p.map(rot));
    const bb = bboxOf([].concat(...outers));
    return { outers, bbox: bb, deg };
  }
  function rasterize(outers, bb, cell) {
    const w = Math.ceil((bb.x1 - bb.x0) / cell) + 1, h = Math.ceil((bb.y1 - bb.y0) / cell) + 1;
    const g = new Uint8Array(w * h);
    for (const poly of outers) {
      const P = poly.map(q => [(q[0] - bb.x0) / cell, (q[1] - bb.y0) / cell]);
      // boundary (conservative)
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) + 1;
        for (let k = 0; k <= n; k++) {
          const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
          g[Math.min(h - 1, y | 0) * w + Math.min(w - 1, x | 0)] = 1;
        }
      }
      // interior (even-odd at row centres); holes are treated as solid for nesting
      for (let row = 0; row < h; row++) {
        const y = row + 0.5, xs = [];
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
          const a = P[i], b = P[j];
          if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          for (let x = Math.max(0, xs[i] | 0); x <= Math.min(w - 1, xs[i + 1] | 0); x++) g[row * w + x] = 1;
        }
      }
    }
    const rows = [];
    for (let y = 0; y < h; y++) {
      const spans = [];
      for (let x = 0; x < w; x++) {
        if (g[y * w + x]) { const s = x; while (x < w && g[y * w + x]) x++; spans.push([s, x]); }
      }
      rows.push(spans);
    }
    return { w, h, rows };
  }
  // Dilates by a disc: `solid` is what others must avoid, `reach` is what must stay clear.
  function dilate(r, rad) {
    const out = new Map();
    for (let y = 0; y < r.h; y++) for (const sp of r.rows[y]) {
      for (let dy = -rad; dy <= rad; dy++) {
        const hw = Math.floor(Math.sqrt(rad * rad - dy * dy));
        const yy = y + dy;
        if (!out.has(yy)) out.set(yy, []);
        out.get(yy).push([sp[0] - hw, sp[1] + hw]);
      }
    }
    const spans = [];
    for (const [yy, list] of out) {
      list.sort((a, b) => a[0] - b[0]);
      let c = null;
      for (const s of list) {
        if (c && s[0] <= c[1]) c[1] = Math.max(c[1], s[1]);
        else { if (c) spans.push(yy, c[0], c[1]); c = [s[0], s[1]]; }
      }
      if (c) spans.push(yy, c[0], c[1]);
    }
    // Longest spans first: a blocked position then fails on the first few checks.
    const order = [];
    for (let i = 0; i < spans.length; i += 3) order.push(i);
    order.sort((p, q) => (spans[q + 2] - spans[q + 1]) - (spans[p + 2] - spans[p + 1]));
    const sorted = new Int32Array(spans.length);
    order.forEach((from, k) => { sorted[k * 3] = spans[from]; sorted[k * 3 + 1] = spans[from + 1]; sorted[k * 3 + 2] = spans[from + 2]; });
    return sorted;
  }
  function solidSpans(r) {
    const s = [];
    for (let y = 0; y < r.h; y++) for (const sp of r.rows[y]) s.push(y, sp[0], sp[1]);
    return Int32Array.from(s);
  }

  class SheetGrid {
    constructor(W, H) {
      this.W = W; this.H = H;
      this.g = new Uint8Array(W * H);
      this.pre = new Int32Array((W + 1) * H);
      this.placed = [];
      this.failed = new Set(); // shapes known not to fit; a sheet only ever gets fuller
      this.used = 0;
    }
    block(x0, y0, x1, y1) {
      for (let y = Math.max(0, y0); y < Math.min(this.H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(this.W, x1); x++) this.g[y * this.W + x] = 1;
      this.refresh();
    }
    refresh() {
      const { W, H, g, pre } = this;
      for (let y = 0; y < H; y++) {
        let s = 0;
        const off = y * (W + 1), goff = y * W;
        pre[off] = 0;
        for (let x = 0; x < W; x++) { s += g[goff + x]; pre[off + x + 1] = s; }
      }
    }
    free(reach, ox, oy) {
      const { W, H, pre } = this, L = W + 1;
      for (let i = 0; i < reach.length; i += 3) {
        const y = reach[i] + oy;
        if (y < 0 || y >= H) continue;
        let a = reach[i + 1] + ox, b = reach[i + 2] + ox;
        if (a < 0) a = 0; if (b > W) b = W;
        if (a >= b) continue;
        const off = y * L;
        if (pre[off + b] !== pre[off + a]) return false;
      }
      return true;
    }
    stamp(solid, ox, oy) {
      const { W, H, g } = this;
      for (let i = 0; i < solid.length; i += 3) {
        const y = solid[i] + oy;
        if (y < 0 || y >= H) continue;
        const a = Math.max(0, solid[i + 1] + ox), b = Math.min(W, solid[i + 2] + ox);
        for (let x = a; x < b; x++) g[y * W + x] = 1;
      }
      this.refresh();
    }
  }

  // Copies of one design share the same part object, so each shape is rasterized once.
  async function makeVariants(parts, anglesOf, cell, gap, tick) {
    const rad = Math.ceil(gap / cell + 1.0);
    const memo = new Map(), out = [];
    let lastTick = Date.now();
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (tick && Date.now() - lastTick > 150) { await tick(); lastTick = Date.now(); }
      const angles = anglesOf(i);
      const key = angles.join();
      if (!memo.has(p)) memo.set(p, new Map());
      const byAngles = memo.get(p);
      if (!byAngles.has(key)) {
        byAngles.set(key, angles.map(deg => {
          const rp = rotatePart(p, deg);
          const r = rasterize(rp.outers, rp.bbox, cell);
          return { deg, bbox: rp.bbox, w: r.w, h: r.h, solid: solidSpans(r), reach: dilate(r, rad) };
        }));
      }
      out.push(byAngles.get(key));
    }
    return out;
  }

  // One greedy pass over `order` (part indexes): first sheet that fits, earliest spot in it.
  // cfg.rows fills rows from Y0, leaving a full-width strip on the clamped side;
  // otherwise it fills columns from X0, leaving a full-height strip on the right.
  // `tick` runs now and then so a long pass never freezes the page.
  async function greedyPass(order, variants, cfg, tick) {
    let lastTick = Date.now();
    const sheets = [], unplaced = [];
    const newSheet = () => {
      const s = new SheetGrid(cfg.W, cfg.H);
      if (cfg.startCells) s.block(0, 0, cfg.startCells.w, cfg.startCells.h);
      for (const z of cfg.zoneCells) s.block(z.x0, z.y0, z.x1, z.y1);
      sheets.push(s);
      return s;
    };
    const m = cfg.marginCells;
    const tryPlace = (s, vs) => {
      let best = null;
      for (const v of vs) {
        const xMax = cfg.W - m - v.w, yMax = cfg.H - m - v.h;
        const mainMax = cfg.rows ? yMax : xMax, crossMax = cfg.rows ? xMax : yMax, size = cfg.rows ? v.h : v.w;
        for (let a = m; a <= mainMax; a++) {
          if (best && a + size * cfg.sizeBias >= best.score) break;
          let found = false;
          for (let k = 0; k <= crossMax - m; k++) {
            const c = cfg.flip ? crossMax - k : m + k;
            const x = cfg.rows ? c : a, y = cfg.rows ? a : c;
            if (s.free(v.reach, x, y)) {
              const score = a + size * cfg.sizeBias;
              if (!best || score < best.score) best = { x, y, v, score };
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
      return best;
    };
    for (const idx of order) {
      const vs = variants[idx];
      let done = false;
      for (const s of sheets.length ? sheets : [newSheet()]) {
        if (s.failed.has(vs)) continue;
        if (tick && Date.now() - lastTick > 150) { await tick(); lastTick = Date.now(); }
        const b = tryPlace(s, vs);
        if (b) { commit(s, idx, b); done = true; break; }
        s.failed.add(vs);
      }
      if (done) continue;
      const s = newSheet();
      const b = tryPlace(s, vs);
      if (b) commit(s, idx, b);
      else { sheets.pop(); unplaced.push(idx); }
    }
    function commit(s, idx, b) {
      s.stamp(b.v.solid, b.x, b.y);
      s.placed.push({ idx, x: b.x, y: b.y, deg: b.v.deg, bbox: b.v.bbox });
      s.used = Math.max(s.used, cfg.rows ? b.y + b.v.h : b.x + b.v.w);
    }
    return { sheets: sheets.filter(s => s.placed.length), unplaced };
  }

  function placedPart(part, pl, cell) {
    const r = pl.deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const ox = pl.x * cell - pl.bbox.x0, oy = pl.y * cell - pl.bbox.y0;
    const tf = q => [q[0] * c - q[1] * s + ox, q[0] * s + q[1] * c + oy];
    return { outers: part.outers.map(p => p.map(tf)), holes: part.holes.map(p => p.map(tf)), area: part.area, src: part.src };
  }

  // Runs nesting passes; `onProgress` may return a promise so the page can repaint.
  async function nest(parts, opts, onProgress) {
    const o = Object.assign({ sheetW: 1000, sheetH: 480, gap: 5, margin: 8, angles: [0, 90, 180, 270], cell: 3, fineCell: 1.25, seconds: 6, startBox: null, zones: [], fill: 'rows' }, opts);
    const grow = Math.max(1, Math.sqrt(o.sheetW * o.sheetH / 480000)); // big sheets get a coarser grid
    const coarseCell = o.cell * grow, fineCell = o.fineCell * grow;
    const mkCfg = cell => ({
      W: Math.floor(o.sheetW / cell), H: Math.floor(o.sheetH / cell),
      marginCells: Math.ceil(o.margin / cell),
      startCells: o.startBox ? { w: Math.ceil((o.startBox.x + o.startBox.w + o.gap) / cell) + 1, h: Math.ceil((o.startBox.y + o.startBox.h + o.gap) / cell) + 1 } : null,
      zoneCells: o.zones.map(z => ({ x0: Math.floor(z.x / cell), y0: Math.floor(z.y / cell), x1: Math.ceil((z.x + z.w) / cell), y1: Math.ceil((z.y + z.h) / cell) })),
      sizeBias: 1, flip: false, rows: o.fill !== 'columns'
    });
    const t0 = Date.now();
    let best = null, pass = 0;
    const tell = (stage, sheets) => onProgress ? onProgress({ stage, pass, sheets, t: Math.min(1, (Date.now() - t0) / 1000 / o.seconds) }) : null;
    const coarse = await makeVariants(parts, () => o.angles, coarseCell, o.gap, () => tell('search', 0));
    const cfg = mkCfg(coarseCell);
    const area = parts.map(p => (p.bbox.x1 - p.bbox.x0) * (p.bbox.y1 - p.bbox.y0));
    const base = parts.map((_, i) => i).sort((a, b) => area[b] - area[a]);
    let rng = 12345;
    const rand = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296;
    while (pass === 0 || Date.now() - t0 < o.seconds * 1000) {
      const order = base.slice();
      if (pass) { // jitter the big-first order, more strongly as passes go on
        const jitter = 0.05 + rand() * 0.45;
        const key = new Map(order.map(i => [i, area[i] * (1 + (rand() - 0.5) * 2 * jitter)]));
        order.sort((a, b) => key.get(b) - key.get(a));
      }
      cfg.flip = pass % 3 === 2;
      cfg.sizeBias = pass % 2 ? 1 : 0.6;
      const r = await greedyPass(order, coarse, cfg, () => tell('search', best ? best.r.sheets.length : 0));
      const last = r.sheets[r.sheets.length - 1];
      const score = r.unplaced.length * 1e7 + r.sheets.length * 1e5 + (last ? last.used / (cfg.rows ? cfg.H : cfg.W) * 1e4 : 0);
      if (!best || score < best.score) best = { score, r, flip: cfg.flip, bias: cfg.sizeBias };
      pass++;
      await tell('search', best.r.sheets.length);
    }
    // Tighten each sheet on a finer grid with its own parts and angles; a sheet that does not refit stays as found.
    const chosen = new Array(parts.length).fill(0);
    best.r.sheets.forEach(s => s.placed.forEach(pl => { chosen[pl.idx] = pl.deg; }));
    await tell('fine', best.r.sheets.length);
    const fine = await makeVariants(parts, i => [chosen[i]], fineCell, o.gap, () => tell('fine', best.r.sheets.length));
    const fcfg = mkCfg(fineCell);
    fcfg.flip = best.flip; fcfg.sizeBias = best.bias;
    const sheets = [];
    for (const s of best.r.sheets) {
      const rf = await greedyPass(s.placed.map(pl => pl.idx), fine, fcfg, () => tell('fine', best.r.sheets.length));
      const ok = rf.sheets.length === 1 && !rf.unplaced.length;
      const src = ok ? rf.sheets[0] : s, cell = ok ? fineCell : coarseCell;
      sheets.push(src.placed.map(pl => placedPart(parts[pl.idx], pl, cell)));
    }
    // The coarse grid rounds sizes up, so a part close to sheet size gets one more try on the fine grid.
    let unplaced = best.r.unplaced;
    if (unplaced.length) {
      const wanted = new Set(unplaced);
      const big = await makeVariants(parts, i => wanted.has(i) ? o.angles : [], fineCell, o.gap);
      const rb = await greedyPass(unplaced, big, fcfg);
      rb.sheets.forEach(s => sheets.push(s.placed.map(pl => placedPart(parts[pl.idx], pl, fineCell))));
      unplaced = rb.unplaced;
    }
    return { sheets, unplaced, passes: pass };
  }

  /* ---------- single-stroke path ---------- */
  function nearestPair(A, B, blocked) {
    let best = Infinity, ia = 0, ib = 0;
    const P = A.pts, Q = B.pts;
    for (let i = 0; i < P.length; i++) {
      const x = P[i][0], y = P[i][1];
      for (let j = 0; j < Q.length; j++) {
        const dx = x - Q[j][0], dy = y - Q[j][1], d = dx * dx + dy * dy;
        if (d < best && !(blocked && blocked(P[i], Q[j]))) { best = d; ia = i; ib = j; }
      }
    }
    return { d: Math.sqrt(best), ia, ib };
  }
  function boxGap(a, b) {
    const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1), dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
    return Math.hypot(dx, dy);
  }
  // Links every contour into one tree (shortest links first) and walks it as one continuous stroke.
  function buildStroke(items, start, zones = []) {
    const nodes = [];
    const rootPts = start.box
      ? [[start.box.x, start.box.y], [start.box.x + start.box.w, start.box.y], [start.box.x + start.box.w, start.box.y + start.box.h], [start.box.x, start.box.y + start.box.h]]
      : [[start.x || 0, start.y || 0]];
    nodes.push({ pts: start.box ? densify(rootPts, DENSIFY) : rootPts, part: -1, hole: false, bbox: bboxOf(rootPts), root: true });
    items.forEach((it, pi) => {
      for (const c of it.outers) { const pts = densify(c, DENSIFY); nodes.push({ pts, part: pi, hole: false, bbox: bboxOf(pts) }); }
      for (const c of it.holes) { const pts = densify(c, DENSIFY); nodes.push({ pts, part: pi, hole: true, bbox: bboxOf(pts) }); }
    });
    const N = nodes.length;
    const uf = nodes.map((_, i) => i);
    const find = i => { while (uf[i] !== i) i = uf[i] = uf[uf[i]]; return i; };
    const allowed = (a, b) => {
      const A = nodes[a], B = nodes[b];
      if (A.hole && B.hole) return false;
      if (!A.hole && !B.hole) return true;
      const hole = A.hole ? A : B, other = A.hole ? B : A;
      return hole.part === other.part || (other.pts.length > 1 && pointInPoly(other.pts[0], hole.pts));
    };
    const cache = new Map();
    const crossesZone = (p, q) => zones.some(z => segHitsRect(p, q, z));
    const pairOf = (a, b) => {
      const lo = Math.min(a, b), hi = Math.max(a, b), k = lo * N + hi;
      if (!cache.has(k)) {
        let r = nearestPair(nodes[lo], nodes[hi]);
        if (zones.length && crossesZone(nodes[lo].pts[r.ia], nodes[hi].pts[r.ib])) {
          const around = nearestPair(nodes[lo], nodes[hi], crossesZone);
          // A link that must cross a corner stays only as the very last resort.
          r = isFinite(around.d) ? around : { d: r.d + 1e6, ia: r.ia, ib: r.ib };
        }
        cache.set(k, { a: lo, b: hi, d: r.d, ia: r.ia, ib: r.ib });
      }
      return cache.get(k);
    };
    // Boruvka: each component takes its true nearest neighbour, using bbox gaps to skip far pairs.
    const links = [];
    let comps = N;
    while (comps > 1) {
      const bestOf = new Map();
      for (let i = 0; i < N; i++) {
        const ri = find(i);
        const cand = [];
        for (let j = 0; j < N; j++) {
          if (j !== i && find(j) !== ri && allowed(i, j)) cand.push([boxGap(nodes[i].bbox, nodes[j].bbox), j]);
        }
        cand.sort((p, q) => p[0] - q[0]);
        let cur = bestOf.get(ri);
        for (const [g, j] of cand) {
          if (cur && g >= cur.d) break;
          const pr = pairOf(i, j);
          if (!cur || pr.d < cur.d) { cur = pr; bestOf.set(ri, pr); }
        }
      }
      if (!bestOf.size) break;
      for (const pr of bestOf.values()) {
        const ra = find(pr.a), rb = find(pr.b);
        if (ra !== rb) { uf[ra] = rb; links.push(pr); comps--; }
      }
    }
    const adj = nodes.map(() => []);
    for (const l of links) {
      adj[l.a].push({ to: l.b, at: l.ia, there: l.ib });
      adj[l.b].push({ to: l.a, at: l.ib, there: l.ia });
    }
    const path = [], bridges = [];
    const seen = new Uint8Array(N);
    const walk = (n, from) => {
      seen[n] = 1;
      const P = nodes[n].pts, L = P.length;
      const at = new Map();
      for (const e of adj[n]) {
        if (e.to === from) continue;
        if (!at.has(e.at)) at.set(e.at, []);
        at.get(e.at).push(e);
      }
      const startIdx = walk.entry;
      for (let k = 0; k < L; k++) {
        const idx = (startIdx + k) % L;
        path.push(P[idx]);
        const list = at.get(idx);
        if (list) for (const e of list) {
          bridges.push([P[idx], nodes[e.to].pts[e.there]]);
          walk.entry = e.there;
          walk(e.to, n);
          path.push(P[idx]);
        }
      }
      path.push(P[startIdx]);
    };
    walk.entry = 0;
    walk(0, -1);
    const unlinked = seen.reduce((s, v) => s + (v ? 0 : 1), 0);
    return { path: simplifyPath(path), bridges, unlinked };
  }
  function simplifyPath(path) {
    const R = q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100];
    const out = [];
    for (const raw of path) {
      const q = R(raw);
      const n = out.length;
      if (n && out[n - 1][0] === q[0] && out[n - 1][1] === q[1]) continue;
      if (n > 1) {
        const a = out[n - 2], b = out[n - 1];
        const cross = (b[0] - a[0]) * (q[1] - b[1]) - (b[1] - a[1]) * (q[0] - b[0]);
        const dot = (b[0] - a[0]) * (q[0] - b[0]) + (b[1] - a[1]) * (q[1] - b[1]);
        if (Math.abs(cross) < 1e-6 && dot > 0) { out[n - 1] = q; continue; }
      }
      out.push(q);
    }
    return out;
  }
  const pathLength = p => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };

  /* ---------- output ---------- */
  function toTAP(path, o) {
    const pad = (s, n) => (s + '          ').slice(0, Math.max(n, s.length));
    const nStr = n => ('00000' + n).slice(-Math.max(5, String(n).length));
    const body = [];
    let n = 20;
    for (const q of path) {
      const x = q[0].toFixed(2);
      body.push(`N${nStr(n)} G1 X${x.length < 7 ? pad(x, 7) : x + ' '}Y${q[1].toFixed(2)} `);
      n += 10;
    }
    const tail = [];
    if (o.m5) { tail.push(`N${nStr(n)} M5`); n += 10; }
    tail.push(`N${nStr(n)}           `);
    const name = String(o.name || 'sheet').replace(/[^\x20-\x7e]/g, '').replace(/[()]/g, '');
    const lines = body.length + tail.length + 5;
    return [`('${name}'. ${lines} lines of G-Code created on ${o.date || ''} by FoamNest.)`, ' ',
      `N00000 F${o.feed}`, `N00010 M3 S${o.power}`, ' ']
      .concat(body, tail, ['(EOF)', '']).join('\r\n');
  }
  function toSVG(items, sheetW, sheetH, startBox) {
    const f = v => (v / 10).toFixed(5);
    const d = P => 'M' + P.map(q => f(q[0]) + ' ' + f(q[1])).join('L') + 'z';
    const paths = items.map(it => `  <path class="fil0" d="${it.outers.concat(it.holes).map(d).join('')}"/>`);
    if (startBox) paths.push(`  <rect class="fil1 str0" x="${f(startBox.x)}" y="${f(startBox.y)}" width="${f(startBox.w)}" height="${f(startBox.h)}"/>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${sheetW / 10}cm" height="${sheetH / 10}cm" version="1.1" style="fill-rule:evenodd; clip-rule:evenodd" viewBox="0 0 ${sheetW / 10} ${sheetH / 10}">\n <defs>\n  <style type="text/css">\n   <![CDATA[\n    .str0 {stroke:#373435;stroke-width:0.01764;stroke-miterlimit:2.61313}\n    .fil1 {fill:none}\n    .fil0 {fill:#373435;fill-rule:evenodd}\n   ]]>\n  </style>\n </defs>\n <g id="Layer_x0020_1">\n${paths.join('\n')}\n </g>\n</svg>\n`;
  }
  // Store-only ZIP so several .tap/.svg files download as one.
  function makeZip(files) {
    const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
    const crc = b => { let c = -1; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
    const enc = new TextEncoder(), chunks = [], central = [];
    const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), c = crc(data);
      const head = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c), u32(data.length), u32(data.length), u16(name.length), u16(0));
      const local = new Uint8Array([0x50, 0x4b, 3, 4].concat(head));
      chunks.push(local, name, data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2].concat(u16(20), head, u16(0), u16(0), u16(0), u32(0), u32(off))), name);
      off += local.length + name.length + data.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 5, 6].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(off), u16(0)));
    return new Blob(chunks.concat(central, [end]), { type: 'application/zip' });
  }

  const api = { parseSVG, buildParts, nest, buildStroke, pathLength, toTAP, toSVG, makeZip, polyArea, bboxOf, pointInPoly, segCross, segHitsRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FoamEngine = api;
})(typeof self !== 'undefined' ? self : this);
