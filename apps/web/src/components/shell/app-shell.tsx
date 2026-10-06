import type { ReactNode } from 'react';
import { BottomNav } from './bottom-nav';
import { QuickAddProvider } from './quick-add-context';
import { QuickAddSheet } from './quick-add-sheet';
import { Sidebar } from './sidebar';

/**
 * Responsive application shell (§9.1):
 *   < 768px     → content + bottom navigation
 *   768–1023px  → icon rail
 *   ≥ 1024px    → full left sidebar
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <QuickAddProvider>
      <div className="min-h-dvh md:pl-20 lg:pl-64">
        <Sidebar />
        <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1.5rem)] md:px-6 md:pt-6 md:pb-8">
          {children}
        </main>
        <BottomNav />
      </div>
      <QuickAddSheet />
    </QuickAddProvider>
  );
}
