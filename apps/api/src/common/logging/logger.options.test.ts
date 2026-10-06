import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../config/env.js';
import { REDACTED, REDACT_PATHS, buildPinoHttpOptions } from './logger.options.js';

function captureLogger(): { logger: pino.Logger; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return {
    logger: pino({ redact: { paths: [...REDACT_PATHS], censor: REDACTED } }, stream),
    lines,
  };
}

describe('log redaction (§2.8)', () => {
  it('redacts credentials and bank account numbers', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        vendor: { name: '五金行', bankAccountNo: '012345678901' },
        user: { password: 'hunter2', refreshToken: 'rt-secret' },
        req: { headers: { cookie: 'session=abc', authorization: 'Bearer xyz' } },
      },
      'test',
    );
    const output = lines.join('');
    for (const secret of ['012345678901', 'hunter2', 'rt-secret', 'session=abc', 'Bearer xyz']) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('五金行');
    expect(output).toContain(REDACTED);
  });

  it('uses silent logging in tests and pretty output only in development', () => {
    expect(buildPinoHttpOptions(loadEnv({ NODE_ENV: 'test' })).level).toBe('silent');
    expect(buildPinoHttpOptions(loadEnv({ NODE_ENV: 'production' })).transport).toBeUndefined();
    expect(buildPinoHttpOptions(loadEnv({ NODE_ENV: 'development' })).transport).toBeDefined();
  });
});
