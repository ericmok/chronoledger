import { URL } from 'node:url';
import {
  authenticateRequest,
  getUserCount,
  getUnclaimedCount,
  registerUser,
  loginUser,
  logoutUser,
  createSessionCookie,
  clearSessionCookie,
} from './auth.js';
import {
  getBackupStatus,
  performBackup,
  triggerBackupCheck,
} from './backup.js';
import {
  calculateBounds,
  getIsoWeek,
} from './bounds.js';
import {
  getDatabase,
  DEFAULT_DB_PATH,
  DEFAULT_DATA_DIR,
  getDataDirFromDb,
  getCalendarData,
  saveCalendarData,
  getCalendarDelta,
  saveCalendarDelta,
  findNoteById,
  getNextLedgerRevision,
  formatUnifiedNote,
} from './db.js';

/**
 * Reads and parses JSON payload from incoming HTTP request.
 */
export function readRequestBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error('Payload exceeds maximum allowed size'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Sends a standardized JSON HTTP response with CORS headers.
 */
export function sendJsonResponse(req, res, statusCode, data, extraHeaders = {}) {
  const payload = JSON.stringify(data);
  const origin = req.headers['origin'] || '*';
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders,
  };
  res.writeHead(statusCode, headers);
  res.end(payload);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function checkTagMatch(content, isStruck, targetTag, status) {
  const cleanTag = targetTag.replace(/^@/, '').toLowerCase();
  // Active tag: matches @tag not preceded by escaping backslash
  const activeRegex = new RegExp(`(^|[^\\\\])@${escapeRegex(cleanTag)}(?![a-zA-Z0-9_:-])`, 'i');
  // Resolved tag: matches ~~@tag~~ not preceded by escaping backslash
  const resolvedRegex = new RegExp(`(^|[^\\\\])~~@${escapeRegex(cleanTag)}~~`, 'i');

  const hasActive = activeRegex.test(content);
  const hasResolved = resolvedRegex.test(content);

  if (!hasActive && !hasResolved) {
    return false;
  }

  if (status === 'open') {
    return !isStruck && hasActive;
  }
  if (status === 'completed') {
    return isStruck || hasResolved;
  }
  return true;
}

export function checkStatusMatch(content, isStruck, status) {
  if (status === 'open') {
    return !isStruck;
  }
  if (status === 'completed') {
    return Boolean(isStruck) || /(?:^|[^\\])~~@[a-zA-Z0-9_:-]+~~/.test(content);
  }
  return true;
}

/**
 * Handles incoming HTTP requests for `/api/*`.
 * Dispatches auth, session, calendar, backup, and granular note requests with full multi-user support.
 */
export function handleApiRequest(req, res, db = getDatabase()) {
  const origin = req.headers['origin'] || '*';
  const dataDir = getDataDirFromDb(db);

  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 2. Health check
  if (pathname === '/api/health' && req.method === 'GET') {
    const session = authenticateRequest(req, db);
    const data = getCalendarData(db, session?.userId || null);

    let totalNotes = 0;
    let totalDrawings = 0;
    try {
      totalNotes = db.prepare('SELECT COUNT(*) as c FROM notes').get()?.c || 0;
      totalDrawings = db.prepare('SELECT COUNT(*) as c FROM drawings').get()?.c || 0;
    } catch {}

    sendJsonResponse(req, res, 200, {
      status: 'ok',
      engine: 'sqlite',
      databasePath: DEFAULT_DB_PATH,
      authenticated: Boolean(session),
      user: session ? { id: session.userId, email: session.email } : null,
      totals: {
        notes: totalNotes,
        drawings: totalDrawings,
      },
      counts: {
        notes: data.notes.length,
        weekNotes: data.weekNotes.length,
        monthNotes: data.monthNotes.length,
        drawings: data.drawings.length,
        circledDates: Object.keys(data.circledDates || {}).length,
      },
      lastSyncedAt: data.syncedAt,
      backup: getBackupStatus(dataDir),
      uptime: process.uptime(),
    });
    return true;
  }

  // 2b. Backup status & on-demand execution: /api/backups
  if (pathname === '/api/backups') {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }

    if (req.method === 'GET') {
      const status = getBackupStatus(dataDir);
      sendJsonResponse(req, res, 200, status);
      return true;
    }

    if (req.method === 'POST') {
      performBackup(db, dataDir, { force: true })
        .then((result) => {
          sendJsonResponse(req, res, 200, { ok: true, ...result });
        })
        .catch((err) => {
          sendJsonResponse(req, res, 500, { ok: false, error: err.message });
        });
      return true;
    }

    sendJsonResponse(req, res, 405, { error: 'Method Not Allowed' });
    return true;
  }

  // 3. Auth: GET /api/auth/me
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    const unclaimedCount = getUnclaimedCount(db);

    if (session) {
      sendJsonResponse(req, res, 200, {
        authenticated: true,
        user: {
          id: session.userId,
          email: session.email,
          createdAt: session.userCreatedAt,
        },
        device: {
          name: session.deviceName,
          type: session.clientType,
        },
        totalUsers,
        unclaimedCount,
      });
    } else {
      sendJsonResponse(req, res, 200, {
        authenticated: false,
        user: null,
        totalUsers,
        unclaimedCount,
        isFirstSetup: totalUsers === 0,
      });
    }
    return true;
  }

  // 4. Auth: POST /api/auth/register
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    readRequestBody(req)
      .then(async (body) => {
        const ip = req.socket?.remoteAddress;
        const result = await registerUser(db, {
          email: body.email,
          password: body.password,
          clientName: body.clientName,
          clientType: body.clientType,
          ipAddress: ip,
        });

        const isSecure = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https';
        const cookieHeader = createSessionCookie(result.token, isSecure);

        sendJsonResponse(
          req,
          res,
          201,
          {
            ok: true,
            token: result.token,
            user: result.user,
            migratedCount: result.migratedCount,
          },
          { 'Set-Cookie': cookieHeader }
        );
      })
      .catch((err) => {
        sendJsonResponse(req, res, 400, { ok: false, error: err.message });
      });
    return true;
  }

  // 5. Auth: POST /api/auth/login
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    readRequestBody(req)
      .then(async (body) => {
        const ip = req.socket?.remoteAddress;
        const result = await loginUser(db, {
          email: body.email,
          password: body.password,
          clientName: body.clientName,
          clientType: body.clientType,
          ipAddress: ip,
        });

        if (!result) {
          sendJsonResponse(req, res, 401, { ok: false, error: 'Invalid email or password' });
          return;
        }

        const isSecure = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https';
        const cookieHeader = createSessionCookie(result.token, isSecure);

        sendJsonResponse(
          req,
          res,
          200,
          {
            ok: true,
            token: result.token,
            user: result.user,
          },
          { 'Set-Cookie': cookieHeader }
        );
      })
      .catch((err) => {
        sendJsonResponse(req, res, 400, { ok: false, error: err.message });
      });
    return true;
  }

  // 6. Auth: POST /api/auth/logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const session = authenticateRequest(req, db);
    if (session?.token) {
      logoutUser(db, session.token);
    }
    const clearCookie = clearSessionCookie();
    sendJsonResponse(req, res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
    return true;
  }

  // 7. Calendar Data GET
  if (pathname === '/api/calendar' && req.method === 'GET') {
    try {
      const session = authenticateRequest(req, db);
      const totalUsers = getUserCount(db);

      if (!session) {
        // If no user has registered yet, allow initial read of unassigned legacy data
        if (totalUsers === 0) {
          const data = getCalendarData(db, null);
          sendJsonResponse(req, res, 200, {
            ...data,
            isFirstSetup: true,
            requiresAuth: true,
          });
          return true;
        }
        sendJsonResponse(req, res, 401, { error: 'Authentication required' });
        return true;
      }

      const data = getCalendarData(db, session.userId);
      sendJsonResponse(req, res, 200, data);
    } catch (err) {
      console.error('SQLite Read Error:', err);
      sendJsonResponse(req, res, 500, { error: 'Failed to read SQLite database' });
    }
    return true;
  }

  // 8. Calendar Data POST (Atomic sync)
  if (pathname === '/api/calendar' && req.method === 'POST') {
    readRequestBody(req)
      .then((payload) => {
        const session = authenticateRequest(req, db);
        const totalUsers = getUserCount(db);

        if (!session) {
          if (totalUsers === 0) {
            const result = saveCalendarData(db, payload, null);
            sendJsonResponse(req, res, 200, result);
            return;
          }
          sendJsonResponse(req, res, 401, { error: 'Authentication required' });
          return;
        }

        const result = saveCalendarData(db, payload, session.userId);
        sendJsonResponse(req, res, 200, result);
      })
      .catch((err) => {
        console.error('SQLite Write Error:', err);
        sendJsonResponse(req, res, 500, { error: 'Failed to write to SQLite database', details: err.message });
      });
    return true;
  }

  // 8b-1. Incremental Calendar Delta GET (Pull changes since revision)
  if (pathname === '/api/calendar/delta' && req.method === 'GET') {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;
    const sinceParam = parsedUrl.searchParams.get('since') || '0';
    try {
      const delta = getCalendarDelta(db, parseInt(sinceParam, 10) || 0, userId);
      sendJsonResponse(req, res, 200, delta);
    } catch (err) {
      console.error('Failed to get calendar delta:', err);
      sendJsonResponse(req, res, 500, { error: 'Failed to read calendar delta', details: err.message });
    }
    return true;
  }

  // 8b-2. Incremental Calendar Delta POST (Batch Delta Sync)
  if (pathname === '/api/calendar/delta' && req.method === 'POST') {
    readRequestBody(req)
      .then((payload) => {
        const session = authenticateRequest(req, db);
        const totalUsers = getUserCount(db);

        if (!session) {
          if (totalUsers === 0) {
            const result = saveCalendarDelta(db, payload, null);
            sendJsonResponse(req, res, 200, result);
            return;
          }
          sendJsonResponse(req, res, 401, { error: 'Authentication required' });
          return;
        }

        const result = saveCalendarDelta(db, payload, session.userId);
        sendJsonResponse(req, res, 200, result);
      })
      .catch((err) => {
        console.error('SQLite Delta Write Error:', err);
        sendJsonResponse(req, res, 500, { error: 'Failed to write delta to SQLite database', details: err.message });
      });
    return true;
  }

  // 8c. Granular Drawings API: POST /api/drawings, POST /api/drawings/batch-delete, DELETE /api/drawings/:id
  if (pathname === '/api/drawings' || pathname.startsWith('/api/drawings/')) {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;

    if (pathname === '/api/drawings' && req.method === 'POST') {
      readRequestBody(req)
        .then((drawing) => {
          if (!drawing || !drawing.id || !drawing.type || !drawing.anchorStartDate) {
            sendJsonResponse(req, res, 400, { error: 'id, type, and anchorStartDate are required' });
            return;
          }
          saveCalendarDelta(db, { drawings: { upsert: [drawing] } }, userId);
          sendJsonResponse(req, res, 201, drawing);
        })
        .catch((err) => sendJsonResponse(req, res, 400, { error: err.message }));
      return true;
    }

    if (pathname === '/api/drawings/batch-delete' && req.method === 'POST') {
      readRequestBody(req)
        .then((body) => {
          const ids = Array.isArray(body?.ids) ? body.ids : [];
          if (ids.length === 0) {
            sendJsonResponse(req, res, 400, { error: 'ids array is required' });
            return;
          }
          saveCalendarDelta(db, { drawings: { delete: ids } }, userId);
          sendJsonResponse(req, res, 200, { ok: true, deletedCount: ids.length });
        })
        .catch((err) => sendJsonResponse(req, res, 400, { error: err.message }));
      return true;
    }

    const drawingIdMatch = pathname.match(/^\/api\/drawings\/([^/]+)$/);
    if (drawingIdMatch && req.method === 'DELETE') {
      const drawingId = decodeURIComponent(drawingIdMatch[1]);
      saveCalendarDelta(db, { drawings: { delete: [drawingId] } }, userId);
      sendJsonResponse(req, res, 200, { ok: true, deletedId: drawingId });
      return true;
    }
  }

  // 8d. Granular Circled Dates API: PUT /api/circled-dates/:dateKey, DELETE /api/circled-dates/:dateKey
  const circleDateMatch = pathname.match(/^\/api\/circled-dates\/([^/]+)$/);
  if (circleDateMatch) {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;
    const dateKey = decodeURIComponent(circleDateMatch[1]);

    if (req.method === 'PUT') {
      readRequestBody(req)
        .then((body) => {
          const color = body?.color || '#D23B38';
          saveCalendarDelta(db, { circledDates: { upsert: { [dateKey]: { color } } } }, userId);
          sendJsonResponse(req, res, 200, { ok: true, dateKey, color });
        })
        .catch((err) => sendJsonResponse(req, res, 400, { error: err.message }));
      return true;
    }

    if (req.method === 'DELETE') {
      saveCalendarDelta(db, { circledDates: { delete: [dateKey] } }, userId);
      sendJsonResponse(req, res, 200, { ok: true, deletedDateKey: dateKey });
      return true;
    }
  }

  // 8e. Settings Partial Update: PATCH /api/settings
  if (pathname === '/api/settings' && req.method === 'PATCH') {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;

    readRequestBody(req)
      .then((settings) => {
        saveCalendarDelta(db, { settings }, userId);
        sendJsonResponse(req, res, 200, { ok: true, settings });
      })
      .catch((err) => sendJsonResponse(req, res, 400, { error: err.message }));
    return true;
  }

  // 9. Granular Note CRUD: /api/notes and /api/notes/:id
  if (pathname === '/api/notes' || pathname.startsWith('/api/notes/')) {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);

    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;

    // A. Query & Filter: GET /api/notes
    if (pathname === '/api/notes' && req.method === 'GET') {
      const scopeParam = parsedUrl.searchParams.get('scope') || 'all';
      const dateParam = parsedUrl.searchParams.get('date');
      const startDateParam = parsedUrl.searchParams.get('start_date');
      const endDateParam = parsedUrl.searchParams.get('end_date');
      const weekParam = parsedUrl.searchParams.get('week');
      const monthParam = parsedUrl.searchParams.get('month');
      const yearParam = parsedUrl.searchParams.get('year');
      const tagParam = parsedUrl.searchParams.get('tag');
      const statusParam = parsedUrl.searchParams.get('status') || 'all';
      const qParam = parsedUrl.searchParams.get('q');
      const limit = Math.max(1, Math.min(500, parseInt(parsedUrl.searchParams.get('limit') || '50', 10)));
      const offset = Math.max(0, parseInt(parsedUrl.searchParams.get('offset') || '0', 10));

      let query = 'SELECT * FROM notes WHERE 1=1';
      const params = [];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      } else {
        query += ' AND user_id IS NULL';
      }

      if (scopeParam && scopeParam !== 'all') {
        query += ' AND scope = ?';
        params.push(scopeParam);
      }

      query += ' ORDER BY created_at DESC';
      const rows = db.prepare(query).all(...params);
      let results = rows.map(formatUnifiedNote);

      let filtered = results.filter((note) => {
        // 1. Date filter (for day notes)
        if (dateParam) {
          // Exact single date takes precedence
          if (note.scope === 'day' && !note.targets.includes(dateParam)) return false;
          if (note.scope !== 'day' && scopeParam !== 'all') return false;
        } else if (startDateParam || endDateParam) {
          // Date range filter (supports closed [startDate, endDate] or open-ended ranges)
          if (note.scope === 'day') {
            const inRange = note.targets.some((d) => {
              if (startDateParam && d < startDateParam) return false;
              if (endDateParam && d > endDateParam) return false;
              return true;
            });
            if (!inRange) return false;
          } else if (scopeParam !== 'all') {
            return false;
          }
        }

        if (weekParam) {
          if (note.scope === 'week' && !note.targets.includes(weekParam)) return false;
          if (note.scope !== 'week' && scopeParam !== 'all') return false;
        }

        if (monthParam) {
          if (note.scope === 'month' && !note.targets.includes(monthParam)) return false;
          if (note.scope !== 'month' && scopeParam !== 'all') return false;
        }

        if (yearParam) {
          if (note.scope === 'year' && !note.targets.includes(yearParam)) return false;
          if (note.scope !== 'year' && scopeParam !== 'all') return false;
        }

        if (qParam && !note.content.toLowerCase().includes(qParam.toLowerCase())) {
          return false;
        }

        if (tagParam) {
          if (!checkTagMatch(note.content, note.isStruck, tagParam, statusParam)) {
            return false;
          }
        } else if (statusParam !== 'all') {
          if (!checkStatusMatch(note.content, note.isStruck, statusParam)) {
            return false;
          }
        }

        return true;
      });

      filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const total = filtered.length;
      const paged = filtered.slice(offset, offset + limit);

      sendJsonResponse(req, res, 200, {
        total,
        limit,
        offset,
        notes: paged,
      });
      return true;
    }

    // B. Create Note: POST /api/notes
    if (pathname === '/api/notes' && req.method === 'POST') {
      readRequestBody(req)
        .then((body) => {
          const scope = body.scope || 'day';
          if (!['time', 'day', 'week', 'month', 'year', 'span'].includes(scope)) {
            sendJsonResponse(req, res, 400, { error: 'scope must be time, day, week, month, year, or span' });
            return;
          }
          if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
            sendJsonResponse(req, res, 400, { error: 'content is required and must be non-empty' });
            return;
          }

          const content = body.content.trim();
          const now = new Date();
          let targets = Array.isArray(body.targets) ? body.targets : [];

          if (targets.length === 0) {
            if (scope === 'day' || scope === 'time') {
              const y = now.getFullYear();
              const m = String(now.getMonth() + 1).padStart(2, '0');
              const d = String(now.getDate()).padStart(2, '0');
              targets = [`${y}-${m}-${d}`];
            } else if (scope === 'week') {
              targets = [getIsoWeek(now)];
            } else if (scope === 'month') {
              const y = now.getFullYear();
              const m = String(now.getMonth() + 1).padStart(2, '0');
              targets = [`${y}-${m}`];
            } else if (scope === 'year') {
              targets = [String(now.getFullYear())];
            }
          }

          const prefix = scope === 'week' ? 'week-note' : scope === 'month' ? 'month-note' : 'note';
          const id = body.id || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const createdAt = body.createdAt || now.toISOString();
          const isStruck = body.isStruck ? 1 : 0;
          const strikeStyle = body.strikeStyle || null;
          const colorTag = body.colorTag || null;
          const originalContent = body.originalContent || null;
          const bounds = calculateBounds(scope, targets);
          const revision = getNextLedgerRevision(db, userId);

          db.prepare(`
            INSERT INTO notes (id, user_id, content, original_content, scope, targets, start_at, end_at, is_struck, strike_style, color_tag, created_at, updated_at, revision)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, userId, content, originalContent, scope, JSON.stringify(targets), bounds.startAt, bounds.endAt, isStruck, strikeStyle, colorTag, createdAt, null, revision);

          if (userId) {
            db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id = ?').run(id, userId);
          } else {
            db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id IS NULL').run(id);
          }

          triggerBackupCheck(db, DEFAULT_DATA_DIR);
          sendJsonResponse(req, res, 201, formatUnifiedNote({
            id,
            user_id: userId,
            content,
            original_content: originalContent,
            scope,
            targets: JSON.stringify(targets),
            start_at: bounds.startAt,
            end_at: bounds.endAt,
            is_struck: isStruck,
            strike_style: strikeStyle,
            color_tag: colorTag,
            created_at: createdAt,
            updated_at: null,
            revision,
          }));
        })
        .catch((err) => {
          sendJsonResponse(req, res, 400, { error: err.message });
        });
      return true;
    }

    // C. Quick Strike Toggle: POST /api/notes/:id/toggle-strike
    const toggleStrikeMatch = pathname.match(/^\/api\/notes\/([^/]+)\/toggle-strike$/);
    if (toggleStrikeMatch && req.method === 'POST') {
      const noteId = decodeURIComponent(toggleStrikeMatch[1]);
      const found = findNoteById(db, noteId, userId);
      if (!found) {
        sendJsonResponse(req, res, 404, { error: `Note not found with id: ${noteId}` });
        return true;
      }

      const nextStruck = found.row.is_struck ? 0 : 1;
      const now = new Date().toISOString();
      const revision = getNextLedgerRevision(db, userId);

      if (userId) {
        db.prepare(`UPDATE notes SET is_struck = ?, updated_at = ?, revision = ? WHERE id = ? AND user_id = ?`).run(nextStruck, now, revision, noteId, userId);
      } else {
        db.prepare(`UPDATE notes SET is_struck = ?, updated_at = ?, revision = ? WHERE id = ? AND user_id IS NULL`).run(nextStruck, now, revision, noteId);
      }

      triggerBackupCheck(db, DEFAULT_DATA_DIR);
      sendJsonResponse(req, res, 200, {
        id: noteId,
        scope: found.scope,
        isStruck: Boolean(nextStruck),
        updatedAt: now,
        revision,
      });
      return true;
    }

    // D. Single Note ID operations: GET, PATCH, DELETE /api/notes/:id
    const noteIdMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (noteIdMatch) {
      const noteId = decodeURIComponent(noteIdMatch[1]);
      const found = findNoteById(db, noteId, userId);

      if (req.method === 'GET') {
        if (!found) {
          sendJsonResponse(req, res, 404, { error: `Note not found with id: ${noteId}` });
          return true;
        }
        sendJsonResponse(req, res, 200, formatUnifiedNote(found.row));
        return true;
      }

      if (req.method === 'PATCH') {
        if (!found) {
          sendJsonResponse(req, res, 404, { error: `Note not found with id: ${noteId}` });
          return true;
        }

        readRequestBody(req)
          .then((body) => {
            const current = found.row;
            let newContent = current.content;
            let newOriginalContent = current.original_content;
            let newScope = current.scope || 'day';
            let newTargets = [];
            try {
              newTargets = JSON.parse(current.targets || current.parent_dates || current.parent_weeks || current.parent_months || '[]');
            } catch {
              newTargets = [];
            }
            let newIsStruck = current.is_struck;
            let newStrikeStyle = current.strike_style;
            let newColorTag = current.color_tag;

            if (typeof body.content === 'string') {
              const trimmed = body.content.trim();
              if (body.preserveDiff === true && trimmed !== current.content) {
                newOriginalContent = current.content;
              } else if (body.originalContent !== undefined) {
                newOriginalContent = body.originalContent || null;
              } else if (body.preserveDiff !== true) {
                newOriginalContent = null;
              }
              newContent = trimmed;
            }

            if (typeof body.scope === 'string') {
              if (['time', 'day', 'week', 'month', 'year', 'span'].includes(body.scope)) {
                newScope = body.scope;
              }
            }

            if (Array.isArray(body.targets)) {
              newTargets = body.targets;
            }
            if (typeof body.isStruck === 'boolean') {
              newIsStruck = body.isStruck ? 1 : 0;
            }
            if (body.strikeStyle !== undefined) {
              newStrikeStyle = body.strikeStyle || null;
            }
            if (body.colorTag !== undefined) {
              newColorTag = body.colorTag || null;
            }

            const bounds = calculateBounds(newScope, newTargets);
            const now = new Date().toISOString();
            const revision = getNextLedgerRevision(db, userId);

            if (userId) {
              db.prepare(`
                UPDATE notes
                SET content = ?, original_content = ?, scope = ?, targets = ?, start_at = ?, end_at = ?, is_struck = ?, strike_style = ?, color_tag = ?, updated_at = ?, revision = ?
                WHERE id = ? AND user_id = ?
              `).run(
                newContent,
                newOriginalContent,
                newScope,
                JSON.stringify(newTargets),
                bounds.startAt,
                bounds.endAt,
                newIsStruck,
                newStrikeStyle,
                newColorTag,
                now,
                revision,
                noteId,
                userId
              );
            } else {
              db.prepare(`
                UPDATE notes
                SET content = ?, original_content = ?, scope = ?, targets = ?, start_at = ?, end_at = ?, is_struck = ?, strike_style = ?, color_tag = ?, updated_at = ?, revision = ?
                WHERE id = ? AND user_id IS NULL
              `).run(
                newContent,
                newOriginalContent,
                newScope,
                JSON.stringify(newTargets),
                bounds.startAt,
                bounds.endAt,
                newIsStruck,
                newStrikeStyle,
                newColorTag,
                now,
                revision,
                noteId
              );
            }

            if (userId) {
              db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id = ?').run(noteId, userId);
            } else {
              db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id IS NULL').run(noteId);
            }

            const updatedRow = {
              ...current,
              content: newContent,
              original_content: newOriginalContent,
              scope: newScope,
              targets: JSON.stringify(newTargets),
              start_at: bounds.startAt,
              end_at: bounds.endAt,
              is_struck: newIsStruck,
              strike_style: newStrikeStyle,
              color_tag: newColorTag,
              updated_at: now,
              revision,
            };

            triggerBackupCheck(db, DEFAULT_DATA_DIR);
            sendJsonResponse(req, res, 200, formatUnifiedNote(updatedRow));
          })
          .catch((err) => {
            sendJsonResponse(req, res, 400, { error: err.message });
          });
        return true;
      }

      if (req.method === 'DELETE') {
        if (!found) {
          sendJsonResponse(req, res, 404, { error: `Note not found with id: ${noteId}` });
          return true;
        }

        const now = new Date().toISOString();
        const revision = getNextLedgerRevision(db, userId);

        if (userId) {
          db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(noteId, userId);
        } else {
          db.prepare('DELETE FROM notes WHERE id = ? AND user_id IS NULL').run(noteId);
        }

        db.prepare(`
          INSERT OR REPLACE INTO deleted_records (id, user_id, entity_type, deleted_at, revision)
          VALUES (?, ?, ?, ?, ?)
        `).run(noteId, userId || null, 'note', now, revision);

        triggerBackupCheck(db, DEFAULT_DATA_DIR);
        sendJsonResponse(req, res, 200, { ok: true, deletedId: noteId });
        return true;
      }
    }
  }

  return false;
}
