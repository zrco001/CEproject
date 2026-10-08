// Migration safety checks accepted by Gate 0 (ADR-034, §6.5 steps 1 and 4), as pure functions.
// - A new migration draft must not DROP anything or touch a protected registry object before it
//   may be applied (TC-16 rule, generalized from the PoC's add-note check).
// - A drift script from `prisma migrate diff --exit-code` must agree with its exit code and must
//   not drop or touch protected objects (TC-20 / TC-21 rule).

/** First line of the manual section appended to a Prisma-generated migration. */
export const MANUAL_SECTION_MARKER =
  '-- ============================================================================================\n-- Manual constraints';

export interface MigrationParts {
  /** The SQL produced by `prisma migrate diff` / `migrate dev --create-only`. */
  readonly generated: string;
  /** The appended manual SQL, starting at the marker; empty when there is none. */
  readonly manual: string;
}

export function splitMigration(sql: string): MigrationParts {
  const index = sql.indexOf(MANUAL_SECTION_MARKER);
  if (index === -1) return { generated: sql, manual: '' };
  // The generated part ends with a newline; one blank line separates the sections.
  return { generated: sql.slice(0, index).replace(/\n$/, ''), manual: sql.slice(index) };
}

/** Non-blank lines that are not `--` comments. */
export function statementLines(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'));
}

function offendingLines(sql: string, protectedNames: readonly string[]): string[] {
  return statementLines(sql).filter(
    (line) => /\bDROP\b/i.test(line) || protectedNames.some((name) => line.includes(name)),
  );
}

export interface DraftInspection {
  readonly ok: boolean;
  readonly offendingLines: readonly string[];
  readonly reasons: readonly string[];
}

/**
 * A migration draft is applicable only if it has SQL statements, contains no DROP and does not
 * reference any protected object. Anything else stops for human review (§6.5 step 6: fixes go
 * into a new migration).
 */
export function inspectMigrationDraft(
  sql: string,
  protectedNames: readonly string[],
): DraftInspection {
  if (statementLines(sql).length === 0) {
    return {
      ok: false,
      offendingLines: [],
      reasons: ['migration draft has no SQL statements (possible silent engine failure)'],
    };
  }
  const offending = offendingLines(sql, protectedNames);
  return {
    ok: offending.length === 0,
    offendingLines: offending,
    reasons: offending.length === 0 ? [] : ['draft drops objects or touches protected constraints'],
  };
}

export interface DriftInspection {
  readonly ok: boolean;
  readonly drift: 'none' | 'non-destructive';
  readonly statements: readonly string[];
  readonly offendingLines: readonly string[];
  readonly reasons: readonly string[];
}

/**
 * Drift decision for `prisma migrate diff --script` output and the exit code of the same diff
 * with `--exit-code` (0 = no difference, 2 = difference). Prisma diff alone cannot detect a
 * missing CHECK (ADR-034 TC-22), so the registry check is always required in addition.
 */
export function inspectDriftScript(
  script: string,
  exitCode: number,
  protectedNames: readonly string[],
): DriftInspection {
  const statements = statementLines(script);
  const offending = offendingLines(script, protectedNames);
  const reasons: string[] = [];
  if (exitCode !== 0 && exitCode !== 2) reasons.push(`unexpected diff exit code ${exitCode}`);
  if (exitCode === 2 && statements.length === 0) {
    reasons.push('diff reported a difference (exit 2) but the script has no SQL statements');
  }
  if (exitCode === 0 && statements.length > 0) {
    reasons.push('diff reported no difference (exit 0) but the script has SQL statements');
  }
  if (offending.length > 0) reasons.push('drift would drop objects or touch protected constraints');
  return {
    ok: reasons.length === 0,
    drift: statements.length > 0 ? 'non-destructive' : 'none',
    statements,
    offendingLines: offending,
    reasons,
  };
}
