/**
 * main.js
 * Application controller.
 * Wires together:
 *  - Text field changes  → update diagram (debounced)
 *  - Diagram changes     → update text fields
 *  - Action buttons      → call API, render results
 *  - Example presets
 *  - Result tabs
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // ── Init ─────────────────────────────────────────────────────────────
  DiagramEditor.init();

  let lastResult   = null;
  let diagramFocus = 'input';  // 'input' | 'output' for output diagram tab
  let tableFocus   = 'input';
  let debounce     = null;

  // ── Text fields → Diagram sync ────────────────────────────────────────
  const textFields = ['input-states', 'input-alphabet', 'input-transitions', 'input-start', 'input-finals'];
  textFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        syncTextToDiagram();
        detectType();
      }, 700);
    });
  });

  function syncTextToDiagram() {
    const parsed = parseTextFields();
    if (!parsed) return;
    DiagramEditor.updateFromTuple(
      parsed.stateNames,
      parsed.startState,
      parsed.finalStates,
      parsed.edges
    );
  }

  // ── Diagram → Text fields sync ────────────────────────────────────────
  document.addEventListener('diagram-changed', () => {
    const data = DiagramEditor.getDiagramData();
    _setField('input-states',      data.states);
    _setField('input-alphabet',    data.alphabet);
    _setField('input-transitions', data.transitions);
    _setField('input-start',       data.start_state);
    _setField('input-finals',      data.final_states);

    clearTimeout(debounce);
    debounce = setTimeout(detectType, 700);
  });

  function _setField(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  // ── Parse text fields ─────────────────────────────────────────────────
  function parseTextFields() {
    const statesRaw = (document.getElementById('input-states')?.value || '').trim();
    const alphaRaw  = (document.getElementById('input-alphabet')?.value || '').trim();
    const transRaw  = (document.getElementById('input-transitions')?.value || '').trim();
    const startRaw  = (document.getElementById('input-start')?.value || '').trim();
    const finalsRaw = (document.getElementById('input-finals')?.value || '').trim();

    const stateNames = statesRaw ? statesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const finalStates = finalsRaw ? finalsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const startState  = startRaw;

    // Parse transitions: "state,symbol=next" one per line
    const edges = [];
    transRaw.split('\n').forEach(line => {
      line = line.trim();
      if (!line) return;
      const eqIdx = line.indexOf('=');
      if (eqIdx < 0) return;
      const left = line.slice(0, eqIdx).trim();
      const to   = line.slice(eqIdx + 1).trim();
      const commaIdx = left.lastIndexOf(',');
      if (commaIdx < 0) return;
      const from   = left.slice(0, commaIdx).trim();
      let   symbol = left.slice(commaIdx + 1).trim();
      // Normalize epsilon
      if (symbol === 'e' || symbol.toLowerCase() === 'epsilon') symbol = 'ε';
      if (from && symbol && to) {
        // Support multiple destinations (NFA: q0,a=q1,q2)
        to.split(',').forEach(dest => {
          dest = dest.trim();
          if (dest) edges.push({ from, symbol, to: dest });
        });
      }
    });

    return { stateNames, startState, finalStates, edges, statesRaw, alphaRaw, transRaw, finalsRaw };
  }

  /** Returns the raw text-format data for the API. */
  function getTextData() {
    return {
      states:       (document.getElementById('input-states')?.value       || '').trim(),
      alphabet:     (document.getElementById('input-alphabet')?.value     || '').trim(),
      transitions:  (document.getElementById('input-transitions')?.value  || '').trim(),
      start_state:  (document.getElementById('input-start')?.value        || '').trim(),
      final_states: (document.getElementById('input-finals')?.value       || '').trim()
    };
  }

  // ── Live type detection ───────────────────────────────────────────────
  async function detectType() {
    const data = getTextData();
    if (!data.states && !data.transitions) {
      UI.updateTypeIndicator(null);
      return;
    }
    try {
      const resp = await API.validate('text', data);
      if (resp.success) UI.updateTypeIndicator(resp.type);
      else              UI.updateTypeIndicator(null);
    } catch (_) { /* ignore network errors during typing */ }
  }

  // ── Action buttons ────────────────────────────────────────────────────
  document.getElementById('btn-convert') ?.addEventListener('click', () => runAction('convert'));
  document.getElementById('btn-minimize')?.addEventListener('click', () => runAction('minimize'));
  document.getElementById('btn-both')    ?.addEventListener('click', () => runAction('convert_minimize'));

  async function runAction(action) {
    UI.clearError();
    const data = getTextData();
    if (!data.states && !data.transitions) {
      UI.showError('Please enter automaton data first.');
      return;
    }

    const btnId = { convert: 'btn-convert', minimize: 'btn-minimize', convert_minimize: 'btn-both' }[action];
    const btn   = document.getElementById(btnId);
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Working...'; }

    try {
      const result = await API.process('text', action, data);

      if (!result.success) {
        UI.showError(result.error || 'Unknown error.');
        return;
      }

      lastResult = result;
      _renderResult(result, action);

    } catch (err) {
      UI.showError('Network error: ' + err.message + ' — Is the Flask server running?');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
  }

  // ── Render result ─────────────────────────────────────────────────────
  function _renderResult(result, action) {
    const { input, output, steps, stats } = result;

    // Show results area
    const area = document.getElementById('results-area');
    if (area) area.style.display = 'block';

    // Action label
    const label = document.getElementById('result-action-label');
    if (label) {
      label.textContent = '— ' + ({
        convert:          'NFA to DFA',
        minimize:         'DFA Minimization',
        convert_minimize: 'NFA to DFA then Minimize'
      }[action] || action);
    }

    // Type indicator
    if (stats) UI.updateTypeIndicator(stats.input_type);

    // Comparison
    UI.updateComparison(input, output);

    // Table (show input by default)
    tableFocus = 'input';
    document.getElementById('tbl-input-btn')?.classList.add('active');
    document.getElementById('tbl-output-btn')?.classList.remove('active');
    UI.renderTable('table-container', input);

    // Steps
    UI.renderSteps('steps-container', steps, action);

    // Intermediate DFA tab
    const intBtn = document.getElementById('tab-btn-intermediate');
    if (intBtn) {
      if (action === 'convert_minimize' && steps && steps.intermediate_dfa) {
        intBtn.style.display = '';
        UI.renderTuple('intermediate-tuple', steps.intermediate_dfa);
        UI.renderTable('intermediate-table', steps.intermediate_dfa);
      } else {
        intBtn.style.display = 'none';
      }
    }

    // Reset diagram toggle state — actual render happens when user clicks the
    // Diagram tab, because the canvas offsetWidth/offsetHeight are 0 while the
    // pane is hidden and drawing into a hidden canvas produces nothing visible.
    diagramFocus = 'input';
    document.getElementById('diag-input-btn')?.classList.add('active');
    document.getElementById('diag-output-btn')?.classList.remove('active');

    // Switch to comparison tab
    UI.switchTab('comparison');
  }

  // ── Build renderer-compatible data from API automaton object ──────────
  function _buildRendererData(apiData) {
    if (!apiData) return null;

    const states       = Array.isArray(apiData.states)       ? apiData.states       : [];
    const final_states = Array.isArray(apiData.final_states) ? apiData.final_states : [];
    const start_state  = apiData.start_state || '';

    // Edges are already { from, symbol, to } — dedup just in case.
    const seen  = new Set();
    const edges = (Array.isArray(apiData.edges) ? apiData.edges : []).filter(e => {
      const key = `${e.from}\x00${e.symbol}\x00${e.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { states, start_state, final_states, edges };
  }

  // ── Output diagram ────────────────────────────────────────────────────
  function _renderOutputDiagram(which) {
    const canvas = document.getElementById('output-canvas');
    if (!canvas || !lastResult) return;

    // BUG FIX: Both input and output diagrams now use the API response data
    // directly via _buildRendererData, instead of re-parsing the editor's
    // text string for the input case.
    //
    // The old input path called DiagramEditor.getDiagramData() and re-parsed
    // the transitions string with lastIndexOf(','), which:
    //   1. Missed transitions when getDiagramData() formats them differently
    //      from what the parser expected (wrong edge count / missing edges).
    //   2. Produced phantom edges because the re-parse was reading label text
    //      as state names in some edge formats.
    //   3. Lost arrowheads and labels because the re-parsed edges were malformed.
    //
    // lastResult.input.edges is built by app.py directly from the validated
    // automaton object — it is always correct and complete.

    const apiData = (which === 'input') ? lastResult.input : lastResult.output;
    const data = _buildRendererData(apiData);
    if (data) DiagramRenderer.render(canvas, data);
  }

  // ── Table toggle ──────────────────────────────────────────────────────
  document.getElementById('tbl-input-btn')?.addEventListener('click', () => {
    tableFocus = 'input';
    document.getElementById('tbl-input-btn')?.classList.add('active');
    document.getElementById('tbl-output-btn')?.classList.remove('active');
    if (lastResult) UI.renderTable('table-container', lastResult.input);
  });

  document.getElementById('tbl-output-btn')?.addEventListener('click', () => {
    tableFocus = 'output';
    document.getElementById('tbl-output-btn')?.classList.add('active');
    document.getElementById('tbl-input-btn')?.classList.remove('active');
    if (lastResult) UI.renderTable('table-container', lastResult.output);
  });

  // ── Diagram toggle ────────────────────────────────────────────────────
  document.getElementById('diag-input-btn')?.addEventListener('click', () => {
    diagramFocus = 'input';
    document.getElementById('diag-input-btn')?.classList.add('active');
    document.getElementById('diag-output-btn')?.classList.remove('active');
    _renderOutputDiagram('input');
  });

  document.getElementById('diag-output-btn')?.addEventListener('click', () => {
    diagramFocus = 'output';
    document.getElementById('diag-output-btn')?.classList.add('active');
    document.getElementById('diag-input-btn')?.classList.remove('active');
    _renderOutputDiagram('output');
  });

  // ── Result tab buttons ────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      UI.switchTab(tab);
      if (tab === 'output-diagram') _renderOutputDiagram(diagramFocus);
    });
  });

  // ── Re-render output diagram on window resize ─────────────────────────
  window.addEventListener('resize', () => {
    if (lastResult) _renderOutputDiagram(diagramFocus);
  });

  // ── Example presets ───────────────────────────────────────────────────
  const EXAMPLES = {
    'ex-nfa-eps': {
      states: 'q0, q1, q2', alphabet: 'a, b',
      transitions: 'q0,a=q0\nq0,b=q0\nq0,e=q1\nq1,a=q2',
      start_state: 'q0', final_states: 'q2'
    },
    'ex-nfa-nd': {
      states: 'q0, q1, q2', alphabet: 'a, b',
      transitions: 'q0,a=q0\nq0,b=q0\nq0,a=q1\nq1,b=q2',
      start_state: 'q0', final_states: 'q2'
    },
    'ex-dfa-min': {
      states: 'q0, q1, q2, q3, q4', alphabet: 'a, b',
      transitions: 'q0,a=q1\nq0,b=q2\nq1,a=q3\nq1,b=q4\nq2,a=q3\nq2,b=q4\nq3,a=q3\nq3,b=q4\nq4,a=q4\nq4,b=q4',
      start_state: 'q0', final_states: 'q3'
    },
    'ex-dfa-already': {
      states: 'q0, q1', alphabet: 'a, b',
      transitions: 'q0,a=q1\nq0,b=q0\nq1,a=q1\nq1,b=q0',
      start_state: 'q0', final_states: 'q1'
    }
  };

  Object.entries(EXAMPLES).forEach(([id, ex]) => {
    document.getElementById(id)?.addEventListener('click', () => {
      _setField('input-states',      ex.states);
      _setField('input-alphabet',    ex.alphabet);
      _setField('input-transitions', ex.transitions);
      _setField('input-start',       ex.start_state);
      _setField('input-finals',      ex.final_states);
      UI.clearError();
      syncTextToDiagram();
      clearTimeout(debounce);
      debounce = setTimeout(detectType, 200);
    });
  });

  // ── Export Canvas as PNG ──────────────────────────────────────────────
  function exportCanvas(canvasId, fileName) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  document.getElementById('tool-export-png')?.addEventListener('click', () => {
    exportCanvas('diagram-canvas', 'input_automaton.png');
  });

  document.getElementById('out-export-png')?.addEventListener('click', () => {
    exportCanvas('output-canvas', 'output_automaton.png');
  });

  // ── Simulate String ───────────────────────────────────────────────────
  document.getElementById('btn-simulate')?.addEventListener('click', () => {
    const inputEl = document.getElementById('input-simulate');
    const resultEl = document.getElementById('simulate-result');
    if (!inputEl || !resultEl) return;
    
    // Check if we have an output DFA to simulate on
    if (!lastResult || !lastResult.output || lastResult.output.type !== 'DFA') {
       resultEl.textContent = 'Warning: No DFA output available to simulate on. Please convert an NFA or minimize a DFA first.';
       resultEl.style.display = 'block';
       resultEl.style.color = '#b91c1c';
       resultEl.style.background = '#fef2f2';
       return;
    }
    
    const dfa = lastResult.output;
    const str = inputEl.value.trim();
    
    let currentState = dfa.start_state;
    let isRejected = false;
    
    for (let char of str) {
      const transitions = dfa.transition_table[currentState];
      if (!transitions || !transitions[char]) {
        isRejected = true;
        break;
      }
      
      const nextState = transitions[char];
      if (Array.isArray(nextState)) { // Safe fallback
         currentState = nextState[0];
      } else {
         currentState = nextState;
      }
      
      if (currentState === '∅') {
         isRejected = true;
         break;
      }
    }
    
    const isAccepted = !isRejected && dfa.final_states.includes(currentState);
    
    resultEl.style.display = 'block';
    if (isAccepted) {
       resultEl.textContent = `✅ String Accepted! Ended in final state: ${currentState}`;
       resultEl.style.color = '#047857';
       resultEl.style.background = '#d1fae5';
    } else {
       resultEl.textContent = `❌ String Rejected. Halted or ended in non-final state: ${currentState || 'N/A'}`;
       resultEl.style.color = '#b91c1c';
       resultEl.style.background = '#fef2f2';
    }
  });

});