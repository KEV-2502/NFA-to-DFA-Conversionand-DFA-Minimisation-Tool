# Project Context: Automata Converter and Minimizer

This project is a full-stack web application designed to demonstrate and perform core Theory of Computation (TOC) operations: **NFA to DFA conversion** (via subset construction) and **DFA minimization** (via the table-filling algorithm).

## 🚀 Overview
The tool allows users to input finite automata either via a **5-tuple text format** or an **interactive diagram editor**. It then processes the input on the backend and returns the resulting automaton along with step-by-step logical explanations.

## 🛠 Tech Stack
- **Backend**: Python 3, Flask, Flask-CORS.
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+).
- **Visualization**: HTML5 Canvas for interactive diagram editing and result rendering.

## 📂 Directory Structure
- `backend/`
  - `app.py`: Flask entry point and API route definitions.
  - `converter.py`: Implements the subset construction algorithm for NFA → DFA.
  - `minimizer.py`: Implements the table-filling algorithm for DFA minimization.
  - `nfa.py` / `dfa.py`: Core classes representing the automata structures.
  - `validator.py`: Logic to parse and validate input from both text and diagram modes.
  - `tests.py`: Unit tests for the conversion and minimization logic.
- `frontend/`
  - `index.html`: Main UI layout.
  - `style.css`: Modern, clean styling for the dashboard.
  - `js/api.js`: Handles fetch requests to the Flask backend.
  - `js/diagram-editor.js`: Interactive canvas logic for creating states and transitions.
  - `js/diagram-renderer.js`: Logic for rendering automaton graphs on canvas.
  - `js/ui.js`: Manages DOM updates, tabs, and results display.
  - `js/main.js`: Application controller and event orchestration.

## 🔌 API Endpoints
### `POST /api/process`
Processes the automaton based on the requested action.
- **Input JSON**:
  ```json
  {
    "input_mode": "text" | "diagram",
    "action": "convert" | "minimize" | "convert_minimize",
    "data": { ... }
  }
  ```
- **Output JSON**: Returns the original automaton, the result automaton, step-by-step logic, and statistics.

### `POST /api/validate`
Validates the input and detects whether it represents an NFA or DFA.

## 🧠 Core Algorithms
1. **NFA to DFA (Subset Construction)**:
   - Computes $\epsilon$-closures for all states.
   - Iteratively builds DFA states as sets of NFA states.
   - Maps transitions based on the union of NFA transitions for the subset.
2. **DFA Minimization (Table Filling)**:
   - Removes unreachable states first.
   - Uses a 2D table to mark pairs of states $(p, q)$ as distinguishable if $p \in F$ and $q \notin F$ (or vice versa).
   - Iteratively marks pairs $(p, q)$ as distinguishable if for some symbol $a$, the pair $(\delta(p, a), \delta(q, a))$ is already marked.
   - Merges indistinguishable states into a single state.

## 🎨 Interactive Features
- **Diagram Editor**: Add states by clicking, create transitions by dragging between states, and toggle "Final State" status.
- **Step-by-Step Walkthrough**: The UI displays the logical steps taken by the backend (e.g., "$\epsilon$-closure of $\{q0\}$ is $\{q0, q1\}$").
- **Live Validation**: As the user types the 5-tuple, the UI detects if the input is an NFA or DFA in real-time.
- **Visual Results**: Dynamic rendering of the output automaton using a custom graph layout on the canvas.
