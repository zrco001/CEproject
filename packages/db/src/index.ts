// Public entry of @ceproject/db (Phase 2): Prisma Client factory and types, the constraint
// registry and its checks, migration safety checks, and the seed program.
export { createPrismaClient } from './client.js';
export { PrismaClient, Prisma } from './generated/prisma/client.js';
export * from './generated/prisma/enums.js';
export * from '../prisma/constraints.registry.js';
export * from './registry/compare.js';
export { readCatalog } from './registry/catalog.js';
export * from './migration/inspect.js';
export * from './seed/permissions.js';
export * from './seed/cost-categories.js';
export { seedReferenceData, seedOrganizationCostCategories, type SeedClient } from './seed/seed.js';
