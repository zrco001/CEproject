import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FINANCE_HUB_LINKS } from '@/components/shell/navigation';
import { PageHeader } from '@/components/shell/page-header';

export const metadata: Metadata = { title: '帳務' };

/** Mobile 帳務 hub: large tap targets instead of a sidebar (§9.2). */
export default function FinanceHubPage() {
  return (
    <>
      <PageHeader title="帳務" />
      <ul className="bg-card divide-y rounded-2xl border">
        {FINANCE_HUB_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="active:bg-accent flex min-h-14 items-center gap-4 px-4"
            >
              <link.icon aria-hidden className="text-primary size-6" />
              <span className="flex-1 text-base">{link.label}</span>
              <ChevronRight aria-hidden className="text-muted-foreground size-5" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
