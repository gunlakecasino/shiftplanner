// sb-reducer.jsx
// Predictable deployment state via useReducer.
// Undo/redo are first-class actions — no parallel stacks in component state.
// All mutations are pure and Fiber-scheduler-friendly (no side effects in reducer).

// ─── Action types ────────────────────────────────────────────────────────────
const A = {
  ASSIGN_TM:    'ASSIGN_TM',    // { slot, tm: {id,name,full,pool,hours} }
  CLEAR_SLOT:   'CLEAR_SLOT',   // { slot }
  ADD_TASK:     'ADD_TASK',     // { slot, text }
  REMOVE_TASK:  'REMOVE_TASK',  // { slot, idx }
  SET_BREAK:    'SET_BREAK',    // { slot, group: 0|1|2|3 }
  TOGGLE_LOCK:  'TOGGLE_LOCK',  // { slot }
  UNDO:         'UNDO',
  REDO:         'REDO',
};

const MAX_HISTORY = 40;

// ─── Initial state ────────────────────────────────────────────────────────────
function makeInitialDeployState() {
  return {
    present: structuredClone(SB_ASSIGNMENTS), // current board
    past:    [],                               // undo stack (oldest first)
    future:  [],                               // redo stack
  };
}

// ─── Pure reducer ─────────────────────────────────────────────────────────────
// Write every branch as a pure transformation — no mutation of state,
// no side effects, no async. The Fiber scheduler can safely interrupt and
// replay this without observable differences.
function deploymentReducer(state, action) {
  switch (action.type) {

    case A.ASSIGN_TM: {
      const { slot, tm } = action;
      const next = { ...state.present };
      // Evict TM from their current slot
      Object.keys(next).forEach(k => {
        if (next[k]?.tmId === tm.id) {
          next[k] = { ...next[k], tmId: null, tmName: null };
        }
      });
      next[slot] = {
        ...(next[slot] || { tasks: [], breakGroup: 0, isLocked: false }),
        tmId: tm.id,
        tmName: tm.name,
      };
      return commit(state, next);
    }

    case A.CLEAR_SLOT: {
      const { slot } = action;
      const next = { ...state.present };
      next[slot] = { tmId: null, tmName: null, breakGroup: 0, tasks: [], isLocked: false };
      return commit(state, next);
    }

    case A.ADD_TASK: {
      const { slot, text } = action;
      if (!text?.trim()) return state;
      const prev = state.present[slot] || { tasks: [] };
      const next = { ...state.present };
      next[slot] = { ...prev, tasks: [...(prev.tasks || []), text.trim()] };
      return commit(state, next);
    }

    case A.REMOVE_TASK: {
      const { slot, idx } = action;
      const prev = state.present[slot];
      if (!prev) return state;
      const next = { ...state.present };
      next[slot] = { ...prev, tasks: prev.tasks.filter((_, i) => i !== idx) };
      return commit(state, next);
    }

    case A.SET_BREAK: {
      const { slot, group } = action;
      const prev = state.present[slot] || {};
      if (prev.breakGroup === group) return state; // no-op — stable ref
      const next = { ...state.present };
      next[slot] = { ...prev, breakGroup: group };
      return commit(state, next);
    }

    case A.TOGGLE_LOCK: {
      const { slot } = action;
      const prev = state.present[slot] || {};
      const next = { ...state.present };
      next[slot] = { ...prev, isLocked: !prev.isLocked };
      return commit(state, next);
    }

    case A.UNDO: {
      if (!state.past.length) return state;
      const past = [...state.past];
      const present = past.pop();
      return {
        present,
        past,
        future: [state.present, ...state.future].slice(0, MAX_HISTORY),
      };
    }

    case A.REDO: {
      if (!state.future.length) return state;
      const [present, ...future] = state.future;
      return {
        present,
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        future,
      };
    }

    default: return state;
  }
}

// Push current present → past, apply next as new present, clear future.
function commit(state, next) {
  return {
    present: next,
    past: [...state.past, state.present].slice(-MAX_HISTORY),
    future: [], // new branch erases redo tree
  };
}

// ─── Derived selectors (pure functions — memoize at call site) ────────────────
const selectors = {
  placedCount(assignments) {
    const allKeys = [
      ...SB_ZONES.map(z => z.key),
      ...SB_RR.flatMap(rr => [`MRR${rr.num}`, `WRR${rr.num}`]),
      ...SB_AUX.map(a => a.key),
      ...SB_OVERLAPS.pm,
      ...SB_OVERLAPS.am,
    ];
    const total = allKeys.length;
    const placed = allKeys.filter(k => assignments[k]?.tmName).length;
    return { placed, total };
  },

  placementMap(assignments) {
    const m = {};
    Object.entries(assignments).forEach(([slot, a]) => {
      if (a?.tmId) m[a.tmId] = slot;
    });
    return m;
  },

  conflictSlots(assignments) {
    // Return a Set of slot keys whose TM is also placed in another slot
    const tmToSlots = {};
    Object.entries(assignments).forEach(([slot, a]) => {
      if (a?.tmId) {
        if (!tmToSlots[a.tmId]) tmToSlots[a.tmId] = [];
        tmToSlots[a.tmId].push(slot);
      }
    });
    const conflicts = new Set();
    Object.values(tmToSlots).forEach(slots => {
      if (slots.length > 1) slots.forEach(s => conflicts.add(s));
    });
    return conflicts;
  },

  // Ordered slot list for keyboard navigation across the sheet grid.
  // Mirrors the visual top-to-bottom, left-to-right reading order.
  orderedSlots: [
    ...SB_ZONES.map(z => z.key),
    ...SB_RR.flatMap(rr => [`MRR${rr.num}`, `WRR${rr.num}`]),
    ...SB_AUX.map(a => a.key),
    ...SB_OVERLAPS.pm,
    ...SB_OVERLAPS.am,
  ],
};

Object.assign(window, { deploymentReducer, makeInitialDeployState, A, selectors });
