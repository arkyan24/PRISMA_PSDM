require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./src/database');
const authVault = require('./src/auth_vault');
const scheduler = require('./src/scheduler');
const { buildPDFReport } = require('./src/pdf_report_builder');
const nlpSentiment = require('./src/nlp_sentiment');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
// Vercel Serverless Path Normalizer: Memulihkan req.url asli bila ditimpa rewrite
app.use((req, res, next) => {
  if (
    req.url === '/server.js' ||
    req.url === '/api/index.js' ||
    req.url === '/api' ||
    req.url.startsWith('/server.js?') ||
    req.url.startsWith('/api/index.js?') ||
    req.url.startsWith('/api?')
  ) {
    const rawMatched =
      req.headers['x-matched-path'] ||
      req.headers['x-forwarded-uri'] ||
      req.headers['x-original-url'];
    if (
      rawMatched &&
      !rawMatched.includes('server.js') &&
      !rawMatched.includes('api/index.js')
    ) {
      req.url = rawMatched;
    } else {
      req.url = '/login';
    }
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Public static assets (css, js, images, fonts)
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));

// ─── MongoDB Cloud Sync Middleware ───────────────────────────
// Memastikan sesi dan data tenant sinkron dengan MongoDB Atlas di Vercel Serverless
app.use(async (req, res, next) => {
  try {
    await db.ensureMongoSynced(req);
  } catch (err) {
    console.error('[Middleware] Mongo sync error:', err.message);
  }
  next();
});

// ─── Cookie & Auth Helpers ────────────────────────────────────
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function getAuthToken(req) {
  const cookieToken = getCookie(req, 'prisma_auth_token') || getCookie(req, 'syiar_auth_token') || getCookie(req, 'pijar_auth_token');
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function getOwnerToken(req) {
  // Owner token dibaca dari cookie khusus owner atau header x-owner-token
  return (
    getCookie(req, 'prisma_owner_token') ||
    getCookie(req, 'syiar_owner_token') ||
    req.headers['x-owner-token'] ||
    null
  );
}

function pageAuthGuard(req, res, next) {
  const token = getAuthToken(req);
  const session = db.validateSession(token);
  if (!session) {
    return res.redirect('/login');
  }
  req.user = session;
  db.withTenant(session.username, next);
}

function apiAuthGuard(req, res, next) {
  const token = getAuthToken(req);
  const session = db.validateSession(token);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.' });
  }
  req.user = session;
  db.withTenant(session.username, next);
}

function ownerPageGuard(req, res, next) {
  const token = getOwnerToken(req);
  const session = authVault.validateOwnerSession(token);
  if (!session) {
    return res.redirect('/kjkaaf94nf/login');
  }
  req.owner = session;
  next();
}

function ownerApiGuard(req, res, next) {
  const token = getOwnerToken(req);
  const session = authVault.validateOwnerSession(token);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Akses khusus Owner diperlukan.' });
  }
  req.owner = session;
  next();
}

// ─── API: Auth Endpoints ──────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }
    const cleanUsername = String(username).trim();
    const cleanPassword = String(password);
    
    const verifyResult = authVault.verifyUserLogin(cleanUsername, cleanPassword);
    if (!verifyResult.ok) {
      // Generic message per instruction
      return res.status(401).json({ success: false, message: 'Login gagal, Anda mungkin belum terdaftar.' });
    }

    // First login password change check
    if (verifyResult.must_change_password) {
      const tempSession = authVault.createUserSession(cleanUsername, 1);
      return res.json({
        success: true,
        must_change_password: true,
        temp_token: tempSession.token,
        message: 'Ini adalah login pertama Anda. Silakan tentukan kata sandi baru.',
        user: { username: cleanUsername }
      });
    }

    const session = authVault.createUserSession(cleanUsername);
    const isSecure = Boolean(process.env.VERCEL || req.secure || req.headers['x-forwarded-proto'] === 'https');
    const secureFlag = isSecure ? '; Secure' : '';
    res.setHeader('Set-Cookie', [
      `prisma_auth_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secureFlag}`,
      `syiar_auth_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secureFlag}`,
      `pijar_auth_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secureFlag}`
    ]);
    res.json({
      success: true,
      message: 'Login berhasil',
      token: session.token,
      user: { username: cleanUsername }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/register-request', (req, res) => {
  try {
    const { full_name, email, phone, position, institution, institution_address } = req.body;
    if (!full_name || !email || !phone || !position || !institution || !institution_address) {
      return res.status(400).json({ success: false, message: 'Semua kolom formulir pendaftaran wajib diisi.' });
    }
    const reg = authVault.addPendingRegistration(req.body);
    res.json({
      success: true,
      message: 'Permohonan pendaftaran berhasil dikirim dan menunggu persetujuan Owner.',
      data: reg
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/first-login-change-password', (req, res) => {
  try {
    const { username, temp_token, new_password } = req.body;
    if (!username || !new_password || new_password.length < 8) {
      return res.status(400).json({ success: false, message: 'Kata sandi baru minimal 8 karakter.' });
    }
    const session = authVault.validateUserSession(temp_token);
    if (!session || session.username !== username) {
      return res.status(401).json({ success: false, message: 'Sesi aktivasi tidak valid atau telah kedaluwarsa.' });
    }

    authVault.changeUserPasswordVault(username, '(Password Sementara Awal)', new_password, temp_token);
    const isSecure = Boolean(process.env.VERCEL || req.secure || req.headers['x-forwarded-proto'] === 'https');
    const secureFlag = isSecure ? '; Secure' : '';
    res.setHeader('Set-Cookie', [
      `prisma_auth_token=${temp_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secureFlag}`,
      `syiar_auth_token=${temp_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secureFlag}`,
      `pijar_auth_token=${temp_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secureFlag}`
    ]);
    res.json({
      success: true,
      message: 'Kata sandi berhasil diperbarui. Selamat datang di sistem PRISMA!'
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const token = getAuthToken(req);
    if (token) {
      db.destroySession(token);
    }
    res.setHeader('Set-Cookie', [
      'prisma_auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      'syiar_auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      'pijar_auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    ]);
    res.json({ success: true, message: 'Logout berhasil' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  const token = getAuthToken(req);
  const session = db.validateSession(token);
  if (!session) {
    return res.status(401).json({ success: false, authenticated: false });
  }
  const profile = db.getUserProfile(session.username);
  res.json({
    success: true,
    authenticated: true,
    user: {
      username: session.username,
      avatar_url: profile?.avatar_url || null,
      full_name: profile?.full_name || session.username,
      institution: profile?.institution || 'Pusat Syiar Digital Muhammadiyah'
    }
  });
});

// Guard all other /api/* routes with multi-tenant context
app.get('/api/debug-db', async (req, res) => {
  const hasMongoUri = Boolean(process.env.MONGODB_URI);
  let mongoConnected = false;
  let mongoError = null;
  let remoteTenant = null;
  let localMonitors = 0;
  let localResults = 0;

  try {
    const mongo = require('./src/mongodb');
    const client = await mongo.getClient();
    if (client) {
      mongoConnected = true;
      remoteTenant = await mongo.fetchTenantFromMongo('psdm.muhammadiyah');
    }
  } catch (err) {
    mongoError = err.message;
  }

  try {
    const currentDb = db.getDb();
    localMonitors = currentDb.monitors?.length || 0;
    localResults = currentDb.results?.length || 0;
  } catch (e) {}

  res.json({
    hasMongoUri,
    mongoUriPrefix: process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 18) + '...' : null,
    mongoConnected,
    mongoError,
    remoteMonitorsCount: remoteTenant?.monitors?.length || 0,
    remoteResultsCount: remoteTenant?.results?.length || 0,
    localMonitors,
    localResults
  });
});

app.use('/api', (req, res, next) => {
  const publicApiPaths = ['/auth/login', '/auth/register-request', '/auth/first-login-change-password', '/debug-db'];
  if (publicApiPaths.includes(req.path)) {
    return next();
  }
  apiAuthGuard(req, res, next);
});

app.post('/api/auth/avatar', (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) {
      db.updateUserAvatar(username, null);
      return res.json({ success: true, message: 'Foto profil berhasil dihapus.', avatar_url: null });
    }

    if (process.env.VERCEL) {
      db.updateUserAvatar(username, avatar);
      return res.json({
        success: true,
        message: 'Foto profil berhasil diperbarui.',
        avatar_url: avatar
      });
    }

    const avatarsDir = path.join(__dirname, 'public', 'images', 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    const matches = avatar.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Format gambar tidak valid. Harus format data URL base64.' });
    }

    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      return res.status(400).json({ success: false, message: 'Format file tidak didukung. Gunakan PNG, JPG, atau WebP.' });
    }

    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Ukuran file melebihi batas maksimal 5 MB.' });
    }

    const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `avatar_${safeUsername}.${ext}`;
    const filePath = path.join(avatarsDir, filename);

    fs.writeFileSync(filePath, buffer);
    const avatarUrl = `/images/avatars/${filename}?v=${Date.now()}`;
    db.updateUserAvatar(username, avatarUrl);

    res.json({
      success: true,
      message: 'Foto profil berhasil diperbarui.',
      avatar_url: avatarUrl
    });
  } catch (err) {
    console.error('[Avatar] Error saving avatar:', err);
    res.status(500).json({ success: false, message: 'Gagal memproses foto profil: ' + err.message });
  }
});

app.post('/api/auth/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Password lama dan password baru wajib diisi.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'Password baru minimal 8 karakter.' });
  }

  const changed = db.changeUserPassword(req.user.username, currentPassword, newPassword, getAuthToken(req));
  if (!changed) {
    return res.status(400).json({ success: false, message: 'Password lama tidak sesuai.' });
  }
  res.json({ success: true, message: 'Password berhasil diperbarui.' });
});

// ─── API: Keywords ────────────────────────────────────────────
app.get('/api/keywords', (req, res) => {
  try {
    const keywords = db.getAllKeywords();
    res.json({ success: true, data: keywords });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/keywords', (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ success: false, message: 'Keyword tidak boleh kosong' });
    }
    const result = db.addKeyword(keyword);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/keywords/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = db.removeKeyword(id);
    if (deleted) {
      res.json({ success: true, message: 'Keyword dihapus' });
    } else {
      res.status(404).json({ success: false, message: 'Keyword tidak ditemukan' });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/keywords/:id/toggle', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { is_active } = req.body;
    const kw = db.toggleKeyword(id, is_active);
    if (!kw) return res.status(404).json({ success: false, message: 'Keyword tidak ditemukan' });
    res.json({ 
      success: true, 
      message: `Keyword "${kw.keyword}" ${kw.is_active ? 'diaktifkan' : 'dinonaktifkan'}`, 
      data: kw 
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── API: Monitors (CRUD) ─────────────────────────────────────
app.get('/api/monitors', (req, res) => {
  try {
    const monitors = db.getAllMonitors();
    // Enrich with result count
    const enriched = monitors.map(m => {
      const stats = db.getMonitorStats(m.id);
      return { ...m, result_count: stats.total };
    });
    res.json({ success: true, data: enriched });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/monitors', async (req, res) => {
  try {
    const { name, keyword, description, polling_interval, initial_polling_mode } = req.body;
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ success: false, message: 'Keyword tidak boleh kosong' });
    }
    const userProfile = req.user ? db.getUserProfile(req.user.username) : null;
    const institution = userProfile?.institution || req.user?.institution;
    const monitor = db.createMonitor({ name, keyword, description, polling_interval, initial_polling_mode, institution });
    
    // Start timer if scheduler is running
    const status = scheduler.getStatus();
    if (status.isRunning && monitor.status === 'active') {
      scheduler.startMonitorTimer(monitor);
    }

    // Jalankan scan awal segera agar hasil tidak 0
    let totalFound = 0;
    try {
      const scanRes = await scheduler.runMonitorNow(monitor.id);
      totalFound = scanRes?.totalNewResults || 0;
    } catch (scanErr) {
      console.warn('[Monitor Create] Initial scan warning:', scanErr.message);
    }

    // Simpan permanen ke MongoDB Atlas sebelum merespon HTTP
    await db.saveTenantAsync();
    
    res.json({ 
      success: true, 
      data: monitor, 
      message: `Monitor "${monitor.name}" berhasil dibuat dan dipindai (${totalFound} hasil ditemukan)!` 
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.get('/api/monitors/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const monitor = db.getMonitor(id);
    if (!monitor) return res.status(404).json({ success: false, message: 'Monitor tidak ditemukan' });
    const stats = db.getMonitorStats(id);
    res.json({ success: true, data: { ...monitor, stats } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.put('/api/monitors/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = db.updateMonitor(id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Monitor tidak ditemukan' });
    
    // Restart timer if interval changed
    if (req.body.polling_interval) {
      scheduler.restartMonitorTimer(id);
    }

    await db.saveTenantAsync();
    
    res.json({ success: true, data: updated, message: `Monitor "${updated.name}" berhasil diperbarui` });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/monitors/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const monitor = db.getMonitor(id);
    if (!monitor) return res.status(404).json({ success: false, message: 'Monitor tidak ditemukan' });
    
    scheduler.stopMonitorTimer(id);
    db.deleteMonitor(id);
    await db.saveTenantAsync();
    
    res.json({ success: true, message: `Monitor "${monitor.name}" beserta hasilnya berhasil dihapus` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/monitors/:id/toggle', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { active } = req.body;
    const isActive = active === true || active === 1 || active === '1' || active === 'true';
    const monitor = db.toggleMonitorStatus(id, isActive);
    if (!monitor) return res.status(404).json({ success: false, message: 'Monitor tidak ditemukan' });
    
    if (isActive) {
      const status = scheduler.getStatus();
      if (status.isRunning) scheduler.startMonitorTimer(monitor);
    } else {
      scheduler.stopMonitorTimer(id);
    }

    await db.saveTenantAsync();
    
    res.json({ 
      success: true, 
      data: monitor, 
      message: `Monitor "${monitor.name}" ${isActive ? 'diaktifkan' : 'dinonaktifkan'}` 
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/monitors/:id/poll-now', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const status = scheduler.getStatus();
    if (status.scanInProgress) {
      return res.json({ success: false, message: 'Scan sedang berjalan, tunggu hingga selesai.' });
    }
    
    // Await scanning to complete before ending serverless function!
    const result = await scheduler.runMonitorNow(id);
    await db.saveTenantAsync();
    
    res.json({ 
      success: true, 
      message: `Scan selesai! Ditemukan ${result?.totalNewResults || 0} hasil baru.`,
      result 
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── API: Results ─────────────────────────────────────────────
app.get('/api/results', (req, res) => {
  try {
    const { platform, keyword_id, monitor_id, sentiment, search, limit, offset, dedup, sort_by } = req.query;
    const results = db.getResults({
      platform,
      sentiment,
      search,
      keyword_id: keyword_id ? parseInt(keyword_id) : null,
      monitor_id: monitor_id || null,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0,
      dedup: dedup === 'false' ? false : true,
      sort_by: sort_by || 'newest'
    });
    res.json({ success: true, data: results });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/results/latest', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const dedup = req.query.dedup === 'false' ? false : true;
    const monitorId = req.query.monitor_id || null;
    const results = db.getLatestResults(limit, dedup, monitorId);
    res.json({ success: true, data: results });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/results/stats', (req, res) => {
  try {
    const monitorId = req.query.monitor_id ? parseInt(req.query.monitor_id) : null;
    const stats = db.getResultStats(monitorId);
    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/results', (req, res) => {
  try {
    db.clearAllResults();
    res.json({ success: true, message: 'Semua data aktivitas berhasil dihapus' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/results/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = db.deleteResult(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Temuan tidak ditemukan atau sudah dihapus' });
    }
    res.json({ success: true, message: 'Temuan berhasil dihapus' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/results/batch-delete', (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Daftar ID temuan tidak valid atau kosong' });
    }
    const count = db.deleteResultsBatch(ids);
    res.json({ success: true, count, message: `${count} temuan berhasil dihapus` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── API: Settings ────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.getAllSettings();
    // Mask the API key for security
    if (settings.google_api_key) {
      settings.google_api_key_masked = settings.google_api_key.substring(0, 8) + '...' +
        settings.google_api_key.substring(settings.google_api_key.length - 4);
      settings.has_api_key = true;
    } else {
      settings.has_api_key = false;
    }
    res.json({ success: true, data: settings });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const allowedKeys = [
      'google_api_key',
      'google_cx_id',
      'interval_hours',
      'max_results_per_query',
      'auto_start',
      'nlp_engine',
      'nlp_service_url'
    ];
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'Data settings tidak valid' });
    }

    for (const [key, value] of Object.entries(settings)) {
      if (allowedKeys.includes(key)) {
        db.setSetting(key, value);

        // If interval changed, update scheduler
        if (key === 'interval_hours') {
          scheduler.updateInterval(parseInt(value));
        }
      }
    }

    res.json({ success: true, message: 'Pengaturan berhasil disimpan' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── API: Uji Koneksi Service NLP / PyTorch ───────────────────
app.post('/api/settings/test-nlp-service', async (req, res) => {
  try {
    const rawUrl = req.body.url || db.getSetting('nlp_service_url') || 'http://127.0.0.1:8000';
    const cleanUrl = String(rawUrl).trim().replace(/\/+$/, '');
    const startTime = Date.now();
    const health = await nlpSentiment.checkIndoBERTHealth(cleanUrl);
    const elapsed = Date.now() - startTime;

    if (health && health.status === 'ready') {
      return res.json({
        success: true,
        status: 'ready',
        elapsed_ms: elapsed,
        data: health,
        message: `Koneksi berhasil! Model: ${health.model || 'IndoBERT'}, Device: ${health.device || 'CPU'}, Versi: ${health.version || '1.0.0'} (${elapsed} ms)`
      });
    } else {
      return res.json({
        success: false,
        status: 'offline',
        data: health,
        message: `Service di ${cleanUrl} tidak merespons: ${health.error || 'Status service bukan ready'}. Sistem akan menggunakan fallback Node.js.`
      });
    }
  } catch (err) {
    return res.json({
      success: false,
      status: 'offline',
      message: `Gagal terhubung ke ${req.body.url || 'service'}: ${err.message}. Sistem akan otomatis menggunakan fallback Node.js.`
    });
  }
});

// ─── API: Monitor Control ─────────────────────────────────────
app.post('/api/monitor/start', (req, res) => {
  try {
    const result = scheduler.start();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/monitor/stop', (req, res) => {
  try {
    const result = scheduler.stop();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/monitor/status', (req, res) => {
  try {
    const status = scheduler.getStatus();
    res.json({ success: true, data: status });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/monitor/run-now', async (req, res) => {
  try {
    // Check if scan is already in progress
    const status = scheduler.getStatus();
    if (status.scanInProgress) {
      return res.json({ success: false, message: 'Scan sedang berjalan, tunggu hingga selesai.' });
    }

    // Start scan in background — don't await, respond immediately
    scheduler.runNow().then(result => {
      console.log(`[Server] Background scan complete: ${result.totalNewResults || 0} new results`);
    }).catch(err => {
      console.error(`[Server] Background scan error: ${err.message}`);
    });

    res.json({ 
      success: true, 
      message: 'Scan dimulai! Hasil akan muncul dalam beberapa saat.' 
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── API: Scan Logs ───────────────────────────────────────────
app.get('/api/scan-logs', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const logs = db.getScanLogs(limit);
    res.json({ success: true, data: logs });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── API: Reports (PDF Export) ────────────────────────────────
app.get('/api/reports/pdf', async (req, res) => {
  try {
    const monitorId = req.query.monitor_id ? parseInt(req.query.monitor_id) : null;
    let monitor = null;
    if (monitorId) {
      monitor = db.getMonitor(monitorId);
    }

    const limit = req.query.limit ? parseInt(req.query.limit) : 1000;
    const results = db.getResults({
      monitor_id: monitorId,
      keyword_id: req.query.keyword_id ? parseInt(req.query.keyword_id) : null,
      platform: req.query.platform || null,
      sentiment: req.query.sentiment || null,
      search: req.query.search || null,
      limit,
      dedup: true,
      sort_by: req.query.sort_by || 'newest'
    });

    const stats = db.getResultStats(monitorId);
    const currentUser = req.user?.username || 'psdm.muhammadiyah';
    const profile = db.getUserProfile(currentUser);
    const userAvatarUrl = profile?.avatar_url || null;

    const pdfBuffer = await buildPDFReport({
      monitor,
      results,
      stats,
      currentUser,
      userAvatarUrl
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `laporan-pantauan-sosial-media-${todayStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[Reports] Error generating PDF report:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat laporan PDF: ' + err.message });
  }
});

// ─── Login & Public Registration Routes ───────────────────────
app.get(['/login', '/login.html'], (req, res) => {
  const token = getAuthToken(req);
  if (token && db.validateSession(token)) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get(['/register', '/signup', '/register.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// ─── Restricted Owner Portal Routes (/kjkaaf94nf) ─────────────
app.get(['/kjkaaf94nf/login', '/kjkaaf94nf/login.html'], (req, res) => {
  const token = getOwnerToken(req);
  if (token && authVault.validateOwnerSession(token)) {
    return res.redirect('/kjkaaf94nf/');
  }
  res.sendFile(path.join(__dirname, 'public', 'kjkaaf94nf', 'login.html'));
});

app.get(['/kjkaaf94nf', '/kjkaaf94nf/', '/kjkaaf94nf/index.html'], ownerPageGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kjkaaf94nf', 'index.html'));
});

app.post('/kjkaaf94nf/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan kata sandi wajib diisi.' });
    }
    const valid = authVault.verifyOwner(username, password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Kredensial Owner tidak valid.' });
    }
    const session = authVault.createOwnerSession(username);
    const isSecure = Boolean(process.env.VERCEL || req.secure || req.headers['x-forwarded-proto'] === 'https');
    const secureFlag = isSecure ? '; Secure' : '';
    res.setHeader('Set-Cookie', [
      `prisma_owner_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secureFlag}`,
      `syiar_owner_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secureFlag}`
    ]);
    res.json({ success: true, message: 'Login Owner berhasil', token: session.token });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/kjkaaf94nf/api/logout', (req, res) => {
  try {
    const token = getOwnerToken(req);
    if (token) {
      authVault.destroyOwnerSession(token);
    }
    res.setHeader('Set-Cookie', [
      'prisma_owner_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      'syiar_owner_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    ]);
    res.json({ success: true, message: 'Logout Owner berhasil' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/kjkaaf94nf/api/dashboard', ownerApiGuard, (req, res) => {
  try {
    const registrations = authVault.getPendingRegistrations();
    const users = authVault.getAllVaultUsers();
    res.json({
      success: true,
      registrations,
      users
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/kjkaaf94nf/api/registrations/:id/approve', ownerApiGuard, (req, res) => {
  try {
    const { id } = req.params;
    const { username, temporary_password, subscription_days } = req.body;
    if (!username || !temporary_password) {
      return res.status(400).json({ success: false, message: 'Username dan kata sandi sementara wajib diisi.' });
    }
    const result = authVault.approveRegistration(id, {
      username,
      temporaryPassword: temporary_password,
      subscriptionDays: subscription_days || 30
    });
    // Ensure tenant isolated database is created & initialized
    db.initTenantDatabase(username, {
      full_name: result.user?.full_name,
      institution: result.user?.institution,
      position: result.user?.position,
      email: result.user?.email
    });
    res.json({
      success: true,
      message: `Pendaftaran disetujui. Database pribadi (data/tenants/${username}.json) otomatis dibuat.`,
      data: result,
      tenant_file: `data/tenants/${username}.json`
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/kjkaaf94nf/api/registrations/:id/reject', ownerApiGuard, (req, res) => {
  try {
    const { id } = req.params;
    const { reason, note } = req.body;
    const result = authVault.rejectRegistration(id, reason || note || '');
    res.json({ success: true, message: 'Pendaftaran berhasil ditolak.', data: result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/kjkaaf94nf/api/users/:username/toggle-status', ownerApiGuard, (req, res) => {
  try {
    const { username } = req.params;
    const { status } = req.body;
    const updated = authVault.toggleUserStatusVault(username, status);
    res.json({ success: true, message: `Status pengguna berhasil diubah ke ${status}.`, data: updated });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/kjkaaf94nf/api/users/:username/extend-subscription', ownerApiGuard, (req, res) => {
  try {
    const { username } = req.params;
    const { days } = req.body;
    const updated = authVault.extendUserSubscriptionVault(username, parseInt(days, 10) || 30);
    res.json({ success: true, message: 'Masa aktif langganan berhasil diperpanjang.', data: updated });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/kjkaaf94nf/api/users/:username/reset-password', ownerApiGuard, (req, res) => {
  try {
    const { username } = req.params;
    const { temporary_password } = req.body;
    if (!temporary_password) {
      return res.status(400).json({ success: false, message: 'Kata sandi sementara wajib diisi.' });
    }
    const updated = authVault.resetUserPasswordByOwner(username, temporary_password);
    res.json({ success: true, message: 'Kata sandi berhasil direset oleh Owner.', data: updated });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.get('/kjkaaf94nf/api/users/:username/password-history', ownerApiGuard, (req, res) => {
  try {
    const { username } = req.params;
    const history = authVault.getPasswordHistoryVault(username);
    res.json({ success: true, username, history });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ─── Regular Application Pages ────────────────────────────────

app.get('/', pageAuthGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/dashboard', pageAuthGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/monitor', pageAuthGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'monitor.html'));
});

app.get(['/results', '/aktivitas', '/activity'], pageAuthGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

app.get('/settings', pageAuthGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get(['/help', '/bantuan'], pageAuthGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'help.html'));
});

// Guard direct requests for html files
app.get('/:page.html', pageAuthGuard, (req, res) => {
  const target = path.join(__dirname, 'public', `${req.params.page}.html`);
  if (fs.existsSync(target)) {
    res.sendFile(target);
  } else {
    res.status(404).send('Not Found');
  }
});

// ─── Start Server ─────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n══════════════════════════════════════════════════`);
    console.log(`  🔍 Issue Monitor Server`);
    console.log(`  🌐 http://localhost:${PORT}`);
    console.log(`══════════════════════════════════════════════════\n`);

    // Auto-start monitoring if configured
    const autoStart = db.getSetting('auto_start');
    if (autoStart === '1') {
      console.log('[Server] Auto-starting monitoring...');
      scheduler.start();
    }
  });
}

module.exports = app;
