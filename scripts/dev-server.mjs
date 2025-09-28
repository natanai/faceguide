import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
let rootDir = path.resolve(__dirname, '..');
let port = 5173;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--dir' && args[i + 1]) {
    rootDir = path.resolve(__dirname, '..', args[i + 1]);
    i += 1;
  } else if (arg === '--port' && args[i + 1]) {
    port = Number(args[i + 1]) || port;
    i += 1;
  }
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end('Bad request');
    return;
  }
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }
  const filePath = path.join(rootDir, pathname);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      const indexContent = await fs.readFile(indexPath);
      res.writeHead(200, { 'Content-Type': mimeType(indexPath) });
      res.end(indexContent);
      return;
    }
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': mimeType(filePath) });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404).end('Not found');
    } else {
      res.writeHead(500).end('Server error');
    }
  }
});

server.listen(port, () => {
  console.log(`Serving ${rootDir} on http://localhost:${port}/`);
});
