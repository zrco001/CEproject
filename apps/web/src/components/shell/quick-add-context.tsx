'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

interface QuickAddState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  /** Opens the sheet and remembers which control opened it, so focus can return there on close. */
  readonly openFrom: (trigger: HTMLElement) => void;
  readonly triggerRef: RefObject<HTMLElement | null>;
}

const QuickAddContext = createContext<QuickAddState | null>(null);

/** Shares the Quick Add sheet state between the bottom nav CTA, the sidebar button and the sheet. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const openFrom = useCallback((trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ open, setOpen, openFrom, triggerRef }), [open, openFrom]);
  return <QuickAddContext value={value}>{children}</QuickAddContext>;
}

export function useQuickAdd(): QuickAddState {
  const context = useContext(QuickAddContext);
  if (!context) {
    throw new Error('useQuickAdd must be used inside <QuickAddProvider>.');
  }
  return context;
}
