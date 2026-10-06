declare const prisma: { $queryRaw: unknown; $queryRawUnsafe: unknown };

export const reporting = [prisma.$queryRaw, prisma.$queryRawUnsafe];
