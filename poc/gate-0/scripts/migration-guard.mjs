// TC-16 inspection of the `migrate dev --create-only` draft (G0-4), as a pure function so the
// offline tests can run it on the real failed draft from run 37645666192.
// Same rule for every strategy: the draft must add the "note" column and must not contain any
// DROP statement or any line that references a protected (registry) object.

/**
 * @param {string} sql the generated migration.sql
 * @param {readonly string[]} protectedNames registry object names
 * @returns {{ ok: boolean, addsNote: boolean, offendingLines: string[], reasons: string[] }}
 */
export function inspectAddNoteMigration(sql, protectedNames) {
  if (typeof sql !== 'string' || sql.trim().length === 0) {
    return {
      ok: false,
      addsNote: false,
      offendingLines: [],
      reasons: ['generated migration is empty (possible silent engine failure)'],
    };
  }
  const lines = sql.split('\n');
  const offendingLines = lines.filter(
    (line) => /\bDROP\b/i.test(line) || protectedNames.some((name) => line.includes(name)),
  );
  const addsNote = /ALTER TABLE\s+"PocPayment"\s+ADD COLUMN\s+"note"/i.test(sql);
  const reasons = [];
  if (!addsNote) reasons.push('draft does not add the "note" column to PocPayment');
  if (offendingLines.length > 0) {
    reasons.push('draft drops objects or touches protected constraints');
  }
  return { ok: reasons.length === 0, addsNote, offendingLines, reasons };
}

/** SQL lines that are not comments or blank (Prisma prints "-- This is an empty migration."). */
function statementLines(sql) {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'));
}

/**
 * G0-7 drift decision for TC-20 / TC-21 (Codex review of 052021b, finding P1).
 * `script` is the `migrate diff --script` output and `exitCode` the result of the same diff with
 * `--exit-code` (0 = no difference, 2 = difference; other codes are rejected earlier).
 *
 * Fails when:
 * - the script and the exit code disagree (statements with exit 0, or an empty script with
 *   exit 2 — e.g. a silent engine failure);
 * - the drift would DROP anything or touch a protected registry object (§6.5 step 4 forbids
 *   dropping manual constraints).
 * Non-destructive differences are recorded and allowed.
 *
 * @param {string} script
 * @param {number} exitCode
 * @param {readonly string[]} protectedNames
 */
export function inspectDriftScript(script, exitCode, protectedNames) {
  const text = typeof script === 'string' ? script : '';
  const statements = statementLines(text);
  const offendingLines = statements.filter(
    (line) => /\bDROP\b/i.test(line) || protectedNames.some((name) => line.includes(name)),
  );
  const reasons = [];
  if (exitCode !== 0 && exitCode !== 2) {
    reasons.push(`unexpected diff exit code ${exitCode}`);
  }
  if (exitCode === 2 && statements.length === 0) {
    reasons.push('diff reported a difference (exit 2) but the script has no SQL statements');
  }
  if (exitCode === 0 && statements.length > 0) {
    reasons.push('diff reported no difference (exit 0) but the script has SQL statements');
  }
  if (offendingLines.length > 0) {
    reasons.push('drift would drop objects or touch protected constraints');
  }
  return {
    ok: reasons.length === 0,
    drift: statements.length > 0 ? 'non-destructive' : 'none',
    statements,
    offendingLines,
    reasons,
  };
}
