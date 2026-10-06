'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/**
 * Bottom sheet on mobile (thumb reach), centered dialog from md upwards.
 * Built on Radix Dialog for focus trapping, Escape handling and aria wiring.
 */
export function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Content
        className={cn(
          'bg-card text-card-foreground fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl shadow-xl',
          'pb-[env(safe-area-inset-bottom)]',
          'md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:pb-0',
          className,
        )}
        {...props}
      >
        <div aria-hidden className="bg-border mx-auto mt-3 h-1.5 w-12 rounded-full md:hidden" />
        {children}
        <DialogPrimitive.Close
          className="text-muted-foreground active:bg-accent absolute top-2 right-2 inline-flex size-12 items-center justify-center rounded-xl"
          aria-label="關閉"
        >
          <X className="size-6" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pt-3 pb-2 md:pt-5', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}
