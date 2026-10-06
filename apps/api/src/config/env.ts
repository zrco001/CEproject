import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** Allowed browser origin for CORS (and, from Phase 3, the CSRF Origin check). */
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  APP_VERSION: z.string().min(1).default('0.0.0'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly fields: readonly string[]) {
    super(`Invalid environment variables: ${fields.join(', ')}`);
    this.name = 'EnvValidationError';
  }
}

/** Parses environment variables once at startup; fails fast without echoing secret values. */
export function loadEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues.map((issue) => issue.path.join('.')));
  }
  return result.data;
}

export function resolveLogLevel(env: Env): NonNullable<Env['LOG_LEVEL']> {
  if (env.LOG_LEVEL) {
    return env.LOG_LEVEL;
  }
  return env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug';
}
