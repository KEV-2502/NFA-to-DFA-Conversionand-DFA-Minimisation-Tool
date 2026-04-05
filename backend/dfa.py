"""
dfa.py - DFA (Deterministic Finite Automaton) representation.

Stores the 5-tuple (Q, Σ, δ, q0, F) where δ is a total function
mapping (state, symbol) -> exactly one state.
"""


class DFA:
    """
    Represents a Deterministic Finite Automaton.

    Attributes:
        states   : set of state names (strings)
        alphabet : set of input symbols (strings)
        transitions : dict mapping (state, symbol) -> single state (string)
        start_state : string, initial state
        final_states: set of accepting states
    """

    def __init__(self, states, alphabet, transitions, start_state, final_states):
        self.states = set(states)
        self.alphabet = set(alphabet)
        self.transitions = transitions   # dict: (state, symbol) -> state
        self.start_state = start_state
        self.final_states = set(final_states)

    def get_transition_table(self):
        """
        Build a structured transition table for display purposes.

        Returns:
            dict with keys:
                'states'  : sorted list of state names
                'alphabet': sorted list of symbols
                'table'   : dict mapping state -> {symbol: next_state or '∅'}
                'start'   : start state
                'finals'  : list of final states
        """
        sorted_states = sorted(self.states, key=lambda s: (
            # Sort: start state first, then dead state last, others alphabetically
            0 if s == self.start_state else
            2 if s == '∅' or s == 'dead' else 1,
            s
        ))
        sorted_alpha = sorted(self.alphabet)

        table = {}
        for state in sorted_states:
            table[state] = {}
            for sym in sorted_alpha:
                table[state][sym] = self.transitions.get((state, sym), '∅')

        return {
            'states': sorted_states,
            'alphabet': sorted_alpha,
            'table': table,
            'start': self.start_state,
            'finals': list(self.final_states)
        }

    def to_dict(self):
        """Serialize DFA to a JSON-compatible dictionary."""
        transitions_list = []
        for (state, symbol), target in self.transitions.items():
            transitions_list.append({
                'from': state,
                'symbol': symbol,
                'to': target
            })
        return {
            'states': list(self.states),
            'alphabet': list(self.alphabet),
            'transitions': transitions_list,
            'start_state': self.start_state,
            'final_states': list(self.final_states)
        }
