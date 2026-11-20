/* Standalone Offline & Static Host Database Fallback Engine
   Automatically powers SHIMOGY Investment Group on:
   - Local computer (file://) without installing Node or any server
   - Cloudflare Pages / GitHub Pages / Netlify static hosting
   - Seamless passthrough to live Express + SQLite (/api/*) when available */
(function () {
  'use strict';

  var DB_KEY = 'shimogy_standalone_db_v1';
  var memoryDbJson = '';

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function nowISO() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  function addDaysToISO(baseDateStr, daysToAdd) {
    var clean = String(baseDateStr || '').slice(0, 10);
    var base = /^\d{4}-\d{2}-\d{2}$/.test(clean) ? new Date(clean + 'T00:00:00Z') : new Date();
    if (isNaN(base.getTime())) base = new Date();
    base.setUTCDate(base.getUTCDate() + Number(daysToAdd || 0));
    return base.toISOString().split('T')[0];
  }

  function parseDurationDays(durationText, fallbackDays) {
    var s = String(durationText || '').toLowerCase();
    var m = s.match(/(\d+)/);
    var n = m ? Number(m[1]) : 0;
    if (s.indexOf('year') !== -1) return (n || 1) * 365;
    if (s.indexOf('month') !== -1) return (n || 1) * 30;
    if (s.indexOf('bi-week') !== -1) return 14;
    if (s.indexOf('week') !== -1) return (n || 1) * 7;
    if (s.indexOf('daily') !== -1) return 1;
    if (n > 0) return n;
    return fallbackDays || 30;
  }

  function computeReturnsDate(startDate, duration, explicitDate) {
    var given = String(explicitDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(given)) return given;
    return addDaysToISO(startDate || todayISO(), parseDurationDays(duration, 60));
  }

  function computeLoanReturnDate(requestDate, duration, explicitDate) {
    var given = String(explicitDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(given)) return given;
    return addDaysToISO(requestDate || todayISO(), parseDurationDays(duration, 30));
  }

  function normalizeSavingsStatus(accountType, requestedStatus) {
    var raw = String(requestedStatus || '').trim().toLowerCase();
    if (raw === 'suspended' || raw === 'closed') return requestedStatus;
    if (String(accountType || '').toLowerCase().indexOf('fixed') !== -1) return 'Locked';
    return 'Available';
  }

  function sanitizeUrl(url, fallback) {
    var clean = String(url || '').trim();
    if (!clean) return fallback || '';
    var lower = clean.toLowerCase().replace(/[\u0000-\u001F\u007F\s]+/g, '');
    if (
      lower.indexOf('javascript:') === 0 ||
      lower.indexOf('vbscript:') === 0 ||
      lower.indexOf('data:text/') === 0 ||
      lower.indexOf('data:application/') === 0
    ) {
      return fallback || '';
    }
    if (
      clean.indexOf('/') === 0 ||
      clean.indexOf('assets/') === 0 ||
      clean.indexOf('https://') === 0 ||
      clean.indexOf('http://') === 0 ||
      clean.indexOf('data:image/') === 0 ||
      /^[a-zA-Z0-9._-]+\.html([#?].*)?$/.test(clean)
    ) {
      return clean;
    }
    return fallback || '';
  }

  function normalizePhone(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (digits.indexOf('256') === 0 && digits.length >= 12) {
      return '0' + digits.slice(3);
    }
    return digits || String(phone || '').trim();
  }

  function createSeedDb() {
    return {
      nextId: 100,
      settings: {
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
        logo_url: 'assets/aistudio/logo2_be71428a.jpg',
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
      },
      admins: [
        { id: 1, email: 'admin@shimogy.com', name: 'SHIMOGY Administrator', pass: 'shimogy123' },
        { id: 2, email: 'maleham06@gmail.com', name: 'SHIMOGY Administrator', pass: 'shimogy123' },
        { id: 3, email: 'mal77ham@gmail.com', name: 'SHIMOGY Administrator', pass: 'shimogy123' }
      ],
      sessions: {},
      heroSlides: [
        {
          id: 1,
          badge_text: 'Kawempe Tula, Kampala · Established 2023',
          title: 'Structured Investments for Steady Financial Growth',
          subtitle: 'Participate in vetted local business ventures, transparent savings accounts, and community saving cycles managed by our Kampala operations team.',
          cta_text: 'Explore Investment Plans',
          cta_link: 'investments.html',
          image_url: 'assets/aistudio/partnership_65dac3a6.jpg',
          image_alt: 'Business partners shaking hands over a structured investment partnership agreement',
          sort_order: 1,
          is_active: 1
        },
        {
          id: 2,
          badge_text: 'Transparent Portfolio Tracking',
          title: 'Real-Time Visibility Into Every Shilling You Invest',
          subtitle: 'Monitor your active plans, fixed savings accounts, cycle schedules, and loan balances from your secure client portal at any time.',
          cta_text: 'Open Client Portal',
          cta_link: 'dashboard.html',
          image_url: 'assets/aistudio/graph_ddbd7244.jpg',
          image_alt: 'Financial growth chart and portfolio analytics presentation',
          sort_order: 2,
          is_active: 1
        },
        {
          id: 3,
          badge_text: 'Community & Enterprise Financing',
          title: 'Savings Accounts and Rotating Cycles Built on Trust',
          subtitle: 'Choose a flexible Current Account, earn 7% annual interest on a Fixed Account, or join a structured community savings cycle.',
          cta_text: 'View Savings Options',
          cta_link: 'savings.html',
          image_url: 'assets/aistudio/restaurant_ad866c9e.jpg',
          image_alt: 'Active Ugandan hospitality venture supported by SHIMOGY Investment Group',
          sort_order: 3,
          is_active: 1
        }
      ],
      testimonials: [
        {
          id: 1,
          client_name: 'Nansikombi Josephine',
          role: 'Verified Client',
          location: 'Kampala, Uganda',
          quote: 'Shimogy Investment Group has helped me work toward my financial goals through structured investment opportunities and fair lending terms.',
          photo_url: 'assets/aistudio/josephine_a1a0850e.jpg',
          photo_alt: 'Portrait of SHIMOGY client Nansikombi Josephine outdoors in Kampala',
          sort_order: 1,
          is_active: 1
        },
        {
          id: 2,
          client_name: 'Namala Florence',
          role: 'Verified Client',
          location: 'Mbarara, Uganda',
          quote: 'I save with Shimogy Investment Group from Mbarara. The structured savings cycles helped me build consistent saving habits.',
          photo_url: 'assets/aistudio/Namala_406c7774.jpg',
          photo_alt: 'Portrait of SHIMOGY client Namala Florence at a local retail outlet',
          sort_order: 2,
          is_active: 1
        },
        {
          id: 3,
          client_name: 'Mbabali Patrick',
          role: 'Verified Investor',
          location: 'Kawempe, Kampala',
          quote: 'Transparency is what sets SHIMOGY apart. My client dashboard reflects every contribution clearly, and I have reinvested across multiple cycles.',
          photo_url: 'assets/aistudio/patrick_ebf0c1be.jpg',
          photo_alt: 'Portrait of SHIMOGY investor Mbabali Patrick',
          sort_order: 3,
          is_active: 1
        }
      ],
      plans: [
        {
          id: 1,
          name: "Men's Hair Salon",
          price: 200000,
          expected_return: 250000,
          duration: '30 Days',
          risk: 'Low',
          risk_level: 1,
          description: 'Participate in an active Kampala grooming and barbershop enterprise with consistent daily customer flow.',
          image_url: 'assets/aistudio/saloon_90076cb0.jpg',
          image_alt: "Modern men's hair salon interior with barber stations and mirrors",
          slots_left: 5,
          status: 'available',
          badge: 'New'
        },
        {
          id: 2,
          name: 'Poultry Farm',
          price: 500000,
          expected_return: 700000,
          duration: '60 Days',
          risk: 'Low',
          risk_level: 1,
          description: 'Structured agricultural cycle supporting managed poultry production and regional supply.',
          image_url: 'assets/aistudio/poultry_4e5861c3.jpg',
          image_alt: 'Managed poultry farm housing healthy laying hens in Uganda',
          slots_left: 3,
          status: 'available',
          badge: 'Popular'
        },
        {
          id: 3,
          name: 'Restaurant Enterprise',
          price: 500000,
          expected_return: 700000,
          duration: '45 Days',
          risk: 'Medium',
          risk_level: 2,
          description: 'Working capital allocation for established catering and dining operations in Kampala.',
          image_url: 'assets/aistudio/restaurant_ad866c9e.jpg',
          image_alt: 'Prepared dining tables at an outdoor restaurant venue',
          slots_left: 4,
          status: 'available',
          badge: 'Trending'
        },
        {
          id: 4,
          name: 'Grocery Store',
          price: 800000,
          expected_return: 1200000,
          duration: '60 Days',
          risk: 'Medium',
          risk_level: 2,
          description: 'Inventory expansion for high-turnover fresh produce and household grocery retail.',
          image_url: 'assets/aistudio/grocery_3e5981e4.PNG',
          image_alt: 'Fresh produce and grocery retail store display shelves',
          slots_left: 2,
          status: 'available',
          badge: 'Featured'
        },
        {
          id: 5,
          name: 'Transport Business',
          price: 1000000,
          expected_return: 1500000,
          duration: '90 Days',
          risk: 'High',
          risk_level: 3,
          description: 'Commercial passenger and logistics vehicle operations along high-demand Kampala corridors.',
          image_url: 'assets/aistudio/transport_459a1a5e.jpg',
          image_alt: 'Commercial passenger transport vehicles operating in Kampala',
          slots_left: 1,
          status: 'available',
          badge: 'Trending'
        },
        {
          id: 6,
          name: 'Modern Construction',
          price: 2500000,
          expected_return: 3500000,
          duration: '120 Days',
          risk: 'Low',
          risk_level: 1,
          description: 'Materials supply and project financing for vetted residential and commercial construction contracts.',
          image_url: 'assets/aistudio/partnership_65dac3a6.jpg',
          image_alt: 'Project partnership agreement for commercial development',
          slots_left: 2,
          status: 'available',
          badge: ''
        }
      ],
      publicCycles: [
        {
          id: 1,
          name: 'Group 1 - Kawempe Savers',
          contribution: 3000,
          payout_duration: 'Weekly',
          description: 'Accessible entry-level weekly contribution cycle designed for steady community saving.',
          image_url: 'assets/aistudio/partnership_65dac3a6.jpg',
          image_alt: 'Kawempe Savers community savings cycle partnership',
          status: 'Active'
        },
        {
          id: 2,
          name: 'Group 2 - Weekly Builders',
          contribution: 5000,
          payout_duration: 'Weekly',
          description: 'Weekly group savings cycle helping clients accumulate capital for personal projects.',
          image_url: 'assets/aistudio/graph_ddbd7244.jpg',
          image_alt: 'Weekly Builders financial planning and savings progress chart',
          status: 'Active'
        },
        {
          id: 3,
          name: 'Group 3 - Bwaise United',
          contribution: 10000,
          payout_duration: 'Weekly',
          description: 'Mid-tier rotational savings circle tailored for small business owners and traders.',
          image_url: 'assets/aistudio/grocery_3e5981e4.PNG',
          image_alt: 'Bwaise United small business traders savings group',
          status: 'Active'
        },
        {
          id: 4,
          name: 'Group 4 - Kampala Trust',
          contribution: 50000,
          payout_duration: 'Monthly',
          description: 'Monthly structured contribution cycle for larger target payouts and business expansion.',
          image_url: 'assets/aistudio/restaurant_ad866c9e.jpg',
          image_alt: 'Kampala Trust monthly savings circle',
          status: 'Active'
        }
      ],
      updates: [
        {
          id: 1,
          title: 'New Client Portal & Transparent Portfolio Tracking',
          category: 'news',
          excerpt: 'Clients can now view active investments, fixed accounts, loans, and cycle schedules in real time.',
          detail: 'Our upgraded portal connects directly to our central operations database, ensuring every newly recorded investment plan, Fixed Account deposit, loan approval, and cycle payout schedule appears promptly in your client dashboard.',
          image_url: 'assets/aistudio/graph_ddbd7244.jpg',
          image_alt: 'Portfolio growth and digital client tracking dashboard overview',
          published_date: '2026-11-10',
          status: 'published'
        },
        {
          id: 2,
          title: 'Fixed Account Annual Interest & Loan Equivalency',
          category: 'tip',
          excerpt: 'Earn 7% annual interest on Fixed Accounts and qualify for up to 85% fixed equivalency loans.',
          detail: 'Clients holding an active Fixed Account benefit from 7% annual interest paid at the end of the fixed duration with zero monthly fees, plus eligibility for a client loan up to 85% of their fixed deposit balance.',
          image_url: 'assets/aistudio/partnership_65dac3a6.jpg',
          image_alt: 'Fixed account savings and client financing partnership',
          published_date: '2026-11-02',
          status: 'published'
        },
        {
          id: 3,
          title: 'Poultry & Hospitality Cycles Open for Q4',
          category: 'event',
          excerpt: 'Operations Team has verified new slots across Poultry Farm and Restaurant Enterprise cycles.',
          detail: 'Our Kawempe operations team conducts physical site checks before opening new investment slots. Interested clients can submit a slot request online and finalize verification directly with our office.',
          image_url: 'assets/aistudio/poultry_4e5861c3.jpg',
          image_alt: 'Poultry farm operation monitored by SHIMOGY operations team',
          published_date: '2026-10-24',
          status: 'published'
        },
        {
          id: 4,
          title: 'Youth & Guardian-Supervised Savings Guidance',
          category: 'story',
          excerpt: 'How families in Kampala are using structured savings to prepare for school fees and household goals.',
          detail: 'With verified parent or legal guardian consent, families can build disciplined savings habits for education and long-term milestones while maintaining full transparency through our Kawempe office.',
          image_url: 'assets/aistudio/Namala_406c7774.jpg',
          image_alt: 'SHIMOGY client Namala Florence sharing her savings journey',
          published_date: '2026-10-12',
          status: 'published'
        }
      ],
      members: [
        {
          id: 1,
          name: 'Nansikombi Josephine',
          phone: '0752259416',
          email: 'josephine@example.com',
          group_name: 'Group 1 - Kawempe Savers',
          balance: 750000,
          total_invested: 500000,
          status: 'active',
          pass: '9416',
          age_verified: 1,
          guardian_name: ''
        }
      ],
      investments: [
        {
          id: 1,
          member_id: 1,
          member_phone: '0752259416',
          member_name: 'Nansikombi Josephine',
          plan_name: 'Poultry Farm',
          amount: 500000,
          expected_return: 700000,
          duration: '60 Days',
          returns_date: addDaysToISO(todayISO(), 45),
          status: 'active',
          created_at: '2026-10-15 10:00:00'
        }
      ],
      savings: [
        {
          id: 1,
          member_id: 1,
          member_phone: '0752259416',
          member_name: 'Nansikombi Josephine',
          account_type: 'Fixed Account',
          balance: 250000,
          open_date: '2026-09-20',
          status: 'Locked',
          created_at: '2026-09-20 09:00:00'
        }
      ],
      loans: [
        {
          id: 1,
          member_id: 1,
          member_phone: '0752259416',
          member_name: 'Nansikombi Josephine',
          amount: 150000,
          purpose: 'Stock replenishment',
          duration: '30 days',
          interest_rate: '10%',
          status: 'active',
          request_date: todayISO(),
          return_date: addDaysToISO(todayISO(), 21),
          created_at: nowISO()
        }
      ],
      memberCycles: [
        {
          id: 1,
          member_id: 1,
          member_phone: '0752259416',
          member_name: 'Nansikombi Josephine',
          cycle_name: 'Group 1 - Kawempe Savers',
          contribution: 3000,
          payout_duration: 'Weekly',
          number_of_members: 8,
          cycle_number: 4,
          cycle_type: 'public',
          join_date: addDaysToISO(todayISO(), -14),
          status: 'active',
          created_at: nowISO()
        }
      ],
      requests: [],
      deletionRequests: []
    };
  }

  function normalizeLoadedDb(db) {
    if (Array.isArray(db.investments)) {
      db.investments.forEach(function (inv) {
        if (!inv.returns_date) inv.returns_date = computeReturnsDate(inv.created_at || todayISO(), inv.duration || '60 Days');
      });
    }
    if (Array.isArray(db.savings)) {
      db.savings.forEach(function (sav) {
        sav.status = normalizeSavingsStatus(sav.account_type, sav.status);
      });
    }
    if (Array.isArray(db.loans)) {
      db.loans.forEach(function (ln) {
        if (!ln.return_date) ln.return_date = computeLoanReturnDate(ln.request_date || todayISO(), ln.duration || '30 days');
      });
    }
    if (Array.isArray(db.memberCycles)) {
      db.memberCycles.forEach(function (cy) {
        if (!cy.cycle_number) cy.cycle_number = 1;
        if (!cy.cycle_type) cy.cycle_type = 'public';
      });
    }
    return db;
  }

  function loadDb() {
    var raw = '';
    try {
      raw = localStorage.getItem(DB_KEY) || '';
    } catch (_e) {
      raw = memoryDbJson;
    }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.settings && Array.isArray(parsed.plans)) {
          return normalizeLoadedDb(parsed);
        }
      } catch (_err) {}
    }
    var seed = createSeedDb();
    saveDb(seed);
    return seed;
  }

  function saveDb(db) {
    var serialized = JSON.stringify(db);
    memoryDbJson = serialized;
    try {
      localStorage.setItem(DB_KEY, serialized);
    } catch (_e) {}
  }

  function nextId(db) {
    db.nextId = (db.nextId || 100) + 1;
    return db.nextId;
  }

  function makeToken(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getSession(db, headers) {
    var auth = (headers && (headers.Authorization || headers.authorization)) || '';
    var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    if (!token || !db.sessions) return null;
    return db.sessions[token] || null;
  }

  function jsonResp(status, data) {
    var text = JSON.stringify(data);
    return {
      ok: status >= 200 && status < 300,
      status: status,
      headers: {
        get: function (name) {
          if (String(name).toLowerCase() === 'content-type') return 'application/json';
          return '';
        }
      },
      json: function () { return Promise.resolve(data); },
      text: function () { return Promise.resolve(text); }
    };
  }

  function sanitizeMember(m) {
    var copy = Object.assign({}, m);
    delete copy.pass;
    delete copy.password_hash;
    return copy;
  }

  function handleStandaloneApi(url, options) {
    var opts = options || {};
    var method = String(opts.method || 'GET').toUpperCase();
    var pathOnly = String(url || '').split('?')[0];
    var headers = opts.headers || {};
    var body = {};
    if (opts.body && typeof opts.body === 'string') {
      try { body = JSON.parse(opts.body); } catch (_e) { body = {}; }
    }

    var db = loadDb();

    if (pathOnly === '/api/health') {
      return jsonResp(200, { status: 'ok', mode: 'standalone', supabaseUrl: 'https://ihgfsvkcpgxklotjmokl.supabase.co' });
    }

    if (pathOnly === '/api/site-data' && method === 'GET') {
      return jsonResp(200, {
        settings: db.settings,
        heroSlides: db.heroSlides.filter(function (s) { return s.is_active !== 0; }).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }),
        testimonials: db.testimonials.filter(function (t) { return t.is_active !== 0; }).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }),
        plans: db.plans.slice().sort(function (a, b) { return (a.price || 0) - (b.price || 0); }),
        publicCycles: db.publicCycles.slice(),
        updates: db.updates.slice().sort(function (a, b) { return String(b.published_date || '').localeCompare(String(a.published_date || '')); })
      });
    }

    if (pathOnly === '/api/requests' && method === 'POST') {
      if (!body.request_type || !body.applicant_name || !body.applicant_phone) {
        return jsonResp(400, { error: 'Full name, phone number, and request type are required.' });
      }
      if (!body.age_confirmed) {
        return jsonResp(400, { error: 'Age verification or parent/guardian consent confirmation is required.' });
      }
      var id = nextId(db);
      db.requests.unshift({
        id: id,
        request_type: String(body.request_type),
        applicant_name: String(body.applicant_name).trim(),
        applicant_phone: normalizePhone(body.applicant_phone),
        details_json: JSON.stringify(body.details || {}),
        age_confirmed: 1,
        guardian_name: String(body.guardian_name || '').trim(),
        status: 'pending',
        created_at: nowISO()
      });
      saveDb(db);
      return jsonResp(201, { id: id, status: 'pending' });
    }

    if (pathOnly === '/api/deletion-requests' && method === 'POST') {
      if (!body.full_name || !body.phone) {
        return jsonResp(400, { error: 'Full name and registered phone number are required to verify your deletion request.' });
      }
      var delId = nextId(db);
      db.deletionRequests.unshift({
        id: delId,
        full_name: String(body.full_name).trim(),
        phone: normalizePhone(body.phone),
        email: String(body.email || '').trim(),
        reason: String(body.reason || '').trim(),
        status: 'pending',
        requested_at: nowISO()
      });
      saveDb(db);
      return jsonResp(201, {
        id: delId,
        message: 'Your data deletion request has been logged. Our compliance team will process and confirm removal within 72 hours.'
      });
    }

    if (pathOnly === '/api/member/login' && method === 'POST') {
      var norm = normalizePhone(body.phone || '');
      var mem = db.members.find(function (m) {
        return m.phone === norm || m.phone === String(body.phone || '').trim();
      });
      if (!mem || mem.pass !== String(body.password || '')) {
        return jsonResp(401, { error: 'Invalid phone number or password.' });
      }
      var mTok = makeToken('mem');
      db.sessions[mTok] = { token: mTok, role: 'member', user_id: mem.id, identifier: mem.phone };
      saveDb(db);
      return jsonResp(200, { token: mTok, member: sanitizeMember(mem) });
    }

    if (pathOnly === '/api/logout' && method === 'POST') {
      var sessOut = getSession(db, headers);
      if (sessOut) {
        delete db.sessions[sessOut.token];
        saveDb(db);
      }
      return jsonResp(200, { success: true });
    }

    if (pathOnly === '/api/member/me' && method === 'GET') {
      var mSess = getSession(db, headers);
      if (!mSess || mSess.role !== 'member') return jsonResp(401, { error: 'Authentication required.' });
      var mRow = db.members.find(function (m) { return m.id === mSess.user_id; });
      if (!mRow) return jsonResp(404, { error: 'Client account not found.' });
      return jsonResp(200, {
        member: Object.assign(sanitizeMember(mRow), {
          investments: db.investments.filter(function (i) { return i.member_id === mRow.id || i.member_phone === mRow.phone; }),
          savings: db.savings.filter(function (s) { return s.member_id === mRow.id || s.member_phone === mRow.phone; }),
          loans: db.loans.filter(function (l) { return l.member_id === mRow.id || l.member_phone === mRow.phone; }),
          cycles: db.memberCycles.filter(function (c) { return c.member_id === mRow.id || c.member_phone === mRow.phone; })
        })
      });
    }

    var mCycleAct = pathOnly.match(/^\/api\/member\/cycles\/(\d+)\/action$/);
    if (mCycleAct && method === 'POST') {
      var cSess = getSession(db, headers);
      if (!cSess || cSess.role !== 'member') return jsonResp(401, { error: 'Authentication required.' });
      var cMem = db.members.find(function (m) { return m.id === cSess.user_id; });
      var targetCycId = Number(mCycleAct[1]);
      var cycRow = db.memberCycles.find(function (c) { return c.id === targetCycId; });
      if (!cycRow || !cMem) return jsonResp(404, { error: 'Cycle record not found.' });
      if (cycRow.member_id !== cMem.id && normalizePhone(cycRow.member_phone) !== normalizePhone(cMem.phone)) {
        return jsonResp(403, { error: 'You are not authorized to modify this cycle.' });
      }
      var actName = String(body.action || '').toLowerCase();
      if (actName !== 'exit' && actName !== 'stop') {
        return jsonResp(400, { error: 'Valid action (exit or stop) is required.' });
      }
      cycRow.status = actName === 'stop' ? 'stopped' : 'exited';
      saveDb(db);
      return jsonResp(200, { success: true, status: cycRow.status });
    }

    if (pathOnly === '/api/member/change-password' && method === 'POST') {
      var cpSess = getSession(db, headers);
      if (!cpSess || cpSess.role !== 'member') return jsonResp(401, { error: 'Authentication required.' });
      var cpMem = db.members.find(function (m) { return m.id === cpSess.user_id; });
      if (!cpMem || cpMem.pass !== String(body.currentPassword || '')) {
        return jsonResp(400, { error: 'Current password is incorrect.' });
      }
      if (!body.newPassword || String(body.newPassword).length < 4) {
        return jsonResp(400, { error: 'New password must be at least 4 characters.' });
      }
      cpMem.pass = String(body.newPassword);
      saveDb(db);
      return jsonResp(200, { success: true });
    }

    if (pathOnly === '/api/admin/login' && method === 'POST') {
      var emailIn = String(body.email || '').trim().toLowerCase();
      var adm = db.admins.find(function (a) { return a.email.toLowerCase() === emailIn; });
      if (!adm || adm.pass !== String(body.password || '')) {
        return jsonResp(401, { error: 'Invalid admin email or password.' });
      }
      var aTok = makeToken('adm');
      db.sessions[aTok] = { token: aTok, role: 'admin', user_id: adm.id, identifier: adm.email };
      saveDb(db);
      return jsonResp(200, { token: aTok, admin: { id: adm.id, email: adm.email, name: adm.name } });
    }

    // Admin protected endpoints
    var aSess = getSession(db, headers);
    if (!aSess || aSess.role !== 'admin') {
      return jsonResp(401, { error: 'Admin authentication required.' });
    }

    if (pathOnly === '/api/admin/me' && method === 'GET') {
      var curAdm = db.admins.find(function (a) { return a.id === aSess.user_id; });
      return jsonResp(200, { admin: curAdm ? { id: curAdm.id, email: curAdm.email, name: curAdm.name } : null });
    }

    if (pathOnly === '/api/admin/change-password' && method === 'POST') {
      var editAdm = db.admins.find(function (a) { return a.id === aSess.user_id; });
      if (editAdm) {
        if (body.newEmail) editAdm.email = String(body.newEmail).trim().toLowerCase();
        if (body.newPassword) {
          if (String(body.newPassword).length < 6) return jsonResp(400, { error: 'Password must be at least 6 characters.' });
          editAdm.pass = String(body.newPassword);
        }
        saveDb(db);
      }
      return jsonResp(200, { success: true });
    }

    if (pathOnly === '/api/admin/export-supabase' && method === 'GET') {
      var esc = function (v) { return "'" + String(v === undefined || v === null ? '' : v).replace(/'/g, "''") + "'"; };
      var sqlOut = ['-- SHIMOGY Offline/Browser Supabase SQL Export', 'BEGIN;'];
      Object.keys(db.settings || {}).forEach(function (k) {
        sqlOut.push('INSERT INTO public.site_settings (key, value) VALUES (' + esc(k) + ', ' + esc(db.settings[k]) + ') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;');
      });
      sqlOut.push('COMMIT;');
      return jsonResp(200, { mode: 'standalone', supabaseUrl: 'https://ihgfsvkcpgxklotjmokl.supabase.co', sql: sqlOut.join('\n') });
    }

    if (pathOnly === '/api/admin/overview' && method === 'GET') {
      return jsonResp(200, {
        databaseMode: 'standalone',
        supabaseUrl: 'https://ihgfsvkcpgxklotjmokl.supabase.co',
        settings: db.settings,
        members: db.members.map(sanitizeMember),
        investments: db.investments,
        savings: db.savings,
        loans: db.loans,
        memberCycles: db.memberCycles,
        plans: db.plans,
        publicCycles: db.publicCycles,
        updates: db.updates,
        heroSlides: db.heroSlides,
        testimonials: db.testimonials,
        requests: db.requests,
        deletionRequests: db.deletionRequests
      });
    }

    if (pathOnly === '/api/admin/settings' && method === 'PUT') {
      Object.keys(body).forEach(function (k) {
        db.settings[k] = String(body[k] === undefined || body[k] === null ? '' : body[k]);
      });
      saveDb(db);
      return jsonResp(200, { success: true });
    }

    if (pathOnly === '/api/admin/upload' && method === 'POST') {
      if (!body.dataUrl || typeof body.dataUrl !== 'string') {
        return jsonResp(400, { error: 'Valid image file is required.' });
      }
      return jsonResp(200, { id: Date.now(), url: body.dataUrl });
    }

    // Hero Slides CRUD
    if (pathOnly === '/api/admin/hero-slides' && method === 'POST') {
      var hid = nextId(db);
      db.heroSlides.push({
        id: hid,
        badge_text: String(body.badge_text || ''),
        title: String(body.title || ''),
        subtitle: String(body.subtitle || ''),
        cta_text: String(body.cta_text || 'Explore Plans'),
        cta_link: String(body.cta_link || 'investments.html'),
        image_url: String(body.image_url || 'assets/aistudio/partnership_65dac3a6.jpg'),
        image_alt: String(body.image_alt || body.title || ''),
        sort_order: Number(body.sort_order || 1),
        is_active: 1
      });
      saveDb(db);
      return jsonResp(201, { id: hid });
    }

    var mHero = pathOnly.match(/^\/api\/admin\/hero-slides\/(\d+)$/);
    if (mHero) {
      var hId = Number(mHero[1]);
      if (method === 'PUT') {
        var hItem = db.heroSlides.find(function (x) { return x.id === hId; });
        if (hItem) Object.assign(hItem, body, { id: hId });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.heroSlides = db.heroSlides.filter(function (x) { return x.id !== hId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    // Testimonials CRUD
    if (pathOnly === '/api/admin/testimonials' && method === 'POST') {
      var tid = nextId(db);
      db.testimonials.push({
        id: tid,
        client_name: String(body.client_name || ''),
        role: String(body.role || 'Verified Client'),
        location: String(body.location || 'Kampala, Uganda'),
        quote: String(body.quote || ''),
        photo_url: String(body.photo_url || 'assets/aistudio/josephine_a1a0850e.jpg'),
        photo_alt: String(body.photo_alt || ''),
        sort_order: Number(body.sort_order || 1),
        is_active: 1
      });
      saveDb(db);
      return jsonResp(201, { id: tid });
    }

    var mTest = pathOnly.match(/^\/api\/admin\/testimonials\/(\d+)$/);
    if (mTest) {
      var tId = Number(mTest[1]);
      if (method === 'PUT') {
        var tItem = db.testimonials.find(function (x) { return x.id === tId; });
        if (tItem) Object.assign(tItem, body, { id: tId });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.testimonials = db.testimonials.filter(function (x) { return x.id !== tId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    // Plans CRUD
    if (pathOnly === '/api/admin/plans' && method === 'POST') {
      var pid = nextId(db);
      db.plans.push({
        id: pid,
        name: String(body.name || ''),
        price: Number(body.price || 0),
        expected_return: Number(body.expected_return || 0),
        duration: String(body.duration || '30 Days'),
        risk: String(body.risk || 'Low'),
        risk_level: body.risk === 'High' ? 3 : body.risk === 'Medium' ? 2 : 1,
        description: String(body.description || ''),
        image_url: String(body.image_url || 'assets/aistudio/graph_ddbd7244.jpg'),
        image_alt: String(body.image_alt || body.name || ''),
        slots_left: Number(body.slots_left || 0),
        status: String(body.status || 'available'),
        badge: String(body.badge || '')
      });
      saveDb(db);
      return jsonResp(201, { id: pid });
    }

    var mPlan = pathOnly.match(/^\/api\/admin\/plans\/(\d+)$/);
    if (mPlan) {
      var pId = Number(mPlan[1]);
      if (method === 'PUT') {
        var pItem = db.plans.find(function (x) { return x.id === pId; });
        if (pItem) Object.assign(pItem, body, { id: pId });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.plans = db.plans.filter(function (x) { return x.id !== pId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    // Public Cycles CRUD
    if (pathOnly === '/api/admin/public-cycles' && method === 'POST') {
      var cid = nextId(db);
      db.publicCycles.push({
        id: cid,
        name: String(body.name || ''),
        contribution: Number(body.contribution || 0),
        payout_duration: String(body.payout_duration || 'Monthly'),
        description: String(body.description || ''),
        image_url: String(body.image_url || 'assets/aistudio/partnership_65dac3a6.jpg'),
        image_alt: String(body.image_alt || body.name || ''),
        status: 'Active'
      });
      saveDb(db);
      return jsonResp(201, { id: cid });
    }

    var mCycle = pathOnly.match(/^\/api\/admin\/public-cycles\/(\d+)$/);
    if (mCycle) {
      var cId = Number(mCycle[1]);
      if (method === 'PUT') {
        var cItem = db.publicCycles.find(function (x) { return x.id === cId; });
        if (cItem) Object.assign(cItem, body, { id: cId, status: 'Active' });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.publicCycles = db.publicCycles.filter(function (x) { return x.id !== cId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    // Updates CRUD
    if (pathOnly === '/api/admin/updates' && method === 'POST') {
      var uid = nextId(db);
      db.updates.unshift({
        id: uid,
        title: String(body.title || ''),
        category: String(body.category || 'news'),
        excerpt: String(body.excerpt || ''),
        detail: String(body.detail || ''),
        image_url: String(body.image_url || 'assets/aistudio/graph_ddbd7244.jpg'),
        image_alt: String(body.image_alt || body.title || ''),
        published_date: String(body.published_date || todayISO()),
        status: 'published'
      });
      saveDb(db);
      return jsonResp(201, { id: uid });
    }

    var mUpd = pathOnly.match(/^\/api\/admin\/updates\/(\d+)$/);
    if (mUpd && method === 'DELETE') {
      var uId = Number(mUpd[1]);
      db.updates = db.updates.filter(function (x) { return x.id !== uId; });
      saveDb(db);
      return jsonResp(200, { success: true });
    }

    // Clients
    var mFind = pathOnly.match(/^\/api\/admin\/member\/(.+)$/);
    if (mFind && method === 'GET') {
      var lookup = normalizePhone(decodeURIComponent(mFind[1]));
      var fm = db.members.find(function (x) { return x.phone === lookup || x.phone === decodeURIComponent(mFind[1]); });
      if (!fm) return jsonResp(404, { error: 'Client not found.' });
      return jsonResp(200, {
        member: Object.assign(sanitizeMember(fm), {
          investments: db.investments.filter(function (i) { return i.member_id === fm.id || i.member_phone === fm.phone; }),
          savings: db.savings.filter(function (s) { return s.member_id === fm.id || s.member_phone === fm.phone; }),
          loans: db.loans.filter(function (l) { return l.member_id === fm.id || l.member_phone === fm.phone; }),
          cycles: db.memberCycles.filter(function (c) { return c.member_id === fm.id || c.member_phone === fm.phone; })
        })
      });
    }

    if (pathOnly === '/api/admin/members' && method === 'POST') {
      var mp = normalizePhone(body.phone || '');
      if (db.members.some(function (x) { return x.phone === mp; })) {
        return jsonResp(409, { error: 'A client with that phone number already exists.' });
      }
      var newMid = nextId(db);
      var memObj = {
        id: newMid,
        name: String(body.name || '').trim(),
        phone: mp,
        email: String(body.email || '').trim(),
        group_name: String(body.group_name || '').trim(),
        balance: Math.max(0, Number(body.balance || 0)),
        total_invested: Math.max(0, Number(body.total_invested || 0)),
        status: 'active',
        pass: String(body.password || '1234')
      };
      db.members.unshift(memObj);
      if (body.investment && body.investment.plan_name) {
        var iDur = String(body.investment.duration || '60 Days');
        db.investments.unshift(Object.assign({
          id: nextId(db),
          member_id: newMid,
          member_phone: mp,
          member_name: memObj.name,
          status: 'active',
          created_at: nowISO(),
          returns_date: computeReturnsDate(todayISO(), iDur, body.investment.returns_date)
        }, body.investment));
      }
      if (body.savings && body.savings.account_type) {
        var sType = String(body.savings.account_type);
        db.savings.unshift(Object.assign({
          id: nextId(db),
          member_id: newMid,
          member_phone: mp,
          member_name: memObj.name,
          open_date: todayISO(),
          created_at: nowISO()
        }, body.savings, { status: normalizeSavingsStatus(sType, body.savings.status) }));
      }
      if (body.loan && body.loan.amount) {
        var lDur = String(body.loan.duration || '30 days');
        db.loans.unshift(Object.assign({
          id: nextId(db),
          member_id: newMid,
          member_phone: mp,
          member_name: memObj.name,
          request_date: todayISO(),
          return_date: computeLoanReturnDate(todayISO(), lDur, body.loan.return_date),
          created_at: nowISO()
        }, body.loan));
      }
      if (body.cycle && body.cycle.cycle_name) {
        var totalCli = Math.max(2, Number(body.cycle.number_of_members || 10));
        db.memberCycles.unshift(Object.assign({
          id: nextId(db),
          member_id: newMid,
          member_phone: mp,
          member_name: memObj.name,
          join_date: todayISO(),
          cycle_number: Math.min(totalCli, Math.max(1, Number(body.cycle.cycle_number || 1))),
          cycle_type: String(body.cycle.cycle_type || 'public').toLowerCase() === 'custom' ? 'custom' : 'public',
          status: 'active',
          created_at: nowISO()
        }, body.cycle));
      }
      saveDb(db);
      return jsonResp(201, { id: newMid });
    }

    var mMem = pathOnly.match(/^\/api\/admin\/members\/(\d+)$/);
    if (mMem) {
      var memId = Number(mMem[1]);
      if (method === 'PUT') {
        var existingMem = db.members.find(function (x) { return x.id === memId; });
        if (existingMem) {
          existingMem.name = String(body.name || existingMem.name).trim();
          existingMem.phone = normalizePhone(body.phone || existingMem.phone);
          existingMem.email = String(body.email ?? existingMem.email ?? '');
          existingMem.group_name = String(body.group_name ?? existingMem.group_name ?? '');
          existingMem.balance = Math.max(0, Number(body.balance ?? existingMem.balance ?? 0));
          existingMem.total_invested = Math.max(0, Number(body.total_invested ?? existingMem.total_invested ?? 0));
          existingMem.status = String(body.status || existingMem.status || 'active');
          if (body.password) existingMem.pass = String(body.password);
          db.investments.forEach(function (i) { if (i.member_id === memId) { i.member_phone = existingMem.phone; i.member_name = existingMem.name; } });
          db.savings.forEach(function (s) { if (s.member_id === memId) { s.member_phone = existingMem.phone; s.member_name = existingMem.name; } });
          db.loans.forEach(function (l) { if (l.member_id === memId) { l.member_phone = existingMem.phone; l.member_name = existingMem.name; } });
          db.memberCycles.forEach(function (c) { if (c.member_id === memId) { c.member_phone = existingMem.phone; c.member_name = existingMem.name; } });
          saveDb(db);
        }
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.members = db.members.filter(function (x) { return x.id !== memId; });
        db.investments = db.investments.filter(function (x) { return x.member_id !== memId; });
        db.savings = db.savings.filter(function (x) { return x.member_id !== memId; });
        db.loans = db.loans.filter(function (x) { return x.member_id !== memId; });
        db.memberCycles = db.memberCycles.filter(function (x) { return x.member_id !== memId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    if (pathOnly === '/api/admin/investments' && method === 'POST') {
      var ip = normalizePhone(body.member_phone || '');
      var im = db.members.find(function (x) { return x.phone === ip; });
      var invDur = String(body.duration || '60 Days');
      db.investments.unshift({
        id: nextId(db),
        member_id: im ? im.id : null,
        member_phone: ip,
        member_name: body.member_name || (im ? im.name : 'Client'),
        plan_name: String(body.plan_name || ''),
        amount: Math.max(0, Number(body.amount || 0)),
        expected_return: Math.max(0, Number(body.expected_return || 0)),
        duration: invDur,
        returns_date: computeReturnsDate(todayISO(), invDur, body.returns_date),
        status: String(body.status || 'active'),
        created_at: nowISO()
      });
      if (im) im.total_invested = Number(im.total_invested || 0) + Math.max(0, Number(body.amount || 0));
      saveDb(db);
      return jsonResp(201, { success: true });
    }

    var mInv = pathOnly.match(/^\/api\/admin\/investments\/(\d+)$/);
    if (mInv) {
      var invId = Number(mInv[1]);
      if (method === 'PUT') {
        var invItem = db.investments.find(function (x) { return x.id === invId; });
        if (invItem) {
          var prevAmt = Number(invItem.amount || 0);
          var nextAmt = Math.max(0, Number(body.amount !== undefined ? body.amount : invItem.amount));
          invItem.plan_name = String(body.plan_name || invItem.plan_name);
          invItem.amount = nextAmt;
          invItem.expected_return = Math.max(0, Number(body.expected_return !== undefined ? body.expected_return : invItem.expected_return));
          invItem.duration = String(body.duration || invItem.duration || '60 Days');
          invItem.returns_date = computeReturnsDate(invItem.created_at || todayISO(), invItem.duration, body.returns_date || invItem.returns_date);
          invItem.status = String(body.status || invItem.status || 'active');
          if (invItem.member_id) {
            var ownerM = db.members.find(function (x) { return x.id === invItem.member_id; });
            if (ownerM) ownerM.total_invested = Math.max(0, Number(ownerM.total_invested || 0) + (nextAmt - prevAmt));
          }
          saveDb(db);
        }
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.investments = db.investments.filter(function (x) { return x.id !== invId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    if (pathOnly === '/api/admin/savings' && method === 'POST') {
      var sp = normalizePhone(body.member_phone || '');
      var sm = db.members.find(function (x) { return x.phone === sp; });
      var acctType = String(body.account_type || 'Current Account');
      var savBal = Math.max(0, Number(body.balance || 0));
      db.savings.unshift({
        id: nextId(db),
        member_id: sm ? sm.id : null,
        member_phone: sp,
        member_name: body.member_name || (sm ? sm.name : 'Client'),
        account_type: acctType,
        balance: savBal,
        open_date: todayISO(),
        status: normalizeSavingsStatus(acctType, body.status),
        created_at: nowISO()
      });
      if (sm) sm.balance = Number(sm.balance || 0) + savBal;
      saveDb(db);
      return jsonResp(201, { success: true });
    }

    var mSav = pathOnly.match(/^\/api\/admin\/savings\/(\d+)$/);
    if (mSav) {
      var sId = Number(mSav[1]);
      if (method === 'PUT') {
        var savItem = db.savings.find(function (x) { return x.id === sId; });
        if (savItem) {
          savItem.account_type = String(body.account_type || savItem.account_type);
          savItem.balance = Math.max(0, Number(body.balance !== undefined ? body.balance : savItem.balance));
          savItem.status = normalizeSavingsStatus(savItem.account_type, body.status !== undefined ? body.status : savItem.status);
          saveDb(db);
        }
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.savings = db.savings.filter(function (x) { return x.id !== sId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    if (pathOnly === '/api/admin/loans' && method === 'POST') {
      var lp = normalizePhone(body.member_phone || '');
      var lm = db.members.find(function (x) { return x.phone === lp; });
      var lDuration = String(body.duration || '30 days');
      var reqDate = String(body.request_date || todayISO());
      db.loans.unshift({
        id: nextId(db),
        member_id: lm ? lm.id : null,
        member_phone: lp,
        member_name: body.member_name || (lm ? lm.name : 'Client'),
        amount: Math.max(0, Number(body.amount || 0)),
        purpose: String(body.purpose || ''),
        duration: lDuration,
        interest_rate: String(body.interest_rate || '10%'),
        status: String(body.status || 'active'),
        request_date: reqDate,
        return_date: computeLoanReturnDate(reqDate, lDuration, body.return_date),
        created_at: nowISO()
      });
      saveDb(db);
      return jsonResp(201, { success: true });
    }

    var mLoan = pathOnly.match(/^\/api\/admin\/loans\/(\d+)$/);
    if (mLoan) {
      var lId = Number(mLoan[1]);
      if (method === 'PUT') {
        var lItem = db.loans.find(function (x) { return x.id === lId; });
        if (lItem) {
          if (body.amount !== undefined) lItem.amount = Math.max(0, Number(body.amount));
          if (body.purpose !== undefined) lItem.purpose = String(body.purpose);
          if (body.duration !== undefined) lItem.duration = String(body.duration);
          if (body.interest_rate !== undefined) lItem.interest_rate = String(body.interest_rate);
          if (body.status !== undefined) lItem.status = String(body.status);
          lItem.return_date = computeLoanReturnDate(lItem.request_date || todayISO(), lItem.duration || '30 days', body.return_date || lItem.return_date);
        }
        saveDb(db);
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.loans = db.loans.filter(function (x) { return x.id !== lId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    if (pathOnly === '/api/admin/member-cycles' && method === 'POST') {
      var cp = normalizePhone(body.member_phone || '');
      var cm = db.members.find(function (x) { return x.phone === cp; });
      var totM = Math.max(2, Number(body.number_of_members || 10));
      db.memberCycles.unshift({
        id: nextId(db),
        member_id: cm ? cm.id : null,
        member_phone: cp,
        member_name: body.member_name || (cm ? cm.name : 'Client'),
        cycle_name: String(body.cycle_name || ''),
        contribution: Math.max(0, Number(body.contribution || 0)),
        payout_duration: String(body.payout_duration || 'Weekly'),
        number_of_members: totM,
        cycle_number: Math.min(totM, Math.max(1, Number(body.cycle_number || 1))),
        cycle_type: String(body.cycle_type || 'public').toLowerCase() === 'custom' ? 'custom' : 'public',
        join_date: String(body.join_date || todayISO()),
        status: String(body.status || 'active'),
        created_at: nowISO()
      });
      saveDb(db);
      return jsonResp(201, { success: true });
    }

    var mCyc = pathOnly.match(/^\/api\/admin\/member-cycles\/(\d+)$/);
    if (mCyc) {
      var cycId = Number(mCyc[1]);
      if (method === 'PUT') {
        var cycItem = db.memberCycles.find(function (x) { return x.id === cycId; });
        if (cycItem) {
          var nextTot = Math.max(2, Number(body.number_of_members !== undefined ? body.number_of_members : (cycItem.number_of_members || 10)));
          cycItem.cycle_name = String(body.cycle_name || cycItem.cycle_name);
          cycItem.contribution = Math.max(0, Number(body.contribution !== undefined ? body.contribution : cycItem.contribution));
          cycItem.payout_duration = String(body.payout_duration || cycItem.payout_duration);
          cycItem.number_of_members = nextTot;
          cycItem.cycle_number = Math.min(nextTot, Math.max(1, Number(body.cycle_number !== undefined ? body.cycle_number : (cycItem.cycle_number || 1))));
          cycItem.cycle_type = String(body.cycle_type || cycItem.cycle_type || 'public').toLowerCase() === 'custom' ? 'custom' : 'public';
          cycItem.status = String(body.status || cycItem.status || 'active');
          saveDb(db);
        }
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.memberCycles = db.memberCycles.filter(function (x) { return x.id !== cycId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    var mReq = pathOnly.match(/^\/api\/admin\/requests\/(\d+)$/);
    if (mReq) {
      var rId = Number(mReq[1]);
      if (method === 'PUT') {
        var rItem = db.requests.find(function (x) { return x.id === rId; });
        if (rItem) rItem.status = String(body.status || 'reviewed');
        saveDb(db);
        return jsonResp(200, { success: true });
      }
      if (method === 'DELETE') {
        db.requests = db.requests.filter(function (x) { return x.id !== rId; });
        saveDb(db);
        return jsonResp(200, { success: true });
      }
    }

    var mDel = pathOnly.match(/^\/api\/admin\/deletion-requests\/(\d+)\/process$/);
    if (mDel && method === 'POST') {
      var dId = Number(mDel[1]);
      var dItem = db.deletionRequests.find(function (x) { return x.id === dId; });
      if (dItem) {
        if (body.action === 'purge') {
          var targetPhone = normalizePhone(dItem.phone);
          db.members = db.members.filter(function (x) { return x.phone !== targetPhone; });
          db.investments = db.investments.filter(function (x) { return x.member_phone !== targetPhone; });
          db.savings = db.savings.filter(function (x) { return x.member_phone !== targetPhone; });
          db.loans = db.loans.filter(function (x) { return x.member_phone !== targetPhone; });
          db.memberCycles = db.memberCycles.filter(function (x) { return x.member_phone !== targetPhone; });
          db.requests = db.requests.filter(function (x) { return x.applicant_phone !== targetPhone; });
        }
        dItem.status = body.action === 'reject' ? 'rejected' : 'completed';
        saveDb(db);
      }
      return jsonResp(200, { success: true });
    }

    return jsonResp(404, { error: 'Endpoint not found.' });
  }

  window.ShimogyStandaloneDB = {
    handle: handleStandaloneApi,
    load: loadDb,
    save: saveDb
  };

  function getBearerToken(headers) {
    if (!headers) return '';
    var raw = '';
    if (typeof headers.get === 'function') {
      raw = headers.get('Authorization') || headers.get('authorization') || '';
    } else {
      raw = headers.Authorization || headers.authorization || '';
    }
    return raw.indexOf('Bearer ') === 0 ? raw.slice(7).trim() : '';
  }

  function parseJsonBody(init) {
    var body = {};
    if (init && init.body && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch (_e) { body = {}; }
    }
    return body;
  }

  // Transparent fetch adapter for /api/* calls
  // Priority over HTTP(S): Live Express + Supabase PostgreSQL (/api/*) -> Static Supabase REST -> Cloud Firestore -> LocalStorage
  var nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  try {
    if (nativeFetch) window.ShimogyNativeFetch = nativeFetch;
  } catch (_e) {}

  function fallbackStaticServices(input, init, url, pathOnly, method, body, token) {
    var sb = window.ShimogySupabase;
    var cloud = window.ShimogyCloud;

    // 1. Static host Supabase REST bridge (Cloudflare Pages / public catalog + request submissions)
    if (sb && typeof sb.isConfigured === 'function' && sb.isConfigured() && sb.isSchemaReady()) {
      if (pathOnly === '/api/site-data' && method === 'GET') {
        return sb.getPublicSiteData().then(function (sbData) {
          if (sbData) return jsonResp(200, sbData);
          return tryCloudOrLocal(url, init, pathOnly, method, body, token, cloud);
        });
      }
      if (pathOnly === '/api/requests' && method === 'POST') {
        if (!body.request_type || !body.applicant_name || !body.applicant_phone) {
          return Promise.resolve(jsonResp(400, { error: 'Full name, phone number, and request type are required.' }));
        }
        if (!body.age_confirmed) {
          return Promise.resolve(jsonResp(400, { error: 'Age verification or parent/guardian consent confirmation is required.' }));
        }
        return sb.createServiceRequest(body).then(function (sbRes) {
          if (sbRes) return jsonResp(201, sbRes);
          return tryCloudOrLocal(url, init, pathOnly, method, body, token, cloud);
        });
      }
      if (pathOnly === '/api/deletion-requests' && method === 'POST') {
        if (!body.full_name || !body.phone) {
          return Promise.resolve(jsonResp(400, { error: 'Full name and registered phone number are required.' }));
        }
        return sb.createDeletionRequest(body).then(function (sbDelRes) {
          if (sbDelRes) return jsonResp(201, sbDelRes);
          return tryCloudOrLocal(url, init, pathOnly, method, body, token, cloud);
        });
      }
    }

    return tryCloudOrLocal(url, init, pathOnly, method, body, token, cloud);
  }

  function tryCloudOrLocal(url, init, pathOnly, method, body, token, cloud) {
    var isHttp = typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:';
    var isMutation = method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';

    if (cloud && typeof cloud.isEnabled === 'function' && cloud.isEnabled()) {
      if (pathOnly === '/api/site-data' && method === 'GET') {
        return cloud.getPublicSiteData()
          .then(function (cloudData) {
            if (cloudData) return jsonResp(200, cloudData);
            return isHttp ? jsonResp(503, { error: 'Unable to reach live database.' }) : handleStandaloneApi(url, init);
          })
          .catch(function () {
            return isHttp ? jsonResp(503, { error: 'Unable to reach live database.' }) : handleStandaloneApi(url, init);
          });
      }
      if (pathOnly === '/api/requests' && method === 'POST') {
        if (!body.request_type || !body.applicant_name || !body.applicant_phone || !body.age_confirmed) {
          return Promise.resolve(handleStandaloneApi(url, init));
        }
        return cloud.createServiceRequest(body)
          .then(function (res) { return jsonResp(201, res); })
          .catch(function (err) {
            return isHttp
              ? jsonResp(503, { error: (err && err.message) || 'Unable to submit request to live database right now.' })
              : handleStandaloneApi(url, init);
          });
      }
      if (pathOnly === '/api/deletion-requests' && method === 'POST') {
        if (!body.full_name || !body.phone) return Promise.resolve(handleStandaloneApi(url, init));
        return cloud.createDeletionRequest(body)
          .then(function (res) { return jsonResp(201, res); })
          .catch(function (err) {
            return isHttp
              ? jsonResp(503, { error: (err && err.message) || 'Unable to submit deletion request right now.' })
              : handleStandaloneApi(url, init);
          });
      }
      if (pathOnly === '/api/member/login' && method === 'POST') {
        return cloud.loginMemberByPhonePassword(body.phone || '', body.password || '')
          .then(function (cloudRes) {
            if (cloudRes) return jsonResp(200, cloudRes);
            return isHttp ? jsonResp(401, { error: 'Invalid phone number or password.' }) : handleStandaloneApi(url, init);
          })
          .catch(function () {
            return isHttp ? jsonResp(401, { error: 'Invalid phone number or password.' }) : handleStandaloneApi(url, init);
          });
      }
      if (pathOnly === '/api/member/me' && method === 'GET' && (token.indexOf('cloud_portal_') === 0 || token.indexOf('cloud_mem_uid_') === 0)) {
        var waitReady = token.indexOf('cloud_mem_uid_') === 0 && typeof cloud.waitForAuthReady === 'function'
          ? cloud.waitForAuthReady()
          : Promise.resolve();
        return waitReady
          .then(function () { return cloud.fetchMemberSessionFromCloud(token); })
          .then(function (res) { return res ? jsonResp(200, res) : jsonResp(401, { error: 'Session expired. Please sign in again.' }); })
          .catch(function () { return jsonResp(401, { error: 'Unable to load cloud portfolio.' }); });
      }
      if (pathOnly === '/api/logout' && method === 'POST') {
        var shouldCloudOut = token.indexOf('cloud_') === 0 || (typeof cloud.isAdminSignedIn === 'function' && cloud.isAdminSignedIn());
        if (shouldCloudOut && typeof cloud.signOutCloud === 'function') cloud.signOutCloud().catch(function () {});
        return Promise.resolve(jsonResp(200, { success: true }));
      }
      if (pathOnly.indexOf('/api/admin/') === 0 && pathOnly !== '/api/admin/login' && pathOnly !== '/api/admin/google-login') {
        var isCloudToken = token.indexOf('cloud_adm_') === 0;
        var authWait = typeof cloud.waitForAuthReady === 'function' ? cloud.waitForAuthReady() : Promise.resolve();
        return authWait.then(function () {
          if (cloud.isAdminSignedIn()) {
            return cloud.handleAdminApi(pathOnly, method, body).then(function (cloudResp) {
              if (cloudResp) return jsonResp(cloudResp.status, cloudResp.data);
              return isHttp
                ? jsonResp(503, { error: 'Live server connection required for this operation so all devices stay synchronized.' })
                : handleStandaloneApi(url, init);
            });
          }
          if (isCloudToken || isHttp) {
            return jsonResp(401, { error: 'Live database session expired. Please sign in again so changes save online for everyone.' });
          }
          return handleStandaloneApi(url, init);
        });
      }
    }

    if (isHttp && (pathOnly.indexOf('/api/admin/') === 0 || (pathOnly.indexOf('/api/member/') === 0 && isMutation))) {
      return Promise.resolve(jsonResp(503, {
        error: 'Live online server unavailable. Changes were not saved locally because they must sync across all devices.'
      }));
    }

    return Promise.resolve(handleStandaloneApi(url, init));
  }

  var shimogyFetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = url.indexOf('/api/') === 0 && url.indexOf('/api/media/') !== 0;

    if (!isApi) {
      if (!nativeFetch) {
        return Promise.reject(new Error('Network fetch is unavailable in this environment.'));
      }
      return nativeFetch(input, init);
    }

    var pathOnly = String(url).split('?')[0];
    var method = String((init && init.method) || 'GET').toUpperCase();
    var body = parseJsonBody(init);
    var token = getBearerToken(init && init.headers);

    // Over HTTP/HTTPS, ALWAYS use live Express + Supabase PostgreSQL as primary source of truth
    if (nativeFetch && window.location.protocol !== 'file:') {
      return nativeFetch(input, init)
        .then(function (res) {
          var ct = (res.headers && res.headers.get('content-type')) || '';
          var isJson = ct.indexOf('application/json') !== -1 || ct.indexOf('application/sql') !== -1;
          if (!isJson || res.status === 405 || res.status >= 502) {
            return fallbackStaticServices(input, init, url, pathOnly, method, body, token);
          }
          return res;
        })
        .catch(function () {
          return fallbackStaticServices(input, init, url, pathOnly, method, body, token);
        });
    }

    if (token.indexOf('cloud_') === 0 && window.ShimogyCloud) {
      return tryCloudOrLocal(url, init, pathOnly, method, body, token, window.ShimogyCloud);
    }

    return fallbackStaticServices(input, init, url, pathOnly, method, body, token);
  };

  try {
    window.shimogyFetch = shimogyFetch;
  } catch (_e) {}

  try {
    var ownDesc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!ownDesc || ownDesc.configurable) {
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        writable: true,
        enumerable: true,
        value: shimogyFetch
      });
    } else if (ownDesc.writable) {
      window.fetch = shimogyFetch;
    }
  } catch (_e) {
    // Some locked-down browser sandboxes expose fetch as a non-configurable getter;
    // window.shimogyFetch handles all internal API calls safely without throwing.
  }
})();


