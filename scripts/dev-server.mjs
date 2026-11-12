// Local stand-in for Vercel: serves ./dist and routes /api/* to the files in ./api.
//   npm run dev:api            (API only, pair it with `npm run dev`; Vite proxies /api here)
//   npm run build && npm run serve   (whole site on one port)
// Reads .env.local if present. Without Upstash keys it uses an in-memory store (data is lost on restart).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT) || 8787;
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml' };

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function runApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
  const file = path.join(root, 'api', `${name}.js`);
  if (!/^[a-z0-9/_-]+$/i.test(name) || !fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"Not found"}'); }

  const mod = await import(pathToFileURL(file).href);
  req.query = Object.fromEntries(url.searchParams);
  if (mod.config?.api?.bodyParser !== false && req.method !== 'GET') {
    const raw = await readBody(req);
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
  }
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (b) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)); return res; };
  await mod.default(req, res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await runApi(req, res, url);
    let f = path.join(root, 'dist', decodeURIComponent(url.pathname));
    if (!f.startsWith(path.join(root, 'dist'))) { res.writeHead(403); return res.end(); }
    if (url.pathname.startsWith('/_vercel/') || (!fs.existsSync(f) && path.extname(url.pathname))) { res.writeHead(404); return res.end(); }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'dist', 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('Run `npm run build` first, or use `npm run dev` for the website.'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"Server error"}');
  }
}).listen(PORT, () => console.log(`Shonowear dev server: http://localhost:${PORT}  (API at /api/*)`));
