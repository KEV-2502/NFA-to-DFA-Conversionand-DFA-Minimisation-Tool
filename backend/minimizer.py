"""
minimizer.py - DFA minimization using the Table-Filling (Myhill-Nerode) algorithm.

Algorithm Overview:
  1. Remove unreachable states from the DFA.
  2. Initialize a distinction table: mark pairs (p, q) as distinguishable if
     exactly one of {p, q} is a final state (base case).
  3. Iteratively mark pairs (p, q) as distinguishable if there exists some
     symbol a such that (δ(p,a), δ(q,a)) is already marked distinguishable.
  4. Repeat until no new pairs are marked.
  5. States that remain unmarked (indistinguishable) are merged into equivalence classes.
  6. Build the minimized DFA from the merged classes.
"""

from dfa import DFA


def _get_reachable_states(dfa: DFA) -> set:
    """
    Return the set of states reachable from the start state via BFS.

    States not reachable from the start can be safely removed before minimization.
    """
    reachable = set()
    queue = [dfa.start_state]
    while queue:
        state = queue.pop(0)
        if state in reachable:
            continue
        reachable.add(state)
        for symbol in dfa.alphabet:
            next_state = dfa.transitions.get((state, symbol))
            if next_state and next_state not in reachable:
                queue.append(next_state)
    return reachable


def _complete_dfa(dfa: DFA) -> DFA:
    """
    Return a new DFA that is guaranteed to be complete (every state has a transition
    for every symbol in the alphabet). Missing transitions are pointed to a dead state '∅'.
    """
    states_list = sorted(list(dfa.states))
    alphabet = sorted(list(dfa.alphabet))
    
    dead_state_name = '∅'
    needs_dead_state = False
    new_transitions = dfa.transitions.copy()
    
    for state in states_list:
        for symbol in alphabet:
            if (state, symbol) not in new_transitions:
                new_transitions[(state, symbol)] = dead_state_name
                needs_dead_state = True
                
    full_states = set(dfa.states)
    if needs_dead_state:
        full_states.add(dead_state_name)
        # Dead state loops back to itself on all symbols
        for symbol in alphabet:
            new_transitions[(dead_state_name, symbol)] = dead_state_name
            
    return DFA(full_states, dfa.alphabet, new_transitions, dfa.start_state, dfa.final_states)


def minimize_dfa(dfa: DFA) -> DFA:
    """
    Minimize a DFA using the table-filling (Myhill-Nerode) method.

    Args:
        dfa: a DFA instance

    Returns:
        A minimized DFA instance.
    """

    # --- Step 0: Ensure the DFA is complete ---
    complete_dfa = _complete_dfa(dfa)

    # --- Step 1: Remove unreachable states ---
    reachable = _get_reachable_states(complete_dfa)
    states = sorted(list(reachable))
    final_states = complete_dfa.final_states & reachable

    if len(states) <= 1:
        return complete_dfa

    # --- Step 2: Initialize the distinguishability table ---
    distinguishable = set()

    for i, p in enumerate(states):
        for q in states[i+1:]:
            if (p in final_states) != (q in final_states):
                distinguishable.add(frozenset({p, q}))

    # --- Step 3: Iteratively mark distinguishable pairs ---
    changed = True
    while changed:
        changed = False
        for i, p in enumerate(states):
            for q in states[i+1:]:
                pair = frozenset({p, q})
                if pair in distinguishable:
                    continue

                for symbol in complete_dfa.alphabet:
                    dp = complete_dfa.transitions.get((p, symbol))
                    dq = complete_dfa.transitions.get((q, symbol))
                    
                    if dp == dq:
                        continue
                    if frozenset({dp, dq}) in distinguishable:
                        distinguishable.add(pair)
                        changed = True
                        break

    # --- Step 4: Build equivalence classes (union-find style) ---
    # States NOT in any distinguishable pair can be merged
    # Use a parent map for union-find
    parent = {s: s for s in states}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # path compression
            x = parent[x]
        return x

    def union(x, y):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[ry] = rx

    for i, p in enumerate(states):
        for q in states[i+1:]:
            if frozenset({p, q}) not in distinguishable:
                # p and q are indistinguishable → merge them
                union(p, q)

    # --- Step 5: Build the minimized DFA ---
    # Group states by their representative (root of union-find tree)
    groups = {}
    for s in states:
        rep = find(s)
        groups.setdefault(rep, []).append(s)

    # Name each group by its representative
    start_rep = find(complete_dfa.start_state)
    alphabet = sorted(list(complete_dfa.alphabet))

    def group_name(rep):
        """Create a human-readable name for a merged group."""
        members = sorted(groups[rep])
        if len(members) == 1:
            return members[0]
        return '{' + ','.join(members) + '}'

    # Build new state names
    rep_to_name = {rep: group_name(rep) for rep in groups}

    new_start = rep_to_name[start_rep]
    new_finals = {rep_to_name[find(s)] for s in final_states if find(s) in rep_to_name}
    new_states = set(rep_to_name.values())

    # Build new transition function
    new_transitions_result = {}
    for rep in groups:
        representative_state = groups[rep][0]
        from_name = rep_to_name[rep]
        for symbol in alphabet:
            target = complete_dfa.transitions.get((representative_state, symbol))
            if target is not None:
                target_rep = find(target)
                if target_rep in rep_to_name:
                    new_transitions_result[(from_name, symbol)] = rep_to_name[target_rep]

    return DFA(
        states=new_states,
        alphabet=set(alphabet),
        transitions=new_transitions_result,
        start_state=new_start,
        final_states=new_finals
    )


def get_minimization_steps(dfa: DFA) -> dict:
    """
    Return step-by-step details of the minimization process for UI display.
    """
    # Use the same completion and reachability logic as minimize_dfa
    complete_dfa = _complete_dfa(dfa)
    reachable = _get_reachable_states(complete_dfa)
    unreachable = dfa.states - reachable
    states = sorted(list(reachable))
    final_states = complete_dfa.final_states & reachable

    distinguishable = set()
    initial_pairs = []

    for i, p in enumerate(states):
        for q in states[i+1:]:
            if (p in final_states) != (q in final_states):
                pair = frozenset({p, q})
                distinguishable.add(pair)
                initial_pairs.append(sorted([p, q]))

    changed = True
    while changed:
        changed = False
        for i, p in enumerate(states):
            for q in states[i+1:]:
                pair = frozenset({p, q})
                if pair in distinguishable:
                    continue
                for symbol in complete_dfa.alphabet:
                    dp = complete_dfa.transitions.get((p, symbol))
                    dq = complete_dfa.transitions.get((q, symbol))
                    
                    if dp != dq and frozenset({dp, dq}) in distinguishable:
                        distinguishable.add(pair)
                        changed = True
                        break

    parent = {s: s for s in states}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[ry] = rx

    for i, p in enumerate(states):
        for q in states[i+1:]:
            if frozenset({p, q}) not in distinguishable:
                union(p, q)

    groups = {}
    for s in states:
        rep = find(s)
        groups.setdefault(rep, []).append(s)

    merged_groups = [sorted(g) for g in groups.values() if len(g) > 1]
    singleton_groups = [sorted(g) for g in groups.values() if len(g) == 1]

    return {
        'reachable': states,
        'unreachable': sorted(unreachable),
        'initial_distinguishable': initial_pairs,
        'all_distinguishable': [sorted(p) for p in distinguishable],
        'merged_groups': merged_groups,
        'singleton_groups': singleton_groups
    }
