// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LoadStatus } from '@/core/session/host-session';
import { LoadLine } from './load-line';

const status = (overrides: Partial<LoadStatus> = {}): LoadStatus => ({
  chosen: 'balanced',
  effective: 'balanced',
  viewers: 3,
  cause: null,
  overloaded: false,
  health: new Map(),
  ...overrides,
});

describe('LoadLine', () => {
  it('shows what is sent as a status, quietly', () => {
    render(<LoadLine load={status()} />);

    const line = screen.getByRole('status');
    expect(line).toHaveTextContent('720p · 3 viewers');
    expect(line).toHaveAttribute('data-tone', 'normal');
    expect(line).toHaveClass('text-muted-foreground');
  });

  it('stands out when the quality was lowered', () => {
    render(<LoadLine load={status({ effective: 'saver', cause: 'computer' })} />);

    expect(screen.getByTestId('load-line')).toHaveTextContent('Lowered to Saver');
    expect(screen.getByTestId('load-line')).toHaveAttribute('data-tone', 'lowered');
    expect(screen.getByTestId('load-line')).not.toHaveClass('text-muted-foreground');
  });

  it('warns in the colour of a warning when the host cannot keep up at all', () => {
    render(<LoadLine load={status({ effective: 'minimal', overloaded: true })} />);

    expect(screen.getByTestId('load-line')).toHaveClass('text-destructive');
    expect(screen.getByTestId('load-line')).toHaveTextContent('may get the picture late');
  });
});
