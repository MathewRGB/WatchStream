/**
 * Copies text to the clipboard. Resolves to `false` instead of throwing when
 * the browser refuses (no user activation, permission denied) or has no
 * clipboard API, so callers can fall back to asking the user to copy by hand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
