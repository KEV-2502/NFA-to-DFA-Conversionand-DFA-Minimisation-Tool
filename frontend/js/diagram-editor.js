/**
 * diagram-editor.js
 * Interactive canvas diagram editor for building automata visually.
 * Uses window.prompt() for all user input — no modals required.
 *
 * States: { name, x, y, isStart, isFinal }
 * Edges:  { from, to, symbol }
 *
 * Dispatches 'diagram-changed' CustomEvent on every mutation.
 * Exposes:
 *   DiagramEditor.init()
 *   DiagramEditor.getDiagramData()
 *   DiagramEditor.updateFromTuple(...)
 *   DiagramEditor.clear()
 *   DiagramEditor.render()
 */

'use strict';

const DiagramEditor = (() => {

  const R = 26;
  const ARROW_SIZE = 8;

  let canvas, ctx;
  let states = [];
  let edges  = [];
  let activeTool = 'add-state';

  // ── Init ─────────────────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('diagram-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);
    canvas.addEventListener('click', _onCanvasClick);
    _bindToolButtons();
    _setActiveTool('add-state');
    render();
  }

  function _resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width  = Math.max(rect.width - 36, 300);
    canvas.height = 380;
    render();
  }

  // ── Toolbar ──────────────────────────────────────────────────────────
  function _bindToolButtons() {
    document.getElementById('tool-add-state')?.addEventListener('click', () => _setActiveTool('add-state'));
    document.getElementById('tool-add-transition')?.addEventListener('click', _promptAddTransition);
    document.getElementById('tool-delete')?.addEventListener('click', () => _setActiveTool('delete'));
    document.getElementById('tool-clear')?.addEventListener('click', () => {
      if (states.length === 0 || window.confirm('Clear all states and transitions?')) {
        states = []; edges = [];
        render(); _notify();
      }
    });
  }

  function _setActiveTool(tool) {
    activeTool = tool;
    ['tool-add-state', 'tool-delete'].forEach(id => {
      document.getElementById(id)?.classList.toggle('active', id === 'tool-' + tool);
    });
    document.getElementById('tool-add-transition')?.classList.remove('active');
    _updateHint();
  }

  function _updateHint() {
    const el = document.getElementById('canvas-hint');
    if (!el) return;
    el.textContent = activeTool === 'add-state'
      ? 'Click on the canvas to place a new state.'
      : activeTool === 'delete'
        ? 'Click on a state to delete it (and its transitions).'
        : '';
  }

  // ── Canvas click ─────────────────────────────────────────────────────
  function _onCanvasClick(e) {
    const pos = _canvasPos(e);
    const hit = _hitState(pos.x, pos.y);
    if (activeTool === 'add-state') {
      if (!hit) _promptAddState(pos.x, pos.y);
    } else if (activeTool === 'delete') {
      if (hit) {
        states = states.filter(s => s !== hit);
        edges  = edges.filter(e => e.from !== hit.name && e.to !== hit.name);
        render(); _notify();
      }
    }
  }

  // ── Add state ────────────────────────────────────────────────────────
  function _promptAddState(x, y) {
    const name = window.prompt('State name:', 'q' + states.length);
    if (!name?.trim()) return;
    const label = name.trim();
    if (states.find(s => s.name === label)) { window.alert(`"${label}" already exists.`); return; }

    const t = (window.prompt('State type:\n  normal\n  start\n  final\n  start+final',
      states.length === 0 ? 'start' : 'normal') ?? '').trim().toLowerCase();

    const isStart = t.includes('start');
    const isFinal = t.includes('final');
    if (isStart) states.forEach(s => { s.isStart = false; });
    states.push({ name: label, x, y, isStart, isFinal });
    render(); _notify();
  }

  // ── Add transition ───────────────────────────────────────────────────
  function _promptAddTransition() {
    if (!states.length) { window.alert('Add at least one state first.'); return; }
    const names = states.map(s => s.name).join(', ');

    const from = window.prompt(`From state (${names}):`, '')?.trim();
    if (!from) return;
    if (!states.find(s => s.name === from)) { window.alert(`"${from}" does not exist.`); return; }

    const to = window.prompt(`To state (${names}):`, '')?.trim();
    if (!to) return;
    if (!states.find(s => s.name === to)) { window.alert(`"${to}" does not exist.`); return; }

    const sym = window.prompt('Symbol (type "e" or "epsilon" for ε):', 'a')?.trim();
    if (!sym) return;
    const symbol = (sym === 'e' || sym.toLowerCase() === 'epsilon') ? 'ε' : sym;

    if (!edges.find(ed => ed.from === from && ed.to === to && ed.symbol === symbol)) {
      edges.push({ from, to, symbol });
    }
    render(); _notify();
  }

  // ── Render ───────────────────────────────────────────────────────────
  function render() {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let gx = 30; gx < W; gx += 30) {
      for (let gy = 30; gy < H; gy += 30) {
        ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (!states.length) {
      ctx.fillStyle = '#aaa';
      ctx.font = '13px Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('No states. Select "Add State" and click the canvas.', W / 2, H / 2);
      return;
    }

    _groupedEdges().forEach(g => _drawEdgeGroup(g));
    states.forEach(s => _drawState(s));
  }

  // ── Edge grouping ─────────────────────────────────────────────────────
  function _groupedEdges() {
    const map = new Map();
    edges.forEach(e => {
      const key = e.from + '\u2192' + e.to;
      if (!map.has(key)) map.set(key, { from: e.from, to: e.to, symbols: [] });
      if (!map.get(key).symbols.includes(e.symbol)) map.get(key).symbols.push(e.symbol);
    });
    return Array.from(map.values());
  }

  function _drawEdgeGroup(group) {
    const fs = states.find(s => s.name === group.from);
    const ts = states.find(s => s.name === group.to);
    if (!fs || !ts) return;

    const label = group.symbols.join(', ');
    ctx.strokeStyle = '#333'; ctx.fillStyle = '#333'; ctx.lineWidth = 1;

    // Self-loop
    if (fs === ts) { _drawSelfLoop(fs, label); return; }

    // FIX: exclude self-loops from hasReverse — when from===to it always matches itself
    const hasReverse = edges.some(e =>
      e.from === group.to && e.to === group.from && e.from !== e.to
    );

    if (hasReverse) {
      const canonical = group.from < group.to;
      const canonFrom = canonical ? fs : ts;
      const canonTo   = canonical ? ts : fs;

      const cdx  = canonTo.x - canonFrom.x;
      const cdy  = canonTo.y - canonFrom.y;
      const clen = Math.sqrt(cdx * cdx + cdy * cdy);
      if (clen < 1) return;

      const cnx = -cdy / clen;
      const cny =  cdx / clen;
      const dir  = canonical ? 1 : -1;

      const cpx = (fs.x + ts.x) / 2 + cnx * 40 * dir;
      const cpy = (fs.y + ts.y) / 2 + cny * 40 * dir;

      const ang1 = Math.atan2(cpy - fs.y, cpx - fs.x);
      const sx   = fs.x + Math.cos(ang1) * R;
      const sy   = fs.y + Math.sin(ang1) * R;
      const ang2 = Math.atan2(cpy - ts.y, cpx - ts.x);
      const ex   = ts.x + Math.cos(ang2) * R;
      const ey   = ts.y + Math.sin(ang2) * R;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cpx, cpy, ex, ey);
      ctx.stroke();

      _arrowHead(ex, ey, Math.atan2(ey - cpy, ex - cpx));

      const lx = 0.25 * sx + 0.5 * cpx + 0.25 * ex;
      const ly = 0.25 * sy + 0.5 * cpy + 0.25 * ey;
      _edgeLabel(label, lx + cnx * 14 * dir, ly + cny * 14 * dir);

    } else {
      const dx  = ts.x - fs.x, dy = ts.y - fs.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      const ux = dx / len, uy = dy / len;

      const x1 = fs.x + ux * R, y1 = fs.y + uy * R;
      const x2 = ts.x - ux * R, y2 = ts.y - uy * R;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      _arrowHead(x2, y2, Math.atan2(dy, dx));
      // Perpendicular above the line: (uy, -ux) * 14
      _edgeLabel(label, (x1 + x2) / 2 + uy * 14, (y1 + y2) / 2 - ux * 14);
    }
  }

  // ── Self-loop ─────────────────────────────────────────────────────────
  function _drawSelfLoop(state, label) {
    const x = state.x, y = state.y;
    const loopH = 46, loopW = 24;

    const x1 = x + R * Math.cos(-Math.PI / 2 - 0.42);
    const y1 = y + R * Math.sin(-Math.PI / 2 - 0.42);
    const x2 = x + R * Math.cos(-Math.PI / 2 + 0.42);
    const y2 = y + R * Math.sin(-Math.PI / 2 + 0.42);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x - loopW, y - R - loopH, x + loopW, y - R - loopH, x2, y2);
    ctx.strokeStyle = '#333'; ctx.stroke();

    _arrowHead(x2, y2, Math.atan2(y2 - (y - R - loopH), x2 - (x + loopW)));
    _edgeLabel(label, x, y - R - loopH * 0.75);
  }

  // ── Primitives ────────────────────────────────────────────────────────
  function _arrowHead(x, y, angle) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-ARROW_SIZE, -ARROW_SIZE / 2);
    ctx.lineTo(-ARROW_SIZE,  ARROW_SIZE / 2);
    ctx.closePath();
    ctx.fillStyle = '#333'; ctx.fill();
    ctx.restore();
  }

  function _edgeLabel(text, x, y) {
    ctx.save();
    ctx.font = '11px "Courier New", monospace';
    const w = ctx.measureText(text).width + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(x - w / 2, y - 8, w, 16);
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function _drawState(s) {
    if (s.isFinal) {
      ctx.beginPath(); ctx.arc(s.x, s.y, R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.fillStyle = '#111';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.name, s.x, s.y);

    if (s.isStart) {
      ctx.beginPath(); ctx.moveTo(s.x - R - 28, s.y); ctx.lineTo(s.x - R, s.y);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.stroke();
      _arrowHead(s.x - R, s.y, 0);
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────
  function _canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height)
    };
  }

  function _hitState(x, y) {
    return states.slice().reverse().find(s => {
      const dx = s.x - x, dy = s.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= R + 5;
    }) || null;
  }

  // ── Public data accessors ─────────────────────────────────────────────
  function getDiagramData() {
    return {
      states:      states.map(s => s.name).join(', '),
      alphabet:    [...new Set(edges.map(e => e.symbol).filter(s => s !== 'ε'))].join(', '),
      transitions: edges.map(e => `${e.from},${e.symbol}=${e.to}`).join('\n'),
      start_state: (states.find(s => s.isStart) || {}).name || '',
      final_states: states.filter(s => s.isFinal).map(s => s.name).join(', ')
    };
  }

  function updateFromTuple(stateNames, startState, finalStates, parsedEdges) {
    const W = canvas.width || 600, H = canvas.height || 380;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) / 2 - 70;

    const posMap = {};
    states.forEach(s => { posMap[s.name] = { x: s.x, y: s.y }; });

    const n = stateNames.length;
    stateNames.forEach((name, i) => {
      if (!posMap[name]) {
        const angle = (2 * Math.PI * i / n) - Math.PI / 2;
        posMap[name] = {
          x: n === 1 ? cx : cx + r * Math.cos(angle),
          y: n === 1 ? cy : cy + r * Math.sin(angle)
        };
      }
    });

    states = stateNames.map(name => ({
      name,
      x: posMap[name].x, y: posMap[name].y,
      isStart: name === startState,
      isFinal: finalStates.includes(name)
    }));

    edges = parsedEdges
      .filter(e => stateNames.includes(e.from) && stateNames.includes(e.to))
      .map(e => ({ from: e.from, to: e.to, symbol: e.symbol }));

    render();
  }

  function clear() {
    states = []; edges = [];
    render(); _notify();
  }

  function _notify() {
    document.dispatchEvent(new CustomEvent('diagram-changed'));
  }

  return { init, render, getDiagramData, updateFromTuple, clear };

})(); 