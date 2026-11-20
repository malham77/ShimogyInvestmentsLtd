import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DatabaseManager,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  computeLoanReturnDate,
  computeReturnsDate,
  hashPassword,
  normalizePhone,
  normalizeSavingsStatus,
  sanitizeUrl,
  todayISO,
  verifyPassword,
  writeStaticSupabaseSchemaFile
} from './src/db-adapter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const UPLOADS_DIR = path.resolve(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseManager();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security Headers (compatible with iframe preview, Google Auth popups, Supabase REST, external images & Leaflet)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  const proto = String(req.headers['x-forwarded-proto'] || '');
  if (req.secure || proto === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://unpkg.com https://apis.google.com https://www.gstatic.com https://*.firebaseapp.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https: http:",
      "connect-src 'self' https://ihgfsvkcpgxklotjmokl.supabase.co https://*.supabase.co https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://*.tile.openstreetmap.org",
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://*.google.com",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; ')
  );
  if (req.path.startsWith('/api/') && !req.path.startsWith('/api/media/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// In-memory sliding-window rate limiter for auth and submission endpoints
const rateBuckets = new Map<string, number[]>();
function createRateLimiter(bucketName: string, maxHits: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.ip || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    const recent = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxHits) {
      res.status(429).json({ error: 'Too many requests. Please wait a minute before trying again.' });
      return;
    }
    recent.push(now);
    rateBuckets.set(key, recent);
    if (rateBuckets.size > 4000) {
      const oldestKey = rateBuckets.keys().next().value;
      if (oldestKey) rateBuckets.delete(oldestKey);
    }
    next();
  };
}

const loginLimiter = createRateLimiter('login', 20, 5 * 60 * 1000);
const submitLimiter = createRateLimiter('submit', 25, 10 * 60 * 1000);
const passwordLimiter = createRateLimiter('password', 12, 10 * 60 * 1000);

function toNonNegativeNumber(val: unknown, fallback = 0): number | null {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

interface AuthenticatedRequest extends Request {
  authSession?: {
    token: string;
    role: string;
    user_id: number;
    identifier: string;
  };
}

function asyncHandler(fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
      console.error('API route error:', err);
      if (!res.headersSent) {
        const code = String(err?.code || '');
        const msg = String(err?.message || '');
        if (code === '23505' || /unique constraint|duplicate key/i.test(msg)) {
          res.status(409).json({ error: 'A record with that unique value already exists.' });
          return;
        }
        if (code === '22P02' || /invalid input syntax/i.test(msg)) {
          res.status(400).json({ error: 'One or more numeric or date values are invalid.' });
          return;
        }
        if (
          code === 'ECONNRESET' ||
          code === 'ETIMEDOUT' ||
          code === '57P01' ||
          code === '08006' ||
          code === '08003' ||
          /connection terminated|timeout|socket hang up/i.test(msg)
        ) {
          res.status(503).json({ error: 'Database connection was briefly interrupted. Please try again.' });
          return;
        }
        res.status(500).json({ error: 'Unable to process request right now. Please try again.' });
      }
    });
  };
}

async function getSessionFromHeader(req: Request) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;

  if (token.startsWith('sb_adm_') || token.startsWith('sb_mem_')) {
    const isAdm = token.startsWith('sb_adm_');
    const jwt = token.slice(7).trim();
    const sbUser = await verifySupabaseAccessToken(jwt);
    if (!sbUser || !sbUser.email) return null;

    if (isAdm) {
      const admin = await ensureAdminRowForEmail(sbUser.email, sbUser.name, sbUser.isMetadataAdmin);
      if (!admin) return null;
      return {
        token,
        role: 'admin',
        user_id: Number(admin.id),
        identifier: String(admin.email)
      };
    }

    const member = await db.get<{ id: number; phone: string }>(
      'SELECT id, phone FROM members WHERE lower(email) = lower(?) LIMIT 1',
      [sbUser.email]
    );
    if (!member) return null;
    return {
      token,
      role: 'member',
      user_id: Number(member.id),
      identifier: String(member.phone)
    };
  }

  const nowIso = new Date().toISOString();
  const row = await db.get<{ token: string; role: string; user_id: number; identifier: string; expires_at: string }>(
    'SELECT token, role, user_id, identifier, expires_at FROM auth_sessions WHERE token = ? AND expires_at > ?',
    [token, nowIso]
  );
  return row || null;
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  getSessionFromHeader(req)
    .then((session) => {
      if (!session || session.role !== 'admin') {
        res.status(401).json({ error: 'Admin authentication required.' });
        return;
      }
      req.authSession = session;
      next();
    })
    .catch(next);
}

function requireMemberOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  getSessionFromHeader(req)
    .then((session) => {
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      req.authSession = session;
      next();
    })
    .catch(next);
}

async function createSession(role: string, userId: number, identifier: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.run('DELETE FROM auth_sessions WHERE expires_at <= ?', [new Date().toISOString()]);
  await db.run(
    'INSERT INTO auth_sessions (token, role, user_id, identifier, expires_at) VALUES (?, ?, ?, ?, ?)',
    [token, role, userId, identifier, expiresAt]
  );
  return token;
}

function sanitizeMember(member: Record<string, any>) {
  const { password_hash: _ignored, ...rest } = member;
  return rest;
}

async function getFullMemberProfile(memberId: number) {
  const member = await db.get<Record<string, any>>('SELECT * FROM members WHERE id = ?', [memberId]);
  if (!member) return null;

  const phone = member.phone;
  const normSelfPhone = normalizePhone(phone);
  const [investments, rawSavings, rawLoans, rawCycles, notifications] = await Promise.all([
    db.all('SELECT * FROM investments WHERE member_id = ? OR member_phone = ? ORDER BY id DESC', [memberId, phone]),
    db.all('SELECT * FROM savings WHERE member_id = ? OR member_phone = ? ORDER BY id DESC', [memberId, phone]),
    db.all('SELECT * FROM loans WHERE member_id = ? OR member_phone = ? ORDER BY id DESC', [memberId, phone]),
    db.all('SELECT * FROM member_cycles WHERE member_id = ? OR member_phone = ? ORDER BY id DESC', [memberId, phone]),
    db.all('SELECT * FROM client_notifications WHERE member_id = ? OR member_phone = ? ORDER BY id DESC LIMIT 30', [memberId, phone])
  ]);

  const cycleKeys = Array.from(
    new Set(
      rawCycles
        .map((c) => String(c.cycle_name || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const peersByCycle = new Map<string, Map<string, string>>();
  if (cycleKeys.length > 0) {
    const placeholders = cycleKeys.map(() => '?').join(', ');
    const peerRows = await db.all<Record<string, any>>(
      `SELECT mc.cycle_name, mc.member_id, mc.member_phone,
              COALESCE(NULLIF(m.name, ''), mc.member_name) AS display_name
       FROM member_cycles mc
       LEFT JOIN members m ON m.id = mc.member_id
       WHERE LOWER(TRIM(mc.cycle_name)) IN (${placeholders})
         AND LOWER(COALESCE(mc.status, 'active')) NOT IN ('exited', 'stopped')`,
      cycleKeys
    );
    for (const row of peerRows) {
      const cKey = String(row.cycle_name || '').trim().toLowerCase();
      if (!cKey) continue;
      const peerId = row.member_id !== null && row.member_id !== undefined ? Number(row.member_id) : null;
      const peerPhone = normalizePhone(String(row.member_phone || ''));
      const isSelf = (peerId !== null && peerId === Number(memberId)) || (peerPhone !== '' && peerPhone === normSelfPhone);
      if (isSelf) continue;

      const displayName = String(row.display_name || '').trim();
      if (!displayName) continue;
      const clientKey = peerId !== null ? `id:${peerId}` : `ph:${peerPhone || displayName.toLowerCase()}`;
      if (!peersByCycle.has(cKey)) peersByCycle.set(cKey, new Map<string, string>());
      peersByCycle.get(cKey)!.set(clientKey, displayName);
    }
  }

  const cycles = rawCycles.map((cy) => {
    const cKey = String(cy.cycle_name || '').trim().toLowerCase();
    const peerMap = peersByCycle.get(cKey);
    const coMembers = peerMap ? Array.from(peerMap.values()).sort((a, b) => a.localeCompare(b)) : [];
    return {
      ...cy,
      co_members: coMembers
    };
  });

  const savings = rawSavings.map((s) => ({
    ...s,
    status: normalizeSavingsStatus(String(s.account_type || ''), String(s.status || ''))
  }));

  const loans = rawLoans.map((l) => ({
    ...l,
    return_date: l.return_date || computeLoanReturnDate(String(l.request_date || todayISO()), String(l.duration || '30 days'))
  }));

  const normalizedInvestments = investments.map((inv) => ({
    ...inv,
    returns_date: inv.returns_date || computeReturnsDate(String(inv.created_at || todayISO()), String(inv.duration || '60 Days'))
  }));

  return {
    ...sanitizeMember(member),
    investments: normalizedInvestments,
    savings,
    loans,
    cycles,
    notifications
  };
}

let cachedFirebaseApiKey = '';
function getFirebaseWebApiKey(): string {
  if (cachedFirebaseApiKey) return cachedFirebaseApiKey;
  if (process.env.FIREBASE_WEB_API_KEY) {
    cachedFirebaseApiKey = String(process.env.FIREBASE_WEB_API_KEY).trim();
    return cachedFirebaseApiKey;
  }
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg && cfg.apiKey) {
        cachedFirebaseApiKey = String(cfg.apiKey).trim();
        return cachedFirebaseApiKey;
      }
    }
  } catch (_e) {}
  return '';
}

async function verifyFirebaseGoogleIdToken(idToken: string): Promise<{ uid: string; email: string; emailVerified: boolean; name: string } | null> {
  const apiKey = getFirebaseWebApiKey();
  const cleanToken = String(idToken || '').trim();
  if (!apiKey || !cleanToken) return null;
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: cleanToken })
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { users?: Array<{ localId?: string; email?: string; emailVerified?: boolean; displayName?: string }> };
  const u = data && Array.isArray(data.users) ? data.users[0] : null;
  if (!u || !u.email || !u.emailVerified) return null;
  return {
    uid: String(u.localId || ''),
    email: String(u.email).trim().toLowerCase(),
    emailVerified: Boolean(u.emailVerified),
    name: String(u.displayName || '').trim()
  };
}

interface VerifiedSupabaseUser {
  id: string;
  email: string;
  name: string;
  isMetadataAdmin: boolean;
}

const sbTokenCache = new Map<string, { user: VerifiedSupabaseUser; expiresAt: number }>();

function getBootstrappedAdminEmails(): Set<string> {
  return new Set([
    'mal77ham@gmail.com',
    'maleham06@gmail.com',
    String(process.env.ADMIN_EMAIL || 'admin@shimogy.com').trim().toLowerCase()
  ]);
}

async function ensureAdminRowForEmail(email: string, name = '', allowAutoCreate = false) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  let admin = await db.get<Record<string, any>>(
    'SELECT * FROM admin_users WHERE lower(email) = lower(?)',
    [cleanEmail]
  );
  if (!admin && (allowAutoCreate || getBootstrappedAdminEmails().has(cleanEmail))) {
    const randomPass = crypto.randomBytes(24).toString('hex');
    const info = await db.run(
      'INSERT INTO admin_users (email, name, password_hash) VALUES (?, ?, ?)',
      [cleanEmail, name || 'SHIMOGY Administrator', hashPassword(randomPass)]
    );
    admin = await db.get<Record<string, any>>('SELECT * FROM admin_users WHERE id = ?', [info.lastInsertRowid]);
  }
  return admin || null;
}

async function verifySupabaseAccessToken(accessToken: string): Promise<VerifiedSupabaseUser | null> {
  const jwt = String(accessToken || '').trim();
  if (!jwt || !SUPABASE_ANON_KEY) return null;
  const cacheKey = crypto.createHash('sha256').update(jwt).digest('hex');
  const cached = sbTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json'
      }
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      id?: string;
      email?: string;
      user_metadata?: Record<string, any>;
      app_metadata?: Record<string, any>;
    };
    const email = String(data?.email || '').trim().toLowerCase();
    if (!email) return null;
    const verified: VerifiedSupabaseUser = {
      id: String(data?.id || ''),
      email,
      name: String(data?.user_metadata?.full_name || data?.user_metadata?.name || '').trim(),
      isMetadataAdmin: String(data?.app_metadata?.role || '').toLowerCase() === 'admin'
    };
    sbTokenCache.set(cacheKey, { user: verified, expiresAt: Date.now() + 45_000 });
    if (sbTokenCache.size > 1000) {
      const oldest = sbTokenCache.keys().next().value;
      if (oldest) sbTokenCache.delete(oldest);
    }
    return verified;
  } catch {
    return null;
  }
}

async function verifySupabaseAuthPassword(email: string, password: string): Promise<{
  access_token: string;
  refresh_token: string;
  user: VerifiedSupabaseUser;
} | null> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password || !SUPABASE_ANON_KEY) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ email: cleanEmail, password: String(password) })
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      access_token?: string;
      refresh_token?: string;
      user?: {
        id?: string;
        email?: string;
        user_metadata?: Record<string, any>;
        app_metadata?: Record<string, any>;
      };
    };
    if (!data?.access_token || !data?.user?.email) return null;
    const verified: VerifiedSupabaseUser = {
      id: String(data.user.id || ''),
      email: String(data.user.email).trim().toLowerCase(),
      name: String(data.user.user_metadata?.full_name || data.user.user_metadata?.name || '').trim(),
      isMetadataAdmin: String(data.user.app_metadata?.role || '').toLowerCase() === 'admin'
    };
    const cacheKey = crypto.createHash('sha256').update(data.access_token).digest('hex');
    sbTokenCache.set(cacheKey, { user: verified, expiresAt: Date.now() + 45_000 });
    return {
      access_token: data.access_token,
      refresh_token: String(data.refresh_token || ''),
      user: verified
    };
  } catch {
    return null;
  }
}

async function updateSupabaseAuthUser(accessToken: string, updates: { email?: string; password?: string }) {
  if (!accessToken || !SUPABASE_ANON_KEY) return { ok: false, error: 'Missing Supabase session.' };
  try {
    const payload: Record<string, string> = {};
    if (updates.email) payload.email = updates.email;
    if (updates.password) payload.password = updates.password;
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = (await resp.json().catch(() => ({}))) as Record<string, any>;
    if (!resp.ok) {
      return { ok: false, error: String(data.msg || data.error_description || data.error || 'Supabase Auth update failed.') };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Unable to reach Supabase Auth.' };
  }
}

// ============================================================
// PUBLIC API ROUTES
// ============================================================

app.get('/api/health', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    status: 'ok',
    database: db.mode,
    supabaseUrl: SUPABASE_URL,
    timestamp: new Date().toISOString()
  });
});

app.get(
  '/api/site-data',
  asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const [settingsRows, heroSlides, testimonials, plans, publicCycles, updates] = await Promise.all([
      db.all<{ key: string; value: string }>('SELECT key, value FROM site_settings'),
      db.all('SELECT * FROM hero_slides WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'),
      db.all('SELECT * FROM testimonials WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'),
      db.all('SELECT * FROM investment_plans ORDER BY price ASC, id ASC'),
      db.all('SELECT * FROM public_cycles ORDER BY id ASC'),
      db.all("SELECT * FROM updates WHERE status = 'published' ORDER BY published_date DESC, id DESC")
    ]);

    const settings: Record<string, string> = {};
    for (const row of settingsRows) settings[row.key] = row.value;

    res.json({ settings, heroSlides, testimonials, plans, publicCycles, updates });
  })
);

app.post(
  '/api/requests',
  submitLimiter,
  asyncHandler(async (req, res) => {
    const { request_type, applicant_name, applicant_phone, details, age_confirmed, guardian_name } = req.body || {};
    if (!request_type || !applicant_name || !applicant_phone) {
      res.status(400).json({ error: 'Full name, phone number, and request type are required.' });
      return;
    }
    if (!age_confirmed) {
      res.status(400).json({ error: 'Age verification or parent/guardian consent confirmation is required.' });
      return;
    }

    const normalizedPhone = normalizePhone(applicant_phone);
    const info = await db.run(
      `INSERT INTO service_requests (request_type, applicant_name, applicant_phone, details_json, age_confirmed, guardian_name, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [
        String(request_type).slice(0, 60),
        String(applicant_name).trim().slice(0, 140),
        normalizedPhone,
        JSON.stringify(details || {}).slice(0, 4000),
        age_confirmed ? 1 : 0,
        String(guardian_name || '').trim().slice(0, 140)
      ]
    );

    res.status(201).json({ id: info.lastInsertRowid, status: 'pending' });
  })
);

app.post(
  '/api/deletion-requests',
  submitLimiter,
  asyncHandler(async (req, res) => {
    const { full_name, phone, email, reason } = req.body || {};
    if (!full_name || !phone) {
      res.status(400).json({ error: 'Full name and registered phone number are required to verify your deletion request.' });
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    const info = await db.run(
      `INSERT INTO deletion_requests (full_name, phone, email, reason, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [
        String(full_name).trim().slice(0, 140),
        normalizedPhone,
        String(email || '').trim().slice(0, 160),
        String(reason || '').trim().slice(0, 1000)
      ]
    );

    res.status(201).json({
      id: info.lastInsertRowid,
      message: 'Your data deletion request has been logged. Our compliance team will process and confirm removal within 72 hours.'
    });
  })
);

// ============================================================
// CLIENT AUTH & PORTAL API
// ============================================================

app.post(
  '/api/member/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { phone, email, identifier, password } = req.body || {};
    const rawId = String(email || phone || identifier || '').trim();
    if (!rawId || !password) {
      res.status(400).json({ error: 'Phone number (or email) and password are required.' });
      return;
    }

    const isEmailInput = rawId.includes('@');
    let member = isEmailInput
      ? await db.get<Record<string, any>>('SELECT * FROM members WHERE lower(email) = lower(?) LIMIT 1', [rawId])
      : await db.get<Record<string, any>>('SELECT * FROM members WHERE phone = ? OR phone = ? LIMIT 1', [
          normalizePhone(rawId),
          rawId
        ]);

    if (member && verifyPassword(String(password), member.password_hash)) {
      const token = await createSession('member', Number(member.id), member.phone);
      res.json({ token, member: sanitizeMember(member) });
      return;
    }

    const sbEmail = isEmailInput ? rawId.toLowerCase() : String(member?.email || '').trim().toLowerCase();
    if (sbEmail) {
      const sbAuth = await verifySupabaseAuthPassword(sbEmail, String(password));
      if (sbAuth) {
        if (!member) {
          member = await db.get<Record<string, any>>('SELECT * FROM members WHERE lower(email) = lower(?) LIMIT 1', [
            sbAuth.user.email
          ]);
        }
        if (!member) {
          res.status(404).json({
            error: `Signed into Supabase Auth (${sbAuth.user.email}), but no client ledger profile is linked to this email yet. Ask Operations to add ${sbAuth.user.email} to your profile in Clients Directory.`
          });
          return;
        }
        res.json({
          token: `sb_mem_${sbAuth.access_token}`,
          refresh_token: sbAuth.refresh_token,
          supabaseAuth: true,
          member: sanitizeMember(member)
        });
        return;
      }
    }

    res.status(401).json({ error: 'Invalid phone/email or password.' });
  })
);

app.post(
  '/api/member/google-login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { idToken } = req.body || {};
    if (!idToken) {
      res.status(400).json({ error: 'Google verification token is required.' });
      return;
    }
    const gUser = await verifyFirebaseGoogleIdToken(String(idToken));
    if (!gUser) {
      res.status(401).json({ error: 'Unable to verify your Google account. Please try again.' });
      return;
    }
    const member = await db.get<Record<string, any>>(
      'SELECT * FROM members WHERE lower(email) = lower(?) LIMIT 1',
      [gUser.email]
    );
    if (!member) {
      res.status(404).json({
        error: `No SHIMOGY client account is linked to ${gUser.email}. Please sign in with your registered Phone Number & Password or ask Operations to add your Gmail to your profile.`
      });
      return;
    }
    const token = await createSession('member', Number(member.id), member.phone);
    const profile = await getFullMemberProfile(Number(member.id));
    res.json({ token, member: profile || sanitizeMember(member) });
  })
);

app.get(
  '/api/member/me',
  requireMemberOrAdmin,
  asyncHandler(async (req, res) => {
    const session = req.authSession!;
    if (session.role !== 'member') {
      res.status(403).json({ error: 'Client session required.' });
      return;
    }
    const profile = await getFullMemberProfile(Number(session.user_id));
    if (!profile) {
      res.status(404).json({ error: 'Client account not found.' });
      return;
    }
    res.json({ member: profile });
  })
);

app.post(
  '/api/member/change-password',
  passwordLimiter,
  requireMemberOrAdmin,
  asyncHandler(async (req, res) => {
    const session = req.authSession!;
    if (session.role !== 'member') {
      res.status(403).json({ error: 'Client session required.' });
      return;
    }
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || String(newPassword).length < 4) {
      res.status(400).json({ error: 'Current password and a new password (min 4 chars) are required.' });
      return;
    }
    const member = await db.get<Record<string, any>>('SELECT * FROM members WHERE id = ?', [session.user_id]);
    if (!member) {
      res.status(404).json({ error: 'Client account not found.' });
      return;
    }

    if (session.token.startsWith('sb_mem_')) {
      if (String(newPassword).length < 6) {
        res.status(400).json({ error: 'Supabase Auth passwords must be at least 6 characters.' });
        return;
      }
      const verifiedCur = await verifySupabaseAuthPassword(String(member.email || ''), String(currentPassword));
      if (!verifiedCur) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }
      const upd = await updateSupabaseAuthUser(session.token.slice(7), { password: String(newPassword) });
      if (!upd.ok) {
        res.status(400).json({ error: upd.error || 'Could not update Supabase Auth password.' });
        return;
      }
      await db.run('UPDATE members SET password_hash = ? WHERE id = ?', [hashPassword(String(newPassword)), member.id]);
      res.json({ success: true });
      return;
    }

    if (!verifyPassword(String(currentPassword), member.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    await db.run('UPDATE members SET password_hash = ? WHERE id = ?', [hashPassword(String(newPassword)), member.id]);
    res.json({ success: true });
  })
);

// Exit public cycle or Stop custom cycle from Client Portal (ownership-verified)
app.post(
  '/api/member/cycles/:id/action',
  requireMemberOrAdmin,
  asyncHandler(async (req, res) => {
    const session = req.authSession!;
    if (session.role !== 'member') {
      res.status(403).json({ error: 'Client session required.' });
      return;
    }
    const id = Number(req.params.id);
    const action = String((req.body && req.body.action) || '').toLowerCase();
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 500);
    if (!Number.isInteger(id) || id <= 0 || (action !== 'exit' && action !== 'stop')) {
      res.status(400).json({ error: 'Valid cycle ID and action (exit or stop) are required.' });
      return;
    }
    const member = await db.get<{ id: number; name: string; phone: string }>(
      'SELECT id, name, phone FROM members WHERE id = ?',
      [session.user_id]
    );
    const cycle = await db.get<Record<string, any>>('SELECT * FROM member_cycles WHERE id = ?', [id]);
    if (!cycle || !member) {
      res.status(404).json({ error: 'Cycle record not found.' });
      return;
    }
    const normMemberPhone = normalizePhone(member.phone);
    const ownsCycle = Number(cycle.member_id) === Number(member.id) || normalizePhone(cycle.member_phone) === normMemberPhone;
    if (!ownsCycle) {
      res.status(403).json({ error: 'You are not authorized to modify this cycle.' });
      return;
    }

    const currentStatus = String(cycle.status || 'active').toLowerCase();
    if (currentStatus === 'exited' || currentStatus === 'stopped' || currentStatus === 'completed') {
      res.status(400).json({ error: 'This cycle has already been closed.' });
      return;
    }
    if (currentStatus === 'exit_pending') {
      res.status(409).json({ error: 'Your cycle exit request is already awaiting admin approval.' });
      return;
    }

    // Check if other clients share this cycle
    const peerRows = await db.all<{ member_id: number | null; member_phone: string }>(
      `SELECT member_id, member_phone FROM member_cycles
       WHERE LOWER(TRIM(cycle_name)) = LOWER(TRIM(?))
         AND LOWER(COALESCE(status, 'active')) NOT IN ('exited', 'stopped')`,
      [String(cycle.cycle_name || '')]
    );
    const otherPeers = peerRows.filter((p) => {
      const pid = p.member_id !== null && p.member_id !== undefined ? Number(p.member_id) : null;
      const pPhone = normalizePhone(String(p.member_phone || ''));
      return !(pid !== null && pid === Number(member.id)) && pPhone !== normMemberPhone;
    });

    const requiresAdminApproval = action === 'exit' || otherPeers.length > 0;
    if (!requiresAdminApproval) {
      await db.run('UPDATE member_cycles SET status = ? WHERE id = ?', ['stopped', id]);
      res.json({
        success: true,
        status: 'stopped',
        pendingApproval: false,
        message: 'Custom cycle stopped successfully.'
      });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.run('UPDATE member_cycles SET status = ? WHERE id = ?', ['exit_pending', id]);
      const existingPending = await tx.get<{ id: number }>(
        "SELECT id FROM cycle_exit_requests WHERE member_cycle_id = ? AND status = 'pending'",
        [id]
      );
      if (!existingPending) {
        await tx.run(
          `INSERT INTO cycle_exit_requests (member_cycle_id, member_id, member_phone, member_name, cycle_name, cycle_type, action_type, reason, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [
            id,
            member.id,
            member.phone,
            member.name || cycle.member_name || 'Client',
            String(cycle.cycle_name || ''),
            String(cycle.cycle_type || 'public').toLowerCase() === 'custom' ? 'custom' : 'public',
            action,
            reason
          ]
        );
      }
    });

    res.json({
      success: true,
      status: 'exit_pending',
      pendingApproval: true,
      message: 'Cycle exit request submitted. It will take effect once accepted by Admin.'
    });
  })
);

app.post(
  '/api/member/notifications/read-all',
  requireMemberOrAdmin,
  asyncHandler(async (req, res) => {
    const session = req.authSession!;
    if (session.role !== 'member') {
      res.status(403).json({ error: 'Client session required.' });
      return;
    }
    const member = await db.get<{ id: number; phone: string }>('SELECT id, phone FROM members WHERE id = ?', [session.user_id]);
    if (!member) {
      res.status(404).json({ error: 'Client account not found.' });
      return;
    }
    await db.run('UPDATE client_notifications SET is_read = 1 WHERE member_id = ? OR member_phone = ?', [
      member.id,
      member.phone
    ]);
    res.json({ success: true });
  })
);

app.post(
  '/api/member/notifications/:id/read',
  requireMemberOrAdmin,
  asyncHandler(async (req, res) => {
    const session = req.authSession!;
    if (session.role !== 'member') {
      res.status(403).json({ error: 'Client session required.' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid notification ID.' });
      return;
    }
    const member = await db.get<{ id: number; phone: string }>('SELECT id, phone FROM members WHERE id = ?', [session.user_id]);
    const notif = await db.get<{ id: number; member_id: number | null; member_phone: string }>(
      'SELECT id, member_id, member_phone FROM client_notifications WHERE id = ?',
      [id]
    );
    if (!notif || !member) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    const ownsNotif =
      Number(notif.member_id) === Number(member.id) || normalizePhone(notif.member_phone) === normalizePhone(member.phone);
    if (!ownsNotif) {
      res.status(403).json({ error: 'You are not authorized to modify this notification.' });
      return;
    }
    await db.run('UPDATE client_notifications SET is_read = 1 WHERE id = ?', [id]);
    res.json({ success: true });
  })
);

app.post(
  '/api/logout',
  asyncHandler(async (req, res) => {
    const session = await getSessionFromHeader(req);
    if (session) {
      if (session.token.startsWith('sb_adm_') || session.token.startsWith('sb_mem_')) {
        const jwt = session.token.slice(7).trim();
        const cacheKey = crypto.createHash('sha256').update(jwt).digest('hex');
        sbTokenCache.delete(cacheKey);
      } else {
        await db.run('DELETE FROM auth_sessions WHERE token = ?', [session.token]);
      }
    }
    res.json({ success: true });
  })
);

// ============================================================
// ADMIN AUTH & MANAGEMENT API
// ============================================================

app.post(
  '/api/admin/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const admin = await db.get<Record<string, any>>(
      'SELECT * FROM admin_users WHERE lower(email) = lower(?)',
      [cleanEmail]
    );

    if (admin && verifyPassword(String(password), admin.password_hash)) {
      const token = await createSession('admin', Number(admin.id), admin.email);
      res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
      return;
    }

    // Fallback / Primary verification against Supabase Auth Users
    const sbAuth = await verifySupabaseAuthPassword(cleanEmail, String(password));
    if (sbAuth) {
      const authorizedAdmin = await ensureAdminRowForEmail(
        sbAuth.user.email,
        sbAuth.user.name,
        sbAuth.user.isMetadataAdmin
      );
      if (!authorizedAdmin) {
        res.status(403).json({
          error: `This Supabase Auth account (${sbAuth.user.email}) is not authorized as a SHIMOGY administrator.`
        });
        return;
      }
      res.json({
        token: `sb_adm_${sbAuth.access_token}`,
        refresh_token: sbAuth.refresh_token,
        supabaseAuth: true,
        admin: { id: authorizedAdmin.id, email: authorizedAdmin.email, name: authorizedAdmin.name }
      });
      return;
    }

    res.status(401).json({ error: 'Invalid admin email or password.' });
  })
);

app.post(
  '/api/admin/google-login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { idToken } = req.body || {};
    if (!idToken) {
      res.status(400).json({ error: 'Google verification token is required.' });
      return;
    }
    const gUser = await verifyFirebaseGoogleIdToken(String(idToken));
    if (!gUser) {
      res.status(401).json({ error: 'Unable to verify your Google account. Please sign in again.' });
      return;
    }
    const bootstrappedEmails = new Set([
      'mal77ham@gmail.com',
      'maleham06@gmail.com',
      String(process.env.ADMIN_EMAIL || 'admin@shimogy.com').trim().toLowerCase()
    ]);
    let admin = await db.get<Record<string, any>>(
      'SELECT * FROM admin_users WHERE lower(email) = lower(?)',
      [gUser.email]
    );
    if (!admin && bootstrappedEmails.has(gUser.email)) {
      const randomPass = crypto.randomBytes(24).toString('hex');
      const info = await db.run(
        'INSERT INTO admin_users (email, name, password_hash) VALUES (?, ?, ?)',
        [gUser.email, gUser.name || 'SHIMOGY Administrator', hashPassword(randomPass)]
      );
      admin = await db.get<Record<string, any>>('SELECT * FROM admin_users WHERE id = ?', [info.lastInsertRowid]);
    }
    if (!admin) {
      res.status(403).json({
        error: `This Google account (${gUser.email}) is not authorized as a SHIMOGY administrator.`
      });
      return;
    }
    const token = await createSession('admin', Number(admin.id), admin.email);
    res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
  })
);

app.get(
  '/api/admin/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const admin = await db.get('SELECT id, email, name FROM admin_users WHERE id = ?', [req.authSession!.user_id]);
    res.json({ admin });
  })
);

app.get(
  '/api/admin/admins',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const admins = await db.all('SELECT id, email, name, created_at FROM admin_users ORDER BY id ASC');
    res.json({ admins });
  })
);

app.post(
  '/api/admin/admins',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const cleanEmail = String((req.body && req.body.email) || '').trim().toLowerCase();
    const cleanName = String((req.body && req.body.name) || 'SHIMOGY Administrator').trim().slice(0, 120);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid administrator email address.' });
      return;
    }
    const existing = await db.get<{ id: number }>('SELECT id FROM admin_users WHERE lower(email) = lower(?)', [
      cleanEmail
    ]);
    if (existing) {
      res.status(409).json({ error: 'This email is already authorized as a SHIMOGY administrator.' });
      return;
    }
    const randomPass = crypto.randomBytes(24).toString('hex');
    const info = await db.run('INSERT INTO admin_users (email, name, password_hash) VALUES (?, ?, ?)', [
      cleanEmail,
      cleanName || 'SHIMOGY Administrator',
      hashPassword(randomPass)
    ]);
    res.status(201).json({ id: info.lastInsertRowid, email: cleanEmail, name: cleanName });
  })
);

app.delete(
  '/api/admin/admins/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (id === Number(req.authSession!.user_id)) {
      res.status(400).json({ error: 'You cannot remove the currently signed-in administrator account.' });
      return;
    }
    await db.run('DELETE FROM admin_users WHERE id = ?', [id]);
    res.json({ success: true });
  })
);

app.post(
  '/api/admin/change-password',
  passwordLimiter,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { newPassword, newEmail } = req.body || {};
    const cleanEmail = String(newEmail || '').trim().toLowerCase();
    const cleanPass = String(newPassword || '');

    if (!cleanEmail && !cleanPass) {
      res.status(400).json({ error: 'Enter a new email or password to update.' });
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid administrator email address.' });
      return;
    }
    if (cleanPass && cleanPass.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const adminId = Number(req.authSession!.user_id);
    const currentAdmin = await db.get<{ id: number; email: string }>(
      'SELECT id, email FROM admin_users WHERE id = ?',
      [adminId]
    );
    if (!currentAdmin) {
      res.status(404).json({ error: 'Administrator account not found.' });
      return;
    }

    let finalEmail = String(currentAdmin.email || '').trim().toLowerCase();
    if (cleanEmail && cleanEmail !== finalEmail) {
      const conflict = await db.get<{ id: number }>(
        'SELECT id FROM admin_users WHERE lower(email) = lower(?) AND id <> ?',
        [cleanEmail, adminId]
      );
      if (conflict) {
        res.status(409).json({
          error:
            'That email belongs to another administrator account. Leave Admin Email unchanged to update only your password, or enter a different email.'
        });
        return;
      }
    }

    if (req.authSession!.token.startsWith('sb_adm_')) {
      const sbUpd = await updateSupabaseAuthUser(req.authSession!.token.slice(7), {
        email: cleanEmail && cleanEmail !== finalEmail ? cleanEmail : undefined,
        password: cleanPass || undefined
      });
      if (!sbUpd.ok) {
        res.status(400).json({ error: sbUpd.error || 'Could not update Supabase Auth credentials.' });
        return;
      }
    }

    await db.transaction(async (tx) => {
      if (cleanEmail && cleanEmail !== finalEmail) {
        await tx.run('UPDATE admin_users SET email = ? WHERE id = ?', [cleanEmail, adminId]);
        if (!req.authSession!.token.startsWith('sb_adm_')) {
          await tx.run('UPDATE auth_sessions SET identifier = ? WHERE token = ?', [cleanEmail, req.authSession!.token]);
        }
        finalEmail = cleanEmail;
      }

      if (cleanPass) {
        await tx.run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [
          hashPassword(cleanPass),
          adminId
        ]);
      }
    });

    res.json({ success: true, email: finalEmail });
  })
);

app.get(
  '/api/admin/export-supabase',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const sqlDump = await db.generateSupabaseExportSql(true);
    if (String(req.query.format || '') === 'json') {
      res.json({ mode: db.mode, supabaseUrl: SUPABASE_URL, sql: sqlDump });
      return;
    }
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="shimogy_supabase_export.sql"');
    res.send(sqlDump);
  })
);

app.get(
  '/api/admin/overview',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [
      settingsRows,
      rawMembers,
      rawInvestments,
      rawSavings,
      rawLoans,
      memberCycles,
      plans,
      publicCycles,
      updates,
      heroSlides,
      testimonials,
      requests,
      deletionRequests,
      cycleExitRequests
    ] = await Promise.all([
      db.all<{ key: string; value: string }>('SELECT key, value FROM site_settings'),
      db.all('SELECT * FROM members ORDER BY id DESC'),
      db.all('SELECT * FROM investments ORDER BY id DESC'),
      db.all('SELECT * FROM savings ORDER BY id DESC'),
      db.all('SELECT * FROM loans ORDER BY id DESC'),
      db.all('SELECT * FROM member_cycles ORDER BY id DESC'),
      db.all('SELECT * FROM investment_plans ORDER BY price ASC, id ASC'),
      db.all('SELECT * FROM public_cycles ORDER BY id ASC'),
      db.all('SELECT * FROM updates ORDER BY published_date DESC, id DESC'),
      db.all('SELECT * FROM hero_slides ORDER BY sort_order ASC, id ASC'),
      db.all('SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC'),
      db.all('SELECT * FROM service_requests ORDER BY id DESC'),
      db.all('SELECT * FROM deletion_requests ORDER BY id DESC'),
      db.all('SELECT * FROM cycle_exit_requests ORDER BY id DESC')
    ]);

    const settings: Record<string, string> = {};
    for (const row of settingsRows) settings[row.key] = row.value;

    const members = rawMembers.map(sanitizeMember);
    const investments = rawInvestments.map((inv) => ({
      ...inv,
      returns_date: inv.returns_date || computeReturnsDate(String(inv.created_at || todayISO()), String(inv.duration || '60 Days'))
    }));
    const savings = rawSavings.map((sv) => ({
      ...sv,
      status: normalizeSavingsStatus(String(sv.account_type || ''), String(sv.status || ''))
    }));
    const loans = rawLoans.map((ln) => ({
      ...ln,
      return_date: ln.return_date || computeLoanReturnDate(String(ln.request_date || todayISO()), String(ln.duration || '30 days'))
    }));

    res.json({
      databaseMode: db.mode,
      supabaseUrl: SUPABASE_URL,
      settings,
      members,
      investments,
      savings,
      loans,
      memberCycles,
      plans,
      publicCycles,
      updates,
      heroSlides,
      testimonials,
      requests,
      deletionRequests,
      cycleExitRequests
    });
  })
);

app.put(
  '/api/admin/settings',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updates = (req.body || {}) as Record<string, unknown>;
    const urlKeys = new Set(['logo_url', 'social_facebook', 'social_tiktok', 'social_youtube', 'social_instagram']);
    await db.transaction(async (tx) => {
      for (const [k, v] of Object.entries(updates)) {
        const cleanVal = urlKeys.has(k) ? sanitizeUrl(String(v ?? ''), '') : String(v ?? '');
        await tx.run(
          'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [String(k), cleanVal]
        );
      }
    });
    res.json({ success: true });
  })
);

app.get(
  '/api/media/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).send('Invalid media ID');
      return;
    }
    const row = await db.get<{ filename: string; mime_type: string; data: Buffer | Uint8Array | string }>(
      'SELECT filename, mime_type, data FROM media_files WHERE id = ?',
      [id]
    );
    if (!row || !row.data) {
      res.status(404).send('Media not found');
      return;
    }
    let bodyBuf: Buffer;
    if (Buffer.isBuffer(row.data)) {
      bodyBuf = row.data;
    } else if (typeof row.data === 'string' && row.data.startsWith('\\x')) {
      bodyBuf = Buffer.from(row.data.slice(2), 'hex');
    } else if (typeof row.data === 'string') {
      bodyBuf = Buffer.from(row.data, 'base64');
    } else {
      bodyBuf = Buffer.from(row.data);
    }
    res.setHeader('Content-Type', row.mime_type || 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(bodyBuf);
  })
);

app.post(
  '/api/admin/upload',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { filename, dataUrl } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Valid image file is required.' });
      return;
    }
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i);
    if (!match) {
      res.status(400).json({ error: 'Unsupported image format. Use PNG, JPG, WEBP, or GIF.' });
      return;
    }
    const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    const safeName = String(filename || 'image')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 60);
    const buf = Buffer.from(match[2], 'base64');
    const info = await db.run('INSERT INTO media_files (filename, mime_type, data) VALUES (?, ?, ?)', [
      safeName,
      mimeType,
      buf
    ]);
    res.json({ id: info.lastInsertRowid, url: `/api/media/${info.lastInsertRowid}` });
  })
);

// Hero Slides CRUD
app.post(
  '/api/admin/hero-slides',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active } = req.body || {};
    if (!title || !subtitle || !image_url) {
      res.status(400).json({ error: 'Title, subtitle, and image URL are required.' });
      return;
    }
    const info = await db.run(
      `INSERT INTO hero_slides (badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(badge_text || ''),
        String(title).trim(),
        String(subtitle).trim(),
        String(cta_text || 'Explore Plans').trim(),
        sanitizeUrl(String(cta_link || 'investments.html'), 'investments.html'),
        sanitizeUrl(String(image_url), '/assets/aistudio/partnership_65dac3a6.jpg'),
        String(image_alt || title).trim(),
        Number(sort_order || 0),
        is_active === false || is_active === 0 ? 0 : 1
      ]
    );
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/admin/hero-slides/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active } = req.body || {};
    await db.run(
      `UPDATE hero_slides SET badge_text=?, title=?, subtitle=?, cta_text=?, cta_link=?, image_url=?, image_alt=?, sort_order=?, is_active=?
       WHERE id=?`,
      [
        String(badge_text || ''),
        String(title || '').trim(),
        String(subtitle || '').trim(),
        String(cta_text || 'Explore Plans').trim(),
        sanitizeUrl(String(cta_link || 'investments.html'), 'investments.html'),
        sanitizeUrl(String(image_url || ''), '/assets/aistudio/partnership_65dac3a6.jpg'),
        String(image_alt || title || '').trim(),
        Number(sort_order || 0),
        is_active === false || is_active === 0 ? 0 : 1,
        id
      ]
    );
    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/hero-slides/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.run('DELETE FROM hero_slides WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  })
);

// Testimonials CRUD
app.post(
  '/api/admin/testimonials',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active } = req.body || {};
    if (!client_name || !quote) {
      res.status(400).json({ error: 'Client name and quote are required.' });
      return;
    }
    const info = await db.run(
      `INSERT INTO testimonials (client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(client_name).trim(),
        String(role || 'Verified Client').trim(),
        String(location || 'Kampala, Uganda').trim(),
        String(quote).trim(),
        sanitizeUrl(String(photo_url || '/assets/aistudio/josephine_a1a0850e.jpg'), '/assets/aistudio/josephine_a1a0850e.jpg'),
        String(photo_alt || `Portrait of SHIMOGY client ${client_name}`).trim(),
        Number(sort_order || 0),
        is_active === false || is_active === 0 ? 0 : 1
      ]
    );
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/admin/testimonials/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active } = req.body || {};
    await db.run(
      `UPDATE testimonials SET client_name=?, role=?, location=?, quote=?, photo_url=?, photo_alt=?, sort_order=?, is_active=?
       WHERE id=?`,
      [
        String(client_name || '').trim(),
        String(role || 'Verified Client').trim(),
        String(location || 'Kampala, Uganda').trim(),
        String(quote || '').trim(),
        sanitizeUrl(String(photo_url || '/assets/aistudio/josephine_a1a0850e.jpg'), '/assets/aistudio/josephine_a1a0850e.jpg'),
        String(photo_alt || `Portrait of SHIMOGY client ${client_name}`).trim(),
        Number(sort_order || 0),
        is_active === false || is_active === 0 ? 0 : 1,
        id
      ]
    );
    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/testimonials/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.run('DELETE FROM testimonials WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  })
);

// Clients CRUD & Search
app.get(
  '/api/admin/member/:phone',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const normalized = normalizePhone(req.params.phone);
    const member = await db.get<{ id: number }>('SELECT id FROM members WHERE phone = ? OR phone = ?', [
      normalized,
      req.params.phone
    ]);
    if (!member) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    const profile = await getFullMemberProfile(Number(member.id));
    res.json({ member: profile });
  })
);

app.post(
  '/api/admin/members',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const phone = normalizePhone(b.phone || '');
    const password = String(b.password || '').trim();

    if (!name || !phone || !password) {
      res.status(400).json({ error: 'Name, phone, and password are required.' });
      return;
    }

    const existing = await db.get('SELECT id FROM members WHERE phone = ?', [phone]);
    if (existing) {
      res.status(409).json({ error: 'A client with that phone number already exists.' });
      return;
    }

    const balNum = toNonNegativeNumber(b.balance, 0);
    const invNum = toNonNegativeNumber(b.total_invested, 0);
    if (balNum === null || invNum === null) {
      res.status(400).json({ error: 'Account balances must be valid non-negative numbers.' });
      return;
    }

    const memberId = await db.transaction(async (tx) => {
      const info = await tx.run(
        `INSERT INTO members (name, phone, email, group_name, balance, total_invested, status, password_hash, age_verified, guardian_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          phone,
          String(b.email || '').trim(),
          String(b.group_name || '').trim(),
          balNum,
          invNum,
          String(b.status || 'active'),
          hashPassword(password),
          b.age_verified === false ? 0 : 1,
          String(b.guardian_name || '').trim()
        ]
      );
      const mid = info.lastInsertRowid;

      if (b.investment && b.investment.plan_name && Number(b.investment.amount) > 0) {
        const dur = String(b.investment.duration || '60 Days').trim();
        const returnsDate = computeReturnsDate(todayISO(), dur, b.investment.returns_date);
        const invAmount = Math.max(0, Math.round(Number(b.investment.amount || 0)));
        const invReturn = Math.max(0, Math.round(Number(b.investment.expected_return || invAmount)));
        await tx.run(
          `INSERT INTO investments (member_id, member_phone, member_name, plan_name, amount, expected_return, duration, returns_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          [
            mid,
            phone,
            name,
            String(b.investment.plan_name).trim(),
            invAmount,
            invReturn,
            dur,
            returnsDate
          ]
        );
      }

      if (b.savings && b.savings.account_type) {
        const savType = String(b.savings.account_type).trim();
        const savBal = Math.max(0, Math.round(Number(b.savings.balance || 0)));
        await tx.run(
          `INSERT INTO savings (member_id, member_phone, member_name, account_type, balance, open_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [mid, phone, name, savType, savBal, todayISO(), normalizeSavingsStatus(savType, b.savings.status)]
        );
      }

      if (b.loan && Number(b.loan.amount) > 0) {
        const lDur = String(b.loan.duration || '30 days').trim();
        const returnDate = computeLoanReturnDate(todayISO(), lDur, b.loan.return_date);
        const loanAmt = Math.max(0, Math.round(Number(b.loan.amount || 0)));
        await tx.run(
          `INSERT INTO loans (member_id, member_phone, member_name, amount, purpose, duration, interest_rate, status, request_date, return_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mid,
            phone,
            name,
            loanAmt,
            String(b.loan.purpose || 'Client Loan').trim(),
            lDur,
            String(b.loan.interest_rate || '10%').trim(),
            String(b.loan.status || 'active').trim(),
            todayISO(),
            returnDate
          ]
        );
      }

      if (b.cycle && b.cycle.cycle_name) {
        const totalMems = Math.max(2, Math.round(Number(b.cycle.number_of_members || 10)));
        const cNum = Math.min(totalMems, Math.max(1, Math.round(Number(b.cycle.cycle_number || 1))));
        const contrib = Math.max(0, Math.round(Number(b.cycle.contribution || 0)));
        const cType = String(b.cycle.cycle_type || 'public').toLowerCase() === 'custom' ? 'custom' : 'public';
        await tx.run(
          `INSERT INTO member_cycles (member_id, member_phone, member_name, cycle_name, contribution, payout_duration, number_of_members, cycle_number, cycle_type, join_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          [
            mid,
            phone,
            name,
            String(b.cycle.cycle_name).trim(),
            contrib,
            String(b.cycle.payout_duration || 'Monthly').trim(),
            totalMems,
            cNum,
            cType,
            todayISO()
          ]
        );
      }

      return mid;
    });

    res.status(201).json({ id: memberId });
  })
);

app.put(
  '/api/admin/members/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await db.get<Record<string, any>>('SELECT * FROM members WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const newPhone = normalizePhone(b.phone || existing.phone);
    if (newPhone !== existing.phone) {
      const phoneConflict = await db.get('SELECT id FROM members WHERE phone = ? AND id <> ?', [newPhone, id]);
      if (phoneConflict) {
        res.status(409).json({ error: 'Another client account already uses that phone number.' });
        return;
      }
    }
    const newName = String(b.name || existing.name).trim();
    const balNum = toNonNegativeNumber(b.balance ?? existing.balance, Number(existing.balance || 0));
    const invNum = toNonNegativeNumber(b.total_invested ?? existing.total_invested, Number(existing.total_invested || 0));
    if (balNum === null || invNum === null) {
      res.status(400).json({ error: 'Balances must be valid non-negative numbers.' });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE members SET name=?, phone=?, email=?, group_name=?, balance=?, total_invested=?, status=?
         WHERE id=?`,
        [
          newName,
          newPhone,
          String(b.email ?? existing.email).trim(),
          String(b.group_name ?? existing.group_name).trim(),
          balNum,
          invNum,
          String(b.status ?? existing.status),
          id
        ]
      );

      if (b.password && String(b.password).trim().length > 0) {
        await tx.run('UPDATE members SET password_hash = ? WHERE id = ?', [hashPassword(String(b.password).trim()), id]);
      }

      await tx.run('UPDATE investments SET member_phone = ?, member_name = ? WHERE member_id = ?', [newPhone, newName, id]);
      await tx.run('UPDATE savings SET member_phone = ?, member_name = ? WHERE member_id = ?', [newPhone, newName, id]);
      await tx.run('UPDATE loans SET member_phone = ?, member_name = ? WHERE member_id = ?', [newPhone, newName, id]);
      await tx.run('UPDATE member_cycles SET member_phone = ?, member_name = ? WHERE member_id = ?', [newPhone, newName, id]);
    });

    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/members/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const member = await db.get<{ phone: string }>('SELECT phone FROM members WHERE id = ?', [id]);
    if (!member) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM investments WHERE member_id = ? OR member_phone = ?', [id, member.phone]);
      await tx.run('DELETE FROM savings WHERE member_id = ? OR member_phone = ?', [id, member.phone]);
      await tx.run('DELETE FROM loans WHERE member_id = ? OR member_phone = ?', [id, member.phone]);
      await tx.run('DELETE FROM member_cycles WHERE member_id = ? OR member_phone = ?', [id, member.phone]);
      await tx.run('DELETE FROM cycle_exit_requests WHERE member_id = ? OR member_phone = ?', [id, member.phone]);
      await tx.run('DELETE FROM client_notifications WHERE member_id = ? OR member_phone = ?', [id, member.phone]);
      await tx.run("DELETE FROM auth_sessions WHERE role = 'member' AND user_id = ?", [id]);
      await tx.run('DELETE FROM members WHERE id = ?', [id]);
    });
    res.json({ success: true });
  })
);

async function resolveMember(phoneInput: string, fallbackName: string) {
  const phone = normalizePhone(phoneInput);
  const m = await db.get<{ id: number; name: string; phone: string }>('SELECT id, name, phone FROM members WHERE phone = ?', [
    phone
  ]);
  return {
    memberId: m ? Number(m.id) : null,
    memberPhone: m ? m.phone : phone,
    memberName: String(fallbackName || (m ? m.name : '')).trim() || 'Client'
  };
}

// Investments CRUD
app.post(
  '/api/admin/investments',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.member_phone || !b.plan_name || !b.amount) {
      res.status(400).json({ error: 'Client phone, plan name, and amount are required.' });
      return;
    }
    const amt = toNonNegativeNumber(b.amount);
    const expRet = toNonNegativeNumber(b.expected_return ?? b.amount);
    if (amt === null || expRet === null) {
      res.status(400).json({ error: 'Investment amounts must be valid non-negative numbers.' });
      return;
    }
    const m = await resolveMember(b.member_phone, b.member_name);
    const dur = String(b.duration || '60 Days').trim();
    const returnsDate = computeReturnsDate(todayISO(), dur, b.returns_date);
    const info = await db.run(
      `INSERT INTO investments (member_id, member_phone, member_name, plan_name, amount, expected_return, duration, returns_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.memberId, m.memberPhone, m.memberName, String(b.plan_name).trim(), amt, expRet, dur, returnsDate, String(b.status || 'active')]
    );
    if (m.memberId) {
      await db.run('UPDATE members SET total_invested = total_invested + ? WHERE id = ?', [amt, m.memberId]);
    }
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/admin/investments/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await db.get<Record<string, any>>('SELECT * FROM investments WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Investment record not found.' });
      return;
    }
    const amt = toNonNegativeNumber(b.amount ?? existing.amount, Number(existing.amount || 0));
    const expRet = toNonNegativeNumber(b.expected_return ?? existing.expected_return, Number(existing.expected_return || 0));
    if (amt === null || expRet === null) {
      res.status(400).json({ error: 'Amounts must be valid non-negative numbers.' });
      return;
    }
    const dur = String(b.duration ?? existing.duration).trim() || '60 Days';
    const returnsDate = computeReturnsDate(
      String(existing.created_at || todayISO()),
      dur,
      b.returns_date ?? existing.returns_date
    );
    await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE investments SET plan_name=?, amount=?, expected_return=?, duration=?, returns_date=?, status=? WHERE id=?`,
        [
          String(b.plan_name ?? existing.plan_name).trim(),
          amt,
          expRet,
          dur,
          returnsDate,
          String(b.status ?? existing.status),
          id
        ]
      );
      const delta = amt - Number(existing.amount || 0);
      if (delta !== 0 && existing.member_id) {
        await tx.run(
          'UPDATE members SET total_invested = CASE WHEN total_invested + ? < 0 THEN 0 ELSE total_invested + ? END WHERE id = ?',
          [delta, delta, existing.member_id]
        );
      }
    });
    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/investments/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.run('DELETE FROM investments WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  })
);

// Savings CRUD
app.post(
  '/api/admin/savings',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.member_phone || !b.account_type) {
      res.status(400).json({ error: 'Client phone and account type are required.' });
      return;
    }
    const bal = toNonNegativeNumber(b.balance, 0);
    if (bal === null) {
      res.status(400).json({ error: 'Savings balance must be a valid non-negative number.' });
      return;
    }
    const m = await resolveMember(b.member_phone, b.member_name);
    const acctType = String(b.account_type).trim();
    const status = normalizeSavingsStatus(acctType, b.status);
    const info = await db.run(
      `INSERT INTO savings (member_id, member_phone, member_name, account_type, balance, open_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [m.memberId, m.memberPhone, m.memberName, acctType, bal, todayISO(), status]
    );
    if (m.memberId && bal > 0) {
      await db.run('UPDATE members SET balance = balance + ? WHERE id = ?', [bal, m.memberId]);
    }
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/admin/savings/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await db.get<Record<string, any>>('SELECT * FROM savings WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Savings record not found.' });
      return;
    }
    const bal = toNonNegativeNumber(b.balance ?? existing.balance, Number(existing.balance || 0));
    if (bal === null) {
      res.status(400).json({ error: 'Balance must be a valid non-negative number.' });
      return;
    }
    const acctType = String(b.account_type ?? existing.account_type).trim();
    const status = normalizeSavingsStatus(acctType, b.status ?? existing.status);
    await db.run('UPDATE savings SET account_type=?, balance=?, status=? WHERE id=?', [acctType, bal, status, id]);
    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/savings/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.run('DELETE FROM savings WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  })
);

// Loans CRUD
app.post(
  '/api/admin/loans',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.member_phone || !b.amount) {
      res.status(400).json({ error: 'Client phone and loan amount are required.' });
      return;
    }
    const amt = toNonNegativeNumber(b.amount);
    if (amt === null) {
      res.status(400).json({ error: 'Loan amount must be a valid non-negative number.' });
      return;
    }
    const m = await resolveMember(b.member_phone, b.member_name);
    const dur = String(b.duration || '30 days').trim();
    const reqDate = String(b.request_date || todayISO());
    const returnDate = computeLoanReturnDate(reqDate, dur, b.return_date);
    const info = await db.run(
      `INSERT INTO loans (member_id, member_phone, member_name, amount, purpose, duration, interest_rate, status, request_date, return_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.memberId,
        m.memberPhone,
        m.memberName,
        amt,
        String(b.purpose || '').trim(),
        dur,
        String(b.interest_rate || '10%').trim(),
        String(b.status || 'active'),
        reqDate,
        returnDate
      ]
    );
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/admin/loans/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await db.get<Record<string, any>>('SELECT * FROM loans WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Loan record not found.' });
      return;
    }
    const amt = toNonNegativeNumber(b.amount ?? existing.amount, Number(existing.amount || 0));
    if (amt === null) {
      res.status(400).json({ error: 'Loan amount must be a valid non-negative number.' });
      return;
    }
    const dur = String(b.duration ?? existing.duration).trim() || '30 days';
    const reqDate = String(b.request_date ?? existing.request_date ?? todayISO());
    const returnDate = computeLoanReturnDate(reqDate, dur, b.return_date ?? existing.return_date);
    await db.run(
      `UPDATE loans SET amount=?, purpose=?, duration=?, interest_rate=?, return_date=?, status=? WHERE id=?`,
      [
        amt,
        String(b.purpose ?? existing.purpose).trim(),
        dur,
        String(b.interest_rate ?? existing.interest_rate).trim(),
        returnDate,
        String(b.status ?? existing.status),
        id
      ]
    );
    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/loans/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.run('DELETE FROM loans WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  })
);

// Client Cycles CRUD
app.post(
  '/api/admin/member-cycles',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.cycle_name) {
      res.status(400).json({ error: 'Cycle name is required.' });
      return;
    }
    const contrib = toNonNegativeNumber(b.contribution, 0);
    if (contrib === null) {
      res.status(400).json({ error: 'Contribution must be a valid non-negative number.' });
      return;
    }
    const m = await resolveMember(b.member_phone || '', b.member_name || '');
    const totalClients = Math.max(2, Number(b.number_of_members || 10));
    const cycleNum = Math.min(totalClients, Math.max(1, Number(b.cycle_number || 1)));
    const cycleType = String(b.cycle_type || 'public').toLowerCase() === 'custom' ? 'custom' : 'public';
    const info = await db.run(
      `INSERT INTO member_cycles (member_id, member_phone, member_name, cycle_name, contribution, payout_duration, number_of_members, cycle_number, cycle_type, join_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.memberId,
        m.memberPhone,
        m.memberName,
        String(b.cycle_name).trim(),
        contrib,
        String(b.payout_duration || 'Monthly').trim(),
        totalClients,
        cycleNum,
        cycleType,
        String(b.join_date || todayISO()),
        String(b.status || 'active')
      ]
    );
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

async function notifyCyclePeersOnExit(
  tx: Pick<DatabaseManager, 'all' | 'get' | 'run'>,
  exitingCycle: {
    cycle_name: string;
    member_id?: number | null;
    member_phone: string;
    member_name?: string;
  },
  fallbackExiterName?: string
) {
  const cycleName = String(exitingCycle.cycle_name || '').trim();
  if (!cycleName) return;

  const exiterMemberId =
    exitingCycle.member_id !== null && exitingCycle.member_id !== undefined ? Number(exitingCycle.member_id) : null;
  const exiterPhone = normalizePhone(String(exitingCycle.member_phone || ''));

  let exiterName = String(fallbackExiterName || exitingCycle.member_name || '').trim();
  if (exiterMemberId) {
    const mRow = await tx.get<{ name: string }>('SELECT name FROM members WHERE id = ?', [exiterMemberId]);
    if (mRow && mRow.name) exiterName = String(mRow.name).trim();
  }
  if (!exiterName) exiterName = 'A client';

  const peers = await tx.all<Record<string, any>>(
    `SELECT member_id, member_phone, member_name
     FROM member_cycles
     WHERE LOWER(TRIM(cycle_name)) = LOWER(TRIM(?))
       AND LOWER(COALESCE(status, 'active')) NOT IN ('exited', 'stopped')`,
    [cycleName]
  );

  const seenRecipients = new Set<string>();
  for (const p of peers) {
    const pId = p.member_id !== null && p.member_id !== undefined ? Number(p.member_id) : null;
    const pPhone = normalizePhone(String(p.member_phone || ''));
    const isSelf = (pId !== null && exiterMemberId !== null && pId === exiterMemberId) || (pPhone !== '' && pPhone === exiterPhone);
    if (isSelf) continue;

    const dedupKey = pId !== null ? `id:${pId}` : `ph:${pPhone}`;
    if (seenRecipients.has(dedupKey)) continue;
    seenRecipients.add(dedupKey);

    await tx.run(
      `INSERT INTO client_notifications (member_id, member_phone, notif_type, cycle_name, title, message, is_read)
       VALUES (?, ?, 'cycle_exit', ?, ?, ?, 0)`,
      [
        pId,
        pPhone || String(p.member_phone || ''),
        cycleName,
        'Client Left Your Cycle',
        `${exiterName} has left your cycle (${cycleName}).`
      ]
    );
  }
}

app.put(
  '/api/admin/member-cycles/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await db.get<Record<string, any>>('SELECT * FROM member_cycles WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Cycle record not found.' });
      return;
    }
    const contrib = toNonNegativeNumber(b.contribution ?? existing.contribution, Number(existing.contribution || 0));
    if (contrib === null) {
      res.status(400).json({ error: 'Contribution must be a valid non-negative number.' });
      return;
    }
    const totalClients = Math.max(2, Number(b.number_of_members ?? existing.number_of_members ?? 10));
    const cycleNum = Math.min(totalClients, Math.max(1, Number(b.cycle_number ?? existing.cycle_number ?? 1)));
    const cycleType = String(b.cycle_type ?? existing.cycle_type ?? 'public').toLowerCase() === 'custom' ? 'custom' : 'public';
    const nextStatus = String(b.status ?? existing.status);
    const prevStatusLower = String(existing.status || 'active').toLowerCase();
    const nextStatusLower = nextStatus.toLowerCase();
    const transitioningToExited =
      prevStatusLower !== 'exited' &&
      prevStatusLower !== 'stopped' &&
      (nextStatusLower === 'exited' || nextStatusLower === 'stopped');

    await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE member_cycles SET cycle_name=?, contribution=?, payout_duration=?, number_of_members=?, cycle_number=?, cycle_type=?, status=? WHERE id=?`,
        [
          String(b.cycle_name ?? existing.cycle_name).trim(),
          contrib,
          String(b.payout_duration ?? existing.payout_duration).trim(),
          totalClients,
          cycleNum,
          cycleType,
          nextStatus,
          id
        ]
      );

      if (transitioningToExited) {
        const processedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
        await tx.run(
          "UPDATE cycle_exit_requests SET status = 'approved', processed_at = ? WHERE member_cycle_id = ? AND status = 'pending'",
          [processedAt, id]
        );
        await notifyCyclePeersOnExit(tx, {
          cycle_name: String(b.cycle_name ?? existing.cycle_name).trim(),
          member_id: existing.member_id,
          member_phone: existing.member_phone,
          member_name: existing.member_name
        });
      }
    });
    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/member-cycles/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM cycle_exit_requests WHERE member_cycle_id = ?', [id]);
      await tx.run('DELETE FROM member_cycles WHERE id = ?', [id]);
    });
    res.json({ success: true });
  })
);

// Investment Plans CRUD (public catalog)
app.post(
  '/api/admin/plans',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.price) {
      res.status(400).json({ error: 'Plan name and investment price are required.' });
      return;
    }
    const price = toNonNegativeNumber(b.price);
    const expRet = toNonNegativeNumber(b.expected_return ?? b.price);
    if (price === null || expRet === null) {
      res.status(400).json({ error: 'Plan prices must be valid non-negative numbers.' });
      return;
    }
    const risk = String(b.risk || 'Low');
    const riskLevel = risk === 'High' ? 3 : risk === 'Medium' ? 2 : 1;
    const info = await db.run(
      `INSERT INTO investment_plans (name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(b.name).trim(),
        price,
        expRet,
        String(b.duration || '30 Days').trim(),
        risk,
        riskLevel,
        String(b.description || '').trim(),
        sanitizeUrl(String(b.image_url || '/assets/aistudio/graph_ddbd7244.jpg'), '/assets/aistudio/graph_ddbd7244.jpg'),
        String(b.image_alt || `${b.name} investment plan`).trim(),
        Math.max(0, Number(b.slots_left ?? 5)),
        String(b.status || 'available'),
        String(b.badge || '').trim()
      ]
    );
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/admin/plans/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await db.get<Record<string, any>>('SELECT * FROM investment_plans WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Plan not found.' });
      return;
    }
    const risk = String(b.risk ?? existing.risk);
    const riskLevel = risk === 'High' ? 3 : risk === 'Medium' ? 2 : 1;
    const priceNum = toNonNegativeNumber(b.price ?? existing.price, Number(existing.price || 0));
    const expRetNum = toNonNegativeNumber(b.expected_return ?? existing.expected_return, Number(existing.expected_return || 0));
    const slotsNum = toNonNegativeNumber(b.slots_left ?? existing.slots_left, Number(existing.slots_left || 0));
    if (priceNum === null || expRetNum === null || slotsNum === null) {
      res.status(400).json({ error: 'Plan prices and slot counts must be valid non-negative numbers.' });
      return;
    }
    await db.run(
      `UPDATE investment_plans
       SET name=?, price=?, expected_return=?, duration=?, risk=?, risk_level=?, description=?, image_url=?, image_alt=?, slots_left=?, status=?, badge=?
       WHERE id=?`,
      [
        String(b.name ?? existing.name).trim(),
        priceNum,
        expRetNum,
        String(b.duration ?? existing.duration).trim(),
        risk,
        riskLevel,
        String(b.description ?? existing.description).trim(),
        sanitizeUrl(String(b.image_url ?? existing.image_url), '/assets/aistudio/graph_ddbd7244.jpg'),
        String(b.image_alt ?? existing.image_alt).trim(),
        slotsNum,
        String(b.status ?? existing.status),
        String(b.badge ?? existing.badge).trim(),
        id
      ]
    );
    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/plans/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.run('DELETE FROM investment_plans WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  })
);

// Public Cycles CRUD
app.post(
  '/api/admin/public-cycles',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.contribution) {
      res.status(400).json({ error: 'Cycle name and contribution amount are required.' });
      return;
    }
    const contribNum = toNonNegativeNumber(b.contribution);
    if (contribNum === null) {
      res.status(400).json({ error: 'Cycle contribution must be a valid non-negative number.' });
      return;
    }
    const info = await db.run(
      `INSERT INTO public_cycles (name, contribution, payout_duration, description, image_url, image_alt, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Active')`,
      [
        String(b.name).trim(),
        contribNum,
        String(b.payout_duration || 'Monthly').trim(),
        String(b.description || '').trim(),
        sanitizeUrl(String(b.image_url || '/assets/aistudio/partnership_65dac3a6.jpg'), '/assets/aistudio/partnership_65dac3a6.jpg'),
        String(b.image_alt || `${b.name} savings cycle`).trim()
      ]
    );
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/admin/public-cycles/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const existing = await db.get<Record<string, any>>('SELECT * FROM public_cycles WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Public cycle not found.' });
      return;
    }
    const contribNum = toNonNegativeNumber(b.contribution ?? existing.contribution, Number(existing.contribution || 0));
    if (contribNum === null) {
      res.status(400).json({ error: 'Cycle contribution must be a valid non-negative number.' });
      return;
    }
    await db.run(
      `UPDATE public_cycles SET name=?, contribution=?, payout_duration=?, description=?, image_url=?, image_alt=?, status='Active'
       WHERE id=?`,
      [
        String(b.name ?? existing.name).trim(),
        contribNum,
        String(b.payout_duration ?? existing.payout_duration).trim(),
        String(b.description ?? existing.description).trim(),
        sanitizeUrl(String(b.image_url ?? existing.image_url), '/assets/aistudio/partnership_65dac3a6.jpg'),
        String(b.image_alt ?? existing.image_alt).trim(),
        id
      ]
    );
    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/public-cycles/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.run('DELETE FROM public_cycles WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  })
);

// Updates CRUD
app.post(
  '/api/admin/updates',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.title || !b.excerpt || !b.detail) {
      res.status(400).json({ error: 'Title, excerpt, and full detail are required.' });
      return;
    }
    const info = await db.run(
      `INSERT INTO updates (title, category, excerpt, detail, image_url, image_alt, published_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`,
      [
        String(b.title).trim(),
        String(b.category || 'news'),
        String(b.excerpt).trim(),
        String(b.detail).trim(),
        sanitizeUrl(String(b.image_url || '/assets/aistudio/graph_ddbd7244.jpg'), '/assets/aistudio/graph_ddbd7244.jpg'),
        String(b.image_alt || b.title).trim(),
        String(b.published_date || todayISO())
      ]
    );
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.delete(
  '/api/admin/updates/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.run('DELETE FROM updates WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  })
);

// Service Requests
app.put(
  '/api/admin/requests/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    await db.run('UPDATE service_requests SET status = ? WHERE id = ?', [String(status || 'reviewed'), Number(req.params.id)]);
    res.json({ success: true });
  })
);

app.delete(
  '/api/admin/requests/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.run('DELETE FROM service_requests WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  })
);

// Data Deletion Request Processing
app.post(
  '/api/admin/deletion-requests/:id/process',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { action } = req.body || {};
    const reqRow = await db.get<Record<string, any>>('SELECT * FROM deletion_requests WHERE id = ?', [id]);
    if (!reqRow) {
      res.status(404).json({ error: 'Deletion request not found.' });
      return;
    }

    await db.transaction(async (tx) => {
      const processedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      if (action === 'purge') {
        const phone = normalizePhone(reqRow.phone);
        const member = await tx.get<{ id: number; phone: string }>('SELECT id, phone FROM members WHERE phone = ?', [phone]);
        if (member) {
          await tx.run('DELETE FROM investments WHERE member_id = ? OR member_phone = ?', [member.id, member.phone]);
          await tx.run('DELETE FROM savings WHERE member_id = ? OR member_phone = ?', [member.id, member.phone]);
          await tx.run('DELETE FROM loans WHERE member_id = ? OR member_phone = ?', [member.id, member.phone]);
          await tx.run('DELETE FROM member_cycles WHERE member_id = ? OR member_phone = ?', [member.id, member.phone]);
          await tx.run('DELETE FROM cycle_exit_requests WHERE member_id = ? OR member_phone = ?', [member.id, member.phone]);
          await tx.run('DELETE FROM client_notifications WHERE member_id = ? OR member_phone = ?', [member.id, member.phone]);
          await tx.run("DELETE FROM auth_sessions WHERE role = 'member' AND user_id = ?", [member.id]);
          await tx.run('DELETE FROM members WHERE id = ?', [member.id]);
        }
        await tx.run('DELETE FROM service_requests WHERE applicant_phone = ?', [phone]);
        await tx.run("UPDATE deletion_requests SET status = 'completed', processed_at = ? WHERE id = ?", [processedAt, id]);
      } else if (action === 'reject') {
        await tx.run("UPDATE deletion_requests SET status = 'rejected', processed_at = ? WHERE id = ?", [processedAt, id]);
      } else {
        await tx.run("UPDATE deletion_requests SET status = 'completed', processed_at = ? WHERE id = ?", [processedAt, id]);
      }
    });

    res.json({ success: true });
  })
);

// Cycle Exit Approval / Decline Processing
app.post(
  '/api/admin/cycle-exit-requests/:id/process',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const action = String((req.body && req.body.action) || '').toLowerCase();
    if (!Number.isInteger(id) || id <= 0 || (action !== 'approve' && action !== 'decline')) {
      res.status(400).json({ error: 'Valid request ID and action (approve or decline) are required.' });
      return;
    }

    const reqRow = await db.get<Record<string, any>>('SELECT * FROM cycle_exit_requests WHERE id = ?', [id]);
    if (!reqRow) {
      res.status(404).json({ error: 'Cycle exit request not found.' });
      return;
    }
    if (String(reqRow.status || 'pending').toLowerCase() !== 'pending') {
      res.status(409).json({ error: 'This cycle exit request has already been processed.' });
      return;
    }

    const processedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    await db.transaction(async (tx) => {
      if (action === 'approve') {
        const cycleRow = await tx.get<Record<string, any>>('SELECT * FROM member_cycles WHERE id = ?', [
          reqRow.member_cycle_id
        ]);
        const finalCycleStatus = String(reqRow.action_type || 'exit').toLowerCase() === 'stop' ? 'stopped' : 'exited';

        if (cycleRow) {
          await tx.run('UPDATE member_cycles SET status = ? WHERE id = ?', [finalCycleStatus, cycleRow.id]);
        }
        await tx.run("UPDATE cycle_exit_requests SET status = 'approved', processed_at = ? WHERE id = ?", [
          processedAt,
          id
        ]);

        // Notify all other active clients sharing this cycle
        await notifyCyclePeersOnExit(
          tx,
          {
            cycle_name: String((cycleRow && cycleRow.cycle_name) || reqRow.cycle_name),
            member_id: cycleRow ? cycleRow.member_id : reqRow.member_id,
            member_phone: String((cycleRow && cycleRow.member_phone) || reqRow.member_phone),
            member_name: String((cycleRow && cycleRow.member_name) || reqRow.member_name)
          },
          String(reqRow.member_name || 'A client')
        );

        // Notify the requesting client that Admin accepted their exit
        await tx.run(
          `INSERT INTO client_notifications (member_id, member_phone, notif_type, cycle_name, title, message, is_read)
           VALUES (?, ?, 'cycle_exit_approved', ?, ?, ?, 0)`,
          [
            reqRow.member_id || null,
            String(reqRow.member_phone || ''),
            String(reqRow.cycle_name || ''),
            'Cycle Exit Approved',
            `Your request to exit ${reqRow.cycle_name} was approved by Admin.`
          ]
        );
      } else {
        await tx.run("UPDATE cycle_exit_requests SET status = 'declined', processed_at = ? WHERE id = ?", [
          processedAt,
          id
        ]);
        await tx.run("UPDATE member_cycles SET status = 'active' WHERE id = ? AND LOWER(status) = 'exit_pending'", [
          reqRow.member_cycle_id
        ]);

        await tx.run(
          `INSERT INTO client_notifications (member_id, member_phone, notif_type, cycle_name, title, message, is_read)
           VALUES (?, ?, 'cycle_exit_declined', ?, ?, ?, 0)`,
          [
            reqRow.member_id || null,
            String(reqRow.member_phone || ''),
            String(reqRow.cycle_name || ''),
            'Cycle Exit Declined',
            `Your request to exit ${reqRow.cycle_name} was declined by Admin. Your cycle remains active.`
          ]
        );
      }
    });

    res.json({ success: true, status: action === 'approve' ? 'approved' : 'declined' });
  })
);

// ============================================================
// STARTUP & FRONTEND SERVING
// ============================================================

async function startServer() {
  await db.initialize();
  await writeStaticSupabaseSchemaFile(db);

  app.use('/uploads', express.static(UPLOADS_DIR));

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'mpa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const publicDir = path.resolve(__dirname, 'public');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir, { extensions: ['html'] }));
    }
    app.use(express.static(publicDir, { extensions: ['html'] }));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SHIMOGY Investment Group server running on http://localhost:${PORT} [DB: ${db.mode}]`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
