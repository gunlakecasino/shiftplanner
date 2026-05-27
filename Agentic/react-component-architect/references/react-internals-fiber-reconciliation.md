# React Internals: Fiber, Reconciliation & Render/Commit (2026)

## Core Concepts (from your original article + updates)

- **Components** vs **Instances** vs **React Elements** vs **Fiber nodes**
- Virtual DOM (React Element tree) vs Fiber tree (persistent units of work)
- Render Phase: Interruptible, concurrent, diffing → workInProgress tree
- Commit Phase: Synchronous DOM mutations
- React 19+: Server Components, Actions, Compiler optimizations layered on same Fiber model

Key takeaway for component authors: Write components that play nicely with the scheduler and compiler.