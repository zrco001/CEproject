// Prisma CLI configuration for @ceproject/db.
// No .env file is loaded. Without an explicit DATABASE_URL the datasource is an offline
// placeholder (TCP port 9 on loopback is never a database), which Prisma 7 needs even for
// offline commands such as `migrate diff --from-empty`. No seed command is configured, so no
// Prisma command runs the seed program implicitly.
import { defineConfig } from 'prisma/config';

export const OFFLINE_PLACEHOLDER_URL = 'postgresql://offline:offline@127.0.0.1:9/ceproject_offline';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? OFFLINE_PLACEHOLDER_URL,
  },
});
