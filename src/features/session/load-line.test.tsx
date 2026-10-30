// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { qualityPreset } from '@/core/media/quality';
import type { LoadStatus } from '@/core/session/host-session';
import { LoadLine } from './load-line';

const status = (overrides: Partial<LoadStatus> = {}): LoadStatus => ({
  chosen: 'balanced',
  limits: qualityPreset('balanced'),
  viewers: 3,
  struggling: false,
  cause: null,
  health: new Map(),
  ...overrides,
});

describe('LoadLine', () => {
  it('shows what is sent as a status, quietly', () => {
    render(<LoadLine load={status()} />);

    const line = screen.getByRole('status');
    expect(line).toHaveTextContent('720p · 30 fps · 3 viewers');
    expect(line).toHaveAttribute('data-tone', 'normal');
    expect(line).toHaveClass('text-muted-foreground');
  });

  it('warns in the colour of a warning when the host cannot keep up', () => {
    render(<LoadLine load={status({ struggling: true, cause: 'computer' })} />);

    expect(screen.getByTestId('load-line')).toHaveAttribute('data-tone', 'struggling');
    expect(screen.getByTestId('load-line')).toHaveClass('text-destructive');
    expect(screen.getByTestId('load-line')).toHaveTextContent('may get the picture late');
  });
});
