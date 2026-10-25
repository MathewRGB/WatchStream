import { button, el } from '../dom';

/** A read-only code with a copy button. */
export function createCodeBox(label: string, code: string, testId: string): HTMLElement {
  const textarea = el('textarea', {
    className: 'code',
    testId,
    attrs: { readonly: '', rows: '4', 'aria-label': label, spellcheck: 'false' },
  });
  textarea.value = code;

  const copyButton = button('Copy', `${testId}-copy`, () => {
    void copy(textarea).then((copied) => {
      copyButton.textContent = copied ? 'Copied' : 'Select and copy manually';
    });
  });

  return el('div', { className: 'code-box' }, el('label', { text: label }), textarea, copyButton);
}

async function copy(textarea: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(textarea.value);
    return true;
  } catch {
    textarea.select();
    return false;
  }
}

/** An input for pasting a code. */
export function createCodeInput(label: string, testId: string): HTMLTextAreaElement {
  return el('textarea', {
    className: 'code',
    testId,
    attrs: { rows: '4', 'aria-label': label, placeholder: label, spellcheck: 'false' },
  });
}
