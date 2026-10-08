import type { ComponentProps } from 'react';
import { cn } from './cn';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-md border border-line-strong bg-sunken px-2.5 text-sm text-fg',
        'placeholder:text-faint focus-visible:border-focus',
        className,
      )}
      {...props}
    />
  );
}
