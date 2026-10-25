import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const directory = path.resolve(project, process.argv[2] || 'dist');
if (directory !== path.join(project, 'dist') && directory !== path.join(project, 'public')) throw new Error('Serve only dist or public.');
if (directory.endsWith(`${path.sep}dist`)) await import('./build.mjs');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
const port = Number(process.env.PORT || 4173);
const headerFile = await readFile(path.join(directory, '_headers'), 'utf8').catch(() => '');
const securityHeaders = Object.fromEntries(headerFile.split('\n\n')[0].split('\n').filter(line => line.startsWith('  ')).map(line => {
  const colon = line.indexOf(':');
  return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
}));
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    let target = path.resolve(directory, `.${pathname}`);
    const relative = path.relative(directory, target);
    if (relative.startsWith('..') || path.isAbsolute(relative) || pathname.includes('\\') || pathname.includes('\0')) { res.writeHead(403); res.end('Forbidden'); return; }
    let info = await stat(target).catch(() => null);
    if (info?.isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(301, { Location: `${pathname}/${url.search}` }); res.end(); return; }
      target = path.join(target, 'index.html');
      info = await stat(target).catch(() => null);
    }
    let status = 200;
    if (!info?.isFile()) { target = path.join(directory, '404.html'); status = 404; }
    const data = await readFile(target);
    res.writeHead(status, { ...securityHeaders, 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(400); res.end('Bad request'); }
});
server.listen(port, '127.0.0.1', () => console.log(`RaiseWise preview: http://127.0.0.1:${port}`));
