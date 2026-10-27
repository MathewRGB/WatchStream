// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';
import { Stage } from './stage';

describe('AppShell', () => {
  it('shows the title, status, actions and stage', () => {
    render(
      <AppShell
        title="WatchStream"
        status="Hosting as user1"
        actions={<button>End</button>}
        stage={<p>the stage</p>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'WatchStream' })).toBeInTheDocument();
    expect(screen.getByText('Hosting as user1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
    expect(screen.getByText('the stage')).toBeInTheDocument();
  });

  it('has no sidebar and no toggle without a sidebar', () => {
    render(<AppShell title="WatchStream" stage={<p>the stage</p>} />);

    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByTestId('sidebar-toggle')).toBeNull();
  });

  it('shows the sidebar next to the stage', () => {
    render(<AppShell title="WatchStream" stage={<p>stage</p>} sidebar={<p>side</p>} />);

    expect(screen.getByTestId('sidebar')).toHaveTextContent('side');
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses and restores the sidebar', async () => {
    render(<AppShell title="WatchStream" stage={<p>stage</p>} sidebar={<p>side</p>} />);

    await userEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('stage')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('fills the window without letting the page scroll', () => {
    render(<AppShell title="WatchStream" stage={<p>stage</p>} sidebar={<p>side</p>} />);

    const shell = screen.getByTestId('app-shell');
    expect(shell).toHaveClass('h-dvh', 'overflow-hidden');
  });
});

describe('AppShell full screen', () => {
  let fullscreenElement: Element | null = null;

  function setFullscreen(element: Element | null) {
    fullscreenElement = element;
    document.dispatchEvent(new Event('fullscreenchange'));
  }

  beforeEach(() => {
    fullscreenElement = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn(async () => setFullscreen(null)),
    });
    HTMLElement.prototype.requestFullscreen = vi.fn(async function (this: Element) {
      setFullscreen(this);
    });
  });

  afterEach(() => {
    // @ts-expect-error - remove the stub again
    delete HTMLElement.prototype.requestFullscreen;
  });

  function renderShell() {
    return render(
      <AppShell
        title="WatchStream"
        stage={<Stage emptyMessage="x" />}
        sidebar={<input data-testid="draft" aria-label="draft" />}
      />,
    );
  }

  it('puts the workspace, stage and sidebar together, into full screen and back', async () => {
    renderShell();
    const button = screen.getByTestId('fullscreen-button');
    expect(button).toHaveAccessibleName('Full screen');

    await userEvent.click(button);
    expect(fullscreenElement).toBe(screen.getByTestId('workspace'));
    expect(screen.getByTestId('workspace')).toContainElement(screen.getByTestId('stage'));
    expect(screen.getByTestId('workspace')).toContainElement(screen.getByTestId('sidebar'));
    expect(button).toHaveAccessibleName('Exit full screen');

    await userEvent.click(button);
    expect(fullscreenElement).toBeNull();
    expect(button).toHaveAccessibleName('Full screen');
  });

  it('keeps the header out of full screen', () => {
    renderShell();

    expect(screen.getByTestId('workspace')).not.toContainElement(
      screen.getByRole('heading', { name: 'WatchStream' }),
    );
  });

  it('moves the same sidebar out of its column, off-screen and out of keyboard reach', async () => {
    renderShell();
    await userEvent.type(screen.getByTestId('draft'), 'half a sentence');
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).not.toHaveAttribute('inert');

    await userEvent.click(screen.getByTestId('fullscreen-button'));

    expect(screen.getByTestId('sidebar')).toBe(sidebar);
    expect(sidebar).toHaveAttribute('inert');
    expect(sidebar).toHaveClass('absolute', 'translate-x-full');
    expect(screen.getByTestId('draft')).toHaveValue('half a sentence');

    await userEvent.click(screen.getByTestId('fullscreen-button'));

    expect(screen.getByTestId('sidebar')).toBe(sidebar);
    expect(sidebar).not.toHaveAttribute('inert');
    expect(screen.getByTestId('draft')).toHaveValue('half a sentence');
  });

  it('gives the stage the whole workspace in full screen', async () => {
    renderShell();
    expect(screen.getByTestId('stage-panel')).toHaveClass('rounded-lg', 'border');

    await userEvent.click(screen.getByTestId('fullscreen-button'));

    expect(screen.getByTestId('stage-panel')).not.toHaveClass('rounded-lg');
    expect(screen.getByTestId('workspace')).toHaveClass('p-0');
  });

  it('has a sidebar in full screen even when it was collapsed, and collapses it again after', async () => {
    renderShell();
    await userEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.queryByTestId('sidebar')).toBeNull();

    await userEvent.click(screen.getByTestId('fullscreen-button'));
    expect(screen.getByTestId('sidebar')).toHaveAttribute('inert');

    await userEvent.click(screen.getByTestId('fullscreen-button'));
    expect(screen.queryByTestId('sidebar')).toBeNull();
  });

  it('has no sidebar element in full screen when the shell has none', async () => {
    render(<AppShell title="WatchStream" stage={<Stage emptyMessage="x" />} />);

    await userEvent.click(screen.getByTestId('fullscreen-button'));

    expect(screen.queryByTestId('sidebar')).toBeNull();
  });
  describe('revealing the sidebar at the right edge', () => {
    async function enterFullscreen() {
      renderShell();
      await userEvent.click(screen.getByTestId('fullscreen-button'));
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('has no edge strip outside full screen', () => {
      renderShell();

      expect(screen.queryByTestId('sidebar-edge')).toBeNull();
    });

    it('slides the sidebar over the picture when the pointer touches the edge', async () => {
      await enterFullscreen();
      expect(screen.getByTestId('sidebar')).toHaveAttribute('inert');

      fireEvent.pointerEnter(screen.getByTestId('sidebar-edge'));

      const sidebar = screen.getByTestId('sidebar');
      expect(sidebar).not.toHaveAttribute('inert');
      expect(sidebar).toHaveClass('translate-x-0');
      expect(screen.getByTestId('stage-panel')).not.toHaveClass('max-sm:hidden');
    });

    it('slides it out again a moment after the pointer left', async () => {
      await enterFullscreen();
      fireEvent.pointerEnter(screen.getByTestId('sidebar-edge'));
      vi.useFakeTimers();

      fireEvent.pointerLeave(screen.getByTestId('sidebar-edge'));
      act(() => void vi.advanceTimersByTime(399));
      expect(screen.getByTestId('sidebar')).not.toHaveAttribute('inert');
      act(() => void vi.advanceTimersByTime(1));

      expect(screen.getByTestId('sidebar')).toHaveAttribute('inert');
      expect(screen.getByTestId('sidebar')).toHaveClass('translate-x-full');
    });

    it('stays while a message is being typed, with the pointer long gone', async () => {
      await enterFullscreen();
      fireEvent.pointerEnter(screen.getByTestId('sidebar-edge'));
      await userEvent.type(screen.getByTestId('draft'), 'still writing');
      vi.useFakeTimers();

      fireEvent.pointerLeave(screen.getByTestId('sidebar'));
      act(() => void vi.advanceTimersByTime(10_000));

      expect(screen.getByTestId('sidebar')).not.toHaveAttribute('inert');
      expect(screen.getByTestId('draft')).toHaveValue('still writing');
    });

    it('closes on a press on the picture', async () => {
      await enterFullscreen();
      fireEvent.pointerEnter(screen.getByTestId('sidebar-edge'));

      fireEvent.pointerDown(screen.getByTestId('stage'));

      expect(screen.getByTestId('sidebar')).toHaveAttribute('inert');
    });

    it('is closed again after leaving full screen and entering it anew', async () => {
      await enterFullscreen();
      fireEvent.pointerEnter(screen.getByTestId('sidebar-edge'));

      await userEvent.click(screen.getByTestId('fullscreen-button'));
      await userEvent.click(screen.getByTestId('fullscreen-button'));

      expect(screen.getByTestId('sidebar')).toHaveAttribute('inert');
    });
  });
});
