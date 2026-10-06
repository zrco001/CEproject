/**
 * Navigation configuration (ARCHITECTURE.md §9.1). Pure data: the shell components only render it.
 * `permission` is the RBAC permission that will gate the entry from Phase 3; the backend
 * re-validates every action regardless of what the UI shows.
 */
import {
  BarChart3,
  BookPlus,
  Briefcase,
  Building2,
  Camera,
  ClipboardList,
  FileText,
  FolderOpen,
  HandCoins,
  HardHat,
  House,
  ImagePlus,
  type LucideIcon,
  NotebookPen,
  Plus,
  Receipt,
  Send,
  Settings,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';

export interface NavLink {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Phase in which the destination page is implemented (shown on placeholders). */
  readonly phase: number;
  readonly permission?: string;
}

export interface BottomNavLink extends NavLink {
  readonly kind: 'link';
  /** Path prefixes that mark this tab as active. */
  readonly match: readonly string[];
}

export interface BottomNavAction {
  readonly kind: 'quick-add';
  readonly label: string;
  readonly icon: LucideIcon;
}

export type BottomNavItem = BottomNavLink | BottomNavAction;

/** Mobile bottom navigation: 首頁 / 工程 / 新增 / 帳務 / 我的 (規格 §四). */
export const BOTTOM_NAV: readonly BottomNavItem[] = [
  { kind: 'link', label: '首頁', href: '/', icon: House, phase: 8, match: ['/'] },
  {
    kind: 'link',
    label: '工程',
    href: '/projects',
    icon: HardHat,
    phase: 4,
    match: ['/projects', '/budgets', '/costs', '/change-orders'],
  },
  { kind: 'quick-add', label: '新增', icon: Plus },
  {
    kind: 'link',
    label: '帳務',
    href: '/finance',
    icon: Wallet,
    phase: 5,
    match: ['/finance', '/expenses', '/billings'],
  },
  {
    kind: 'link',
    label: '我的',
    href: '/me',
    icon: UserRound,
    phase: 3,
    match: ['/me', '/settings'],
  },
];

export interface QuickAddItem extends NavLink {
  readonly description: string;
}

/**
 * Quick Add sheet (§9.1, v0.2 naming): 「新增收款」 is real cash received (Receipt);
 * 「其他收入 / 收入認列」 is a RevenueEntry. The word 「新增收入」 must not be used.
 */
export const QUICK_ADD_ITEMS: readonly QuickAddItem[] = [
  {
    label: '新增支出',
    description: '買材料、工資、雜支',
    href: '/expenses/new',
    icon: Receipt,
    phase: 5,
    permission: 'expense.create',
  },
  {
    label: '拍攝發票/收據',
    description: '拍照後填金額',
    href: '/expenses/new?capture=1',
    icon: Camera,
    phase: 5,
    permission: 'expense.create',
  },
  {
    label: '新增收款',
    description: '業主匯款、工程款入帳',
    href: '/finance/receipts/new',
    icon: HandCoins,
    phase: 6,
    permission: 'receipt.create',
  },
  {
    label: '新增請款',
    description: '估驗請款單',
    href: '/billings/new',
    icon: FileText,
    phase: 6,
    permission: 'billing.create',
  },
  {
    label: '新增付款',
    description: '付廠商、員工代墊、月結',
    href: '/finance/payments/new',
    icon: Send,
    phase: 5,
    permission: 'payment.create',
  },
  {
    label: '其他收入 / 收入認列',
    description: '非工程款收入、收入調整（會計用）',
    href: '/finance/revenue/new',
    icon: BookPlus,
    phase: 6,
    permission: 'revenue.write',
  },
  {
    label: '新增工程日誌',
    description: '今日施工紀錄',
    href: '/projects/daily-log/new',
    icon: NotebookPen,
    phase: 9,
    permission: 'daily_log.write',
  },
  {
    label: '新增工程照片',
    description: '拍攝現場照片',
    href: '/projects/photos/new?capture=1',
    icon: ImagePlus,
    phase: 9,
    permission: 'daily_log.write',
  },
];

export interface SidebarGroup {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly items: readonly NavLink[];
}

/** Desktop left sidebar (規格 §五; v0.2 「收入」→「收入認列」, 新增「支出審核」). */
export const SIDEBAR_GROUPS: readonly SidebarGroup[] = [
  {
    label: 'Dashboard',
    icon: House,
    items: [{ label: 'Dashboard', href: '/', icon: House, phase: 8 }],
  },
  {
    label: '工程管理',
    icon: HardHat,
    items: [
      { label: '工程', href: '/projects', icon: HardHat, phase: 4 },
      { label: '工程預算', href: '/budgets', icon: ClipboardList, phase: 4 },
      { label: '工程成本', href: '/costs', icon: BarChart3, phase: 7 },
      { label: '追加減工程', href: '/change-orders', icon: FileText, phase: 4 },
    ],
  },
  {
    label: '帳務',
    icon: Wallet,
    items: [
      { label: '收入認列', href: '/finance/revenue', icon: BookPlus, phase: 6 },
      { label: '支出', href: '/finance/expenses', icon: Receipt, phase: 5 },
      { label: '支出審核', href: '/expenses/review', icon: ClipboardList, phase: 5 },
      { label: '應收帳款', href: '/finance/receivables', icon: HandCoins, phase: 6 },
      { label: '應付帳款', href: '/finance/payables', icon: Send, phase: 5 },
      { label: '收款', href: '/finance/receipts', icon: HandCoins, phase: 6 },
      { label: '付款', href: '/finance/payments', icon: Send, phase: 5 },
      { label: '零用金', href: '/finance/petty-cash', icon: Wallet, phase: 8 },
    ],
  },
  {
    label: '估驗請款',
    icon: FileText,
    items: [{ label: '估驗請款', href: '/billings', icon: FileText, phase: 6 }],
  },
  {
    label: '廠商',
    icon: Building2,
    items: [{ label: '廠商', href: '/vendors', icon: Building2, phase: 4 }],
  },
  {
    label: '業主',
    icon: Briefcase,
    items: [{ label: '業主', href: '/customers', icon: Briefcase, phase: 4 }],
  },
  {
    label: '報表',
    icon: BarChart3,
    items: [{ label: '報表', href: '/reports', icon: BarChart3, phase: 8 }],
  },
  {
    label: '文件',
    icon: FolderOpen,
    items: [{ label: '文件', href: '/documents', icon: FolderOpen, phase: 4 }],
  },
  {
    label: '系統設定',
    icon: Settings,
    items: [
      { label: '系統設定', href: '/settings', icon: Settings, phase: 3 },
      { label: '員工', href: '/settings/employees', icon: Users, phase: 4 },
    ],
  },
];

/** Mobile 帳務 hub entries (/finance). */
export const FINANCE_HUB_LINKS: readonly NavLink[] =
  SIDEBAR_GROUPS.find((group) => group.label === '帳務')?.items ?? [];

/** Path without query string or hash. */
export function pathOf(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

/** Whether `pathname` is inside one of the given path prefixes (segment-aware). */
export function matchesPath(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) =>
    prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Active state for a single link: exact match, or a deeper path under it (except the root). */
export function isLinkActive(pathname: string, href: string): boolean {
  return matchesPath(pathname, [pathOf(href)]);
}

export interface RouteInfo {
  readonly title: string;
  readonly phase: number;
}

/** Every navigable destination, used by the placeholder page until features exist. */
export function buildRouteRegistry(): ReadonlyMap<string, RouteInfo> {
  const registry = new Map<string, RouteInfo>();
  const add = (link: { label: string; href: string; phase: number }): void => {
    const path = pathOf(link.href);
    if (!registry.has(path)) {
      registry.set(path, { title: link.label, phase: link.phase });
    }
  };
  SIDEBAR_GROUPS.flatMap((group) => group.items).forEach(add);
  QUICK_ADD_ITEMS.forEach(add);
  BOTTOM_NAV.forEach((item) => {
    if (item.kind === 'link') {
      add(item);
    }
  });
  return registry;
}

export const ROUTE_REGISTRY = buildRouteRegistry();
