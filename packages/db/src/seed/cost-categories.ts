// Default cost categories created for each new organization (ARCHITECTURE.md §6.2 CostCategory:
// 工程類 材料/工資/分包/機具/運費/雜支 + 管銷類 租金/水電/薪資/保險/財務費用/其他).
// The architecture names the categories but not their codes; the codes below are a proposal
// listed in SEED_GAPS. Categories are per organization, so the reference-data seed does not
// create them; seedOrganizationCostCategories runs when an organization is created (Phase 3/4).
import { CostCategoryScope } from '@ceproject/shared/enums';

export interface CostCategoryDefinition {
  readonly code: string;
  readonly name: string;
  readonly applicableScope: CostCategoryScope;
  readonly sortOrder: number;
}

const project = (code: string, name: string, sortOrder: number): CostCategoryDefinition => ({
  code,
  name,
  applicableScope: CostCategoryScope.PROJECT,
  sortOrder,
});

const overhead = (code: string, name: string, sortOrder: number): CostCategoryDefinition => ({
  code,
  name,
  applicableScope: CostCategoryScope.OVERHEAD,
  sortOrder,
});

export const DEFAULT_COST_CATEGORIES: readonly CostCategoryDefinition[] = Object.freeze([
  project('PRJ_MATERIAL', '材料', 10),
  project('PRJ_LABOR', '工資', 20),
  project('PRJ_SUBCONTRACT', '分包', 30),
  project('PRJ_EQUIPMENT', '機具', 40),
  project('PRJ_FREIGHT', '運費', 50),
  project('PRJ_MISC', '雜支', 60),
  overhead('OH_RENT', '租金', 110),
  overhead('OH_UTILITIES', '水電', 120),
  overhead('OH_SALARY', '薪資', 130),
  overhead('OH_INSURANCE', '保險', 140),
  overhead('OH_FINANCE', '財務費用', 150),
  overhead('OH_OTHER', '其他', 160),
]);
