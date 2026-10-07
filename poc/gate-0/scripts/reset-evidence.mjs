// Evidence that `prisma migrate reset` really rebuilt the database (G0-5 / TC-18).
// A reset that exits 0 but does nothing must fail (Codex review of bf06980, finding 2).

export const RESET_MARKER_ID = 'gate0_reset_marker';

/** Read-only snapshot taken before and after the reset. `client` is a connected pg client. */
export async function snapshotForReset(client) {
  const taken = await client.query('SELECT clock_timestamp() AS now');
  const marker = await client.query(`SELECT count(*)::int AS n FROM "PocOrg" WHERE "id" = $1`, [
    RESET_MARKER_ID,
  ]);
  const tables = await client.query(
    `SELECT c.relname AS name, c.oid::int AS oid
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'Poc%'
      ORDER BY c.relname`,
  );
  const migrations = await client.query(
    `SELECT migration_name AS name, finished_at, rolled_back_at
       FROM _prisma_migrations ORDER BY migration_name`,
  );
  return {
    takenAt: taken.rows[0].now,
    markerCount: marker.rows[0].n,
    tableOids: Object.fromEntries(tables.rows.map((r) => [r.name, r.oid])),
    migrations: migrations.rows,
  };
}

/**
 * @param {{ takenAt: Date, markerCount: number, tableOids: Record<string, number>, migrations: { name: string, finished_at: Date | null, rolled_back_at: Date | null }[] }} before
 * @param {typeof before} after
 * @param {{ expectedMigrations: number }} options
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function assessResetEvidence(before, after, { expectedMigrations }) {
  const reasons = [];

  if (before.markerCount !== 1) {
    reasons.push(`marker row was not present before reset (count ${before.markerCount})`);
  }
  if (after.markerCount !== 0) {
    reasons.push(`marker row still present after reset (count ${after.markerCount})`);
  }

  const beforeTables = Object.keys(before.tableOids).sort();
  const afterTables = Object.keys(after.tableOids).sort();
  if (beforeTables.length === 0) {
    reasons.push('no PoC tables existed before reset');
  }
  if (JSON.stringify(beforeTables) !== JSON.stringify(afterTables)) {
    reasons.push(`table set changed: [${beforeTables.join(', ')}] -> [${afterTables.join(', ')}]`);
  }
  const reused = afterTables.filter((t) => before.tableOids[t] === after.tableOids[t]);
  if (reused.length > 0) {
    reasons.push(`tables were not recreated (same OID): ${reused.join(', ')}`);
  }

  if (after.migrations.length !== expectedMigrations) {
    reasons.push(
      `expected ${expectedMigrations} applied migrations, found ${after.migrations.length}`,
    );
  }
  const stale = after.migrations.filter(
    (m) =>
      !(m.finished_at instanceof Date) ||
      m.rolled_back_at !== null ||
      m.finished_at.getTime() <= new Date(before.takenAt).getTime(),
  );
  if (stale.length > 0) {
    reasons.push(
      `migrations not re-applied after the pre-reset snapshot: ${stale.map((m) => m.name).join(', ')}`,
    );
  }

  return { ok: reasons.length === 0, reasons };
}
