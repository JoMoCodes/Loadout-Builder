// A status chip: a small tinted pill with an icon and words. The colour is never the only
// signal, so the words always carry the meaning on their own (and in high contrast the chip
// gets a solid outline).

import { cva } from 'class-variance-authority';
import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export const chipVariants = cva(
  'inline-flex max-w-full items-center gap-1 rounded-full border px-2 leading-[1.45] ' +
    'text-[0.857rem] font-medium whitespace-nowrap [&_svg]:size-[1em] [&_svg]:shrink-0 ' +
    'in-data-[theme=high-contrast]:border-current',
  {
    variants: {
      tone: {
        ok: 'border-transparent bg-ok-soft text-ok',
        warn: 'border-transparent bg-warn-soft text-warn',
        bad: 'border-transparent bg-bad-soft text-bad',
        info: 'border-transparent bg-info-soft text-info',
        neutral: 'border-transparent bg-neutral-soft text-neutral',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

/** The icon each tone shows when none is given, so colour-blind readers get a shape as well. */
export const TONE_ICONS: Record<Tone, LucideIcon | null> = {
  ok: CircleCheck,
  warn: TriangleAlert,
  bad: CircleX,
  info: Info,
  neutral: null,
};

export interface ChipProps extends Omit<ComponentProps<'span'>, 'children'> {
  tone?: Tone;
  /** Override the tone's icon; pass `null` for no icon. */
  icon?: LucideIcon | null;
  children: ReactNode;
}

export function Chip({ tone = 'neutral', icon, className, children, ...props }: ChipProps) {
  const Icon = icon === undefined ? TONE_ICONS[tone] : icon;
  return (
    <span
      data-slot="chip"
      data-tone={tone}
      className={cn(chipVariants({ tone }), className)}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
