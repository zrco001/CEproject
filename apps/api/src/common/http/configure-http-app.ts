import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { Env } from '../../config/env.js';

export const API_PREFIX = 'api/v1';

/** HTTP concerns shared by main.ts and the e2e tests, so tests exercise the real setup. */
export function configureHttpApp(app: INestApplication, env: Env): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.enableCors({
    // Reflect the origin only when it matches exactly; other origins get no CORS headers at all.
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, origin === env.WEB_ORIGIN);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.enableShutdownHooks();
}
