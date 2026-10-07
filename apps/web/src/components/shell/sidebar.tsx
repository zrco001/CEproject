'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SIDEBAR_GROUPS, isLinkActive, matchesPath, pathOf } from './navigation';
import { useQuickAdd } from './quick-add-context';

/**
 * Desktop navigation: icon rail at 768–1023px, full left sidebar from 1024px (§9.1).
 * Labels are always visible — no hover-only tooltips.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { setOpen } = useQuickAdd();
  const openQuickAdd = (): void => {
    setOpen(true);
  };

  return (
    <aside
      aria-label="側邊導覽"
      className="bg-card fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r md:flex lg:w-64"
    >
      <div className="flex h-16 shrink-0 items-center justify-center px-4 lg:justify-start">
        <span className="text-primary text-lg font-bold">
          <span className="lg:hidden">工帳</span>
          <span className="hidden lg:inline">工程帳務管理</span>
        </span>
      </div>

      <div className="px-2 pb-3 lg:px-3">
        <Button
          size="cta"
          className="w-full px-2 lg:hidden"
          aria-label="新增"
          aria-haspopup="dialog"
          onClick={openQuickAdd}
        >
          <Plus />
        </Button>
        <Button
          size="cta"
          className="hidden w-full lg:inline-flex"
          aria-haspopup="dialog"
          onClick={openQuickAdd}
        >
          <Plus />
          新增
        </Button>
      </div>

      {/* Icon rail (md only): one entry per group, linking to its first page. */}
      <ul className="flex flex-col gap-1 overflow-y-auto px-2 pb-4 lg:hidden">
        {SIDEBAR_GROUPS.map((group) => {
          const first = group.items[0];
          if (!first) {
            return null;
          }
          const active = matchesPath(
            pathname,
            group.items.map((item) => pathOf(item.href)),
          );
          return (
            <li key={group.label}>
              <Link
                href={first.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[11px] leading-tight',
                  active
                    ? 'bg-accent text-primary font-semibold'
                    : 'text-muted-foreground active:bg-accent',
                )}
              >
                <group.icon aria-hidden className="size-6" />
                {group.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Full sidebar (lg+). */}
      <nav className="hidden flex-1 overflow-y-auto px-3 pb-6 lg:block">
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            {group.items.length > 1 && (
              <p className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-semibold tracking-wide">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isLinkActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px]',
                        active
                          ? 'bg-accent text-primary font-semibold'
                          : 'text-foreground active:bg-accent',
                      )}
                    >
                      <item.icon aria-hidden className="size-5" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
