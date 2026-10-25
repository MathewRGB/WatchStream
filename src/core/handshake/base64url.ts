const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Throws a `SyntaxError` when the input is not valid base64url. */
export function decodeBase64Url(text: string): Uint8Array {
  if (!BASE64URL_PATTERN.test(text) || text.length % 4 === 1) {
    throw new SyntaxError('Invalid base64url input');
  }
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
