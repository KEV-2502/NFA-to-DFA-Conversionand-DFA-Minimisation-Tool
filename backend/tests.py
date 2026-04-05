import unittest
from nfa import NFA, EPSILON
from dfa import DFA
from converter import nfa_to_dfa
from minimizer import minimize_dfa
from validator import parse_automaton

class TestAutomata(unittest.TestCase):

    def test_nfa_epsilon_closure(self):
        # q0 --e--> q1 --e--> q2
        transitions = {
            ('q0', EPSILON): {'q1'},
            ('q1', EPSILON): {'q2'}
        }
        nfa = NFA({'q0', 'q1', 'q2'}, {'a'}, transitions, 'q0', {'q2'})
        self.assertEqual(nfa.epsilon_closure({'q0'}), frozenset({'q0', 'q1', 'q2'}))

    def test_nfa_to_dfa_simple(self):
        # NFA for (a|b)*abb
        # q0 --a,b--> q0; q0 --a--> q1; q1 --b--> q2; q2 --b--> q3 (final)
        transitions = {
            ('q0', 'a'): {'q0', 'q1'},
            ('q0', 'b'): {'q0'},
            ('q1', 'b'): {'q2'},
            ('q2', 'b'): {'q3'}
        }
        nfa = NFA({'q0', 'q1', 'q2', 'q3'}, {'a', 'b'}, transitions, 'q0', {'q3'})
        dfa = nfa_to_dfa(nfa)
        
        # Verify it's a DFA
        self.assertIsInstance(dfa, DFA)
        # Check alphabet
        self.assertEqual(dfa.alphabet, {'a', 'b'})
        # Verify it's complete (every state has a transition for every symbol)
        for state in dfa.states:
            for char in dfa.alphabet:
                self.assertIn((state, char), dfa.transitions)

    def test_dfa_minimization(self):
        # Simple DFA that can be minimized
        # q0 --a--> q1; q1 --a--> q0
        # Both q0, q1 final? No, that's trivial.
        # q0 --a--> q1, q2 --a--> q1, q1 --a--> q1
        # q0, q2 are indistinguishable
        transitions = {
            ('q0', 'a'): 'q1',
            ('q1', 'a'): 'q1',
            ('q2', 'a'): 'q1'
        }
        dfa = DFA({'q0', 'q1', 'q2'}, {'a'}, transitions, 'q0', {'q1'})
        min_dfa = minimize_dfa(dfa)
        
        # q0 and q2 should be merged because they both go to q1 on 'a' and are both non-final
        # Result should have 2 states: {q0, q2} and {q1}
        self.assertEqual(len(min_dfa.states), 2)

    def test_bug_case_empty_nfa(self):
        # Test with minimum possible automaton
        data = {
            'states': 'q0',
            'alphabet': 'a',
            'transitions': 'q0,a=q0',
            'start_state': 'q0',
            'final_states': 'q0'
        }
        automaton, auto_type = parse_automaton(data)
        self.assertEqual(auto_type, 'DFA')
        
    def test_minimizer_unreachable_states(self):
        # q0 --a--> q1, q2 (unreachable)
        transitions = {
            ('q0', 'a'): 'q1',
            ('q1', 'a'): 'q1',
            ('q2', 'a'): 'q1'
        }
        dfa = DFA({'q0', 'q1', 'q2'}, {'a'}, transitions, 'q0', {'q1'})
        min_dfa = minimize_dfa(dfa)
        self.assertNotIn('q2', min_dfa.states)
        # Check if the merged state name doesn't include q2 if it was unreachable
        for s in min_dfa.states:
            self.assertNotIn('q2', s)

    def test_nfa_to_dfa_epsilon(self):
        # NFA with epsilon: (a|e)b
        # q0 --a--> q1; q0 --e--> q1; q1 --b--> q2 (final)
        transitions = {
            ('q0', 'a'): {'q1'},
            ('q0', EPSILON): {'q1'},
            ('q1', 'b'): {'q2'}
        }
        nfa = NFA({'q0', 'q1', 'q2'}, {'a', 'b'}, transitions, 'q0', {'q2'})
        dfa = nfa_to_dfa(nfa)
        
        # Test input string "b" (should be accepted)
        # In DFA, the start state is e-closure({q0}) = {q0, q1}
        # On 'b', {q0, q1} --b--> {q2} (because q1--b-->q2)
        # {q2} is final
        start_state = dfa.start_state
        next_state = dfa.transitions.get((start_state, 'b'))
        self.assertIn(next_state, dfa.final_states)

    def test_dfa_minimization_complex(self):
        # Standard textbook example for minimization
        # States: q0-q5. Alphabet: 0, 1
        # q0,q1: non-final; q2,q3,q4,q5: final
        # transitions:
        # q0,0=q1, q0,1=q2
        # q1,0=q0, q1,1=q3
        # q2,0=q4, q2,1=q5
        # q3,0=q4, q3,1=q5
        # q4,0=q4, q4,1=q5
        # q5,0=q5, q5,1=q5
        transitions = {
            ('q0', '0'): 'q1', ('q0', '1'): 'q2',
            ('q1', '0'): 'q0', ('q1', '1'): 'q3',
            ('q2', '0'): 'q4', ('q2', '1'): 'q5',
            ('q3', '0'): 'q4', ('q3', '1'): 'q5',
            ('q4', '0'): 'q4', ('q4', '1'): 'q5',
            ('q5', '0'): 'q5', ('q5', '1'): 'q5',
        }
        states = {'q0', 'q1', 'q2', 'q3', 'q4', 'q5'}
        final_states = {'q2', 'q3', 'q4', 'q5'}
        dfa = DFA(states, {'0', '1'}, transitions, 'q0', final_states)
        min_dfa = minimize_dfa(dfa)
        
        # q2, q3, q4, q5 should all be merged eventually? 
        # q4 and q5 are identical (both go to q4,q5)
        # q2 and q3 go to q4,q5 on 0,1. So they are equivalent to q4,q5?
        # Let's check:
        # q4: 0->q4, 1->q5.  q5: 0->q5, 1->q5. 
        # Wait, q4 and q5 are NOT equivalent because q4,0=q4 while q5,0=q5.
        # But wait, both q4 and q5 are final.
        # If we merge q4 and q5 into {q4,q5}:
        # {q4,q5},0 = {q4,q5}, {q4,q5},1 = {q4,q5}
        # Yes, they are equivalent.
        # Then q2: 0->q4, 1->q5. Both go to {q4,q5}. 
        # So q2 is also equivalent to {q4,q5}? 
        # Yes, if q2 is final and goes to final states that are equivalent.
        # So q2, q3, q4, q5 should all be merged.
        # q0 and q1: q0,0=q1, q1,0=q0. Both go to equivalent states on 1 (q2 and q3).
        # So q0 and q1 are equivalent?
        # q0,0=q1, q1,0=q0. 
        # q0,1=q2, q1,1=q3. Since q2~q3, then q0~q1.
        # So result should have 2 states: {q0, q1} and {q2, q3, q4, q5}.
        self.assertEqual(len(min_dfa.states), 2)

    def test_dfa_minimization_incomplete(self):
        # q0 --a--> q1; q2 --a--> q1 (q0, q2 non-final, q1 final)
        # q0 has no transition on 'b', q2 has no transition on 'b'
        # They should be merged.
        # Made complete: q0,b=∅; q2,b=∅; q1,b=∅; ∅,a/b=∅
        # q0, q2 are equivalent.
        # Result: {q0,q2}, {q1}, {∅}
        transitions = {
            ('q0', 'a'): 'q1',
            ('q1', 'a'): 'q1',
            ('q2', 'a'): 'q1'
        }
        dfa = DFA({'q0', 'q1', 'q2'}, {'a', 'b'}, transitions, 'q0', {'q1'})
        min_dfa = minimize_dfa(dfa)
        # Expect 3 states: {q0, q2}, {q1}, and {∅}
        self.assertEqual(len(min_dfa.states), 3)
        
        # Now make them different: q0,b=q2, q2,b=∅, q0,a=q1
        transitions_diff = {
            ('q0', 'a'): 'q1', ('q0', 'b'): 'q2',
            ('q1', 'a'): 'q1', ('q1', 'b'): 'q1',
            ('q2', 'a'): 'q1', ('q2', 'b'): '∅'
        }
        dfa_diff = DFA({'q0', 'q1', 'q2', '∅'}, {'a', 'b'}, transitions_diff, 'q0', {'q1'})
        min_dfa_diff = minimize_dfa(dfa_diff)
        # q0, q1, q2, ∅ are all reachable now.
        # q0: non-final, q0,a=q1(F), q0,b=q2(NF)
        # q2: non-final, q2,a=q1(F), q2,b=∅(NF)
        # Wait, q0 and q2 might still be equivalent if q2 is equivalent to ∅?
        # No, ∅,b=∅, q2,b=∅. But q0,b=q2. 
        # Let's check: q0,b=q2, q2,b=∅. If q2 ~ ∅, then q0 ~ q2?
        # ∅,a=∅, q2,a=q1. Since q1(F) and ∅(NF), q2 and ∅ are distinguishable.
        # Since q2 and ∅ are distinguishable, and q0,b=q2, q2,b=∅, then q0 and q2 are distinguishable.
        # Result: {q0}, {q1}, {q2}, {∅} -> 4 states.
        self.assertEqual(len(min_dfa_diff.states), 4)

if __name__ == '__main__':
    unittest.main()
