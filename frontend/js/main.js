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

    // Output diagram (show input by default)
    diagramFocus = 'input';
    document.getElementById('diag-input-btn')?.classList.add('active');
    document.getElementById('diag-output-btn')?.classList.remove('active');
    _renderOutputDiagram('input');

    // Switch to comparison tab
    UI.switchTab('comparison');
  }

  // ── Output diagram ────────────────────────────────────────────────────
  function _renderOutputDiagram(which) {
    const canvas = document.getElementById('output-canvas');
    if (!canvas || !lastResult) return;
    const data = which === 'input' ? lastResult.input : lastResult.output;
    DiagramRenderer.render(canvas, data);
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

});
