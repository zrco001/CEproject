// Manual-constraint registry for the Gate 0 PoC (ARCHITECTURE.md §6.5 step 2) and the
// read-only verification queries used by S3, S5–S9 (PHASE-2-GATE-0-PLAN.md §6, registry query).

/** The 8 manual constraints appended to the init migration (plan §4). */
export const MANUAL_CONSTRAINTS = Object.freeze([
  {
    name: 'poc_vendor_org_id_key',
    table: 'PocVendor',
    kind: 'unique',
    columns: ['organizationId', 'id'],
  },
  {
    name: 'poc_payment_org_id_key',
    table: 'PocPayment',
    kind: 'unique',
    columns: ['organizationId', 'id'],
  },
  {
    name: 'poc_allocation_payment_id_org_fkey',
    table: 'PocAllocation',
    kind: 'foreign_key',
    columns: ['organizationId', 'paymentId'],
    references: { table: 'PocPayment', columns: ['organizationId', 'id'] },
  },
  {
    name: 'poc_payment_vendor_id_org_fkey',
    table: 'PocPayment',
    kind: 'foreign_key',
    columns: ['organizationId', 'vendorId'],
    references: { table: 'PocVendor', columns: ['organizationId', 'id'] },
  },
  { name: 'poc_payment_fee_bearer_amounts_check', table: 'PocPayment', kind: 'check' },
  { name: 'poc_allocation_amount_positive_check', table: 'PocAllocation', kind: 'check' },
  { name: 'poc_allocation_void_fields_check', table: 'PocAllocation', kind: 'check' },
  {
    name: 'poc_allocation_pair_active_key',
    table: 'PocAllocation',
    kind: 'partial_unique_index',
    columns: ['paymentId', 'targetKey'],
    predicate: '"voidedAt" IS NULL',
  },
]);

/** Constraints that the native-relation variant (TC-23/24) is expected to produce. */
export const NATIVE_VARIANT_NAMES = Object.freeze([
  'poc_vendor_org_id_key',
  'poc_payment_org_id_key',
  'poc_allocation_payment_id_org_fkey',
  'poc_payment_vendor_id_org_fkey',
]);

/** PostgreSQL referential action codes allowed by §6.5 rule 5/6: RESTRICT or NO ACTION. */
export const ALLOWED_FK_ACTIONS = new Set(['r', 'a']);
const ACTION_NAMES = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
};

const normalize = (sql) => sql.replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Read-only snapshot of all constraints and indexes on the PoC tables. */
export async function readCatalog(client) {
  const constraints = await client.query(
    `SELECT c.conname AS name, c.contype AS type, rel.relname AS table,
            pg_get_constraintdef(c.oid) AS definition,
            c.confupdtype AS on_update, c.confdeltype AS on_delete
       FROM pg_constraint c
       JOIN pg_class rel ON rel.oid = c.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public' AND rel.relname LIKE 'Poc%'
      ORDER BY rel.relname, c.conname`,
  );
  const indexes = await client.query(
    `SELECT indexname AS name, tablename AS table, indexdef AS definition
       FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'Poc%'
      ORDER BY tablename, indexname`,
  );
  return { constraints: constraints.rows, indexes: indexes.rows };
}

/**
 * Compares the catalog with the registry.
 * @param {{ only?: readonly string[], uniqueMayBeIndex?: boolean }} options
 * @returns {{ ok: boolean, present: string[], missing: string[], mismatched: string[] }}
 */
export function compareWithRegistry(catalog, options = {}) {
  const wanted = MANUAL_CONSTRAINTS.filter((c) => !options.only || options.only.includes(c.name));
  const present = [];
  const missing = [];
  const mismatched = [];

  for (const entry of wanted) {
    const constraint = catalog.constraints.find(
      (c) => c.name === entry.name && c.table === entry.table,
    );
    const index = catalog.indexes.find((i) => i.name === entry.name && i.table === entry.table);
    let ok = false;
    let found = false;

    if (entry.kind === 'unique') {
      const columns = `(${entry.columns.map((c) => c.toLowerCase()).join(', ')})`;
      if (constraint) {
        found = true;
        ok = constraint.type === 'u' && normalize(constraint.definition) === `unique ${columns}`;
      } else if (options.uniqueMayBeIndex && index) {
        found = true;
        ok =
          /^create unique index/.test(normalize(index.definition)) &&
          normalize(index.definition).endsWith(columns);
      }
    } else if (entry.kind === 'foreign_key' && constraint) {
      found = true;
      const expected =
        `foreign key (${entry.columns.join(', ')}) references ${entry.references.table}(${entry.references.columns.join(', ')})`.toLowerCase();
      ok =
        constraint.type === 'f' &&
        normalize(constraint.definition).startsWith(expected) &&
        ALLOWED_FK_ACTIONS.has(constraint.on_update) &&
        ALLOWED_FK_ACTIONS.has(constraint.on_delete);
    } else if (entry.kind === 'check' && constraint) {
      found = true;
      ok = constraint.type === 'c';
    } else if (entry.kind === 'partial_unique_index' && index) {
      found = true;
      const def = normalize(index.definition);
      ok =
        def.startsWith('create unique index') &&
        def.includes(`(${entry.columns.map((c) => c.toLowerCase()).join(', ')})`) &&
        def.includes(`where (${normalize(entry.predicate)})`);
    }

    if (!found) missing.push(entry.name);
    else if (!ok) mismatched.push(entry.name);
    else present.push(entry.name);
  }
  return { ok: missing.length === 0 && mismatched.length === 0, present, missing, mismatched };
}

/** TC-25: every FK on the PoC tables must be RESTRICT / NO ACTION for both update and delete. */
export function auditForeignKeyActions(catalog) {
  const fks = catalog.constraints.filter((c) => c.type === 'f');
  const violations = fks
    .filter((c) => !ALLOWED_FK_ACTIONS.has(c.on_update) || !ALLOWED_FK_ACTIONS.has(c.on_delete))
    .map(
      (c) =>
        `${c.table}.${c.name}: ON UPDATE ${ACTION_NAMES[c.on_update]}, ON DELETE ${ACTION_NAMES[c.on_delete]}`,
    );
  return {
    ok: fks.length > 0 && violations.length === 0,
    foreignKeys: fks.map(
      (c) =>
        `${c.table}.${c.name}: ON UPDATE ${ACTION_NAMES[c.on_update]}, ON DELETE ${ACTION_NAMES[c.on_delete]}`,
    ),
    violations,
  };
}
