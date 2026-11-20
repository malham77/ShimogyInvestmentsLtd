-- ============================================================================
-- SHIMOGY Investment Group Ltd - Supabase PostgreSQL Schema & Full Data Export
-- Generated: 2026-11-20T10:21:05.465Z
-- Project URL: https://ihgfsvkcpgxklotjmokl.supabase.co
-- Instructions: Paste and run this file in your Supabase SQL Editor.
-- ============================================================================

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

ALTER TABLE investments ADD COLUMN IF NOT EXISTS returns_date TEXT NOT NULL DEFAULT '';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS return_date TEXT NOT NULL DEFAULT '';
ALTER TABLE member_cycles ADD COLUMN IF NOT EXISTS cycle_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE member_cycles ADD COLUMN IF NOT EXISTS cycle_type TEXT NOT NULL DEFAULT 'public';

-- Exported Table Rows

-- site_settings (25 rows)
INSERT INTO site_settings (key, value) VALUES ('about_mission', 'To offer smart and profitable investment opportunities with simplified financial solutions to all our local and international clients.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('about_story', 'SHIMOGY Investment Group Ltd is a Kampala-based investment and community savings organization operating from Kawempe Tula. Founded in 2023, we structure local business ventures, savings accounts, rotating community cycles, and client financing with transparent reporting.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('about_vision', 'To lead a positive financial transformation through smart investments and simplified financial solutions across the globe.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('address', 'Kawempe Tula, Kampala, Uganda') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('age_consent_policy', 'Account holders must be at least 18 years old. Savings accounts for minors under 18 require verified parent or legal guardian consent and supervision.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('company_name', 'SHIMOGY Investment Group Ltd') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('email', 'shimogygroup@gmail.com') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('logo_url', '/assets/aistudio/logo2_be71428a.jpg') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('phone_primary', '+256 752 259 416') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('phone_secondary', '+256 746 788 042') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('quick_updates_ticker', 'Welcome to SHIMOGY Investment Group Ltd — Explore active community savings cycles, structured investment plans, and client accounts in Kawempe Tula, Kampala. Contact Operations via WhatsApp for daily guidance.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('registration_info', 'Registered Investment & Community Savings Group | Kawempe Tula, Kampala, Uganda') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('risk_disclosure', 'All investments carry operational and market risk. Projected returns are estimates based on business cycle performance and are not unconditionally guaranteed.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('short_name', 'SHIMOGY') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('slogan', 'Partners for Life') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('social_facebook', 'https://www.facebook.com/share/r/1CR2Q4xdwC/') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('social_instagram', 'https://www.instagram.com/shimogygroup') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('social_tiktok', 'https://tiktok.com/@shimogygroup.com') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('social_youtube', 'https://youtube.com/@shimogygroup') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('stats_capital', 'UGX 50M+') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('stats_hours', 'Mon - Sat, 8AM - 6PM') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('stats_members', '200+') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('stats_years', 'Since 2023') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('whatsapp_number', '256752259416') ON CONFLICT DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('working_hours', 'Monday - Saturday: 8:00 AM - 6:00 PM EAT (Sunday: Closed)') ON CONFLICT DO NOTHING;

-- admin_users (4 rows)
INSERT INTO admin_users (id, email, name, password_hash, created_at) VALUES (1, 'admin@gmail.com', 'SHIMOGY Administrator', '9b640a527eb206bb30fefeab7e7b4b88:65a3da301e219dcee3f64a3267140179c280462a7a8c8eb8bcba38aaed9fc28dded5b4dabdf1a2c7758957c7348d55f88330dd2c277d79bb9938bff9bffcbb4a', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO admin_users (id, email, name, password_hash, created_at) VALUES (2, 'maleham06@gmail.com', 'SHIMOGY Administrator', 'db9db7f68ae737eb9314fdbe0888e503:37679bd3d4505a4fed5aac1e4150b351088cc6a77aff5cb70e003182c43c6d57e4c581a4453a420f89405bdbc18eeb846b507bde4b89f89e2d00c354287c3497', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO admin_users (id, email, name, password_hash, created_at) VALUES (3, 'mal77ham@gmail.com', 'SHIMOGY Administrator', 'cbb009e7bb1283bcd67876f059ec0e6d:74156ea4267cc9a56360d143182170e39c47a470fab83fc6be82ed3a80eca54d5cc4869179ca2cf3694c90a92bbd4a325a852b8e32b35dfce487c7042b5207e4', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO admin_users (id, email, name, password_hash, created_at) VALUES (4, 'admin@shimogy.com', 'SHIMOGY Administrator', 'd23ca7175dfc05dbb95b04dcb28d9ea7:09f369056ff3c7527b8a301c8f4e548797e40aa26a583cab8d96ff975e15529a88257dcc45ae9e9b8948ec27e833d60e26566cb241111875bd60dade4fa7d226', '2026-11-20 09:46:13') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('admin_users', 'id'), COALESCE((SELECT MAX(id) FROM admin_users), 1));

-- hero_slides (3 rows)
INSERT INTO hero_slides (id, badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active) VALUES (1, 'Kawempe Tula, Kampala · Established 2023', 'Structured Investments for Steady Financial Growth', 'Participate in vetted local business ventures, transparent savings accounts, and community saving cycles managed by our Kampala operations team.', 'Explore Investment Plans', 'investments.html', '/assets/aistudio/partnership_65dac3a6.jpg', 'Business partners shaking hands over a structured investment partnership agreement', 1, 1) ON CONFLICT DO NOTHING;
INSERT INTO hero_slides (id, badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active) VALUES (2, 'Transparent Portfolio Tracking', 'Real-Time Visibility Into Every Shilling You Invest', 'Monitor your active plans, fixed savings accounts, cycle schedules, and loan balances from your secure client portal at any time.', 'Open Client Portal', 'dashboard.html', '/assets/aistudio/graph_ddbd7244.jpg', 'Financial growth chart and portfolio analytics presentation', 2, 1) ON CONFLICT DO NOTHING;
INSERT INTO hero_slides (id, badge_text, title, subtitle, cta_text, cta_link, image_url, image_alt, sort_order, is_active) VALUES (3, 'Community & Enterprise Financing', 'Savings Accounts and Rotating Cycles Built on Trust', 'Choose a flexible Current Account, earn 7% annual interest on a Fixed Account, or join a structured community savings cycle.', 'View Savings Options', 'savings.html', '/assets/aistudio/restaurant_ad866c9e.jpg', 'Active Ugandan hospitality venture supported by SHIMOGY Investment Group', 3, 1) ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('hero_slides', 'id'), COALESCE((SELECT MAX(id) FROM hero_slides), 1));

-- testimonials (3 rows)
INSERT INTO testimonials (id, client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active) VALUES (1, 'Nansikombi Josephine', 'Verified Client', 'Kampala, Uganda', 'Shimogy Investment Group has helped me work toward my financial goals through structured investment opportunities and fair lending terms.', '/assets/aistudio/josephine_a1a0850e.jpg', 'Portrait of SHIMOGY client Nansikombi Josephine outdoors in Kampala', 1, 1) ON CONFLICT DO NOTHING;
INSERT INTO testimonials (id, client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active) VALUES (2, 'Namala Florence', 'Verified Client', 'Mbarara, Uganda', 'I save with Shimogy Investment Group from Mbarara. The structured savings cycles helped me build consistent saving habits.', '/assets/aistudio/Namala_406c7774.jpg', 'Portrait of SHIMOGY client Namala Florence at a local retail outlet', 2, 1) ON CONFLICT DO NOTHING;
INSERT INTO testimonials (id, client_name, role, location, quote, photo_url, photo_alt, sort_order, is_active) VALUES (3, 'Mbabali Patrick', 'Verified Investor', 'Kawempe, Kampala', 'Transparency is what sets SHIMOGY apart. My client dashboard reflects every contribution clearly, and I have reinvested across multiple cycles.', '/assets/aistudio/patrick_ebf0c1be.jpg', 'Portrait of SHIMOGY investor Mbabali Patrick', 3, 1) ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('testimonials', 'id'), COALESCE((SELECT MAX(id) FROM testimonials), 1));

-- investment_plans (6 rows)
INSERT INTO investment_plans (id, name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge, created_at) VALUES (1, 'Men''s Hair Salon', 200000, 250000, '30 Days', 'Low', 1, 'Participate in an active Kampala grooming and barbershop enterprise with consistent daily customer flow.', '/assets/aistudio/saloon_90076cb0.jpg', 'Modern men''s hair salon interior with barber stations and mirrors', 5, 'available', 'New', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO investment_plans (id, name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge, created_at) VALUES (2, 'Poultry Farm', 500000, 700000, '60 Days', 'Low', 1, 'Structured agricultural cycle supporting managed poultry production and regional supply.', '/assets/aistudio/poultry_4e5861c3.jpg', 'Managed poultry farm housing healthy laying hens in Uganda', 3, 'available', 'Popular', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO investment_plans (id, name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge, created_at) VALUES (3, 'Restaurant Enterprise', 500000, 700000, '45 Days', 'Medium', 2, 'Working capital allocation for established catering and dining operations in Kampala.', '/assets/aistudio/restaurant_ad866c9e.jpg', 'Prepared dining tables at an outdoor restaurant venue', 4, 'available', 'Trending', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO investment_plans (id, name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge, created_at) VALUES (4, 'Grocery Store', 800000, 1200000, '60 Days', 'Medium', 2, 'Inventory expansion for high-turnover fresh produce and household grocery retail.', '/assets/aistudio/grocery_3e5981e4.PNG', 'Fresh produce and grocery retail store display shelves', 2, 'available', 'Featured', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO investment_plans (id, name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge, created_at) VALUES (5, 'Transport Business', 1000000, 1500000, '90 Days', 'High', 3, 'Commercial passenger and logistics vehicle operations along high-demand Kampala corridors.', '/assets/aistudio/transport_459a1a5e.jpg', 'Commercial passenger transport vehicles operating in Kampala', 1, 'available', 'Trending', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO investment_plans (id, name, price, expected_return, duration, risk, risk_level, description, image_url, image_alt, slots_left, status, badge, created_at) VALUES (6, 'Modern Construction', 2500000, 3500000, '120 Days', 'Low', 1, 'Materials supply and project financing for vetted residential and commercial construction contracts.', '/assets/aistudio/partnership_65dac3a6.jpg', 'Project partnership agreement for commercial development', 2, 'available', '', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('investment_plans', 'id'), COALESCE((SELECT MAX(id) FROM investment_plans), 1));

-- public_cycles (4 rows)
INSERT INTO public_cycles (id, name, contribution, payout_duration, description, image_url, image_alt, status, created_at) VALUES (1, 'Group 1 - Kawempe Savers', 3000, 'Weekly', 'Accessible entry-level weekly contribution cycle designed for steady community saving.', '/assets/aistudio/partnership_65dac3a6.jpg', 'Kawempe Savers community savings cycle partnership', 'Active', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO public_cycles (id, name, contribution, payout_duration, description, image_url, image_alt, status, created_at) VALUES (2, 'Group 2 - Weekly Builders', 5000, 'Weekly', 'Weekly group savings cycle helping clients accumulate capital for personal projects.', '/assets/aistudio/graph_ddbd7244.jpg', 'Weekly Builders financial planning and savings progress chart', 'Active', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO public_cycles (id, name, contribution, payout_duration, description, image_url, image_alt, status, created_at) VALUES (3, 'Group 3 - Bwaise United', 10000, 'Weekly', 'Mid-tier rotational savings circle tailored for small business owners and traders.', '/assets/aistudio/grocery_3e5981e4.PNG', 'Bwaise United small business traders savings group', 'Active', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
INSERT INTO public_cycles (id, name, contribution, payout_duration, description, image_url, image_alt, status, created_at) VALUES (4, 'Group 4 - Kampala Trust', 50000, 'Monthly', 'Monthly structured contribution cycle for larger target payouts and business expansion.', '/assets/aistudio/restaurant_ad866c9e.jpg', 'Kampala Trust monthly savings circle', 'Active', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('public_cycles', 'id'), COALESCE((SELECT MAX(id) FROM public_cycles), 1));

-- updates (4 rows)
INSERT INTO updates (id, title, category, excerpt, detail, image_url, image_alt, published_date, status) VALUES (1, 'New Client Portal & Transparent Portfolio Tracking', 'news', 'Clients can now view active investments, fixed accounts, loans, and cycle schedules in real time.', 'Our upgraded portal connects directly to our central operations database, ensuring every newly recorded investment plan, Fixed Account deposit, loan approval, and cycle payout schedule appears promptly in your client dashboard.', '/assets/aistudio/graph_ddbd7244.jpg', 'Portfolio growth and digital client tracking dashboard overview', '2026-11-10', 'published') ON CONFLICT DO NOTHING;
INSERT INTO updates (id, title, category, excerpt, detail, image_url, image_alt, published_date, status) VALUES (2, 'Fixed Account Annual Interest & Loan Equivalency', 'tip', 'Earn 7% annual interest on Fixed Accounts and qualify for up to 85% fixed equivalency loans.', 'Clients holding an active Fixed Account benefit from 7% annual interest paid at the end of the fixed duration with zero monthly fees, plus eligibility for a client loan up to 85% of their fixed deposit balance.', '/assets/aistudio/partnership_65dac3a6.jpg', 'Fixed account savings and client financing partnership', '2026-11-02', 'published') ON CONFLICT DO NOTHING;
INSERT INTO updates (id, title, category, excerpt, detail, image_url, image_alt, published_date, status) VALUES (3, 'Poultry & Hospitality Cycles Open for Q4', 'event', 'Operations Team has verified new slots across Poultry Farm and Restaurant Enterprise cycles.', 'Our Kawempe operations team conducts physical site checks before opening new investment slots. Interested clients can submit a slot request online and finalize verification directly with our office.', '/assets/aistudio/poultry_4e5861c3.jpg', 'Poultry farm operation monitored by SHIMOGY operations team', '2026-10-24', 'published') ON CONFLICT DO NOTHING;
INSERT INTO updates (id, title, category, excerpt, detail, image_url, image_alt, published_date, status) VALUES (4, 'Youth & Guardian-Supervised Savings Guidance', 'story', 'How families in Kampala are using structured savings to prepare for school fees and household goals.', 'With verified parent or legal guardian consent, families can build disciplined savings habits for education and long-term milestones while maintaining full transparency through our Kawempe office.', '/assets/aistudio/Namala_406c7774.jpg', 'SHIMOGY client Namala Florence sharing her savings journey', '2026-10-12', 'published') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('updates', 'id'), COALESCE((SELECT MAX(id) FROM updates), 1));

-- members (1 rows)
INSERT INTO members (id, name, phone, email, group_name, balance, total_invested, status, password_hash, age_verified, guardian_name, created_at) VALUES (1, 'Nansikombi Josephine', '0752259416', 'josephine@example.com', 'Group 1 - Kawempe Savers', 750000, 500000, 'active', '6e5b3cf9036bc88daa64af30292707bd:1d80764d579efc8a6fd6860c65f950a801b3d945f8aa807ecf9cc53e20d33b35fb1ba3dfdfeeb382a2fd49c70055070e0efb24887a1718ec524b374242927798', 1, '', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('members', 'id'), COALESCE((SELECT MAX(id) FROM members), 1));

-- investments (1 rows)
INSERT INTO investments (id, member_id, member_phone, member_name, plan_name, amount, expected_return, duration, returns_date, status, created_at) VALUES (1, 1, '0752259416', 'Nansikombi Josephine', 'Poultry Farm', 500000, 700000, '60 Days', '2027-01-19', 'active', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('investments', 'id'), COALESCE((SELECT MAX(id) FROM investments), 1));

-- savings (1 rows)
INSERT INTO savings (id, member_id, member_phone, member_name, account_type, balance, open_date, status, created_at) VALUES (1, 1, '0752259416', 'Nansikombi Josephine', 'Fixed Account', 250000, '2026-11-20', 'Locked', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('savings', 'id'), COALESCE((SELECT MAX(id) FROM savings), 1));

-- loans (1 rows)
INSERT INTO loans (id, member_id, member_phone, member_name, amount, purpose, duration, interest_rate, status, request_date, return_date, created_at) VALUES (1, 1, '0752259416', 'Nansikombi Josephine', 150000, 'Stock replenishment', '30 days', '10%', 'active', '2026-11-20', '2026-12-20', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('loans', 'id'), COALESCE((SELECT MAX(id) FROM loans), 1));

-- member_cycles (1 rows)
INSERT INTO member_cycles (id, member_id, member_phone, member_name, cycle_name, contribution, payout_duration, number_of_members, cycle_number, cycle_type, join_date, status, created_at) VALUES (1, 1, '0752259416', 'Nansikombi Josephine', 'Group 1 - Kawempe Savers', 3000, 'Weekly', 8, 3, 'public', '2026-11-20', 'active', '2026-11-20 09:44:56') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('member_cycles', 'id'), COALESCE((SELECT MAX(id) FROM member_cycles), 1));

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
