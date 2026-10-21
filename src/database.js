const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const tenantStorage = new AsyncLocalStorage();

const os = require('os');

const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'prisma_data') : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const authVault = require('./auth_vault');
const { clusterAndDeduplicate } = require('./clustering');
const { analyzeSentimentNLP } = require('./nlp_sentiment');

// ─── Database Structure ───────────────────────────────
const DEFAULT_DB = {
  settings: {
    google_api_key: '',
    google_cx_id: '',
    max_results_per_query: '10',
    auto_start: '0',
    nlp_engine: 'auto',
    nlp_service_url: 'http://127.0.0.1:8000'
  },
  monitors: [],    // { id, name, keyword, description, polling_interval, initial_polling_mode, status, created_at, updated_at, last_polled_at, next_poll_at }
  keywords: [],      // { id, keyword, is_active, created_at } — kept for backward compat
  results: [],       // { id, monitor_id, keyword_id, keyword_text, platform, title, link, snippet, display_link, scanned_at, sentiment, nlp_sentiment }
  scan_logs: [],     // { id, monitor_id, started_at, finished_at, status, total_results, error_message }
  users: [],         // { id, username, password_hash, salt, created_at }
  sessions: [],      // { token, username, created_at, expires_at }
  _next_ids: { keywords: 1, results: 1, scan_logs: 1, users: 1, monitors: 1 }
};

// ─── Multi-Tenant File I/O ────────────────────────────
const _tenantDbs = {};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TENANTS_DIR)) {
    fs.mkdirSync(TENANTS_DIR, { recursive: true });
  }
}

function getActiveTenantName() {
  return tenantStorage.getStore() || 'psdm.muhammadiyah';
}

function getTenantFilePath(username) {
  const safeName = (username || 'psdm.muhammadiyah').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(TENANTS_DIR, `${safeName}.json`);
}

function loadTenant(username) {
  ensureDir();
  const tenant = username || getActiveTenantName();
  if (!_tenantDbs[tenant]) {
    const tenantFile = getTenantFilePath(tenant);
    if (fs.existsSync(tenantFile)) {
      try {
        const raw = fs.readFileSync(tenantFile, 'utf-8');
        _tenantDbs[tenant] = JSON.parse(raw);
      } catch (err) {
        console.error(`[DB] Error loading tenant ${tenant}, fallback to default:`, err.message);
        _tenantDbs[tenant] = JSON.parse(JSON.stringify(DEFAULT_DB));
      }
    } else {
      // If primary tenant psdm.muhammadiyah, check if legacy database.json exists
      if (tenant === 'psdm.muhammadiyah' && fs.existsSync(DB_FILE)) {
        try {
          const raw = fs.readFileSync(DB_FILE, 'utf-8');
          _tenantDbs[tenant] = JSON.parse(raw);
          fs.writeFileSync(tenantFile, JSON.stringify(_tenantDbs[tenant], null, 2), 'utf-8');
        } catch (e) {
          _tenantDbs[tenant] = JSON.parse(JSON.stringify(DEFAULT_DB));
        }
      } else {
        _tenantDbs[tenant] = JSON.parse(JSON.stringify(DEFAULT_DB));
        fs.writeFileSync(tenantFile, JSON.stringify(_tenantDbs[tenant], null, 2), 'utf-8');
      }
    }

    // Ensure schema keys
    for (const key of Object.keys(DEFAULT_DB)) {
      if (!(key in _tenantDbs[tenant])) _tenantDbs[tenant][key] = DEFAULT_DB[key];
    }
    if (!_tenantDbs[tenant]._next_ids) _tenantDbs[tenant]._next_ids = { keywords: 1, results: 1, scan_logs: 1, users: 1, monitors: 1 };
  }
  return _tenantDbs[tenant];
}

function saveTenant(username) {
  ensureDir();
  const tenant = username || getActiveTenantName();
  const dbData = _tenantDbs[tenant] || DEFAULT_DB;
  const tenantFile = getTenantFilePath(tenant);
  fs.writeFileSync(tenantFile, JSON.stringify(dbData, null, 2), 'utf-8');

  // Keep root database.json synced for default tenant
  if (tenant === 'psdm.muhammadiyah') {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
    } catch(e) {}
  }
}

function initTenantDatabase(username, userMetadata = {}) {
  ensureDir();
  const safeName = (username || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const tenantFile = path.join(TENANTS_DIR, `${safeName}.json`);

  let existing = {};
  if (fs.existsSync(tenantFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(tenantFile, 'utf-8'));
    } catch(e) {}
  }

  const initialData = {
    profile: {
      username: username,
      full_name: userMetadata.full_name || username,
      institution: userMetadata.institution || 'Pusat Syiar Digital Muhammadiyah',
      position: userMetadata.position || '',
      email: userMetadata.email || '',
      avatar_url: existing.profile?.avatar_url || null,
      created_at: existing.profile?.created_at || new Date().toISOString()
    },
    settings: existing.settings || {
      google_api_key: '',
      google_cx_id: '',
      max_results_per_query: '10',
      auto_start: '0'
    },
    monitors: existing.monitors || [],
    keywords: existing.keywords || [],
    results: existing.results || [],
    scan_logs: existing.scan_logs || [],
    _next_ids: existing._next_ids || { keywords: 1, results: 1, scan_logs: 1, monitors: 1 }
  };

  fs.writeFileSync(tenantFile, JSON.stringify(initialData, null, 2), 'utf-8');
  _tenantDbs[username] = initialData;
  console.log(`[DB] Database tenant pribadi baru otomatis dibuat: ${tenantFile}`);
  return tenantFile;
}

function load() {
  return loadTenant(getActiveTenantName());
}

function save() {
  saveTenant(getActiveTenantName());
}

function getDb() {
  return load();
}

function withTenant(username, fn) {
  return tenantStorage.run(username || 'psdm.muhammadiyah', fn);
}

function nextId(entity) {
  const db = getDb();
  const id = db._next_ids[entity] || 1;
  db._next_ids[entity] = id + 1;
  save();
  return id;
}

// ─── Settings ─────────────────────────────────────────
function getSetting(key) {
  const db = getDb();
  return db.settings[key] || null;
}

function setSetting(key, value) {
  const db = getDb();
  db.settings[key] = String(value);
  save();
}

function getAllSettings() {
  const db = getDb();
  return { ...db.settings };
}

// ─── Monitors ─────────────────────────────────────────
function createMonitor({ name, keyword, description, polling_interval, initial_polling_mode }) {
  const db = getDb();
  const trimmedKeyword = keyword.trim();
  const trimmedName = (name || trimmedKeyword).trim();

  if (!trimmedKeyword) {
    throw new Error('Keyword tidak boleh kosong');
  }

  // Check duplicate keyword across monitors
  if (db.monitors.some(m => m.keyword.toLowerCase() === trimmedKeyword.toLowerCase())) {
    throw new Error(`Monitor dengan keyword "${trimmedKeyword}" sudah ada`);
  }

  const id = nextId('monitors');
  const now = new Date().toISOString();
  const interval = parseInt(polling_interval) || 3;

  const monitor = {
    id,
    name: trimmedName,
    keyword: trimmedKeyword,
    description: (description || '').trim(),
    polling_interval: interval,
    initial_polling_mode: initial_polling_mode || 'today',
    status: 'active',
    created_at: now,
    updated_at: now,
    last_polled_at: null,
    next_poll_at: null
  };

  db.monitors.push(monitor);

  // Also create a keyword entry for backward compatibility with searcher
  const kwId = nextId('keywords');
  db.keywords.push({
    id: kwId,
    keyword: trimmedKeyword,
    is_active: 1,
    created_at: now,
    monitor_id: id
  });
  monitor.keyword_id = kwId;

  save();
  return monitor;
}

function getMonitor(id) {
  const db = getDb();
  return db.monitors.find(m => m.id === id) || null;
}

function getAllMonitors() {
  const db = getDb();
  return [...(db.monitors || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getActiveMonitors() {
  return getAllMonitors().filter(m => m.status === 'active');
}

function updateMonitor(id, updates) {
  const db = getDb();
  const monitor = db.monitors.find(m => m.id === id);
  if (!monitor) return null;

  const allowedFields = ['name', 'keyword', 'description', 'polling_interval', 'initial_polling_mode'];
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      if (key === 'keyword') {
        const trimmed = value.trim();
        if (!trimmed) throw new Error('Keyword tidak boleh kosong');
        // Check duplicate
        if (db.monitors.some(m => m.id !== id && m.keyword.toLowerCase() === trimmed.toLowerCase())) {
          throw new Error(`Monitor dengan keyword "${trimmed}" sudah ada`);
        }
        monitor.keyword = trimmed;
        // Update linked keyword entry
        const kw = db.keywords.find(k => k.monitor_id === id);
        if (kw) kw.keyword = trimmed;
      } else if (key === 'polling_interval') {
        monitor.polling_interval = parseInt(value) || 3;
      } else {
        monitor[key] = typeof value === 'string' ? value.trim() : value;
      }
    }
  }

  monitor.updated_at = new Date().toISOString();
  save();
  return monitor;
}

function deleteMonitor(id) {
  const db = getDb();
  const idx = db.monitors.findIndex(m => m.id === id);
  if (idx === -1) return false;

  const monitor = db.monitors[idx];
  db.monitors.splice(idx, 1);

  // Remove linked keyword
  db.keywords = db.keywords.filter(k => k.monitor_id !== id);

  // Remove associated results
  db.results = db.results.filter(r => r.monitor_id !== id);

  // Remove associated scan logs
  db.scan_logs = db.scan_logs.filter(l => l.monitor_id !== id);

  save();
  return true;
}

function toggleMonitorStatus(id, active) {
  const db = getDb();
  const monitor = db.monitors.find(m => m.id === id);
  if (!monitor) return null;

  monitor.status = active ? 'active' : 'inactive';
  monitor.updated_at = new Date().toISOString();

  if (!active) {
    monitor.next_poll_at = null;
  }

  // Sync linked keyword
  const kw = db.keywords.find(k => k.monitor_id === id);
  if (kw) {
    kw.is_active = active ? 1 : 0;
  }

  save();
  return monitor;
}

function updateMonitorPollTime(id, lastPolledAt, nextPollAt) {
  const db = getDb();
  const monitor = db.monitors.find(m => m.id === id);
  if (!monitor) return;
  monitor.last_polled_at = lastPolledAt;
  monitor.next_poll_at = nextPollAt;
  monitor.updated_at = new Date().toISOString();
  save();
}

function getMonitorStats(monitorId) {
  const db = getDb();
  let results = db.results;

  if (monitorId && monitorId !== 'all') {
    results = results.filter(r => r.monitor_id === monitorId);
  }

  const stats = {
    total: results.length,
    total_unique_stories: results.filter(r => r.is_representative !== false).length,
    platforms: { facebook: 0, twitter: 0, instagram: 0, website: 0 },
    sentiment: {
      positif: 0,
      negatif: 0,
      neutral: 0
    }
  };

  results.forEach(r => {
    if (stats.platforms.hasOwnProperty(r.platform)) {
      stats.platforms[r.platform]++;
    }
    const rawSent = r.sentiment || 'neutral';
    const sent = (rawSent === 'netral' || rawSent === 'neutral') ? 'neutral' : rawSent;
    if (stats.sentiment.hasOwnProperty(sent)) {
      stats.sentiment[sent]++;
    }
  });

  stats.sentiment.netral = stats.sentiment.neutral;

  return stats;
}

// ─── Keywords (kept for backward compat) ──────────────
function addKeyword(keyword) {
  const db = getDb();
  const trimmed = keyword.trim();

  // Check unique
  if (db.keywords.some(k => k.keyword.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Keyword sudah ada');
  }

  const id = nextId('keywords');
  const entry = {
    id,
    keyword: trimmed,
    is_active: 1,
    created_at: new Date().toISOString()
  };

  db.keywords.push(entry);
  save();
  return entry;
}

function removeKeyword(id) {
  const db = getDb();
  const idx = db.keywords.findIndex(k => k.id === id);
  if (idx === -1) return false;

  db.keywords.splice(idx, 1);
  // Also remove associated results
  db.results = db.results.filter(r => r.keyword_id !== id);
  save();
  return true;
}

function getAllKeywords() {
  const db = getDb();
  return [...db.keywords].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getActiveKeywords() {
  return getAllKeywords().filter(k => k.is_active === 1);
}

function toggleKeyword(id, isActive) {
  const db = getDb();
  const kw = db.keywords.find(k => k.id === id);
  if (kw) {
    kw.is_active = (isActive === 1 || isActive === true || isActive === '1' || isActive === 'true') ? 1 : 0;
    save();
    return kw;
  }
  return null;
}

// ─── Results ──────────────────────────────────────────
function insertResult(result) {
  const db = getDb();

  // Check duplicate link per keyword
  const exists = db.results.some(r => r.link === result.link && r.keyword_id === result.keyword_id);
  if (exists) return null;

  const id = nextId('results');
  const entry = {
    id,
    monitor_id: result.monitor_id || null,
    keyword_id: result.keyword_id,
    keyword_text: result.keyword_text,
    platform: result.platform,
    title: result.title,
    link: result.link,
    snippet: result.snippet || '',
    display_link: result.display_link || '',
    scanned_at: new Date().toISOString()
  };

  db.results.push(entry);
  save();
  return id;
}

async function insertResults(results, monitorId = null) {
  const db = getDb();
  let count = 0;

  for (const r of results) {
    // Check duplicate
    const exists = db.results.some(ex => ex.link === r.link && ex.keyword_id === r.keyword_id);
    if (exists) continue;

    let nlp = r.nlp_sentiment;
    if (!nlp) {
      const text = `${r.title || ''} ${r.snippet || ''}`;
      try {
        nlp = await analyzeSentimentNLPAsync(text);
      } catch (err) {
        nlp = analyzeSentimentNLP(text);
      }
    }

    const id = nextId('results');
    const newEntry = {
      id,
      monitor_id: monitorId || r.monitor_id || null,
      keyword_id: r.keyword_id,
      keyword_text: r.keyword_text,
      platform: r.platform,
      title: r.title,
      link: r.link,
      snippet: r.snippet || '',
      display_link: r.display_link || '',
      scanned_at: r.published_at || new Date().toISOString(),
      sentiment: nlp.label,
      nlp_sentiment: nlp,
      is_representative: true,
      similar_sources_count: 0
    };

    db.results.push(newEntry);
    count++;
  }

  if (count > 0) {
    // Re-cluster all results to discover cross-source similarities
    db.results = clusterAndDeduplicate(db.results, 0.40);
    save();
  }
  return count;
}

function enrichAndClusterDatabase() {
  const db = getDb();
  if (!Array.isArray(db.results) || db.results.length === 0) return;

  let modified = false;

  for (const r of db.results) {
    if (!r.nlp_sentiment || !r.sentiment) {
      const text = `${r.title || ''} ${r.snippet || ''}`;
      const nlp = analyzeSentimentNLP(text);
      r.sentiment = nlp.label;
      r.nlp_sentiment = nlp;
      modified = true;
    }
    // Hapus seluruh metrik engagement tiruan agar data murni dan faktual
    if (r.engagement !== undefined) {
      delete r.engagement;
      modified = true;
    }
  }

  // Run clustering across all results
  const clustered = clusterAndDeduplicate(db.results, 0.40);
  db.results = clustered;
  save();
  console.log(`[DB] Berhasil menyinkronkan data faktual & clustering (${db.results.length} total hasil)`);
}

function getResults(filters = {}) {
  const db = getDb();
  let results = [...db.results];

  // Deduplication filter (default: true -> hanya tampilkan representative story)
  if (filters.dedup !== false && filters.dedup !== 'false') {
    results = results.filter(r => r.is_representative !== false);
  }

  // Monitor filter
  if (filters.monitor_id && filters.monitor_id !== 'all') {
    const mid = parseInt(filters.monitor_id);
    results = results.filter(r => r.monitor_id === mid);
  }

  if (filters.keyword_id && filters.keyword_id !== 'all') {
    results = results.filter(r => r.keyword_id == filters.keyword_id);
  }
  
  if (filters.platform && filters.platform !== 'all') {
    results = results.filter(r => r.platform === filters.platform);
  }
  
  if (filters.sentiment && filters.sentiment !== 'all') {
    results = results.filter(r => {
      const s = r.sentiment || 'neutral';
      if (filters.sentiment === 'neutral' || filters.sentiment === 'netral') {
        return s === 'neutral' || s === 'netral';
      }
      return s === filters.sentiment;
    });
  }

  if (filters.search) {
    const query = String(filters.search).trim().toLocaleLowerCase();
    if (query) {
      results = results.filter(result => [
        result.title,
        result.snippet,
        result.keyword_text,
        result.display_link,
        result.platform
      ].some(value => String(value || '').toLocaleLowerCase().includes(query)));
    }
  }

  // Sorting: newest (default), oldest, title_asc, title_desc
  const sortBy = filters.sort_by || 'newest';
  if (sortBy === 'oldest') {
    results.sort((a, b) => new Date(a.scanned_at) - new Date(b.scanned_at));
  } else if (sortBy === 'title_asc') {
    results.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sortBy === 'title_desc') {
    results.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
  } else {
    results.sort((a, b) => new Date(b.scanned_at) - new Date(a.scanned_at));
  }
  
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  return results.slice(offset, offset + limit);
}

function getResultStats(monitorId = null) {
  if (monitorId) {
    return getMonitorStats(monitorId);
  }

  const db = getDb();
  const stats = {
    total: db.results.length,
    total_unique_stories: db.results.filter(r => r.is_representative !== false).length,
    platforms: { facebook: 0, twitter: 0, instagram: 0, website: 0 },
    sentiment: {
      positif: 0,
      negatif: 0,
      neutral: 0
    }
  };

  db.results.forEach(r => {
    if (stats.platforms.hasOwnProperty(r.platform)) {
      stats.platforms[r.platform]++;
    }
    
    const rawSent = r.sentiment || 'neutral';
    const sent = (rawSent === 'netral' || rawSent === 'neutral') ? 'neutral' : rawSent;
    if (stats.sentiment.hasOwnProperty(sent)) {
      stats.sentiment[sent]++;
    }
  });

  stats.sentiment.netral = stats.sentiment.neutral;

  return stats;
}

function getLatestResults(limit = 50, dedup = true, monitorId = null) {
  const db = getDb();
  let results = [...db.results];

  if (monitorId && monitorId !== 'all') {
    const mid = parseInt(monitorId);
    results = results.filter(r => r.monitor_id === mid);
  }

  if (dedup) {
    results = results.filter(r => r.is_representative !== false);
  }
  return results
    .sort((a, b) => new Date(b.scanned_at) - new Date(a.scanned_at))
    .slice(0, limit);
}

function clearAllResults() {
  const db = getDb();
  db.results = [];
  db.scan_logs = [];
  // Reset monitor poll times
  if (db.monitors) {
    db.monitors.forEach(m => {
      m.last_polled_at = null;
      m.next_poll_at = null;
    });
  }
  save();
}

function deleteResult(id) {
  const db = getDb();
  const numId = parseInt(id, 10);
  const initialLength = db.results.length;
  db.results = db.results.filter(r => r.id !== numId && String(r.id) !== String(id));
  db.results.forEach(r => {
    if (Array.isArray(r.similar_articles)) {
      const initSimLen = r.similar_articles.length;
      r.similar_articles = r.similar_articles.filter(sim => sim.id !== numId && String(sim.id) !== String(id));
      if (r.similar_articles.length < initSimLen) {
        r.similar_sources_count = r.similar_articles.length;
      }
    }
  });
  if (db.results.length < initialLength) {
    save();
    return true;
  }
  return false;
}

function deleteResultsBatch(ids) {
  const db = getDb();
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const idSet = new Set(ids.map(x => String(x)));
  const numIdSet = new Set(ids.map(x => parseInt(x, 10)).filter(x => !isNaN(x)));
  
  const initialLength = db.results.length;
  db.results = db.results.filter(r => !idSet.has(String(r.id)) && !numIdSet.has(r.id));
  
  db.results.forEach(r => {
    if (Array.isArray(r.similar_articles)) {
      const initSimLen = r.similar_articles.length;
      r.similar_articles = r.similar_articles.filter(sim => !idSet.has(String(sim.id)) && !numIdSet.has(sim.id));
      if (r.similar_articles.length < initSimLen) {
        r.similar_sources_count = r.similar_articles.length;
      }
    }
  });

  const deletedCount = initialLength - db.results.length;
  if (deletedCount > 0) {
    save();
  }
  return deletedCount;
}

function getResultCount() {
  return getDb().results.length;
}

function updateResultNarrative(id, narrative) {
  const db = getDb();
  const r = db.results.find(x => x.id === id);
  if (r) {
    r.ai_narrative = narrative;
    save();
    return true;
  }
  return false;
}

function updateResultNarrativesBatch(itemsWithNarrative) {
  const db = getDb();
  let modified = false;
  for (const item of itemsWithNarrative) {
    if (!item.id || !item.ai_narrative) continue;
    const r = db.results.find(x => x.id === item.id);
    if (r && r.ai_narrative !== item.ai_narrative) {
      r.ai_narrative = item.ai_narrative;
      modified = true;
    }
  }
  if (modified) {
    save();
  }
}


// ─── Scan Logs ────────────────────────────────────────
function createScanLog(monitorId = null) {
  const db = getDb();
  const id = nextId('scan_logs');
  const entry = {
    id,
    monitor_id: monitorId,
    started_at: new Date().toISOString(),
    finished_at: null,
    status: 'running',
    total_results: 0,
    error_message: null
  };
  db.scan_logs.push(entry);
  save();
  return id;
}

function completeScanLog(id, totalResults, errorMessage = null) {
  const db = getDb();
  const log = db.scan_logs.find(l => l.id === id);
  if (log) {
    log.finished_at = new Date().toISOString();
    log.status = errorMessage ? 'error' : 'completed';
    log.total_results = totalResults;
    log.error_message = errorMessage;
    save();
  }
}

function getLastScanLog(monitorId = null) {
  const db = getDb();
  let logs = db.scan_logs;
  if (monitorId) {
    logs = logs.filter(l => l.monitor_id === monitorId);
  }
  if (logs.length === 0) return null;
  return logs[logs.length - 1];
}

function getScanLogs(limit = 20, monitorId = null) {
  const db = getDb();
  let logs = [...db.scan_logs];
  if (monitorId) {
    logs = logs.filter(l => l.monitor_id === monitorId);
  }
  return logs
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

// ─── Migration: Keywords → Monitors ───────────────────
function migrateKeywordsToMonitors() {
  const db = getDb();
  if (!db.monitors) db.monitors = [];
  if (!db._next_ids.monitors) db._next_ids.monitors = 1;

  // Only migrate keywords that don't have a monitor_id yet
  const unmigrated = db.keywords.filter(k => !k.monitor_id);
  if (unmigrated.length === 0) return;

  console.log(`[DB] Migrating ${unmigrated.length} keyword(s) to monitors...`);

  for (const kw of unmigrated) {
    const monitorId = nextId('monitors');
    const now = new Date().toISOString();

    const monitor = {
      id: monitorId,
      name: kw.keyword,
      keyword: kw.keyword,
      description: '',
      polling_interval: parseInt(db.settings.interval_hours || '3') || 3,
      initial_polling_mode: 'today',
      status: kw.is_active === 1 ? 'active' : 'inactive',
      created_at: kw.created_at || now,
      updated_at: now,
      last_polled_at: null,
      next_poll_at: null,
      keyword_id: kw.id
    };

    db.monitors.push(monitor);
    kw.monitor_id = monitorId;

    // Link existing results to this monitor
    db.results.forEach(r => {
      if (r.keyword_id === kw.id && !r.monitor_id) {
        r.monitor_id = monitorId;
      }
    });

    // Link existing scan logs
    db.scan_logs.forEach(l => {
      if (!l.monitor_id) {
        l.monitor_id = monitorId;
      }
    });
  }

  save();
  console.log(`[DB] Migration complete. ${db.monitors.length} monitor(s) total.`);
}

// ─── Authentication & Security ─────────────────────────
function verifyUser(username, password) {
  const result = authVault.verifyUserLogin(username, password);
  return result.ok ? true : false;
}

function verifyUserExtended(username, password) {
  return authVault.verifyUserLogin(username, password);
}

function changeUserPassword(username, currentPassword, newPassword, currentToken) {
  const check = authVault.verifyUserLogin(username, currentPassword);
  if (!check.ok) return false;
  return authVault.changeUserPasswordVault(username, currentPassword, newPassword, currentToken);
}

function createSession(username, durationDays = 7) {
  return authVault.createUserSession(username, durationDays);
}

function validateSession(token) {
  return authVault.validateUserSession(token);
}

function destroySession(token) {
  return authVault.destroyUserSession(token);
}

function getUserProfile(username) {
  if (!username) return null;
  const users = authVault.getAllVaultUsers();
  const user = users.find(u => u.username === String(username).trim());
  if (!user) return null;
  
  const tenantDb = loadTenant(user.username);
  return {
    username: user.username,
    full_name: user.full_name || user.username,
    email: user.email,
    position: user.position,
    institution: user.institution,
    avatar_url: tenantDb?.profile?.avatar_url || null,
    created_at: user.created_at,
    subscription_expires_at: user.subscription_expires_at
  };
}

function updateUserAvatar(username, avatarUrl) {
  if (!username) return false;
  const tenantDb = loadTenant(username);
  if (!tenantDb.profile) tenantDb.profile = {};
  tenantDb.profile.avatar_url = avatarUrl;
  saveTenant(username);
  return true;
}
// Initialize on load
load();
enrichAndClusterDatabase();
migrateKeywordsToMonitors();
console.log('[DB] Database loaded from', DB_FILE);

module.exports = {
  getUserProfile,
  updateUserAvatar,
  getSetting,
  setSetting,
  getAllSettings,
  // Monitors
  createMonitor,
  getMonitor,
  getAllMonitors,
  getActiveMonitors,
  updateMonitor,
  deleteMonitor,
  toggleMonitorStatus,
  updateMonitorPollTime,
  getMonitorStats,
  // Keywords (backward compat)
  addKeyword,
  removeKeyword,
  getAllKeywords,
  getActiveKeywords,
  toggleKeyword,
  // Results
  insertResult,
  insertResults,
  getResults,
  getResultStats,
  getLatestResults,
  clearAllResults,
  deleteResult,
  deleteResultsBatch,
  getResultCount,
  updateResultNarrative,
  updateResultNarrativesBatch,

  // Scan logs
  createScanLog,
  completeScanLog,
  getLastScanLog,
  getScanLogs,
  // Auth & Multi-Tenant
  verifyUser,
  verifyUserExtended,
  changeUserPassword,
  createSession,
  validateSession,
  destroySession,
  withTenant,
  tenantStorage,
  loadTenant,
  saveTenant,
  initTenantDatabase,
  enrichAndClusterDatabase,
  migrateKeywordsToMonitors
};
