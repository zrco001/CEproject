// Turns fixtures and case steps into parameterized SQL. Shared by the PostgreSQL spec and the
// offline plan test, so the offline test validates exactly the statements the spec would run.
import type { Step } from './cases.js';
import {
  copyResets,
  fixtureId,
  fixtureRow,
  resolveValue,
  type FixtureRow,
  type Values,
} from './fixtures.js';

export interface Statement {
  readonly table: string;
  readonly kind: 'insert' | 'update' | 'delete';
  /** Column → resolved value (insert / update only). */
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly text: string;
  readonly params: readonly (string | number | boolean | null)[];
}

const resolveAll = (values: Values) =>
  Object.fromEntries(
    Object.entries(values).map(([column, value]) => [column, resolveValue(value)]),
  );

function insert(table: string, values: Statement['values']): Statement {
  const columns = Object.keys(values);
  return {
    table,
    kind: 'insert',
    values,
    text: `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns
      .map((_, i) => `$${i + 1}`)
      .join(', ')})`,
    params: Object.values(values),
  };
}

export const fixtureInsert = (row: FixtureRow): Statement =>
  insert(row.table, resolveAll(row.values));

/** `sequence` keeps the ids of copies unique within one case. */
export function stepStatement(step: Step, sequence: number): Statement {
  if (step.op === 'insert') {
    const base = fixtureRow(step.scope, step.base);
    const values = resolveAll({
      ...base.values,
      ...copyResets(step.scope, base.table),
      ...step.set,
      id: fixtureId(step.scope, 900 + sequence),
    });
    return insert(base.table, values);
  }
  const target = fixtureRow(step.scope, step.target);
  const id = resolveValue(target.values['id'] ?? null);
  if (step.op === 'delete') {
    return {
      table: target.table,
      kind: 'delete',
      values: {},
      text: `DELETE FROM "${target.table}" WHERE "id" = $1`,
      params: [id],
    };
  }
  const values = resolveAll(step.set);
  const columns = Object.keys(values);
  return {
    table: target.table,
    kind: 'update',
    values,
    text: `UPDATE "${target.table}" SET ${columns
      .map((c, i) => `"${c}" = $${i + 1}`)
      .join(', ')} WHERE "id" = $${columns.length + 1}`,
    params: [...Object.values(values), id],
  };
}
