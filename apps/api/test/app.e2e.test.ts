import 'reflect-metadata';
import type { Server } from 'node:http';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DomainError } from '../src/common/errors/index.js';
import { configureHttpApp } from '../src/common/http/configure-http-app.js';
import { ENV } from '../src/config/env.module.js';
import type { Env } from '../src/config/env.js';

@Controller('__test__')
class ThrowingController {
  @Get('domain')
  domain(): never {
    throw DomainError.businessRule('CHANGE_ORDER_OVERBILLED', '追加減請款金額超過核准金額', [
      { path: 'changeOrders.0.amount', issue: 'exceeds_remaining_billable' },
    ]);
  }

  @Get('crash')
  crash(): never {
    throw new Error('connection string postgres://admin:hunter2@db/ceproject');
  }
}

describe('API skeleton (e2e)', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ThrowingController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureHttpApp(app, app.get<Env>(ENV));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns ok with a request id', async () => {
    const response = await request(server()).get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'ceproject-api' });
    expect(typeof response.body.timestamp).toBe('string');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a safe client request id and replaces an unsafe one', async () => {
    const safe = await request(server())
      .get('/api/v1/health')
      .set('X-Request-Id', 'client-req-0001');
    expect(safe.headers['x-request-id']).toBe('client-req-0001');

    const unsafe = await request(server()).get('/api/v1/health').set('X-Request-Id', '<script>');
    expect(unsafe.headers['x-request-id']).not.toBe('<script>');
  });

  it('sets security headers (helmet)', async () => {
    const response = await request(server()).get('/api/v1/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the consistent error format for unknown routes', async () => {
    const response = await request(server())
      .get('/api/v1/does-not-exist')
      .set('X-Request-Id', 'client-req-0002')
      .expect(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: '找不到資料', requestId: 'client-req-0002' },
    });
  });

  it('returns domain errors with details', async () => {
    const response = await request(server()).get('/api/v1/__test__/domain').expect(422);
    expect(response.body.error.code).toBe('CHANGE_ORDER_OVERBILLED');
    expect(response.body.error.details).toEqual([
      { path: 'changeOrders.0.amount', issue: 'exceeds_remaining_billable' },
    ]);
  });

  it('hides internal error details', async () => {
    const response = await request(server()).get('/api/v1/__test__/crash').expect(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });

  it('allows CORS only for the configured web origin', async () => {
    const allowed = await request(server())
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const denied = await request(server())
      .options('/api/v1/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
