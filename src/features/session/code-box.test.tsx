// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBox, CodeInput } from './code-box';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubClipboard(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
}

describe('CodeBox', () => {
  it('shows the code in a read-only field with its label', () => {
    render(<CodeBox label="Invitation code" code="WSI1.abc" testId="code" />);

    const field = screen.getByLabelText('Invitation code');
    expect(field).toHaveValue('WSI1.abc');
    expect(field).toHaveAttribute('readonly');
  });

  it('shows "Copied" right away when the code was copied automatically', () => {
    render(<CodeBox label="Code" code="WSR1.abc" testId="code" initiallyCopied />);

    expect(screen.getByTestId('code-copy')).toHaveTextContent('Copied');
  });

  it('can make the copy button stand out until the code was copied', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CodeBox label="Code" code="WSR1.abc" testId="code" emphasizeCopy />);
    const button = screen.getByTestId('code-copy');
    expect(button).toHaveAttribute('data-variant', 'default');

    await userEvent.click(button);

    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(button).toHaveAttribute('data-variant', 'secondary');
  });

  it('copies the code and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CodeBox label="Code" code="WSI1.abc" testId="code" />);

    await userEvent.click(screen.getByTestId('code-copy'));

    expect(writeText).toHaveBeenCalledWith('WSI1.abc');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('asks the user to copy manually when the clipboard is not available', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(<CodeBox label="Code" code="WSI1.abc" testId="code" />);

    await userEvent.click(screen.getByTestId('code-copy'));

    expect(await screen.findByText('Select and copy manually')).toBeInTheDocument();
  });
});

describe('CodeInput', () => {
  it('reports what the user pastes', async () => {
    const onChange = vi.fn();
    render(<CodeInput label="Reply" value="" onChange={onChange} testId="reply" />);

    await userEvent.click(screen.getByTestId('reply'));
    await userEvent.paste('WSR1.xyz');

    expect(onChange).toHaveBeenLastCalledWith('WSR1.xyz');
  });

  it('can be disabled', () => {
    render(<CodeInput label="Reply" value="" onChange={vi.fn()} testId="reply" disabled />);

    expect(screen.getByTestId('reply')).toBeDisabled();
  });
});
