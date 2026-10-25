type Child = Node | string | null | undefined | false;

export interface ElementOptions {
  className?: string;
  testId?: string;
  text?: string;
  attrs?: Record<string, string>;
}

/**
 * Creates an element. Text is always set via text nodes, never parsed as
 * HTML, so user-provided content cannot inject markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.testId) element.dataset.testid = options.testId;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    element.setAttribute(name, value);
  }
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

export function button(text: string, testId: string, onClick: () => void): HTMLButtonElement {
  const element = el('button', { text, testId, attrs: { type: 'button' } });
  element.addEventListener('click', onClick);
  return element;
}

export function setStatus(element: HTMLElement, text: string, kind: 'info' | 'error' = 'info') {
  element.textContent = text;
  element.dataset.kind = kind;
}
