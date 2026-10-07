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
