// Guarded entry point for the reference-data seed. Phase 2 only provides this program; it is not
// run against any database. Running it requires an explicit DATABASE_URL and the confirmation
// text below; no .env file is read and the connection string is never printed.
//   CEPROJECT_SEED_CONFIRM="SEED REFERENCE DATA" DATABASE_URL=… node dist/src/seed/cli.js
import { pathToFileURL } from 'node:url';
import { createPrismaClient } from '../client.js';
import { seedReferenceData } from './seed.js';

export const SEED_CONFIRMATION = 'SEED REFERENCE DATA';

export async function runSeedCli(
  env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  if (env['CEPROJECT_SEED_CONFIRM'] !== SEED_CONFIRMATION) {
    console.error(`Refusing to seed: set CEPROJECT_SEED_CONFIRM="${SEED_CONFIRMATION}".`);
    return 1;
  }
  const url = env['DATABASE_URL'];
  if (url === undefined || url.length === 0) {
    console.error('Refusing to seed: DATABASE_URL is not set.');
    return 1;
  }
  const prisma = createPrismaClient(url);
  try {
    const summary = await prisma.$transaction((tx) => seedReferenceData(tx));
    console.log(JSON.stringify(summary));
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = await runSeedCli(process.env);
}
