'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface QuickAddState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

const QuickAddContext = createContext<QuickAddState | null>(null);

/** Shares the Quick Add sheet state between the bottom nav CTA, the sidebar button and the sheet. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <QuickAddContext value={value}>{children}</QuickAddContext>;
}

export function useQuickAdd(): QuickAddState {
  const context = useContext(QuickAddContext);
  if (!context) {
    throw new Error('useQuickAdd must be used inside <QuickAddProvider>.');
  }
  return context;
}
