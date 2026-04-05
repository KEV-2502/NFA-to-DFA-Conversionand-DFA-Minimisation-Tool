"""
app.py - Flask backend for the Automata Converter and Minimizer.

Routes:
  POST /api/process     → Parse, detect type, convert/minimize based on action
  POST /api/validate    → Just validate and detect type (no conversion)

All responses are JSON.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS

from validator import parse_automaton, parse_diagram_input, ValidationError
from converter import nfa_to_dfa, get_conversion_steps
from minimizer import minimize_dfa, get_minimization_steps
from nfa import NFA
from dfa import DFA

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)


@app.route('/')
def index():
    """Serve the frontend."""
    return app.send_static_file('index.html')


def dfa_to_response(dfa: DFA, label: str) -> dict:
    """
    Helper: Build a unified response payload for a DFA.
    Includes the 5-tuple, transition table, and graph edges for visualization.
    """
    table_data = dfa.get_transition_table()

    # Build graph edges for canvas rendering
    edges = []
    for (state, symbol), target in dfa.transitions.items():
        edges.append({'from': state, 'symbol': symbol, 'to': target})

    return {
        'label': label,
        'type': 'DFA',
        'states': table_data['states'],
        'alphabet': table_data['alphabet'],
        'start_state': dfa.start_state,
        'final_states': list(dfa.final_states),
        'transition_table': table_data['table'],
        'edges': edges,
        'state_count': len(dfa.states)
    }


def nfa_to_response(nfa: NFA, label: str) -> dict:
    """Helper: Build a unified response payload for an NFA."""
    from nfa import EPSILON

    # Build transition table (NFA cells are sets of states)
    alphabet = sorted(nfa.alphabet) + ([EPSILON] if any(
        sym == EPSILON for (_, sym) in nfa.transitions
    ) else [])

    table = {}
    for state in sorted(nfa.states):
        table[state] = {}
        for sym in alphabet:
            targets = nfa.transitions.get((state, sym), set())
            table[state][sym] = sorted(targets) if targets else ['∅']

    edges = []
    for (state, symbol), targets in nfa.transitions.items():
        for target in targets:
            edges.append({'from': state, 'symbol': symbol, 'to': target})

    return {
        'label': label,
        'type': 'NFA',
        'states': sorted(nfa.states),
        'alphabet': alphabet,
        'start_state': nfa.start_state,
        'final_states': list(nfa.final_states),
        'transition_table': table,
        'edges': edges,
        'state_count': len(nfa.states)
    }


@app.route('/api/process', methods=['POST'])
def process():
    """
    Main processing endpoint.

    Request JSON:
      {
        "input_mode": "text" | "diagram",
        "action": "convert" | "minimize" | "convert_minimize",
        "data": { ... }   // text fields or diagram state list
      }

    Response JSON:
      {
        "success": true,
        "input_type": "NFA" | "DFA",
        "input": { ... },          // original automaton info
        "output": { ... },         // result automaton info
        "steps": [ ... ],          // conversion/minimization steps
        "stats": { ... }           // before/after counts
      }
    """
    try:
        body = request.get_json(force=True)
        input_mode = body.get('input_mode', 'text')
        action = body.get('action', 'convert')
        data = body.get('data', {})

        # ── Parse input ──────────────────────────────────────────────────
        if input_mode == 'diagram':
            automaton, auto_type = parse_diagram_input(data)
        else:
            automaton, auto_type = parse_automaton(data)

        # ── Build input representation ───────────────────────────────────
        if auto_type == 'NFA':
            input_data = nfa_to_response(automaton, 'Input NFA')
        else:
            input_data = dfa_to_response(automaton, 'Input DFA')

        # ── Perform requested action ─────────────────────────────────────
        steps = []
        output_data = None

        if action == 'convert':
            if auto_type == 'DFA':
                return jsonify({
                    'success': False,
                    'error': 'Input is already a DFA. Use "Minimize DFA" instead, or provide an NFA.'
                }), 400

            # NFA → DFA
            steps = get_conversion_steps(automaton)
            result_dfa = nfa_to_dfa(automaton)
            output_data = dfa_to_response(result_dfa, 'Converted DFA')

        elif action == 'minimize':
            if auto_type == 'NFA':
                return jsonify({
                    'success': False,
                    'error': 'Cannot minimize an NFA directly. Convert to DFA first, or use "Convert → Minimize".'
                }), 400

            # DFA → Minimized DFA
            min_steps = get_minimization_steps(automaton)
            result_dfa = minimize_dfa(automaton)
            output_data = dfa_to_response(result_dfa, 'Minimized DFA')
            steps = [min_steps]  # wrap in list for consistent structure

        elif action == 'convert_minimize':
            if auto_type == 'NFA':
                # NFA → DFA → Minimized DFA
                conv_steps = get_conversion_steps(automaton)
                intermediate_dfa = nfa_to_dfa(automaton)
                min_steps = get_minimization_steps(intermediate_dfa)
                result_dfa = minimize_dfa(intermediate_dfa)
                output_data = dfa_to_response(result_dfa, 'Minimized DFA (via NFA→DFA)')
                steps = {
                    'conversion': conv_steps,
                    'minimization': min_steps,
                    'intermediate_dfa': dfa_to_response(intermediate_dfa, 'Intermediate DFA')
                }
            else:
                # DFA → Minimized DFA
                min_steps = get_minimization_steps(automaton)
                result_dfa = minimize_dfa(automaton)
                output_data = dfa_to_response(result_dfa, 'Minimized DFA')
                steps = [min_steps]

        else:
            return jsonify({'success': False, 'error': f"Unknown action: {action}"}), 400

        # ── Build stats ──────────────────────────────────────────────────
        stats = {
            'input_states': input_data['state_count'],
            'output_states': output_data['state_count'] if output_data else None,
            'input_type': auto_type,
            'action': action
        }

        return jsonify({
            'success': True,
            'input_type': auto_type,
            'input': input_data,
            'output': output_data,
            'steps': steps,
            'stats': stats
        })

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': f'Internal error: {str(e)}',
            'trace': traceback.format_exc()
        }), 500


@app.route('/api/validate', methods=['POST'])
def validate():
    """
    Validate input and return the detected automaton type without processing.
    Used for live validation feedback in the UI.
    """
    try:
        body = request.get_json(force=True)
        input_mode = body.get('input_mode', 'text')
        data = body.get('data', {})

        if input_mode == 'diagram':
            automaton, auto_type = parse_diagram_input(data)
        else:
            automaton, auto_type = parse_automaton(data)

        return jsonify({
            'success': True,
            'type': auto_type,
            'states': list(automaton.states),
            'alphabet': list(automaton.alphabet),
            'start_state': automaton.start_state,
            'final_states': list(automaton.final_states)
        })

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Internal error: {str(e)}'}), 500


if __name__ == '__main__':
    print("🚀 Automata Converter & Minimizer running at http://localhost:5000")
    app.run(debug=True, port=5000)
