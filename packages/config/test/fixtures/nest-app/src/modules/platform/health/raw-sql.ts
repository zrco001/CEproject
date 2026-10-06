declare const prisma: { $queryRaw: unknown; $queryRawUnsafe: unknown; $executeRaw: unknown };

export const raw = [prisma.$queryRaw, prisma.$queryRawUnsafe, prisma.$executeRaw];
