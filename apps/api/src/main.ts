import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureHttpApp } from './common/http/configure-http-app.js';
import { ENV } from './config/env.module.js';
import type { Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const env = app.get<Env>(ENV);
  configureHttpApp(app, env);
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
