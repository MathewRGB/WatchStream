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
        title="WatchP2PStream"
        status="Hosting as user1"
        actions={<button>End</button>}
        stage={<p>the stage</p>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'WatchP2PStream' })).toBeInTheDocument();
    expect(screen.getByText('Hosting as user1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
    expect(screen.getByText('the stage')).toBeInTheDocument();
  });

  it('has no sidebar and no toggle without a sidebar', () => {
    render(<AppShell title="WatchP2PStream" stage={<p>the stage</p>} />);

    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByTestId('sidebar-toggle')).toBeNull();
  });

  it('shows the sidebar next to the stage', () => {
    render(<AppShell title="WatchP2PStream" stage={<p>stage</p>} sidebar={<p>side</p>} />);

    expect(screen.getByTestId('sidebar')).toHaveTextContent('side');
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses and restores the sidebar', async () => {
    render(<AppShell title="WatchP2PStream" stage={<p>stage</p>} sidebar={<p>side</p>} />);

    await userEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('stage')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('fills the window without letting the page scroll', () => {
    render(<AppShell title="WatchP2PStream" stage={<p>stage</p>} sidebar={<p>side</p>} />);

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
        title="WatchP2PStream"
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
      screen.getByRole('heading', { name: 'WatchP2PStream' }),
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

  it('clips the workspace in full screen so that nothing can scroll it, whatever is off-screen', async () => {
    renderShell();
    expect(screen.getByTestId('workspace')).not.toHaveClass('overflow-clip');

    await userEvent.click(screen.getByTestId('fullscreen-button'));

    // `overflow: hidden` can still be scrolled by a script; the sidebar waits outside the box.
    expect(screen.getByTestId('workspace')).toHaveClass('overflow-clip');
    expect(screen.getByTestId('workspace')).not.toHaveClass('overflow-hidden');
  });

  it('has no sidebar element in full screen when the shell has none', async () => {
    render(<AppShell title="WatchP2PStream" stage={<Stage emptyMessage="x" />} />);

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

    it('shows a handle at the edge while the sidebar is away, and it opens the sidebar', async () => {
      renderShell();
      expect(screen.queryByTestId('sidebar-handle')).toBeNull();

      await userEvent.click(screen.getByTestId('fullscreen-button'));
      const handle = screen.getByTestId('sidebar-handle');
      expect(handle).toHaveAccessibleName('Show sidebar');
      expect(handle).toHaveAttribute('title', 'Show sidebar (S)');
      expect(handle).not.toHaveClass('invisible');

      await userEvent.click(handle);

      expect(screen.getByTestId('sidebar')).not.toHaveAttribute('inert');
    });

    it('keeps the handle in the page, unseen and inert, while the sidebar covers it', async () => {
      await enterFullscreen();
      const handle = screen.getByTestId('sidebar-handle');

      fireEvent.pointerEnter(handle);

      expect(screen.getByTestId('sidebar-handle')).toBe(handle);
      expect(handle).toHaveClass('invisible');
      expect(handle).toHaveAttribute('inert');
    });

    it('closes after a pointer that touched the handle left it again, before the sidebar was under it', async () => {
      // The pointer is told about leaving only by the element it entered. If that element has
      // gone, the sidebar believes the pointer is still on it and never closes.
      await enterFullscreen();
      const handle = screen.getByTestId('sidebar-handle');
      fireEvent.pointerEnter(handle);
      expect(screen.getByTestId('sidebar')).not.toHaveAttribute('inert');
      vi.useFakeTimers();

      fireEvent.pointerLeave(handle);
      act(() => void vi.advanceTimersByTime(400));

      expect(screen.getByTestId('sidebar')).toHaveAttribute('inert');
    });

    it('opens and closes with the S key, but not while typing in the sidebar', async () => {
      await enterFullscreen();

      await userEvent.keyboard('s');
      expect(screen.getByTestId('sidebar')).not.toHaveAttribute('inert');

      await userEvent.type(screen.getByTestId('draft'), 'sss');
      expect(screen.getByTestId('draft')).toHaveValue('sss');
      expect(screen.getByTestId('sidebar')).not.toHaveAttribute('inert');

      await userEvent.click(screen.getByTestId('stage'));
      expect(screen.getByTestId('sidebar')).toHaveAttribute('inert');
      await userEvent.keyboard('s');
      expect(screen.getByTestId('sidebar')).not.toHaveAttribute('inert');
      await userEvent.keyboard('s');
      expect(screen.getByTestId('sidebar')).toHaveAttribute('inert');
    });

    describe('when a message comes in', () => {
      function renderCounting() {
        const shell = (count: number) => (
          <AppShell
            title="WatchP2PStream"
            stage={<Stage emptyMessage="x" />}
            sidebar={<input data-testid="draft" aria-label="draft" />}
            incomingMessages={count}
          />
        );
        const view = render(shell(0));
        vi.useFakeTimers();
        fireEvent.click(screen.getByTestId('fullscreen-button'));
        return { receive: (count: number) => view.rerender(shell(count)) };
      }

      const visible = () => screen.getByTestId('chat-notice').getAttribute('data-visible');

      it('shows a small symbol for one second', async () => {
        const { receive } = renderCounting();
        await act(async () => {});
        expect(visible()).toBe('false');
        expect(screen.getByTestId('chat-notice')).toHaveClass('opacity-0');

        receive(1);
        expect(visible()).toBe('true');
        expect(screen.getByTestId('chat-notice')).toHaveClass('opacity-100');
        expect(screen.getByRole('status')).toHaveTextContent('New chat message');

        act(() => void vi.advanceTimersByTime(999));
        expect(visible()).toBe('true');
        act(() => void vi.advanceTimersByTime(1));
        expect(visible()).toBe('false');
        expect(screen.getByTestId('chat-notice')).toHaveClass('opacity-0');
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
      });

      it('is shown also when everything else has faded, and does not end that', async () => {
        const { receive } = renderCounting();
        await act(async () => {});
        act(() => void vi.advanceTimersByTime(3_000));
        expect(screen.getByTestId('workspace')).toHaveAttribute('data-idle', 'true');

        receive(1);

        expect(visible()).toBe('true');
        expect(screen.getByTestId('chat-notice').className).not.toContain('group-data');
        expect(screen.getByTestId('workspace')).toHaveAttribute('data-idle', 'true');
      });

      it('takes no clicks and is not read out as a picture', async () => {
        renderCounting();
        await act(async () => {});

        expect(screen.getByTestId('chat-notice')).toHaveClass('pointer-events-none');
        expect(screen.getByTestId('chat-notice')).toHaveAttribute('aria-hidden', 'true');
      });

      it('stays away while the sidebar is open and in view, which shows the message', async () => {
        const { receive } = renderCounting();
        await act(async () => {});
        fireEvent.pointerEnter(screen.getByTestId('sidebar-edge'));

        receive(1);

        expect(visible()).toBe('false');
      });

      it('is shown when the sidebar is open but has faded away', async () => {
        const { receive } = renderCounting();
        await act(async () => {});
        fireEvent.keyDown(document.body, { key: 's' });
        act(() => void vi.advanceTimersByTime(3_000));
        expect(screen.getByTestId('sidebar')).not.toHaveAttribute('inert');
        expect(screen.getByTestId('workspace')).toHaveAttribute('data-idle', 'true');

        receive(1);

        expect(visible()).toBe('true');
      });

      it('has no symbol outside full screen', () => {
        const { rerender } = render(
          <AppShell
            title="WatchP2PStream"
            stage={<Stage emptyMessage="x" />}
            sidebar={<p>side</p>}
            incomingMessages={0}
          />,
        );

        rerender(
          <AppShell
            title="WatchP2PStream"
            stage={<Stage emptyMessage="x" />}
            sidebar={<p>side</p>}
            incomingMessages={3}
          />,
        );

        expect(screen.queryByTestId('chat-notice')).toBeNull();
      });
    });

    describe('when nothing happens', () => {
      /** The clock must be fake before full screen starts the wait, so it is entered by event. */
      async function enterFullscreenOnFakeClock() {
        renderShell();
        vi.useFakeTimers();
        fireEvent.click(screen.getByTestId('fullscreen-button'));
        await act(async () => {});
      }

      const IDLE_FADE = 'group-data-[idle=true]/workspace:opacity-0';

      it('leaves only the picture after a few seconds, and brings everything back on a move', async () => {
        await enterFullscreenOnFakeClock();
        const workspace = screen.getByTestId('workspace');
        expect(workspace).toHaveAttribute('data-idle', 'false');

        act(() => void vi.advanceTimersByTime(2_999));
        expect(workspace).toHaveAttribute('data-idle', 'false');
        act(() => void vi.advanceTimersByTime(1));

        expect(workspace).toHaveAttribute('data-idle', 'true');
        expect(workspace).toHaveClass('cursor-none');

        act(() => {
          document.dispatchEvent(
            new MouseEvent('pointermove', { clientX: 5, clientY: 5, bubbles: true }),
          );
        });

        expect(workspace).toHaveAttribute('data-idle', 'false');
        expect(workspace).not.toHaveClass('cursor-none');
      });

      it('lets go of every control, the stage buttons and the handle and the sidebar', async () => {
        await enterFullscreen();

        expect(screen.getByTestId('fullscreen-button')).toHaveClass(IDLE_FADE);
        expect(screen.getByTestId('sidebar-handle')).toHaveClass(IDLE_FADE);
        expect(screen.getByTestId('sidebar')).toHaveClass(IDLE_FADE);
      });

      it('does not start while the pointer rests on the sidebar, where someone reads', async () => {
        await enterFullscreenOnFakeClock();
        fireEvent.pointerEnter(screen.getByTestId('sidebar-edge'));

        act(() => void vi.advanceTimersByTime(30_000));
        expect(screen.getByTestId('workspace')).toHaveAttribute('data-idle', 'false');

        fireEvent.pointerLeave(screen.getByTestId('sidebar'));
        act(() => void vi.advanceTimersByTime(3_000));
        expect(screen.getByTestId('workspace')).toHaveAttribute('data-idle', 'true');
      });

      it('never starts outside full screen', () => {
        renderShell();
        vi.useFakeTimers();

        act(() => void vi.advanceTimersByTime(60_000));

        expect(screen.getByTestId('workspace')).toHaveAttribute('data-idle', 'false');
      });
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
