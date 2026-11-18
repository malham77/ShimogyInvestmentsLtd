# SHIMOGY Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Baseline**: Every path not explicitly matched is denied for all reads and writes (`match /{document=**} { allow read, write: if false; }`).
2. **Admin Privilege Verification**: Admin privileges are NEVER accepted from client claims alone. `isAdmin()` requires `request.auth != null`, `request.auth.token.email_verified == true`, and either existence of `/admins/$(request.auth.uid)` or verified match against the bootstrapped administrator email (`mal77ham@gmail.com`, `maleham06@gmail.com`).
3. **PII Isolation**:
   - `/members/{memberId}` and `/member_ledgers/{ledgerId}` contain phone numbers/emails and are readable ONLY by `isAdmin()` or the verified Firebase Auth owner (`uid == request.auth.uid` or verified email match).
   - `/service_requests/{requestId}` and `/deletion_requests/{requestId}` are readable/updatable/deletable ONLY by `isAdmin()`.
   - `/member_portals/{credHash}` strips PII (`phone`, `email`, `pass_hash`), prohibits `list` for non-admins (`allow list: if isAdmin();`), and permits single-doc `get` only on an exact 64-character SHA-256 hex digest key.
4. **Validation Blueprint & Strict Keys**: Every write validates required fields, `hasOnly(...)` allowlists, data types, string/list `.size()` caps, ID regex `^[a-zA-Z0-9_\-]+$`, server timestamps (`request.time`), and immutable `createdAt`.
5. **Terminal State Locking**: Requests reaching terminal statuses (`approved`, `declined`, `completed`, `rejected`) cannot be altered by non-admin callers.

## 2. "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Admin Write**: Anonymous/unauthenticated user tries `setDoc(/site_settings/public, { company_name: "Hacked" })`. -> DENIED.
2. **Unverified Email Admin Spoof**: User with unverified email token (`email_verified: false`, `email: "mal77ham@gmail.com"`) tries `create /admins/{uid}`. -> DENIED.
3. **Privilege Self-Escalation**: Non-admin authenticated user creates `/admins/{theirUid}` with `{ role: "admin", email: "attacker@gmail.com" }`. -> DENIED.
4. **Shadow Field Injection on Member**: Admin or user tries creating `/members/m1` with an extra shadow field `{ isVerifiedAdmin: true }`. -> DENIED by `keys().hasOnly(...)`.
5. **PII Scraping via List**: Non-admin authenticated user runs `getDocs(collection(db, "members"))`. -> DENIED by query enforcer (`resource.data.uid == request.auth.uid`).
6. **Cross-User PII Get**: Authenticated member A tries `getDoc(doc(db, "members", "memberB"))`. -> DENIED.
7. **Service Request Enumeration**: Unauthenticated or non-admin user runs `getDocs(collection(db, "service_requests"))`. -> DENIED.
8. **ID Poisoning**: Caller attempts `getDoc(doc(db, "member_portals", "short_id"))` (not 64-char hex) or writes document with 500-char ID. -> DENIED by `isValidId()` & `credHash.size() == 64`.
9. **Resource Exhaustion / Denial of Wallet**: Caller sends a 2MB `description` string on `/service_requests/{id}`. -> DENIED by `size() <= 1000` bounds.
10. **Timestamp Forgery**: Caller writes `createdAt: "2020-01-01"` instead of `request.time`. -> DENIED by `incoming().createdAt == request.time`.
11. **Member Role/Balance Tampering**: Authenticated member tries updating their own `balance` or `total_invested` in `/members/{memberId}`. -> DENIED (`affectedKeys().hasOnly(['uid', 'updatedAt'])`).
12. **Member Portal List Scraping**: Any non-admin runs `getDocs(collection(db, "member_portals"))`. -> DENIED (`allow list: if isAdmin();`).
