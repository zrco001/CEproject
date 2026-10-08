// Prisma Client factory (Prisma 7 needs a driver adapter; ADR-034 pins Prisma / Client 7.10.0).
// The connection string always comes from the caller; this package never reads .env files.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
