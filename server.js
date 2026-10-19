const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./src/database');
const scheduler = require('./src/scheduler');
const { buildPDFReport } = require('./src/pdf_report_builder');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Public static assets (css, js, images, fonts)
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));

// ─── Cookie & Auth Helpers ────────────────────────────────────
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function getAuthToken(req) {
  const cookieToken = getCookie(req, 'syiar_auth_token') || getCookie(req, 'pijar_auth_token');
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function pageAuthGuard(req, res, next) {
  const token = getAuthToken(req);
  const session = db.validateSession(token);
  if (!session) {
    return res.redirect('/login');
  }
  req.user = session;
  next();
}

function apiAuthGuard(req, res, next) {
  const token = getAuthToken(req);
  const session = db.validateSession(token);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.' });
  }
  req.user = session;
  next();
}

// ─── API: Auth Endpoints ──────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }
    const isValid = db.verifyUser(username, password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
    const session = db.createSession(username);
    res.setHeader('Set-Cookie', [
      `syiar_auth_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
      `pijar_auth_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
    ]);
    res.json({
      success: true,
      message: 'Login berhasil',
      token: session.token,
      user: { username }
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
      avatar_url: profile?.avatar_url || null
    }
  });
});

// Guard all other /api/* routes
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') {
    return next();
  }
  apiAuthGuard(req, res, next);
});

app.post('/api/auth/avatar', (req, res) => {
  try {
    const { avatar } = req.body;
    const username = req.user.username;
    const avatarsDir = path.join(__dirname, 'public', 'images', 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    if (!avatar) {
      db.updateUserAvatar(username, null);
      return res.json({ success: true, message: 'Foto profil berhasil dihapus.', avatar_url: null });
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

app.post('/api/monitors', (req, res) => {
  try {
    const { name, keyword, description, polling_interval, initial_polling_mode } = req.body;
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ success: false, message: 'Keyword tidak boleh kosong' });
    }
    const monitor = db.createMonitor({ name, keyword, description, polling_interval, initial_polling_mode });
    
    // Start timer if scheduler is running
    const status = scheduler.getStatus();
    if (status.isRunning && monitor.status === 'active') {
      scheduler.startMonitorTimer(monitor);
    }
    
    res.json({ success: true, data: monitor, message: `Monitor "${monitor.name}" berhasil dibuat` });
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

app.put('/api/monitors/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = db.updateMonitor(id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Monitor tidak ditemukan' });
    
    // Restart timer if interval changed
    if (req.body.polling_interval) {
      scheduler.restartMonitorTimer(id);
    }
    
    res.json({ success: true, data: updated, message: `Monitor "${updated.name}" berhasil diperbarui` });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/monitors/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const monitor = db.getMonitor(id);
    if (!monitor) return res.status(404).json({ success: false, message: 'Monitor tidak ditemukan' });
    
    scheduler.stopMonitorTimer(id);
    db.deleteMonitor(id);
    
    res.json({ success: true, message: `Monitor "${monitor.name}" beserta hasilnya berhasil dihapus` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/monitors/:id/toggle', (req, res) => {
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
    
    scheduler.runMonitorNow(id).then(result => {
      console.log(`[Server] Monitor scan complete: ${result.totalNewResults || 0} new results`);
    }).catch(err => {
      console.error(`[Server] Monitor scan error: ${err.message}`);
    });
    
    res.json({ success: true, message: 'Scan dimulai untuk monitor ini!' });
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
    const allowedKeys = ['google_api_key', 'google_cx_id', 'interval_hours', 'max_results_per_query', 'auto_start'];
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

    res.json({ success: true, message: 'Settings berhasil disimpan' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
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

// ─── Login & Page Routes ──────────────────────────────────────
app.get('/login', (req, res) => {
  const token = getAuthToken(req);
  if (token && db.validateSession(token)) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

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
