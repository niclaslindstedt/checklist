// The side-effects the pure domain functions deliberately avoid: a unique
// id source and a wall clock. The checklist hooks inject these at the call
// sites so `src/domain/` stays a pure function of its inputs (no
// `crypto`, no `Date.now()`), and so the two hooks that need them
// (`use-checklist`, `use-checklist-edits`) share one definition.

export const newId = (): string => crypto.randomUUID();
export const now = (): string => new Date().toISOString();
