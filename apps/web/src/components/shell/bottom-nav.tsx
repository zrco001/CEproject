'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BOTTOM_NAV, matchesPath } from './navigation';
import { useQuickAdd } from './quick-add-context';

/** Mobile-only bottom navigation (< 768px) with the centre 「新增」 CTA (§9.1). */
export function BottomNav() {
  const pathname = usePathname();
  const { open, openFrom } = useQuickAdd();

  return (
    <nav
      aria-label="主要導覽"
      className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid h-[var(--bottom-nav-height)] grid-cols-5">
        {BOTTOM_NAV.map((item) => {
          if (item.kind === 'quick-add') {
            return (
              <li key="quick-add" className="flex items-center justify-center">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  onClick={(event) => {
                    openFrom(event.currentTarget);
                  }}
                  className="bg-primary text-primary-foreground flex size-14 -translate-y-3 flex-col items-center justify-center rounded-full shadow-lg active:scale-95"
                >
                  <item.icon aria-hidden className="size-7" />
                  <span className="sr-only">{item.label}</span>
                </button>
              </li>
            );
          }

          const active = matchesPath(pathname, item.match);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full min-h-12 flex-col items-center justify-center gap-0.5 text-xs',
                  active ? 'text-primary font-semibold' : 'text-muted-foreground',
                )}
              >
                <item.icon aria-hidden className="size-6" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
