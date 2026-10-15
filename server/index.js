import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'calendar.json');
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

function serveStaticFile(res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      const indexPath = path.join(DIST_DIR, 'index.html');
      fs.readFile(indexPath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isImmutable = filePath.includes('/assets/');

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': isImmutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health check API
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
    return;
  }

  // 2. Calendar Data API - GET
  if (pathname === '/api/calendar' && req.method === 'GET') {
    if (fs.existsSync(DATA_FILE)) {
      fs.readFile(DATA_FILE, 'utf-8', (err, raw) => {
        if (err) {
          sendJson(res, 500, { error: 'Failed to read calendar data' });
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          sendJson(res, 200, parsed);
        } catch {
          sendJson(res, 500, { error: 'Corrupt calendar data on server' });
        }
      });
    } else {
      // Empty data if no file yet
      sendJson(res, 200, null);
    }
    return;
  }

  // 3. Calendar Data API - POST
  if (pathname === '/api/calendar' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // Protect against gigantic payloads (10MB limit)
      if (body.length > 10 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        // Atomic write: write to temp file then rename
        const tempFile = `${DATA_FILE}.tmp.${Date.now()}`;
        fs.writeFile(tempFile, JSON.stringify(parsed, null, 2), 'utf-8', (writeErr) => {
          if (writeErr) {
            sendJson(res, 500, { error: 'Failed to save calendar data' });
            return;
          }
          fs.rename(tempFile, DATA_FILE, (renameErr) => {
            if (renameErr) {
              sendJson(res, 500, { error: 'Failed to commit calendar data' });
              return;
            }
            sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() });
          });
        });
      } catch (err) {
        sendJson(res, 400, { error: 'Invalid JSON payload' });
      }
    });
    return;
  }

  // 4. Static frontend asset serving
  if (req.method === 'GET' || req.method === 'HEAD') {
    const cleanPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const requestedPath = path.join(DIST_DIR, cleanPath === '/' ? 'index.html' : cleanPath);
    serveStaticFile(res, requestedPath);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, HOST, () => {
  console.log(`🕮 ChronoLedger server listening at http://${HOST}:${PORT}`);
  console.log(`📁 Calendar data file: ${DATA_FILE}`);
  console.log(`🌐 Serving static files from: ${DIST_DIR}`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  server.close(() => process.exit(0));
});
