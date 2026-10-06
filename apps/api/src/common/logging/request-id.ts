import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Accept a client-supplied id only if it is short and harmless; otherwise generate one. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function resolveRequestId(request: IncomingMessage, response: ServerResponse): string {
  const header = request.headers[REQUEST_ID_HEADER];
  const id = typeof header === 'string' && SAFE_REQUEST_ID.test(header) ? header : randomUUID();
  response.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** Request id assigned by pino-http (`req.id`), if any. */
export function requestIdOf(request: IncomingMessage): string | null {
  const id: unknown = (request as IncomingMessage & { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}
