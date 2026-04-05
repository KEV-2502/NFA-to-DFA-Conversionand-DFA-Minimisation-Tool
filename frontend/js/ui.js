/**
 * ui.js
 * Simple result rendering helpers.
 * Renders transition tables, 5-tuple displays, step-by-step text, and type status.
 */

'use strict';

const UI = (() => {

  // ── Tab switching ────────────────────────────────────────────────────
  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === 'tab-pane-' + tabId);
    });
  }

  // ── Type status indicator ────────────────────────────────────────────
  function updateTypeIndicator(type) {
    const el = document.getElementById('type-status');
    if (!el) return;
    if (!type) {
      el.textContent = '';
      return;
    }
    el.textContent = 'Detected: ' + (type === 'NFA'
      ? 'NFA (Nondeterministic Finite Automaton)'
      : 'DFA (Deterministic Finite Automaton)');
  }

  // ── Error display ────────────────────────────────────────────────────
  function showError(msg) {
    const el = document.getElementById('input-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function clearError() {
    const el = document.getElementById('input-error');
    if (!el) return;
    el.style.display = 'none';
    el.textContent   = '';
  }

  // ── Button loading state ──────────────────────────────────────────────
  function setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled    = loading;
    btn.textContent = loading ? btn.textContent + '...' : btn.textContent.replace('...', '');
  }

  // ── 5-tuple display ───────────────────────────────────────────────────
  function renderTuple(containerId, data) {
    const el = document.getElementById(containerId);
    if (!el || !data) return;

    const fmt = arr => Array.isArray(arr) ? '{' + arr.join(', ') + '}' : String(arr || '');

    el.innerHTML = [
      row('Q',   fmt(data.states)),
      row('Σ',   fmt(data.alphabet)),
      row('q\u2080', String(data.start_state || '')),
      row('F',   fmt(data.final_states)),
      row('|Q|', String(data.state_count || (Array.isArray(data.states) ? data.states.length : '')) + ' states')
    ].join('');

    function row(key, val) {
      return '<div><span class="tkey">' + esc(key) + ' = </span>' + esc(val) + '</div>';
    }
  }

  // ── Comparison cards ──────────────────────────────────────────────────
  function updateComparison(inputData, outputData) {
    const inLabel = document.getElementById('cmp-input-label');
    const outLabel = document.getElementById('cmp-output-label');

    if (inLabel)  inLabel.textContent  = (inputData  && inputData.label)  || 'Input';
    if (outLabel) outLabel.textContent = (outputData && outputData.label) || 'Output';

    renderTuple('cmp-input-tuple',  inputData);
    renderTuple('cmp-output-tuple', outputData);
  }

  // ── Transition table ──────────────────────────────────────────────────
  function renderTable(containerId, data) {
    const el = document.getElementById(containerId);
    if (!el || !data) return;

    const { states, alphabet, start_state, final_states, transition_table } = data;

    let html = '<table class="trans-table"><thead><tr><th>State</th>';
    (alphabet || []).forEach(sym => {
      html += '<th>' + esc(sym) + '</th>';
    });
    html += '</tr></thead><tbody>';

    (states || []).forEach(state => {
      const isStart = state === start_state;
      const isFinal = (final_states || []).includes(state);
      const isDead  = state === '\u2205';

      html += '<tr><td class="state-col' + (isDead ? ' dead-cell' : '') + '">';
      if (isStart) html += '<span class="state-marker">&#8594;</span>';
      if (isFinal) html += '<span class="state-marker">*</span>';
      html += esc(state) + '</td>';

      (alphabet || []).forEach(sym => {
        const target = transition_table && transition_table[state] && transition_table[state][sym];
        let val;
        if (Array.isArray(target)) {
          val = target.join(', ') || '\u2205';
        } else {
          val = target || '\u2205';
        }
        const cls = (val === '\u2205' || val === '') ? ' class="dead-cell"' : '';
        html += '<td' + cls + '>' + esc(val) + '</td>';
      });

      html += '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;
  }

  // ── Steps accordion ───────────────────────────────────────────────────
  function renderSteps(containerId, stepsData, action) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    if (!stepsData || (Array.isArray(stepsData) && stepsData.length === 0)) {
      el.innerHTML = '<p style="color:#888;font-size:0.84rem;">No steps recorded.</p>';
      return;
    }

    if (action === 'convert_minimize' && stepsData.conversion) {
      el.appendChild(_buildStepGroup('NFA to DFA Subset Construction', stepsData.conversion, 'conversion'));
      el.appendChild(_buildStepGroup('DFA Minimization (Table Filling)', [stepsData.minimization], 'minimization'));
    } else if (action === 'minimize' && Array.isArray(stepsData)) {
      el.appendChild(_buildStepGroup('DFA Minimization (Table Filling)', stepsData, 'minimization'));
    } else if (Array.isArray(stepsData)) {
      el.appendChild(_buildStepGroup('NFA to DFA Subset Construction Steps', stepsData, 'conversion'));
    }
  }

  function _buildStepGroup(title, steps, type) {
    const group = document.createElement('div');
    group.className = 'step-group open';

    const header = document.createElement('div');
    header.className = 'step-group-header';
    header.textContent = title + ' [click to collapse]';
    header.addEventListener('click', () => group.classList.toggle('open'));

    const body = document.createElement('div');
    body.className = 'step-group-body';

    if (type === 'minimization' && steps[0] && steps[0].reachable) {
      body.appendChild(_renderMinSteps(steps[0]));
    } else {
      steps.forEach((step, i) => {
        if (!step || !step.description) return;
        const item = document.createElement('div');
        item.className = 'step-item';
        item.innerHTML =
          '<span class="step-num">' + (i + 1) + '.</span>' +
          '<span class="step-text">' + _highlight(step.description) + '</span>';
        body.appendChild(item);
      });
    }

    group.appendChild(header);
    group.appendChild(body);
    return group;
  }

  function _renderMinSteps(d) {
    const frag = document.createDocumentFragment();

    const section = (title, content) => {
      const el = document.createElement('div');
      el.style.marginBottom = '10px';
      el.innerHTML =
        '<strong style="font-size:0.78rem;">' + title + '</strong><br>' +
        '<span style="font-family:\'Courier New\',monospace;font-size:0.8rem;">' + content + '</span>';
      frag.appendChild(el);
    };

    section('Reachable States',
      d.reachable.length ? d.reachable.map(s => esc(s)).join(', ') : '(none)');

    if (d.unreachable && d.unreachable.length) {
      section('Removed (Unreachable)', d.unreachable.map(s => esc(s)).join(', '));
    }

    section('Initially Distinguished (Final vs Non-Final)',
      d.initial_distinguishable.length
        ? d.initial_distinguishable.map(p => '(' + p.join(', ') + ')').join('  ')
        : '(none)');

    section('All Distinguishable Pairs',
      d.all_distinguishable.length
        ? d.all_distinguishable.map(p => '(' + p.join(', ') + ')').join('  ')
        : '(none)');

    if (d.merged_groups && d.merged_groups.length) {
      section('Merged Equivalence Classes',
        d.merged_groups.map(g => '{' + g.join(', ') + '}').join('  '));
    } else {
      section('Result', 'DFA is already minimal. No states were merged.');
    }

    return frag;
  }

  function _highlight(text) {
    return esc(text)
      .replace(/\u03b5-closure\([^)]+\)/g, m => '<em>' + m + '</em>')
      .replace(/\u03b4\([^)]+\)/g, m => '<em>' + m + '</em>')
      .replace(/\{[^}]+\}/g, m => '<em>' + m + '</em>');
  }

  // ── Utilities ─────────────────────────────────────────────────────────
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return {
    switchTab,
    updateTypeIndicator,
    showError,
    clearError,
    setButtonLoading,
    renderTuple,
    updateComparison,
    renderTable,
    renderSteps
  };

})();
