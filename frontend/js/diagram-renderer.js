'use strict';

const DiagramRenderer = (() => {

  const R          = 28;
  const ARROW_SIZE = 8;
  const SELF_LOOP_H = 50;

  function render(canvas, data) {
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    const W   = canvas.width  = canvas.offsetWidth  || canvas.parentElement?.clientWidth  || 700;
    const H   = canvas.height = canvas.offsetHeight || 380;

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

    const edgeObjs  = _dedupEdges(edges || []);
    const stateObjs = _layout(states, start_state, final_states || [], edgeObjs, W, H);
    const groups    = _groupEdges(edgeObjs);

    groups.forEach(g => _drawEdge(ctx, g, stateObjs, groups));
    stateObjs.forEach(s => _drawState(ctx, s));
  }

  function _dedupEdges(edges) {
    const seen = new Set();
    return edges.filter(e => {
      const k = e.from + '\x00' + e.symbol + '\x00' + e.to;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }

  function _groupEdges(edges) {
    const map = new Map();
    edges.forEach(e => {
      const k = e.from + '\u2192' + e.to;
      if (!map.has(k)) map.set(k, { from: e.from, to: e.to, symbols: [] });
      const g = map.get(k);
      if (!g.symbols.includes(e.symbol)) g.symbols.push(e.symbol);
    });
    return Array.from(map.values());
  }

  function _layout(names, startState, finalStates, edges, W, H) {
    const n   = names.length;
    const pos = {};

    // ONLY vertical offset (no shrinking)
    const PAD_TOP = R + SELF_LOOP_H + 16;

    const cx = W / 2;
    const cy = (H / 2) + (PAD_TOP / 2);

    if (n === 1) {
      pos[names[0]] = { x: cx, y: cy };

    } else if (n === 2) {
      pos[names[0]] = { x: cx - 110, y: cy };
      pos[names[1]] = { x: cx + 110, y: cy };

    } else if (n <= 4) {
      const r = Math.min(W, H) / 2 - 70;
      _circular(names, cx, cy, r, pos);

    } else if (n <= 6) {
      const order = _topoOrder(names, startState, edges) || names;
      if (_hasSkipEdges(order, edges, 1)) {
        const r = Math.min(W, H) / 2 - 70;
        _circular(names, cx, cy, r, pos);
      } else {
        _linearLayout(order, W, cy, pos);
      }

    } else {
      const r = Math.min(W, H) / 2 - 70;
      _circular(names, cx, cy, r, pos);
    }

    return names.map(name => ({
      name,
      x:       pos[name]?.x ?? cx,
      y:       pos[name]?.y ?? cy,
      isStart: name === startState,
      isFinal: finalStates.includes(name)
    }));
  }

  function _circular(names, cx, cy, r, out) {
    names.forEach((name, i) => {
      const angle = (2 * Math.PI * i / names.length) - Math.PI / 2;
      out[name] = {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle)
      };
    });
  }

  function _linearLayout(names, W, cy, out) {
    const n      = names.length;
    const maxLbl = Math.max(...names.map(nm => nm.length * 7));
    const cellW  = Math.max(R * 2, maxLbl) + 50;
    const totalW = n * cellW - 50;
    const startX = Math.max(R + 40, (W - totalW) / 2 + cellW / 2);

    names.forEach((name, i) => {
      out[name] = { x: startX + i * cellW, y: cy };
    });
  }

  function _hasSkipEdges(order, edges, maxSkip) {
    const idx = {};
    order.forEach((n, i) => { idx[n] = i; });
    return edges.some(e => {
      if (e.from === e.to) return false;
      const fi = idx[e.from], ti = idx[e.to];
      if (fi == null || ti == null) return false;
      return Math.abs(fi - ti) > maxSkip + 1;
    });
  }

  function _topoOrder(names, startState, edges) {
    if (!startState || !names.includes(startState)) return null;
    const adj = {};
    names.forEach(n => { adj[n] = []; });

    edges.forEach(e => {
      if (e.from !== e.to && adj[e.from] && !adj[e.from].includes(e.to))
        adj[e.from].push(e.to);
    });

    const visited = new Set();
    const order   = [];
    const queue   = [startState];

    while (queue.length) {
      const n = queue.shift();
      if (visited.has(n)) continue;
      visited.add(n); order.push(n);
      (adj[n] || []).forEach(nb => {
        if (!visited.has(nb)) queue.push(nb);
      });
    }

    names.forEach(n => {
      if (!visited.has(n)) order.push(n);
    });

    return order;
  }

  function _drawEdge(ctx, group, stateObjs, allGroups) {
    const fs = stateObjs.find(s => s.name === group.from);
    const ts = stateObjs.find(s => s.name === group.to);
    if (!fs || !ts) return;

    const label = group.symbols.slice().sort().join(', ');
    ctx.strokeStyle = '#333';
    ctx.fillStyle   = '#333';
    ctx.lineWidth   = 1.2;

    if (group.from === group.to) {
      _selfLoop(ctx, fs, label);
      return;
    }

    const hasReverse = allGroups.some(g =>
      g.from === group.to && g.to === group.from
    );

    if (hasReverse) {
      _curvedEdge(ctx, fs, ts, group.from < group.to ? 1 : -1, label);
    } else {
      _straightEdge(ctx, fs, ts, label);
    }
  }

  function _straightEdge(ctx, fs, ts, label) {
    const dx  = ts.x - fs.x, dy = ts.y - fs.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;
    const x1 = fs.x + ux * R,       y1 = fs.y + uy * R;
    const x2 = ts.x - ux * (R + 2), y2 = ts.y - uy * (R + 2);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    _arrow(ctx, x2, y2, Math.atan2(dy, dx));
    _label(ctx, label, (x1 + x2) / 2 - uy * 16, (y1 + y2) / 2 + ux * 16);
  }

  function _curvedEdge(ctx, fs, ts, dir, label) {
    const mx  = (fs.x + ts.x) / 2, my = (fs.y + ts.y) / 2;
    const dx  = ts.x - fs.x,       dy = ts.y - fs.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const nx  = (-dy / len) * 50 * dir;
    const ny  = (dx / len) * 50 * dir;
    const cpx = mx + nx, cpy = my + ny;

    const a1 = Math.atan2(cpy - fs.y, cpx - fs.x);
    const sx = fs.x + Math.cos(a1) * R;
    const sy = fs.y + Math.sin(a1) * R;

    const a2 = Math.atan2(cpy - ts.y, cpx - ts.x);
    const ex = ts.x + Math.cos(a2) * (R + 2);
    const ey = ts.y + Math.sin(a2) * (R + 2);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.stroke();

    _arrow(ctx, ex, ey, Math.atan2(ey - cpy, ex - cpx));

    const lx = 0.25*sx + 0.5*cpx + 0.25*ex + (-dy/len)*16*dir;
    const ly = 0.25*sy + 0.5*cpy + 0.25*ey + ( dx/len)*16*dir;
    _label(ctx, label, lx, ly);
  }

  function _selfLoop(ctx, state, label) {
    const x = state.x, y = state.y;
    const lh = SELF_LOOP_H, lw = 26;

    const x1 = x + R * Math.cos(-Math.PI / 2 - 0.4);
    const y1 = y + R * Math.sin(-Math.PI / 2 - 0.4);
    const x2 = x + R * Math.cos(-Math.PI / 2 + 0.4);
    const y2 = y + R * Math.sin(-Math.PI / 2 + 0.4);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x - lw, y - R - lh, x + lw, y - R - lh, x2, y2);
    ctx.stroke();

    _arrow(ctx, x2, y2, Math.atan2(y2 - (y - R - lh), x2 - (x + lw)));
    _label(ctx, label, x, y - R - lh * 0.85);
  }

  function _arrow(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-ARROW_SIZE, -ARROW_SIZE / 2);
    ctx.lineTo(-ARROW_SIZE,  ARROW_SIZE / 2);
    ctx.closePath();
    ctx.fillStyle = '#333';
    ctx.fill();

    ctx.restore();
  }

  function _label(ctx, text, x, y) {
    ctx.save();
    ctx.font = '12px "Courier New", monospace';
    const w = ctx.measureText(text).width + 8;

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(x - w / 2, y - 9, w, 18);

    ctx.fillStyle    = '#222';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);

    ctx.restore();
  }

  function _drawState(ctx, s) {
    if (s.isFinal) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const fontSize = s.name.length > 7 ? 8 : s.name.length > 5 ? 10 : 13;
    ctx.fillStyle    = '#111';
    ctx.font         = `bold ${fontSize}px "Courier New", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.name, s.x, s.y);

    if (s.isStart) {
      ctx.beginPath();
      ctx.moveTo(s.x - R - 30, s.y);
      ctx.lineTo(s.x - R, s.y);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      _arrow(ctx, s.x - R, s.y, 0);
    }
  }

  return { render };

})();