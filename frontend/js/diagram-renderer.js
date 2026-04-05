/**
 * diagram-renderer.js
 * Read-only canvas renderer for automata returned by the API.
 * Renders states as circles, final states as double circles,
 * start state with an incoming arrow. Uses circular auto-layout.
 *
 * Exposes: DiagramRenderer.render(canvas, automatonData)
 *   automatonData: { states, start_state, final_states, edges }
 *   edges: [{ from, symbol, to }]
 */

'use strict';

const DiagramRenderer = (() => {

  const R = 26;
  const ARROW_SIZE = 8;
  const PADDING = 70;

  function render(canvas, data) {
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth || 600;
    const H = canvas.height = canvas.offsetHeight || 360;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const { states, start_state, final_states, edges } = data;

    if (!states || states.length === 0) {
      ctx.fillStyle = '#aaa';
      ctx.font = '13px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No diagram data', W / 2, H / 2);
      return;
    }

    const pos = _layout(states, W, H);
    const groups = _groupEdges(edges || []);

    groups.forEach(g => _drawEdge(ctx, g, pos, groups));

    states.forEach(name => {
      _drawState(ctx, name, pos[name], {
        isStart: name === start_state,
        isFinal: (final_states || []).includes(name),
        isDead: name === '\u2205'
      });
    });
  }

  // ── Layout ────────────────────────────────────────────────────────────
  function _layout(states, W, H) {
    const pos = {};
    const n = states.length;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) / 2 - PADDING;

    if (n === 1) {
      pos[states[0]] = { x: cx, y: cy };
    } else if (n <= 5) {
      const totalW = n * (R * 2 + 36) - 36;
      const startX = (W - totalW) / 2 + R;
      states.forEach((name, i) => {
        pos[name] = { x: startX + i * (R * 2 + 36), y: cy };
      });
    } else {
      states.forEach((name, i) => {
        const angle = (2 * Math.PI * i / n) - Math.PI / 2;
        pos[name] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
      });
    }
    return pos;
  }

  // ── Edge grouping ─────────────────────────────────────────────────────
  function _groupEdges(edges) {
    const map = new Map();
    edges.forEach(e => {
      const key = e.from + '\u2192' + e.to;
      if (!map.has(key)) map.set(key, { from: e.from, to: e.to, symbols: [] });
      const g = map.get(key);
      if (!g.symbols.includes(e.symbol)) g.symbols.push(e.symbol);
    });
    return Array.from(map.values());
  }

  function _hasReverse(groups, from, to) {
    return groups.some(g => g.from === to && g.to === from);
  }

  // ── Edge drawing ──────────────────────────────────────────────────────
  function _drawEdge(ctx, group, pos, allGroups) {
    const fp = pos[group.from];
    const tp = pos[group.to];
    if (!fp || !tp) return;

    const label = group.symbols.join(', ');
    ctx.strokeStyle = '#333';
    ctx.fillStyle = '#333';
    ctx.lineWidth = 1;

    if (group.from === group.to) {
      _drawSelfLoop(ctx, fp.x, fp.y, label);
      return;
    }

    if (_hasReverse(allGroups, group.from, group.to)) {
      // ── FIX: compute the perpendicular from the CANONICAL direction
      // (smaller name → larger name), so both directions get opposite offsets.
      const canonical = group.from < group.to;
      // Canonical direction: always from lex-smaller to lex-larger
      const cfp = canonical ? fp : tp;
      const ctp = canonical ? tp : fp;

      const cdx = ctp.x - cfp.x;
      const cdy = ctp.y - cfp.y;
      const clen = Math.sqrt(cdx * cdx + cdy * cdy);
      if (clen < 1) return;

      // Perpendicular to canonical direction (rotated 90° CCW)
      const cnx = -cdy / clen;
      const cny =  cdx / clen;

      // Canonical direction curves to +normal, reverse curves to -normal
      const dir = canonical ? 1 : -1;
      const offset = 40;

      const mx = (fp.x + tp.x) / 2;
      const my = (fp.y + tp.y) / 2;
      const cpx = mx + cnx * offset * dir;
      const cpy = my + cny * offset * dir;

      // Exit fp toward cp, enter tp from cp
      const ang1 = Math.atan2(cpy - fp.y, cpx - fp.x);
      const ang2 = Math.atan2(cpy - tp.y, cpx - tp.x);
      const sx = fp.x + Math.cos(ang1) * R;
      const sy = fp.y + Math.sin(ang1) * R;
      const ex = tp.x + Math.cos(ang2) * R;
      const ey = tp.y + Math.sin(ang2) * R;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cpx, cpy, ex, ey);
      ctx.stroke();

      // Arrowhead tangent at t=1: direction from cp toward endpoint
      _arrowHead(ctx, ex, ey, Math.atan2(ey - cpy, ex - cpx));

      // Label at Bezier midpoint, nudged outward
      const lx = 0.25 * sx + 0.5 * cpx + 0.25 * ex;
      const ly = 0.25 * sy + 0.5 * cpy + 0.25 * ey;
      _edgeLabel(ctx, label, lx + cnx * 14 * dir, ly + cny * 14 * dir);

    } else {
      const dx = tp.x - fp.x;
      const dy = tp.y - fp.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;

      const x1 = fp.x + ux * R;
      const y1 = fp.y + uy * R;
      const x2 = tp.x - ux * R;
      const y2 = tp.y - uy * R;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      _arrowHead(ctx, x2, y2, Math.atan2(y2 - y1, x2 - x1));
      _edgeLabel(ctx, label, (x1 + x2) / 2 - ny * 12, (y1 + y2) / 2 - nx * 12);
    }
  }

  // Self-loop: cubic Bezier anchored on circle rim, label inside the arch.
  function _drawSelfLoop(ctx, x, y, label) {
    const loopH = 46;
    const loopW = 24;

    // Anchor points on circle surface, symmetrically left/right of top
    const startAngle = -Math.PI / 2 - 0.42;
    const endAngle   = -Math.PI / 2 + 0.42;
    const x1 = x + R * Math.cos(startAngle);
    const y1 = y + R * Math.sin(startAngle);
    const x2 = x + R * Math.cos(endAngle);
    const y2 = y + R * Math.sin(endAngle);

    // Control points fan outward and upward
    const cp1x = x - loopW, cp1y = y - R - loopH;
    const cp2x = x + loopW, cp2y = y - R - loopH;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    ctx.strokeStyle = '#333';
    ctx.stroke();

    // Arrowhead: tangent at t=1 = direction from cp2 to endpoint
    _arrowHead(ctx, x2, y2, Math.atan2(y2 - cp2y, x2 - cp2x));

    // Label: place it at the visual apex of the arch (between cp1 and cp2)
    _edgeLabel(ctx, label, x, y - R - loopH * 0.75);
  }

  function _arrowHead(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-ARROW_SIZE, -ARROW_SIZE / 2);
    ctx.lineTo(-ARROW_SIZE, ARROW_SIZE / 2);
    ctx.closePath();
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.restore();
  }

  function _edgeLabel(ctx, text, x, y) {
    ctx.save();
    ctx.font = '11px "Courier New", monospace';
    const w = ctx.measureText(text).width + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(x - w / 2, y - 8, w, 16);
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ── State drawing ─────────────────────────────────────────────────────
  function _drawState(ctx, name, pos, { isStart, isFinal, isDead }) {
    if (!pos) return;
    const { x, y } = pos;

    if (isFinal) {
      ctx.beginPath();
      ctx.arc(x, y, R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = isDead ? '#f0f0f0' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = isDead ? '#bbb' : '#333';
    ctx.lineWidth = isDead ? 1 : 1.5;
    ctx.stroke();

    ctx.fillStyle = isDead ? '#aaa' : '#111';
    ctx.font = `bold ${name.length > 5 ? 10 : 12}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y);

    if (isStart) {
      const len = 28;
      const ax = x - R - len;
      ctx.beginPath();
      ctx.moveTo(ax, y);
      ctx.lineTo(x - R, y);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      _arrowHead(ctx, x - R, y, 0);
    }
  }

  return { render };

})();