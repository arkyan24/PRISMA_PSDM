const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const os = require('os');

const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'prisma_data') : path.join(__dirname, '..', 'data');
const VAULT_FILE = path.join(DATA_DIR, 'auth_vault.json');

const DEFAULT_VAULT = {
  owner: null,
  users: [],
  password_history: [],
  pending_registrations: [],
  sessions: [],
  _next_ids: { users: 1, pending_registrations: 1 }
};

let _vault = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

const JWT_SECRET = process.env.SESSION_SECRET || 'prisma_psdm_muhammadiyah_vault_secret_key_2026';

function signToken(payload) {
  const dataStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(dataStr).digest('base64url');
  return `${dataStr}.${sig}`;
}

function verifyToken(tokenString) {
  if (!tokenString || typeof tokenString !== 'string' || !tokenString.includes('.')) {
    return null;
  }
  const parts = tokenString.split('.');
  if (parts.length !== 2) return null;
  const [dataStr, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(dataStr).digest('base64url');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

  try {
    const payload = JSON.parse(Buffer.from(dataStr, 'base64url').toString('utf-8'));
    if (!payload || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

function copySeedVault() {
  const seedPath = path.join(__dirname, '..', 'data', 'auth_vault.json');
  if (fs.existsSync(seedPath)) {
    try {
      const raw = fs.readFileSync(seedPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (process.env.VERCEL) {
        try {
          fs.writeFileSync(VAULT_FILE, raw, 'utf-8');
        } catch (e) {}
      }
      return parsed;
    } catch (e) {}
  }
  return JSON.parse(JSON.stringify(DEFAULT_VAULT));
}

function loadVault() {
  ensureDir();
  if (!_vault) {
    if (fs.existsSync(VAULT_FILE)) {
      try {
        const raw = fs.readFileSync(VAULT_FILE, 'utf-8');
        _vault = JSON.parse(raw);
        for (const key of Object.keys(DEFAULT_VAULT)) {
          if (!(key in _vault)) _vault[key] = DEFAULT_VAULT[key];
        }
      } catch (err) {
        console.error('[Vault] Corrupt auth_vault.json, reinitializing from seed:', err.message);
        _vault = copySeedVault();
      }
    } else {
      _vault = copySeedVault();
    }
  }
  return _vault;
}

const mongo = require('./mongodb');

function saveVault() {
  ensureDir();
  if (_vault) {
    try {
      fs.writeFileSync(VAULT_FILE, JSON.stringify(_vault, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[Vault] Unable to write vault file:', e.message);
    }
    if (mongo.isMongoEnabled()) {
      mongo.saveVaultToMongo(_vault).catch(err => {
        console.error('[Vault] Error syncing to MongoDB:', err.message);
      });
    }
  }
}

async function syncVaultWithMongo() {
  if (!mongo.isMongoEnabled()) return loadVault();
  try {
    const remoteVault = await mongo.fetchVaultFromMongo();
    if (remoteVault && remoteVault.owner) {
      _vault = remoteVault;
      for (const key of Object.keys(DEFAULT_VAULT)) {
        if (!(key in _vault)) _vault[key] = DEFAULT_VAULT[key];
      }
      initAuthVault();
      try {
        ensureDir();
        fs.writeFileSync(VAULT_FILE, JSON.stringify(_vault, null, 2), 'utf-8');
      } catch (e) {}
      return _vault;
    } else {
      const localVault = loadVault();
      initAuthVault();
      await mongo.saveVaultToMongo(_vault);
      console.log('[Vault] Seeded auth vault into MongoDB Atlas');
      return _vault;
    }
  } catch (err) {
    console.error('[Vault] syncVaultWithMongo error:', err.message);
    return loadVault();
  }
}

function initAuthVault() {
  const vault = loadVault();

  // 1. Initialize Default Owner if not exists
  const defaultOwnerUsername = 'owner.syiar';
  const defaultOwnerPassword = '@SyiarOwner2026!';
  if (!vault.owner || vault.owner.username !== defaultOwnerUsername) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(defaultOwnerPassword, salt);
    vault.owner = {
      username: defaultOwnerUsername,
      password_hash: hash,
      salt: salt,
      role: 'owner',
      created_at: new Date().toISOString()
    };
    saveVault();
    if (mongo.isMongoEnabled()) {
      mongo.saveVaultToMongo(vault).catch(() => {});
    }
    console.log('[Vault] Owner account initialized:', defaultOwnerUsername);
  }

  // 2. Ensure initial user psdm.muhammadiyah exists
  const defaultUsername = 'psdm.muhammadiyah';
  const defaultPassword = '@Syiar1912';
  let user = vault.users.find(u => u.username === defaultUsername);
  if (!user) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(defaultPassword, salt);
    const nextId = vault._next_ids.users++;
    vault.users.push({
      id: nextId,
      username: defaultUsername,
      password_hash: hash,
      salt: salt,
      full_name: 'Pusat Syiar Digital Muhammadiyah',
      email: 'psdm@muhammadiyah.id',
      phone: '081219121912',
      position: 'Super Administrator',
      institution: 'Pusat Syiar Digital Muhammadiyah',
      institution_address: 'Jl. K.H. Ahmad Dahlan No. 103, Yogyakarta',
      status: 'active',
      subscription_expires_at: '2099-12-31T23:59:59.999Z',
      must_change_password: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    saveVault();
    if (mongo.isMongoEnabled()) {
      mongo.saveVaultToMongo(vault).catch(() => {});
    }
    console.log('[Vault] Master user initialized in vault:', defaultUsername);
  } else {
    // If user is still using the old default password, migrate to new default password
    const legacyOldHash = hashPassword('@1912kaumanjogja', user.salt);
    if (user.password_hash === legacyOldHash) {
      user.password_hash = hashPassword(defaultPassword, user.salt);
      user.updated_at = new Date().toISOString();
      saveVault();
      if (mongo.isMongoEnabled()) {
        mongo.saveVaultToMongo(vault).catch(() => {});
      }
      console.log('[Vault] Migrated user password to new default:', defaultUsername);
    }
  }

  return vault;
}

// ─── Owner Authentication ──────────────────────────────────────
function verifyOwner(username, password) {
  const vault = loadVault();
  if (!vault.owner || !username || !password) return false;
  if (vault.owner.username !== String(username).trim()) return false;

  try {
    const computedHash = hashPassword(String(password), vault.owner.salt);
    const computedBuffer = Buffer.from(computedHash, 'hex');
    const storedBuffer = Buffer.from(vault.owner.password_hash, 'hex');
    if (computedBuffer.length !== storedBuffer.length) return false;
    return crypto.timingSafeEqual(computedBuffer, storedBuffer);
  } catch (err) {
    console.error('[Vault] Error verifying owner:', err.message);
    return false;
  }
}

function createOwnerSession(username, durationDays = 7) {
  const vault = loadVault();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 3600 * 1000).toISOString();
  const expTimestamp = now.getTime() + durationDays * 24 * 3600 * 1000;

  const payload = {
    sub: String(username).trim(),
    role: 'owner',
    created_at: now.toISOString(),
    expires_at: expiresAt,
    exp: expTimestamp
  };
  const token = 'own_' + signToken(payload);

  vault.sessions = (vault.sessions || []).filter(s => s.expires_at > now.toISOString());
  vault.sessions.push({
    token,
    username: payload.sub,
    role: 'owner',
    created_at: now.toISOString(),
    expires_at: expiresAt
  });
  saveVault();
  return { token, expiresAt };
}

function validateOwnerSession(token) {
  if (!token) return null;
  const vault = loadVault();
  const now = new Date().toISOString();

  // 1. Validasi via HMAC signature
  if (token.startsWith('own_') && token.includes('.')) {
    const rawSigned = token.slice(4);
    const verified = verifyToken(rawSigned);
    if (verified && verified.role === 'owner') {
      if (vault.owner && vault.owner.username === verified.sub) {
        return {
          token,
          username: verified.sub,
          role: 'owner',
          created_at: verified.created_at,
          expires_at: verified.expires_at
        };
      }
    }
  }

  // 2. Fallback pencarian in-memory / file JSON
  const session = (vault.sessions || []).find(s => s.token === token && s.role === 'owner' && s.expires_at > now);
  return session || null;
}

function destroyOwnerSession(token) {
  if (!token) return false;
  const vault = loadVault();
  const before = vault.sessions.length;
  vault.sessions = vault.sessions.filter(s => s.token !== token);
  if (vault.sessions.length !== before) {
    saveVault();
    return true;
  }
  return false;
}

// ─── User Authentication with Subscription & Expiry Check ────
function verifyUserLogin(username, password) {
  const vault = loadVault();
  if (!username || !password) {
    return { ok: false, error: 'invalid_credentials' };
  }

  const cleanUser = String(username).trim();
  const cleanPass = String(password);

  const user = vault.users.find(u => u.username === cleanUser);
  if (!user) {
    return { ok: false, error: 'invalid_credentials' };
  }

  // Password verification
  try {
    const computedHash = hashPassword(cleanPass, user.salt);
    const computedBuffer = Buffer.from(computedHash, 'hex');
    const storedBuffer = Buffer.from(user.password_hash, 'hex');
    if (computedBuffer.length !== storedBuffer.length || !crypto.timingSafeEqual(computedBuffer, storedBuffer)) {
      return { ok: false, error: 'invalid_credentials' };
    }
  } catch (e) {
    return { ok: false, error: 'invalid_credentials' };
  }

  // Check user status (Active vs Suspended)
  if (user.status !== 'active') {
    return { ok: false, error: 'inactive_or_expired' };
  }

  // Check subscription expiry date
  if (user.subscription_expires_at) {
    const expires = new Date(user.subscription_expires_at).getTime();
    if (Date.now() > expires) {
      return { ok: false, error: 'inactive_or_expired' };
    }
  }

  // If password change is required
  if (user.must_change_password) {
    return { ok: true, must_change_password: true, user };
  }

  return { ok: true, must_change_password: false, user };
}

function createUserSession(username, durationDays = 7) {
  const vault = loadVault();
  const cleanUsername = String(username).trim();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 3600 * 1000).toISOString();
  const expTimestamp = now.getTime() + durationDays * 24 * 3600 * 1000;

  const payload = {
    sub: cleanUsername,
    role: 'user',
    created_at: now.toISOString(),
    expires_at: expiresAt,
    exp: expTimestamp
  };
  const token = 'usr_' + signToken(payload);

  vault.sessions = (vault.sessions || []).filter(s => s.expires_at > now.toISOString());
  vault.sessions.push({
    token,
    username: cleanUsername,
    role: 'user',
    created_at: now.toISOString(),
    expires_at: expiresAt
  });
  saveVault();
  return { token, expiresAt };
}

function validateUserSession(token) {
  if (!token) return null;
  const vault = loadVault();
  const now = new Date().toISOString();

  let session = null;

  // 1. Validasi via HMAC signature (Stateless & cross-lambda di Vercel)
  if (token.startsWith('usr_') && token.includes('.')) {
    const rawSigned = token.slice(4);
    const verified = verifyToken(rawSigned);
    if (verified && verified.role === 'user' && verified.sub) {
      session = {
        token,
        username: verified.sub,
        role: 'user',
        created_at: verified.created_at,
        expires_at: verified.expires_at
      };
    }
  }

  // 2. Fallback pencarian in-memory / file JSON jika token lama
  if (!session) {
    session = (vault.sessions || []).find(s => s.token === token && s.role === 'user' && s.expires_at > now);
  }

  if (!session) return null;

  // Verifikasi apakah user masih ada dan aktif
  let user = vault.users.find(u => u.username === session.username);
  if (!user && session.username === 'psdm.muhammadiyah') {
    // Pastikan akun default selalu ada
    initAuthVault();
    user = vault.users.find(u => u.username === session.username);
  }

  if (!user || user.status !== 'active') return null;
  if (user.subscription_expires_at && Date.now() > new Date(user.subscription_expires_at).getTime()) {
    return null;
  }

  return { ...session, must_change_password: !!user.must_change_password };
}

function destroyUserSession(token) {
  if (!token) return false;
  const vault = loadVault();
  const before = vault.sessions.length;
  vault.sessions = vault.sessions.filter(s => s.token !== token);
  if (vault.sessions.length !== before) {
    saveVault();
    return true;
  }
  return false;
}

// ─── Password Change & History Audit ──────────────────────────
function changeUserPasswordVault(username, oldPasswordPlain, newPasswordPlain, currentToken = null) {
  const vault = loadVault();
  const cleanUser = String(username).trim();
  const user = vault.users.find(u => u.username === cleanUser);
  if (!user) return false;

  // Record old password in history (Audit viewable only by Owner)
  vault.password_history.push({
    username: cleanUser,
    old_password_plain: oldPasswordPlain,
    changed_at: new Date().toISOString()
  });

  // Generate new salt and hash
  user.salt = crypto.randomBytes(16).toString('hex');
  user.password_hash = hashPassword(newPasswordPlain, user.salt);
  user.must_change_password = false;
  user.updated_at = new Date().toISOString();

  // Invalidate other user sessions except currentToken
  if (currentToken) {
    vault.sessions = vault.sessions.filter(s => s.username !== cleanUser || s.token === currentToken);
  }

  saveVault();
  return true;
}

// ─── Registration Queue ───────────────────────────────────────
function addPendingRegistration(data) {
  const vault = loadVault();
  const nextId = vault._next_ids.pending_registrations++;
  const record = {
    id: nextId,
    full_name: String(data.full_name || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    phone: String(data.phone || '').trim(),
    position: String(data.position || '').trim(),
    institution: String(data.institution || '').trim(),
    institution_address: String(data.institution_address || '').trim(),
    status: 'pending',
    created_at: new Date().toISOString()
  };

  vault.pending_registrations.unshift(record);
  saveVault();
  return record;
}

function getPendingRegistrations() {
  const vault = loadVault();
  return vault.pending_registrations || [];
}

function approveRegistration(registrationId, opts = {}) {
  const vault = loadVault();
  const regIndex = vault.pending_registrations.findIndex(r => r.id === parseInt(registrationId));
  if (regIndex === -1) {
    throw new Error('Permohonan pendaftaran tidak ditemukan.');
  }

  const reg = vault.pending_registrations[regIndex];
  const cleanUsername = String(opts.username || '').trim();
  const temporary_password = opts.temporary_password || opts.temporaryPassword;
  const subscription_days = opts.subscription_days || opts.subscriptionDays || 30;

  if (!cleanUsername) throw new Error('Username wajib ditentukan.');
  if (!temporary_password) throw new Error('Kata sandi sementara wajib ditentukan.');

  // Check if username already exists
  if (vault.users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
    throw new Error(`Username "${cleanUsername}" sudah digunakan oleh pengguna lain.`);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(temporary_password, salt);
  const now = new Date();
  const subExpiresAt = new Date(now.getTime() + (parseInt(subscription_days) || 30) * 24 * 3600 * 1000).toISOString();

  const nextUserId = vault._next_ids.users++;
  const newUser = {
    id: nextUserId,
    username: cleanUsername,
    password_hash: hash,
    salt: salt,
    full_name: reg.full_name,
    email: reg.email,
    phone: reg.phone,
    position: reg.position,
    institution: reg.institution,
    institution_address: reg.institution_address,
    status: 'active',
    subscription_expires_at: subExpiresAt,
    must_change_password: true,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };

  vault.users.push(newUser);

  // Store temporary password in password history log for owner audit
  vault.password_history.push({
    username: cleanUsername,
    old_password_plain: temporary_password + ' (Password Sementara Awal)',
    changed_at: now.toISOString()
  });

  reg.status = 'approved';
  reg.approved_at = now.toISOString();
  reg.assigned_username = cleanUsername;

  saveVault();

  // Create isolated tenant file for this new user
  try {
    const tenantsDir = path.join(__dirname, '..', 'data', 'tenants');
    if (!fs.existsSync(tenantsDir)) fs.mkdirSync(tenantsDir, { recursive: true });
    const safeTenant = cleanUsername.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const tenantPath = path.join(tenantsDir, `${safeTenant}.json`);
    if (!fs.existsSync(tenantPath)) {
      const defaultTenantData = {
        settings: { google_api_key: '', google_cx_id: '', max_results_per_query: '10', auto_start: '0' },
        monitors: [],
        keywords: [],
        results: [],
        scan_logs: [],
        _next_ids: { keywords: 1, results: 1, scan_logs: 1, monitors: 1 }
      };
      fs.writeFileSync(tenantPath, JSON.stringify(defaultTenantData, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('[Vault] Error creating tenant file:', err.message);
  }

  return { user: newUser, temporary_password };
}

function rejectRegistration(registrationId, reason = '') {
  const vault = loadVault();
  const reg = vault.pending_registrations.find(r => r.id === parseInt(registrationId));
  if (!reg) throw new Error('Permohonan pendaftaran tidak ditemukan.');

  reg.status = 'rejected';
  reg.rejected_at = new Date().toISOString();
  reg.rejection_reason = reason;

  saveVault();
  return reg;
}

// ─── Owner User Management ────────────────────────────────────
function getAllVaultUsers() {
  const vault = loadVault();
  return (vault.users || []).map(u => ({
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    email: u.email,
    phone: u.phone,
    position: u.position,
    institution: u.institution,
    status: u.status,
    subscription_expires_at: u.subscription_expires_at,
    must_change_password: u.must_change_password,
    created_at: u.created_at,
    updated_at: u.updated_at
  }));
}

function toggleUserStatusVault(username, forceStatus = null) {
  const vault = loadVault();
  const user = vault.users.find(u => u.username === String(username).trim());
  if (!user) throw new Error('Pengguna tidak ditemukan');

  if (forceStatus) {
    user.status = forceStatus;
  } else {
    user.status = user.status === 'active' ? 'suspended' : 'active';
  }
  user.updated_at = new Date().toISOString();

  // If suspended, revoke active sessions
  if (user.status !== 'active') {
    vault.sessions = (vault.sessions || []).filter(s => s.username !== user.username);
  }

  saveVault();
  return user;
}

function extendUserSubscriptionVault(username, daysToAdd) {
  const vault = loadVault();
  const user = vault.users.find(u => u.username === String(username).trim());
  if (!user) throw new Error('Pengguna tidak ditemukan');

  const now = Date.now();
  const currentExpiry = user.subscription_expires_at ? new Date(user.subscription_expires_at).getTime() : now;
  const baseTime = currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(baseTime + parseInt(daysToAdd) * 24 * 3600 * 1000).toISOString();

  user.subscription_expires_at = newExpiry;
  user.status = 'active'; // automatically reactivate if extended
  user.updated_at = new Date().toISOString();

  saveVault();
  return user;
}

function resetUserPasswordByOwner(username, newTempPassword) {
  const vault = loadVault();
  const user = vault.users.find(u => u.username === String(username).trim());
  if (!user) throw new Error('Pengguna tidak ditemukan');

  // Record into history
  vault.password_history.push({
    username: user.username,
    old_password_plain: newTempPassword + ' (Reset oleh Owner)',
    changed_at: new Date().toISOString()
  });

  user.salt = crypto.randomBytes(16).toString('hex');
  user.password_hash = hashPassword(newTempPassword, user.salt);
  user.must_change_password = true;
  user.updated_at = new Date().toISOString();

  // Revoke user sessions
  vault.sessions = (vault.sessions || []).filter(s => s.username !== user.username);

  saveVault();
  return { username: user.username, new_temp_password: newTempPassword };
}

function getPasswordHistoryVault(username) {
  const vault = loadVault();
  const clean = String(username).trim();
  return (vault.password_history || []).filter(h => h.username === clean);
}

// Run initialization
initAuthVault();

module.exports = {
  initAuthVault,
  // Owner Auth
  verifyOwner,
  createOwnerSession,
  validateOwnerSession,
  destroyOwnerSession,
  // User Auth & Session
  verifyUserLogin,
  createUserSession,
  validateUserSession,
  destroyUserSession,
  changeUserPasswordVault,
  // Registrations
  addPendingRegistration,
  getPendingRegistrations,
  approveRegistration,
  rejectRegistration,
  // Owner User Management
  getAllVaultUsers,
  toggleUserStatusVault,
  extendUserSubscriptionVault,
  resetUserPasswordByOwner,
  getPasswordHistoryVault,
  // MongoDB sync
  syncVaultWithMongo
};
