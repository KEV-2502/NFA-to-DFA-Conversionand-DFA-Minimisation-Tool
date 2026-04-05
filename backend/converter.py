"""
converter.py - NFA to DFA conversion using the Subset Construction algorithm.

Algorithm Overview (Rabin-Scott Powerset Construction):
  1. Start with ε-closure of the NFA's start state → this becomes the DFA start state.
  2. For each DFA state (a frozenset of NFA states) and each symbol in Σ:
       a. Compute move(T, a) = union of δ_nfa(q, a) for all q in T
       b. Compute ε-closure(move(T, a)) → this is the new DFA state
  3. Repeat until no new DFA states are generated.
  4. A DFA state is accepting iff it contains at least one NFA accepting state.
"""

from nfa import NFA, EPSILON
from dfa import DFA


def nfa_to_dfa(nfa: NFA) -> DFA:
    """
    Convert an NFA to an equivalent DFA via subset construction.

    Args:
        nfa: an NFA instance

    Returns:
        A DFA instance that accepts the same language.
    """

    # --- Step 1: Compute the start state of the DFA ---
    # It is the ε-closure of the NFA's start state
    start_closure = nfa.epsilon_closure({nfa.start_state})

    # Map frozensets of NFA states -> DFA state name strings
    # We build these names during construction for readability
    dfa_states_map = {}   # frozenset -> string name
    unvisited = [start_closure]
    visited = set()

    dfa_transitions = {}  # (dfa_state_name, symbol) -> dfa_state_name
    dfa_final_states = set()

    def get_state_name(state_set: frozenset) -> str:
        """
        Generate a readable name for a DFA state from a frozenset of NFA states.
        E.g. frozenset({'q0', 'q1'}) -> '{q0,q1}'
             frozenset({'q2'})       -> '{q2}'    (always use braces for consistency)
        The dead/trap state (empty set) is named '∅'.
        """
        if not state_set:
            return '∅'
        # Always wrap in braces regardless of set size — ensures consistent
        # representation (singleton {q2} is never confused with original NFA state q2)
        sorted_states = sorted(state_set)
        return '{' + ','.join(sorted_states) + '}'

    # Register start state
    dfa_states_map[start_closure] = get_state_name(start_closure)

    # --- Step 2: Process each reachable DFA state ---
    while unvisited:
        current_set = unvisited.pop(0)
        if current_set in visited:
            continue
        visited.add(current_set)

        current_name = dfa_states_map[current_set]

        # Check if this DFA state is accepting
        if current_set & nfa.final_states:
            dfa_final_states.add(current_name)

        # For each alphabet symbol, compute the next DFA state
        for symbol in sorted(nfa.alphabet):
            # move from all states in current_set on this symbol
            moved = nfa.move(current_set, symbol)
            # apply ε-closure
            next_set = nfa.epsilon_closure(moved)

            # Register the new state if not seen before
            if next_set not in dfa_states_map:
                dfa_states_map[next_set] = get_state_name(next_set)
                if next_set:  # don't add dead state to unvisited (we handle it separately)
                    unvisited.append(next_set)

            next_name = dfa_states_map[next_set]
            dfa_transitions[(current_name, symbol)] = next_name

    # Collect all DFA state names
    dfa_state_names = set(dfa_states_map.values())

    # Add dead state transitions if needed (for missing transitions)
    dead_state_name = '∅'
    needs_dead_state = False
    for state_name in list(dfa_state_names):
        for symbol in nfa.alphabet:
            if (state_name, symbol) not in dfa_transitions:
                dfa_transitions[(state_name, symbol)] = dead_state_name
                needs_dead_state = True

    if needs_dead_state:
        dfa_state_names.add(dead_state_name)
        # Dead state loops back to itself on all symbols
        for symbol in nfa.alphabet:
            dfa_transitions[(dead_state_name, symbol)] = dead_state_name

    return DFA(
        states=dfa_state_names,
        alphabet=nfa.alphabet,
        transitions=dfa_transitions,
        start_state=dfa_states_map[start_closure],
        final_states=dfa_final_states
    )


def get_conversion_steps(nfa: NFA) -> list:
    """
    Return step-by-step subset construction details for display in the UI.

    Returns a list of dicts, each describing one step of the construction.
    """
    steps = []
    start_closure = nfa.epsilon_closure({nfa.start_state})
    dfa_states_map = {}
    unvisited = [start_closure]
    visited = set()

    def get_state_name(state_set):
        if not state_set:
            return '∅'
        sorted_states = sorted(state_set)
        return '{' + ','.join(sorted_states) + '}'

    dfa_states_map[start_closure] = get_state_name(start_closure)

    steps.append({
        'description': f'Initial DFA state = ε-closure({{{nfa.start_state}}}) = {{{", ".join(sorted(start_closure))}}}',
        'state': get_state_name(start_closure),
        'nfa_states': sorted(start_closure)
    })

    while unvisited:
        current_set = unvisited.pop(0)
        if current_set in visited:
            continue
        visited.add(current_set)
        current_name = dfa_states_map[current_set]

        for symbol in sorted(nfa.alphabet):
            moved = nfa.move(current_set, symbol)
            next_set = nfa.epsilon_closure(moved)

            if next_set not in dfa_states_map:
                dfa_states_map[next_set] = get_state_name(next_set)
                if next_set:
                    unvisited.append(next_set)

            next_name = dfa_states_map[next_set]
            steps.append({
                'description': f'δ({current_name}, {symbol}) = ε-closure(move({{{", ".join(sorted(current_set))}}}, {symbol})) = {next_name}',
                'from': current_name,
                'symbol': symbol,
                'to': next_name,
                'moved': sorted(moved),
                'closure': sorted(next_set)
            })

    return steps