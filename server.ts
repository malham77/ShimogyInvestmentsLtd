import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initialize SQLite Database
const DB_PATH = path.resolve(__dirname, 'shimogy.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Password hashing helpers (scrypt)
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
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

function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('256') && digits.length >= 12) {
    return '0' + digits.slice(3);
  }
  return digits || String(phone || '').trim();
}

// Create database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    identifier TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hero_slides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    expected_return INTEGER NOT NULL,
    duration TEXT NOT NULL,
    risk TEXT NOT NULL DEFAULT 'Low',
    risk_level INTEGER NOT NULL DEFAULT 1,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    image_alt TEXT NOT NULL DEFAULT '',
    slots_left INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'available',
    badge TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS public_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contribution INTEGER NOT NULL,
    payout_duration TEXT NOT NULL DEFAULT 'Monthly',
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    image_alt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    group_name TEXT NOT NULL DEFAULT '',
    balance INTEGER NOT NULL DEFAULT 0,
    total_invested INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    password_hash TEXT NOT NULL,
    age_verified INTEGER NOT NULL DEFAULT 1,
    guardian_name TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    member_phone TEXT NOT NULL,
    member_name TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    expected_return INTEGER NOT NULL,
    duration TEXT NOT NULL DEFAULT '30 Days',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS savings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    member_phone TEXT NOT NULL,
    member_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    open_date TEXT DEFAULT (date('now')),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    member_phone TEXT NOT NULL,
    member_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    purpose TEXT NOT NULL DEFAULT '',
    duration TEXT NOT NULL DEFAULT '30 days',
    interest_rate TEXT NOT NULL DEFAULT '10%',
    status TEXT NOT NULL DEFAULT 'pending',
    request_date TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS member_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    member_phone TEXT NOT NULL,
    member_name TEXT NOT NULL,
    cycle_name TEXT NOT NULL,
    contribution INTEGER NOT NULL DEFAULT 0,
    payout_duration TEXT NOT NULL DEFAULT 'Monthly',
    number_of_members INTEGER NOT NULL DEFAULT 10,
    join_date TEXT DEFAULT (date('now')),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_type TEXT NOT NULL,
    applicant_name TEXT NOT NULL,
    applicant_phone TEXT NOT NULL,
    details_json TEXT NOT NULL,
    age_confirmed INTEGER NOT NULL DEFAULT 1,
    guardian_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deletion_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed initial data when tables are empty
function seedDatabase() {
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
    about_story: 'SHIMOGY Investment Group Ltd is a Kampala-based investment and community savings organization operating from Kawempe Tula. Founded in 2023, we structure local business ventures, savings accounts, rotating community cycles, and member financing with transparent reporting.',
    stats_members: '200+',
    stats_capital: 'UGX 50M+',
    stats_years: 'Since 2023',
    stats_hours: 'Mon - Sat, 8AM - 6PM',
    risk_disclosure: 'All investments carry operational and market risk. Projected returns are estimates based on business cycle performance and are not unconditionally guaranteed.',
    age_consent_policy: 'Account holders must be at least 18 years old. Savings accounts for minors under 18 require verified parent or legal guardian consent and supervision.',
    quick_updates_ticker: 'Welcome to SHIMOGY Investment Group Ltd — Explore active community savings cycles, structured investment plans, and member accounts in Kawempe Tula, Kampala. Contact Operations via WhatsApp for daily guidance.'
  };

  const upsertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaultSettings)) {
    upsertSetting.run(k, v);
  }
  // Ensure existing white-on-white logo is upgraded to high-contrast dark blue crest
  db.prepare("UPDATE site_settings SET value = '/assets/aistudio/logo2_be71428a.jpg' WHERE key = 'logo_url' AND value = '/assets/aistudio/logobg_263a028d.png'").run();

  // Seed default administrator accounts (never overwrites existing customized accounts)
  const defaultPass = process.env.ADMIN_PASSWORD || 'shimogy123';
  const insertAdminIgnore = db.prepare(
    'INSERT OR IGNORE INTO admin_users (email, name, password_hash) VALUES (?, ?, ?)'
  );
  const seedEmails = [
    process.env.ADMIN_EMAIL || 'admin@shimogy.com',
    'maleham06@gmail.com',
    'mal77ham@gmail.com'
  ];
  for (const em of seedEmails) {
    insertAdminIgnore.run(em.toLowerCase(), 'SHIMOGY Administrator', hashPassword(defaultPass));
  }

  // Seed Hero Slides
  const heroCount = db.prepare('SELECT COUNT(*) as c FROM hero_slides').get() as { c: number };
  if (heroCount.c === 0) {
    const insertSlide = db.prepare(`
      INSERT INTO hero_slides (badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertSlide.run(
      'Kawempe Tula, Kampala · Established 2023',
      'Structured Investments for Steady Financial Growth',
      'Participate in vetted local business ventures, transparent savings accounts, and community saving cycles managed by our Kampala operations team.',
      'Explore Investment Plans',
      'investments.html',
      '/assets/aistudio/partnership_65dac3a6.jpg',
      'Business partners shaking hands over a structured investment partnership agreement',
      1
    );
    insertSlide.run(
      'Transparent Portfolio Tracking',
      'Real-Time Visibility Into Every Shilling You Invest',
      'Monitor your active plans, fixed savings accounts, cycle schedules, and loan balances from your secure member portal at any time.',
      'Open Member Portal',
      'dashboard.html',
      '/assets/aistudio/graph_ddbd7244.jpg',
      'Financial growth chart and portfolio analytics presentation',
      2
    );
    insertSlide.run(
      'Community & Enterprise Financing',
      'Savings Accounts and Rotating Cycles Built on Trust',
      'Choose a flexible Current Account, earn 7% annual interest on a Fixed Account, or join a structured community savings cycle.',
      'View Savings Options',
      'savings.html',
      '/assets/aistudio/restaurant_ad866c9e.jpg',
      'Active Ugandan hospitality venture supported by SHIMOGY Investment Group',
      3
    );
  }

  // Seed Testimonials (real attached client profiles)
  const testCount = db.prepare('SELECT COUNT(*) as c FROM testimonials').get() as { c: number };
  if (testCount.c === 0) {
    const insertTest = db.prepare(`
      INSERT INTO testimonials (client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertTest.run(
      'Nansikombi Josephine',
      'Verified Client',
      'Kampala, Uganda',
      'Shimogy Investment Group has helped me work toward my financial goals through structured investment opportunities and fair lending terms.',
      '/assets/aistudio/josephine_a1a0850e.jpg',
      'Portrait of SHIMOGY client Nansikombi Josephine outdoors in Kampala',
      1
    );
    insertTest.run(
      'Namala Florence',
      'Verified Client',
      'Mbarara, Uganda',
      'I save with Shimogy Investment Group from Mbarara. The structured savings cycles helped me build consistent saving habits.',
      '/assets/aistudio/Namala_406c7774.jpg',
      'Portrait of SHIMOGY member Namala Florence at a local retail outlet',
      2
    );
    insertTest.run(
      'Mbabali Patrick',
      'Verified Investor',
      'Kawempe, Kampala',
      'Transparency is what sets SHIMOGY apart. My member dashboard reflects every contribution clearly, and I have reinvested across multiple cycles.',
      '/assets/aistudio/patrick_ebf0c1be.jpg',
      'Portrait of SHIMOGY investor Mbabali Patrick',
      3
    );
  }

  // Seed Investment Plans
  const planCount = db.prepare('SELECT COUNT(*) as c FROM investment_plans').get() as { c: number };
  if (planCount.c === 0) {
    const insertPlan = db.prepare(`
      INSERT INTO investment_plans (name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPlan.run(
      "Men's Hair Salon", 200000, 250000, '30 Days', 'Low', 1,
      'Participate in an active Kampala grooming and barbershop enterprise with consistent daily customer flow.',
      '/assets/aistudio/saloon_90076cb0.jpg',
      "Modern men's hair salon interior with barber stations and mirrors",
      5, 'available', 'New'
    );
    insertPlan.run(
      'Poultry Farm', 500000, 700000, '60 Days', 'Low', 1,
      'Structured agricultural cycle supporting managed poultry production and regional supply.',
      '/assets/aistudio/poultry_4e5861c3.jpg',
      'Managed poultry farm housing healthy laying hens in Uganda',
      3, 'available', 'Popular'
    );
    insertPlan.run(
      'Restaurant Enterprise', 500000, 700000, '45 Days', 'Medium', 2,
      'Working capital allocation for established catering and dining operations in Kampala.',
      '/assets/aistudio/restaurant_ad866c9e.jpg',
      'Prepared dining tables at an outdoor restaurant venue',
      4, 'available', 'Trending'
    );
    insertPlan.run(
      'Grocery Store', 800000, 1200000, '60 Days', 'Medium', 2,
      'Inventory expansion for high-turnover fresh produce and household grocery retail.',
      '/assets/aistudio/grocery_3e5981e4.PNG',
      'Fresh produce and grocery retail store display shelves',
      2, 'available', 'Featured'
    );
    insertPlan.run(
      'Transport Business', 1000000, 1500000, '90 Days', 'High', 3,
      'Commercial passenger and logistics vehicle operations along high-demand Kampala corridors.',
      '/assets/aistudio/transport_459a1a5e.jpg',
      'Commercial passenger transport vehicles operating in Kampala',
      1, 'available', 'Trending'
    );
    insertPlan.run(
      'Modern Construction', 2500000, 3500000, '120 Days', 'Low', 1,
      'Materials supply and project financing for vetted residential and commercial construction contracts.',
      '/assets/aistudio/partnership_65dac3a6.jpg',
      'Project partnership agreement for commercial development',
      2, 'available', ''
    );
  }

  // Seed Public Cycles
  const cycleCount = db.prepare('SELECT COUNT(*) as c FROM public_cycles').get() as { c: number };
  if (cycleCount.c === 0) {
    const insertCycle = db.prepare(`
      INSERT INTO public_cycles (name, contribution, payout_duration, description, image_url, image_alt, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertCycle.run(
      'Group 1 - Kawempe Savers', 3000, 'Weekly',
      'Accessible entry-level weekly contribution cycle designed for steady community saving.',
      '/assets/aistudio/partnership_65dac3a6.jpg',
      'Kawempe Savers community savings cycle partnership',
      'Active'
    );
    insertCycle.run(
      'Group 2 - Weekly Builders', 5000, 'Weekly',
      'Weekly group savings cycle helping members accumulate capital for personal projects.',
      '/assets/aistudio/graph_ddbd7244.jpg',
      'Weekly Builders financial planning and savings progress chart',
      'Active'
    );
    insertCycle.run(
      'Group 3 - Bwaise United', 10000, 'Weekly',
      'Mid-tier rotational savings circle tailored for small business owners and traders.',
      '/assets/aistudio/grocery_3e5981e4.PNG',
      'Bwaise United small business traders savings group',
      'Active'
    );
    insertCycle.run(
      'Group 4 - Kampala Trust', 50000, 'Monthly',
      'Monthly structured contribution cycle for larger target payouts and business expansion.',
      '/assets/aistudio/restaurant_ad866c9e.jpg',
      'Kampala Trust monthly savings circle',
      'Active'
    );
  }

  // Seed Updates
  const updCount = db.prepare('SELECT COUNT(*) as c FROM updates').get() as { c: number };
  if (updCount.c === 0) {
    const insertUpdate = db.prepare(`
      INSERT INTO updates (title, category, excerpt, detail, image_url, image_alt, published_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'published')
    `);
    insertUpdate.run(
      'New Member Portal & Transparent Portfolio Tracking',
      'news',
      'Members can now view active investments, fixed accounts, loans, and cycle schedules in real time.',
      'Our upgraded portal connects directly to our central operations database, ensuring every newly recorded investment plan, Fixed Account deposit, loan approval, and cycle payout schedule appears promptly in your client dashboard.',
      '/assets/aistudio/graph_ddbd7244.jpg',
      'Portfolio growth and digital member tracking dashboard overview',
      '2026-11-10'
    );
    insertUpdate.run(
      'Fixed Account Annual Interest & Loan Equivalency',
      'tip',
      'Earn 7% annual interest on Fixed Accounts and qualify for up to 85% fixed equivalency loans.',
      'Members holding an active Fixed Account benefit from 7% annual interest paid at the end of the fixed duration with zero monthly fees, plus eligibility for a member loan up to 85% of their fixed deposit balance.',
      '/assets/aistudio/partnership_65dac3a6.jpg',
      'Fixed account savings and member financing partnership',
      '2026-11-02'
    );
    insertUpdate.run(
      'Poultry & Hospitality Cycles Open for Q4',
      'event',
      'Operations Team has verified new slots across Poultry Farm and Restaurant Enterprise cycles.',
      'Our Kawempe operations team conducts physical site checks before opening new investment slots. Interested members can submit a slot request online and finalize verification directly with our office.',
      '/assets/aistudio/poultry_4e5861c3.jpg',
      'Poultry farm operation monitored by SHIMOGY operations team',
      '2026-10-24'
    );
    insertUpdate.run(
      'Youth & Guardian-Supervised Savings Guidance',
      'story',
      'How families in Kampala are using structured savings to prepare for school fees and household goals.',
      'With verified parent or legal guardian consent, families can build disciplined savings habits for education and long-term milestones while maintaining full transparency through our Kawempe office.',
      '/assets/aistudio/Namala_406c7774.jpg',
      'SHIMOGY client Namala Florence sharing her savings journey',
      '2026-10-12'
    );
  }

  // Seed Demo Member (so testing Member Dashboard works smoothly too)
  const memberCount = db.prepare('SELECT COUNT(*) as c FROM members').get() as { c: number };
  if (memberCount.c === 0) {
    const info = db.prepare(`
      INSERT INTO members (name, phone, email, group_name, balance, total_invested, status, password_hash, age_verified)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 1)
    `).run(
      'Nansikombi Josephine',
      '0752259416',
      'josephine@example.com',
      'Group 1 - Kawempe Savers',
      750000,
      500000,
      hashPassword('9416')
    );
    const mid = Number(info.lastInsertRowid);
    db.prepare(`
      INSERT INTO investments (member_id, member_phone, member_name, plan_name, amount, expected_return, duration, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(mid, '0752259416', 'Nansikombi Josephine', 'Poultry Farm', 500000, 700000, '60 Days');

    db.prepare(`
      INSERT INTO savings (member_id, member_phone, member_name, account_type, balance, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(mid, '0752259416', 'Nansikombi Josephine', 'Fixed Account', 250000);

    db.prepare(`
      INSERT INTO loans (member_id, member_phone, member_name, amount, purpose, duration, interest_rate, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(mid, '0752259416', 'Nansikombi Josephine', 150000, 'Stock replenishment', '30 days', '10%');

    db.prepare(`
      INSERT INTO member_cycles (member_id, member_phone, member_name, cycle_name, contribution, payout_duration, number_of_members, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(mid, '0752259416', 'Nansikombi Josephine', 'Group 1 - Kawempe Savers', 3000, 'Weekly', 8);
  }
}

seedDatabase();

// Express App Setup
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security & SEO headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Auth Middleware
interface AuthenticatedRequest extends Request {
  authSession?: {
    token: string;
    role: string;
    user_id: number;
    identifier: string;
  };
}

function getSessionFromHeader(req: Request) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const row = db
    .prepare("SELECT token, role, user_id, identifier, expires_at FROM auth_sessions WHERE token = ? AND datetime(expires_at) > datetime('now')")
    .get(token) as { token: string; role: string; user_id: number; identifier: string; expires_at: string } | undefined;
  return row || null;
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const session = getSessionFromHeader(req);
  if (!session || session.role !== 'admin') {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  req.authSession = session;
  next();
}

function requireMemberOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const session = getSessionFromHeader(req);
  if (!session) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  req.authSession = session;
  next();
}

function createSession(role: string, userId: number, identifier: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO auth_sessions (token, role, user_id, identifier, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+7 days'))").run(
    token,
    role,
    userId,
    identifier
  );
  return token;
}

// ============================================================
// PUBLIC API ROUTES
// ============================================================

app.get('/api/health', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/site-data', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const settingsRows = db.prepare('SELECT key, value FROM site_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of settingsRows) settings[row.key] = row.value;

  const heroSlides = db.prepare('SELECT * FROM hero_slides WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
  const testimonials = db.prepare('SELECT * FROM testimonials WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
  const plans = db.prepare('SELECT * FROM investment_plans ORDER BY price ASC, id ASC').all();
  const publicCycles = db.prepare('SELECT * FROM public_cycles ORDER BY id ASC').all();
  const updates = db.prepare("SELECT * FROM updates WHERE status = 'published' ORDER BY published_date DESC, id DESC").all();

  res.json({ settings, heroSlides, testimonials, plans, publicCycles, updates });
});

// Submit service requests (Investments, Savings, Cycle Join, Cycle Proposal, Loans)
app.post('/api/requests', (req, res) => {
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
  const info = db.prepare(`
    INSERT INTO service_requests (request_type, applicant_name, applicant_phone, details_json, age_confirmed, guardian_name, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    String(request_type),
    String(applicant_name).trim(),
    normalizedPhone,
    JSON.stringify(details || {}),
    age_confirmed ? 1 : 0,
    String(guardian_name || '').trim()
  );

  res.status(201).json({ id: Number(info.lastInsertRowid), status: 'pending' });
});

// Submit Data Deletion Request
app.post('/api/deletion-requests', (req, res) => {
  const { full_name, phone, email, reason } = req.body || {};
  if (!full_name || !phone) {
    res.status(400).json({ error: 'Full name and registered phone number are required to verify your deletion request.' });
    return;
  }
  const normalizedPhone = normalizePhone(phone);
  const info = db.prepare(`
    INSERT INTO deletion_requests (full_name, phone, email, reason, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(String(full_name).trim(), normalizedPhone, String(email || '').trim(), String(reason || '').trim());

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    message: 'Your data deletion request has been logged. Our compliance team will process and confirm removal within 72 hours.'
  });
});

// ============================================================
// CLIENT / MEMBER AUTH & DASHBOARD API
// ============================================================

app.post('/api/member/login', (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    res.status(400).json({ error: 'Phone number and password are required.' });
    return;
  }
  const normalized = normalizePhone(phone);
  const member = db
    .prepare('SELECT * FROM members WHERE phone = ? OR phone = ?')
    .get(normalized, String(phone).trim()) as Record<string, any> | undefined;

  if (!member || !verifyPassword(String(password), member.password_hash)) {
    res.status(401).json({ error: 'Invalid phone number or password.' });
    return;
  }

  const token = createSession('member', member.id, member.phone);
  res.json({ token, member: sanitizeMember(member) });
});

function sanitizeMember(member: Record<string, any>) {
  const { password_hash: _ignored, ...rest } = member;
  return rest;
}

function getFullMemberProfile(memberId: number) {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) as Record<string, any> | undefined;
  if (!member) return null;

  const phone = member.phone;
  const investments = db
    .prepare('SELECT * FROM investments WHERE member_id = ? OR member_phone = ? ORDER BY id DESC')
    .all(memberId, phone);
  const savings = db
    .prepare('SELECT * FROM savings WHERE member_id = ? OR member_phone = ? ORDER BY id DESC')
    .all(memberId, phone);
  const loans = db
    .prepare('SELECT * FROM loans WHERE member_id = ? OR member_phone = ? ORDER BY id DESC')
    .all(memberId, phone);
  const cycles = db
    .prepare('SELECT * FROM member_cycles WHERE member_id = ? OR member_phone = ? ORDER BY id DESC')
    .all(memberId, phone);

  return {
    ...sanitizeMember(member),
    investments,
    savings,
    loans,
    cycles
  };
}

app.get('/api/member/me', requireMemberOrAdmin, (req: AuthenticatedRequest, res) => {
  const session = req.authSession!;
  if (session.role !== 'member') {
    res.status(403).json({ error: 'Member session required.' });
    return;
  }
  const profile = getFullMemberProfile(session.user_id);
  if (!profile) {
    res.status(404).json({ error: 'Member account not found.' });
    return;
  }
  res.json({ member: profile });
});

app.post('/api/member/change-password', requireMemberOrAdmin, (req: AuthenticatedRequest, res) => {
  const session = req.authSession!;
  if (session.role !== 'member') {
    res.status(403).json({ error: 'Member session required.' });
    return;
  }
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 4) {
    res.status(400).json({ error: 'Current password and a new password (min 4 chars) are required.' });
    return;
  }
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(session.user_id) as Record<string, any> | undefined;
  if (!member || !verifyPassword(String(currentPassword), member.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }
  db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(hashPassword(String(newPassword)), member.id);
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  const session = getSessionFromHeader(req);
  if (session) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(session.token);
  }
  res.json({ success: true });
});

// ============================================================
// ADMIN AUTH & MANAGEMENT API
// ============================================================

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const admin = db
    .prepare('SELECT * FROM admin_users WHERE lower(email) = lower(?)')
    .get(String(email).trim()) as Record<string, any> | undefined;

  if (!admin || !verifyPassword(String(password), admin.password_hash)) {
    res.status(401).json({ error: 'Invalid admin email or password.' });
    return;
  }

  const token = createSession('admin', admin.id, admin.email);
  res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
});

app.get('/api/admin/me', requireAdmin, (req: AuthenticatedRequest, res) => {
  const admin = db
    .prepare('SELECT id, email, name FROM admin_users WHERE id = ?')
    .get(req.authSession!.user_id);
  res.json({ admin });
});

app.post('/api/admin/change-password', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { newPassword, newEmail } = req.body || {};
  if (newPassword && String(newPassword).length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  if (newEmail) {
    db.prepare('UPDATE admin_users SET email = ? WHERE id = ?').run(String(newEmail).trim().toLowerCase(), req.authSession!.user_id);
  }
  if (newPassword) {
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hashPassword(String(newPassword)), req.authSession!.user_id);
  }
  res.json({ success: true });
});

// Load all data for admin panel
app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const settingsRows = db.prepare('SELECT key, value FROM site_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of settingsRows) settings[row.key] = row.value;

  const members = (db.prepare('SELECT * FROM members ORDER BY id DESC').all() as Record<string, any>[]).map(sanitizeMember);
  const investments = db.prepare('SELECT * FROM investments ORDER BY id DESC').all();
  const savings = db.prepare('SELECT * FROM savings ORDER BY id DESC').all();
  const loans = db.prepare('SELECT * FROM loans ORDER BY id DESC').all();
  const memberCycles = db.prepare('SELECT * FROM member_cycles ORDER BY id DESC').all();
  const plans = db.prepare('SELECT * FROM investment_plans ORDER BY price ASC, id ASC').all();
  const publicCycles = db.prepare('SELECT * FROM public_cycles ORDER BY id ASC').all();
  const updates = db.prepare('SELECT * FROM updates ORDER BY published_date DESC, id DESC').all();
  const heroSlides = db.prepare('SELECT * FROM hero_slides ORDER BY sort_order ASC, id ASC').all();
  const testimonials = db.prepare('SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC').all();
  const requests = db.prepare('SELECT * FROM service_requests ORDER BY id DESC').all();
  const deletionRequests = db.prepare('SELECT * FROM deletion_requests ORDER BY id DESC').all();

  res.json({
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
    deletionRequests
  });
});

// Update site settings
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const updates = req.body || {};
  const stmt = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction((entries: [string, unknown][]) => {
    for (const [k, v] of entries) {
      stmt.run(String(k), String(v ?? ''));
    }
  });
  tx(Object.entries(updates));
  res.json({ success: true });
});

// Serve uploaded image from SQLite database
app.get('/api/media/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT filename, mime_type, data FROM media_files WHERE id = ?').get(id) as
    | { filename: string; mime_type: string; data: Buffer }
    | undefined;
  if (!row) {
    res.status(404).send('Media not found');
    return;
  }
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(row.data);
});

// Image upload endpoint -> stored directly in SQLite database (media_files table)
app.post('/api/admin/upload', requireAdmin, (req, res) => {
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
  const info = db
    .prepare('INSERT INTO media_files (filename, mime_type, data) VALUES (?, ?, ?)')
    .run(safeName, mimeType, buf);
  const mediaId = Number(info.lastInsertRowid);
  res.json({ id: mediaId, url: `/api/media/${mediaId}` });
});

// Hero Slides CRUD
app.post('/api/admin/hero-slides', requireAdmin, (req, res) => {
  const { badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active } = req.body || {};
  if (!title || !subtitle || !image_url) {
    res.status(400).json({ error: 'Title, subtitle, and image URL are required.' });
    return;
  }
  const info = db.prepare(`
    INSERT INTO hero_slides (badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(badge_text || ''),
    String(title).trim(),
    String(subtitle).trim(),
    String(cta_text || 'Explore Plans').trim(),
    String(cta_link || 'investments.html').trim(),
    String(image_url).trim(),
    String(image_alt || title).trim(),
    Number(sort_order || 0),
    is_active === false || is_active === 0 ? 0 : 1
  );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.put('/api/admin/hero-slides/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active } = req.body || {};
  db.prepare(`
    UPDATE hero_slides SET badge_text=?, title=?, subtitle=?, cta_text=?, cta_link=?, image_url=?, image_alt=?, sort_order=?, is_active=?
    WHERE id=?
  `).run(
    String(badge_text || ''),
    String(title || '').trim(),
    String(subtitle || '').trim(),
    String(cta_text || 'Explore Plans').trim(),
    String(cta_link || 'investments.html').trim(),
    String(image_url || '').trim(),
    String(image_alt || title || '').trim(),
    Number(sort_order || 0),
    is_active === false || is_active === 0 ? 0 : 1,
    id
  );
  res.json({ success: true });
});

app.delete('/api/admin/hero-slides/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM hero_slides WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// Testimonials CRUD
app.post('/api/admin/testimonials', requireAdmin, (req, res) => {
  const { client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active } = req.body || {};
  if (!client_name || !quote) {
    res.status(400).json({ error: 'Client name and quote are required.' });
    return;
  }
  const info = db.prepare(`
    INSERT INTO testimonials (client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(client_name).trim(),
    String(role || 'Verified Client').trim(),
    String(location || 'Kampala, Uganda').trim(),
    String(quote).trim(),
    String(photo_url || '/assets/aistudio/josephine_a1a0850e.jpg').trim(),
    String(photo_alt || `Portrait of SHIMOGY client ${client_name}`).trim(),
    Number(sort_order || 0),
    is_active === false || is_active === 0 ? 0 : 1
  );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.put('/api/admin/testimonials/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active } = req.body || {};
  db.prepare(`
    UPDATE testimonials SET client_name=?, role=?, location=?, quote=?, photo_url=?, photo_alt=?, sort_order=?, is_active=?
    WHERE id=?
  `).run(
    String(client_name || '').trim(),
    String(role || 'Verified Client').trim(),
    String(location || 'Kampala, Uganda').trim(),
    String(quote || '').trim(),
    String(photo_url || '/assets/aistudio/josephine_a1a0850e.jpg').trim(),
    String(photo_alt || `Portrait of SHIMOGY client ${client_name}`).trim(),
    Number(sort_order || 0),
    is_active === false || is_active === 0 ? 0 : 1,
    id
  );
  res.json({ success: true });
});

app.delete('/api/admin/testimonials/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM testimonials WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// Members CRUD & Search
app.get('/api/admin/member/:phone', requireAdmin, (req, res) => {
  const normalized = normalizePhone(req.params.phone);
  const member = db
    .prepare('SELECT id FROM members WHERE phone = ? OR phone = ?')
    .get(normalized, req.params.phone) as { id: number } | undefined;
  if (!member) {
    res.status(404).json({ error: 'Member not found.' });
    return;
  }
  res.json({ member: getFullMemberProfile(member.id) });
});

app.post('/api/admin/members', requireAdmin, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const phone = normalizePhone(b.phone || '');
  const password = String(b.password || '').trim();

  if (!name || !phone || !password) {
    res.status(400).json({ error: 'Name, phone, and password are required.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM members WHERE phone = ?').get(phone);
  if (existing) {
    res.status(409).json({ error: 'A member with that phone number already exists.' });
    return;
  }

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO members (name, phone, email, group_name, balance, total_invested, status, password_hash, age_verified, guardian_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      phone,
      String(b.email || '').trim(),
      String(b.group_name || '').trim(),
      Number(b.balance || 0),
      Number(b.total_invested || 0),
      String(b.status || 'active'),
      hashPassword(password),
      b.age_verified === false ? 0 : 1,
      String(b.guardian_name || '').trim()
    );
    const memberId = Number(info.lastInsertRowid);

    // Optional initial investment (fixes PDF Page 8: plans always reflect!)
    if (b.investment && b.investment.plan_name && Number(b.investment.amount) > 0) {
      db.prepare(`
        INSERT INTO investments (member_id, member_phone, member_name, plan_name, amount, expected_return, duration, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        memberId,
        phone,
        name,
        String(b.investment.plan_name).trim(),
        Number(b.investment.amount),
        Number(b.investment.expected_return || b.investment.amount),
        String(b.investment.duration || '30 Days').trim()
      );
    }

    // Optional initial savings (supports Current Account & Fixed Account)
    if (b.savings && b.savings.account_type) {
      db.prepare(`
        INSERT INTO savings (member_id, member_phone, member_name, account_type, balance, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(memberId, phone, name, String(b.savings.account_type).trim(), Number(b.savings.balance || 0));
    }

    // Optional initial loan (fixes PDF Page 8: loans always show when new member created!)
    if (b.loan && Number(b.loan.amount) > 0) {
      db.prepare(`
        INSERT INTO loans (member_id, member_phone, member_name, amount, purpose, duration, interest_rate, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        memberId,
        phone,
        name,
        Number(b.loan.amount),
        String(b.loan.purpose || 'Member Loan').trim(),
        String(b.loan.duration || '30 days').trim(),
        String(b.loan.interest_rate || '10%').trim(),
        String(b.loan.status || 'active').trim()
      );
    }

    // Optional initial cycle (includes payout_duration and number_of_members per PDF Page 9!)
    if (b.cycle && b.cycle.cycle_name) {
      db.prepare(`
        INSERT INTO member_cycles (member_id, member_phone, member_name, cycle_name, contribution, payout_duration, number_of_members, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        memberId,
        phone,
        name,
        String(b.cycle.cycle_name).trim(),
        Number(b.cycle.contribution || 0),
        String(b.cycle.payout_duration || 'Monthly').trim(),
        Number(b.cycle.number_of_members || 10)
      );
    }

    return memberId;
  });

  const memberId = tx();
  res.status(201).json({ id: memberId });
});

app.put('/api/admin/members/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id) as Record<string, any> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Member not found.' });
    return;
  }

  const newPhone = normalizePhone(b.phone || existing.phone);
  const newName = String(b.name || existing.name).trim();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE members SET name=?, phone=?, email=?, group_name=?, balance=?, total_invested=?, status=?
      WHERE id=?
    `).run(
      newName,
      newPhone,
      String(b.email ?? existing.email).trim(),
      String(b.group_name ?? existing.group_name).trim(),
      Number(b.balance ?? existing.balance),
      Number(b.total_invested ?? existing.total_invested),
      String(b.status ?? existing.status),
      id
    );

    if (b.password && String(b.password).trim().length > 0) {
      db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(hashPassword(String(b.password).trim()), id);
    }

    // Keep linked child records synced with updated phone/name
    db.prepare('UPDATE investments SET member_phone = ?, member_name = ? WHERE member_id = ?').run(newPhone, newName, id);
    db.prepare('UPDATE savings SET member_phone = ?, member_name = ? WHERE member_id = ?').run(newPhone, newName, id);
    db.prepare('UPDATE loans SET member_phone = ?, member_name = ? WHERE member_id = ?').run(newPhone, newName, id);
    db.prepare('UPDATE member_cycles SET member_phone = ?, member_name = ? WHERE member_id = ?').run(newPhone, newName, id);
  });

  tx();
  res.json({ success: true });
});

app.delete('/api/admin/members/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const member = db.prepare('SELECT phone FROM members WHERE id = ?').get(id) as { phone: string } | undefined;
  if (!member) {
    res.status(404).json({ error: 'Member not found.' });
    return;
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM investments WHERE member_id = ? OR member_phone = ?').run(id, member.phone);
    db.prepare('DELETE FROM savings WHERE member_id = ? OR member_phone = ?').run(id, member.phone);
    db.prepare('DELETE FROM loans WHERE member_id = ? OR member_phone = ?').run(id, member.phone);
    db.prepare('DELETE FROM member_cycles WHERE member_id = ? OR member_phone = ?').run(id, member.phone);
    db.prepare("DELETE FROM auth_sessions WHERE role = 'member' AND user_id = ?").run(id);
    db.prepare('DELETE FROM members WHERE id = ?').run(id);
  });
  tx();
  res.json({ success: true });
});

// Helper to resolve member_id by phone
function resolveMember(phoneInput: string, fallbackName: string) {
  const phone = normalizePhone(phoneInput);
  const m = db.prepare('SELECT id, name, phone FROM members WHERE phone = ?').get(phone) as
    | { id: number; name: string; phone: string }
    | undefined;
  return {
    memberId: m ? m.id : null,
    memberPhone: m ? m.phone : phone,
    memberName: String(fallbackName || (m ? m.name : '')).trim() || 'Client'
  };
}

// Add / Update / Delete Member Financial Records
app.post('/api/admin/investments', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.member_phone || !b.plan_name || !b.amount) {
    res.status(400).json({ error: 'Member phone, plan name, and amount are required.' });
    return;
  }
  const m = resolveMember(b.member_phone, b.member_name);
  const info = db.prepare(`
    INSERT INTO investments (member_id, member_phone, member_name, plan_name, amount, expected_return, duration, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    m.memberId,
    m.memberPhone,
    m.memberName,
    String(b.plan_name).trim(),
    Number(b.amount),
    Number(b.expected_return || b.amount),
    String(b.duration || '30 Days').trim(),
    String(b.status || 'active')
  );
  if (m.memberId) {
    db.prepare('UPDATE members SET total_invested = total_invested + ? WHERE id = ?').run(Number(b.amount), m.memberId);
  }
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.delete('/api/admin/investments/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM investments WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

app.post('/api/admin/savings', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.member_phone || !b.account_type) {
    res.status(400).json({ error: 'Member phone and account type are required.' });
    return;
  }
  const m = resolveMember(b.member_phone, b.member_name);
  const info = db.prepare(`
    INSERT INTO savings (member_id, member_phone, member_name, account_type, balance, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    m.memberId,
    m.memberPhone,
    m.memberName,
    String(b.account_type).trim(),
    Number(b.balance || 0),
    String(b.status || 'active')
  );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.delete('/api/admin/savings/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM savings WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

app.post('/api/admin/loans', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.member_phone || !b.amount) {
    res.status(400).json({ error: 'Member phone and loan amount are required.' });
    return;
  }
  const m = resolveMember(b.member_phone, b.member_name);
  const info = db.prepare(`
    INSERT INTO loans (member_id, member_phone, member_name, amount, purpose, duration, interest_rate, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    m.memberId,
    m.memberPhone,
    m.memberName,
    Number(b.amount),
    String(b.purpose || '').trim(),
    String(b.duration || '30 days').trim(),
    String(b.interest_rate || '10%').trim(),
    String(b.status || 'active')
  );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.put('/api/admin/loans/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  db.prepare('UPDATE loans SET status = ? WHERE id = ?').run(String(status || 'active'), Number(req.params.id));
  res.json({ success: true });
});

app.delete('/api/admin/loans/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM loans WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

app.post('/api/admin/member-cycles', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.cycle_name) {
    res.status(400).json({ error: 'Cycle name is required.' });
    return;
  }
  const m = resolveMember(b.member_phone || '', b.member_name || '');
  const info = db.prepare(`
    INSERT INTO member_cycles (member_id, member_phone, member_name, cycle_name, contribution, payout_duration, number_of_members, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    m.memberId,
    m.memberPhone,
    m.memberName,
    String(b.cycle_name).trim(),
    Number(b.contribution || 0),
    String(b.payout_duration || 'Monthly').trim(),
    Number(b.number_of_members || 10),
    String(b.status || 'active')
  );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.delete('/api/admin/member-cycles/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM member_cycles WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// Investment Plans CRUD (public catalog)
app.post('/api/admin/plans', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.price) {
    res.status(400).json({ error: 'Plan name and investment price are required.' });
    return;
  }
  const risk = String(b.risk || 'Low');
  const riskLevel = risk === 'High' ? 3 : risk === 'Medium' ? 2 : 1;
  const info = db.prepare(`
    INSERT INTO investment_plans (name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(b.name).trim(),
    Number(b.price),
    Number(b.expected_return || b.price),
    String(b.duration || '30 Days').trim(),
    risk,
    riskLevel,
    String(b.description || '').trim(),
    String(b.image_url || '/assets/aistudio/graph_ddbd7244.jpg').trim(),
    String(b.image_alt || `${b.name} investment plan`).trim(),
    Number(b.slots_left ?? 5),
    String(b.status || 'available'),
    String(b.badge || '').trim()
  );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.put('/api/admin/plans/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = db.prepare('SELECT * FROM investment_plans WHERE id = ?').get(id) as Record<string, any> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Plan not found.' });
    return;
  }
  const risk = String(b.risk ?? existing.risk);
  const riskLevel = risk === 'High' ? 3 : risk === 'Medium' ? 2 : 1;
  db.prepare(`
    UPDATE investment_plans
    SET name=?, price=?, expected_return=?, duration=?, risk=?, risk_level=?, description=?, image_url=?, image_alt=?, slots_left=?, status=?, badge=?
    WHERE id=?
  `).run(
    String(b.name ?? existing.name).trim(),
    Number(b.price ?? existing.price),
    Number(b.expected_return ?? existing.expected_return),
    String(b.duration ?? existing.duration).trim(),
    risk,
    riskLevel,
    String(b.description ?? existing.description).trim(),
    String(b.image_url ?? existing.image_url).trim(),
    String(b.image_alt ?? existing.image_alt).trim(),
    Number(b.slots_left ?? existing.slots_left),
    String(b.status ?? existing.status),
    String(b.badge ?? existing.badge).trim(),
    id
  );
  res.json({ success: true });
});

app.delete('/api/admin/plans/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM investment_plans WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// Public Cycles CRUD (editable from admin just like updates, PDF Page 4 #2!)
app.post('/api/admin/public-cycles', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.contribution) {
    res.status(400).json({ error: 'Cycle name and contribution amount are required.' });
    return;
  }
  const info = db.prepare(`
    INSERT INTO public_cycles (name, contribution, payout_duration, description, image_url, image_alt, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Active')
  `).run(
    String(b.name).trim(),
    Number(b.contribution),
    String(b.payout_duration || 'Monthly').trim(),
    String(b.description || '').trim(),
    String(b.image_url || '/assets/aistudio/partnership_65dac3a6.jpg').trim(),
    String(b.image_alt || `${b.name} savings cycle`).trim()
  );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.put('/api/admin/public-cycles/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = db.prepare('SELECT * FROM public_cycles WHERE id = ?').get(id) as Record<string, any> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Public cycle not found.' });
    return;
  }
  db.prepare(`
    UPDATE public_cycles SET name=?, contribution=?, payout_duration=?, description=?, image_url=?, image_alt=?, status='Active'
    WHERE id=?
  `).run(
    String(b.name ?? existing.name).trim(),
    Number(b.contribution ?? existing.contribution),
    String(b.payout_duration ?? existing.payout_duration).trim(),
    String(b.description ?? existing.description).trim(),
    String(b.image_url ?? existing.image_url).trim(),
    String(b.image_alt ?? existing.image_alt).trim(),
    id
  );
  res.json({ success: true });
});

app.delete('/api/admin/public-cycles/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM public_cycles WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// Updates CRUD
app.post('/api/admin/updates', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.excerpt || !b.detail) {
    res.status(400).json({ error: 'Title, excerpt, and full detail are required.' });
    return;
  }
  const info = db.prepare(`
    INSERT INTO updates (title, category, excerpt, detail, image_url, image_alt, published_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published')
  `).run(
    String(b.title).trim(),
    String(b.category || 'news'),
    String(b.excerpt).trim(),
    String(b.detail).trim(),
    String(b.image_url || '/assets/aistudio/graph_ddbd7244.jpg').trim(),
    String(b.image_alt || b.title).trim(),
    String(b.published_date || new Date().toISOString().split('T')[0])
  );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.delete('/api/admin/updates/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM updates WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// Service Requests status update
app.put('/api/admin/requests/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  db.prepare('UPDATE service_requests SET status = ? WHERE id = ?').run(String(status || 'reviewed'), Number(req.params.id));
  res.json({ success: true });
});

app.delete('/api/admin/requests/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM service_requests WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// Process Data Deletion Request (optionally purge member records cleanly)
app.post('/api/admin/deletion-requests/:id/process', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { action } = req.body || {}; // 'purge' | 'complete' | 'reject'
  const reqRow = db.prepare('SELECT * FROM deletion_requests WHERE id = ?').get(id) as Record<string, any> | undefined;
  if (!reqRow) {
    res.status(404).json({ error: 'Deletion request not found.' });
    return;
  }

  const tx = db.transaction(() => {
    if (action === 'purge') {
      const phone = normalizePhone(reqRow.phone);
      const member = db.prepare('SELECT id, phone FROM members WHERE phone = ?').get(phone) as
        | { id: number; phone: string }
        | undefined;
      if (member) {
        db.prepare('DELETE FROM investments WHERE member_id = ? OR member_phone = ?').run(member.id, member.phone);
        db.prepare('DELETE FROM savings WHERE member_id = ? OR member_phone = ?').run(member.id, member.phone);
        db.prepare('DELETE FROM loans WHERE member_id = ? OR member_phone = ?').run(member.id, member.phone);
        db.prepare('DELETE FROM member_cycles WHERE member_id = ? OR member_phone = ?').run(member.id, member.phone);
        db.prepare("DELETE FROM auth_sessions WHERE role = 'member' AND user_id = ?").run(member.id);
        db.prepare('DELETE FROM members WHERE id = ?').run(member.id);
      }
      db.prepare('DELETE FROM service_requests WHERE applicant_phone = ?').run(phone);
      db.prepare("UPDATE deletion_requests SET status = 'completed', processed_at = datetime('now') WHERE id = ?").run(id);
    } else if (action === 'reject') {
      db.prepare("UPDATE deletion_requests SET status = 'rejected', processed_at = datetime('now') WHERE id = ?").run(id);
    } else {
      db.prepare("UPDATE deletion_requests SET status = 'completed', processed_at = datetime('now') WHERE id = ?").run(id);
    }
  });

  tx();
  res.json({ success: true });
});

// ============================================================
// FRONTEND SERVING (Vite dev middleware or Production static)
// ============================================================

async function startServer() {
  // Serve uploaded images directly
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
    console.log(`SHIMOGY Investment Group server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
