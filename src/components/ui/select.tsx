import * as React from 'react';
import { cn } from '@/lib/utils';

/** The browser's own select: nothing to learn, works with the keyboard and screen readers. */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'dark:bg-input/30 [&>option]:bg-background [&>option]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Select };
