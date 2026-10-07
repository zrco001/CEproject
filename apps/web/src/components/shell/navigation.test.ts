import { describe, expect, it } from 'vitest';
import {
  BOTTOM_NAV,
  FINANCE_HUB_LINKS,
  QUICK_ADD_ITEMS,
  ROUTE_REGISTRY,
  SIDEBAR_GROUPS,
  isLinkActive,
  matchesPath,
  mostSpecificActiveHref,
  pathOf,
} from './navigation';

describe('bottom navigation (規格 §四)', () => {
  it('has exactly 首頁 / 工程 / 新增 / 帳務 / 我的 with 新增 in the middle', () => {
    expect(BOTTOM_NAV.map((item) => item.label)).toEqual(['首頁', '工程', '新增', '帳務', '我的']);
    expect(BOTTOM_NAV[2]?.kind).toBe('quick-add');
  });
});

describe('quick add (§9.1, v0.2 naming)', () => {
  const labels = QUICK_ADD_ITEMS.map((item) => item.label);

  it('offers every required action', () => {
    expect(labels).toEqual([
      '新增支出',
      '拍攝發票/收據',
      '新增收款',
      '新增請款',
      '新增付款',
      '其他收入 / 收入認列',
      '新增工程日誌',
      '新增工程照片',
    ]);
  });

  it('never uses the ambiguous 「新增收入」 label', () => {
    expect(labels).not.toContain('新增收入');
  });

  it('declares a permission for every action (enforced from Phase 3)', () => {
    for (const item of QUICK_ADD_ITEMS) {
      expect(item.permission, item.label).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});

describe('sidebar (規格 §五)', () => {
  it('contains the required groups in order', () => {
    expect(SIDEBAR_GROUPS.map((group) => group.label)).toEqual([
      'Dashboard',
      '工程管理',
      '帳務',
      '估驗請款',
      '廠商',
      '業主',
      '報表',
      '文件',
      '系統設定',
    ]);
  });

  it('uses 收入認列 and keeps 收款 separate', () => {
    const finance = FINANCE_HUB_LINKS.map((link) => link.label);
    expect(finance).toContain('收入認列');
    expect(finance).toContain('收款');
    expect(finance).not.toContain('收入');
  });

  it('has unique destinations', () => {
    const hrefs = SIDEBAR_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('route registry', () => {
  it('resolves every navigation destination', () => {
    for (const item of [...QUICK_ADD_ITEMS, ...SIDEBAR_GROUPS.flatMap((group) => group.items)]) {
      expect(ROUTE_REGISTRY.has(pathOf(item.href)), item.href).toBe(true);
    }
  });
});

describe('active path matching', () => {
  it('matches the root only exactly', () => {
    expect(matchesPath('/', ['/'])).toBe(true);
    expect(matchesPath('/projects', ['/'])).toBe(false);
  });

  it('matches nested paths per segment', () => {
    expect(matchesPath('/finance/receipts/new', ['/finance'])).toBe(true);
    expect(matchesPath('/financeX', ['/finance'])).toBe(false);
  });

  it('picks only the most specific active sidebar link', () => {
    const hrefs = SIDEBAR_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(mostSpecificActiveHref('/settings/employees', hrefs)).toBe('/settings/employees');
    expect(mostSpecificActiveHref('/settings', hrefs)).toBe('/settings');
    expect(mostSpecificActiveHref('/finance/receipts/new', hrefs)).toBe('/finance/receipts');
    expect(mostSpecificActiveHref('/', hrefs)).toBe('/');
    expect(mostSpecificActiveHref('/nope', hrefs)).toBeUndefined();
  });

  it('ignores query strings in hrefs', () => {
    expect(pathOf('/expenses/new?capture=1')).toBe('/expenses/new');
    expect(isLinkActive('/expenses/new', '/expenses/new?capture=1')).toBe(true);
  });
});
