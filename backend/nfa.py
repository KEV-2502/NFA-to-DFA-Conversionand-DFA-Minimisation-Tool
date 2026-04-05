"""
nfa.py - NFA (Nondeterministic Finite Automaton) representation.

Stores the 5-tuple (Q, Σ, δ, q0, F) and provides epsilon closure computation,
which is the foundation for NFA-to-DFA subset construction.
"""

EPSILON = 'ε'


class NFA:
    """
    Represents a Nondeterministic Finite Automaton.

    Attributes:
        states   : set of state names (strings)
        alphabet : set of input symbols (strings, excluding ε)
        transitions : dict mapping (state, symbol) -> set of states
                      symbol can be ε for epsilon transitions
        start_state : string, initial state
        final_states: set of accepting states
    """

    def __init__(self, states, alphabet, transitions, start_state, final_states):
        self.states = set(states)
        self.alphabet = set(alphabet) - {EPSILON}  # ε is not part of the formal alphabet
        self.transitions = transitions              # dict: (state, symbol) -> set of states
        self.start_state = start_state
        self.final_states = set(final_states)

    def epsilon_closure(self, state_set):
        """
        Compute the ε-closure of a set of states.

        The ε-closure of a set S is the set of all states reachable from
        any state in S via zero or more ε-transitions.

        Algorithm: BFS/DFS from each state in state_set, following ε-transitions.

        Args:
            state_set: iterable of state names

        Returns:
            frozenset of states reachable via ε only
        """
        closure = set(state_set)
        stack = list(state_set)

        while stack:
            current = stack.pop()
            # Get all states reachable via a single ε-transition from current
            epsilon_targets = self.transitions.get((current, EPSILON), set())
            for target in epsilon_targets:
                if target not in closure:
                    closure.add(target)
                    stack.append(target)

        return frozenset(closure)

    def move(self, state_set, symbol):
        """
        Compute the set of states reachable from state_set on input symbol
        (NOT including ε-closure; that is applied separately).

        Args:
            state_set: frozenset of current states
            symbol   : input symbol (not ε)

        Returns:
            set of states reachable via exactly one 'symbol' transition
        """
        result = set()
        for state in state_set:
            targets = self.transitions.get((state, symbol), set())
            result.update(targets)
        return result

    def to_dict(self):
        """Serialize NFA to a JSON-compatible dictionary."""
        transitions_list = []
        for (state, symbol), targets in self.transitions.items():
            for target in targets:
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
