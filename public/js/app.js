/* ═══════════════════════════════════════════════════════
   ISSUE MONITOR — Frontend Application Logic
   API communication, state management, rendering
   ═══════════════════════════════════════════════════════ */

const API_BASE = '';

const PUBLIC_PAGES = ['/login', '/login.html', '/register', '/register.html', '/signup', '/kjkaaf94nf/login'];

function isPublicPage() {
  const p = window.location.pathname.toLowerCase();
  return PUBLIC_PAGES.some(pub => p === pub || p.endsWith(pub));
}

// ─── API Helper ───────────────────────────────────────
async function api(url, method = 'GET', body = null) {
  let m = typeof method === 'string' ? method : (method && method.method) || 'GET';
  let b = typeof method === 'object' && method !== null && method.body !== undefined ? method.body : body;
  const token = localStorage.getItem('prisma_auth_token') || localStorage.getItem('syiar_auth_token') || sessionStorage.getItem('prisma_auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const opts = {
    method: m,
    headers,
    credentials: 'include'
  };
  if (b) opts.body = typeof b === 'string' ? b : JSON.stringify(b);

  const res = await fetch(API_BASE + url, opts);
  
  if (res.status === 401) {
    if (!isPublicPage()) {
      try {
        localStorage.removeItem('prisma_auth_token');
        localStorage.removeItem('syiar_auth_token');
        sessionStorage.removeItem('prisma_auth_token');
      } catch (e) {}
      window.location.href = '/login';
    }
    return { success: false, message: 'Unauthenticated' };
  }

  const data = await res.json();

  if (!data.success && res.status >= 400) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

// ─── Authentication ───────────────────────────────────
async function logout() {
  try {
    localStorage.removeItem('prisma_auth_token');
    localStorage.removeItem('syiar_auth_token');
    sessionStorage.removeItem('prisma_auth_token');
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (e) {
    console.error('Logout error:', e);
  } finally {
    window.location.href = '/login';
  }
}

function uiIcon(name, className = 'ui-icon') {
  const icons = {
    checkCircle: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path>',
    error: '<circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6m0-6-6 6"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5m0-8h.01"></path>',
    bolt: '<path d="m13 2-3 8h7l-6 12 1-9H5l8-11z"></path>',
    play: '<path d="m8 5 12 7-12 7z"></path>',
    circle: '<circle cx="12" cy="12" r="8"></circle>',
    trash: '<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6"></path>',
    key: '<circle cx="8" cy="15" r="4"></circle><path d="m11 12 9-9m-4 4 3 3m-6-1 3 3"></path>',
    warning: '<path d="M12 3 2.8 19h18.4L12 3z"></path><path d="M12 9v4m0 3h.01"></path>',
    clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    facebook: '<path d="M14 21v-8h3l.5-4H14V7c0-1.2.4-2 2-2h2V1.4C17.2 1.2 16.1 1 15 1c-3.3 0-5 2-5 5.5V9H7v4h3v8h4z" fill="currentColor" stroke="none"></path>',
    twitter: '<path d="M22 5.9a8 8 0 0 1-2.4.7 4.2 4.2 0 0 0 1.8-2.3 8.4 8.4 0 0 1-2.7 1 4.2 4.2 0 0 0-7.2 3.8 11.9 11.9 0 0 1-8.6-4.4 4.2 4.2 0 0 0 1.3 5.6 4.2 4.2 0 0 1-1.9-.5v.1a4.2 4.2 0 0 0 3.4 4.1 4.2 4.2 0 0 1-1.9.1 4.2 4.2 0 0 0 3.9 2.9A8.4 8.4 0 0 1 2.5 19a11.9 11.9 0 0 0 18.3-10 8.5 8.5 0 0 0 2.1-2.2z" fill="currentColor" stroke="none"></path>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><path d="M17.5 6.5h.01"></path>',
    globe: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a15 15 0 0 1 0 18m0-18a15 15 0 0 0 0 18"></path>',
    link: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7m2.7 6.4a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"></path>',
    positive: '<circle cx="12" cy="12" r="9"></circle><path d="M8 14s1.3 2 4 2 4-2 4-2M9 9h.01M15 9h.01"></path>',
    negative: '<circle cx="12" cy="12" r="9"></circle><path d="M8 16s1.3-2 4-2 4 2 4 2M9 9h.01M15 9h.01"></path>',
    neutral: '<circle cx="12" cy="12" r="9"></circle><path d="M8 15h8M9 9h.01M15 9h.01"></path>',
    news: '<path d="M4 4h14v16H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm14 4h2v10a2 2 0 0 1-2 2"></path><path d="M7 8h8M7 12h8m-8 4h5"></path>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path>',
    chart: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V7"></path>',
    save: '<path d="M5 3h12l4 4v14H3V3h2zm2 0v6h10V3M7 21v-8h10v8"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 1 1-4 0v-.2A2 2 0 0 0 5.8 17l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a2 2 0 0 0-1.4-3.4h-.2a2 2 0 1 1 0-4h.2A2 2 0 0 0 3 4.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a2 2 0 0 0 3.4-1.4v-.2a2 2 0 1 1 4 0V0a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a2 2 0 0 0 1.4 3.4h.2a2 2 0 1 1 0 4h-.2a2 2 0 0 0-1.4 3.4z"></path>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.5-3.3 1.7 1.7 0 0 1 1.3-2.8H18a3 3 0 0 0 3-3c0-5-4-8.9-9-8.9z"></path><path d="M7.5 12h.01M10 7.5h.01m4 0h.01m2.5 4.5h.01"></path>',
    sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
    moon: '<path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14z"></path>',
    bulb: '<path d="M9 18h6m-5 3h4m-2-20a7 7 0 0 0-4 12.7c.6.4 1 1.1 1 1.8V17h6v-.5c0-.7.4-1.4 1-1.8A7 7 0 0 0 12 1z"></path>'
  };
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
}

// ─── Toast System ─────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: 'checkCircle', error: 'error', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${uiIcon(icons[type] || icons.info)}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── Monitor Status (shared across all pages) ─────────
async function loadMonitorStatus() {
  try {
    const res = await api('/api/monitor/status');
    const status = res.data;

    // Support both old (navStatus/navStatusText) and new (navStatusPill/navStatusLabel) navbar elements
    const navStatus = document.getElementById('navStatus') || document.getElementById('navStatusPill');
    const navStatusText = document.getElementById('navStatusText') || document.getElementById('navStatusLabel');

    if (navStatus && navStatusText) {
      if (status.isRunning) {
        navStatus.className = navStatus.id === 'navStatusPill' ? 'nav-status-pill running' : 'nav-status running';
        navStatusText.textContent = status.scanInProgress ? 'SCANNING...' : 'MONITORING';
      } else {
        navStatus.className = navStatus.id === 'navStatusPill' ? 'nav-status-pill stopped' : 'nav-status stopped';
        navStatusText.textContent = 'STOPPED';
      }
    }

    // Update dashboard monitor panel if exists
    updateMonitorPanel(status);

  } catch (e) {
    console.error('Failed to load monitor status:', e);
  }
}

function updateMonitorPanel(status) {
  const panel = document.getElementById('monitorPanel');
  if (!panel) return;

  const indicator = document.getElementById('monitorIndicator');
  const statusText = document.getElementById('monitorStatusText');
  const btnStart = document.getElementById('btnStartMonitor');
  const btnStop = document.getElementById('btnStopMonitor');
  const intervalEl = document.getElementById('monitorInterval');
  const lastRunEl = document.getElementById('monitorLastRun');
  const nextRunEl = document.getElementById('monitorNextRun');

  if (status.isRunning) {
    panel.className = 'monitor-panel active';
    indicator.className = 'monitor-status-indicator active';
    statusText.innerHTML = status.scanInProgress ? `${uiIcon('bolt')} Scanning...` : `${uiIcon('checkCircle')} Monitoring Aktif`;
    btnStart.style.display = 'none';
    btnStop.style.display = '';
  } else {
    panel.className = 'monitor-panel inactive';
    indicator.className = 'monitor-status-indicator inactive';
    statusText.textContent = 'Monitoring Tidak Aktif';
    btnStart.style.display = '';
    btnStop.style.display = 'none';
  }

  intervalEl.textContent = `${status.intervalHours} jam`;

  if (status.lastRunTime) {
    lastRunEl.textContent = formatTime(status.lastRunTime);
  } else if (status.lastScan?.started_at) {
    lastRunEl.textContent = formatTime(status.lastScan.started_at);
  } else {
    lastRunEl.textContent = 'Belum pernah';
  }

  if (status.nextRunTime && status.isRunning) {
    nextRunEl.textContent = formatTime(status.nextRunTime);
  } else {
    nextRunEl.textContent = '—';
  }
}

// ─── Monitor Controls ─────────────────────────────────
async function startMonitor() {
  const btn = document.getElementById('btnStartMonitor') || document.getElementById('rpBtnStart');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm" style="display:inline-block;"></div> Memulai...';
  }

  try {
    // Start scheduler first, then trigger a scan in background
    const startResult = await api('/api/monitor/start', 'POST');
    showToast(startResult.message || 'Monitoring dimulai!', 'success');

    // Trigger background scan (non-blocking)
    const runResult = await api('/api/monitor/run-now', 'POST');
    showToast(runResult.message || 'Scan dimulai...', 'info');

    loadMonitorStatus();

    // Auto-refresh data every 5 seconds for 2 minutes to pick up scan results
    startAutoRefresh();
  } catch (e) {
    showToast(e.message, 'error');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `${uiIcon('play')} Mulai Monitoring`;
  }
}

async function stopMonitor() {
  try {
    const res = await api('/api/monitor/stop', 'POST');
    showToast(res.message || 'Monitoring dihentikan', 'info');
    loadMonitorStatus();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function runNow() {
  const btn = document.getElementById('btnRunNow') || document.getElementById('rpBtnScan');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm" style="display:inline-block;"></div> Scanning...';
  }

  try {
    const res = await api('/api/monitor/run-now', 'POST');
    if (res.success) {
      showToast(res.message || 'Scan dimulai!', 'success');
      // Start auto-refresh to pick up results as they come in
      startAutoRefresh();
    } else {
      showToast(res.message || 'Scan gagal', 'error');
    }
    loadMonitorStatus();
  } catch (e) {
    showToast(e.message, 'error');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = originalHtml || `${uiIcon('bolt')} Scan Sekarang`;
  }
}

// ─── Auto-refresh while scan is running ───────────────
let _autoRefreshInterval = null;
function startAutoRefresh() {
  // Clear any existing auto-refresh
  if (_autoRefreshInterval) clearInterval(_autoRefreshInterval);

  let ticks = 0;
  const maxTicks = 24; // 24 * 5s = 2 minutes max

  _autoRefreshInterval = setInterval(async () => {
    ticks++;
    try {
      // Refresh data
      if (typeof loadStats === 'function') loadStats();
      if (typeof loadRecentResults === 'function') loadRecentResults();
      if (typeof loadScanLogs === 'function') loadScanLogs();
      if (typeof loadAllResults === 'function') loadAllResults();
      if (typeof loadKeywordsPanel === 'function') loadKeywordsPanel();
      loadMonitorStatus();

      // Check if scan is done
      const statusRes = await api('/api/monitor/status');
      if (!statusRes.data.scanInProgress || ticks >= maxTicks) {
        clearInterval(_autoRefreshInterval);
        _autoRefreshInterval = null;
        if (ticks < maxTicks) {
          showToast('Scan selesai! Data telah diperbarui.', 'success');
        }
      }
    } catch (e) {
      // Silently ignore refresh errors
    }
  }, 5000);
}

// ─── Stats ────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await api('/api/results/stats');
    const stats = res.data;

    animateValue('statTotal', stats.total);
    animateValue('statFacebook', stats.platforms.facebook);
    animateValue('statTwitter', stats.platforms.twitter);
    animateValue('statInstagram', stats.platforms.instagram);
    animateValue('statWebsite', stats.platforms.website);

    if (stats.sentiment) {
      animateValue('statSentPositif', stats.sentiment.positif || 0);
      animateValue('statSentNegatif', stats.sentiment.negatif || 0);
      animateValue('statSentNeutral', stats.sentiment.neutral || 0);
    }

    if (stats.total_unique_stories !== undefined) {
      animateValue('statUniqueStories', stats.total_unique_stories);
    }
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

function animateValue(elementId, targetValue) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const current = parseInt(el.textContent) || 0;
  if (current === targetValue) return;

  const duration = 500;
  const start = performance.now();

  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const value = Math.round(current + (targetValue - current) * eased);
    el.textContent = value.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ─── Keywords ─────────────────────────────────────────
async function loadKeywords() {
  try {
    const res = await api('/api/keywords');
    const container = document.getElementById('keywordList');
    if (!container) return;

    const countEl = document.getElementById('monitorKeywordCount');
    if (countEl) {
      const activeCount = res.data.filter(k => k.is_active).length;
      countEl.textContent = activeCount;
    }

    if (res.data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${uiIcon('key')}</div>
          <div class="empty-state-title">Belum ada keyword</div>
          <div class="empty-state-desc">Tambahkan keyword yang ingin Anda monitor.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = res.data.map(kw => `
      <div class="keyword-item fade-in">
        <div>
          <span class="keyword-text">${escapeHtml(kw.keyword)}</span>
          ${!kw.is_active ? '<span style="font-size:0.7rem; color:var(--text-muted); margin-left:8px;">(nonaktif)</span>' : ''}
        </div>
        <div class="keyword-actions">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="toggleKw(${kw.id}, ${!kw.is_active})" title="${kw.is_active ? 'Nonaktifkan' : 'Aktifkan'}">
            ${uiIcon(kw.is_active ? 'checkCircle' : 'circle')}
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteKw(${kw.id})" title="Hapus">${uiIcon('trash')}</button>
        </div>
      </div>
    `).join('');

  } catch (e) {
    showToast('Gagal memuat keywords: ' + e.message, 'error');
  }
}

async function addKeyword() {
  const input = document.getElementById('keywordInput');
  if (!input) return;

  const keyword = input.value.trim();
  if (!keyword) {
    showToast('Masukkan keyword terlebih dahulu', 'error');
    return;
  }

  try {
    await api('/api/keywords', 'POST', { keyword });
    input.value = '';
    showToast(`Keyword "${keyword}" berhasil ditambahkan`, 'success');
    loadKeywords();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteKw(id) {
  if (!confirm('Hapus keyword ini beserta semua hasilnya?')) return;

  try {
    await api(`/api/keywords/${id}`, 'DELETE');
    showToast('Keyword dihapus', 'success');
    loadKeywords();
    if (typeof loadStats === 'function') loadStats();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function toggleKw(id, isActive) {
  try {
    await api(`/api/keywords/${id}/toggle`, 'PATCH', { is_active: isActive });
    showToast(`Keyword ${isActive ? 'diaktifkan' : 'dinonaktifkan'}`, 'info');
    loadKeywords();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ─── Scan Logs ────────────────────────────────────────
async function loadScanLogs() {
  try {
    const res = await api('/api/scan-logs?limit=15');
    const container = document.getElementById('scanLogList');
    if (!container) return;

    if (res.data.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 30px;">
          <div class="empty-state-desc">Belum ada riwayat scan</div>
        </div>
      `;
      return;
    }

    container.innerHTML = res.data.map(log => `
      <div class="scan-log-item fade-in">
        <div class="scan-log-status ${log.status}"></div>
        <span class="scan-log-time">${formatTime(log.started_at)}</span>
        <span class="scan-log-results">
          ${log.status === 'completed' ? `${log.total_results} hasil baru` : ''}
          ${log.status === 'error' ? `${uiIcon('warning')} Error` : ''}
          ${log.status === 'running' ? `${uiIcon('clock')} Sedang berjalan...` : ''}
        </span>
        ${log.error_message ? `<span style="font-size: 0.72rem; color: var(--danger); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.error_message)}">${escapeHtml(log.error_message.substring(0, 50))}</span>` : ''}
      </div>
    `).join('');

  } catch (e) {
    console.error('Failed to load scan logs:', e);
  }
}

// ─── Recent Results ───────────────────────────────────
async function loadRecentResults() {
  try {
    const res = await api('/api/results/latest?limit=10');
    const container = document.getElementById('recentResults');
    if (!container) return;

    if (res.data.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 30px;">
          <div class="empty-state-desc">Belum ada data aktivitas monitoring. Mulai monitoring untuk melihat aktivitas.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = res.data.map(item => renderResultCard(item)).join('');

  } catch (e) {
    console.error('Failed to load recent results:', e);
  }
}

// ─── Render Result Card ───────────────────────────────
function renderResultCard(item) {
  const platform = (item.platform || 'website').toLowerCase();

  const platformLabels = {
    facebook: 'FACEBOOK',
    twitter: 'TWITTER / X',
    instagram: 'INSTAGRAM',
    website: 'WEBSITE'
  };

  const platformIcons = {
    facebook: `<svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px;flex-shrink:0;"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>`,
    twitter: `<svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px;flex-shrink:0;"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`,
    website: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
  };

  const hasSimilar = item.similar_sources_count > 0 && Array.isArray(item.similar_articles) && item.similar_articles.length > 0;

  // Keyakinan / Confidence percentage
  let confidencePct = 82;
  if (item.nlp_sentiment && typeof item.nlp_sentiment.confidence === 'number') {
    const rawConf = item.nlp_sentiment.confidence;
    confidencePct = rawConf <= 1.0 ? Math.round(rawConf * 100) : Math.round(rawConf);
  } else if (typeof item.confidence === 'number') {
    const rawConf = item.confidence;
    confidencePct = rawConf <= 1.0 ? Math.round(rawConf * 100) : Math.round(rawConf);
  }

  // Sentimen Label
  const sent = (item.sentiment || 'netral').toLowerCase();
  const sentClass = (sent === 'netral' || sent === 'neutral') ? 'netral' : sent;
  const sentLabel = sent === 'positif' ? 'Positif' : sent === 'negatif' ? 'Negatif' : 'Netral';

  // Hapus tulisan (Headline) jika ada di awal teks, sesuai instruksi user
  let rawTitle = item.title || item.snippet || 'Tidak ada judul postingan';
  let cleanTitle = rawTitle.replace(/^\s*\(Headline\)\s*/i, '').trim();

  // Keyword text
  const keywordText = item.keyword_text || item.keyword || 'muhammadiyah';

  // Waktu
  const timeText = formatTime(item.scanned_at);

  return `
    <div class="result-card ${platform} fade-in" id="card-${item.id}" onclick="onResultCardClick(event, ${item.id})">
      <div class="result-card-body">
        <!-- 1. Header Baris Judul & Checkbox Tinjau -->
        <div class="result-card-header-row">
          <label class="result-card-checkbox-label" onclick="event.stopPropagation();" title="Centang untuk memilih temuan ini">
            <input type="checkbox" class="result-item-checkbox" data-id="${item.id}" data-title="${escapeHtml(cleanTitle)}" onchange="onResultCheckboxChange(this, event)">
          </label>
          <div style="flex:1; min-width:0;">
            <h3 class="result-card-title">${escapeHtml(cleanTitle)}</h3>

            <!-- 2. Link Lihat Selengkapnya dengan Simbol Panah -->
            <div style="margin-top: 4px;">
              <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="result-read-more" title="Buka tautan postingan asli" onclick="event.stopPropagation();">
                Lihat Selengkapnya
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;margin-left:3px;">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </a>
            </div>
          </div>
        </div>

        <!-- 3. Garis Pembatas Halus -->
        <div class="result-card-divider"></div>

        <!-- 4. Baris Footer: Badges di Kiri & Waktu di Kanan -->
        <div class="result-card-footer">
          <div class="result-badges-left">
            <!-- Platform Badge -->
            <span class="result-platform-pill ${platform}">
              ${platformIcons[platform] || platformIcons.website}
              <span>${platformLabels[platform] || platform.toUpperCase()}</span>
            </span>

            <!-- Keyword Badge -->
            <span class="result-keyword-pill">
              keyword: ${escapeHtml(keywordText)}
            </span>

            <!-- Split Sentiment & Keyakinan Capsule (Teks Murni Tanpa Emoji) -->
            <span class="result-sentiment-split ${sentClass}" title="Tingkat Keyakinan: ${confidencePct}%">
              <span class="sentiment-split-left">
                <span>${sentLabel}</span>
              </span>
              <span class="sentiment-split-right">
                ${confidencePct}% Keyakinan
              </span>
            </span>

            ${hasSimilar ? `
              <button type="button" class="similar-sources-pill" onclick="toggleSimilarTray(${item.id})" title="Klik untuk melihat media lain yang juga memberitakan topik ini">
                ${uiIcon('news')} +${item.similar_sources_count} media lain
              </button>
            ` : ''}
          </div>

          <!-- Time & Actions Right Side -->
          <div class="result-time-right">
            <button type="button" class="btn-delete-item" data-id="${item.id}" data-title="${escapeHtml(cleanTitle)}" onclick="handleDeleteResultClick(this, event)" title="Hapus temuan postingan ini">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              <span>Hapus</span>
            </button>
            <span class="result-time-dot">•</span>
            <span>${timeText}</span>
          </div>
        </div>

        <!-- Tray: Berita Serupa jika ada -->
        ${hasSimilar ? `
          <div class="similar-sources-tray" id="tray-${item.id}" style="display: none; margin-top: 14px;">
            <div class="similar-sources-tray-title">
              <span>${uiIcon('news')} Sumber & Berita Serupa Terkait Isu Ini (${item.similar_sources_count} media):</span>
              <button type="button" class="btn btn-ghost btn-sm" onclick="toggleSimilarTray(${item.id})" style="padding: 2px 6px; font-size: 0.68rem; cursor:pointer;">Tutup</button>
            </div>
            ${item.similar_articles.map(sim => `
              <div class="similar-source-item">
                <span style="font-size: 0.75rem;">${platformIcons[sim.platform] || platformIcons.website}</span>
                <a href="${escapeHtml(sim.link)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(sim.title)}">
                  ${escapeHtml(sim.title)}
                </a>
                <span style="font-size: 0.68rem; color: var(--text-muted); flex-shrink: 0;">${escapeHtml(sim.display_link || sim.platform)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toLocaleString('id-ID');
}

function toggleSimilarTray(id) {
  const tray = document.getElementById(`tray-${id}`);
  if (!tray) return;
  const isHidden = tray.style.display === 'none' || !tray.style.display;
  tray.style.display = isHidden ? 'flex' : 'none';
}

// ─── Utilities ────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function formatTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString + (isoString.includes('Z') || isoString.includes('+') ? '' : 'Z'));
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);

    if (diffMs < 0) {
      // Future date (for next run)
      const futureMin = Math.abs(Math.floor(diffMs / 60000));
      const futureHour = Math.abs(Math.floor(diffMs / 3600000));
      if (futureMin < 60) return `dalam ${futureMin} menit`;
      return `dalam ${futureHour} jam`;
    }

    if (diffMin < 1) return 'Baru saja';
    if (diffMin < 60) return `${diffMin} menit lalu`;
    if (diffHour < 24) return `${diffHour} jam lalu`;

    return date.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}

// ─── Sidebar Collapse Toggle (YouTube Studio Style) ──
function updateHamburgerTooltip(isCollapsed) {
  const btn = document.getElementById('navHamburgerBtn');
  if (btn) {
    btn.setAttribute('title', isCollapsed ? 'Luaskan menu' : 'Ciutkan menu');
    btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  }
}

function toggleSidebarCollapse() {
  const isCollapsed = document.documentElement.classList.toggle('sidebar-collapsed');
  if (document.body) {
    document.body.classList.toggle('sidebar-collapsed', isCollapsed);
  }
  updateHamburgerTooltip(isCollapsed);
  try {
    localStorage.setItem('prisma_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    localStorage.setItem('syiar_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    localStorage.setItem('pijar_sidebar_collapsed', isCollapsed ? 'true' : 'false');
  } catch (e) {}
}

function initSidebarState() {
  try {
    const isCollapsed = (localStorage.getItem('prisma_sidebar_collapsed') || localStorage.getItem('syiar_sidebar_collapsed') || localStorage.getItem('pijar_sidebar_collapsed')) === 'true';
    if (isCollapsed) {
      document.documentElement.classList.add('sidebar-collapsed');
      if (document.body) document.body.classList.add('sidebar-collapsed');
    } else {
      document.documentElement.classList.remove('sidebar-collapsed');
      if (document.body) document.body.classList.remove('sidebar-collapsed');
    }
    updateHamburgerTooltip(isCollapsed);
  } catch (e) {}

}

// ─── Theme Management (Light / Dark Mode) ────────────
function getPreferredTheme() {
  try {
    const saved = localStorage.getItem('prisma_theme') || localStorage.getItem('syiar_theme') || localStorage.getItem('pijar_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (e) {}
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function applyTheme(theme, showFeedback = false) {
  const isDark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.toggle('dark-theme', isDark);
  if (document.body) {
    document.body.classList.toggle('dark-theme', isDark);
  }

  // Update all theme toggle buttons across the page
  const themeBtns = document.querySelectorAll('.nav-theme-btn, #themeToggleBtn');
  themeBtns.forEach(btn => {
    btn.setAttribute('title', isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap');
    btn.setAttribute('aria-label', isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap');
    btn.innerHTML = isDark
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon-sun">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon-moon">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>`;
  });

  // If a theme selector element exists (e.g. in settings page)
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    try {
      const rawSaved = localStorage.getItem('prisma_theme') || localStorage.getItem('syiar_theme') || localStorage.getItem('pijar_theme');
      themeSelect.value = rawSaved ? rawSaved : 'auto';
    } catch(e) {}
  }

  // Update settings theme choice cards if on settings page
  const cardLight = document.getElementById('themeCardLight');
  const cardDark = document.getElementById('themeCardDark');
  if (cardLight && cardDark) {
    if (isDark) {
      cardDark.classList.add('active');
      cardLight.classList.remove('active');
    } else {
      cardLight.classList.add('active');
      cardDark.classList.remove('active');
    }
  }

  if (typeof updateThemeUI === 'function') {
    try { updateThemeUI(theme); } catch (e) {}
  }

  // Update charts if dashboard charts are present
  if (typeof window.updateChartsForTheme === 'function') {
    window.updateChartsForTheme(isDark);
  }

  if (showFeedback && typeof showToast === 'function') {
    showToast(isDark ? 'Mode Gelap aktif' : 'Mode Terang aktif', 'info');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem('prisma_theme', next);
    localStorage.setItem('syiar_theme', next);
    localStorage.setItem('pijar_theme', next);
  } catch (e) {}
  applyTheme(next, true);
}

function setThemeMode(mode) {
  try {
    if (mode === 'auto') {
      localStorage.removeItem('prisma_theme');
      localStorage.removeItem('syiar_theme');
      localStorage.removeItem('pijar_theme');
      const systemTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      applyTheme(systemTheme, true);
    } else {
      localStorage.setItem('prisma_theme', mode);
      localStorage.setItem('syiar_theme', mode);
      localStorage.setItem('pijar_theme', mode);
      applyTheme(mode, true);
    }
  } catch (e) {}
}

function initTheme() {
  const theme = getPreferredTheme();
  applyTheme(theme, false);

  // Attach click handler to theme buttons
  document.querySelectorAll('.nav-theme-btn, #themeToggleBtn').forEach(btn => {
    btn.onclick = toggleTheme;
  });

  // Listen to OS theme changes if user hasn't set an explicit preference
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      try {
        if (!localStorage.getItem('prisma_theme') && !localStorage.getItem('syiar_theme') && !localStorage.getItem('pijar_theme')) {
          applyTheme(e.matches ? 'dark' : 'light', false);
        }
      } catch (err) {}
    });
  }
}

// ─── Global Avatar & Profile Synchronization ───
function applyGlobalAvatar(avatarUrl, username, institution) {
  const currentUsername = username || localStorage.getItem('prisma_user_name') || localStorage.getItem('syiar_user_name') || 'psdm.muhammadiyah';
  const currentInstitution = institution || localStorage.getItem('prisma_user_institution') || localStorage.getItem('syiar_user_institution') || 'Pusat Syiar Digital Muhammadiyah';
  const initial = (currentInstitution || currentUsername).charAt(0).toUpperCase();

  const sidebarWraps = document.querySelectorAll('.sidebar-avatar-wrap');
  sidebarWraps.forEach(wrap => {
    if (avatarUrl) {
      wrap.innerHTML = `<img src="${avatarUrl}" alt="Avatar ${currentUsername}" class="sidebar-avatar-img">`;
    } else {
      wrap.innerHTML = `<div class="sidebar-avatar-letter">${initial}</div>`;
    }
  });

  // Bagian atas: Nama Instansi
  const profileTitles = document.querySelectorAll('.sidebar-profile-title');
  profileTitles.forEach(t => {
    t.textContent = currentInstitution;
  });

  // Bagian bawah: Username
  const profileSubs = document.querySelectorAll('.sidebar-profile-sub');
  profileSubs.forEach(s => {
    s.textContent = currentUsername;
  });
}

async function syncGlobalUserProfile() {
  if (isPublicPage()) return;

  try {
    const cachedAvatar = localStorage.getItem('prisma_user_avatar') || localStorage.getItem('syiar_user_avatar');
    const cachedUser = localStorage.getItem('prisma_user_name') || localStorage.getItem('syiar_user_name') || 'psdm.muhammadiyah';
    const cachedInst = localStorage.getItem('prisma_user_institution') || localStorage.getItem('syiar_user_institution') || 'Pusat Syiar Digital Muhammadiyah';
    applyGlobalAvatar(cachedAvatar, cachedUser, cachedInst);
  } catch (e) {}

  try {
    const res = await api('/api/auth/me');
    if (res && res.authenticated && res.user) {
      const username = res.user.username || 'psdm.muhammadiyah';
      const institution = res.user.institution || 'Pusat Syiar Digital Muhammadiyah';
      const avatarUrl = res.user.avatar_url || null;
      try {
        localStorage.setItem('prisma_user_name', username);
        localStorage.setItem('prisma_user_institution', institution);
        localStorage.setItem('syiar_user_name', username);
        localStorage.setItem('syiar_user_institution', institution);
        if (avatarUrl) {
          localStorage.setItem('prisma_user_avatar', avatarUrl);
          localStorage.setItem('syiar_user_avatar', avatarUrl);
        } else {
          localStorage.removeItem('prisma_user_avatar');
          localStorage.removeItem('syiar_user_avatar');
        }
      } catch (err) {}
      applyGlobalAvatar(avatarUrl, username, institution);
    }
  } catch (e) {
    const cachedAvatar = localStorage.getItem('prisma_user_avatar') || localStorage.getItem('syiar_user_avatar');
    const cachedUser = localStorage.getItem('prisma_user_name') || localStorage.getItem('syiar_user_name') || 'psdm.muhammadiyah';
    const cachedInst = localStorage.getItem('prisma_user_institution') || localStorage.getItem('syiar_user_institution') || 'Pusat Syiar Digital Muhammadiyah';
    applyGlobalAvatar(cachedAvatar, cachedUser, cachedInst);
  }
}

window.applyGlobalAvatar = applyGlobalAvatar;
window.syncGlobalUserProfile = syncGlobalUserProfile;

function initApp() {
  initTheme();
  if (!isPublicPage()) {
    initSidebarState();
    syncGlobalUserProfile();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ─── Manual Finding Deletion & Confirmation Modal ─────
let pendingDeleteResultId = null;

function ensureDeleteResultModal() {
  if (document.getElementById('deleteResultModal')) return;
  const modalDiv = document.createElement('div');
  modalDiv.className = 'modal-overlay';
  modalDiv.id = 'deleteResultModal';
  modalDiv.style.display = 'none';
  modalDiv.innerHTML = `
    <div class="modal-content" style="max-width: 440px; text-align: center; padding: 28px 24px;">
      <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(239, 68, 68, 0.12); color: #ef4444; display: inline-flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </div>
      <h3 class="modal-title" style="font-size: 1.15rem; font-weight: 700; color: var(--text); margin-bottom: 8px;">
        Konfirmasi Hapus Temuan
      </h3>
      <p style="font-size: 0.84rem; color: var(--text-muted); line-height: 1.55; margin-bottom: 12px;">
        Apakah Anda yakin ingin menghapus temuan postingan ini?
      </p>
      <div id="deleteResultTargetTitle" style="font-size: 0.82rem; font-weight: 600; color: var(--text); background: var(--bg-secondary, rgba(0,0,0,0.03)); padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; border: 1px solid var(--border); text-align: left; max-height: 80px; overflow-y: auto; word-break: break-word;">
      </div>
      <p style="font-size: 0.78rem; color: #ef4444; font-weight: 500; margin-bottom: 22px;">
        ⚠️ Perhatian: Data yang sudah dihapus tidak dapat dikembalikan.
      </p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button type="button" class="btn btn-outline" style="min-width: 110px;" onclick="closeDeleteResultModal()">
          Batal
        </button>
        <button type="button" class="btn btn-danger" id="btnConfirmDeleteResult" style="min-width: 130px; background: #ef4444; border-color: #ef4444; color: #ffffff; display: inline-flex; align-items: center; justify-content: center; gap: 6px;" onclick="executeDeleteResult()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Ya, Hapus
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modalDiv);

  modalDiv.addEventListener('click', (e) => {
    if (e.target === modalDiv) {
      closeDeleteResultModal();
    }
  });
}

function handleDeleteResultClick(btn, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const id = btn.getAttribute('data-id');
  const title = btn.getAttribute('data-title');
  confirmDeleteResult(id, title);
}

function confirmDeleteResult(id, title) {
  pendingDeleteResultId = id;
  ensureDeleteResultModal();
  const titleEl = document.getElementById('deleteResultTargetTitle');
  if (titleEl) {
    titleEl.textContent = title || 'Temuan terpilih';
  }
  const modal = document.getElementById('deleteResultModal');
  if (modal) modal.style.display = 'flex';
}

function closeDeleteResultModal() {
  pendingDeleteResultId = null;
  const modal = document.getElementById('deleteResultModal');
  if (modal) modal.style.display = 'none';
}

async function executeDeleteResult() {
  if (!pendingDeleteResultId) return;
  const id = pendingDeleteResultId;
  const btn = document.getElementById('btnConfirmDeleteResult');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Menghapus...';
  }

  try {
    const res = await api(`/api/results/${id}`, 'DELETE');
    closeDeleteResultModal();
    showToast(res.message || 'Temuan berhasil dihapus', 'success');

    // Animasi fade out kartu yang dihapus
    const card = document.getElementById(`card-${id}`);
    if (card) {
      card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-8px) scale(0.98)';
      setTimeout(() => {
        card.remove();
        const container = document.getElementById('resultsList');
        if (container) {
          const remaining = container.querySelectorAll('.result-card').length;
          const countDisplay = document.getElementById('resultCountDisplay');
          if (countDisplay) countDisplay.textContent = remaining;
          if (remaining === 0) {
            container.innerHTML = `
              <div class="empty-state fade-in">
                <div class="empty-state-icon"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"></path><rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M8 12h8m-8 4h8"></path></svg></div>
                <div class="empty-state-title">Tidak ada aktivitas</div>
                <div class="empty-state-desc">Belum ada aktivitas untuk filter yang dipilih.</div>
              </div>
            `;
          }
        }
        if (typeof loadBadges === 'function') {
          const filterMonitor = document.getElementById('filterMonitor');
          loadBadges(filterMonitor ? filterMonitor.value : null);
        }
      }, 250);
    }
  } catch (err) {
    showToast(err.message || 'Gagal menghapus temuan', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

window.handleDeleteResultClick = handleDeleteResultClick;
window.confirmDeleteResult = confirmDeleteResult;
window.closeDeleteResultModal = closeDeleteResultModal;
window.executeDeleteResult = executeDeleteResult;

// ─── Review Mode (Tinjau Temuan) & Batch Deletion Logic ─
let isReviewModeActive = false;
let pendingBatchDeleteIds = [];

function toggleReviewMode(forceState = null) {
  isReviewModeActive = forceState !== null ? Boolean(forceState) : !isReviewModeActive;
  
  const resultsList = document.getElementById('resultsList');
  const reviewBar = document.getElementById('reviewActionBar');
  const toggleBtn = document.getElementById('btnToggleReviewMode');

  if (isReviewModeActive) {
    if (resultsList) resultsList.classList.add('review-mode-active');
    if (reviewBar) reviewBar.style.display = 'flex';
    if (toggleBtn) {
      toggleBtn.classList.add('btn-review-active');
      toggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Mode Tinjau Aktif</span>
      `;
    }
  } else {
    if (resultsList) resultsList.classList.remove('review-mode-active');
    if (reviewBar) reviewBar.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.classList.remove('btn-review-active');
      toggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
          <polyline points="9 11 12 14 22 4"></polyline>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
        <span>Tinjau Temuan</span>
      `;
    }
    clearResultCheckboxes();
  }
  updateSelectedCountUI();
}

function clearResultCheckboxes() {
  const checkboxes = document.querySelectorAll('.result-item-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = false;
    const card = cb.closest('.result-card');
    if (card) card.classList.remove('is-selected');
  });
  const selectAllCb = document.getElementById('selectAllResults');
  if (selectAllCb) selectAllCb.checked = false;
  updateSelectedCountUI();
}

function onResultCheckboxChange(checkbox, event) {
  if (event) event.stopPropagation();
  const card = checkbox.closest('.result-card');
  if (card) {
    if (checkbox.checked) {
      card.classList.add('is-selected');
    } else {
      card.classList.remove('is-selected');
    }
  }
  updateSelectedCountUI();
}

function onResultCardClick(event, id) {
  if (!isReviewModeActive) return;
  if (event.target.closest('a, button, input')) return;
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  const checkbox = card.querySelector('.result-item-checkbox');
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    onResultCheckboxChange(checkbox);
  }
}

function toggleSelectAllResults(checked) {
  const checkboxes = document.querySelectorAll('.result-item-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = checked;
    const card = cb.closest('.result-card');
    if (card) {
      if (checked) card.classList.add('is-selected');
      else card.classList.remove('is-selected');
    }
  });
  updateSelectedCountUI();
}

function getSelectedResults() {
  const checkboxes = document.querySelectorAll('.result-item-checkbox:checked');
  const items = [];
  checkboxes.forEach(cb => {
    items.push({
      id: cb.getAttribute('data-id'),
      title: cb.getAttribute('data-title') || 'Temuan'
    });
  });
  return items;
}

function updateSelectedCountUI() {
  const allCheckboxes = document.querySelectorAll('.result-item-checkbox');
  const checkedCheckboxes = document.querySelectorAll('.result-item-checkbox:checked');
  const count = checkedCheckboxes.length;
  const total = allCheckboxes.length;

  const totalVisibleEl = document.getElementById('totalVisibleCount');
  if (totalVisibleEl) totalVisibleEl.textContent = total;

  const countTextEl = document.getElementById('selectedCountText');
  if (countTextEl) countTextEl.textContent = `${count} dipilih`;

  const btnDelete = document.getElementById('btnDeleteSelected');
  const btnDeleteLabel = document.getElementById('btnDeleteSelectedLabel');
  if (btnDelete) {
    btnDelete.disabled = count === 0;
  }
  if (btnDeleteLabel) {
    btnDeleteLabel.textContent = count > 0 ? `Hapus (${count}) Terpilih` : 'Hapus Terpilih';
  }

  const selectAllCb = document.getElementById('selectAllResults');
  if (selectAllCb) {
    selectAllCb.checked = total > 0 && count === total;
    selectAllCb.indeterminate = count > 0 && count < total;
  }
}

function ensureBatchDeleteModal() {
  if (document.getElementById('batchDeleteModal')) return;
  const modalDiv = document.createElement('div');
  modalDiv.className = 'modal-overlay';
  modalDiv.id = 'batchDeleteModal';
  modalDiv.style.display = 'none';
  modalDiv.innerHTML = `
    <div class="modal-content" style="max-width: 480px; text-align: center; padding: 28px 24px;">
      <div style="width: 58px; height: 58px; border-radius: 50%; background: rgba(239, 68, 68, 0.12); color: #ef4444; display: inline-flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </div>
      <h3 class="modal-title" id="batchDeleteModalTitle" style="font-size: 1.15rem; font-weight: 700; color: var(--text); margin-bottom: 8px;">
        Konfirmasi Hapus Temuan Terpilih
      </h3>
      <p id="batchDeleteModalDesc" style="font-size: 0.84rem; color: var(--text-muted); line-height: 1.55; margin-bottom: 12px;">
        Apakah Anda yakin ingin menghapus data temuan yang telah dipilih?
      </p>
      <div id="batchDeleteListPreview" style="font-size: 0.80rem; color: var(--text); background: var(--bg-secondary, rgba(0,0,0,0.03)); padding: 12px 14px; border-radius: 8px; margin-bottom: 14px; border: 1px solid var(--border); text-align: left; max-height: 120px; overflow-y: auto;">
      </div>
      <p style="font-size: 0.80rem; color: #ef4444; font-weight: 600; margin-bottom: 22px;">
        ⚠️ Perhatian: Data yang sudah dihapus tidak dapat dikembalikan.
      </p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button type="button" class="btn btn-outline" style="min-width: 110px;" onclick="closeBatchDeleteModal()">
          Batal
        </button>
        <button type="button" class="btn btn-danger" id="btnConfirmBatchDelete" style="min-width: 150px; background: #ef4444; border-color: #ef4444; color: #ffffff; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-weight:600;" onclick="executeBatchDelete()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          <span id="btnConfirmBatchDeleteText">Ya, Hapus Terpilih</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modalDiv);

  modalDiv.addEventListener('click', (e) => {
    if (e.target === modalDiv) {
      closeBatchDeleteModal();
    }
  });
}

function confirmDeleteSelected() {
  const selected = getSelectedResults();
  if (selected.length === 0) {
    showToast('Pilih minimal satu temuan untuk dihapus', 'info');
    return;
  }
  pendingBatchDeleteIds = selected.map(s => s.id);
  ensureBatchDeleteModal();

  const titleEl = document.getElementById('batchDeleteModalTitle');
  const descEl = document.getElementById('batchDeleteModalDesc');
  const previewEl = document.getElementById('batchDeleteListPreview');
  const btnText = document.getElementById('btnConfirmBatchDeleteText');

  if (titleEl) titleEl.textContent = `Konfirmasi Hapus ${selected.length} Temuan`;
  if (descEl) descEl.innerHTML = `Apakah Anda yakin ingin menghapus <strong>${selected.length} temuan</strong> yang telah dicentang secara permanen?`;
  if (btnText) btnText.textContent = `Ya, Hapus (${selected.length}) Temuan`;

  if (previewEl) {
    const previewList = selected.slice(0, 5).map(s => `<li style="margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">• ${escapeHtml(s.title)}</li>`).join('');
    const moreCount = selected.length > 5 ? `<li style="color:var(--text-muted); font-style:italic; margin-top:4px;">...dan ${selected.length - 5} temuan lainnya</li>` : '';
    previewEl.innerHTML = `<ul style="list-style:none; padding:0; margin:0;">${previewList}${moreCount}</ul>`;
  }

  const modal = document.getElementById('batchDeleteModal');
  if (modal) modal.style.display = 'flex';
}

function closeBatchDeleteModal() {
  pendingBatchDeleteIds = [];
  const modal = document.getElementById('batchDeleteModal');
  if (modal) modal.style.display = 'none';
}

async function executeBatchDelete() {
  if (!pendingBatchDeleteIds || pendingBatchDeleteIds.length === 0) return;
  const idsToDelete = [...pendingBatchDeleteIds];
  const btn = document.getElementById('btnConfirmBatchDelete');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Menghapus...';
  }

  try {
    const res = await api('/api/results/batch-delete', 'POST', { ids: idsToDelete });
    closeBatchDeleteModal();
    showToast(res.message || `${idsToDelete.length} temuan berhasil dihapus`, 'success');

    // Animasi fade out untuk semua kartu yang dihapus
    idsToDelete.forEach(id => {
      const card = document.getElementById(`card-${id}`);
      if (card) {
        card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        card.style.opacity = '0';
        card.style.transform = 'translateY(-8px) scale(0.98)';
      }
    });

    setTimeout(() => {
      idsToDelete.forEach(id => {
        const card = document.getElementById(`card-${id}`);
        if (card) card.remove();
      });

      const container = document.getElementById('resultsList');
      if (container) {
        const remaining = container.querySelectorAll('.result-card').length;
        const countDisplay = document.getElementById('resultCountDisplay');
        if (countDisplay) countDisplay.textContent = remaining;
        if (remaining === 0) {
          container.innerHTML = `
            <div class="empty-state fade-in">
              <div class="empty-state-icon"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"></path><rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M8 12h8m-8 4h8"></path></svg></div>
              <div class="empty-state-title">Tidak ada aktivitas</div>
              <div class="empty-state-desc">Belum ada aktivitas untuk filter yang dipilih.</div>
            </div>
          `;
        }
      }

      // Update badge counts & selection UI
      updateSelectedCountUI();
      if (typeof loadBadges === 'function') {
        const filterMonitor = document.getElementById('filterMonitor');
        loadBadges(filterMonitor ? filterMonitor.value : null);
      }
    }, 250);

  } catch (err) {
    showToast(err.message || 'Gagal menghapus temuan terpilih', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

window.isReviewModeActive = isReviewModeActive;
window.toggleReviewMode = toggleReviewMode;
window.clearResultCheckboxes = clearResultCheckboxes;
window.onResultCheckboxChange = onResultCheckboxChange;
window.onResultCardClick = onResultCardClick;
window.toggleSelectAllResults = toggleSelectAllResults;
window.getSelectedResults = getSelectedResults;
window.updateSelectedCountUI = updateSelectedCountUI;
window.ensureBatchDeleteModal = ensureBatchDeleteModal;
window.confirmDeleteSelected = confirmDeleteSelected;
window.closeBatchDeleteModal = closeBatchDeleteModal;
window.executeBatchDelete = executeBatchDelete;



