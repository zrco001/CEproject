import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { requestIdOf } from '../logging/request-id.js';
import { toErrorResponse } from './error-response.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = requestIdOf(request);
    const mapped = toErrorResponse(exception, requestId);

    if (mapped.unexpected) {
      // Log the stack only; request bodies are never logged (they may contain sensitive fields).
      this.logger.error(
        { requestId, method: request.method, path: request.path },
        exception instanceof Error ? exception.stack : 'Non-error exception thrown',
      );
    }

    if (!response.headersSent) {
      response.status(mapped.status).json(mapped.body);
    }
  }
}
