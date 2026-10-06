import { Controller, Get, Inject } from '@nestjs/common';
import { ENV } from '../../../config/env.module.js';
import type { Env } from '../../../config/env.js';

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'ceproject-api';
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
}

/**
 * Liveness probe. A readiness probe that checks PostgreSQL is added in Phase 2.
 * Public by design; authentication is introduced in Phase 3 with an explicit @Public() marker.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'ceproject-api',
      version: this.env.APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
