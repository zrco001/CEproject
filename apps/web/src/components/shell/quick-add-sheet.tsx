'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { QUICK_ADD_ITEMS } from './navigation';
import { useQuickAdd } from './quick-add-context';

/** 「新增」 sheet with 56px rows reachable by thumb (§9.1). */
export function QuickAddSheet() {
  const { open, setOpen } = useQuickAdd();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>新增</SheetTitle>
          <SheetDescription>選擇要建立的項目</SheetDescription>
        </SheetHeader>
        <ul className="overflow-y-auto px-3 pb-4">
          {QUICK_ADD_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => {
                  setOpen(false);
                }}
                className="active:bg-accent flex min-h-14 items-center gap-4 rounded-xl px-3 py-2"
              >
                <span className="bg-secondary text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <item.icon aria-hidden className="size-6" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-medium">{item.label}</span>
                  <span className="text-muted-foreground truncate text-sm">{item.description}</span>
                </span>
                <ChevronRight aria-hidden className="text-muted-foreground size-5 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
