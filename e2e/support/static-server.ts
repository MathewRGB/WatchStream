import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
};

/** Serves a built extension directory over http://localhost for browsers without extension loading. */
export async function serveDirectory(
  directory: string,
): Promise<{ url: string; close(): Promise<void> }> {
  const root = resolve(directory);
  const server: Server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname));
    const file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise((done) => server.close(() => done())),
  };
}
