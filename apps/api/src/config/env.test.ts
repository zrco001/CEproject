import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv, resolveLogLevel } from './env.js';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(4000);
    expect(env.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces and validates values', () => {
    expect(loadEnv({ PORT: '8080', NODE_ENV: 'production' }).PORT).toBe(8080);
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(EnvValidationError);
    expect(() => loadEnv({ WEB_ORIGIN: 'not a url' })).toThrow(EnvValidationError);
  });

  it('reports field names but never values', () => {
    try {
      loadEnv({ PORT: 'secret-looking-value' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as Error).message).toContain('PORT');
      expect((error as Error).message).not.toContain('secret-looking-value');
    }
  });

  it('silences logs in tests by default', () => {
    expect(resolveLogLevel(loadEnv({ NODE_ENV: 'test' }))).toBe('silent');
    expect(resolveLogLevel(loadEnv({ NODE_ENV: 'production' }))).toBe('info');
    expect(resolveLogLevel(loadEnv({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }))).toBe('warn');
  });
});
