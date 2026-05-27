---
name: react-component-architect
version: 1.0.0
description: Expert skill for designing, reviewing, and building world-class, thoughtful, cutting-edge React components in 2026 (React 19+, RSC, Compiler, Fiber-aware)
tags: [react, nextjs, frontend, architecture, performance, accessibility, components]
author: Grok (with Brian)
---

# React Component Architect Skill

**Purpose**: Help you design, architect, review, and implement **world-class React components** that are:
- Thoughtful and delightful to use
- Performant and Fiber/Reconciler-friendly
- React 19+ and React Compiler optimized
- Accessible by default
- Composable and maintainable
- RSC-first where appropriate

## Core Philosophy (Grounded in React Internals)

1. **Understand the Runtime**: Components are blueprints → Instances have state/lifecycle → Elements are immutable descriptions → Fiber tree is the real source of truth (mutable units of work).
2. **Render Phase is Cheap**: Do heavy work in render if pure. Avoid unnecessary work that causes re-renders.
3. **Commit Phase is Expensive**: Minimize DOM mutations.
4. **Compiler is Your Friend**: Write code that the React Compiler can optimize (no manual memoization needed in most cases).
5. **Server Components First**: Push data fetching, logic to server unless interactivity is required.

## When to Use This Skill
- "Design a world-class [Component]"
- "Review this component for modern best practices"
- "Refactor X for performance / accessibility / API quality"
- Building any major UI piece in ZDS/OMS or other apps.

## Design Process (Follow This)

1. **Understand Requirements** — Domain, users (grave shift ops), edge cases, fairness/visibility needs.
2. **Decide Server vs Client Boundary** — Can this be mostly RSC? Use `'use client'` sparingly.
3. **API Design** — Thoughtful props, compound components, slots, or headless + styled.
4. **Accessibility First** — Use Radix primitives or build with ARIA.
5. **Performance** — Stable keys, virtualization if lists, `useTransition`, optimistic updates.
6. **TypeScript + DX** — Excellent types, clear JSDoc, Storybook-ready.
7. **Polish** — Loading states, error boundaries, animations (where appropriate), dark mode.

## Key Patterns to Apply (2026)

- **Compound Components** or **Slots** for complex UIs (ZoneCard, DeploymentPanel)
- **Headless + Variants** (cva + tailwind or similar)
- **Server Actions + useOptimistic + useFormStatus**
- **React Compiler-friendly code** (pure functions, stable callbacks)
- **Virtualization** (TanStack Virtual) for large lists
- **Streaming + Suspense** for better perceived performance

## Common Pitfalls to Avoid
- Over-use of `'use client'`
- Unstable keys or array index keys
- Excessive re-renders
- Poor accessibility (missing labels, keyboard traps)
- Bloated prop APIs instead of composition

**References** available in `/references/` folder.
