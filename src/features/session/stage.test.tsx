// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Stage } from './stage';
import { StageFullscreenContext, type StageFullscreen } from './stage-fullscreen';

function renderInShell(fullscreen: StageFullscreen) {
  return render(
    <StageFullscreenContext.Provider value={fullscreen}>
      <Stage emptyMessage="x" />
    </StageFullscreenContext.Provider>,
  );
}

describe('Stage', () => {
  it('shows the empty message when nothing is shared', () => {
    render(<Stage emptyMessage="Nothing is shared yet." />);

    expect(screen.getByTestId('stage-empty')).toHaveTextContent('Nothing is shared yet.');
  });

  it('shows what is shared instead of the empty message', () => {
    render(
      <Stage emptyMessage="Nothing is shared yet.">
        <video data-testid="video" />
      </Stage>,
    );

    expect(screen.getByTestId('video')).toBeInTheDocument();
    expect(screen.queryByTestId('stage-empty')).toBeNull();
  });

  it('asks the shell for full screen and names the button after the state', async () => {
    const toggle = vi.fn(async () => {});
    const { rerender } = renderInShell({ active: false, supported: true, toggle });
    expect(screen.getByTestId('fullscreen-button')).toHaveAccessibleName('Full screen');

    await userEvent.click(screen.getByTestId('fullscreen-button'));
    expect(toggle).toHaveBeenCalledOnce();

    rerender(
      <StageFullscreenContext.Provider value={{ active: true, supported: true, toggle }}>
        <Stage emptyMessage="x" />
      </StageFullscreenContext.Provider>,
    );
    expect(screen.getByTestId('fullscreen-button')).toHaveAccessibleName('Exit full screen');
  });

  it('has no full-screen button where the browser does not offer it', () => {
    renderInShell({ active: false, supported: false, toggle: async () => {} });

    expect(screen.queryByTestId('fullscreen-button')).toBeNull();
  });

  it('has no full-screen button without a shell around it', () => {
    render(<Stage emptyMessage="x" />);

    expect(screen.queryByTestId('fullscreen-button')).toBeNull();
  });
});
