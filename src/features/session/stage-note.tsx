import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A short line over the picture: readable on any picture, and small enough not to cover it. */
export function StageNote({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p className={cn('rounded-md bg-background/70 px-2 py-1 text-sm', className)} {...props} />
  );
}
