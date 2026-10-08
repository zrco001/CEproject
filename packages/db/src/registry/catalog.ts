// Read-only catalog snapshot for the registry check (§6.5 step 3). It only runs SELECTs on
// PostgreSQL system catalogs; it never changes data or schema. Not executed in Phase 2 CI:
// it needs a separately authorized disposable database (see prisma/constraints.md §5).
import type { ClientBase } from 'pg';
import { REGISTRY, type RegistryEntry } from '../../prisma/constraints.registry.js';
import type {
  Catalog,
  CatalogConstraint,
  CatalogIndex,
  CatalogPrivilege,
  ConstraintType,
  ReferentialAction,
} from './compare.js';

type Queryable = Pick<ClientBase, 'query'>;

interface ConstraintRow {
  name: string;
  table: string;
  type: string;
  definition: string;
  on_update: string;
  on_delete: string;
}

export async function readCatalog(
  client: Queryable,
  registry: readonly RegistryEntry[] = REGISTRY,
): Promise<Catalog> {
  const constraints = await client.query<ConstraintRow>(
    `SELECT c.conname AS name, rel.relname AS table, c.contype AS type,
            pg_get_constraintdef(c.oid) AS definition,
            c.confupdtype AS on_update, c.confdeltype AS on_delete
       FROM pg_constraint c
       JOIN pg_class rel ON rel.oid = c.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public'
      ORDER BY rel.relname, c.conname`,
  );
  const indexes = await client.query<CatalogIndex>(
    `SELECT indexname AS name, tablename AS table, indexdef AS definition
       FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname`,
  );

  const privileges: CatalogPrivilege[] = [];
  for (const entry of registry) {
    if (entry.kind !== 'revoked_privileges') continue;
    const role = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists',
      [entry.role],
    );
    if (role.rows[0]?.exists !== true) continue;
    for (const privilege of entry.privileges) {
      const result = await client.query<{ granted: boolean }>(
        `SELECT has_table_privilege($1, quote_ident('public') || '.' || quote_ident($2), $3) AS granted`,
        [entry.role, entry.table, privilege],
      );
      privileges.push({
        table: entry.table,
        role: entry.role,
        privilege,
        granted: result.rows[0]?.granted === true,
      });
    }
  }

  return {
    constraints: constraints.rows.map((row): CatalogConstraint => ({
      name: row.name,
      table: row.table,
      type: row.type as ConstraintType,
      definition: row.definition,
      onUpdate: row.on_update as ReferentialAction,
      onDelete: row.on_delete as ReferentialAction,
    })),
    indexes: indexes.rows,
    privileges,
  };
}
