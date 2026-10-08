// Button, in the shadcn/ui style: one component, variants picked by props.

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium ' +
    'transition-colors select-none disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:size-[1.1em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-line bg-raised text-fg hover:border-line-strong',
        primary: 'border-accent bg-accent text-accent-fg hover:brightness-110',
        ghost: 'border-transparent bg-transparent text-muted hover:bg-raised hover:text-fg',
        danger: 'border-line bg-raised text-bad hover:border-bad',
      },
      size: {
        sm: 'h-7 px-2.5 text-[0.9286rem]',
        md: 'h-8 px-3 text-sm',
        icon: 'size-7 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (a link, say) with the button's look instead of a <button>. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (props.type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
