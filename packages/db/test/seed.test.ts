// Offline tests of the seed data and seed program. The program runs against an in-memory fake
// that implements only the calls it makes; this checks its logic, not database behaviour.
import { SystemRoleCode } from '@ceproject/shared/enums';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COST_CATEGORIES } from '../src/seed/cost-categories.js';
import { SEED_CONFIRMATION, runSeedCli } from '../src/seed/cli.js';
import {
  PERMISSIONS,
  PERMISSION_MATRIX,
  SEED_GAPS,
  UNASSIGNED_PERMISSION_CODES,
  grantsByRole,
} from '../src/seed/permissions.js';
import {
  seedOrganizationCostCategories,
  seedReferenceData,
  type SeedClient,
} from '../src/seed/seed.js';

const grants = grantsByRole();
const codesOf = (role: SystemRoleCode) => [...(grants.get(role) ?? [])].sort();
const matrixCodes = [...new Set(PERMISSION_MATRIX.flatMap((row) => row.permissions))].sort();

describe('permission catalogue (§8.2 / §8.3)', () => {
  it('uses unique, well-formed codes', () => {
    const codes = PERMISSIONS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const permission of PERMISSIONS) {
      expect(permission.code).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
      expect(permission.code.startsWith(`${permission.module}.`)).toBe(true);
      expect(permission.description.length).toBeGreaterThan(0);
    }
  });

  it('seeds every §8.3 code plus the §8.2 codes §8.3 does not assign', () => {
    expect(PERMISSIONS.map((p) => p.code).sort()).toEqual(
      [...matrixCodes, ...UNASSIGNED_PERMISSION_CODES].sort(),
    );
    expect(matrixCodes).toHaveLength(38);
  });

  it('grants the unassigned codes to nobody (no permission is widened by guesswork)', () => {
    for (const code of UNASSIGNED_PERMISSION_CODES) {
      for (const role of Object.values(SystemRoleCode)) {
        expect(codesOf(role), `${role} ${code}`).not.toContain(code);
      }
    }
  });

  it('lists the open RBAC gaps for the Phase 3 review', () => {
    expect(SEED_GAPS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('system role matrix (§8.3)', () => {
  it('gives OWNER and ADMIN every §8.3 permission', () => {
    expect(codesOf('OWNER')).toEqual(matrixCodes);
    expect(codesOf('ADMIN')).toEqual(matrixCodes);
  });

  it('keeps ACCOUNTANT out of settings, project and daily-log writes and change-order approval', () => {
    expect(codesOf('ACCOUNTANT')).toEqual(
      matrixCodes
        .filter(
          (code) =>
            ![
              'settings.manage',
              'user.manage',
              'role.manage',
              'project.write',
              'change_order.approve',
              'daily_log.write',
            ].includes(code),
        )
        .sort(),
    );
  });

  it('matches the PROJECT_MANAGER column', () => {
    expect(codesOf('PROJECT_MANAGER')).toEqual(
      [
        'customer.write',
        'vendor.write',
        'employee.read',
        'project.write',
        'contract.write',
        'change_order.write',
        'budget.write',
        'expense.create',
        'expense.submit',
        'billing.create',
        'daily_log.write',
        'report.financial.read',
      ].sort(),
    );
  });

  it('matches the SITE_MANAGER, PURCHASER and VIEWER columns', () => {
    expect(codesOf('SITE_MANAGER')).toEqual(
      ['employee.read', 'expense.create', 'expense.submit', 'daily_log.write'].sort(),
    );
    expect(codesOf('PURCHASER')).toEqual(
      ['vendor.write', 'employee.read', 'expense.create', 'expense.submit'].sort(),
    );
    expect(codesOf('VIEWER')).toEqual(['report.financial.read']);
  });

  it('marks exactly the §8.3 "(scope)" grants as project-scoped', () => {
    const scoped = PERMISSION_MATRIX.flatMap((row) =>
      row.grants
        .filter((g) => g.projectScoped)
        .map((g) => `${g.role}:${row.permissions.join('+')}`),
    ).sort();
    expect(scoped).toEqual(
      [
        'PROJECT_MANAGER:project.write',
        'PROJECT_MANAGER:contract.write+change_order.write',
        'PROJECT_MANAGER:budget.write',
        'PROJECT_MANAGER:expense.create+expense.submit',
        'SITE_MANAGER:expense.create+expense.submit',
        'PROJECT_MANAGER:billing.create',
        'PROJECT_MANAGER:daily_log.write',
        'SITE_MANAGER:daily_log.write',
        'PROJECT_MANAGER:report.financial.read',
      ].sort(),
    );
  });
});

describe('default cost categories (§6.2)', () => {
  it('lists the six project and six overhead categories with unique codes', () => {
    expect(DEFAULT_COST_CATEGORIES.map((c) => c.name)).toEqual([
      '材料',
      '工資',
      '分包',
      '機具',
      '運費',
      '雜支',
      '租金',
      '水電',
      '薪資',
      '保險',
      '財務費用',
      '其他',
    ]);
    expect(DEFAULT_COST_CATEGORIES.filter((c) => c.applicableScope === 'PROJECT')).toHaveLength(6);
    expect(DEFAULT_COST_CATEGORIES.filter((c) => c.applicableScope === 'OVERHEAD')).toHaveLength(6);
    expect(new Set(DEFAULT_COST_CATEGORIES.map((c) => c.code)).size).toBe(12);
  });
});

/** Minimal in-memory implementation of the calls the seed program makes. */
function fakeClient() {
  const permissions = new Map<string, { id: string; module: string; description: string }>();
  const roles: { id: string; organizationId: string | null; code: string; isSystem: boolean }[] =
    [];
  const rolePermissions = new Set<string>();
  const costCategories = new Map<string, { id: string; createdById: string }>();
  let nextId = 0;
  const id = () => `id-${++nextId}`;

  const client = {
    permission: {
      upsert: ({
        where,
        create,
        update,
      }: {
        where: { code: string };
        create: { module: string; description: string };
        update: { module: string; description: string };
      }) => {
        const existing = permissions.get(where.code);
        const row = existing ? { ...existing, ...update } : { id: id(), ...create };
        permissions.set(where.code, row);
        return Promise.resolve({ id: row.id });
      },
    },
    role: {
      findFirst: ({ where }: { where: { organizationId: null; code: string } }) =>
        Promise.resolve(
          roles.find((r) => r.organizationId === where.organizationId && r.code === where.code) ??
            null,
        ),
      create: ({ data }: { data: { organizationId: null; code: string; isSystem: boolean } }) => {
        const row = { id: id(), ...data };
        roles.push(row);
        return Promise.resolve({ id: row.id });
      },
    },
    rolePermission: {
      createMany: ({
        data,
      }: {
        data: { roleId: string; permissionId: string }[];
        skipDuplicates: boolean;
      }) => {
        let count = 0;
        for (const row of data) {
          const key = `${row.roleId}:${row.permissionId}`;
          if (!rolePermissions.has(key)) {
            rolePermissions.add(key);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
    costCategory: {
      upsert: ({
        where,
        create,
      }: {
        where: { organizationId_code: { organizationId: string; code: string } };
        create: { createdById: string };
      }) => {
        const key = `${where.organizationId_code.organizationId}:${where.organizationId_code.code}`;
        const row = costCategories.get(key) ?? { id: id(), createdById: create.createdById };
        costCategories.set(key, row);
        return Promise.resolve({ id: row.id });
      },
    },
  };
  return {
    client: client as unknown as SeedClient,
    permissions,
    roles,
    rolePermissions,
    costCategories,
  };
}

describe('seed program (not run against a database in Phase 2)', () => {
  const totalGrants = [...grants.values()].reduce((sum, codes) => sum + codes.length, 0);

  it('creates permissions, seven system roles and the §8.3 grants', async () => {
    const fake = fakeClient();
    const summary = await seedReferenceData(fake.client);
    expect(summary).toEqual({
      permissions: PERMISSIONS.length,
      systemRoles: 7,
      grantsCreated: totalGrants,
    });
    expect(fake.roles.map((r) => r.code).sort()).toEqual(Object.values(SystemRoleCode).sort());
    expect(fake.roles.every((r) => r.organizationId === null && r.isSystem)).toBe(true);
  });

  it('is idempotent: a second run creates nothing new', async () => {
    const fake = fakeClient();
    await seedReferenceData(fake.client);
    const second = await seedReferenceData(fake.client);
    expect(second.grantsCreated).toBe(0);
    expect(fake.roles).toHaveLength(7);
    expect(fake.permissions.size).toBe(PERMISSIONS.length);
    expect(fake.rolePermissions.size).toBe(totalGrants);
  });

  it('creates the default cost categories of one organization once', async () => {
    const fake = fakeClient();
    await seedOrganizationCostCategories(fake.client, 'org-1', 'user-1');
    await seedOrganizationCostCategories(fake.client, 'org-1', 'user-2');
    expect(fake.costCategories.size).toBe(12);
    expect([...fake.costCategories.values()].every((c) => c.createdById === 'user-1')).toBe(true);
  });
});

describe('seed CLI guard', () => {
  it('refuses to run without the confirmation text', async () => {
    expect(await runSeedCli({ DATABASE_URL: 'postgresql://x@127.0.0.1:9/x' })).toBe(1);
  });

  it('refuses to run without DATABASE_URL', async () => {
    expect(await runSeedCli({ CEPROJECT_SEED_CONFIRM: SEED_CONFIRMATION })).toBe(1);
  });
});
