import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
  type Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const BOOTSTRAPPED_ADMIN_EMAILS = ['mal77ham@gmail.com', 'maleham06@gmail.com'];
const CRED_SALT_SEP = '::';

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

// Pure-JS SHA-256 fallback so hashing works even on unencrypted file:// origins
function sha256Fallback(ascii: string): string {
  const rightRotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

async function sha256Hex(input: string): Promise<string> {
  const clean = String(input || '');
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const bytes = new TextEncoder().encode(clean);
      const buf = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (_e) {
    // Fallback below
  }
  return sha256Fallback(clean);
}

function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('256') && digits.length >= 12) {
    return '0' + digits.slice(3);
  }
  return digits || String(phone || '').trim();
}

function makeDocId(prefix: string): string {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function formatTs(ts: unknown): string {
  if (!ts) return todayISO();
  if (typeof ts === 'string') return ts;
  if (typeof (ts as Timestamp).toDate === 'function') {
    return (ts as Timestamp).toDate().toISOString().replace('T', ' ').slice(0, 19);
  }
  return todayISO();
}

let currentAuthUser: User | null = auth.currentUser;
let isVerifiedAdminFlag = false;

async function checkAdminStatus(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) {
    isVerifiedAdminFlag = false;
    return false;
  }
  const email = (user.email || '').toLowerCase();
  if (BOOTSTRAPPED_ADMIN_EMAILS.includes(email)) {
    try {
      const admRef = doc(db, 'admins', user.uid);
      const admSnap = await getDoc(admRef);
      if (!admSnap.exists()) {
        await setDoc(admRef, {
          uid: user.uid,
          email: email,
          name: user.displayName || 'SHIMOGY Administrator',
          role: 'admin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      isVerifiedAdminFlag = true;
      return true;
    } catch (e) {
      console.warn('Admin bootstrap check:', e);
      isVerifiedAdminFlag = true;
      return true;
    }
  }
  try {
    const admSnap = await getDoc(doc(db, 'admins', user.uid));
    isVerifiedAdminFlag = admSnap.exists();
    return isVerifiedAdminFlag;
  } catch {
    isVerifiedAdminFlag = false;
    return false;
  }
}

let authReadyResolve: (() => void) | null = null;
const authReadyPromise = new Promise<void>((resolve) => {
  authReadyResolve = resolve;
});
setTimeout(() => {
  if (authReadyResolve) {
    authReadyResolve();
    authReadyResolve = null;
  }
}, 2500);

onAuthStateChanged(auth, (user) => {
  currentAuthUser = user;
  void checkAdminStatus(user).then((isAdm) => {
    if (authReadyResolve) {
      authReadyResolve();
      authReadyResolve = null;
    }
    window.dispatchEvent(new CustomEvent('shimogy:cloud-auth', { detail: { user: user ? { uid: user.uid, email: user.email, name: user.displayName } : null, isAdmin: isAdm } }));
  });
});

async function seedCloudFromLocalDefaults(): Promise<void> {
  const settingsRef = doc(db, 'site_settings', 'public');
  const snap = await getDoc(settingsRef);
  if (snap.exists()) return;

  const localDb = (window as unknown as { ShimogyStandaloneDB?: { load: () => Record<string, unknown> } }).ShimogyStandaloneDB?.load();
  if (!localDb) return;

  const s = (localDb.settings || {}) as Record<string, string>;
  await setDoc(settingsRef, {
    company_name: s.company_name || 'SHIMOGY Investment Group Ltd',
    short_name: s.short_name || 'SHIMOGY',
    slogan: s.slogan || 'Partners for Life',
    registration_info: s.registration_info || 'Registered Investment & Community Savings Group | Kawempe Tula, Kampala, Uganda',
    phone_primary: s.phone_primary || '+256 752 259 416',
    phone_secondary: s.phone_secondary || '+256 746 788 042',
    whatsapp_number: s.whatsapp_number || '256752259416',
    email: s.email || 'shimogygroup@gmail.com',
    address: s.address || 'Kawempe Tula, Kampala, Uganda',
    working_hours: s.working_hours || 'Monday - Saturday: 8:00 AM - 6:00 PM EAT (Sunday: Closed)',
    social_facebook: s.social_facebook || 'https://www.facebook.com',
    social_tiktok: s.social_tiktok || 'https://www.tiktok.com',
    social_youtube: s.social_youtube || 'https://www.youtube.com',
    social_instagram: s.social_instagram || 'https://www.instagram.com',
    logo_url: s.logo_url || 'assets/aistudio/logo2_be71428a.jpg',
    about_mission: s.about_mission || '',
    about_vision: s.about_vision || '',
    about_story: s.about_story || '',
    stats_members: s.stats_members || '200+',
    stats_capital: s.stats_capital || 'UGX 50M+',
    stats_years: s.stats_years || 'Since 2023',
    stats_hours: s.stats_hours || 'Mon - Sat, 8AM - 6PM',
    risk_disclosure: s.risk_disclosure || '',
    age_consent_policy: s.age_consent_policy || '',
    quick_updates_ticker: s.quick_updates_ticker || '',
    updatedAt: serverTimestamp()
  });

  const slides = (localDb.heroSlides || []) as Record<string, unknown>[];
  for (const sl of slides) {
    const id = 'slide_' + String(sl.id || makeDocId('s'));
    await setDoc(doc(db, 'hero_slides', id), {
      badge_text: String(sl.badge_text || ''),
      title: String(sl.title || ''),
      subtitle: String(sl.subtitle || ''),
      cta_text: String(sl.cta_text || 'Explore Plans'),
      cta_link: String(sl.cta_link || 'investments.html'),
      image_url: String(sl.image_url || 'assets/aistudio/partnership_65dac3a6.jpg'),
      image_alt: String(sl.image_alt || ''),
      sort_order: Number(sl.sort_order || 1),
      is_active: Number(sl.is_active === 0 ? 0 : 1),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  const tests = (localDb.testimonials || []) as Record<string, unknown>[];
  for (const t of tests) {
    const id = 'test_' + String(t.id || makeDocId('t'));
    await setDoc(doc(db, 'testimonials', id), {
      client_name: String(t.client_name || ''),
      role: String(t.role || 'Verified Client'),
      location: String(t.location || 'Kampala, Uganda'),
      quote: String(t.quote || ''),
      photo_url: String(t.photo_url || 'assets/aistudio/josephine_a1a0850e.jpg'),
      photo_alt: String(t.photo_alt || ''),
      sort_order: Number(t.sort_order || 1),
      is_active: Number(t.is_active === 0 ? 0 : 1),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  const plans = (localDb.plans || []) as Record<string, unknown>[];
  for (const p of plans) {
    const id = 'plan_' + String(p.id || makeDocId('p'));
    await setDoc(doc(db, 'investment_plans', id), {
      name: String(p.name || ''),
      price: Number(p.price || 0),
      expected_return: Number(p.expected_return || 0),
      duration: String(p.duration || '60 Days'),
      risk: ['Low', 'Medium', 'High'].includes(String(p.risk)) ? String(p.risk) : 'Low',
      risk_level: Number(p.risk_level || 1),
      description: String(p.description || ''),
      image_url: String(p.image_url || 'assets/aistudio/graph_ddbd7244.jpg'),
      image_alt: String(p.image_alt || ''),
      slots_left: Number(p.slots_left ?? 5),
      status: String(p.status) === 'closed' ? 'closed' : 'available',
      badge: String(p.badge || ''),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  const cycles = (localDb.publicCycles || []) as Record<string, unknown>[];
  for (const c of cycles) {
    const id = 'cyc_' + String(c.id || makeDocId('c'));
    await setDoc(doc(db, 'public_cycles', id), {
      name: String(c.name || ''),
      contribution: Number(c.contribution || 0),
      payout_duration: String(c.payout_duration || 'Weekly'),
      description: String(c.description || ''),
      image_url: String(c.image_url || 'assets/aistudio/partnership_65dac3a6.jpg'),
      image_alt: String(c.image_alt || ''),
      status: String(c.status || 'Active'),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  const updates = (localDb.updates || []) as Record<string, unknown>[];
  for (const u of updates) {
    const id = 'upd_' + String(u.id || makeDocId('u'));
    await setDoc(doc(db, 'updates', id), {
      title: String(u.title || ''),
      category: ['news', 'story', 'tip', 'event'].includes(String(u.category)) ? String(u.category) : 'news',
      excerpt: String(u.excerpt || ''),
      detail: String(u.detail || ''),
      image_url: String(u.image_url || 'assets/aistudio/graph_ddbd7244.jpg'),
      image_alt: String(u.image_alt || ''),
      published_date: String(u.published_date || todayISO()),
      status: String(u.status) === 'draft' ? 'draft' : 'published',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  // Seed default sample member & ledgers
  const mems = (localDb.members || []) as Record<string, unknown>[];
  for (const m of mems) {
    const normPhone = normalizePhone(String(m.phone || '0752259416'));
    const pass = String(m.pass || '9416');
    const credHash = await sha256Hex(normPhone + CRED_SALT_SEP + pass);
    const passHash = await sha256Hex(pass);
    const memId = 'mem_' + normPhone;

    await setDoc(doc(db, 'members', memId), {
      name: String(m.name || 'Member'),
      phone: normPhone,
      email: String(m.email || ''),
      uid: '',
      group_name: String(m.group_name || ''),
      balance: Number(m.balance || 0),
      total_invested: Number(m.total_invested || 0),
      status: 'active',
      pass_hash: passHash,
      cred_hash: credHash,
      age_verified: 1,
      guardian_name: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const invs = ((localDb.investments || []) as Record<string, unknown>[]).filter((x) => normalizePhone(String(x.member_phone)) === normPhone);
    for (const inv of invs) {
      await setDoc(doc(db, 'member_ledgers', makeDocId('inv')), {
        memberId: memId,
        member_phone: normPhone,
        member_email: String(m.email || ''),
        member_name: String(m.name || ''),
        ownerUid: '',
        record_type: 'investment',
        title: String(inv.plan_name || 'Investment Plan'),
        amount: Number(inv.amount || 0),
        expected_return: Number(inv.expected_return || 0),
        duration: String(inv.duration || '60 Days'),
        date_str: String(inv.created_at || todayISO()),
        status: String(inv.status || 'active'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    const savs = ((localDb.savings || []) as Record<string, unknown>[]).filter((x) => normalizePhone(String(x.member_phone)) === normPhone);
    for (const sav of savs) {
      await setDoc(doc(db, 'member_ledgers', makeDocId('sav')), {
        memberId: memId,
        member_phone: normPhone,
        member_email: String(m.email || ''),
        member_name: String(m.name || ''),
        ownerUid: '',
        record_type: 'savings',
        title: String(sav.account_type || 'Current Account'),
        amount: Number(sav.balance || 0),
        date_str: String(sav.open_date || todayISO()),
        status: String(sav.status || 'active'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    const lns = ((localDb.loans || []) as Record<string, unknown>[]).filter((x) => normalizePhone(String(x.member_phone)) === normPhone);
    for (const ln of lns) {
      await setDoc(doc(db, 'member_ledgers', makeDocId('loan')), {
        memberId: memId,
        member_phone: normPhone,
        member_email: String(m.email || ''),
        member_name: String(m.name || ''),
        ownerUid: '',
        record_type: 'loan',
        title: String(ln.purpose || 'Member Loan'),
        amount: Number(ln.amount || 0),
        duration: String(ln.duration || '30 days'),
        interest_rate: String(ln.interest_rate || '10%'),
        purpose: String(ln.purpose || ''),
        date_str: String(ln.request_date || todayISO()),
        status: String(ln.status || 'active'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    const cycs = ((localDb.memberCycles || []) as Record<string, unknown>[]).filter((x) => normalizePhone(String(x.member_phone)) === normPhone);
    for (const cy of cycs) {
      await setDoc(doc(db, 'member_ledgers', makeDocId('mcyc')), {
        memberId: memId,
        member_phone: normPhone,
        member_email: String(m.email || ''),
        member_name: String(m.name || ''),
        ownerUid: '',
        record_type: 'cycle',
        title: String(cy.cycle_name || 'Savings Cycle'),
        amount: Number(cy.contribution || 0),
        duration: String(cy.payout_duration || 'Weekly'),
        number_of_members: Number(cy.number_of_members || 8),
        date_str: String(cy.join_date || todayISO()),
        status: String(cy.status || 'active'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    await rebuildMemberPortalSnapshot(memId);
  }
}

function mapLedgerDocToLegacy(docSnapId: string, d: Record<string, unknown>) {
  const rt = String(d.record_type);
  if (rt === 'investment') {
    return {
      id: docSnapId,
      member_id: d.memberId,
      member_phone: d.member_phone || '',
      member_name: d.member_name || '',
      plan_name: d.title || '',
      amount: Number(d.amount || 0),
      expected_return: Number(d.expected_return || 0),
      duration: d.duration || '60 Days',
      status: d.status || 'active',
      created_at: d.date_str || formatTs(d.createdAt)
    };
  }
  if (rt === 'savings') {
    return {
      id: docSnapId,
      member_id: d.memberId,
      member_phone: d.member_phone || '',
      member_name: d.member_name || '',
      account_type: d.title || 'Current Account',
      balance: Number(d.amount || 0),
      open_date: d.date_str || todayISO(),
      status: d.status || 'active',
      created_at: formatTs(d.createdAt)
    };
  }
  if (rt === 'loan') {
    return {
      id: docSnapId,
      member_id: d.memberId,
      member_phone: d.member_phone || '',
      member_name: d.member_name || '',
      amount: Number(d.amount || 0),
      purpose: d.purpose || d.title || '',
      duration: d.duration || '30 days',
      interest_rate: d.interest_rate || '10%',
      status: d.status || 'active',
      request_date: d.date_str || todayISO(),
      created_at: formatTs(d.createdAt)
    };
  }
  return {
    id: docSnapId,
    member_id: d.memberId,
    member_phone: d.member_phone || '',
    member_name: d.member_name || '',
    cycle_name: d.title || '',
    contribution: Number(d.amount || 0),
    payout_duration: d.duration || 'Weekly',
    number_of_members: Number(d.number_of_members || 10),
    join_date: d.date_str || todayISO(),
    status: d.status || 'active',
    created_at: formatTs(d.createdAt)
  };
}

async function rebuildMemberPortalSnapshot(memberId: string): Promise<void> {
  const memRef = doc(db, 'members', memberId);
  const memSnap = await getDoc(memRef);
  if (!memSnap.exists()) return;
  const m = memSnap.data() as Record<string, unknown>;
  const credHash = String(m.cred_hash || '');
  if (!credHash || credHash.length !== 64) return;

  const ledgSnap = await getDocs(query(collection(db, 'member_ledgers'), where('memberId', '==', memberId)));
  const investments: Record<string, unknown>[] = [];
  const savings: Record<string, unknown>[] = [];
  const loans: Record<string, unknown>[] = [];
  const cycles: Record<string, unknown>[] = [];

  ledgSnap.forEach((docItem) => {
    const ld = docItem.data() as Record<string, unknown>;
    const rt = String(ld.record_type);
    if (rt === 'investment' && investments.length < 50) {
      investments.push({
        id: docItem.id,
        plan_name: String(ld.title || ''),
        amount: Number(ld.amount || 0),
        expected_return: Number(ld.expected_return || 0),
        duration: String(ld.duration || '60 Days'),
        status: String(ld.status || 'active'),
        created_at: String(ld.date_str || formatTs(ld.createdAt))
      });
    } else if (rt === 'savings' && savings.length < 50) {
      savings.push({
        id: docItem.id,
        account_type: String(ld.title || 'Current Account'),
        balance: Number(ld.amount || 0),
        open_date: String(ld.date_str || todayISO()),
        status: String(ld.status || 'active')
      });
    } else if (rt === 'loan' && loans.length < 50) {
      loans.push({
        id: docItem.id,
        amount: Number(ld.amount || 0),
        purpose: String(ld.purpose || ld.title || ''),
        duration: String(ld.duration || '30 days'),
        interest_rate: String(ld.interest_rate || '10%'),
        status: String(ld.status || 'active'),
        request_date: String(ld.date_str || todayISO())
      });
    } else if (rt === 'cycle' && cycles.length < 50) {
      cycles.push({
        id: docItem.id,
        cycle_name: String(ld.title || ''),
        contribution: Number(ld.amount || 0),
        payout_duration: String(ld.duration || 'Weekly'),
        number_of_members: Number(ld.number_of_members || 10),
        join_date: String(ld.date_str || todayISO()),
        status: String(ld.status || 'active')
      });
    }
  });

  await setDoc(doc(db, 'member_portals', credHash), {
    memberId: memberId,
    display_name: String(m.name || 'Member'),
    group_name: String(m.group_name || ''),
    balance: Number(m.balance || 0),
    total_invested: Number(m.total_invested || 0),
    status: ['active', 'pending', 'suspended'].includes(String(m.status)) ? String(m.status) : 'active',
    investments,
    savings,
    loans,
    cycles,
    updatedAt: serverTimestamp()
  });
}

async function getPublicSiteData() {
  try {
    const settingsSnap = await getDoc(doc(db, 'site_settings', 'public'));
    if (!settingsSnap.exists()) {
      return null;
    }
    const [slidesSnap, testSnap, plansSnap, cyclesSnap, updatesSnap] = await Promise.all([
      getDocs(collection(db, 'hero_slides')),
      getDocs(collection(db, 'testimonials')),
      getDocs(collection(db, 'investment_plans')),
      getDocs(collection(db, 'public_cycles')),
      getDocs(collection(db, 'updates'))
    ]);

    const heroSlides = slidesSnap.docs
      .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
      .filter((s) => s.is_active !== 0)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

    const testimonials = testSnap.docs
      .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
      .filter((t) => t.is_active !== 0)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

    const plans = plansSnap.docs
      .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
      .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));

    const publicCycles = cyclesSnap.docs.map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));

    const updates = updatesSnap.docs
      .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
      .filter((u) => u.status !== 'draft')
      .sort((a, b) => String(b.published_date || '').localeCompare(String(a.published_date || '')));

    return {
      settings: settingsSnap.data(),
      heroSlides,
      testimonials,
      plans,
      publicCycles,
      updates
    };
  } catch (err) {
    console.warn('Cloud public site-data read failed, falling back:', err);
    return null;
  }
}

async function signInAdminWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;
  const isAdm = await checkAdminStatus(user);
  if (!isAdm) {
    await signOut(auth);
    throw new Error('This Google account (' + (user.email || '') + ') is not authorized as a SHIMOGY administrator.');
  }
  await seedCloudFromLocalDefaults();
  return {
    token: 'cloud_adm_' + user.uid,
    admin: { id: user.uid, email: user.email || '', name: user.displayName || 'SHIMOGY Administrator' }
  };
}

async function signInMemberWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;
  if (!user.emailVerified || !user.email) {
    await signOut(auth);
    throw new Error('Verified Google email is required.');
  }

  const lowerEmail = user.email.toLowerCase();
  let memberDocSnap = null;
  try {
    const qUid = await getDocs(query(collection(db, 'members'), where('uid', '==', user.uid)));
    if (!qUid.empty) memberDocSnap = qUid.docs[0];
    if (!memberDocSnap) {
      const qEmail = await getDocs(query(collection(db, 'members'), where('email', '==', lowerEmail)));
      if (!qEmail.empty) memberDocSnap = qEmail.docs[0];
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'members');
  }

  if (!memberDocSnap) {
    await signOut(auth);
    throw new Error('No SHIMOGY member account is linked to ' + user.email + '. Sign in with your Phone Number & Password or ask Operations to add your Gmail.');
  }

  const mData = memberDocSnap.data() as Record<string, unknown>;
  if (!mData.uid) {
    try {
      await setDoc(
        doc(db, 'members', memberDocSnap.id),
        {
          ...mData,
          uid: user.uid,
          updatedAt: serverTimestamp()
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'members/' + memberDocSnap.id);
    }
  }

  let ledgers: Record<string, unknown>[] = [];
  try {
    const lSnap = await getDocs(query(collection(db, 'member_ledgers'), where('member_email', '==', lowerEmail)));
    ledgers = lSnap.docs.map((d) => ({ _id: d.id, ...(d.data() as Record<string, unknown>) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'member_ledgers');
  }

  return {
    token: 'cloud_mem_uid_' + user.uid,
    member: {
      id: memberDocSnap.id,
      name: String(mData.name || ''),
      phone: String(mData.phone || ''),
      email: String(mData.email || ''),
      group_name: String(mData.group_name || ''),
      balance: Number(mData.balance || 0),
      total_invested: Number(mData.total_invested || 0),
      status: String(mData.status || 'active'),
      investments: ledgers.filter((l) => l.record_type === 'investment').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
      savings: ledgers.filter((l) => l.record_type === 'savings').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
      loans: ledgers.filter((l) => l.record_type === 'loan').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
      cycles: ledgers.filter((l) => l.record_type === 'cycle').map((l) => mapLedgerDocToLegacy(String(l._id), l))
    }
  };
}

async function loginMemberByPhonePassword(phone: string, password: string) {
  const norm = normalizePhone(phone);
  const credHash = await sha256Hex(norm + CRED_SALT_SEP + String(password || ''));
  const path = 'member_portals/' + credHash;
  try {
    const snap = await getDoc(doc(db, 'member_portals', credHash));
    if (!snap.exists()) return null;
    const d = snap.data() as Record<string, unknown>;
    return {
      token: 'cloud_portal_' + credHash,
      credHash,
      member: {
        id: String(d.memberId || snap.id),
        name: String(d.display_name || 'Member'),
        phone: norm,
        email: '',
        group_name: String(d.group_name || ''),
        balance: Number(d.balance || 0),
        total_invested: Number(d.total_invested || 0),
        status: String(d.status || 'active'),
        investments: Array.isArray(d.investments) ? d.investments : [],
        savings: Array.isArray(d.savings) ? d.savings : [],
        loans: Array.isArray(d.loans) ? d.loans : [],
        cycles: Array.isArray(d.cycles) ? d.cycles : []
      }
    };
  } catch (err) {
    console.warn('Cloud member lookup error on ' + path, err);
    return null;
  }
}

async function fetchMemberSessionFromCloud(token: string) {
  if (token.startsWith('cloud_portal_')) {
    const credHash = token.slice('cloud_portal_'.length);
    const snap = await getDoc(doc(db, 'member_portals', credHash));
    if (!snap.exists()) return null;
    const d = snap.data() as Record<string, unknown>;
    return {
      member: {
        id: String(d.memberId || snap.id),
        name: String(d.display_name || 'Member'),
        phone: '',
        email: '',
        group_name: String(d.group_name || ''),
        balance: Number(d.balance || 0),
        total_invested: Number(d.total_invested || 0),
        status: String(d.status || 'active'),
        investments: Array.isArray(d.investments) ? d.investments : [],
        savings: Array.isArray(d.savings) ? d.savings : [],
        loans: Array.isArray(d.loans) ? d.loans : [],
        cycles: Array.isArray(d.cycles) ? d.cycles : []
      }
    };
  }
  if (token.startsWith('cloud_mem_uid_') && auth.currentUser) {
    const uid = auth.currentUser.uid;
    const emailLower = (auth.currentUser.email || '').toLowerCase();
    const qUid = await getDocs(query(collection(db, 'members'), where('uid', '==', uid)));
    if (qUid.empty) return null;
    const memSnap = qUid.docs[0];
    const mData = memSnap.data() as Record<string, unknown>;
    let lSnap = await getDocs(query(collection(db, 'member_ledgers'), where('ownerUid', '==', uid)));
    if (lSnap.empty && emailLower) {
      lSnap = await getDocs(query(collection(db, 'member_ledgers'), where('member_email', '==', emailLower)));
    }
    const ledgers: Record<string, unknown>[] = lSnap.docs.map((d): Record<string, unknown> => ({ _id: d.id, ...(d.data() as Record<string, unknown>) }));
    return {
      member: {
        id: memSnap.id,
        name: String(mData.name || ''),
        phone: String(mData.phone || ''),
        email: String(mData.email || ''),
        group_name: String(mData.group_name || ''),
        balance: Number(mData.balance || 0),
        total_invested: Number(mData.total_invested || 0),
        status: String(mData.status || 'active'),
        investments: ledgers.filter((l) => l.record_type === 'investment').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
        savings: ledgers.filter((l) => l.record_type === 'savings').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
        loans: ledgers.filter((l) => l.record_type === 'loan').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
        cycles: ledgers.filter((l) => l.record_type === 'cycle').map((l) => mapLedgerDocToLegacy(String(l._id), l))
      }
    };
  }
  return null;
}

async function createServiceRequest(body: Record<string, unknown>) {
  const id = makeDocId('req');
  const rawDetails = (body.details && typeof body.details === 'object' ? body.details : {}) as Record<string, unknown>;
  const safeDetails: Record<string, string | number> = {};
  Object.keys(rawDetails)
    .slice(0, 10)
    .forEach((k) => {
      const v = rawDetails[k];
      safeDetails[String(k).slice(0, 40)] = typeof v === 'number' ? v : String(v ?? '').slice(0, 240);
    });

  const payload = {
    request_type: String(body.request_type || 'investment'),
    applicant_name: String(body.applicant_name || '').trim().slice(0, 140),
    applicant_phone: normalizePhone(String(body.applicant_phone || '')),
    details: safeDetails,
    age_confirmed: 1,
    guardian_name: String(body.guardian_name || '').trim().slice(0, 140),
    status: 'pending',
    submitterUid: auth.currentUser?.uid || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'service_requests', id), payload);
    return { id, status: 'pending' };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'service_requests/' + id);
  }
}

async function createDeletionRequest(body: Record<string, unknown>) {
  const id = makeDocId('del');
  try {
    await setDoc(doc(db, 'deletion_requests', id), {
      full_name: String(body.full_name || '').trim().slice(0, 140),
      phone: normalizePhone(String(body.phone || '')),
      email: String(body.email || '').trim().slice(0, 160),
      reason: String(body.reason || '').trim().slice(0, 1000),
      status: 'pending',
      submitterUid: auth.currentUser?.uid || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return {
      id,
      message: 'Your data deletion request has been logged. Our compliance team will process and confirm removal within 72 hours.'
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'deletion_requests/' + id);
  }
}

async function handleAdminApi(pathOnly: string, method: string, body: Record<string, unknown>): Promise<{ status: number; data: unknown } | null> {
  if (!isVerifiedAdminFlag || !auth.currentUser) {
    return null;
  }

  try {
    if (pathOnly === '/api/admin/me' && method === 'GET') {
      return {
        status: 200,
        data: { admin: { id: auth.currentUser.uid, email: auth.currentUser.email, name: auth.currentUser.displayName || 'Administrator' } }
      };
    }

    if (pathOnly === '/api/admin/overview' && method === 'GET') {
      await seedCloudFromLocalDefaults();
      const [settingsSnap, slidesSnap, testSnap, plansSnap, cyclesSnap, updatesSnap, membersSnap, ledgSnap, reqSnap, delSnap] =
        await Promise.all([
          getDoc(doc(db, 'site_settings', 'public')),
          getDocs(collection(db, 'hero_slides')),
          getDocs(collection(db, 'testimonials')),
          getDocs(collection(db, 'investment_plans')),
          getDocs(collection(db, 'public_cycles')),
          getDocs(collection(db, 'updates')),
          getDocs(collection(db, 'members')),
          getDocs(collection(db, 'member_ledgers')),
          getDocs(collection(db, 'service_requests')),
          getDocs(collection(db, 'deletion_requests'))
        ]);

      const ledgers: Record<string, unknown>[] = ledgSnap.docs.map((d): Record<string, unknown> => ({ _id: d.id, ...(d.data() as Record<string, unknown>) }));
      return {
        status: 200,
        data: {
          settings: settingsSnap.exists() ? settingsSnap.data() : {},
          heroSlides: slidesSnap.docs
            .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
            .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
          testimonials: testSnap.docs
            .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
            .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
          plans: plansSnap.docs
            .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
            .sort((a, b) => Number(a.price || 0) - Number(b.price || 0)),
          publicCycles: cyclesSnap.docs.map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
          updates: updatesSnap.docs
            .map((d): Record<string, unknown> => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
            .sort((a, b) => String(b.published_date || '').localeCompare(String(a.published_date || ''))),
          members: membersSnap.docs.map((d) => {
            const m = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              name: m.name,
              phone: m.phone,
              email: m.email || '',
              group_name: m.group_name || '',
              balance: Number(m.balance || 0),
              total_invested: Number(m.total_invested || 0),
              status: m.status || 'active',
              age_verified: m.age_verified ?? 1,
              guardian_name: m.guardian_name || ''
            };
          }),
          investments: ledgers.filter((l) => l.record_type === 'investment').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
          savings: ledgers.filter((l) => l.record_type === 'savings').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
          loans: ledgers.filter((l) => l.record_type === 'loan').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
          memberCycles: ledgers.filter((l) => l.record_type === 'cycle').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
          requests: reqSnap.docs.map((d) => {
            const r = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              request_type: r.request_type,
              applicant_name: r.applicant_name,
              applicant_phone: r.applicant_phone,
              details_json: JSON.stringify(r.details || {}),
              age_confirmed: r.age_confirmed ?? 1,
              guardian_name: r.guardian_name || '',
              status: r.status || 'pending',
              created_at: formatTs(r.createdAt)
            };
          }),
          deletionRequests: delSnap.docs.map((d) => {
            const dr = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              full_name: dr.full_name,
              phone: dr.phone,
              email: dr.email || '',
              reason: dr.reason || '',
              status: dr.status || 'pending',
              requested_at: formatTs(dr.createdAt)
            };
          })
        }
      };
    }

    if (pathOnly === '/api/admin/settings' && method === 'PUT') {
      const ref = doc(db, 'site_settings', 'public');
      const cur = await getDoc(ref);
      const existing = cur.exists() ? (cur.data() as Record<string, unknown>) : {};
      const allowedKeys = [
        'company_name', 'short_name', 'slogan', 'registration_info',
        'phone_primary', 'phone_secondary', 'whatsapp_number', 'email',
        'address', 'working_hours', 'social_facebook', 'social_tiktok',
        'social_youtube', 'social_instagram', 'logo_url', 'about_mission',
        'about_vision', 'about_story', 'stats_members', 'stats_capital',
        'stats_years', 'stats_hours', 'risk_disclosure', 'age_consent_policy',
        'quick_updates_ticker'
      ];
      const next: Record<string, unknown> = { company_name: String(existing.company_name || 'SHIMOGY Investment Group Ltd') };
      for (const k of allowedKeys) {
        if (k in body) next[k] = String(body[k] ?? '');
        else if (k in existing) next[k] = String(existing[k] ?? '');
      }
      next.updatedAt = serverTimestamp();
      await setDoc(ref, next);
      return { status: 200, data: { success: true } };
    }

    if (pathOnly === '/api/admin/upload' && method === 'POST') {
      if (!body.dataUrl || typeof body.dataUrl !== 'string') {
        return { status: 400, data: { error: 'Valid image file is required.' } };
      }
      if (body.dataUrl.length > 118000) {
        return { status: 400, data: { error: 'Compressed image exceeds 118 KB cloud limit. Please choose a smaller image or use an external image URL.' } };
      }
      return { status: 200, data: { id: Date.now(), url: body.dataUrl } };
    }

    if (pathOnly === '/api/admin/change-password' && method === 'POST') {
      return { status: 200, data: { success: true } };
    }

    // Hero slides
    if (pathOnly === '/api/admin/hero-slides' && method === 'POST') {
      const id = makeDocId('slide');
      await setDoc(doc(db, 'hero_slides', id), {
        badge_text: String(body.badge_text || ''),
        title: String(body.title || ''),
        subtitle: String(body.subtitle || ''),
        cta_text: String(body.cta_text || 'Explore Plans'),
        cta_link: String(body.cta_link || 'investments.html'),
        image_url: String(body.image_url || 'assets/aistudio/partnership_65dac3a6.jpg'),
        image_alt: String(body.image_alt || body.title || ''),
        sort_order: Number(body.sort_order || 1),
        is_active: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { status: 201, data: { id } };
    }
    const mHero = pathOnly.match(/^\/api\/admin\/hero-slides\/([a-zA-Z0-9_\-]+)$/);
    if (mHero) {
      const id = mHero[1];
      if (method === 'PUT') {
        const cur = await getDoc(doc(db, 'hero_slides', id));
        const ex = cur.exists() ? (cur.data() as Record<string, unknown>) : {};
        await setDoc(doc(db, 'hero_slides', id), {
          badge_text: String(body.badge_text ?? ex.badge_text ?? ''),
          title: String(body.title ?? ex.title ?? ''),
          subtitle: String(body.subtitle ?? ex.subtitle ?? ''),
          cta_text: String(body.cta_text ?? ex.cta_text ?? 'Explore Plans'),
          cta_link: String(body.cta_link ?? ex.cta_link ?? 'investments.html'),
          image_url: String(body.image_url ?? ex.image_url ?? 'assets/aistudio/partnership_65dac3a6.jpg'),
          image_alt: String(body.image_alt ?? ex.image_alt ?? ''),
          sort_order: Number(body.sort_order ?? ex.sort_order ?? 1),
          is_active: Number(ex.is_active ?? 1),
          createdAt: ex.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { status: 200, data: { success: true } };
      }
      if (method === 'DELETE') {
        await deleteDoc(doc(db, 'hero_slides', id));
        return { status: 200, data: { success: true } };
      }
    }

    // Testimonials
    if (pathOnly === '/api/admin/testimonials' && method === 'POST') {
      const id = makeDocId('test');
      await setDoc(doc(db, 'testimonials', id), {
        client_name: String(body.client_name || ''),
        role: String(body.role || 'Verified Client'),
        location: String(body.location || 'Kampala, Uganda'),
        quote: String(body.quote || ''),
        photo_url: String(body.photo_url || 'assets/aistudio/josephine_a1a0850e.jpg'),
        photo_alt: String(body.photo_alt || ''),
        sort_order: Number(body.sort_order || 1),
        is_active: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { status: 201, data: { id } };
    }
    const mTest = pathOnly.match(/^\/api\/admin\/testimonials\/([a-zA-Z0-9_\-]+)$/);
    if (mTest) {
      const id = mTest[1];
      if (method === 'PUT') {
        const cur = await getDoc(doc(db, 'testimonials', id));
        const ex = cur.exists() ? (cur.data() as Record<string, unknown>) : {};
        await setDoc(doc(db, 'testimonials', id), {
          client_name: String(body.client_name ?? ex.client_name ?? ''),
          role: String(body.role ?? ex.role ?? 'Verified Client'),
          location: String(body.location ?? ex.location ?? 'Kampala, Uganda'),
          quote: String(body.quote ?? ex.quote ?? ''),
          photo_url: String(body.photo_url ?? ex.photo_url ?? 'assets/aistudio/josephine_a1a0850e.jpg'),
          photo_alt: String(body.photo_alt ?? ex.photo_alt ?? ''),
          sort_order: Number(body.sort_order ?? ex.sort_order ?? 1),
          is_active: Number(ex.is_active ?? 1),
          createdAt: ex.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { status: 200, data: { success: true } };
      }
      if (method === 'DELETE') {
        await deleteDoc(doc(db, 'testimonials', id));
        return { status: 200, data: { success: true } };
      }
    }

    // Plans
    if (pathOnly === '/api/admin/plans' && method === 'POST') {
      const id = makeDocId('plan');
      await setDoc(doc(db, 'investment_plans', id), {
        name: String(body.name || ''),
        price: Number(body.price || 0),
        expected_return: Number(body.expected_return || 0),
        duration: String(body.duration || '60 Days'),
        risk: ['Low', 'Medium', 'High'].includes(String(body.risk)) ? String(body.risk) : 'Low',
        risk_level: Number(body.risk === 'High' ? 3 : body.risk === 'Medium' ? 2 : 1),
        description: String(body.description || ''),
        image_url: String(body.image_url || 'assets/aistudio/graph_ddbd7244.jpg'),
        image_alt: String(body.image_alt || body.name || ''),
        slots_left: Number(body.slots_left ?? 5),
        status: String(body.status) === 'closed' ? 'closed' : 'available',
        badge: String(body.badge || ''),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { status: 201, data: { id } };
    }
    const mPlan = pathOnly.match(/^\/api\/admin\/plans\/([a-zA-Z0-9_\-]+)$/);
    if (mPlan) {
      const id = mPlan[1];
      if (method === 'PUT') {
        const cur = await getDoc(doc(db, 'investment_plans', id));
        const ex = cur.exists() ? (cur.data() as Record<string, unknown>) : {};
        await setDoc(doc(db, 'investment_plans', id), {
          name: String(body.name ?? ex.name ?? ''),
          price: Number(body.price ?? ex.price ?? 0),
          expected_return: Number(body.expected_return ?? ex.expected_return ?? 0),
          duration: String(body.duration ?? ex.duration ?? '60 Days'),
          risk: ['Low', 'Medium', 'High'].includes(String(body.risk ?? ex.risk)) ? String(body.risk ?? ex.risk) : 'Low',
          risk_level: Number((body.risk ?? ex.risk) === 'High' ? 3 : (body.risk ?? ex.risk) === 'Medium' ? 2 : 1),
          description: String(body.description ?? ex.description ?? ''),
          image_url: String(body.image_url ?? ex.image_url ?? 'assets/aistudio/graph_ddbd7244.jpg'),
          image_alt: String(body.image_alt ?? ex.image_alt ?? ''),
          slots_left: Number(body.slots_left ?? ex.slots_left ?? 0),
          status: String(body.status ?? ex.status) === 'closed' ? 'closed' : 'available',
          badge: String(body.badge ?? ex.badge ?? ''),
          createdAt: ex.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { status: 200, data: { success: true } };
      }
      if (method === 'DELETE') {
        await deleteDoc(doc(db, 'investment_plans', id));
        return { status: 200, data: { success: true } };
      }
    }

    // Public Cycles
    if (pathOnly === '/api/admin/public-cycles' && method === 'POST') {
      const id = makeDocId('cyc');
      await setDoc(doc(db, 'public_cycles', id), {
        name: String(body.name || ''),
        contribution: Number(body.contribution || 0),
        payout_duration: String(body.payout_duration || 'Weekly'),
        description: String(body.description || ''),
        image_url: String(body.image_url || 'assets/aistudio/partnership_65dac3a6.jpg'),
        image_alt: String(body.image_alt || body.name || ''),
        status: 'Active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { status: 201, data: { id } };
    }
    const mPubCyc = pathOnly.match(/^\/api\/admin\/public-cycles\/([a-zA-Z0-9_\-]+)$/);
    if (mPubCyc) {
      const id = mPubCyc[1];
      if (method === 'PUT') {
        const cur = await getDoc(doc(db, 'public_cycles', id));
        const ex = cur.exists() ? (cur.data() as Record<string, unknown>) : {};
        await setDoc(doc(db, 'public_cycles', id), {
          name: String(body.name ?? ex.name ?? ''),
          contribution: Number(body.contribution ?? ex.contribution ?? 0),
          payout_duration: String(body.payout_duration ?? ex.payout_duration ?? 'Weekly'),
          description: String(body.description ?? ex.description ?? ''),
          image_url: String(body.image_url ?? ex.image_url ?? 'assets/aistudio/partnership_65dac3a6.jpg'),
          image_alt: String(body.image_alt ?? ex.image_alt ?? ''),
          status: String(body.status ?? ex.status ?? 'Active'),
          createdAt: ex.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { status: 200, data: { success: true } };
      }
      if (method === 'DELETE') {
        await deleteDoc(doc(db, 'public_cycles', id));
        return { status: 200, data: { success: true } };
      }
    }

    // Updates
    if (pathOnly === '/api/admin/updates' && method === 'POST') {
      const id = makeDocId('upd');
      await setDoc(doc(db, 'updates', id), {
        title: String(body.title || ''),
        category: ['news', 'story', 'tip', 'event'].includes(String(body.category)) ? String(body.category) : 'news',
        excerpt: String(body.excerpt || ''),
        detail: String(body.detail || ''),
        image_url: String(body.image_url || 'assets/aistudio/graph_ddbd7244.jpg'),
        image_alt: String(body.image_alt || body.title || ''),
        published_date: String(body.published_date || todayISO()),
        status: 'published',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { status: 201, data: { id } };
    }
    const mUpd = pathOnly.match(/^\/api\/admin\/updates\/([a-zA-Z0-9_\-]+)$/);
    if (mUpd && method === 'DELETE') {
      await deleteDoc(doc(db, 'updates', mUpd[1]));
      return { status: 200, data: { success: true } };
    }

    // Create Member + Initial Ledgers + Cross-Device Portal Snapshot
    if (pathOnly === '/api/admin/members' && method === 'POST') {
      const phone = normalizePhone(String(body.phone || ''));
      const pass = String(body.password || '').trim();
      if (!body.name || !phone || !pass) {
        return { status: 400, data: { error: 'Name, phone, and portal password are required.' } };
      }
      const existingQ = await getDocs(query(collection(db, 'members'), where('phone', '==', phone)));
      if (!existingQ.empty) {
        return { status: 409, data: { error: 'A member with this phone number already exists.' } };
      }

      const memId = 'mem_' + phone + '_' + Date.now().toString(36);
      const credHash = await sha256Hex(phone + CRED_SALT_SEP + pass);
      const passHash = await sha256Hex(pass);

      const nestedInv = (body.investment && typeof body.investment === 'object' ? body.investment : null) as Record<string, unknown> | null;
      const nestedSav = (body.savings && typeof body.savings === 'object' ? body.savings : null) as Record<string, unknown> | null;
      const nestedLoan = (body.loan && typeof body.loan === 'object' ? body.loan : null) as Record<string, unknown> | null;
      const nestedCycle = (body.cycle && typeof body.cycle === 'object' ? body.cycle : null) as Record<string, unknown> | null;

      const invPlanName = String(nestedInv?.plan_name || body.initial_investment_plan || '').trim();
      const invAmt = Number(nestedInv?.amount ?? body.initial_investment_amount ?? body.total_invested ?? 0);
      const invRet = Number(nestedInv?.expected_return ?? body.initial_investment_return ?? invAmt);
      const invDur = String(nestedInv?.duration || body.initial_investment_duration || '60 Days');

      const savType = String(nestedSav?.account_type || body.initial_savings_type || '').trim();
      const savBal = Number(nestedSav?.balance ?? body.initial_savings_balance ?? 0);

      const loanAmt = Number(nestedLoan?.amount ?? body.initial_loan_amount ?? 0);
      const loanPurpose = String(nestedLoan?.purpose || body.initial_loan_purpose || 'Member Business Loan').trim() || 'Member Business Loan';
      const loanDur = String(nestedLoan?.duration || body.initial_loan_duration || '30 days');
      const loanRate = String(nestedLoan?.interest_rate || body.initial_loan_rate || '10%');
      const loanStatus = String(nestedLoan?.status || 'active');

      const cycName = String(nestedCycle?.cycle_name || body.initial_cycle_name || '').trim();
      const cycContrib = Number(nestedCycle?.contribution ?? body.initial_cycle_contribution ?? 0);
      const cycPayout = String(nestedCycle?.payout_duration || body.initial_cycle_payout || 'Weekly');
      const cycMembers = Number(nestedCycle?.number_of_members ?? body.initial_cycle_members ?? 10);

      const baseBal = Number(body.balance || 0);
      const totalBal = baseBal + savBal;
      const memEmail = String(body.email || '').trim().toLowerCase();

      await setDoc(doc(db, 'members', memId), {
        name: String(body.name).trim(),
        phone,
        email: memEmail,
        uid: '',
        group_name: String(body.group_name || '').trim(),
        balance: totalBal,
        total_invested: invAmt,
        status: 'active',
        pass_hash: passHash,
        cred_hash: credHash,
        age_verified: 1,
        guardian_name: String(body.guardian_name || '').trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      if (invPlanName && invAmt > 0) {
        await setDoc(doc(db, 'member_ledgers', makeDocId('inv')), {
          memberId: memId,
          member_phone: phone,
          member_email: memEmail,
          member_name: String(body.name).trim(),
          ownerUid: '',
          record_type: 'investment',
          title: invPlanName,
          amount: invAmt,
          expected_return: invRet,
          duration: invDur,
          date_str: todayISO(),
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      if (savType) {
        await setDoc(doc(db, 'member_ledgers', makeDocId('sav')), {
          memberId: memId,
          member_phone: phone,
          member_email: memEmail,
          member_name: String(body.name).trim(),
          ownerUid: '',
          record_type: 'savings',
          title: savType,
          amount: savBal,
          date_str: todayISO(),
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      if (loanAmt > 0) {
        await setDoc(doc(db, 'member_ledgers', makeDocId('loan')), {
          memberId: memId,
          member_phone: phone,
          member_email: memEmail,
          member_name: String(body.name).trim(),
          ownerUid: '',
          record_type: 'loan',
          title: loanPurpose,
          amount: loanAmt,
          duration: loanDur,
          interest_rate: loanRate,
          purpose: loanPurpose,
          date_str: todayISO(),
          status: loanStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      if (cycName && cycContrib > 0) {
        await setDoc(doc(db, 'member_ledgers', makeDocId('mcyc')), {
          memberId: memId,
          member_phone: phone,
          member_email: memEmail,
          member_name: String(body.name).trim(),
          ownerUid: '',
          record_type: 'cycle',
          title: cycName,
          amount: cycContrib,
          duration: cycPayout,
          number_of_members: cycMembers,
          date_str: todayISO(),
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      await rebuildMemberPortalSnapshot(memId);
      return { status: 201, data: { id: memId, success: true } };
    }

    const mFindPhone = pathOnly.match(/^\/api\/admin\/member\/(.+)$/);
    if (mFindPhone && method === 'GET') {
      const rawLookup = decodeURIComponent(mFindPhone[1]);
      const lookupPhone = normalizePhone(rawLookup);
      const qMem = await getDocs(query(collection(db, 'members'), where('phone', '==', lookupPhone)));
      if (qMem.empty) return { status: 404, data: { error: 'Member not found.' } };
      const memSnap = qMem.docs[0];
      const mData = memSnap.data() as Record<string, unknown>;
      const lSnap = await getDocs(query(collection(db, 'member_ledgers'), where('memberId', '==', memSnap.id)));
      const ledgers: Record<string, unknown>[] = lSnap.docs.map((d): Record<string, unknown> => ({ _id: d.id, ...(d.data() as Record<string, unknown>) }));
      return {
        status: 200,
        data: {
          member: {
            id: memSnap.id,
            name: mData.name,
            phone: mData.phone,
            email: mData.email || '',
            group_name: mData.group_name || '',
            balance: Number(mData.balance || 0),
            total_invested: Number(mData.total_invested || 0),
            status: mData.status || 'active',
            investments: ledgers.filter((l) => l.record_type === 'investment').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
            savings: ledgers.filter((l) => l.record_type === 'savings').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
            loans: ledgers.filter((l) => l.record_type === 'loan').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
            cycles: ledgers.filter((l) => l.record_type === 'cycle').map((l) => mapLedgerDocToLegacy(String(l._id), l))
          }
        }
      };
    }

    const mMem = pathOnly.match(/^\/api\/admin\/members\/([a-zA-Z0-9_\-]+)$/);
    if (mMem) {
      const memId = mMem[1];
      const memRef = doc(db, 'members', memId);
      if (method === 'GET') {
        const memSnap = await getDoc(memRef);
        if (!memSnap.exists()) return { status: 404, data: { error: 'Member not found.' } };
        const mData = memSnap.data() as Record<string, unknown>;
        const lSnap = await getDocs(query(collection(db, 'member_ledgers'), where('memberId', '==', memId)));
        const ledgers: Record<string, unknown>[] = lSnap.docs.map((d): Record<string, unknown> => ({ _id: d.id, ...(d.data() as Record<string, unknown>) }));
        return {
          status: 200,
          data: {
            member: {
              id: memSnap.id,
              name: mData.name,
              phone: mData.phone,
              email: mData.email || '',
              group_name: mData.group_name || '',
              balance: Number(mData.balance || 0),
              total_invested: Number(mData.total_invested || 0),
              status: mData.status || 'active',
              investments: ledgers.filter((l) => l.record_type === 'investment').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
              savings: ledgers.filter((l) => l.record_type === 'savings').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
              loans: ledgers.filter((l) => l.record_type === 'loan').map((l) => mapLedgerDocToLegacy(String(l._id), l)),
              cycles: ledgers.filter((l) => l.record_type === 'cycle').map((l) => mapLedgerDocToLegacy(String(l._id), l))
            }
          }
        };
      }
      if (method === 'PUT') {
        const memSnap = await getDoc(memRef);
        if (!memSnap.exists()) return { status: 404, data: { error: 'Member not found.' } };
        const ex = memSnap.data() as Record<string, unknown>;
        const nextPhone = body.phone ? normalizePhone(String(body.phone)) : String(ex.phone);
        let nextCredHash = String(ex.cred_hash || '');
        let nextPassHash = String(ex.pass_hash || '');
        const rawNewPass = String(body.new_password || body.password || '').trim();
        if (rawNewPass.length >= 4) {
          const newHash = await sha256Hex(nextPhone + CRED_SALT_SEP + rawNewPass);
          if (nextCredHash && nextCredHash !== newHash) {
            try { await deleteDoc(doc(db, 'member_portals', nextCredHash)); } catch {}
          }
          nextCredHash = newHash;
          nextPassHash = await sha256Hex(rawNewPass);
        }
        await setDoc(memRef, {
          name: String(body.name ?? ex.name),
          phone: nextPhone,
          email: String(body.email ?? ex.email ?? '').trim().toLowerCase(),
          uid: String(ex.uid || ''),
          group_name: String(body.group_name ?? ex.group_name ?? ''),
          balance: Number(body.balance ?? ex.balance ?? 0),
          total_invested: Number(body.total_invested ?? ex.total_invested ?? 0),
          status: ['active', 'pending', 'suspended'].includes(String(body.status ?? ex.status)) ? String(body.status ?? ex.status) : 'active',
          pass_hash: nextPassHash,
          cred_hash: nextCredHash,
          age_verified: Number(ex.age_verified ?? 1),
          guardian_name: String(ex.guardian_name || ''),
          createdAt: ex.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        await rebuildMemberPortalSnapshot(memId);
        return { status: 200, data: { success: true } };
      }
      if (method === 'DELETE') {
        const memSnap = await getDoc(memRef);
        if (memSnap.exists()) {
          const ex = memSnap.data() as Record<string, unknown>;
          if (ex.cred_hash) {
            try { await deleteDoc(doc(db, 'member_portals', String(ex.cred_hash))); } catch {}
          }
          const lSnap = await getDocs(query(collection(db, 'member_ledgers'), where('memberId', '==', memId)));
          for (const ld of lSnap.docs) {
            await deleteDoc(doc(db, 'member_ledgers', ld.id));
          }
          await deleteDoc(memRef);
        }
        return { status: 200, data: { success: true } };
      }
    }

    // Helper to find member doc by phone for ledger additions
    const findMemberByPhone = async (rawPhone: string) => {
      const phone = normalizePhone(rawPhone);
      const qM = await getDocs(query(collection(db, 'members'), where('phone', '==', phone)));
      return qM.empty ? null : qM.docs[0];
    };

    if (pathOnly === '/api/admin/investments' && method === 'POST') {
      const mDoc = await findMemberByPhone(String(body.member_phone || ''));
      if (!mDoc) return { status: 404, data: { error: 'No registered member found with that phone number. Create the member first.' } };
      const m = mDoc.data() as Record<string, unknown>;
      const amt = Number(body.amount || 0);
      await setDoc(doc(db, 'member_ledgers', makeDocId('inv')), {
        memberId: mDoc.id,
        member_phone: String(m.phone || ''),
        member_email: String(m.email || ''),
        member_name: String(body.member_name || m.name || 'Member'),
        ownerUid: String(m.uid || ''),
        record_type: 'investment',
        title: String(body.plan_name || ''),
        amount: amt,
        expected_return: Number(body.expected_return || amt),
        duration: String(body.duration || '60 Days'),
        date_str: todayISO(),
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, 'members', mDoc.id), {
        ...m,
        total_invested: Number(m.total_invested || 0) + amt,
        updatedAt: serverTimestamp()
      });
      await rebuildMemberPortalSnapshot(mDoc.id);
      return { status: 201, data: { success: true } };
    }

    if (pathOnly === '/api/admin/savings' && method === 'POST') {
      const mDoc = await findMemberByPhone(String(body.member_phone || ''));
      if (!mDoc) return { status: 404, data: { error: 'No registered member found with that phone number.' } };
      const m = mDoc.data() as Record<string, unknown>;
      const bal = Number(body.balance || 0);
      await setDoc(doc(db, 'member_ledgers', makeDocId('sav')), {
        memberId: mDoc.id,
        member_phone: String(m.phone || ''),
        member_email: String(m.email || ''),
        member_name: String(body.member_name || m.name || 'Member'),
        ownerUid: String(m.uid || ''),
        record_type: 'savings',
        title: String(body.account_type || 'Current Account'),
        amount: bal,
        date_str: todayISO(),
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, 'members', mDoc.id), {
        ...m,
        balance: Number(m.balance || 0) + bal,
        updatedAt: serverTimestamp()
      });
      await rebuildMemberPortalSnapshot(mDoc.id);
      return { status: 201, data: { success: true } };
    }

    if (pathOnly === '/api/admin/loans' && method === 'POST') {
      const mDoc = await findMemberByPhone(String(body.member_phone || ''));
      if (!mDoc) return { status: 404, data: { error: 'No registered member found with that phone number.' } };
      const m = mDoc.data() as Record<string, unknown>;
      await setDoc(doc(db, 'member_ledgers', makeDocId('loan')), {
        memberId: mDoc.id,
        member_phone: String(m.phone || ''),
        member_email: String(m.email || ''),
        member_name: String(body.member_name || m.name || 'Member'),
        ownerUid: String(m.uid || ''),
        record_type: 'loan',
        title: String(body.purpose || 'Member Loan'),
        amount: Number(body.amount || 0),
        duration: String(body.duration || '30 days'),
        interest_rate: String(body.interest_rate || '10%'),
        purpose: String(body.purpose || 'Member Loan'),
        date_str: todayISO(),
        status: String(body.status || 'active'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await rebuildMemberPortalSnapshot(mDoc.id);
      return { status: 201, data: { success: true } };
    }

    const mLoan = pathOnly.match(/^\/api\/admin\/loans\/([a-zA-Z0-9_\-]+)$/);
    if (mLoan) {
      const lRef = doc(db, 'member_ledgers', mLoan[1]);
      const lSnap = await getDoc(lRef);
      if (lSnap.exists()) {
        const ld = lSnap.data() as Record<string, unknown>;
        if (method === 'PUT') {
          await setDoc(lRef, { ...ld, status: String(body.status || 'paid'), updatedAt: serverTimestamp() });
          await rebuildMemberPortalSnapshot(String(ld.memberId));
          return { status: 200, data: { success: true } };
        }
        if (method === 'DELETE') {
          await deleteDoc(lRef);
          await rebuildMemberPortalSnapshot(String(ld.memberId));
          return { status: 200, data: { success: true } };
        }
      }
      return { status: 200, data: { success: true } };
    }

    if (pathOnly === '/api/admin/member-cycles' && method === 'POST') {
      const mDoc = await findMemberByPhone(String(body.member_phone || ''));
      if (!mDoc) return { status: 404, data: { error: 'No registered member found with that phone number.' } };
      const m = mDoc.data() as Record<string, unknown>;
      await setDoc(doc(db, 'member_ledgers', makeDocId('mcyc')), {
        memberId: mDoc.id,
        member_phone: String(m.phone || ''),
        member_email: String(m.email || ''),
        member_name: String(body.member_name || m.name || 'Member'),
        ownerUid: String(m.uid || ''),
        record_type: 'cycle',
        title: String(body.cycle_name || ''),
        amount: Number(body.contribution || 0),
        duration: String(body.payout_duration || 'Weekly'),
        number_of_members: Number(body.number_of_members || 10),
        date_str: todayISO(),
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await rebuildMemberPortalSnapshot(mDoc.id);
      return { status: 201, data: { success: true } };
    }

    const mReq = pathOnly.match(/^\/api\/admin\/requests\/([a-zA-Z0-9_\-]+)$/);
    if (mReq) {
      const rRef = doc(db, 'service_requests', mReq[1]);
      if (method === 'PUT') {
        const rSnap = await getDoc(rRef);
        if (rSnap.exists()) {
          const ex = rSnap.data() as Record<string, unknown>;
          await setDoc(rRef, { ...ex, status: String(body.status || 'reviewed'), updatedAt: serverTimestamp() });
        }
        return { status: 200, data: { success: true } };
      }
      if (method === 'DELETE') {
        await deleteDoc(rRef);
        return { status: 200, data: { success: true } };
      }
    }

    const mDel = pathOnly.match(/^\/api\/admin\/deletion-requests\/([a-zA-Z0-9_\-]+)\/process$/);
    if (mDel && method === 'POST') {
      const dRef = doc(db, 'deletion_requests', mDel[1]);
      const dSnap = await getDoc(dRef);
      if (dSnap.exists()) {
        const ex = dSnap.data() as Record<string, unknown>;
        if (body.action === 'purge') {
          const targetPhone = normalizePhone(String(ex.phone || ''));
          const qM = await getDocs(query(collection(db, 'members'), where('phone', '==', targetPhone)));
          for (const mDoc of qM.docs) {
            const mData = mDoc.data() as Record<string, unknown>;
            if (mData.cred_hash) {
              try { await deleteDoc(doc(db, 'member_portals', String(mData.cred_hash))); } catch {}
            }
            const lSnap = await getDocs(query(collection(db, 'member_ledgers'), where('memberId', '==', mDoc.id)));
            for (const ld of lSnap.docs) {
              await deleteDoc(doc(db, 'member_ledgers', ld.id));
            }
            await deleteDoc(doc(db, 'members', mDoc.id));
          }
        }
        await setDoc(dRef, {
          ...ex,
          status: body.action === 'reject' ? 'rejected' : 'completed',
          updatedAt: serverTimestamp()
        });
      }
      return { status: 200, data: { success: true } };
    }
  } catch (err) {
    console.error('Cloud Admin API error:', err);
    const msg = err instanceof Error ? err.message : 'Cloud database error';
    return { status: 400, data: { error: msg } };
  }

  return null;
}

(window as unknown as Record<string, unknown>).ShimogyCloud = {
  isEnabled: () => true,
  waitForAuthReady: () => authReadyPromise,
  isAdminSignedIn: () => isVerifiedAdminFlag && !!auth.currentUser,
  getCurrentUser: () => auth.currentUser,
  signInAdminWithGoogle,
  signInMemberWithGoogle,
  signOutCloud: async () => {
    isVerifiedAdminFlag = false;
    await signOut(auth);
  },
  loginMemberByPhonePassword,
  fetchMemberSessionFromCloud,
  getPublicSiteData,
  createServiceRequest,
  createDeletionRequest,
  handleAdminApi
};
