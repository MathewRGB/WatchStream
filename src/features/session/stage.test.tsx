// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Stage } from './stage';

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

  it('puts the stage itself into full screen and back', async () => {
    render(<Stage emptyMessage="x" />);
    const button = screen.getByTestId('fullscreen-button');
    expect(button).toHaveAccessibleName('Full screen');

    await userEvent.click(button);
    expect(fullscreenElement).toBe(screen.getByTestId('stage'));
    expect(button).toHaveAccessibleName('Exit full screen');

    await userEvent.click(button);
    expect(fullscreenElement).toBeNull();
    expect(button).toHaveAccessibleName('Full screen');
  });

  it('hides the full-screen button where the browser does not offer it', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });

    render(<Stage emptyMessage="x" />);

    expect(screen.queryByTestId('fullscreen-button')).toBeNull();
  });
});
