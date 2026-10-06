import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Sizes follow §9.4: default 48px, CTA 56px, icon buttons 48×48. */
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground active:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground active:bg-secondary/80',
        outline: 'border bg-card active:bg-accent',
        ghost: 'active:bg-accent',
        destructive: 'bg-destructive text-destructive-foreground active:bg-destructive/90',
      },
      size: {
        default: 'min-h-12 px-5 text-base [&_svg]:size-5',
        cta: 'min-h-14 px-6 text-lg [&_svg]:size-6',
        icon: 'size-12 [&_svg]:size-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
