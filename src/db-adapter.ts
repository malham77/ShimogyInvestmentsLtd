import Database from 'better-sqlite3';
import { Pool, type PoolClient } from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ihgfsvkcpgxklotjmokl.supabase.co';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_jvFnU7agmMpbWk3HVPDn5g_3YQn9_xC';

export function resolvePostgresConnectionString(): string {
  const rawUrl = String(process.env.DATABASE_URL || '').trim();
  const dbPass = String(process.env.SUPABASE_DB_PASSWORD || '').trim();
  if (rawUrl && !rawUrl.includes('[YOUR-DATABASE-PASSWORD]') && !rawUrl.includes('CHANGE_ME')) {
    return rawUrl;
  }
  if (dbPass && !dbPass.includes('[YOUR-DATABASE-PASSWORD]')) {
    const encoded = encodeURIComponent(dbPass);
    return `postgresql://postgres.ihgfsvkcpgxklotjmokl:${encoded}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;
  }
  return '';
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (!stored.includes(':')) {
    return password === stored;
  }
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

export function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('256') && digits.length >= 12) {
    return '0' + digits.slice(3);
  }
  return digits || String(phone || '').trim();
}

export function sanitizeUrl(url: string, fallback = ''): string {
  const clean = String(url || '').trim();
  if (!clean) return fallback;
  const lower = clean.toLowerCase().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/') ||
    lower.startsWith('data:application/')
  ) {
    return fallback;
  }
  if (
    clean.startsWith('/') ||
    clean.startsWith('assets/') ||
    clean.startsWith('https://') ||
    clean.startsWith('http://') ||
    clean.startsWith('data:image/') ||
    /^[a-zA-Z0-9._-]+\.html([#?].*)?$/.test(clean)
  ) {
    return clean;
  }
  return fallback;
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function nowTimestampISO(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function addDaysToISO(baseDateStr: string, daysToAdd: number): string {
  const clean = String(baseDateStr || '').slice(0, 10);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(clean) ? new Date(clean + 'T00:00:00Z') : new Date();
  if (Number.isNaN(base.getTime())) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysToAdd);
    return d.toISOString().split('T')[0];
  }
  base.setUTCDate(base.getUTCDate() + daysToAdd);
  return base.toISOString().split('T')[0];
}

export function parseDurationDays(durationText: string, fallbackDays = 30): number {
  const s = String(durationText || '').toLowerCase();
  const numMatch = s.match(/(\d+)/);
  const num = numMatch ? Number(numMatch[1]) : 0;
  if (s.includes('year')) return (num || 1) * 365;
  if (s.includes('month')) return (num || 1) * 30;
  if (s.includes('week') || s.includes('bi-week')) return s.includes('bi-week') ? 14 : (num || 1) * 7;
  if (s.includes('daily')) return 1;
  if (num > 0) return num;
  return fallbackDays;
}

export function computeReturnsDate(startDate: string, duration: string, explicitDate?: string): string {
  const given = String(explicitDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(given)) return given;
  const days = parseDurationDays(duration, 60);
  return addDaysToISO(startDate || todayISO(), days);
}

export function computeLoanReturnDate(requestDate: string, duration: string, explicitDate?: string): string {
  const given = String(explicitDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(given)) return given;
  const days = parseDurationDays(duration, 30);
  return addDaysToISO(requestDate || todayISO(), days);
}

export function normalizeSavingsStatus(accountType: string, requestedStatus?: string): string {
  const raw = String(requestedStatus || '').trim().toLowerCase();
  if (raw === 'suspended' || raw === 'closed') return requestedStatus!;
  if (String(accountType || '').toLowerCase().includes('fixed')) return 'Locked';
  return 'Available';
}

function toPgPlaceholders(query: string): string {
  let idx = 0;
  let out = '';
  let inSingleQuote = false;
  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (ch === "'" && query[i - 1] !== '\\') {
      inSingleQuote = !inSingleQuote;
      out += ch;
    } else if (ch === '?' && !inSingleQuote) {
      idx += 1;
      out += `$${idx}`;
    } else {
      out += ch;
    }
  }
  return out;
}

export interface DbRunner {
  all<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number; changes: number }>;
}

class SqliteRunner implements DbRunner {
  private conn: Database.Database;
  constructor(conn: Database.Database) {
    this.conn = conn;
  }
  async all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.conn.prepare(sql).all(...params) as T[];
  }
  async get<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.conn.prepare(sql).get(...params) as T | undefined;
  }
  async run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
    const info = this.conn.prepare(sql).run(...params);
    return { lastInsertRowid: Number(info.lastInsertRowid || 0), changes: Number(info.changes || 0) };
  }
}

class PgRunner implements DbRunner {
  private client: Pool | PoolClient;
  constructor(client: Pool | PoolClient) {
    this.client = client;
  }
  async all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.client.query(toPgPlaceholders(sql), params);
    return res.rows as T[];
  }
  async get<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const res = await this.client.query(toPgPlaceholders(sql), params);
    return res.rows[0] as T | undefined;
  }
  async run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
    let pgSql = toPgPlaceholders(sql).trim();
    const isInsert = /^insert\s+/i.test(pgSql) && !/\breturning\b/i.test(pgSql) && !/\bon\s+conflict\b/i.test(pgSql);
    // Tables without serial id column use explicit keys (site_settings, auth_sessions)
    const tablesWithoutId = /\binto\s+(site_settings|auth_sessions)\b/i.test(pgSql);
    if (isInsert && !tablesWithoutId) {
      pgSql += ' RETURNING id';
    }
    const res = await this.client.query(pgSql, params);
    const insertedId = res.rows && res.rows[0] && res.rows[0].id !== undefined ? Number(res.rows[0].id) : 0;
    return { lastInsertRowid: insertedId, changes: Number(res.rowCount || 0) };
  }
}

const PG_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  user_id BIGINT NOT NULL,
  identifier TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hero_slides (
  id BIGSERIAL PRIMARY KEY,
  badge_text TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  cta_text TEXT NOT NULL DEFAULT 'Explore Investments',
  cta_link TEXT NOT NULL DEFAULT 'investments.html',
  image_url TEXT NOT NULL,
  image_alt TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS testimonials (
  id BIGSERIAL PRIMARY KEY,
  client_name TEXT NOT NULL,
  role TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Kampala, Uganda',
  quote TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  photo_alt TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS investment_plans (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price BIGINT NOT NULL,
  expected_return BIGINT NOT NULL,
  duration TEXT NOT NULL,
  risk TEXT NOT NULL DEFAULT 'Low',
  risk_level INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  image_alt TEXT NOT NULL DEFAULT '',
  slots_left INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'available',
  badge TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS public_cycles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contribution BIGINT NOT NULL,
  payout_duration TEXT NOT NULL DEFAULT 'Monthly',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  image_alt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS updates (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'news',
  excerpt TEXT NOT NULL,
  detail TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_alt TEXT NOT NULL DEFAULT '',
  published_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL DEFAULT '',
  balance BIGINT NOT NULL DEFAULT 0,
  total_invested BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT NOT NULL,
  age_verified INTEGER NOT NULL DEFAULT 1,
  guardian_name TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS investments (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT,
  member_phone TEXT NOT NULL,
  member_name TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount BIGINT NOT NULL,
  expected_return BIGINT NOT NULL,
  duration TEXT NOT NULL DEFAULT '30 Days',
  returns_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS savings (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT,
  member_phone TEXT NOT NULL,
  member_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0,
  open_date TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
  status TEXT NOT NULL DEFAULT 'Available',
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS loans (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT,
  member_phone TEXT NOT NULL,
  member_name TEXT NOT NULL,
  amount BIGINT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '30 days',
  interest_rate TEXT NOT NULL DEFAULT '10%',
  status TEXT NOT NULL DEFAULT 'active',
  request_date TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
  return_date TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS member_cycles (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT,
  member_phone TEXT NOT NULL,
  member_name TEXT NOT NULL,
  cycle_name TEXT NOT NULL,
  contribution BIGINT NOT NULL DEFAULT 0,
  payout_duration TEXT NOT NULL DEFAULT 'Monthly',
  number_of_members INTEGER NOT NULL DEFAULT 10,
  cycle_number INTEGER NOT NULL DEFAULT 1,
  cycle_type TEXT NOT NULL DEFAULT 'public',
  join_date TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS service_requests (
  id BIGSERIAL PRIMARY KEY,
  request_type TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  details_json TEXT NOT NULL,
  age_confirmed INTEGER NOT NULL DEFAULT 1,
  guardian_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'),
  processed_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS media_files (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);
`;

export const PG_RLS_SQL = `
-- Security Hardening: Enable Row Level Security (RLS) on all tables
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;

-- Public Catalog Read-Only Policies (for static Cloudflare Pages / REST reads)
DROP POLICY IF EXISTS "Public read site_settings" ON site_settings;
CREATE POLICY "Public read site_settings" ON site_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read hero_slides" ON hero_slides;
CREATE POLICY "Public read hero_slides" ON hero_slides FOR SELECT TO anon, authenticated USING (is_active = 1);

DROP POLICY IF EXISTS "Public read testimonials" ON testimonials;
CREATE POLICY "Public read testimonials" ON testimonials FOR SELECT TO anon, authenticated USING (is_active = 1);

DROP POLICY IF EXISTS "Public read investment_plans" ON investment_plans;
CREATE POLICY "Public read investment_plans" ON investment_plans FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read public_cycles" ON public_cycles;
CREATE POLICY "Public read public_cycles" ON public_cycles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read updates" ON updates;
CREATE POLICY "Public read updates" ON updates FOR SELECT TO anon, authenticated USING (status = 'published');

-- Public Write-Only Policies for Inbound Requests (no anonymous SELECT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Public insert service_requests" ON service_requests;
CREATE POLICY "Public insert service_requests" ON service_requests FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert deletion_requests" ON deletion_requests;
CREATE POLICY "Public insert deletion_requests" ON deletion_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
`;

export class DatabaseManager {
  public mode: 'postgres' | 'sqlite' = 'sqlite';
  private sqliteDb: Database.Database;
  private pgPool: Pool | null = null;
  private rootRunner: DbRunner;

  constructor() {
    const dbPath = path.resolve(ROOT_DIR, 'shimogy.db');
    this.sqliteDb = new Database(dbPath);
    this.sqliteDb.pragma('journal_mode = WAL');
    this.sqliteDb.pragma('foreign_keys = ON');
    this.rootRunner = new SqliteRunner(this.sqliteDb);
  }

  private ensureSqliteColumn(table: string, col: string, definition: string) {
    const cols = this.sqliteDb.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === col)) {
      this.sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
    }
  }

  private initSqliteSchemaAndBackfill() {
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS auth_sessions (token TEXT PRIMARY KEY, role TEXT NOT NULL, user_id INTEGER NOT NULL, identifier TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hero_slides (id INTEGER PRIMARY KEY AUTOINCREMENT, badge_text TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, subtitle TEXT NOT NULL, cta_text TEXT NOT NULL DEFAULT 'Explore Investments', cta_link TEXT NOT NULL DEFAULT 'investments.html', image_url TEXT NOT NULL, image_alt TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS testimonials (id INTEGER PRIMARY KEY AUTOINCREMENT, client_name TEXT NOT NULL, role TEXT NOT NULL, location TEXT NOT NULL DEFAULT 'Kampala, Uganda', quote TEXT NOT NULL, photo_url TEXT NOT NULL, photo_alt TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS investment_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL, expected_return INTEGER NOT NULL, duration TEXT NOT NULL, risk TEXT NOT NULL DEFAULT 'Low', risk_level INTEGER NOT NULL DEFAULT 1, description TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL, image_alt TEXT NOT NULL DEFAULT '', slots_left INTEGER NOT NULL DEFAULT 5, status TEXT NOT NULL DEFAULT 'available', badge TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS public_cycles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contribution INTEGER NOT NULL, payout_duration TEXT NOT NULL DEFAULT 'Monthly', description TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL, image_alt TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Active', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'news', excerpt TEXT NOT NULL, detail TEXT NOT NULL, image_url TEXT NOT NULL, image_alt TEXT NOT NULL DEFAULT '', published_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published');
      CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, email TEXT NOT NULL DEFAULT '', group_name TEXT NOT NULL DEFAULT '', balance INTEGER NOT NULL DEFAULT 0, total_invested INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', password_hash TEXT NOT NULL, age_verified INTEGER NOT NULL DEFAULT 1, guardian_name TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS investments (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, member_phone TEXT NOT NULL, member_name TEXT NOT NULL, plan_name TEXT NOT NULL, amount INTEGER NOT NULL, expected_return INTEGER NOT NULL, duration TEXT NOT NULL DEFAULT '30 Days', returns_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS savings (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, member_phone TEXT NOT NULL, member_name TEXT NOT NULL, account_type TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0, open_date TEXT DEFAULT (date('now')), status TEXT NOT NULL DEFAULT 'Available', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, member_phone TEXT NOT NULL, member_name TEXT NOT NULL, amount INTEGER NOT NULL, purpose TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '30 days', interest_rate TEXT NOT NULL DEFAULT '10%', status TEXT NOT NULL DEFAULT 'active', request_date TEXT DEFAULT (date('now')), return_date TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS member_cycles (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, member_phone TEXT NOT NULL, member_name TEXT NOT NULL, cycle_name TEXT NOT NULL, contribution INTEGER NOT NULL DEFAULT 0, payout_duration TEXT NOT NULL DEFAULT 'Monthly', number_of_members INTEGER NOT NULL DEFAULT 10, cycle_number INTEGER NOT NULL DEFAULT 1, cycle_type TEXT NOT NULL DEFAULT 'public', join_date TEXT DEFAULT (date('now')), status TEXT NOT NULL DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS service_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, request_type TEXT NOT NULL, applicant_name TEXT NOT NULL, applicant_phone TEXT NOT NULL, details_json TEXT NOT NULL, age_confirmed INTEGER NOT NULL DEFAULT 1, guardian_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS deletion_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT DEFAULT (datetime('now')), processed_at TEXT DEFAULT '');
      CREATE TABLE IF NOT EXISTS media_files (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, mime_type TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT DEFAULT (datetime('now')));
    `);

    this.ensureSqliteColumn('investments', 'returns_date', "TEXT NOT NULL DEFAULT ''");
    this.ensureSqliteColumn('loans', 'return_date', "TEXT NOT NULL DEFAULT ''");
    this.ensureSqliteColumn('member_cycles', 'cycle_number', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureSqliteColumn('member_cycles', 'cycle_type', "TEXT NOT NULL DEFAULT 'public'");

    // Seed defaults into SQLite
    this.seedSqliteDefaults();

    // Backfill returns_date, return_date, savings Locked/Available, and client wording on defaults
    const invs = this.sqliteDb.prepare("SELECT id, duration, created_at, returns_date FROM investments").all() as any[];
    for (const inv of invs) {
      if (!inv.returns_date) {
        const rd = computeReturnsDate(String(inv.created_at || todayISO()), String(inv.duration || '60 Days'));
        this.sqliteDb.prepare('UPDATE investments SET returns_date = ? WHERE id = ?').run(rd, inv.id);
      }
    }
    const lns = this.sqliteDb.prepare("SELECT id, duration, request_date, return_date FROM loans").all() as any[];
    for (const ln of lns) {
      if (!ln.return_date) {
        const rd = computeLoanReturnDate(String(ln.request_date || todayISO()), String(ln.duration || '30 days'));
        this.sqliteDb.prepare('UPDATE loans SET return_date = ? WHERE id = ?').run(rd, ln.id);
      }
    }
    const savs = this.sqliteDb.prepare("SELECT id, account_type, status FROM savings").all() as any[];
    for (const sv of savs) {
      const normalized = normalizeSavingsStatus(sv.account_type, sv.status);
      if (sv.status !== normalized && String(sv.status).toLowerCase() === 'active') {
        this.sqliteDb.prepare('UPDATE savings SET status = ? WHERE id = ?').run(normalized, sv.id);
      }
    }
  }

  private seedSqliteDefaults() {
    const defaultSettings: Record<string, string> = {
      company_name: 'SHIMOGY Investment Group Ltd',
      short_name: 'SHIMOGY',
      slogan: 'Partners for Life',
      registration_info: 'Registered Investment & Community Savings Group | Kawempe Tula, Kampala, Uganda',
      phone_primary: '+256 752 259 416',
      phone_secondary: '+256 746 788 042',
      whatsapp_number: '256752259416',
      email: 'shimogygroup@gmail.com',
      address: 'Kawempe Tula, Kampala, Uganda',
      working_hours: 'Monday - Saturday: 8:00 AM - 6:00 PM EAT (Sunday: Closed)',
      social_facebook: 'https://www.facebook.com',
      social_tiktok: 'https://www.tiktok.com',
      social_youtube: 'https://www.youtube.com',
      social_instagram: 'https://www.instagram.com',
      logo_url: '/assets/aistudio/logo2_be71428a.jpg',
      about_mission: 'To offer smart and profitable investment opportunities with simplified financial solutions to all our local and international clients.',
      about_vision: 'To lead a positive financial transformation through smart investments and simplified financial solutions across the globe.',
      about_story: 'SHIMOGY Investment Group Ltd is a Kampala-based investment and community savings organization operating from Kawempe Tula. Founded in 2023, we structure local business ventures, savings accounts, rotating community cycles, and client financing with transparent reporting.',
      stats_members: '200+',
      stats_capital: 'UGX 50M+',
      stats_years: 'Since 2023',
      stats_hours: 'Mon - Sat, 8AM - 6PM',
      risk_disclosure: 'All investments carry operational and market risk. Projected returns are estimates based on business cycle performance and are not unconditionally guaranteed.',
      age_consent_policy: 'Account holders must be at least 18 years old. Savings accounts for minors under 18 require verified parent or legal guardian consent and supervision.',
      quick_updates_ticker: 'Welcome to SHIMOGY Investment Group Ltd — Explore active community savings cycles, structured investment plans, and client accounts in Kawempe Tula, Kampala. Contact Operations via WhatsApp for daily guidance.'
    };
    const upsertSetting = this.sqliteDb.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(defaultSettings)) {
      upsertSetting.run(k, v);
    }
    this.sqliteDb.prepare("UPDATE site_settings SET value = '/assets/aistudio/logo2_be71428a.jpg' WHERE key = 'logo_url' AND value = '/assets/aistudio/logobg_263a028d.png'").run();

    const defaultPass = process.env.ADMIN_PASSWORD || 'shimogy123';
    const insertAdminIgnore = this.sqliteDb.prepare('INSERT OR IGNORE INTO admin_users (email, name, password_hash) VALUES (?, ?, ?)');
    for (const em of [process.env.ADMIN_EMAIL || 'admin@shimogy.com', 'maleham06@gmail.com', 'mal77ham@gmail.com']) {
      insertAdminIgnore.run(em.toLowerCase(), 'SHIMOGY Administrator', hashPassword(defaultPass));
    }

    const heroCount = this.sqliteDb.prepare('SELECT COUNT(*) as c FROM hero_slides').get() as { c: number };
    if (heroCount.c === 0) {
      const stmt = this.sqliteDb.prepare('INSERT INTO hero_slides (badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)');
      stmt.run('Kawempe Tula, Kampala · Established 2023', 'Structured Investments for Steady Financial Growth', 'Participate in vetted local business ventures, transparent savings accounts, and community saving cycles managed by our Kampala operations team.', 'Explore Investment Plans', 'investments.html', '/assets/aistudio/partnership_65dac3a6.jpg', 'Business partners shaking hands over a structured investment partnership agreement', 1);
      stmt.run('Transparent Portfolio Tracking', 'Real-Time Visibility Into Every Shilling You Invest', 'Monitor your active plans, fixed savings accounts, cycle schedules, and loan balances from your secure client portal at any time.', 'Open Client Portal', 'dashboard.html', '/assets/aistudio/graph_ddbd7244.jpg', 'Financial growth chart and portfolio analytics presentation', 2);
      stmt.run('Community & Enterprise Financing', 'Savings Accounts and Rotating Cycles Built on Trust', 'Choose a flexible Current Account, earn 7% annual interest on a Fixed Account, or join a structured community savings cycle.', 'View Savings Options', 'savings.html', '/assets/aistudio/restaurant_ad866c9e.jpg', 'Active Ugandan hospitality venture supported by SHIMOGY Investment Group', 3);
    }

    const testCount = this.sqliteDb.prepare('SELECT COUNT(*) as c FROM testimonials').get() as { c: number };
    if (testCount.c === 0) {
      const stmt = this.sqliteDb.prepare('INSERT INTO testimonials (client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
      stmt.run('Nansikombi Josephine', 'Verified Client', 'Kampala, Uganda', 'Shimogy Investment Group has helped me work toward my financial goals through structured investment opportunities and fair lending terms.', '/assets/aistudio/josephine_a1a0850e.jpg', 'Portrait of SHIMOGY client Nansikombi Josephine outdoors in Kampala', 1);
      stmt.run('Namala Florence', 'Verified Client', 'Mbarara, Uganda', 'I save with Shimogy Investment Group from Mbarara. The structured savings cycles helped me build consistent saving habits.', '/assets/aistudio/Namala_406c7774.jpg', 'Portrait of SHIMOGY client Namala Florence at a local retail outlet', 2);
      stmt.run('Mbabali Patrick', 'Verified Investor', 'Kawempe, Kampala', 'Transparency is what sets SHIMOGY apart. My client dashboard reflects every contribution clearly, and I have reinvested across multiple cycles.', '/assets/aistudio/patrick_ebf0c1be.jpg', 'Portrait of SHIMOGY investor Mbabali Patrick', 3);
    }

    const planCount = this.sqliteDb.prepare('SELECT COUNT(*) as c FROM investment_plans').get() as { c: number };
    if (planCount.c === 0) {
      const stmt = this.sqliteDb.prepare('INSERT INTO investment_plans (name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      stmt.run("Men's Hair Salon", 200000, 250000, '30 Days', 'Low', 1, 'Participate in an active Kampala grooming and barbershop enterprise with consistent daily customer flow.', '/assets/aistudio/saloon_90076cb0.jpg', "Modern men's hair salon interior with barber stations and mirrors", 5, 'available', 'New');
      stmt.run('Poultry Farm', 500000, 700000, '60 Days', 'Low', 1, 'Structured agricultural cycle supporting managed poultry production and regional supply.', '/assets/aistudio/poultry_4e5861c3.jpg', 'Managed poultry farm housing healthy laying hens in Uganda', 3, 'available', 'Popular');
      stmt.run('Restaurant Enterprise', 500000, 700000, '45 Days', 'Medium', 2, 'Working capital allocation for established catering and dining operations in Kampala.', '/assets/aistudio/restaurant_ad866c9e.jpg', 'Prepared dining tables at an outdoor restaurant venue', 4, 'available', 'Trending');
      stmt.run('Grocery Store', 800000, 1200000, '60 Days', 'Medium', 2, 'Inventory expansion for high-turnover fresh produce and household grocery retail.', '/assets/aistudio/grocery_3e5981e4.PNG', 'Fresh produce and grocery retail store display shelves', 2, 'available', 'Featured');
      stmt.run('Transport Business', 1000000, 1500000, '90 Days', 'High', 3, 'Commercial passenger and logistics vehicle operations along high-demand Kampala corridors.', '/assets/aistudio/transport_459a1a5e.jpg', 'Commercial passenger transport vehicles operating in Kampala', 1, 'available', 'Trending');
      stmt.run('Modern Construction', 2500000, 3500000, '120 Days', 'Low', 1, 'Materials supply and project financing for vetted residential and commercial construction contracts.', '/assets/aistudio/partnership_65dac3a6.jpg', 'Project partnership agreement for commercial development', 2, 'available', '');
    }

    const cycleCount = this.sqliteDb.prepare('SELECT COUNT(*) as c FROM public_cycles').get() as { c: number };
    if (cycleCount.c === 0) {
      const stmt = this.sqliteDb.prepare('INSERT INTO public_cycles (name, contribution, payout_duration, description, image_url, image_alt, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
      stmt.run('Group 1 - Kawempe Savers', 3000, 'Weekly', 'Accessible entry-level weekly contribution cycle designed for steady community saving.', '/assets/aistudio/partnership_65dac3a6.jpg', 'Kawempe Savers community savings cycle partnership', 'Active');
      stmt.run('Group 2 - Weekly Builders', 5000, 'Weekly', 'Weekly group savings cycle helping clients accumulate capital for personal projects.', '/assets/aistudio/graph_ddbd7244.jpg', 'Weekly Builders financial planning and savings progress chart', 'Active');
      stmt.run('Group 3 - Bwaise United', 10000, 'Weekly', 'Mid-tier rotational savings circle tailored for small business owners and traders.', '/assets/aistudio/grocery_3e5981e4.PNG', 'Bwaise United small business traders savings group', 'Active');
      stmt.run('Group 4 - Kampala Trust', 50000, 'Monthly', 'Monthly structured contribution cycle for larger target payouts and business expansion.', '/assets/aistudio/restaurant_ad866c9e.jpg', 'Kampala Trust monthly savings circle', 'Active');
    }

    const updCount = this.sqliteDb.prepare('SELECT COUNT(*) as c FROM updates').get() as { c: number };
    if (updCount.c === 0) {
      const stmt = this.sqliteDb.prepare("INSERT INTO updates (title, category, excerpt, detail, image_url, image_alt, published_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'published')");
      stmt.run('New Client Portal & Transparent Portfolio Tracking', 'news', 'Clients can now view active investments, fixed accounts, loans, and cycle schedules in real time.', 'Our upgraded portal connects directly to our central operations database, ensuring every newly recorded investment plan, Fixed Account deposit, loan approval, and cycle payout schedule appears promptly in your client dashboard.', '/assets/aistudio/graph_ddbd7244.jpg', 'Portfolio growth and digital client tracking dashboard overview', '2026-11-10');
      stmt.run('Fixed Account Annual Interest & Loan Equivalency', 'tip', 'Earn 7% annual interest on Fixed Accounts and qualify for up to 85% fixed equivalency loans.', 'Clients holding an active Fixed Account benefit from 7% annual interest paid at the end of the fixed duration with zero monthly fees, plus eligibility for a client loan up to 85% of their fixed deposit balance.', '/assets/aistudio/partnership_65dac3a6.jpg', 'Fixed account savings and client financing partnership', '2026-11-02');
      stmt.run('Poultry & Hospitality Cycles Open for Q4', 'event', 'Operations Team has verified new slots across Poultry Farm and Restaurant Enterprise cycles.', 'Our Kawempe operations team conducts physical site checks before opening new investment slots. Interested clients can submit a slot request online and finalize verification directly with our office.', '/assets/aistudio/poultry_4e5861c3.jpg', 'Poultry farm operation monitored by SHIMOGY operations team', '2026-10-24');
      stmt.run('Youth & Guardian-Supervised Savings Guidance', 'story', 'How families in Kampala are using structured savings to prepare for school fees and household goals.', 'With verified parent or legal guardian consent, families can build disciplined savings habits for education and long-term milestones while maintaining full transparency through our Kawempe office.', '/assets/aistudio/Namala_406c7774.jpg', 'SHIMOGY client Namala Florence sharing her savings journey', '2026-10-12');
    }

    const memCount = this.sqliteDb.prepare('SELECT COUNT(*) as c FROM members').get() as { c: number };
    if (memCount.c === 0) {
      const info = this.sqliteDb.prepare('INSERT INTO members (name, phone, email, group_name, balance, total_invested, status, password_hash, age_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(
        'Nansikombi Josephine', '0752259416', 'josephine@example.com', 'Group 1 - Kawempe Savers', 750000, 500000, 'active', hashPassword('9416')
      );
      const mid = Number(info.lastInsertRowid);
      const retDate = computeReturnsDate(todayISO(), '60 Days');
      const loanRetDate = computeLoanReturnDate(todayISO(), '30 days');
      this.sqliteDb.prepare('INSERT INTO investments (member_id, member_phone, member_name, plan_name, amount, expected_return, duration, returns_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        mid, '0752259416', 'Nansikombi Josephine', 'Poultry Farm', 500000, 700000, '60 Days', retDate, 'active'
      );
      this.sqliteDb.prepare('INSERT INTO savings (member_id, member_phone, member_name, account_type, balance, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        mid, '0752259416', 'Nansikombi Josephine', 'Fixed Account', 250000, 'Locked'
      );
      this.sqliteDb.prepare('INSERT INTO loans (member_id, member_phone, member_name, amount, purpose, duration, interest_rate, status, return_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        mid, '0752259416', 'Nansikombi Josephine', 150000, 'Stock replenishment', '30 days', '10%', 'active', loanRetDate
      );
      this.sqliteDb.prepare('INSERT INTO member_cycles (member_id, member_phone, member_name, cycle_name, contribution, payout_duration, number_of_members, cycle_number, cycle_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        mid, '0752259416', 'Nansikombi Josephine', 'Group 1 - Kawempe Savers', 3000, 'Weekly', 8, 3, 'public', 'active'
      );
    }
  }

  public async initialize(): Promise<void> {
    this.initSqliteSchemaAndBackfill();
    const pgUrl = resolvePostgresConnectionString();
    if (!pgUrl) {
      this.mode = 'sqlite';
      this.rootRunner = new SqliteRunner(this.sqliteDb);
      return;
    }

    try {
      const pool = new Pool({
        connectionString: pgUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });
      await pool.query('SELECT 1');
      await pool.query(PG_SCHEMA_SQL);
      // Idempotent column migrations on existing Postgres deployments
      await pool.query("ALTER TABLE investments ADD COLUMN IF NOT EXISTS returns_date TEXT NOT NULL DEFAULT ''");
      await pool.query("ALTER TABLE loans ADD COLUMN IF NOT EXISTS return_date TEXT NOT NULL DEFAULT ''");
      await pool.query('ALTER TABLE member_cycles ADD COLUMN IF NOT EXISTS cycle_number INTEGER NOT NULL DEFAULT 1');
      await pool.query("ALTER TABLE member_cycles ADD COLUMN IF NOT EXISTS cycle_type TEXT NOT NULL DEFAULT 'public'");
      await pool.query(PG_RLS_SQL);

      const existingSettings = await pool.query('SELECT COUNT(*) AS c FROM site_settings');
      if (Number(existingSettings.rows[0]?.c || 0) === 0) {
        await this.migrateSqliteToPostgres(pool);
      }

      this.pgPool = pool;
      this.mode = 'postgres';
      this.rootRunner = new PgRunner(pool);
      console.log('Connected to Supabase PostgreSQL database.');
    } catch (err) {
      console.warn('Supabase PostgreSQL connection unavailable; falling back to local SQLite:', err instanceof Error ? err.message : err);
      this.mode = 'sqlite';
      this.rootRunner = new SqliteRunner(this.sqliteDb);
    }
  }

  private async migrateSqliteToPostgres(pool: Pool): Promise<void> {
    const tables: { name: string; cols: string[]; hasId: boolean }[] = [
      { name: 'site_settings', cols: ['key', 'value'], hasId: false },
      { name: 'admin_users', cols: ['id', 'email', 'name', 'password_hash', 'created_at'], hasId: true },
      { name: 'hero_slides', cols: ['id', 'badge_text', 'title', 'subtitle', 'cta_text', 'cta_link', 'image_url', 'image_alt', 'sort_order', 'is_active'], hasId: true },
      { name: 'testimonials', cols: ['id', 'client_name', 'role', 'location', 'quote', 'photo_url', 'photo_alt', 'sort_order', 'is_active'], hasId: true },
      { name: 'investment_plans', cols: ['id', 'name', 'price', 'expected_return', 'duration', 'risk', 'risk_level', 'description', 'image_url', 'image_alt', 'slots_left', 'status', 'badge', 'created_at'], hasId: true },
      { name: 'public_cycles', cols: ['id', 'name', 'contribution', 'payout_duration', 'description', 'image_url', 'image_alt', 'status', 'created_at'], hasId: true },
      { name: 'updates', cols: ['id', 'title', 'category', 'excerpt', 'detail', 'image_url', 'image_alt', 'published_date', 'status'], hasId: true },
      { name: 'members', cols: ['id', 'name', 'phone', 'email', 'group_name', 'balance', 'total_invested', 'status', 'password_hash', 'age_verified', 'guardian_name', 'created_at'], hasId: true },
      { name: 'investments', cols: ['id', 'member_id', 'member_phone', 'member_name', 'plan_name', 'amount', 'expected_return', 'duration', 'returns_date', 'status', 'created_at'], hasId: true },
      { name: 'savings', cols: ['id', 'member_id', 'member_phone', 'member_name', 'account_type', 'balance', 'open_date', 'status', 'created_at'], hasId: true },
      { name: 'loans', cols: ['id', 'member_id', 'member_phone', 'member_name', 'amount', 'purpose', 'duration', 'interest_rate', 'status', 'request_date', 'return_date', 'created_at'], hasId: true },
      { name: 'member_cycles', cols: ['id', 'member_id', 'member_phone', 'member_name', 'cycle_name', 'contribution', 'payout_duration', 'number_of_members', 'cycle_number', 'cycle_type', 'join_date', 'status', 'created_at'], hasId: true },
      { name: 'service_requests', cols: ['id', 'request_type', 'applicant_name', 'applicant_phone', 'details_json', 'age_confirmed', 'guardian_name', 'status', 'created_at'], hasId: true },
      { name: 'deletion_requests', cols: ['id', 'full_name', 'phone', 'email', 'reason', 'status', 'requested_at', 'processed_at'], hasId: true }
    ];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const t of tables) {
        const rows = this.sqliteDb.prepare(`SELECT ${t.cols.join(', ')} FROM ${t.name}`).all() as Record<string, unknown>[];
        if (!rows.length) continue;
        const placeholders = t.cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const sql = `INSERT INTO ${t.name} (${t.cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
        for (const r of rows) {
          await client.query(sql, t.cols.map((c) => r[c] ?? null));
        }
        if (t.hasId) {
          await client.query(`SELECT setval(pg_get_serial_sequence('${t.name}', 'id'), COALESCE((SELECT MAX(id) FROM ${t.name}), 1))`);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.rootRunner.all<T>(sql, params);
  }

  public get<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.rootRunner.get<T>(sql, params);
  }

  public run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
    return this.rootRunner.run(sql, params);
  }

  public async transaction<T>(fn: (runner: DbRunner) => Promise<T>): Promise<T> {
    if (this.mode === 'postgres' && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(new PgRunner(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // SQLite async wrapper (better-sqlite3 handles synchronous transactions, but for clean async safety use BEGIN/COMMIT)
    this.sqliteDb.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(new SqliteRunner(this.sqliteDb));
      this.sqliteDb.exec('COMMIT');
      return result;
    } catch (err) {
      try { this.sqliteDb.exec('ROLLBACK'); } catch {}
      throw err;
    }
  }

  public async generateSupabaseExportSql(includeAuthHashes = true): Promise<string> {
    const sqlEsc = (val: unknown): string => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
      return "'" + String(val).replace(/'/g, "''") + "'";
    };

    const chunks: string[] = [
      '-- ============================================================================',
      '-- SHIMOGY Investment Group Ltd - Supabase PostgreSQL Schema & Full Data Export',
      `-- Generated: ${new Date().toISOString()}`,
      `-- Project URL: ${SUPABASE_URL}`,
      '-- Instructions: Paste and run this file in your Supabase SQL Editor.',
      '-- ============================================================================',
      '',
      PG_SCHEMA_SQL.trim(),
      '',
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS returns_date TEXT NOT NULL DEFAULT '';",
      "ALTER TABLE loans ADD COLUMN IF NOT EXISTS return_date TEXT NOT NULL DEFAULT '';",
      'ALTER TABLE member_cycles ADD COLUMN IF NOT EXISTS cycle_number INTEGER NOT NULL DEFAULT 1;',
      "ALTER TABLE member_cycles ADD COLUMN IF NOT EXISTS cycle_type TEXT NOT NULL DEFAULT 'public';",
      '',
      '-- Exported Table Rows',
      ''
    ];

    const exportTables: { name: string; cols: string[]; hasId: boolean }[] = [
      { name: 'site_settings', cols: ['key', 'value'], hasId: false },
      ...(includeAuthHashes ? [{ name: 'admin_users', cols: ['id', 'email', 'name', 'password_hash', 'created_at'], hasId: true }] : []),
      { name: 'hero_slides', cols: ['id', 'badge_text', 'title', 'subtitle', 'cta_text', 'cta_link', 'image_url', 'image_alt', 'sort_order', 'is_active'], hasId: true },
      { name: 'testimonials', cols: ['id', 'client_name', 'role', 'location', 'quote', 'photo_url', 'photo_alt', 'sort_order', 'is_active'], hasId: true },
      { name: 'investment_plans', cols: ['id', 'name', 'price', 'expected_return', 'duration', 'risk', 'risk_level', 'description', 'image_url', 'image_alt', 'slots_left', 'status', 'badge', 'created_at'], hasId: true },
      { name: 'public_cycles', cols: ['id', 'name', 'contribution', 'payout_duration', 'description', 'image_url', 'image_alt', 'status', 'created_at'], hasId: true },
      { name: 'updates', cols: ['id', 'title', 'category', 'excerpt', 'detail', 'image_url', 'image_alt', 'published_date', 'status'], hasId: true },
      {
        name: 'members',
        cols: includeAuthHashes
          ? ['id', 'name', 'phone', 'email', 'group_name', 'balance', 'total_invested', 'status', 'password_hash', 'age_verified', 'guardian_name', 'created_at']
          : ['id', 'name', 'phone', 'email', 'group_name', 'balance', 'total_invested', 'status', 'age_verified', 'guardian_name', 'created_at'],
        hasId: true
      },
      { name: 'investments', cols: ['id', 'member_id', 'member_phone', 'member_name', 'plan_name', 'amount', 'expected_return', 'duration', 'returns_date', 'status', 'created_at'], hasId: true },
      { name: 'savings', cols: ['id', 'member_id', 'member_phone', 'member_name', 'account_type', 'balance', 'open_date', 'status', 'created_at'], hasId: true },
      { name: 'loans', cols: ['id', 'member_id', 'member_phone', 'member_name', 'amount', 'purpose', 'duration', 'interest_rate', 'status', 'request_date', 'return_date', 'created_at'], hasId: true },
      { name: 'member_cycles', cols: ['id', 'member_id', 'member_phone', 'member_name', 'cycle_name', 'contribution', 'payout_duration', 'number_of_members', 'cycle_number', 'cycle_type', 'join_date', 'status', 'created_at'], hasId: true },
      { name: 'service_requests', cols: ['id', 'request_type', 'applicant_name', 'applicant_phone', 'details_json', 'age_confirmed', 'guardian_name', 'status', 'created_at'], hasId: true },
      { name: 'deletion_requests', cols: ['id', 'full_name', 'phone', 'email', 'reason', 'status', 'requested_at', 'processed_at'], hasId: true }
    ];

    for (const t of exportTables) {
      const orderCol = t.hasId ? 'id ASC' : 'key ASC';
      const rows = await this.all<Record<string, unknown>>(`SELECT ${t.cols.join(', ')} FROM ${t.name} ORDER BY ${orderCol}`);
      if (!rows.length) continue;
      chunks.push(`-- ${t.name} (${rows.length} rows)`);
      for (const row of rows) {
        const vals = t.cols.map((c) => sqlEsc(row[c])).join(', ');
        chunks.push(`INSERT INTO ${t.name} (${t.cols.join(', ')}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
      }
      if (t.hasId) {
        chunks.push(`SELECT setval(pg_get_serial_sequence('${t.name}', 'id'), COALESCE((SELECT MAX(id) FROM ${t.name}), 1));`);
      }
      chunks.push('');
    }

    chunks.push(PG_RLS_SQL.trim());
    chunks.push('');
    return chunks.join('\n');
  }
}

export async function writeStaticSupabaseSchemaFile(db: DatabaseManager) {
  const outDir = path.resolve(ROOT_DIR, 'supabase');
  fs.mkdirSync(outDir, { recursive: true });
  const sqlContent = await db.generateSupabaseExportSql(true);
  fs.writeFileSync(path.resolve(outDir, 'schema_and_export.sql'), sqlContent, 'utf8');
}
