import type { IncomingMessage } from 'node:http';
import type { Options } from 'pino-http';
import { resolveLogLevel, type Env } from '../../config/env.js';
import { resolveRequestId } from './request-id.js';

/**
 * Paths that must never appear in application logs (§2.8). Request bodies are not serialized
 * at all; these paths cover headers and any object passed explicitly to the logger.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.bankAccountNo',
  '*.accountNo',
  '*.nationalId',
] as const;

export const REDACTED = '[REDACTED]';

export function buildPinoHttpOptions(env: Env): Options {
  return {
    level: resolveLogLevel(env),
    genReqId: resolveRequestId,
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
    serializers: {
      // Only method, path and id — no headers, query strings or bodies.
      req: (req: IncomingMessage & { id?: unknown }) => ({
        id: req.id,
        method: req.method,
        url: req.url?.split('?')[0],
      }),
    },
    autoLogging: {
      ignore: (req) => req.url === '/api/v1/health',
    },
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {}),
  };
}
