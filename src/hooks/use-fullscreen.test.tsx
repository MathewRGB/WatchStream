// @vitest-environment happy-dom
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFullscreen } from './use-fullscreen';

let fullscreenElement: Element | null = null;

function enterFullscreen(element: Element) {
  fullscreenElement = element;
  document.dispatchEvent(new Event('fullscreenchange'));
}

const requestFullscreen = vi.fn(async function (this: Element) {
  enterFullscreen(this);
});
const exitFullscreen = vi.fn(async () => {
  fullscreenElement = null;
  document.dispatchEvent(new Event('fullscreenchange'));
});

beforeEach(() => {
  fullscreenElement = null;
  requestFullscreen.mockClear();
  exitFullscreen.mockClear();
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
  HTMLElement.prototype.requestFullscreen = requestFullscreen;
});

afterEach(() => {
  // @ts-expect-error - remove the stubs again
  delete HTMLElement.prototype.requestFullscreen;
});

function Probe() {
  const { ref, active, toggle, supported } = useFullscreen<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="target">
      <button onClick={() => void toggle()}>toggle</button>
      <span data-testid="state">{`${active}/${supported}`}</span>
    </div>
  );
}

describe('useFullscreen', () => {
  it('starts inactive and reports whether full screen is available', () => {
    const { result } = renderHook(() => useFullscreen<HTMLDivElement>());

    expect(result.current.active).toBe(false);
    expect(result.current.supported).toBe(true);
  });

  it('puts the referenced element into full screen and back', async () => {
    render(<Probe />);

    await userEvent.click(screen.getByText('toggle'));
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(fullscreenElement).toBe(screen.getByTestId('target'));
    expect(screen.getByTestId('state')).toHaveTextContent('true/true');

    await userEvent.click(screen.getByText('toggle'));
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByTestId('state')).toHaveTextContent('false/true');
  });

  it('follows the browser leaving full screen on its own (Escape)', async () => {
    render(<Probe />);
    await userEvent.click(screen.getByText('toggle'));

    await act(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(screen.getByTestId('state')).toHaveTextContent('false/true');
  });

  it('is not active when another element is in full screen', async () => {
    render(<Probe />);

    await act(async () => {
      fullscreenElement = document.body;
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(screen.getByTestId('state')).toHaveTextContent('false/true');
  });

  it('ignores a refusal by the browser', async () => {
    requestFullscreen.mockRejectedValueOnce(new TypeError('Permissions check failed'));
    render(<Probe />);

    await userEvent.click(screen.getByText('toggle'));

    expect(screen.getByTestId('state')).toHaveTextContent('false/true');
  });

  it('reports when full screen is not available', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });

    const { result } = renderHook(() => useFullscreen<HTMLDivElement>());

    expect(result.current.supported).toBe(false);
  });

  it('stops listening after unmounting', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<Probe />);

    unmount();

    expect(remove).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
  });
});
