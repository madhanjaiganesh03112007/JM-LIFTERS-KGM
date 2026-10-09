const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const ALLOWED_EMAIL = (process.env.ADMIN_EMAIL || 'jkcraneservice69975@gmail.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-before-hosting';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const defaultDb = {
  dashboard: {
    bills: [],
    attendance: [],
    employees: []
  },
  attendanceApp: {
    employees: [],
    attendance: []
  },
  contacts: []
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await writeDb(defaultDb);
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, 'utf8');
  return { ...defaultDb, ...JSON.parse(raw) };
}

async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function sendJson(res, statusCode, payload, req = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(req)
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function createSession(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').filter(Boolean).map(cookie => {
    const [name, ...value] = cookie.trim().split('=');
    return [decodeURIComponent(name), decodeURIComponent(value.join('='))];
  }));
}

function getSession(req) {
  const token = parseCookies(req).jm_auth;
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signature !== sign(payload)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (session.exp < Date.now()) return null;
    if ((session.email || '').toLowerCase() !== ALLOWED_EMAIL) return null;
    return session;
  } catch {
    return null;
  }
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Login required.' }, req);
    return null;
  }
  return session;
}

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (email !== ALLOWED_EMAIL || password !== ADMIN_PASSWORD) {
      sendJson(res, 401, { error: 'Only jkcraneservice69975@gmail.com can sign in.' }, req);
      return;
    }
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `jm_auth=${encodeURIComponent(createSession(email))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
    sendJson(res, 200, { user: { email } }, req);
    return;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', 'jm_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    sendJson(res, 200, { ok: true }, req);
    return;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const session = getSession(req);
    sendJson(res, 200, { user: session ? { email: session.email } : null }, req);
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    requireAuth(req, res);
    if (res.writableEnded) return;
    const db = await readDb();
    sendJson(res, 200, db, req);
    return;
  }

  if (pathname === '/api/state' && req.method === 'PUT') {
    requireAuth(req, res);
    if (res.writableEnded) return;
    const body = await readBody(req);
    const db = await readDb();
    const nextDb = {
      ...db,
      dashboard: body.dashboard ? { ...defaultDb.dashboard, ...body.dashboard } : db.dashboard,
      attendanceApp: body.attendanceApp ? { ...defaultDb.attendanceApp, ...body.attendanceApp } : db.attendanceApp
    };
    await writeDb(nextDb);
    sendJson(res, 200, nextDb, req);
    return;
  }

  if (pathname === '/api/contact' && req.method === 'POST') {
    const body = await readBody(req);
    const db = await readDb();
    db.contacts.unshift({ ...body, createdAt: new Date().toISOString() });
    await writeDb(db);
    sendJson(res, 201, { ok: true }, req);
    return;
  }

  sendJson(res, 404, { error: 'API route not found.' }, req);
}

async function serveStatic(req, res, pathname) {
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^\.\.(?:[\\/]|$)/, '');
  let filePath = path.join(ROOT, safePath === '/' ? 'index.html' : safePath);
  const relative = path.relative(ROOT, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const ext = path.extname(filePath).toLowerCase();
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Server error.' }, req);
  }
});

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

async function getAvailablePort() {
  const preferredPorts = process.env.PORT ? [Number(process.env.PORT)] : [8080, 3000, 4173, 5173];
  for (const port of preferredPorts) {
    if (await isPortAvailable(port)) return port;
  }
  return preferredPorts[0];
}

async function startServer() {
  const port = await getAvailablePort();
  server.listen(port, () => {
    console.log(`JM Lifters backend running at http://localhost:${port}`);
    console.log(`Allowed admin email: ${ALLOWED_EMAIL}`);
  });
}

startServer();
