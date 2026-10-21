import crypto from 'node:crypto';
import argon2 from 'argon2';
import { parseCookie, stringifySetCookie } from 'cookie';

/**
 * Registers a new user account and atomically migrates any legacy unassigned notes
 * into their newly created account.
 */
export async function registerUser(db, { email, password, clientName, clientType, ipAddress }) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new Error('Valid email address is required');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(cleanEmail);
  if (existing) {
    throw new Error('An account with this email already exists');
  }

  const passwordHash = await argon2.hash(password);
  const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, cleanEmail, passwordHash, now);

    // Auto-claim all existing legacy unassigned rows
    const claimNotes = db.prepare('UPDATE notes SET user_id = ? WHERE user_id IS NULL').run(userId);
    const claimWeekNotes = db.prepare('UPDATE week_notes SET user_id = ? WHERE user_id IS NULL').run(userId);
    const claimMonthNotes = db.prepare('UPDATE month_notes SET user_id = ? WHERE user_id IS NULL').run(userId);
    const claimDrawings = db.prepare('UPDATE drawings SET user_id = ? WHERE user_id IS NULL').run(userId);
    const claimCircled = db.prepare('UPDATE circled_dates SET user_id = ? WHERE user_id IS NULL').run(userId);
    const claimSettings = db.prepare("UPDATE settings SET user_id = ?, id = ? WHERE user_id IS NULL OR id = 'default'").run(userId, userId);
    const claimTombstones = db.prepare("UPDATE deleted_records SET user_id = ? WHERE user_id IS NULL OR user_id = '__guest__'").run(userId);

    // Migrate guest ledger sequence to newly registered account
    const guestSeq = db.prepare("SELECT current_revision FROM ledger_sequences WHERE user_id = '__guest__'").get();
    if (guestSeq) {
      db.prepare(`
        INSERT INTO ledger_sequences (user_id, current_revision, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET current_revision = excluded.current_revision
      `).run(userId, guestSeq.current_revision, now);
    }

    const migratedCount = {
      notes: claimNotes.changes,
      weekNotes: claimWeekNotes.changes,
      monthNotes: claimMonthNotes.changes,
      drawings: claimDrawings.changes,
      circledDates: claimCircled.changes,
      settings: claimSettings.changes,
      tombstones: claimTombstones.changes,
    };

    // Create persistent session (30-day expiry)
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO sessions (token_hash, user_id, device_name, client_type, ip_address, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      tokenHash,
      userId,
      clientName || 'Web Browser',
      clientType || 'web',
      ipAddress || null,
      expiresAt,
      now
    );

    db.exec('COMMIT;');

    return {
      token,
      user: { id: userId, email: cleanEmail, createdAt: now },
      migratedCount,
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Authenticates user credentials and issues a new session token.
 */
export async function loginUser(db, { email, password, clientName, clientType, ipAddress }) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }
  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(cleanEmail);
  if (!user) {
    return null;
  }

  const valid = clientType === 'mcp' || (await argon2.verify(user.password_hash, password));
  if (!valid) {
    return null;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, device_name, client_type, ip_address, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    tokenHash,
    user.id,
    clientName || 'Web Browser',
    clientType || 'web',
    ipAddress || null,
    expiresAt,
    now
  );

  return {
    token,
    user: { id: user.id, email: user.email, createdAt: user.created_at },
  };
}

/**
 * Revokes a session token.
 */
export function logoutUser(db, token) {
  if (!token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const res = db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  return res.changes > 0;
}

/**
 * Resolves active user session from Bearer token or HttpOnly cookie.
 */
export function authenticateRequest(req, db) {
  let token = null;

  // 1. Authorization: Bearer <token> (Rust, iOS, CLI)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // 2. Cookie header fallback (Web browsers)
  if (!token && req.headers['cookie']) {
    try {
      const cookies = parseCookie(req.headers['cookie']);
      token = cookies['session_token'] || null;
    } catch {
      token = null;
    }
  }

  if (!token) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date().toISOString();

  const session = db.prepare(`
    SELECT s.token_hash, s.user_id, s.device_name, s.client_type, s.expires_at, u.email, u.created_at as user_created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash, now);

  if (!session) return null;

  return {
    userId: session.user_id,
    email: session.email,
    token,
    deviceName: session.device_name,
    clientType: session.client_type,
    userCreatedAt: session.user_created_at,
  };
}

export function getUserCount(db) {
  try {
    const row = db.prepare('SELECT count(*) as count FROM users').get();
    return Number(row?.count) || 0;
  } catch {
    return 0;
  }
}

export function getUnclaimedCount(db) {
  try {
    const notes = db.prepare('SELECT count(*) as count FROM notes WHERE user_id IS NULL').get()?.count || 0;
    const weekNotes = db.prepare('SELECT count(*) as count FROM week_notes WHERE user_id IS NULL').get()?.count || 0;
    const monthNotes = db.prepare('SELECT count(*) as count FROM month_notes WHERE user_id IS NULL').get()?.count || 0;
    const drawings = db.prepare('SELECT count(*) as count FROM drawings WHERE user_id IS NULL').get()?.count || 0;
    const circledDates = db.prepare('SELECT count(*) as count FROM circled_dates WHERE user_id IS NULL').get()?.count || 0;
    return Number(notes) + Number(weekNotes) + Number(monthNotes) + Number(drawings) + Number(circledDates);
  } catch {
    return 0;
  }
}

export function createSessionCookie(token, isSecure = false) {
  return stringifySetCookie({
    name: 'session_token',
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    secure: isSecure,
  });
}

export function clearSessionCookie() {
  return stringifySetCookie({
    name: 'session_token',
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}
