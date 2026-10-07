// Strict interpretation of child-process results for the Gate 0 runner.
// A timeout, signal, spawn failure or unexpected exit code is never a valid result
// (Codex review of bf06980, finding 1).

/** `prisma migrate diff --exit-code`: 0 = no difference, 2 = difference. 1 or anything else = error. */
export const DIFF_EXIT_CODES = Object.freeze([0, 2]);

export class ProcessResultError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProcessResultError';
  }
}

/**
 * Validates a `spawnSync` result.
 * @param {{ status: number | null, signal?: string | null, error?: Error & { code?: string } }} result
 * @param {{ label: string, allowedExitCodes?: readonly number[] }} options
 * @returns {number} the exit code
 */
export function checkProcessResult(result, { label, allowedExitCodes = [0] }) {
  if (result.error) {
    const reason =
      result.error.code === 'ETIMEDOUT'
        ? 'timed out'
        : `could not run (${result.error.code ?? result.error.message})`;
    throw new ProcessResultError(`${label}: ${reason}`);
  }
  if (result.signal) {
    throw new ProcessResultError(`${label}: terminated by signal ${result.signal}`);
  }
  if (typeof result.status !== 'number') {
    throw new ProcessResultError(`${label}: no exit status (abnormal termination)`);
  }
  if (!allowedExitCodes.includes(result.status)) {
    throw new ProcessResultError(
      `${label}: exited with ${result.status}; allowed: ${allowedExitCodes.join(', ')}`,
    );
  }
  return result.status;
}
