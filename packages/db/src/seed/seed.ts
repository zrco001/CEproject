// Seed program (ARCHITECTURE.md §6.2 Permission "Seed 維護", §8.3). Additive and idempotent:
// it creates missing permissions, system roles and §8.3 grants, and never deletes or downgrades
// existing rows. It creates no users, organizations, passwords or financial data.
// Phase 2 does not run it; see ./cli.ts for the guarded entry point.
import { SystemRoleCode } from '@ceproject/shared/enums';
import type { Prisma } from '../generated/prisma/client.js';
import { DEFAULT_COST_CATEGORIES } from './cost-categories.js';
import { PERMISSIONS, grantsByRole } from './permissions.js';

export type SeedClient = Pick<
  Prisma.TransactionClient,
  'permission' | 'role' | 'rolePermission' | 'costCategory'
>;

export interface ReferenceDataSummary {
  readonly permissions: number;
  readonly systemRoles: number;
  readonly grantsCreated: number;
}

/** Permissions, the seven system roles (organizationId NULL) and their §8.3 grants. */
export async function seedReferenceData(db: SeedClient): Promise<ReferenceDataSummary> {
  const permissionIds = new Map<string, string>();
  for (const permission of PERMISSIONS) {
    const row = await db.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { module: permission.module, description: permission.description },
      select: { id: true },
    });
    permissionIds.set(permission.code, row.id);
  }

  const grants = grantsByRole();
  let grantsCreated = 0;
  for (const code of Object.values(SystemRoleCode)) {
    // System role codes are unique through the partial index role_system_code_uq (I-03), which
    // Prisma cannot address in an upsert, hence find-then-create.
    const existing = await db.role.findFirst({
      where: { organizationId: null, code },
      select: { id: true },
    });
    const role =
      existing ??
      (await db.role.create({
        data: { organizationId: null, code, name: code, isSystem: true },
        select: { id: true },
      }));
    const data = (grants.get(code) ?? []).map((permissionCode) => {
      const permissionId = permissionIds.get(permissionCode);
      if (permissionId === undefined) throw new Error(`Unknown permission ${permissionCode}`);
      return { roleId: role.id, permissionId };
    });
    if (data.length > 0) {
      const result = await db.rolePermission.createMany({ data, skipDuplicates: true });
      grantsCreated += result.count;
    }
  }

  return {
    permissions: PERMISSIONS.length,
    systemRoles: Object.values(SystemRoleCode).length,
    grantsCreated,
  };
}

/**
 * Creates the default cost categories of a new organization (§6.2). Existing categories with
 * the same code are left unchanged. Called by the organization use case (Phase 3/4).
 */
export async function seedOrganizationCostCategories(
  db: SeedClient,
  organizationId: string,
  actorUserId: string,
): Promise<number> {
  for (const category of DEFAULT_COST_CATEGORIES) {
    await db.costCategory.upsert({
      where: { organizationId_code: { organizationId, code: category.code } },
      create: { ...category, organizationId, createdById: actorUserId },
      update: {},
      select: { id: true },
    });
  }
  return DEFAULT_COST_CATEGORIES.length;
}
