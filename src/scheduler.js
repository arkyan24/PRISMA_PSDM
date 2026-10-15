const { runFullScan, runMonitorScan } = require('./searcher');
const db = require('./database');

// Per-monitor timers
const monitorTimers = {};  // { monitorId: timerRef }
let isRunning = false;
let scanInProgress = false;
let lastRunTime = null;
let nextRunTime = null;

/**
 * Start all active monitors
 */
function start() {
  if (isRunning) {
    console.log('[Scheduler] Already running');
    return { success: false, message: 'Scheduler sudah berjalan' };
  }

  isRunning = true;
  const monitors = db.getActiveMonitors();

  if (monitors.length === 0) {
    console.log('[Scheduler] No active monitors to start');
    return { success: true, message: 'Monitoring dimulai (belum ada monitor aktif)' };
  }

  for (const monitor of monitors) {
    startMonitorTimer(monitor);
  }

  console.log(`[Scheduler] Started — ${monitors.length} monitor(s) active`);
  return {
    success: true,
    message: `Monitoring dimulai — ${monitors.length} monitor aktif`,
    activeMonitors: monitors.length
  };
}

/**
 * Stop all monitors
 */
function stop() {
  for (const id of Object.keys(monitorTimers)) {
    clearInterval(monitorTimers[id]);
    delete monitorTimers[id];
  }

  isRunning = false;
  nextRunTime = null;

  console.log('[Scheduler] Stopped');
  return { success: true, message: 'Monitoring dihentikan' };
}

/**
 * Start a timer for a specific monitor
 */
function startMonitorTimer(monitor) {
  // Clear any existing timer
  if (monitorTimers[monitor.id]) {
    clearInterval(monitorTimers[monitor.id]);
  }

  const intervalMs = (monitor.polling_interval || 3) * 60 * 60 * 1000;

  // Set next poll time
  const now = new Date();
  const nextPoll = new Date(now.getTime() + intervalMs);
  db.updateMonitorPollTime(monitor.id, monitor.last_polled_at, nextPoll.toISOString());

  // Update global nextRunTime
  if (!nextRunTime || nextPoll < new Date(nextRunTime)) {
    nextRunTime = nextPoll.toISOString();
  }

  monitorTimers[monitor.id] = setInterval(async () => {
    await executeMonitorScan(monitor.id);
  }, intervalMs);

  console.log(`[Scheduler] Timer set for monitor "${monitor.name}" — every ${monitor.polling_interval}h`);
}

/**
 * Stop a specific monitor's timer
 */
function stopMonitorTimer(monitorId) {
  if (monitorTimers[monitorId]) {
    clearInterval(monitorTimers[monitorId]);
    delete monitorTimers[monitorId];
  }
}

/**
 * Run a scan for a specific monitor
 */
async function executeMonitorScan(monitorId) {
  const monitor = db.getMonitor(monitorId);
  if (!monitor || monitor.status !== 'active') {
    stopMonitorTimer(monitorId);
    return { success: false, message: 'Monitor tidak aktif atau tidak ditemukan' };
  }

  scanInProgress = true;
  lastRunTime = new Date().toISOString();

  try {
    console.log(`[Scheduler] Executing scan for monitor "${monitor.name}" (keyword: "${monitor.keyword}")...`);
    const result = await runMonitorScan(monitor);

    // Update poll times
    const now = new Date();
    const intervalMs = (monitor.polling_interval || 3) * 60 * 60 * 1000;
    const nextPoll = new Date(now.getTime() + intervalMs);
    db.updateMonitorPollTime(monitor.id, now.toISOString(), nextPoll.toISOString());

    // Update global nextRunTime
    recalculateNextRunTime();

    scanInProgress = false;
    return {
      success: true,
      message: `Scan selesai untuk "${monitor.name}". ${result.totalNewResults} hasil baru.`,
      ...result
    };
  } catch (error) {
    scanInProgress = false;
    console.error(`[Scheduler] Scan failed for monitor "${monitor.name}": ${error.message}`);
    return {
      success: false,
      message: error.message,
      error: error.message
    };
  }
}

/**
 * Run scan for a specific monitor immediately (manual trigger)
 */
async function runMonitorNow(monitorId) {
  return await executeMonitorScan(monitorId);
}

/**
 * Run a scan immediately for ALL active monitors (manual trigger / legacy)
 */
async function runNow() {
  if (scanInProgress) {
    return { success: false, message: 'Scan sedang berjalan' };
  }

  scanInProgress = true;
  lastRunTime = new Date().toISOString();

  try {
    console.log('[Scheduler] Executing full scan for all active monitors...');
    const result = await runFullScan();

    // Update poll times for all active monitors
    const now = new Date();
    const monitors = db.getActiveMonitors();
    for (const monitor of monitors) {
      const intervalMs = (monitor.polling_interval || 3) * 60 * 60 * 1000;
      const nextPoll = new Date(now.getTime() + intervalMs);
      db.updateMonitorPollTime(monitor.id, now.toISOString(), nextPoll.toISOString());
    }

    recalculateNextRunTime();
    scanInProgress = false;

    return {
      success: true,
      message: `Scan selesai. ${result.totalNewResults} hasil baru ditemukan.`,
      ...result
    };
  } catch (error) {
    scanInProgress = false;
    console.error(`[Scheduler] Full scan failed: ${error.message}`);
    return {
      success: false,
      message: error.message,
      error: error.message
    };
  }
}

/**
 * Recalculate global next run time from all active monitors
 */
function recalculateNextRunTime() {
  const monitors = db.getActiveMonitors();
  let earliest = null;
  for (const m of monitors) {
    if (m.next_poll_at) {
      const t = new Date(m.next_poll_at);
      if (!earliest || t < earliest) {
        earliest = t;
      }
    }
  }
  nextRunTime = earliest ? earliest.toISOString() : null;
}

/**
 * Get current scheduler status
 */
function getStatus() {
  const lastScan = db.getLastScanLog();

  return {
    isRunning,
    scanInProgress,
    lastRunTime,
    nextRunTime,
    activeMonitors: Object.keys(monitorTimers).length,
    lastScan: lastScan || null
  };
}

/**
 * Restart a monitor's timer (e.g. after interval change)
 */
function restartMonitorTimer(monitorId) {
  const monitor = db.getMonitor(monitorId);
  if (!monitor) return;

  stopMonitorTimer(monitorId);

  if (monitor.status === 'active' && isRunning) {
    startMonitorTimer(monitor);
  }
}

/**
 * Update interval (legacy compat — now per-monitor)
 */
function updateInterval(hours) {
  // No-op for global interval — intervals are now per-monitor
  return { success: true, message: `Interval sekarang dikonfigurasi per-monitor` };
}

module.exports = {
  start,
  stop,
  runNow,
  runMonitorNow,
  executeMonitorScan,
  getStatus,
  updateInterval,
  startMonitorTimer,
  stopMonitorTimer,
  restartMonitorTimer
};
