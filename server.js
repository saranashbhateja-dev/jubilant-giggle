// JEE Rush OS local frontend server. Supabase is the auth/database backend.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DIR = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method Not Allowed');
    }
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? '' : JSON.stringify({ ok: true, app: 'JEE Rush OS', port: PORT }));
    }
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(DIR, pathname.replace(/^\/+/, ''));
    if (file !== DIR && !file.startsWith(DIR + path.sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const data = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(req.method === 'HEAD' ? '' : data);
  } catch (error) {
    console.error('JEE Rush server error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy. Close the other app using it or set PORT to another value.`);
  else console.error(error);
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => console.log(`JEE Rush OS running at http://${HOST}:${PORT}`));
