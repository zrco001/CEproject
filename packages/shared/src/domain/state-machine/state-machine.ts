/**
 * Pure-data state machine definitions (ARCHITECTURE.md §7).
 * Backend use cases must go through `assertTransition` / `resolveTransition`; the frontend uses
 * `availableEvents` to decide which actions to show. Guards are documented here but evaluated
 * by the application layer, because they depend on persisted data (e.g. allocated amounts).
 */

export interface Transition<S extends string, E extends string> {
  readonly from: S;
  readonly event: E;
  readonly to: S;
  /** Name of the application-level precondition, for documentation and tests. */
  readonly guard?: string;
}

export interface Creation<S extends string, E extends string> {
  readonly event: E;
  readonly to: S;
}

export interface StateMachineDefinition<S extends string, E extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly creations: readonly Creation<S, E>[];
  readonly transitions: readonly Transition<S, E>[];
  /** States with no outgoing transitions. */
  readonly terminal: readonly S[];
  /** States in which a never-posted record may be hard-deleted (ADR-10). */
  readonly deletable: readonly S[];
}

export type StateMachine<S extends string, E extends string> = StateMachineDefinition<S, E>;

export class StateMachineDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateMachineDefinitionError';
  }
}

export class IllegalStateTransitionError extends Error {
  readonly code = 'ILLEGAL_STATE_TRANSITION';

  constructor(
    readonly machine: string,
    readonly from: string,
    readonly attempted: string,
  ) {
    super(`${machine}: transition "${attempted}" is not allowed from state "${from}".`);
    this.name = 'IllegalStateTransitionError';
  }
}

/** Validates a definition eagerly so a malformed machine fails at import time. */
export function defineStateMachine<const S extends string, const E extends string>(
  definition: StateMachineDefinition<S, E>,
): StateMachine<S, E> {
  const { name, states, creations, transitions, terminal, deletable } = definition;
  const known = new Set<string>(states);
  const check = (state: string, where: string): void => {
    if (!known.has(state)) {
      throw new StateMachineDefinitionError(`${name}: unknown state "${state}" in ${where}.`);
    }
  };

  if (known.size !== states.length) {
    throw new StateMachineDefinitionError(`${name}: duplicate states.`);
  }
  if (creations.length === 0) {
    throw new StateMachineDefinitionError(`${name}: at least one creation is required.`);
  }
  creations.forEach((c) => {
    check(c.to, 'creations');
  });
  terminal.forEach((s) => {
    check(s, 'terminal');
  });
  deletable.forEach((s) => {
    check(s, 'deletable');
  });

  const edges = new Set<string>();
  for (const t of transitions) {
    check(t.from, 'transitions.from');
    check(t.to, 'transitions.to');
    if (t.from === t.to) {
      throw new StateMachineDefinitionError(`${name}: self transition on "${t.from}".`);
    }
    if (terminal.includes(t.from)) {
      throw new StateMachineDefinitionError(
        `${name}: terminal state "${t.from}" has an outgoing transition.`,
      );
    }
    const key = `${t.from}->${t.to}:${t.event}`;
    if (edges.has(key)) {
      throw new StateMachineDefinitionError(`${name}: duplicate transition ${key}.`);
    }
    edges.add(key);
  }

  const reachable = new Set<string>(creations.map((c) => c.to));
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of transitions) {
      if (reachable.has(t.from) && !reachable.has(t.to)) {
        reachable.add(t.to);
        grew = true;
      }
    }
  }
  for (const state of states) {
    if (!reachable.has(state)) {
      throw new StateMachineDefinitionError(`${name}: state "${state}" is unreachable.`);
    }
  }

  return Object.freeze({ ...definition });
}

export function initialState<S extends string, E extends string>(
  machine: StateMachine<S, E>,
  event: E,
): S {
  const creation = machine.creations.find((c) => c.event === event);
  if (!creation) {
    throw new IllegalStateTransitionError(machine.name, '(new)', event);
  }
  return creation.to;
}

/** Whether any transition leads from `from` to `to`. */
export function canTransition<S extends string, E extends string>(
  machine: StateMachine<S, E>,
  from: S,
  to: S,
): boolean {
  return machine.transitions.some((t) => t.from === from && t.to === to);
}

/** Throws unless `from → to` is an allowed edge (used for derived statuses such as Payable). */
export function assertTransition<S extends string, E extends string>(
  machine: StateMachine<S, E>,
  from: S,
  to: S,
): void {
  if (!canTransition(machine, from, to)) {
    throw new IllegalStateTransitionError(machine.name, from, `-> ${to}`);
  }
}

/** Resolves a command (event) to its single target state, or throws. */
export function resolveTransition<S extends string, E extends string>(
  machine: StateMachine<S, E>,
  from: S,
  event: E,
): Transition<S, E> {
  const matches = machine.transitions.filter((t) => t.from === from && t.event === event);
  const [match] = matches;
  if (matches.length !== 1 || match === undefined) {
    throw new IllegalStateTransitionError(machine.name, from, event);
  }
  return match;
}

export function availableEvents<S extends string, E extends string>(
  machine: StateMachine<S, E>,
  from: S,
): readonly E[] {
  return [...new Set(machine.transitions.filter((t) => t.from === from).map((t) => t.event))];
}

export function isTerminal<S extends string, E extends string>(
  machine: StateMachine<S, E>,
  state: S,
): boolean {
  return machine.terminal.includes(state);
}

export function isDeletable<S extends string, E extends string>(
  machine: StateMachine<S, E>,
  state: S,
): boolean {
  return machine.deletable.includes(state);
}
