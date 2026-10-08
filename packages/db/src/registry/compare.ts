// Compares a PostgreSQL catalog snapshot with the constraint registry (§6.5 step 3).
// Pure functions: the snapshot is read by ./catalog.ts; offline tests feed synthetic catalogs.
import { REGISTRY, type RegistryEntry } from '../../prisma/constraints.registry.js';

/** pg_constraint.contype */
export type ConstraintType = 'c' | 'f' | 'p' | 'u' | 't' | 'x' | 'n';
/** pg_constraint.confupdtype / confdeltype: a = NO ACTION, r = RESTRICT, c, n, d. */
export type ReferentialAction = 'a' | 'r' | 'c' | 'n' | 'd' | ' ';

export interface CatalogConstraint {
  readonly name: string;
  readonly table: string;
  readonly type: ConstraintType;
  /** pg_get_constraintdef(oid) */
  readonly definition: string;
  readonly onUpdate: ReferentialAction;
  readonly onDelete: ReferentialAction;
}

export interface CatalogIndex {
  readonly name: string;
  readonly table: string;
  /** pg_indexes.indexdef */
  readonly definition: string;
}

export interface CatalogPrivilege {
  readonly table: string;
  readonly role: string;
  readonly privilege: 'UPDATE' | 'DELETE' | 'TRUNCATE';
  readonly granted: boolean;
}

export interface Catalog {
  readonly constraints: readonly CatalogConstraint[];
  readonly indexes: readonly CatalogIndex[];
  /** One row per (table, role, privilege) the registry asks about; absent when the role is missing. */
  readonly privileges: readonly CatalogPrivilege[];
}

export interface RegistryComparison {
  readonly ok: boolean;
  readonly present: readonly string[];
  readonly missing: readonly string[];
  readonly mismatched: readonly string[];
}

/** §6.5 rule 5: RESTRICT or NO ACTION only. */
export const ALLOWED_FK_ACTIONS: ReadonlySet<ReferentialAction> = new Set(['r', 'a']);

const ACTION_NAMES: Record<ReferentialAction, string> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
  ' ': 'NONE',
};

const normalize = (sql: string): string =>
  sql.replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Canonical form of a boolean SQL expression, so the text written in the migration compares
 * equal to PostgreSQL's deparsed form. PostgreSQL adds parentheses and casts (e.g.
 * `'COMPANY'::"FeeBearer"`, `(0)::numeric`) and rewrites `x NOT IN (a, b)` as
 * `x <> ALL (ARRAY[a, b])` and `BETWEEN` as `>= AND <=`; those forms are mapped back first.
 * Operators, operands and AND / OR order are kept, so a removed or changed condition no longer
 * matches (same approach as the Gate 0 PoC registry).
 */
export function normalizeCheck(sql: string): string {
  return sql
    .replace(/^\s*CHECK\s*/i, '')
    .replace(/::(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)(?:\[\])?/g, '')
    .replaceAll('"', '')
    .replace(/<>\s*ALL\s*\(+\s*ARRAY\s*\[([^\]]*)\]\s*\)+/gi, 'NOT IN ($1)')
    .replace(
      /\(?\s*(\w+)\s*>=\s*\(?\s*([\w.']+)\s*\)?\s*\)?\s+AND\s+\(?\s*\1\s*<=\s*\(?\s*([\w.']+)\s*\)?\s*\)?/gi,
      ' $1 BETWEEN $2 AND $3 ',
    )
    .replace(/[()]/g, ' ')
    .replace(/,/g, ' , ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface ParsedIndex {
  readonly unique: boolean;
  readonly columns: readonly string[];
  readonly predicate: string | null;
}

/** Parses `CREATE [UNIQUE] INDEX name ON schema.table USING method (cols) [WHERE (...)]`. */
export function parseIndexDefinition(definition: string): ParsedIndex | null {
  const match = /^create (unique )?index \S+ on \S+ using \w+ \(([^()]*)\)(?: where (.*))?$/.exec(
    normalize(definition),
  );
  if (!match) return null;
  return {
    unique: match[1] !== undefined,
    columns: (match[2] ?? '').split(',').map((column) => column.trim()),
    predicate: match[3] ?? null,
  };
}

const sameColumns = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length &&
  actual.every((column, i) => column === expected[i]?.toLowerCase());

function matchEntry(entry: RegistryEntry, catalog: Catalog): 'present' | 'missing' | 'mismatched' {
  const constraint = catalog.constraints.find(
    (c) => c.name === entry.name && c.table === entry.table,
  );
  const index = catalog.indexes.find((i) => i.name === entry.name && i.table === entry.table);

  switch (entry.kind) {
    case 'unique_target':
    case 'unique_index': {
      if (constraint) {
        const ok =
          constraint.type === 'u' &&
          normalize(constraint.definition) ===
            `unique (${entry.columns.map((c) => c.toLowerCase()).join(', ')})`;
        return ok ? 'present' : 'mismatched';
      }
      if (!index) return 'missing';
      const parsed = parseIndexDefinition(index.definition);
      const ok =
        parsed !== null &&
        parsed.unique &&
        parsed.predicate === null &&
        sameColumns(parsed.columns, entry.columns);
      return ok ? 'present' : 'mismatched';
    }
    case 'partial_unique_index': {
      if (!index) return 'missing';
      const parsed = parseIndexDefinition(index.definition);
      const ok =
        parsed !== null &&
        parsed.unique &&
        parsed.predicate !== null &&
        sameColumns(parsed.columns, entry.columns) &&
        normalizeCheck(parsed.predicate) === normalizeCheck(entry.predicate);
      return ok ? 'present' : 'mismatched';
    }
    case 'composite_fk': {
      if (!constraint) return 'missing';
      const definition = normalize(constraint.definition);
      const expected =
        `foreign key (${entry.columns.join(', ')}) references ${entry.references.table}(${entry.references.columns.join(', ')})`.toLowerCase();
      const ok =
        constraint.type === 'f' &&
        definition.startsWith(expected) &&
        !definition.includes('match full') &&
        ALLOWED_FK_ACTIONS.has(constraint.onUpdate) &&
        ALLOWED_FK_ACTIONS.has(constraint.onDelete);
      return ok ? 'present' : 'mismatched';
    }
    case 'check': {
      if (!constraint) return 'missing';
      const ok =
        constraint.type === 'c' &&
        normalizeCheck(constraint.definition) === normalizeCheck(entry.condition);
      return ok ? 'present' : 'mismatched';
    }
    case 'revoked_privileges': {
      const rows = catalog.privileges.filter(
        (p) => p.table === entry.table && p.role === entry.role,
      );
      if (entry.privileges.some((privilege) => !rows.some((r) => r.privilege === privilege))) {
        return 'missing';
      }
      return rows.some((r) => entry.privileges.includes(r.privilege) && r.granted)
        ? 'mismatched'
        : 'present';
    }
  }
}

/** Every registry entry must exist with the expected definition. */
export function compareWithRegistry(
  catalog: Catalog,
  registry: readonly RegistryEntry[] = REGISTRY,
): RegistryComparison {
  const present: string[] = [];
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const entry of registry) {
    const result = matchEntry(entry, catalog);
    if (result === 'present') present.push(entry.name);
    else if (result === 'missing') missing.push(entry.name);
    else mismatched.push(entry.name);
  }
  return { ok: missing.length === 0 && mismatched.length === 0, present, missing, mismatched };
}

export interface ForeignKeyAudit {
  readonly ok: boolean;
  readonly foreignKeys: readonly string[];
  readonly violations: readonly string[];
}

/** §6.5 rule 5: every foreign key in the schema is RESTRICT / NO ACTION on update and delete. */
export function auditForeignKeyActions(catalog: Catalog): ForeignKeyAudit {
  const describe = (c: CatalogConstraint): string =>
    `${c.table}.${c.name}: ON UPDATE ${ACTION_NAMES[c.onUpdate]}, ON DELETE ${ACTION_NAMES[c.onDelete]}`;
  const foreignKeys = catalog.constraints.filter((c) => c.type === 'f');
  const violations = foreignKeys.filter(
    (c) => !ALLOWED_FK_ACTIONS.has(c.onUpdate) || !ALLOWED_FK_ACTIONS.has(c.onDelete),
  );
  return {
    ok: foreignKeys.length > 0 && violations.length === 0,
    foreignKeys: foreignKeys.map(describe),
    violations: violations.map(describe),
  };
}
