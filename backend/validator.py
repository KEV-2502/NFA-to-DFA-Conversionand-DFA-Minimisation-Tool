"""
validator.py - Input validation and automaton type detection.

Responsibilities:
  1. Parse the text-format 5-tuple input into structured data.
  2. Validate consistency (states referenced in transitions must be declared, etc.).
  3. Detect whether the input is a DFA or NFA:
       - ε-transitions  → NFA
       - Multiple transitions from same (state, symbol) → NFA
       - Otherwise      → DFA
"""

import re
from nfa import NFA, EPSILON
from dfa import DFA


class ValidationError(Exception):
    """Raised when the user's input fails validation."""
    pass


def parse_automaton(data: dict) -> tuple:
    """
    Parse and validate a raw automaton specification from the frontend.

    Expected `data` keys:
      - 'states'       : comma-separated state names (e.g. "q0,q1,q2")
      - 'alphabet'     : comma-separated symbols (e.g. "a,b")
                         ε is automatically detected from transitions; do not list it here.
      - 'transitions'  : newline-separated transition rules in format "q0,a=q1"
                         Use "ε" (or "eps"/"epsilon") for epsilon transitions.
      - 'start_state'  : single state name (e.g. "q0")
      - 'final_states' : comma-separated state names (e.g. "q2,q3")

    Returns:
        (automaton, automaton_type) where:
          - automaton is an NFA or DFA instance
          - automaton_type is 'NFA' or 'DFA'

    Raises:
        ValidationError with a descriptive message on any issue.
    """

    # ── 1. Parse state list ──────────────────────────────────────────────
    raw_states = data.get('states', '')
    states = [s.strip() for s in raw_states.split(',') if s.strip()]
    if not states:
        raise ValidationError("No states defined. Please enter at least one state.")

    # Check for duplicate state names
    if len(states) != len(set(states)):
        dupes = [s for s in states if states.count(s) > 1]
        raise ValidationError(f"Duplicate state names found: {', '.join(set(dupes))}")

    states_set = set(states)

    # ── 2. Parse alphabet ────────────────────────────────────────────────
    raw_alpha = data.get('alphabet', '')
    alphabet = [s.strip() for s in raw_alpha.split(',') if s.strip()]
    # ε should not be in the alphabet (it's implicit)
    alphabet = [a for a in alphabet if a not in (EPSILON, 'eps', 'epsilon')]
    if not alphabet:
        raise ValidationError("Alphabet is empty. Please enter at least one symbol.")

    alphabet_set = set(alphabet)

    # ── 3. Parse transitions ─────────────────────────────────────────────
    raw_transitions = data.get('transitions', '')
    transition_lines = [l.strip() for l in raw_transitions.splitlines() if l.strip()]

    # transitions_map: (state, symbol) -> set of target states
    transitions_map = {}
    has_epsilon = False
    has_nondeterminism = False

    for line in transition_lines:
        # Expected format: "q0,a=q1" or "q0,ε=q1"
        # Also accept "q0,eps=q1" or "q0,epsilon=q1"
        match = re.match(r'^(.+?),(.+?)=(.+)$', line)
        if not match:
            raise ValidationError(
                f"Invalid transition format: '{line}'. "
                f"Expected format: 'state,symbol=next_state'"
            )

        from_state = match.group(1).strip()
        symbol = match.group(2).strip()
        to_states_raw = match.group(3).strip()

        # Normalize epsilon variants
        if symbol in ('eps', 'epsilon', 'e'):
            symbol = EPSILON

        # Validate states exist
        if from_state not in states_set:
            raise ValidationError(
                f"Transition references undeclared state '{from_state}'. "
                f"Declared states: {', '.join(sorted(states_set))}"
            )
            
        # Parse multiple target states (e.g. q1,q2)
        to_states = [s.strip() for s in to_states_raw.split(',') if s.strip()]
        if not to_states:
            raise ValidationError(f"No target states specified in transition: '{line}'")

        for to_state in to_states:
            if to_state not in states_set:
                raise ValidationError(
                    f"Transition references undeclared state '{to_state}'. "
                    f"Declared states: {', '.join(sorted(states_set))}"
                )

        # Validate symbol (allow ε even if not in alphabet)
        if symbol != EPSILON and symbol not in alphabet_set:
            raise ValidationError(
                f"Transition uses symbol '{symbol}' not in alphabet {list(alphabet_set)}."
            )

        if symbol == EPSILON:
            has_epsilon = True

        key = (from_state, symbol)
        if key not in transitions_map:
            transitions_map[key] = set()

        for to_state in to_states:
            transitions_map[key].add(to_state)

        # If a state has more than one target for same symbol, it's nondeterministic
        if len(transitions_map[key]) > 1:
            has_nondeterminism = True

    # ── 4. Parse start state ─────────────────────────────────────────────
    start_state = data.get('start_state', '').strip()
    if not start_state:
        raise ValidationError("Start state is not specified.")
    if start_state not in states_set:
        raise ValidationError(
            f"Start state '{start_state}' is not in the declared states list."
        )

    # ── 5. Parse final states ─────────────────────────────────────────────
    raw_finals = data.get('final_states', '')
    final_states = [s.strip() for s in raw_finals.split(',') if s.strip()]
    if not final_states:
        raise ValidationError("No final/accepting states defined.")

    for fs in final_states:
        if fs not in states_set:
            raise ValidationError(
                f"Final state '{fs}' is not in the declared states list."
            )

    # ── 6. Detect DFA vs NFA ─────────────────────────────────────────────
    is_nfa = has_epsilon or has_nondeterminism

    # Additional check: for DFA, every (state, symbol) should have exactly one target
    # Build the automaton accordingly
    if is_nfa:
        automaton = NFA(
            states=states_set,
            alphabet=alphabet_set,
            transitions=transitions_map,
            start_state=start_state,
            final_states=set(final_states)
        )
        return automaton, 'NFA'
    else:
        # Convert transitions_map (values are sets) to dfa transitions (values are strings)
        dfa_transitions = {}
        for (state, sym), targets in transitions_map.items():
            target_list = list(targets)
            dfa_transitions[(state, sym)] = target_list[0]

        automaton = DFA(
            states=states_set,
            alphabet=alphabet_set,
            transitions=dfa_transitions,
            start_state=start_state,
            final_states=set(final_states)
        )
        return automaton, 'DFA'


def parse_diagram_input(data: dict) -> tuple:
    """
    Parse automaton from diagram-builder format (from the canvas UI).

    Expected `data` keys:
      - 'states': list of {id, label, isStart, isFinal}
      - 'transitions': list of {from, to, label}

    Returns:
        (automaton, automaton_type) — same as parse_automaton
    """
    raw_states = data.get('states', [])
    raw_transitions = data.get('transitions', [])

    if not raw_states:
        raise ValidationError("No states in diagram. Please add at least one state.")

    state_labels = [s['label'] for s in raw_states]
    states_set = set(state_labels)

    # Detect start state
    start_states = [s['label'] for s in raw_states if s.get('isStart')]
    if not start_states:
        raise ValidationError("No start state defined. Please mark one state as start.")
    if len(start_states) > 1:
        raise ValidationError(
            f"Multiple start states defined: {', '.join(start_states)}. "
            "Only one start state is allowed."
        )
    start_state = start_states[0]

    # Detect final states
    final_states = set(s['label'] for s in raw_states if s.get('isFinal'))
    if not final_states:
        raise ValidationError("No final (accepting) states defined.")

    # Parse transitions
    alphabet_set = set()
    transitions_map = {}
    has_epsilon = False
    has_nondeterminism = False

    for t in raw_transitions:
        from_state = t.get('from', '').strip()
        symbol = t.get('label', '').strip()
        to_state = t.get('to', '').strip()

        if symbol in ('eps', 'epsilon', 'e'):
            symbol = EPSILON

        if not from_state or not symbol or not to_state:
            raise ValidationError(f"Incomplete transition: {t}")

        if from_state not in states_set:
            raise ValidationError(f"Transition uses unknown state '{from_state}'.")
        if to_state not in states_set:
            raise ValidationError(f"Transition uses unknown state '{to_state}'.")

        if symbol == EPSILON:
            has_epsilon = True
        else:
            alphabet_set.add(symbol)

        key = (from_state, symbol)
        transitions_map.setdefault(key, set()).add(to_state)
        if len(transitions_map[key]) > 1:
            has_nondeterminism = True

    if not alphabet_set and not has_epsilon:
        raise ValidationError("No transitions defined. Please add transitions.")

    is_nfa = has_epsilon or has_nondeterminism

    if is_nfa:
        return NFA(
            states=states_set,
            alphabet=alphabet_set,
            transitions=transitions_map,
            start_state=start_state,
            final_states=final_states
        ), 'NFA'
    else:
        dfa_transitions = {
            (state, sym): list(targets)[0]
            for (state, sym), targets in transitions_map.items()
        }
        return DFA(
            states=states_set,
            alphabet=alphabet_set,
            transitions=dfa_transitions,
            start_state=start_state,
            final_states=final_states
        ), 'DFA'
