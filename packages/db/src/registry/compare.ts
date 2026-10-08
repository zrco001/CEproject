// Compares a PostgreSQL catalog snapshot with the constraint registry (§6.5 step 3).
// Pure functions: the snapshot is read by ./catalog.ts; offline tests feed synthetic catalogs.
import { REGISTRY, type RegistryEntry } from '../../prisma/constraints.registry.js';
import { canonicalExpression } from './expression.js';

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
  /** pg_constraint.convalidated: false for NOT VALID constraints; absent counts as false. */
  readonly validated?: boolean;
}

export interface CatalogIndex {
  readonly name: string;
  readonly table: string;
  /** pg_get_indexdef(indexrelid) (same text as pg_indexes.indexdef) */
  readonly definition: string;
  /**
   * pg_index.indisvalid / indisready / indislive (Codex review of 683606122, finding P2).
   * Absent state counts as false, so incomplete metadata fails closed.
   */
  readonly valid?: boolean;
  readonly ready?: boolean;
  readonly live?: boolean;
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
 * Structural canonical form of a CHECK body or index predicate (see ./expression.ts). Grouping
 * and operator precedence are preserved; unsupported syntax throws.
 */
export function normalizeCheck(sql: string): string {
  return canonicalExpression(sql);
}

/** True when both expressions have the same tree; unsupported syntax on either side is false. */
export function sameExpression(actual: string, expected: string): boolean {
  try {
    return canonicalExpression(actual) === canonicalExpression(expected);
  } catch {
    return false;
  }
}

interface ParsedIndex {
  readonly unique: boolean;
  readonly columns: readonly string[];
  readonly predicate: string | null;
}

/**
 * Parses `CREATE [UNIQUE] INDEX name ON schema.table USING method (cols) [WHERE (...)]`.
 * Columns are lower-cased without quotes; the predicate keeps its original text (string
 * literals are case-sensitive) for sameExpression.
 */
export function parseIndexDefinition(definition: string): ParsedIndex | null {
  const match =
    /^\s*CREATE (UNIQUE )?INDEX \S+ ON \S+ USING \w+ \(([^()]*)\)(?: WHERE (.*?))?\s*$/is.exec(
      definition,
    );
  if (!match) return null;
  return {
    unique: match[1] !== undefined,
    columns: (match[2] ?? '').split(',').map((column) => normalize(column)),
    predicate: match[3] ?? null,
  };
}

const sameColumns = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length &&
  actual.every((column, i) => column === expected[i]?.toLowerCase());

/** Only an index that is valid, ready and live enforces uniqueness; missing state fails. */
const usableIndex = (index: CatalogIndex | undefined): index is CatalogIndex =>
  index !== undefined && index.valid === true && index.ready === true && index.live === true;

/** Text after `REFERENCES t(cols)` may only list RESTRICT / NO ACTION actions (no MATCH FULL,
 * DEFERRABLE or NOT VALID). */
const PLAIN_FK_SUFFIX = /^(?: on (?:update|delete) (?:restrict|no action))*$/;

function matchEntry(entry: RegistryEntry, catalog: Catalog): 'present' | 'missing' | 'mismatched' {
  const constraint = catalog.constraints.find(
    (c) => c.name === entry.name && c.table === entry.table,
  );
  const index = catalog.indexes.find((i) => i.name === entry.name && i.table === entry.table);

  switch (entry.kind) {
    case 'unique_target':
    case 'unique_index': {
      if (constraint) {
        // A UNIQUE constraint is enforced by an index of the same name.
        const ok =
          constraint.type === 'u' &&
          constraint.validated === true &&
          usableIndex(index) &&
          normalize(constraint.definition) ===
            `unique (${entry.columns.map((c) => c.toLowerCase()).join(', ')})`;
        return ok ? 'present' : 'mismatched';
      }
      if (!index) return 'missing';
      const parsed = parseIndexDefinition(index.definition);
      const ok =
        usableIndex(index) &&
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
        usableIndex(index) &&
        parsed !== null &&
        parsed.unique &&
        parsed.predicate !== null &&
        sameColumns(parsed.columns, entry.columns) &&
        sameExpression(parsed.predicate, entry.predicate);
      return ok ? 'present' : 'mismatched';
    }
    case 'composite_fk': {
      if (!constraint) return 'missing';
      const definition = normalize(constraint.definition);
      const expected =
        `foreign key (${entry.columns.join(', ')}) references ${entry.references.table}(${entry.references.columns.join(', ')})`.toLowerCase();
      const ok =
        constraint.type === 'f' &&
        constraint.validated === true &&
        definition.startsWith(expected) &&
        PLAIN_FK_SUFFIX.test(definition.slice(expected.length)) &&
        ALLOWED_FK_ACTIONS.has(constraint.onUpdate) &&
        ALLOWED_FK_ACTIONS.has(constraint.onDelete);
      return ok ? 'present' : 'mismatched';
    }
    case 'check': {
      if (!constraint) return 'missing';
      const ok =
        constraint.type === 'c' &&
        constraint.validated === true &&
        sameExpression(constraint.definition, entry.condition);
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
